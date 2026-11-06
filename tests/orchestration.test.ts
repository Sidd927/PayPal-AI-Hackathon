/**
 * Orchestration integrity under concurrency: the agent run, "Diagnose all", "Diagnose again" and approvals can
 * overlap in a live demo. These tests reproduce the duplicate-reminder race found in the final audit (two
 * overlapping diagnoses of one invoice both auto-sent a reminder) and lock in the fix. Simulated PayPal; no network.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGateway, setGateway } from "@/lib/config";
import { repo } from "@/lib/db";
import { SimulatedGateway } from "@/lib/paypal/simulated";
import { seedScenario } from "@/lib/demo/scenario";
import { refreshInvoice } from "@/lib/services/invoices";
import { diagnoseAll, diagnoseInvoice } from "@/lib/services/diagnose";
import { approveAction, proposeAction } from "@/lib/services/actions";
import { payerAcceptOffer, payerSendMessage } from "@/lib/services/payer";
import { runAgent } from "@/lib/services/agent";
import { setGeminiClient, type GeminiClientLike } from "@/lib/ai/providers/gemini";
import { activeLocks, withLock } from "@/lib/locks";
import { fakeFetch, freshEnv } from "./helpers";
import { LivePayPalGateway } from "@/lib/paypal/gateway";
import { PayPalClient } from "@/lib/paypal/client";

let ids: Record<string, string>;
beforeEach(async () => {
  freshEnv();
  setGateway(new SimulatedGateway());
  ids = await seedScenario(getGateway(), { refresh: refreshInvoice });
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MAX_RPM;
  setGeminiClient(null);
});

const executed = (invoiceId: string, type: string) => repo.listActions({ invoiceId }).filter((a) => a.type === type && a.status === "executed");

describe("no duplicate actions from overlapping work on one invoice", () => {
  it("two overlapping forced diagnoses send one reminder; the second needs approval (reminder cadence)", async () => {
    for (const k of ["lumen", "kestrel"]) {
      await Promise.all([diagnoseInvoice(ids[k]!, { force: true }), diagnoseInvoice(ids[k]!, { force: true })]);
      expect(executed(ids[k]!, "send_reminder")).toHaveLength(1);
      const reminders = repo.listActions({ invoiceId: ids[k]! }).filter((a) => a.type === "send_reminder");
      expect(reminders.filter((a) => a.status === "proposed" && a.decision === "approve")).toHaveLength(1);
    }
  });

  it("an agent run overlapping 'Diagnose all' executes each automatic action at most once per invoice", async () => {
    await Promise.all([runAgent("manual"), diagnoseAll({ force: true })]);
    for (const inv of repo.listInvoices()) {
      expect(executed(inv.id, "send_reminder").length).toBeLessThanOrEqual(1);
    }
    expect(activeLocks()).toBe(0); // nothing left held
  });

  it("a second, non-forced caller waits and reuses the first one's AI diagnosis: one Gemini call", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_MAX_RPM = "600000";
    let calls = 0;
    const answer = {
      reason: "missing_info", confidence: 0.9, summary: "Missing PO.", evidence: [{ source: "client_message", quote: "It's PO-88412." }],
      extracted: { po_number: "PO-88412", new_contact_email: null, promised_date: null, proposed_first_payment: null, disputed_item: null },
      inference: "None", recommended_action: "update_reference", rationale: "Needs the PO.", expected_outcome: "Paid next run.", risks: [], alternatives: [],
      message: { subject: "PO added", body: "Added." }, plan: null, discount_percent: null, tone: "warm",
    };
    const client: GeminiClientLike = {
      models: {
        generateContent: async () => {
          calls++;
          await new Promise((r) => setTimeout(r, 20)); // slow enough to overlap
          return { responseId: `r${calls}`, candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(answer) }] } }] };
        },
        get: async () => ({}),
      },
    };
    setGeminiClient(client);
    const [a, b] = await Promise.all([diagnoseInvoice(ids.northwind!), diagnoseInvoice(ids.northwind!)]);
    expect(calls).toBe(1);
    expect([a.skipped, b.skipped].sort()).toEqual([false, true]);
    expect(repo.listEvents({ invoiceId: ids.northwind!, limit: 50 }).filter((e) => e.kind === "diagnosed")).toHaveLength(1);
  });

  it("approving the same action twice at once executes it once; the second approval is refused", async () => {
    await diagnoseInvoice(ids.northwind!);
    const pending = repo.listActions({ invoiceId: ids.northwind! }).find((a) => a.status === "proposed" && a.decision === "approve")!;
    const results = await Promise.allSettled([approveAction(pending.id), approveAction(pending.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.objectContaining({ message: expect.stringMatching(/already decided|Action is (approved|executing|executed)/) }) });
    expect(executed(ids.northwind!, pending.type)).toHaveLength(1);
  });
});

describe("outcome wording never overstates what happened", () => {
  it("in simulation, executed actions and Activity say PayPal was not called; nothing claims delivery", async () => {
    await diagnoseInvoice(ids.lumen!, { force: true });
    const sent = executed(ids.lumen!, "send_reminder")[0]!;
    expect(JSON.parse(sent.result_json!).summary).toBe("Reminder recorded (simulation: PayPal was not called)");
    const events = repo.listEvents({ invoiceId: ids.lumen!, limit: 50 });
    expect(events.find((e) => e.kind === "reminder_sent")!.summary).toMatch(/^Reminder recorded in the simulation: .* \(PayPal was not called\)$/);
    for (const e of events) expect(e.summary).not.toMatch(/delivered|sent via PayPal|sent through PayPal/);
  });
});

describe("simulation outcomes never describe a PayPal action", () => {
  it("after a full agent run and a client plan, no simulated outcome says something happened in or by PayPal", async () => {
    await runAgent("manual");
    const bluebird = repo.getInvoice(ids.bluebird!)!;
    const turn = await payerSendMessage(bluebird, "Can I split this up?");
    await payerAcceptOffer(bluebird, turn.offerIds.at(-1)!);
    const executedActions = repo.listInvoices().flatMap((i) => repo.listActions({ invoiceId: i.id })).filter((a) => a.status === "executed");
    expect(executedActions.length).toBeGreaterThan(3);
    const texts = [...executedActions.map((a) => JSON.parse(a.result_json!).summary as string), ...repo.listEvents({ limit: 500 }).map((e) => e.summary)];
    for (const t of texts) expect(t).not.toMatch(/\b(in|by|via|through) PayPal\b|delivered/);
    const touchedPayPal = executedActions.filter((a) => JSON.parse(a.result_json!).receipts?.length);
    for (const a of touchedPayPal) expect(JSON.parse(a.result_json!).summary).toMatch(/\(simulation: PayPal was not called\)$/);
  });
});

describe("live outcome wording: accepted vs confirmed (fake PayPal, no network)", () => {
  function liveFake(opts: { applyReference: boolean }) {
    let inv: Record<string, any> = {
      id: "INV2-LIVE2",
      status: "SENT",
      detail: { currency_code: "USD", invoice_number: "JC-2", payment_term: { due_date: "2026-10-01" }, metadata: {} },
      primary_recipients: [{ billing_info: { email_address: "c@example.com", business_name: "Client" } }],
      items: [{ name: "Work", quantity: "1", unit_amount: { currency_code: "USD", value: "100.00" } }],
      amount: { currency_code: "USD", value: "100.00" },
      due_amount: { currency_code: "USD", value: "100.00" },
    };
    const f = fakeFetch((r) => {
      if (r.url.pathname === "/v1/oauth2/token") return { status: 200, body: { access_token: "t", expires_in: 3600 } };
      if (r.url.pathname === "/v2/invoicing/invoices/INV2-LIVE2" && r.method === "GET") return { status: 200, body: inv };
      if (r.url.pathname === "/v2/invoicing/invoices/INV2-LIVE2" && r.method === "PUT") {
        const b = r.body as Record<string, any>;
        if (opts.applyReference) inv = { ...inv, detail: { ...inv.detail, reference: b.detail.reference } };
        return { status: 200, body: inv };
      }
      if (r.url.pathname === "/v2/invoicing/invoices/INV2-LIVE2/cancel-reminders") return { status: 204 };
      return { status: 404, body: {} };
    });
    return new LivePayPalGateway(new PayPalClient({ clientId: "i", clientSecret: "s", baseUrl: "https://api-m.sandbox.paypal.com", fetchImpl: f.impl }), "sandbox", "WH-1");
  }
  const run = async (applyReference: boolean, type: "update_reference" | "pause_reminders") => {
    setGateway(liveFake({ applyReference }));
    await refreshInvoice("INV2-LIVE2");
    const a = await proposeAction("INV2-LIVE2", { type, origin: "owner", rationale: "test", params: type === "update_reference" ? { reference: "PO-9" } : {} } as never);
    expect(a.status).toBe("executed");
    return JSON.parse(repo.getAction(a.id)!.result_json!) as { summary: string; verified: boolean | null };
  };

  it("a change PayPal applied is reported as confirmed by the re-read", async () => {
    const r = await run(true, "update_reference");
    expect(r.verified).toBe(true);
    expect(r.summary).toBe("Reference set to PO-9; PayPal accepted the update and re-sending the invoice (confirmed by re-reading the invoice from PayPal)");
  });

  it("a 2xx that didn't take effect is reported as accepted, not done", async () => {
    const r = await run(false, "update_reference");
    expect(r.verified).toBe(false);
    expect(r.summary).toMatch(/^PayPal accepted the request, but the re-read invoice doesn't show it yet: Reference set to PO-9/);
  });

  it("an action the invoice can't show (pausing PayPal's reminders) is reported only as accepted", async () => {
    const r = await run(true, "pause_reminders");
    expect(r.verified).toBeNull();
    expect(r.summary).toBe("PayPal accepted the request to pause its automatic reminders");
    expect(r.summary).not.toMatch(/simulation|confirmed/);
  });
});

describe("keyed lock", () => {
  it("runs holders of one key in order, never blocks other keys, and survives a failing holder", async () => {
    const order: string[] = [];
    const slow = (tag: string, ms: number) => async () => {
      order.push(`${tag}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${tag}:end`);
    };
    const failing = withLock("k", async () => {
      throw new Error("boom");
    });
    await Promise.all([failing.catch(() => {}), withLock("k", slow("a", 15)), withLock("k", slow("b", 1)), withLock("other", slow("x", 1))]);
    expect(order.indexOf("a:end")).toBeLessThan(order.indexOf("b:start")); // same key: sequential
    expect(order.indexOf("x:end")).toBeLessThan(order.indexOf("a:end")); // other key: not blocked
    expect(activeLocks()).toBe(0);
  });
});
