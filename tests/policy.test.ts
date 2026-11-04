import { describe, expect, it } from "vitest";
import { fromMinor, splitEvenly, toMinor, tryToMinor } from "@/lib/money";
import { buildPlan, DEFAULT_POLICY, evaluateAction, type PolicyContext, suggestPlans, validatePlan } from "@/lib/policy";
import type { ProposedAction } from "@/lib/domain";

const today = "2026-11-04";
const ctx = (over: Partial<PolicyContext["invoice"]> = {}, extra: Partial<PolicyContext> = {}): PolicyContext => ({
  invoice: { status: "SENT", currency: "USD", amountDueMinor: 120_000, totalMinor: 120_000, disputed: false, ...over },
  remindersSent: 0,
  lastReminderAt: null,
  today,
  ...extra,
});

describe("money", () => {
  it("parses and formats decimal strings exactly", () => {
    expect(toMinor("1200.5")).toBe(120050);
    expect(toMinor("$1,200.05")).toBe(120005);
    expect(toMinor("0.01")).toBe(1);
    expect(fromMinor(120050)).toBe("1200.50");
    expect(fromMinor(5)).toBe("0.05");
  });
  it("rejects malformed amounts", () => {
    for (const bad of ["1.234", "-5", "abc", "1e5", ""]) expect(() => toMinor(bad)).toThrow();
    expect(tryToMinor("nope")).toBeNull();
    expect(() => fromMinor(1.5)).toThrow();
  });
  it("splits evenly with exact sums", () => {
    const parts = splitEvenly(100_000, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100_000);
    expect(parts).toEqual([33_334, 33_333, 33_333]);
  });
});

describe("payment plans", () => {
  it("builds a plan honouring the client's first payment", () => {
    const plan = buildPlan({ amountDueMinor: 120_000, installmentCount: 3, firstPaymentMinor: 40_000, firstDate: today, policy: DEFAULT_POLICY })!;
    expect(plan.map((p) => p.amount_minor)).toEqual([40_000, 40_000, 40_000]);
    expect(plan[0]!.due_date).toBe(today);
    expect(plan.at(-1)!.due_date > plan[0]!.due_date).toBe(true);
    expect(validatePlan(plan, ctx(), DEFAULT_POLICY).every((c) => c.ok)).toBe(true);
  });
  it("rejects impossible plans", () => {
    expect(buildPlan({ amountDueMinor: 100, installmentCount: 1, firstDate: today, policy: DEFAULT_POLICY })).toBeNull();
    expect(buildPlan({ amountDueMinor: 100, installmentCount: 2, firstPaymentMinor: 100, firstDate: today, policy: DEFAULT_POLICY })).toBeNull();
    expect(buildPlan({ amountDueMinor: 100, installmentCount: 2, firstDate: "2026-13-01", policy: DEFAULT_POLICY })).toBeNull();
  });
  it("flags a first payment below the policy minimum", () => {
    const plan = buildPlan({ amountDueMinor: 120_000, installmentCount: 3, firstPaymentMinor: 10_000, firstDate: today, policy: DEFAULT_POLICY })!;
    const failed = validatePlan(plan, ctx(), DEFAULT_POLICY).filter((c) => !c.ok);
    expect(failed.map((f) => f.label)).toContain("First payment at least 25%");
  });
  it("suggests only in-policy plans", () => {
    const plans = suggestPlans(ctx(), DEFAULT_POLICY);
    expect(plans.length).toBe(DEFAULT_POLICY.maxInstallments - 1);
    for (const p of plans) expect(validatePlan(p, ctx(), DEFAULT_POLICY).every((c) => c.ok)).toBe(true);
  });
});

describe("evaluateAction", () => {
  const plan = (installments: { amount_minor: number; due_date: string }[], origin: ProposedAction["origin"] = "payer"): ProposedAction => ({ type: "offer_payment_plan", origin, rationale: "", params: { installments } });

  it("auto-applies an in-policy plan chosen by the payer", () => {
    const p = buildPlan({ amountDueMinor: 120_000, installmentCount: 3, firstDate: today, policy: DEFAULT_POLICY })!;
    expect(evaluateAction(plan(p), ctx(), DEFAULT_POLICY).decision).toBe("auto");
  });
  it("requires approval for agent-proposed plans", () => {
    const p = buildPlan({ amountDueMinor: 120_000, installmentCount: 3, firstDate: today, policy: DEFAULT_POLICY })!;
    expect(evaluateAction(plan(p, "agent"), ctx(), DEFAULT_POLICY).decision).toBe("approve");
  });
  it("blocks plans whose arithmetic is wrong, even from the owner", () => {
    const bad = [
      { amount_minor: 50_000, due_date: today },
      { amount_minor: 50_000, due_date: "2026-11-18" },
    ];
    expect(evaluateAction(plan(bad, "owner"), ctx(), DEFAULT_POLICY).decision).toBe("block");
  });
  it("sends out-of-policy payer plans to the owner", () => {
    const p = buildPlan({ amountDueMinor: 120_000, installmentCount: 6, firstDate: today, policy: { ...DEFAULT_POLICY, maxPlanDays: 180 } })!;
    expect(evaluateAction(plan(p), ctx(), DEFAULT_POLICY).decision).toBe("approve");
  });
  it("blocks malformed parameters (e.g. hallucinated fields)", () => {
    const d = evaluateAction({ type: "send_reminder", origin: "agent", rationale: "", params: { subject: "", note: "x" } as never }, ctx(), DEFAULT_POLICY);
    expect(d.decision).toBe("block");
  });
  it("blocks any action on a paid invoice", () => {
    const d = evaluateAction({ type: "send_reminder", origin: "agent", rationale: "", params: { subject: "Hello there", note: "A reminder note." } }, ctx({ status: "PAID" }), DEFAULT_POLICY);
    expect(d.decision).toBe("block");
  });
  it("auto-sends reminders inside the quiet period rules, otherwise asks", () => {
    const r: ProposedAction = { type: "send_reminder", origin: "agent", rationale: "", params: { subject: "Quick reminder", note: "Hi Sam, a friendly reminder." } };
    expect(evaluateAction(r, ctx(), DEFAULT_POLICY).decision).toBe("auto");
    expect(evaluateAction(r, ctx({}, { lastReminderAt: "2026-11-03", remindersSent: 1 }), DEFAULT_POLICY).decision).toBe("approve");
    expect(evaluateAction(r, ctx({}, { remindersSent: 4 }), DEFAULT_POLICY).decision).toBe("block");
    expect(evaluateAction({ ...r, params: { ...r.params, additional_recipients: ["ap@x.example"] } } as ProposedAction, ctx(), DEFAULT_POLICY).decision).toBe("approve");
  });
  it("never applies automated pressure to a disputed invoice", () => {
    const r: ProposedAction = { type: "send_reminder", origin: "agent", rationale: "", params: { subject: "Quick reminder", note: "Hi Sam, a friendly reminder." } };
    expect(evaluateAction(r, ctx({ disputed: true }), DEFAULT_POLICY).decision).toBe("approve");
  });
  it("caps early-payment discounts", () => {
    const disc = (percent: number, origin: ProposedAction["origin"] = "agent"): ProposedAction => ({ type: "add_early_payment_discount", origin, rationale: "", params: { percent, expires_on: "2026-11-11" } });
    expect(evaluateAction(disc(2), ctx({ totalMinor: 550_000, amountDueMinor: 550_000 }), DEFAULT_POLICY).decision).toBe("approve");
    expect(evaluateAction(disc(10), ctx({ totalMinor: 550_000, amountDueMinor: 550_000 }), DEFAULT_POLICY).decision).toBe("block");
    expect(evaluateAction(disc(2), ctx(), { ...DEFAULT_POLICY, allowEarlyPaymentDiscount: false }).decision).toBe("block");
  });
  it("only lets the owner confirm off-PayPal payments, and never above the amount due", () => {
    const rec = (amount_minor: number, origin: ProposedAction["origin"]): ProposedAction => ({ type: "record_external_payment", origin, rationale: "", params: { amount_minor, method: "CHECK", payment_date: today } });
    expect(evaluateAction(rec(120_000, "agent"), ctx(), DEFAULT_POLICY).decision).toBe("approve");
    expect(evaluateAction(rec(120_000, "owner"), ctx(), DEFAULT_POLICY).decision).toBe("auto");
    expect(evaluateAction(rec(999_999, "owner"), ctx(), DEFAULT_POLICY).decision).toBe("block");
  });
});
