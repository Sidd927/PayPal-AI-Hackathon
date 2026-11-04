/**
 * Shared domain vocabulary — safe to import from client components.
 */
import { z } from "zod";
import { ISO_DATE_RE } from "./dates";

/* ------------------------------------------------------------------ */
/* Stuck reasons                                                       */
/* ------------------------------------------------------------------ */

export const STUCK_REASONS = [
  "forgot",
  "cash_flow",
  "missing_info",
  "dispute",
  "wrong_contact",
  "already_paid",
  "unresponsive",
  "not_due",
  "unknown",
] as const;
export type StuckReason = (typeof STUCK_REASONS)[number];

export const REASON_META: Record<StuckReason, { label: string; short: string; tone: string; description: string }> = {
  forgot: { label: "Slipped their mind", short: "Forgot", tone: "sky", description: "No objection or blocker — the invoice is simply overlooked." },
  cash_flow: { label: "Cash is tight", short: "Cash flow", tone: "amber", description: "The client wants to pay but can't pay the full amount right now." },
  missing_info: { label: "Missing PO / AP details", short: "Missing info", tone: "violet", description: "Their accounts-payable process is blocked on a PO number, reference or document." },
  dispute: { label: "Disputing the work", short: "Dispute", tone: "rose", description: "The client objects to the work, an item, or the amount." },
  wrong_contact: { label: "Sent to the wrong person", short: "Wrong contact", tone: "teal", description: "The invoice reached someone who can't or won't pay it." },
  already_paid: { label: "Says it's paid", short: "Paid elsewhere", tone: "emerald", description: "The client reports paying by another method (check, transfer)." },
  unresponsive: { label: "Gone quiet", short: "Quiet", tone: "slate", description: "Several reminders without any response." },
  not_due: { label: "Not due yet", short: "Not due", tone: "stone", description: "Within terms — nothing is stuck yet." },
  unknown: { label: "Not enough signal", short: "Unknown", tone: "stone", description: "Unstuck can't tell yet." },
};

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export const ACTION_TYPES = [
  "send_reminder",
  "offer_payment_plan",
  "add_early_payment_discount",
  "update_reference",
  "record_external_payment",
  "pause_reminders",
  "escalate_to_owner",
  "wait",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_META: Record<ActionType, { label: string; verb: string; paypal: string | null; movesMoney: boolean }> = {
  send_reminder: { label: "Reason-aware reminder", verb: "Send reminder", paypal: "POST /v2/invoicing/invoices/{id}/remind", movesMoney: false },
  offer_payment_plan: { label: "Payment plan", verb: "Set up plan", paypal: "PUT /v2/invoicing/invoices/{id} (partial payments)", movesMoney: true },
  add_early_payment_discount: { label: "Early-payment discount", verb: "Add discount", paypal: "POST /v2/invoicing/invoices/{id}/conditional-rules", movesMoney: true },
  update_reference: { label: "Add PO / reference", verb: "Update invoice", paypal: "PUT /v2/invoicing/invoices/{id}", movesMoney: false },
  record_external_payment: { label: "Record payment received", verb: "Record payment", paypal: "POST /v2/invoicing/invoices/{id}/payments", movesMoney: true },
  pause_reminders: { label: "Pause automatic reminders", verb: "Pause reminders", paypal: "POST /v2/invoicing/invoices/{id}/cancel-reminders", movesMoney: false },
  escalate_to_owner: { label: "Needs your judgement", verb: "Review", paypal: null, movesMoney: false },
  wait: { label: "Wait — promise to pay", verb: "Wait", paypal: null, movesMoney: false },
};

const isoDate = z.string().regex(ISO_DATE_RE, "Expected YYYY-MM-DD");
const minor = z.number().int().nonnegative();

export const Installment = z.object({ amount_minor: minor.positive(), due_date: isoDate });
export type Installment = z.infer<typeof Installment>;

export const ActionParams = {
  send_reminder: z.object({
    subject: z.string().min(3).max(200),
    note: z.string().min(10).max(3500),
    additional_recipients: z.array(z.string().email()).max(3).optional(),
  }),
  offer_payment_plan: z.object({ installments: z.array(Installment).min(2).max(12) }),
  add_early_payment_discount: z.object({ percent: z.number().positive().max(100), expires_on: isoDate }),
  update_reference: z.object({
    reference: z.string().min(1).max(120),
    note_append: z.string().max(1500).optional(),
    cc_email: z.string().email().optional(),
  }),
  record_external_payment: z.object({
    amount_minor: minor.positive(),
    method: z.enum(["CHECK", "BANK_TRANSFER", "CASH", "OTHER"]),
    payment_date: isoDate,
    note: z.string().max(500).optional(),
  }),
  pause_reminders: z.object({}),
  escalate_to_owner: z.object({ summary: z.string().min(3).max(1000), draft_reply: z.string().max(3500).optional() }),
  wait: z.object({ until: isoDate, reason: z.string().max(500) }),
} satisfies Record<ActionType, z.ZodType>;

export type ActionParamsMap = { [K in ActionType]: z.infer<(typeof ActionParams)[K]> };

export type ProposedAction<K extends ActionType = ActionType> = {
  type: K;
  params: ActionParamsMap[K];
  origin: "agent" | "payer" | "owner" | "system";
  rationale: string;
};

export function parseActionParams<K extends ActionType>(type: K, params: unknown): ActionParamsMap[K] {
  return ActionParams[type].parse(params) as ActionParamsMap[K];
}

export type PolicyDecisionKind = "auto" | "approve" | "block";
export type PolicyCheck = { label: string; ok: boolean; detail?: string };
export type PolicyDecision = { decision: PolicyDecisionKind; reasons: string[]; checks: PolicyCheck[] };

export type ActionStatus = "proposed" | "approved" | "rejected" | "executing" | "executed" | "failed" | "blocked";

/** PayPal invoice statuses that still have money outstanding. */
export const OPEN_STATUSES = ["SENT", "UNPAID", "PARTIALLY_PAID", "PAYMENT_PENDING", "SCHEDULED"] as const;
export const CLOSED_STATUSES = ["PAID", "MARKED_AS_PAID", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED", "MARKED_AS_REFUNDED"] as const;

export function isOpenStatus(s: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(s);
}
