/**
 * Read-only reporting tables for AG Studio. These are the *only* data the Insights agents can see:
 * predefined tables and fields derived from Unstuck's state, never direct database access.
 * Amounts are in the business's primary currency; other currencies are excluded and counted.
 */
import { todayIso } from "../dates";
import { repo } from "../db";
import { ACTION_META, REASON_META, isOpenStatus } from "../domain";
import { boardRows } from "./board";

const AGING = (days: number) => (days <= 0 ? "Not due" : days <= 30 ? "1–30 days late" : days <= 60 ? "31–60 days late" : "60+ days late");

export function insightsTables(today = todayIso()) {
  const all = boardRows(today);
  const currencies = new Map<string, number>();
  for (const r of all) currencies.set(r.currency, (currencies.get(r.currency) ?? 0) + 1);
  const primary = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const rows = all.filter((r) => r.currency === primary);
  const names = new Map(all.map((r) => [r.id, r.client]));
  const events = repo.listEvents({ limit: 5000 });
  const actions = repo.listActions();
  const firstAct = new Map<string, string>();
  for (const a of actions) {
    if (a.status !== "executed" || a.origin === "owner" || a.origin === "system") continue;
    const prev = firstAct.get(a.invoice_id);
    if (!prev || a.created_at < prev) firstAct.set(a.invoice_id, a.created_at);
  }
  const lastReply = new Map<string, string>();
  for (const r of rows) {
    const m = repo.listMessages(r.id).filter((x) => x.author === "client").at(-1);
    if (m) lastReply.set(r.id, m.created_at.slice(0, 10));
  }

  const open = rows.filter((r) => r.open);
  const invoices = open.map((r) => {
    const reply = lastReply.get(r.id);
    return {
      invoice_id: r.id,
      client: r.client,
      number: r.number ?? "",
      stuck_reason: r.reason ? REASON_META[r.reason].short : "Not diagnosed",
      aging: AGING(r.daysOverdue),
      risk_band: { low: "Low", watch: "Watch", high: "High" }[r.risk.band],
      risk_score: r.risk.score,
      days_overdue: Math.max(0, r.daysOverdue),
      days_since_client_reply: reply ? Math.round((Date.parse(today) - Date.parse(reply)) / 86_400_000) : 999,
      amount_due: r.dueMinor / 100,
      next_step: r.plan ? "Payment plan" : r.next ? ACTION_META[r.next.type].label : "",
      awaiting_approval: r.pendingCount > 0 ? "Yes" : "No",
    };
  });

  const payments = events
    .filter((e) => e.kind === "payment_received" && e.invoice_id && names.has(e.invoice_id))
    .map((e) => {
      const d = e.data_json ? (JSON.parse(e.data_json) as { delta_minor?: number; source?: string }) : {};
      const acted = firstAct.get(e.invoice_id!);
      return {
        client: names.get(e.invoice_id!) ?? "",
        amount: (d.delta_minor ?? 0) / 100,
        date: e.at.slice(0, 10),
        source: d.source === "simulation" ? "Simulated" : "PayPal",
        timing: acted && e.at >= acted ? "After Unstuck acted" : "Without Unstuck action",
      };
    });

  const promises: { client: string; promised_by: string; status: string; amount_due: number }[] = [];
  const seen = new Set<string>();
  for (const e of events.filter((x) => x.kind === "promise_to_pay" && x.invoice_id)) {
    if (seen.has(e.invoice_id!)) continue; // events are newest-first: keep the latest promise per invoice
    seen.add(e.invoice_id!);
    const inv = repo.getInvoice(e.invoice_id!);
    if (!inv || inv.currency !== primary) continue;
    const date = (e.data_json ? JSON.parse(e.data_json).date : null) as string | null;
    if (!date) continue;
    const status = !isOpenStatus(inv.status) ? "Kept" : date < today ? "Missed" : "Due";
    promises.push({ client: names.get(inv.id) ?? "", promised_by: date, status, amount_due: inv.due_minor / 100 });
  }

  const approvals = actions
    .filter((a) => a.status === "proposed" && names.has(a.invoice_id))
    .map((a) => ({
      client: names.get(a.invoice_id) ?? "",
      action: ACTION_META[a.type].label,
      changes_money: ACTION_META[a.type].movesMoney ? "Yes" : "No",
      waiting_since: a.created_at.slice(0, 10),
      why: (JSON.parse(a.decision_reasons_json) as string[])[0] ?? "",
    }));

  const agentActions = actions
    .filter((a) => names.has(a.invoice_id))
    .map((a) => ({
      action_id: a.id,
      client: names.get(a.invoice_id) ?? "",
      action: ACTION_META[a.type].label,
      proposed_by: ({ agent: "Agent", payer: "Client", owner: "Owner", system: "Agent" } as Record<string, string>)[a.origin] ?? a.origin,
      rule_decision: { auto: "Automatic", approve: "Needs approval", block: "Blocked" }[a.decision],
      status: a.status,
    }));

  return {
    currency: primary,
    excludedOtherCurrency: all.length - rows.length,
    invoices,
    actions: agentActions,
    payments,
    promises,
    approvals,
  };
}

export type InsightsTables = ReturnType<typeof insightsTables>;
