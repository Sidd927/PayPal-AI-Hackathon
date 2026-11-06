/**
 * Reacting to money arriving: plan progress and next-installment minimum due.
 * Triggered by a verified PayPal webhook, a manual/periodic sync, or (simulation) a simulated payment.
 */
import { formatDate, todayIso } from "../dates";
import { type PlanRow, newId, repo } from "../db";
import type { Installment } from "../domain";
import { formatMoney, fromMinor } from "../money";
import { getGateway } from "../config";
import { buildInvoiceUpdateBody } from "../paypal/gateway";
import { refreshInvoice } from "./invoices";
import { withLock } from "../locks";

export type InstallmentProgress = Installment & { paid_minor: number; state: "paid" | "partial" | "due" | "overdue" | "upcoming" };

export function planProgress(plan: Pick<PlanRow, "installments_json" | "paid_minor_at_start">, paidNowMinor: number, today = todayIso()) {
  const installments = JSON.parse(plan.installments_json) as Installment[];
  let pool = Math.max(0, paidNowMinor - plan.paid_minor_at_start);
  let nextIndex = -1;
  const rows: InstallmentProgress[] = installments.map((ins, i) => {
    const applied = Math.min(pool, ins.amount_minor);
    pool -= applied;
    let state: InstallmentProgress["state"];
    if (applied >= ins.amount_minor) state = "paid";
    else {
      if (nextIndex === -1) nextIndex = i;
      state = applied > 0 ? "partial" : ins.due_date < today ? "overdue" : nextIndex === i ? "due" : "upcoming";
    }
    return { ...ins, paid_minor: applied, state };
  });
  const next = nextIndex >= 0 ? rows[nextIndex]! : null;
  return { rows, next, nextRemainingMinor: next ? next.amount_minor - next.paid_minor : 0, complete: nextIndex === -1 };
}

/**
 * Re-fetch an invoice after a payment signal and advance any active plan. Idempotent.
 * Takes the same per-invoice lock as actions (see proposeAction): this is a GET → modify → PUT of the whole
 * invoice, and an action updating the same invoice at the same time would otherwise overwrite one change with a
 * stale copy. Nothing here calls back into actions, so the lock is never nested.
 */
export function handleInvoicePaymentUpdate(invoiceId: string, source: "webhook" | "sync" | "simulation") {
  return withLock(`act:${invoiceId}`, () => handleInvoicePaymentUpdateUnlocked(invoiceId, source));
}

async function handleInvoicePaymentUpdateUnlocked(invoiceId: string, source: "webhook" | "sync" | "simulation") {
  const before = repo.getInvoice(invoiceId);
  const row = await refreshInvoice(invoiceId);
  const delta = row.paid_minor - (before?.paid_minor ?? 0);
  if (delta > 0) {
    repo.logEvent({
      invoice_id: row.id,
      kind: "payment_received",
      actor: source === "simulation" ? "simulation" : "paypal",
      summary: `${formatMoney(delta, row.currency)} paid${source === "simulation" ? " (simulated)" : " via PayPal"}; invoice now ${row.status.replace(/_/g, " ").toLowerCase()}`,
      data: { status: row.status, paid_minor: row.paid_minor, due_minor: row.due_minor, delta_minor: delta, source },
    });
  }

  const plan = repo.activePlan(row.id);
  if (!plan) return { row, planUpdated: false };
  const progress = planProgress(plan, row.paid_minor);
  if (progress.complete || row.due_minor === 0) {
    repo.setPlanStatus(plan.id, "completed");
    repo.logEvent({ invoice_id: row.id, kind: "plan_completed", actor: "unstuck", summary: "Payment plan completed; invoice paid in full" });
    return { row, planUpdated: true };
  }
  const nextMin = Math.min(progress.nextRemainingMinor, row.due_minor);
  if (row.partial_allowed && row.min_due_minor === nextMin) return { row, planUpdated: false };

  // Move PayPal's minimum due to the next installment so the payer sees the right amount.
  const gw = getGateway();
  const inv = await gw.getInvoice(row.id);
  const body = buildInvoiceUpdateBody(inv, (b) => {
    b.configuration = { ...(b.configuration ?? {}), partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: row.currency, value: fromMinor(nextMin) } } };
  });
  const actionId = newId("act");
  const res = await gw.updateInvoice(row.id, body, { requestId: `unstuck-${actionId}`, sendToRecipient: false });
  // Verify, don't assume: re-read the invoice and compare. Simulation says plainly that PayPal was not called.
  const after = await refreshInvoice(row.id);
  const confirmed = after.partial_allowed && after.min_due_minor === nextMin;
  const next = `Next installment ${formatMoney(nextMin, row.currency)} by ${formatDate(progress.next!.due_date)}`;
  const outcome =
    gw.mode !== "live"
      ? "minimum due updated (simulation: PayPal was not called)"
      : confirmed
        ? "PayPal accepted the new minimum due, and re-reading the invoice confirms it"
        : `PayPal accepted the update, but the re-read invoice shows a minimum due of ${after.min_due_minor === null ? "none" : formatMoney(after.min_due_minor, row.currency)}`;
  repo.logEvent({
    invoice_id: row.id,
    kind: "plan_advanced",
    actor: "unstuck",
    summary: `${next}; ${outcome}`,
    data: { receipt: res.receipt, simulated: gw.mode !== "live", verified: gw.mode === "live" ? confirmed : null },
  });
  return { row: after, planUpdated: true };
}
