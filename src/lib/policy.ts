/**
 * Deterministic policy engine — the trust boundary between AI proposals and PayPal.
 *
 * Nothing the LLM produces reaches PayPal without passing through `evaluateAction`.
 * The engine is pure (no I/O) so it is exhaustively unit-tested.
 */
import { z } from "zod";
import { addDays, daysBetween, isIsoDate } from "./dates";
import {
  ActionParams,
  type ActionType,
  type Installment,
  type PolicyCheck,
  type PolicyDecision,
  type ProposedAction,
  isOpenStatus,
} from "./domain";
import { formatMoney, splitEvenly } from "./money";

export const PolicySchema = z.object({
  businessName: z.string().min(1).max(120).default("Juniper & Co. Studio"),
  ownerName: z.string().min(1).max(120).default("Maya Okafor"),
  /** Let the agent send reminders on its own (within the limits below). */
  autoSendReminders: z.boolean().default(true),
  reminderQuietDays: z.number().int().min(1).max(30).default(3),
  maxRemindersPerInvoice: z.number().int().min(1).max(10).default(4),
  /** Payment plans */
  maxInstallments: z.number().int().min(2).max(12).default(3),
  minFirstPaymentPct: z.number().int().min(0).max(100).default(25),
  maxPlanDays: z.number().int().min(7).max(180).default(60),
  /** When a payer accepts a plan that is inside policy, apply it in PayPal immediately. */
  autoApprovePayerPlans: z.boolean().default(true),
  /** Early-payment discounts (always require owner approval). */
  allowEarlyPaymentDiscount: z.boolean().default(true),
  maxDiscountPct: z.number().min(0).max(20).default(2),
  minInvoiceForDiscountMinor: z.number().int().min(0).default(200_000),
});
export type Policy = z.infer<typeof PolicySchema>;
export const DEFAULT_POLICY: Policy = PolicySchema.parse({});

export type PolicyContext = {
  invoice: {
    status: string;
    currency: string;
    amountDueMinor: number;
    totalMinor: number;
    disputed: boolean;
  };
  remindersSent: number;
  lastReminderAt: string | null; // ISO date
  today: string; // ISO date
  /** Links Unstuck itself generated for this invoice (the resolution page); any other link needs the owner. */
  allowedLinks?: string[];
};

/**
 * Deterministic checks on agent-written text that would go to a client automatically. The model writes
 * reminders from client text that may be hostile, so anything unusual goes to the owner instead of out.
 */
export function outboundTextConcerns(text: string, allowedLinks: string[] = []): string[] {
  let t = text;
  for (const l of allowedLinks) if (l) t = t.split(l).join("");
  const concerns: string[] = [];
  if (/https?:\/\/|www\./i.test(t)) concerns.push("The message contains a link Unstuck didn't generate.");
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t)) concerns.push("The message mentions an email address.");
  if (/\b(bank account|account number|routing number|sort code|iban|swift|wire transfer|zelle|venmo|cash ?app|crypto|bitcoin|gift cards?)\b/i.test(t)) concerns.push("The message mentions another way to pay.");
  if (/\b(lawsuit|sue|legal action|court|collections? agency|debt collector|police|credit (score|report|bureau)|lawyer|attorney)\b/i.test(t)) concerns.push("The message uses legal or threatening language.");
  if (t.length > 1500) concerns.push("The message is unusually long.");
  return concerns;
}

/* ------------------------------------------------------------------ */
/* Payment plans                                                       */
/* ------------------------------------------------------------------ */

export function planIntervalDays(count: number, policy: Policy): number {
  if (count <= 1) return 0;
  return Math.max(7, Math.min(14, Math.floor(policy.maxPlanDays / (count - 1))));
}

/**
 * Build a plan deterministically. The first installment can be specified; the remainder is split evenly.
 * Returns null when the inputs can't form a plan (validation of policy limits happens in `validatePlan`).
 */
export function buildPlan(args: {
  amountDueMinor: number;
  installmentCount: number;
  firstPaymentMinor?: number | null;
  firstDate: string;
  policy: Policy;
}): Installment[] | null {
  const { amountDueMinor, installmentCount: n, firstDate, policy } = args;
  if (!Number.isInteger(n) || n < 2 || n > 12 || amountDueMinor <= 0 || !isIsoDate(firstDate)) return null;
  const interval = planIntervalDays(n, policy);
  let amounts: number[];
  const first = args.firstPaymentMinor ?? null;
  if (first !== null) {
    if (!Number.isInteger(first) || first <= 0 || first >= amountDueMinor) return null;
    amounts = [first, ...splitEvenly(amountDueMinor - first, n - 1)];
  } else {
    amounts = splitEvenly(amountDueMinor, n);
  }
  return amounts.map((amount_minor, i) => ({ amount_minor, due_date: addDays(firstDate, i * interval) }));
}

export function validatePlan(installments: Installment[], ctx: PolicyContext, policy: Policy): PolicyCheck[] {
  const checks: PolicyCheck[] = [];
  const sum = installments.reduce((s, i) => s + i.amount_minor, 0);
  const due = ctx.invoice.amountDueMinor;
  const cur = ctx.invoice.currency;
  checks.push({
    label: "Installments add up to the amount due",
    ok: sum === due,
    detail: `${formatMoney(sum, cur)} vs ${formatMoney(due, cur)} due`,
  });
  checks.push({
    label: `At most ${policy.maxInstallments} installments`,
    ok: installments.length >= 2 && installments.length <= policy.maxInstallments,
    detail: `${installments.length} proposed`,
  });
  const first = installments[0];
  const minFirst = Math.ceil((due * policy.minFirstPaymentPct) / 100);
  checks.push({
    label: `First payment at least ${policy.minFirstPaymentPct}%`,
    ok: !!first && first.amount_minor >= minFirst,
    detail: first ? `${formatMoney(first.amount_minor, cur)} (min ${formatMoney(minFirst, cur)})` : "none",
  });
  const datesValid = installments.every((i) => isIsoDate(i.due_date));
  const ascending = installments.every((i, idx) => idx === 0 || i.due_date > installments[idx - 1]!.due_date);
  const startsOk = !!first && first.due_date >= ctx.today && daysBetween(ctx.today, first.due_date) <= 14;
  checks.push({ label: "Dates are valid, in order, first within 14 days", ok: datesValid && ascending && startsOk });
  const last = installments[installments.length - 1];
  const span = last && datesValid ? daysBetween(ctx.today, last.due_date) : Infinity;
  checks.push({
    label: `Finishes within ${policy.maxPlanDays} days`,
    ok: span <= policy.maxPlanDays,
    detail: Number.isFinite(span) ? `${span} days` : undefined,
  });
  return checks;
}

/** Plan options the payer can choose from, all inside policy. */
export function suggestPlans(ctx: PolicyContext, policy: Policy): Installment[][] {
  const out: Installment[][] = [];
  for (let n = 2; n <= policy.maxInstallments; n++) {
    const minFirst = Math.ceil((ctx.invoice.amountDueMinor * policy.minFirstPaymentPct) / 100);
    const even = Math.ceil(ctx.invoice.amountDueMinor / n);
    const plan = buildPlan({
      amountDueMinor: ctx.invoice.amountDueMinor,
      installmentCount: n,
      firstPaymentMinor: even >= minFirst ? null : minFirst,
      firstDate: ctx.today,
      policy,
    });
    if (plan && validatePlan(plan, ctx, policy).every((c) => c.ok)) out.push(plan);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Evaluate any proposed action                                        */
/* ------------------------------------------------------------------ */

const MONEY_CHANGING: ActionType[] = ["offer_payment_plan", "add_early_payment_discount", "record_external_payment"];

export function evaluateAction(action: ProposedAction, ctx: PolicyContext, policy: Policy): PolicyDecision {
  const checks: PolicyCheck[] = [];
  const reasons: string[] = [];
  const block = (r: string): PolicyDecision => ({ decision: "block", reasons: [r, ...reasons], checks });

  // 1. Schema — parameters must be well-formed regardless of who proposed them.
  const parsed = ActionParams[action.type].safeParse(action.params);
  checks.push({ label: "Parameters are well-formed", ok: parsed.success });
  if (!parsed.success) return block(`Invalid parameters: ${parsed.error.issues.map((i) => i.message).join("; ")}`);

  // 2. Invoice must still be open (except escalations / waits which are informational).
  const informational = action.type === "escalate_to_owner" || action.type === "wait";
  const open = isOpenStatus(ctx.invoice.status);
  checks.push({ label: "Invoice is still open", ok: open, detail: ctx.invoice.status });
  if (!open && !informational) return block(`Invoice is ${ctx.invoice.status}; nothing to collect.`);

  // 3. Disputed invoices: no automated pressure, no money changes until the owner resolves it.
  if (ctx.invoice.disputed && (action.type === "send_reminder" || MONEY_CHANGING.includes(action.type)) && action.origin !== "owner") {
    checks.push({ label: "No automated pressure while disputed", ok: false });
    return { decision: "approve", reasons: ["Invoice is under dispute — owner must decide."], checks };
  }

  switch (action.type) {
    case "send_reminder": {
      const quietOk = !ctx.lastReminderAt || daysBetween(ctx.lastReminderAt, ctx.today) >= policy.reminderQuietDays;
      const countOk = ctx.remindersSent < policy.maxRemindersPerInvoice;
      checks.push({ label: `At least ${policy.reminderQuietDays} days since last reminder`, ok: quietOk, detail: ctx.lastReminderAt ?? "never" });
      checks.push({ label: `Fewer than ${policy.maxRemindersPerInvoice} reminders sent`, ok: countOk, detail: `${ctx.remindersSent} sent` });
      const p = parsed.data as { additional_recipients?: string[] };
      const newRecipients = (p.additional_recipients?.length ?? 0) > 0;
      if (!countOk) return block("Reminder limit reached for this invoice.");
      if (newRecipients) reasons.push("Sends to a new recipient — confirm the address.");
      if (!quietOk) reasons.push("Too soon after the previous reminder.");
      if (!policy.autoSendReminders) reasons.push("Automatic reminders are turned off.");
      if (action.origin !== "owner") {
        const text = parsed.data as { subject: string; note?: string };
        const concerns = outboundTextConcerns(`${text.subject}\n${text.note ?? ""}`, ctx.allowedLinks);
        checks.push({ label: "Message passes content checks", ok: concerns.length === 0, detail: concerns.join(" ") || undefined });
        reasons.push(...concerns);
      }
      if (action.origin === "owner") return { decision: "auto", reasons: ["Owner-initiated"], checks };
      return { decision: reasons.length ? "approve" : "auto", reasons, checks };
    }

    case "offer_payment_plan": {
      const { installments } = parsed.data as { installments: Installment[] };
      const planChecks = validatePlan(installments, ctx, policy);
      checks.push(...planChecks);
      const failed = planChecks.filter((c) => !c.ok);
      if (failed.length) {
        // Owner can override plan limits; nobody can override arithmetic.
        if (!planChecks[0]!.ok) return block("Installments do not add up to the amount due.");
        if (action.origin === "owner") return { decision: "auto", reasons: ["Owner override of plan limits"], checks };
        return { decision: "approve", reasons: failed.map((f) => `Outside policy: ${f.label}`), checks };
      }
      if (action.origin === "payer" && policy.autoApprovePayerPlans) return { decision: "auto", reasons: ["Payer chose a plan inside your policy"], checks };
      if (action.origin === "owner") return { decision: "auto", reasons: ["Owner-initiated"], checks };
      return { decision: "approve", reasons: ["Changes payment terms"], checks };
    }

    case "add_early_payment_discount": {
      const { percent, expires_on } = parsed.data as { percent: number; expires_on: string };
      const allowed = policy.allowEarlyPaymentDiscount;
      const pctOk = percent <= policy.maxDiscountPct;
      const sizeOk = ctx.invoice.totalMinor >= policy.minInvoiceForDiscountMinor;
      const expOk = expires_on >= ctx.today && daysBetween(ctx.today, expires_on) <= 14;
      checks.push({ label: "Discounts enabled", ok: allowed });
      checks.push({ label: `Discount ≤ ${policy.maxDiscountPct}%`, ok: pctOk, detail: `${percent}%` });
      checks.push({ label: `Invoice ≥ ${formatMoney(policy.minInvoiceForDiscountMinor, ctx.invoice.currency, { compact: true })}`, ok: sizeOk });
      checks.push({ label: "Offer expires within 14 days", ok: expOk, detail: expires_on });
      if (!allowed) return block("Early-payment discounts are disabled in your policy.");
      if (!expOk) return block("Discount expiry must be within the next 14 days.");
      if (!pctOk && action.origin !== "owner") return block(`Discount above your ${policy.maxDiscountPct}% limit.`);
      if (!sizeOk) reasons.push("Invoice is below your discount threshold.");
      return { decision: action.origin === "owner" ? "auto" : "approve", reasons: ["Reduces the amount you receive", ...reasons], checks };
    }

    case "record_external_payment": {
      const { amount_minor, payment_date } = parsed.data as { amount_minor: number; payment_date: string };
      const amtOk = amount_minor <= ctx.invoice.amountDueMinor;
      const dateOk = payment_date <= ctx.today;
      checks.push({ label: "Amount ≤ amount due", ok: amtOk });
      checks.push({ label: "Payment date not in the future", ok: dateOk });
      if (!amtOk) return block("Recorded amount exceeds the amount due.");
      if (!dateOk) return block("Payment date is in the future.");
      if (action.origin === "owner") return { decision: "auto", reasons: ["Owner confirmed funds received"], checks };
      return { decision: "approve", reasons: ["Only you can confirm money arrived outside PayPal"], checks };
    }

    case "update_reference":
      return { decision: action.origin === "owner" ? "auto" : "approve", reasons: ["Edits the invoice your client sees"], checks };

    case "pause_reminders":
      return { decision: "auto", reasons: ["Reduces pressure; no money change"], checks };

    case "escalate_to_owner":
      return { decision: action.origin === "owner" ? "auto" : "approve", reasons: ["Needs your judgement — nothing is sent to the client"], checks };
    case "wait":
      return { decision: "auto", reasons: ["Informational — nothing is sent"], checks };
  }
}
