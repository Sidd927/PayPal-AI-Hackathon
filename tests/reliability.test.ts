/**
 * Reliability and authorisation defects found in the Phase 3 audit, one test per defect.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { repo } from "@/lib/db";
import { getGateway, setGateway } from "@/lib/config";
import { SimulatedGateway } from "@/lib/paypal/simulated";
import { seedScenario } from "@/lib/demo/scenario";
import { refreshInvoice } from "@/lib/services/invoices";
import { diagnoseInvoice } from "@/lib/services/diagnose";
import { approveAction, proposeAction } from "@/lib/services/actions";
import { approveActionInternal } from "@/lib/services/internal";
import { simulatePayment } from "@/lib/services/payer";
import { boardSnapshot } from "@/lib/services/board";
import { DEFAULT_POLICY } from "@/lib/policy";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";
import { freshEnv } from "./helpers";

let ids: Record<string, string>;
beforeEach(async () => {
  freshEnv();
  setGateway(new SimulatedGateway());
  ids = await seedScenario(getGateway(), { refresh: refreshInvoice });
});

describe("stale approvals (P1)", () => {
  it("an approval is refused when the invoice was paid after the action was proposed", async () => {
    await diagnoseInvoice(ids.atlas!);
    const a = repo.listActions({ invoiceId: ids.atlas!, status: "proposed" })[0]!;
    expect(a.type).toBe("record_external_payment");
    // The client pays through PayPal before the owner gets round to approving.
    await simulatePayment(repo.getInvoice(ids.atlas!)!, repo.getInvoice(ids.atlas!)!.due_minor);
    const done = await approveAction(a.id);
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/re-checked.*blocked/i);
    const inv = await getGateway().getInvoice(ids.atlas!);
    // Exactly one payment: the payer's. The stale "record check" never reached PayPal.
    expect(inv.payments?.transactions).toHaveLength(1);
  });

  it("an automatic action that needs approval by the time it runs goes back to the owner", async () => {
    const proposed = await proposeAction(
      ids.lumen!,
      { type: "send_reminder", origin: "agent", rationale: "test", params: { subject: "Friendly reminder", note: "Hi, a quick reminder." } } as never,
      { executeIfAuto: false },
    );
    expect(proposed.decision).toBe("auto");
    repo.setPolicy({ ...DEFAULT_POLICY, autoSendReminders: false }); // owner tightens the rules in between
    await approveActionInternal(proposed.id);
    const after = repo.getAction(proposed.id)!;
    expect(after.status).toBe("proposed");
    expect(after.decision).toBe("approve");
    expect(repo.listEvents({ limit: 50 }).some((e) => e.kind === "reminder_sent" && e.invoice_id === ids.lumen)).toBe(false);
  });

  it("owner approval never overrides a block (owner turned discounts off after the proposal)", async () => {
    const { addDays, todayIso } = await import("@/lib/dates");
    const proposed = await proposeAction(
      ids.fernwood!,
      { type: "add_early_payment_discount", origin: "agent", rationale: "test", params: { percent: 2, expires_on: addDays(todayIso(), 7) } } as never,
      { executeIfAuto: false },
    );
    expect(proposed.status).toBe("proposed");
    repo.setPolicy({ ...DEFAULT_POLICY, allowEarlyPaymentDiscount: false });
    const done = await approveAction(proposed.id);
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/re-checked/);
    const inv = await getGateway().getInvoice(ids.fernwood!);
    expect((inv as { x_sim?: { rules?: unknown[] } }).x_sim?.rules ?? []).toHaveLength(0);
  });
});

describe("duplicate execution (P1)", () => {
  it("concurrent approvals of the same action execute it once", async () => {
    await diagnoseInvoice(ids.northwind!);
    const a = repo.listActions({ invoiceId: ids.northwind!, status: "proposed" })[0]!;
    const results = await Promise.allSettled([approveAction(a.id), approveAction(a.id), approveAction(a.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(repo.listEvents({ limit: 200 }).filter((e) => e.kind === "action_executed" && JSON.parse(e.data_json ?? "{}").action_id === a.id)).toHaveLength(1);
  });
});

describe("business outcomes (P2)", () => {
  it("promises and payment plans are never counted as collected money", async () => {
    await diagnoseInvoice(ids.bluebird!);
    const before = boardSnapshot().kpis.cashUnstuckMinor;
    repo.logEvent({ invoice_id: ids.bluebird!, kind: "promise_to_pay", actor: "payer", summary: "Promise", data: { date: "2099-01-01" } });
    expect(boardSnapshot().kpis.cashUnstuckMinor).toBe(before);
  });

  it("KPIs never add amounts across currencies", async () => {
    const snap = boardSnapshot();
    expect(snap.kpis.currency).toBe("USD");
    const { payer_token: _t, first_seen_at: _f, disputed: _d, ...base } = repo.getInvoice(ids.fernwood!)!;
    const eur = { ...base, id: "INV-EUR-1", currency: "EUR", due_minor: 999_999, total_minor: 999_999 };
    repo.upsertInvoice(eur as never);
    const after = boardSnapshot();
    expect(after.kpis.outstandingMinor).toBe(snap.kpis.outstandingMinor);
    expect(after.kpis.excludedOtherCurrency).toBe(1);
  });
});

describe("owner console auth (P1)", () => {
  const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(`https://unstuck.example${path}`, { headers });
  const env = (vars: Record<string, string | undefined>) => {
    const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(vars)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
    return () => {
      for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
    };
  };

  it("fails closed in production when real PayPal credentials are set and no owner password is", () => {
    const restore = env({ NODE_ENV: "production", PAYPAL_CLIENT_ID: "x", PAYPAL_CLIENT_SECRET: "y", OWNER_BASIC_AUTH: undefined, UNSTUCK_MODE: undefined });
    try {
      expect(proxy(req("/api/actions/act_1/approve")).status).toBe(503);
      expect(proxy(req("/")).status).toBe(503);
    } finally {
      restore();
    }
  });

  it("requires the exact password when one is set, and the agent token only opens /api/agent/run", () => {
    const restore = env({ OWNER_BASIC_AUTH: "maya:s3cret", AGENT_RUN_TOKEN: "tok_123" });
    try {
      const basic = (s: string) => ({ authorization: `Basic ${btoa(s)}` });
      expect(proxy(req("/api/board")).status).toBe(401);
      expect(proxy(req("/api/board", basic("maya:wrong"))).status).toBe(401);
      expect(proxy(req("/api/board", basic("maya:s3cret"))).status).toBe(200);
      expect(proxy(req("/api/agent/run", { authorization: "Bearer tok_123" })).status).toBe(200);
      expect(proxy(req("/api/actions/act_1/approve", { authorization: "Bearer tok_123" })).status).toBe(401);
      expect(proxy(req("/api/agent/run", { authorization: "Bearer tok_12" })).status).toBe(401);
    } finally {
      restore();
    }
  });
});

describe("sandbox-only guard (P1)", () => {
  const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
    const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(vars)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
      setGateway(new SimulatedGateway());
    }
  };
  const live = { UNSTUCK_MODE: undefined, PAYPAL_CLIENT_ID: "guard-test-id", PAYPAL_CLIENT_SECRET: "guard-test-secret" };

  it("refuses PAYPAL_ENV=live", () => {
    withEnv({ ...live, PAYPAL_ENV: "live", PAYPAL_API_BASE: undefined }, () => {
      setGateway(null as never);
      expect(() => getGateway()).toThrow(/only runs against the PayPal sandbox/);
    });
  });

  it("refuses a production PayPal host smuggled in through PAYPAL_API_BASE", () => {
    withEnv({ ...live, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE: "https://api-m.paypal.com" }, () => {
      setGateway(null as never);
      expect(() => getGateway()).toThrow(/production PayPal host/);
    });
  });

  it("allows the sandbox host and local mocks", () => {
    for (const base of ["https://api-m.sandbox.paypal.com", "http://127.0.0.1:4010"]) {
      withEnv({ ...live, PAYPAL_ENV: "sandbox", PAYPAL_API_BASE: base }, () => {
        setGateway(null as never);
        expect(getGateway().mode).toBe("live");
      });
    }
  });
});
