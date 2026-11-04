/** Read models for the owner console. */
import { todayIso } from "../dates";
import { type DiagnosisRow, type InvoiceRow, repo } from "../db";
import { ACTION_META, type ActionType, isOpenStatus, type StuckReason } from "../domain";
import { getGateway, readConfig, resolutionUrl } from "../config";
import { type ActionView, viewAction } from "./actions";
import { daysOverdue, reminderStats } from "./invoices";
import { planProgress } from "./payments";

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
  next: { id: string; type: ActionType; label: string; status: string; decision: string } | null;
  pendingCount: number;
  plan: { paidCount: number; count: number; nextDue: string | null } | null;
  disputed: boolean;
  remindersSent: number;
  lastActivity: string | null;
};

function parseDiagnosis(d: DiagnosisRow | undefined) {
  if (!d) return null;
  return {
    id: d.id,
    reason: d.reason,
    confidence: d.confidence,
    summary: d.summary,
    evidence: JSON.parse(d.evidence_json) as { source: string; quote: string }[],
    extracted: JSON.parse(d.extracted_json) as Record<string, string | null>,
    recommendation: JSON.parse(d.recommendation_json) as { action: ActionType; rationale: string; message: { subject: string; body: string } | null; tone: string },
    source: d.source,
    model: d.model,
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
    next: primary ? { id: primary.id, type: primary.type, label: ACTION_META[primary.type].label, status: primary.status, decision: primary.decision } : null,
    pendingCount: actions.filter((a) => a.status === "proposed").length,
    plan: prog ? { paidCount: prog.rows.filter((r) => r.state === "paid").length, count: prog.rows.length, nextDue: prog.next?.due_date ?? null } : null,
    disputed: !!inv.disputed,
    remindersSent: reminderStats(inv.id, today).sent,
    lastActivity: ev?.at ?? null,
  };
}

/** "Cash unstuck": money collected on invoices after Unstuck first acted on them. */
function cashUnstuck(invoices: InvoiceRow[]) {
  let total = 0;
  for (const inv of invoices) {
    const executed = repo.listActions({ invoiceId: inv.id, status: "executed" }).filter((a) => a.origin !== "owner" && a.origin !== "system");
    if (!executed.length) continue;
    const baseline = Math.min(...executed.map((a) => a.paid_minor_before ?? inv.paid_minor));
    total += Math.max(0, inv.paid_minor - baseline);
  }
  return total;
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
  return { paypal, paypalError, webhookConfigured: cfg.paypal.webhookIdConfigured, ai: cfg.ai.configured ? "claude" : "rules", model: cfg.ai.configured ? cfg.ai.model : null };
}

export function boardSnapshot() {
  const today = todayIso();
  const invoices = repo.listInvoices();
  const rows = invoices.map((i) => boardRow(i, today));
  const open = rows.filter((r) => r.open);
  const pending = repo.listActions({ status: "proposed" }).map(viewAction);
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
      outstandingMinor: open.reduce((s, r) => s + r.dueMinor, 0),
      openCount: open.length,
      overdueMinor: open.filter((r) => r.daysOverdue > 0).reduce((s, r) => s + r.dueMinor, 0),
      overdueCount: open.filter((r) => r.daysOverdue > 0).length,
      pendingApprovals: pending.length,
      cashUnstuckMinor: cashUnstuck(invoices),
      byReason,
    },
    rows,
    pending,
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
