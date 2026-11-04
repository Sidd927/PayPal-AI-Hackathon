import { json, route } from "@/lib/http";
import { repo } from "@/lib/db";
import { ACTION_META, REASON_META } from "@/lib/domain";
import { boardRows } from "@/lib/services/board";

export const dynamic = "force-dynamic";

/** Flat tables for AG Studio's in-browser data engine. Amounts in dollars for readability. */
export const GET = route(async () => {
  const rows = boardRows();
  const names = new Map(rows.map((r) => [r.id, r.client]));
  const invoices = rows.map((r) => ({
    invoice_id: r.id,
    number: r.number ?? "",
    client: r.client,
    status: r.open ? (r.daysOverdue > 0 ? "Overdue" : "Open") : "Settled",
    stuck_reason: r.open ? (r.reason ? REASON_META[r.reason].short : "Not diagnosed") : "Settled",
    risk_band: r.open ? { low: "Low", watch: "Watch", high: "High" }[r.risk.band] : "Settled",
    risk_score: r.open ? r.risk.score : 0,
    days_overdue: r.open ? Math.max(0, r.daysOverdue) : 0,
    amount_due: r.dueMinor / 100,
    amount_paid: r.paidMinor / 100,
    total: r.totalMinor / 100,
    next_step: r.next ? ACTION_META[r.next.type].label : r.plan ? "Payment plan" : "",
  }));
  const actions = repo.listActions().map((a) => ({
    action_id: a.id,
    client: names.get(a.invoice_id) ?? "",
    action: ACTION_META[a.type].label,
    proposed_by: { agent: "Agent", payer: "Client", owner: "Owner", system: "Agent" }[a.origin] ?? a.origin,
    rule_decision: { auto: "Automatic", approve: "Needs approval", block: "Blocked" }[a.decision],
    status: a.status,
    created: a.created_at.slice(0, 10),
  }));
  const payments = repo
    .listEvents({ limit: 1000 })
    .filter((e) => e.kind === "payment_received")
    .map((e) => {
      const d = e.data_json ? JSON.parse(e.data_json) : {};
      return { client: e.invoice_id ? names.get(e.invoice_id) ?? "" : "", amount: (d.delta_minor ?? 0) / 100, date: e.at.slice(0, 10), source: d.source ?? "paypal" };
    });
  return json({ invoices, actions, payments });
});
