/** Read models for the owner console. */
import { todayIso } from "../dates";
import { type DiagnosisRow, type InvoiceRow, repo } from "../db";
import { ACTION_META, type ActionType, isOpenStatus, type StuckReason } from "../domain";
import { getGateway, readConfig, resolutionUrl } from "../config";
import { type ActionView, viewAction } from "./actions";
import { clientHistory, daysOverdue, promiseState, reminderStats } from "./invoices";
import { type Risk, scoreRisk } from "../risk";
import { addDays } from "../dates";
import { planProgress } from "./payments";
import { LOOP_STAGES, type LoopStage } from "./loop-stages";

export type BoardRow = {
  id: string;
  number: string | null;
  client: string;
  contact: string | null;
  email: string | null;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  dueMinor: number;
  dueDate: string | null;
  daysOverdue: number;
  status: string;
  open: boolean;
  reason: StuckReason | null;
  confidence: number | null;
  summary: string | null;
  source: "ai" | "rules" | null;
  /** How the AI took part in the latest diagnosis (see AiStatus); null for older rows or no diagnosis. */
  aiStatus: DiagnosisRow["ai_status"];
  /** Provider configured for the latest diagnosis (gemini, anthropic) or null. */
  aiProvider: string | null;
  next: { id: string; type: ActionType; label: string; status: string; decision: string } | null;
  pendingCount: number;
  plan: { paidCount: number; count: number; nextDue: string | null } | null;
  disputed: boolean;
  remindersSent: number;
  lastActivity: string | null;
  risk: Risk;
  /** Where the invoice is in Unstuck's resolution loop (null: settled without Unstuck acting). */
  stage: LoopStage | null;
  /** A promise to pay passed without payment, or a plan installment is overdue. */
  missed: boolean;
  /** Money PayPal recorded after Unstuck first acted on this invoice (timing, not causation). */
  collectedAfterActMinor: number;
};

export { LOOP_STAGES, type LoopStage };

/**
 * Place an invoice in exactly one stage of the resolution loop, from recorded facts only:
 * diagnosis rows, action statuses, plans, promises and PayPal's payment status.
 */
export function loopStage(f: { open: boolean; diagnosed: boolean; pending: number; acted: boolean; agreed: boolean; collectedAfterAct: number }): LoopStage | null {
  if (!f.open) return f.acted && f.collectedAfterAct > 0 ? "paid" : null;
  if (f.pending > 0) return "approval";
  if (f.agreed) return "agreed";
  if (f.acted) return "acted";
  return f.diagnosed ? "diagnosed" : "detected";
}

function collectedAfterAct(inv: InvoiceRow, executedByUnstuck: { paid_minor_before: number | null }[]) {
  if (!executedByUnstuck.length) return 0;
  const baseline = Math.min(...executedByUnstuck.map((a) => a.paid_minor_before ?? inv.paid_minor));
  return Math.max(0, inv.paid_minor - baseline);
}

function parseDiagnosis(d: DiagnosisRow | undefined) {
  if (!d) return null;
  return {
    id: d.id,
    reason: d.reason,
    confidence: d.confidence,
    summary: d.summary,
    evidence: JSON.parse(d.evidence_json) as { source: string; quote: string }[],
    extracted: JSON.parse(d.extracted_json) as Record<string, string | null>,
    recommendation: JSON.parse(d.recommendation_json) as {
      action: ActionType;
      rationale: string;
      message: { subject: string; body: string } | null;
      tone: string;
      inference?: string;
      expected_outcome?: string;
      risks?: string[];
      alternatives?: { action: ActionType; why: string }[];
    },
    source: d.source,
    model: d.model,
    ai_status: d.ai_status,
    ai_detail: d.ai_detail,
    ai_provider: d.ai_provider,
    ai_attempted_at: d.ai_attempted_at,
    created_at: d.created_at,
  };
}

function boardRow(inv: InvoiceRow, today: string): BoardRow {
  const d = repo.latestDiagnosis(inv.id);
  const actions = repo.listActions({ invoiceId: inv.id });
  const latestForDiag = actions.filter((a) => (d ? a.diagnosis_id === d.id : true) && a.status !== "rejected");
  const primary = latestForDiag.find((a) => a.type !== "pause_reminders") ?? latestForDiag[0] ?? null;
  const plan = repo.latestPlan(inv.id);
  const prog = plan ? planProgress(plan, inv.paid_minor, today) : null;
  const ev = repo.listEvents({ invoiceId: inv.id, limit: 1 })[0];
  const open = isOpenStatus(inv.status);
  const overdue = open ? daysOverdue(inv, today) : 0;
  const reminders = reminderStats(inv.id, today).sent;
  const promise = promiseState(inv.id, today);
  const executed = actions.filter((a) => a.status === "executed" && a.type !== "wait");
  const byUnstuck = executed.filter((a) => a.origin !== "owner" && a.origin !== "system");
  const collected = collectedAfterAct(inv, byUnstuck);
  const planActive = !!prog && plan?.status === "active";
  const planBehind = planActive && prog!.rows.some((r) => r.state === "overdue");
  const missed = open && (promise.promise_missed || planBehind);
  const risk = scoreRisk({
    open,
    daysOverdue: overdue,
    dueMinor: inv.due_minor,
    reason: d?.reason ?? null,
    remindersSent: reminders,
    hasClientReply: repo.listMessages(inv.id).some((m) => m.author === "client"),
    history: clientHistory(inv),
    plan: prog && plan?.status === "active" ? { onTrack: !prog.rows.some((r) => r.state === "overdue") } : null,
    promiseUntil: promise.promised_by,
    today,
  });
  return {
    id: inv.id,
    number: inv.number,
    client: inv.recipient_business ?? inv.recipient_name ?? inv.recipient_email ?? "Unknown client",
    contact: inv.recipient_name,
    email: inv.recipient_email,
    currency: inv.currency,
    totalMinor: inv.total_minor,
    paidMinor: inv.paid_minor,
    dueMinor: inv.due_minor,
    dueDate: inv.due_date,
    daysOverdue: isOpenStatus(inv.status) ? daysOverdue(inv, today) : 0,
    status: inv.status,
    open: isOpenStatus(inv.status),
    reason: d?.reason ?? null,
    confidence: d?.confidence ?? null,
    summary: d?.summary ?? null,
    source: d?.source ?? null,
    aiStatus: d?.ai_status ?? null,
    aiProvider: d?.ai_provider ?? null,
    next: primary ? { id: primary.id, type: primary.type, label: ACTION_META[primary.type].label, status: primary.status, decision: primary.decision } : null,
    pendingCount: actions.filter((a) => a.status === "proposed").length,
    plan: prog ? { paidCount: prog.rows.filter((r) => r.state === "paid").length, count: prog.rows.length, nextDue: prog.next?.due_date ?? null } : null,
    disputed: !!inv.disputed,
    remindersSent: reminders,
    lastActivity: ev?.at ?? null,
    risk,
    stage: loopStage({ open, diagnosed: !!d, pending: actions.filter((a) => a.status === "proposed").length, acted: executed.length > 0, agreed: planActive || (!!promise.promised_by && !promise.promise_missed), collectedAfterAct: collected }),
    missed,
    collectedAfterActMinor: collected,
  };
}

/** The resolution loop for the dashboard: one entry per stage, primary currency only. */
export function resolutionLoop(rows: BoardRow[]) {
  return LOOP_STAGES.map((stage) => {
    // Missed promises first, then the most money: what the owner should look at.
    const items = rows.filter((r) => r.stage === stage).sort((a, b) => Number(b.missed) - Number(a.missed) || b.dueMinor - a.dueMinor);
    return {
      stage,
      count: items.length,
      amountMinor: items.reduce((s, r) => s + (stage === "paid" ? r.collectedAfterActMinor : r.dueMinor), 0),
      missed: items.filter((r) => r.missed).length,
      items: items.map((r) => ({ id: r.id, client: r.client, missed: r.missed })),
    };
  });
}

/** The currency most open invoices are in; money figures never mix currencies. */
export function primaryCurrency(rows: { currency: string; open: boolean }[]) {
  const counts = new Map<string, number>();
  for (const r of rows.filter((x) => x.open)) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? rows[0]?.currency ?? "USD";
}

export function modeInfo() {
  const cfg = readConfig();
  let paypal: "sandbox" | "simulation" | "misconfigured" = "simulation";
  let paypalError: string | null = null;
  try {
    paypal = getGateway().mode === "live" ? "sandbox" : "simulation";
  } catch (e) {
    paypal = "misconfigured";
    paypalError = (e as Error).message;
  }
  // "ai" is the configured provider id (gemini, anthropic) or "rules"; never a secret, only names and the key variable.
  return {
    paypal,
    paypalError,
    webhookConfigured: cfg.paypal.webhookIdConfigured,
    ai: (cfg.ai.configured ? cfg.ai.provider : "rules") as "gemini" | "anthropic" | "rules",
    aiLabel: cfg.ai.configured ? cfg.ai.providerLabel : null,
    aiProvider: cfg.ai.provider,
    aiKeyVariable: cfg.ai.keyVariable,
    aiUnavailableReason: cfg.ai.unavailableReason,
    model: cfg.ai.configured ? cfg.ai.model : null,
  };
}

export function boardRows(today = todayIso()) {
  return repo.listInvoices().map((i) => boardRow(i, today));
}

/**
 * 30-day cash outlook. No probabilities are invented: amounts are grouped by the *basis* for expecting them
 * (an agreed plan, a client promise, a payment the client says is in transit, or simply a due date),
 * with high-risk balances shown separately.
 */
export function cashOutlook(rows: BoardRow[], today: string) {
  const horizon = addDays(today, 30);
  const weeks = [0, 1, 2, 3].map((w) => ({ start: addDays(today, w * 7), committedMinor: 0, dueMinor: 0 }));
  const weekOf = (d: string) => (d < today ? weeks[0]! : weeks.find((w, i) => d >= w.start && (i === 3 || d < weeks[i + 1]!.start)) ?? null);
  const out = { committedMinor: 0, inTransitMinor: 0, dueMinor: 0, atRiskMinor: 0, weeks };
  for (const r of rows.filter((x) => x.open)) {
    const plan = repo.activePlan(r.id);
    if (plan) {
      const inv = repo.getInvoice(r.id)!;
      for (const ins of planProgress(plan, inv.paid_minor, today).rows) {
        const left = ins.amount_minor - ins.paid_minor;
        if (left <= 0 || ins.due_date > horizon) continue;
        out.committedMinor += left;
        const w = weekOf(ins.due_date);
        if (w) w.committedMinor += left;
      }
      continue;
    }
    if (r.risk.band === "high") {
      out.atRiskMinor += r.dueMinor;
      continue;
    }
    const promise = promiseState(r.id, today);
    if (promise.promised_by && !promise.promise_missed && promise.promised_by <= horizon) {
      out.committedMinor += r.dueMinor;
      const w = weekOf(promise.promised_by);
      if (w) w.committedMinor += r.dueMinor;
    } else if (r.reason === "already_paid") out.inTransitMinor += r.dueMinor;
    else if (r.dueDate && r.dueDate <= horizon) {
      out.dueMinor += r.dueMinor;
      const w = weekOf(r.dueDate);
      if (w) w.dueMinor += r.dueMinor;
    }
  }
  return out;
}

export function boardSnapshot() {
  const today = todayIso();
  const invoices = repo.listInvoices();
  const rows = invoices.map((i) => boardRow(i, today));
  // Money figures are never added across currencies: KPIs use the currency most open invoices are in,
  // and the others are counted so the UI can say they were left out.
  const currency = primaryCurrency(rows);
  const allOpen = rows.filter((r) => r.open);
  const open = allOpen.filter((r) => r.currency === currency);
  const riskOf = new Map(rows.map((r) => [r.id, r.risk.score]));
  const pending = repo
    .listActions({ status: "proposed" })
    .map(viewAction)
    .sort((a, b) => (riskOf.get(b.invoice_id) ?? 0) - (riskOf.get(a.invoice_id) ?? 0));
  const overdue = open.filter((r) => r.daysOverdue > 0);
  const run = repo.latestRun();
  const byReason: Record<string, { count: number; dueMinor: number }> = {};
  for (const r of open) {
    const k = r.reason ?? "undiagnosed";
    byReason[k] = { count: (byReason[k]?.count ?? 0) + 1, dueMinor: (byReason[k]?.dueMinor ?? 0) + r.dueMinor };
  }
  return {
    today,
    mode: modeInfo(),
    policy: repo.getPolicy(),
    kpis: {
      currency,
      excludedOtherCurrency: allOpen.length - open.length,
      outstandingMinor: open.reduce((s, r) => s + r.dueMinor, 0),
      openCount: open.length,
      overdueMinor: open.filter((r) => r.daysOverdue > 0).reduce((s, r) => s + r.dueMinor, 0),
      overdueCount: open.filter((r) => r.daysOverdue > 0).length,
      pendingApprovals: pending.length,
      cashUnstuckMinor: rows.filter((r) => r.currency === currency).reduce((sum, r) => sum + r.collectedAfterActMinor, 0),
      missedCount: open.filter((r) => r.missed).length,
      avgDaysOverdue: overdue.length ? Math.round(overdue.reduce((s, r) => s + r.daysOverdue, 0) / overdue.length) : 0,
      atRiskCount: open.filter((r) => r.risk.band === "high").length,
      byReason,
    },
    outlook: cashOutlook(rows.filter((r) => r.currency === currency), today),
    loop: resolutionLoop(rows.filter((r) => r.currency === currency)),
    lastRun: run ? { id: run.id, status: run.status, started_at: run.started_at, finished_at: run.finished_at, summary: run.summary_json ? JSON.parse(run.summary_json) : null } : null,
    rows,
    pending,
    recent: repo
      .listEvents({ limit: 60 })
      .filter((e) => ["action_executed", "payment_received", "offer_accepted", "plan_completed", "plan_advanced", "payer_escalation", "promise_to_pay", "webhook"].includes(e.kind))
      .slice(0, 5)
      .map((e) => ({ id: e.id, at: e.at, actor: e.actor, summary: e.summary, client: e.invoice_id ? invoices.find((i) => i.id === e.invoice_id)?.recipient_business ?? null : null, invoiceId: e.invoice_id })),
    seeded: !!repo.getSetting("demo_seeded_at"),
  };
}

export function invoiceDetail(id: string) {
  const inv = repo.getInvoice(id);
  if (!inv) return null;
  const today = todayIso();
  const plan = repo.latestPlan(id);
  const actions: ActionView[] = repo.listActions({ invoiceId: id }).map(viewAction);
  return {
    row: boardRow(inv, today),
    invoice: { ...inv, raw: JSON.parse(inv.raw_json), raw_json: undefined },
    diagnosis: parseDiagnosis(repo.latestDiagnosis(id)),
    messages: repo.listMessages(id),
    actions,
    events: repo.listEvents({ invoiceId: id, limit: 100 }),
    plan: plan ? { ...plan, progress: planProgress(plan, inv.paid_minor, today) } : null,
    offers: repo.listOffers(id).map((o) => ({ ...o, installments: JSON.parse(o.installments_json) })),
    resolutionUrl: resolutionUrl(inv.payer_token),
    payUrl: inv.recipient_view_url,
  };
}
