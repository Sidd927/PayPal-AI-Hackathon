import { beforeEach, describe, expect, it } from "vitest";
import { repo } from "@/lib/db";
import { getGateway, setGateway } from "@/lib/config";
import { SimulatedGateway } from "@/lib/paypal/simulated";
import { seedScenario } from "@/lib/demo/scenario";
import { refreshInvoice } from "@/lib/services/invoices";
import { runAgent, runView } from "@/lib/services/agent";
import { boardSnapshot } from "@/lib/services/board";
import { payerAcceptOffer, payerSendMessage } from "@/lib/services/payer";
import { scoreRisk } from "@/lib/risk";
import { addDays, todayIso } from "@/lib/dates";
import { freshEnv } from "./helpers";

const base = {
  open: true,
  daysOverdue: 0,
  dueMinor: 100_000,
  reason: null,
  remindersSent: 0,
  hasClientReply: false,
  history: { previous_invoices: 3, paid_on_time: 3, paid_late: 0, average_days_late: null },
  plan: null,
  promiseUntil: null,
  today: "2026-11-04",
} as const;

describe("risk heuristic", () => {
  it("is explainable: score equals the sum of its factors (clamped)", () => {
    const r = scoreRisk({ ...base, daysOverdue: 21, reason: "dispute", dueMinor: 265_000, history: { previous_invoices: 0, paid_on_time: 0, paid_late: 0, average_days_late: null } });
    expect(r.score).toBe(Math.min(100, r.factors.reduce((s, f) => s + f.points, 0)));
    expect(r.band).toBe("high");
    expect(r.factors.map((f) => f.label)).toContain("Stuck reason: dispute");
  });
  it("rewards good history and on-track plans", () => {
    expect(scoreRisk({ ...base, daysOverdue: 5, reason: "forgot" }).band).toBe("low");
    const plan = scoreRisk({ ...base, daysOverdue: 9, reason: "cash_flow", plan: { onTrack: true } });
    const noPlan = scoreRisk({ ...base, daysOverdue: 9, reason: "cash_flow" });
    expect(plan.score).toBeLessThan(noPlan.score);
  });
  it("penalises missed promises and silence after reminders", () => {
    const missed = scoreRisk({ ...base, daysOverdue: 10, promiseUntil: "2026-11-01" });
    const kept = scoreRisk({ ...base, daysOverdue: 10, promiseUntil: "2026-11-10" });
    expect(missed.score).toBeGreaterThan(kept.score);
    expect(scoreRisk({ ...base, daysOverdue: 30, remindersSent: 3 }).factors.some((f) => /no reply/.test(f.label))).toBe(true);
  });
  it("settled invoices carry no risk", () => {
    expect(scoreRisk({ ...base, open: false }).score).toBe(0);
  });
});

describe("agent run (simulation, rules-only)", () => {
  let ids: Record<string, string>;
  beforeEach(async () => {
    freshEnv();
    setGateway(new SimulatedGateway());
    ids = await seedScenario(getGateway(), { refresh: refreshInvoice });
  });

  it("syncs, prioritises by risk, diagnoses, routes through policy and records an observable trace", async () => {
    const topBefore = boardSnapshot().rows.filter((x) => x.open).sort((a, b) => b.risk.score - a.risk.score)[0]!;
    const r = await runAgent("manual");
    expect(r.alreadyRunning).toBe(false);
    const run = runView(r.runId)!;
    expect(run.status).toBe("completed");
    const kinds = run.steps.map((s) => s.kind);
    expect(kinds[0]).toBe("sync");
    expect(kinds).toContain("prioritise");
    for (const k of ["gather", "diagnose", "plan", "policy", "act"]) expect(kinds).toContain(k);
    expect(kinds.at(-1)).toBe("done");
    expect(run.summary).toMatchObject({ invoices: 7, diagnosed: 7, autoExecuted: expect.any(Number), awaitingApproval: expect.any(Number) });
    expect(run.summary!.autoExecuted).toBeGreaterThanOrEqual(1); // Lumen's reminder
    // Highest-risk invoice is handled first.
    const firstInvoiceStep = run.steps.find((s) => s.invoice_id);
    expect(firstInvoiceStep!.invoice_id).toBe(topBefore.id);
  });

  it("a second run skips unchanged invoices instead of re-calling the model", async () => {
    await runAgent("manual");
    const again = runView((await runAgent("manual")).runId)!;
    expect(again.summary!.diagnosed).toBeLessThan(7);
    expect(again.summary!.unchanged).toBeGreaterThan(0);
  });

  it("follows up on a plan installment that is due, via a policy-gated PayPal reminder", async () => {
    const row = repo.getInvoice(ids.bluebird!)!;
    const turn = await payerSendMessage(row, "Can I split this into payments?");
    await payerAcceptOffer(row, turn.offerIds.at(-1)!);
    const run = runView((await runAgent("manual")).runId)!;
    const step = run.steps.find((s) => s.kind === "follow_up" && s.invoice_id === ids.bluebird);
    expect(step?.label).toMatch(/installment 1 reminder (sent via PayPal|waiting)/);
    expect(run.steps.some((s) => s.kind === "diagnose" && s.invoice_id === ids.bluebird)).toBe(false); // plan is the remedy
  });

  it("treats a missed promise to pay as new information and re-diagnoses", async () => {
    await runAgent("manual");
    repo.logEvent({ invoice_id: ids.atlas!, kind: "promise_to_pay", actor: "client", summary: "promise", data: { date: addDays(todayIso(), -2), note: "" } });
    const run = runView((await runAgent("manual")).runId)!;
    expect(run.steps.some((s) => s.invoice_id === ids.atlas && /promise to pay .* was missed/.test(s.label))).toBe(true);
    expect(run.steps.some((s) => s.invoice_id === ids.atlas && s.kind === "diagnose" && s.status !== "skip")).toBe(true);
  });

  it("builds a 30-day outlook from bases, not invented probabilities", async () => {
    await runAgent("manual");
    const o = boardSnapshot().outlook;
    expect(o.inTransitMinor).toBe(390_000); // Atlas says its cheque is in the post
    expect(o.atRiskMinor).toBeGreaterThan(0); // the dispute
    expect(o.weeks.reduce((s, w) => s + w.committedMinor + w.dueMinor, 0)).toBe(o.committedMinor + o.dueMinor);
  });

  it("stores diagnosis v2 fields (inference, outcome, risks, alternatives)", async () => {
    await runAgent("manual");
    const rec = JSON.parse(repo.latestDiagnosis(ids.harbor!)!.recommendation_json);
    expect(rec).toHaveProperty("inference");
    expect(rec.expected_outcome.length).toBeGreaterThan(0);
    expect(Array.isArray(rec.risks)).toBe(true);
    expect(rec.alternatives[0].action).toBe("pause_reminders");
  });
});
