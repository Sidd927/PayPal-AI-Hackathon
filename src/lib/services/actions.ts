/**
 * Action lifecycle: propose → (policy) → auto-execute | owner approval | blocked → execute → audit.
 *
 * Execution is the only place PayPal write APIs are called. Each action id doubles as the
 * PayPal-Request-Id so retries (or double clicks) are idempotent at PayPal too.
 */
import { formatDate, todayIso } from "../dates";
import { type ActionRow, newId, repo } from "../db";
import { ACTION_META, type ActionType, type Installment, type PolicyDecision, type ProposedAction, parseActionParams } from "../domain";
import { formatMoney, fromMinor } from "../money";
import { getGateway } from "../config";
import { buildInvoiceUpdateBody, type CallReceipt } from "../paypal/gateway";
import { PayPalApiError } from "../paypal/client";
import { evaluateAction } from "../policy";
import { policyContextFor, refreshInvoice } from "./invoices";

export type ActionView = ActionRow & { params: unknown; reasons: string[]; checks: { label: string; ok: boolean; detail?: string }[]; result: unknown };

export function viewAction(a: ActionRow): ActionView {
  return {
    ...a,
    params: JSON.parse(a.params_json),
    reasons: JSON.parse(a.decision_reasons_json),
    checks: JSON.parse(a.checks_json),
    result: a.result_json ? JSON.parse(a.result_json) : null,
  };
}

export async function proposeAction(invoiceId: string, proposed: ProposedAction, opts: { diagnosisId?: number | null; executeIfAuto?: boolean } = {}) {
  const row = repo.getInvoice(invoiceId);
  if (!row) throw new Error("Invoice not found");
  const policy = repo.getPolicy();
  const decision: PolicyDecision = evaluateAction(proposed, policyContextFor(row), policy);
  const id = newId("act");
  const status = decision.decision === "block" ? "blocked" : "proposed";
  repo.insertAction({
    id,
    invoice_id: invoiceId,
    type: proposed.type,
    params_json: JSON.stringify(proposed.params),
    origin: proposed.origin,
    rationale: proposed.rationale,
    decision: decision.decision,
    decision_reasons_json: JSON.stringify(decision.reasons),
    checks_json: JSON.stringify(decision.checks),
    status,
    paid_minor_before: row.paid_minor,
    diagnosis_id: opts.diagnosisId ?? null,
  });
  repo.logEvent({
    invoice_id: invoiceId,
    kind: "action_proposed",
    actor: proposed.origin,
    summary: `${ACTION_META[proposed.type].label} proposed; ${decision.decision === "auto" ? "inside your rules, running automatically" : decision.decision === "approve" ? "waiting for your approval" : "blocked by your rules"}`,
    data: { action_id: id, decision },
  });
  if (decision.decision === "auto" && opts.executeIfAuto !== false) {
    repo.transitionAction(id, ["proposed"], "approved");
    await executeAction(id);
  }
  return viewAction(repo.getAction(id)!);
}

export async function approveAction(id: string, edits?: { params?: unknown }) {
  const a = repo.getAction(id);
  if (!a) throw new Error("Action not found");
  if (a.status !== "proposed") throw new Error(`Action is ${a.status}`);
  let paramsJson: string | undefined;
  if (edits?.params !== undefined) {
    // Owner edits are re-validated and re-checked by policy as an owner action.
    const params = parseActionParams(a.type, edits.params);
    const row = repo.getInvoice(a.invoice_id)!;
    const d = evaluateAction({ type: a.type, params, origin: "owner", rationale: a.rationale } as ProposedAction, policyContextFor(row), repo.getPolicy());
    if (d.decision === "block") throw new Error(`Blocked by policy: ${d.reasons.join("; ")}`);
    paramsJson = JSON.stringify(params);
  }
  if (!repo.transitionAction(id, ["proposed"], "approved", { params_json: paramsJson })) throw new Error("Action was already decided");
  repo.logEvent({ invoice_id: a.invoice_id, kind: "action_approved", actor: "owner", summary: `You approved: ${ACTION_META[a.type].label}`, data: { action_id: id } });
  await executeAction(id);
  return viewAction(repo.getAction(id)!);
}

export function rejectAction(id: string, reason?: string) {
  const a = repo.getAction(id);
  if (!a) throw new Error("Action not found");
  if (!repo.transitionAction(id, ["proposed"], "rejected", { error: reason ?? "Rejected by owner" })) throw new Error("Action was already decided");
  if (a.type === "offer_payment_plan") {
    const offer = repo.listOffers(a.invoice_id).find((o) => o.action_id === id);
    if (offer) repo.setOfferStatus(offer.id, "superseded");
  }
  repo.logEvent({ invoice_id: a.invoice_id, kind: "action_rejected", actor: "owner", summary: `You declined: ${ACTION_META[a.type].label}`, data: { action_id: id, reason } });
  return viewAction(repo.getAction(id)!);
}

function appendNote(existing: string | undefined, addition: string) {
  const merged = existing ? `${existing}\n\n${addition}` : addition;
  return merged.slice(-3900);
}

export function describePlan(installments: Installment[], currency: string) {
  return installments.map((i, n) => `${n + 1}) ${formatMoney(i.amount_minor, currency)} by ${formatDate(i.due_date)}`).join("  ");
}

/** Execute an approved action against PayPal. Never throws: failures are recorded on the action. */
export async function executeAction(id: string): Promise<ActionRow> {
  const a = repo.getAction(id);
  if (!a) throw new Error("Action not found");
  if (!repo.transitionAction(id, ["approved"], "executing")) return repo.getAction(id)!;
  const gw = getGateway();
  const requestId = `unstuck-${a.id}`;
  const params = JSON.parse(a.params_json);
  const type = a.type as ActionType;
  const receipts: CallReceipt[] = [];
  let summary = "";

  try {
    const row = await refreshInvoice(a.invoice_id); // always act on PayPal's current state
    const currency = row.currency;
    switch (type) {
      case "send_reminder": {
        receipts.push(await gw.sendReminder(row.id, params, requestId));
        repo.logEvent({ invoice_id: row.id, kind: "reminder_sent", actor: a.origin, summary: `Reminder sent via PayPal: “${params.subject}”`, data: { subject: params.subject, note: params.note, to: params.additional_recipients } });
        summary = "Reminder delivered by PayPal";
        break;
      }
      case "offer_payment_plan": {
        const installments = params.installments as Installment[];
        const total = installments.reduce((s, i) => s + i.amount_minor, 0);
        if (total !== row.due_minor) throw new Error(`Amount due changed to ${formatMoney(row.due_minor, currency)} since this plan was proposed. Re-diagnose to get a fresh plan.`);
        const inv = await gw.getInvoice(row.id);
        const planText = `Payment plan agreed ${todayIso()}: ${describePlan(installments, currency)}. Pay each installment from this invoice — partial payments are enabled.`;
        const body = buildInvoiceUpdateBody(inv, (b) => {
          b.configuration = { ...(b.configuration ?? {}), partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: currency, value: fromMinor(installments[0]!.amount_minor) } } };
          b.detail = { ...b.detail, note: appendNote(b.detail?.note, planText) };
        });
        const res = await gw.updateInvoice(row.id, body, { requestId, sendToRecipient: a.origin !== "payer" });
        receipts.push(res.receipt);
        repo.insertPlan({ id: newId("plan"), invoice_id: row.id, action_id: a.id, installments_json: JSON.stringify(installments), paid_minor_at_start: row.paid_minor, status: "active" });
        const offer = repo.listOffers(row.id).find((o) => o.action_id === a.id);
        if (offer) repo.setOfferStatus(offer.id, "accepted");
        summary = `Partial payments enabled in PayPal, minimum ${formatMoney(installments[0]!.amount_minor, currency)}`;
        break;
      }
      case "add_early_payment_discount": {
        receipts.push(
          await gw.addConditionalRules(
            row.id,
            [{ conditional_rule_type: "EARLY_PAYMENT_DISCOUNT", conditional_rule_value_type: "PERCENT", conditional_rule_value: String(params.percent), rule_expiry_terms: { rule_expiry_condition: "SPECIFIC_DATE", condition_rule_end_date: params.expires_on } }],
            requestId,
          ),
        );
        summary = `${params.percent}% early-payment discount until ${formatDate(params.expires_on)}`;
        break;
      }
      case "update_reference": {
        const inv = await gw.getInvoice(row.id);
        const body = buildInvoiceUpdateBody(inv, (b) => {
          b.detail = { ...b.detail, reference: params.reference, ...(params.note_append ? { note: appendNote(b.detail?.note, params.note_append) } : {}) };
          if (params.cc_email) {
            const existing = (b.additional_recipients ?? []) as { email_address: string }[];
            if (!existing.some((r) => r.email_address.toLowerCase() === params.cc_email.toLowerCase())) b.additional_recipients = [...existing, { email_address: params.cc_email }];
          }
        });
        const res = await gw.updateInvoice(row.id, body, { requestId, sendToRecipient: true });
        receipts.push(res.receipt);
        summary = `Reference set to ${params.reference}${params.cc_email ? `, CC ${params.cc_email}` : ""}; updated invoice re-sent by PayPal`;
        break;
      }
      case "record_external_payment": {
        receipts.push(await gw.recordPayment(row.id, { method: params.method, payment_date: params.payment_date, amount: { currency_code: currency, value: fromMinor(params.amount_minor) }, note: params.note }, requestId));
        summary = `Recorded ${formatMoney(params.amount_minor, currency)} received by ${params.method.toLowerCase().replace("_", " ")}`;
        break;
      }
      case "pause_reminders": {
        receipts.push(await gw.cancelAutoReminders(row.id, requestId));
        summary = "PayPal automatic reminders paused";
        break;
      }
      case "escalate_to_owner":
        summary = "Flagged for your review";
        break;
      case "wait":
        summary = `Nothing to send now; checking again on ${formatDate(params.until)}`;
        break;
    }
    const after = ["send_reminder", "escalate_to_owner", "wait"].includes(type) ? row : await refreshInvoice(a.invoice_id);
    repo.transitionAction(id, ["executing"], "executed", { result_json: JSON.stringify({ summary, receipts, invoice_status: after.status }) });
    repo.supersedeSameType(a.invoice_id, type, id);
    repo.logEvent({ invoice_id: a.invoice_id, kind: "action_executed", actor: a.origin === "owner" ? "owner" : "unstuck", summary: `${ACTION_META[type].label}: ${summary}`, data: { action_id: id, receipts } });
  } catch (err) {
    const e = err as Error & { status?: number };
    const detail = err instanceof PayPalApiError ? { status: err.status, name: err.name_, debugId: err.debugId, details: err.details } : { status: e.status };
    repo.transitionAction(id, ["executing"], "failed", { error: e.message, result_json: JSON.stringify({ receipts, error: detail }) });
    repo.logEvent({ invoice_id: a.invoice_id, kind: "action_failed", actor: "unstuck", summary: `${ACTION_META[type].label} failed: ${e.message}`, data: { action_id: id, ...detail } });
  }
  return repo.getAction(id)!;
}
