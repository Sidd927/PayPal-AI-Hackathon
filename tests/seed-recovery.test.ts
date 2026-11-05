/**
 * Resumable, idempotent sandbox seeding. Reproduces the observed partial failure (5 paid history invoices,
 * Northwind SENT, Bluebird left as a DRAFT after PayPal refused to send it to an India-based buyer) and
 * checks recovery, duplicate prevention, existing statuses, payment safety and failure reporting.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { repo } from "@/lib/db";
import { setGateway } from "@/lib/config";
import { SimulatedGateway } from "@/lib/paypal/simulated";
import { PayPalApiError } from "@/lib/paypal/client";
import type { CreateInvoiceInput, RecordPaymentInput } from "@/lib/paypal/types";
import { canRecordSeedPayment, HISTORY, planSeed, SCENARIO, type SeedInvoice, seedScenario, seedScenarioWithReport } from "@/lib/demo/scenario";
import { refreshInvoice } from "@/lib/services/invoices";
import { fromMinor } from "@/lib/money";
import { addDays, todayIso } from "@/lib/dates";
import { freshEnv } from "./helpers";

const BLOCKED = "buyer-in@personal.example"; // stands in for a sandbox Personal account registered in India
const INTL = "buyer-us@personal.example";

/** A simulated PayPal that counts writes and can refuse to send to the India-registered buyer. */
class RecordingGateway extends SimulatedGateway {
  writes = { create: 0, send: 0, update: 0, payment: 0 };
  sentIds: string[] = [];
  failSendWith: ((id: string) => Error | null) | null = null;
  async createDraftInvoice(input: CreateInvoiceInput, requestId: string) {
    this.writes.create++;
    return super.createDraftInvoice(input, requestId);
  }
  async sendInvoice(id: string, requestId: string) {
    const inv = await this.getInvoice(id);
    if (inv.primary_recipients?.[0]?.billing_info?.email_address === BLOCKED) {
      throw new PayPalApiError("PayPal API error 406 (MEDIA_TYPE_NOT_ACCEPTABLE)", 406, "MEDIA_TYPE_NOT_ACCEPTABLE", "dbg-406", [{ issue: "INR_FOREIGN_CURRENCY_BLOCKED", description: "Cannot send invoices to customers within India." }]);
    }
    const injected = this.failSendWith?.(id);
    if (injected) throw injected;
    this.writes.send++;
    this.sentIds.push(id);
    return super.sendInvoice(id, requestId);
  }
  async updateInvoice(id: string, body: Record<string, unknown>, opts: { requestId: string; sendToRecipient: boolean }) {
    this.writes.update++;
    return super.updateInvoice(id, body, opts);
  }
  async recordPayment(id: string, input: RecordPaymentInput, requestId: string) {
    this.writes.payment++;
    return super.recordPayment(id, input, requestId);
  }
  reset() {
    this.writes = { create: 0, send: 0, update: 0, payment: 0 };
    this.sentIds = [];
  }
}

const total = (s: SeedInvoice) => s.items.reduce((a, i) => a + i.amount, 0);
async function make(gw: SimulatedGateway, s: SeedInvoice, opts: { email?: string; suffix?: string } = {}) {
  const { id } = await gw.createDraftInvoice(
    {
      invoice_number: `JC-${s.number}${opts.suffix ?? "-AB12"}`,
      currency_code: "USD",
      invoicer: { business_name: "Juniper & Co. Studio" },
      recipient: { business_name: s.recipient.business, given_name: s.recipient.given, surname: s.recipient.surname, email_address: opts.email ?? s.recipient.email },
      items: s.items.map((i) => ({ name: i.name, quantity: "1", unit_amount: { currency_code: "USD", value: fromMinor(i.amount) } })),
      invoice_date: addDays(todayIso(), -s.issuedDaysAgo),
      due_date: addDays(todayIso(), s.dueInDays),
    },
    `t-${s.key}`,
  );
  return id;
}
const byKey = (k: string) => [...HISTORY, ...SCENARIO].find((s) => s.key === k)!;
const run = (gw: SimulatedGateway, payerEmail?: string, dryRun = false) => seedScenarioWithReport(gw, { payerEmail, refresh: refreshInvoice, dryRun });

/** Build exactly the state observed in the sandbox: 5 MARKED_AS_PAID, Northwind SENT, Bluebird DRAFT to the blocked buyer. */
async function observedPartialState(gw: RecordingGateway) {
  const ids: Record<string, string> = {};
  for (const s of HISTORY) {
    ids[s.key] = await make(gw, s);
    await gw.sendInvoice(ids[s.key]!, "t");
    await gw.recordPayment(ids[s.key]!, { method: s.paid!.method, payment_date: todayIso(), amount: { currency_code: "USD", value: fromMinor(total(s)) } }, "t");
  }
  ids.northwind = await make(gw, byKey("northwind"));
  await gw.sendInvoice(ids.northwind, "t");
  ids.bluebird = await make(gw, byKey("bluebird"), { email: BLOCKED });
  gw.reset();
  return ids;
}

async function numbers(gw: SimulatedGateway) {
  const { invoices } = await gw.listInvoices();
  const counts = new Map<string, number>();
  for (const i of invoices) {
    const n = /^JC-(\d{4})/.exec(i.detail.invoice_number ?? "")?.[1] ?? "?";
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return { invoices, counts };
}

let gw: RecordingGateway;
beforeEach(() => {
  freshEnv();
  gw = new RecordingGateway();
  setGateway(gw);
});

describe("recovering the observed partial failure", () => {
  it("reuses all 7 existing invoices, readdresses and sends the Bluebird draft, creates only the 6 missing ones", async () => {
    const before = await observedPartialState(gw);
    const { ids, outcomes } = await run(gw, INTL);

    const out = Object.fromEntries(outcomes.map((o) => [o.key, o]));
    for (const s of HISTORY) expect(out[s.key]).toMatchObject({ result: "skipped", invoiceId: before[s.key], status: "MARKED_AS_PAID" });
    expect(out.northwind).toMatchObject({ result: "skipped", invoiceId: before.northwind });
    expect(out.bluebird).toMatchObject({ result: "resumed", invoiceId: before.bluebird, steps: ["update-recipient", "send"], status: "SENT" });
    for (const k of ["harbor", "lumen", "atlas", "quill", "kestrel", "fernwood"]) expect(out[k]!.result).toBe("created");
    expect(outcomes.filter((o) => o.result === "failed")).toHaveLength(0);

    // Exactly the writes needed: 6 creates, 7 sends (Bluebird + 6 new), 1 readdress, no payments.
    expect(gw.writes).toEqual({ create: 6, send: 7, update: 1, payment: 0 });
    expect(gw.sentIds).not.toContain(before.northwind); // never resent

    const bluebird = await gw.getInvoice(before.bluebird!);
    expect(bluebird.primary_recipients?.[0]?.billing_info?.email_address).toBe(INTL);
    expect(ids.bluebird).toBe(before.bluebird);

    // 13 invoices, one per demo number, no duplicates.
    const { invoices, counts } = await numbers(gw);
    expect(invoices).toHaveLength(13);
    expect([...counts.values()].every((c) => c === 1)).toBe(true);
    expect(repo.listInvoices()).toHaveLength(13);
  });

  it("a second run changes nothing and doesn't duplicate local conversations", async () => {
    await observedPartialState(gw);
    await run(gw, INTL);
    const messages = repo.listInvoices().reduce((s, i) => s + repo.listMessages(i.id).length, 0);
    gw.reset();
    const { outcomes } = await run(gw, INTL);
    expect(outcomes.every((o) => o.result === "skipped")).toBe(true);
    expect(gw.writes).toEqual({ create: 0, send: 0, update: 0, payment: 0 });
    expect(repo.listInvoices().reduce((s, i) => s + repo.listMessages(i.id).length, 0)).toBe(messages);
  });

  it("dry run reports the plan and writes nothing, to PayPal or locally", async () => {
    const before = await observedPartialState(gw);
    const { outcomes } = await run(gw, INTL, true);
    expect(gw.writes).toEqual({ create: 0, send: 0, update: 0, payment: 0 });
    expect(repo.listInvoices()).toHaveLength(0);
    expect(outcomes.find((o) => o.key === "bluebird")).toMatchObject({ result: "planned", invoiceId: before.bluebird, steps: ["update-recipient", "send"] });
    expect(outcomes.filter((o) => o.result === "planned" && o.steps[0] === "create")).toHaveLength(6);
    expect(outcomes.filter((o) => o.result === "skipped")).toHaveLength(6);
  });
});

describe("failures are reported per scenario and never duplicate", () => {
  it("a recipient PayPal blocks fails that scenario only, keeps its draft, explains why, and the retry reuses the draft", async () => {
    const first = await run(gw, BLOCKED);
    const bb = first.outcomes.find((o) => o.key === "bluebird")!;
    expect(bb.result).toBe("failed");
    expect(bb.detail).toMatch(/INR_FOREIGN_CURRENCY_BLOCKED|registered in India/);
    expect(bb.detail).toMatch(/dbg-406/);
    expect(first.outcomes.filter((o) => o.result === "created")).toHaveLength(12); // everyone else continued

    gw.reset();
    const second = await run(gw, BLOCKED); // same misconfiguration again
    expect(second.outcomes.find((o) => o.key === "bluebird")).toMatchObject({ result: "failed", invoiceId: bb.invoiceId });
    expect(gw.writes.create).toBe(0);
    expect((await numbers(gw)).counts.get("1043")).toBe(1);

    gw.reset();
    const third = await run(gw, INTL); // fixed configuration
    expect(third.outcomes.find((o) => o.key === "bluebird")).toMatchObject({ result: "resumed", invoiceId: bb.invoiceId, status: "SENT" });
    expect(gw.writes).toEqual({ create: 0, send: 1, update: 1, payment: 0 });
  });

  it("a 400 on send never triggers the back-dating fallback (no second draft)", async () => {
    const harbor = byKey("harbor");
    let target = "";
    gw.failSendWith = (id) => (id === target ? new PayPalApiError("PayPal API error 400 (INVALID_REQUEST)", 400, "INVALID_REQUEST", "dbg-400", []) : null);
    const orig = gw.createDraftInvoice.bind(gw);
    gw.createDraftInvoice = async (input, rid) => {
      const r = await orig(input, rid);
      if (input.invoice_number?.startsWith(`JC-${harbor.number}`)) target = r.id;
      return r;
    };
    const { outcomes } = await run(gw);
    expect(outcomes.find((o) => o.key === "harbor")!.result).toBe("failed");
    expect((await numbers(gw)).counts.get(String(harbor.number))).toBe(1);
    await expect(seedScenario(gw, { refresh: refreshInvoice })).rejects.toThrow(/harbor/);
  });

  it("refuses to touch a number that already has two live invoices", async () => {
    await make(gw, byKey("atlas"), { suffix: "-AAAA" });
    await make(gw, byKey("atlas"), { suffix: "-BBBB" });
    gw.reset();
    const { outcomes } = await run(gw);
    expect(outcomes.find((o) => o.key === "atlas")).toMatchObject({ result: "failed" });
    expect(outcomes.find((o) => o.key === "atlas")!.detail).toMatch(/2 invoices already exist/);
    expect((await numbers(gw)).counts.get("1040")).toBe(2);
  });
});

describe("existing statuses and payment safety", () => {
  const h = () => HISTORY[0]!;

  it("history invoice sent but never marked paid: records the sandbox payment once", async () => {
    const id = await make(gw, h());
    await gw.sendInvoice(id, "t");
    gw.reset();
    const { outcomes } = await run(gw);
    expect(outcomes.find((o) => o.key === h().key)).toMatchObject({ result: "resumed", steps: ["record-payment"], status: "MARKED_AS_PAID" });
    expect(gw.writes.payment).toBe(1 + (HISTORY.length - 1)); // this one resumed + the other four created
  });

  it("history invoice partially paid: refused, nothing recorded", async () => {
    const id = await make(gw, h());
    await gw.sendInvoice(id, "t");
    await gw.recordPayment(id, { method: "BANK_TRANSFER", payment_date: todayIso(), amount: { currency_code: "USD", value: "10.00" } }, "t");
    gw.reset();
    const { outcomes } = await run(gw);
    expect(outcomes.find((o) => o.key === h().key)!.result).toBe("failed");
    expect((await gw.getInvoice(id)).payments?.transactions).toHaveLength(1);
  });

  it("never records a payment on an invoice addressed to a real (non-.example) recipient", async () => {
    const id = await make(gw, h(), { email: "someone@real-company.com" });
    await gw.sendInvoice(id, "t");
    const inv = await gw.getInvoice(id);
    expect(canRecordSeedPayment(h(), inv)).toMatch(/Refusing/);
    gw.reset();
    const { outcomes } = await run(gw);
    expect(outcomes.find((o) => o.key === h().key)!.result).toBe("failed");
    expect((await gw.getInvoice(id)).payments?.transactions ?? []).toHaveLength(0);
  });

  it("planner: sent or paid active invoices are skipped and never resent; drafts are sent; cancelled-only is left alone", async () => {
    const s = byKey("lumen");
    const base = await gw.getInvoice(await make(gw, s));
    for (const status of ["SENT", "UNPAID", "PARTIALLY_PAID", "PAID", "MARKED_AS_PAID"]) {
      const p = planSeed(s, [{ ...base, status }], undefined);
      expect(p.steps).toEqual([]);
      expect(p.fail).toBeFalsy();
    }
    expect(planSeed(s, [{ ...base, status: "DRAFT" }], undefined).steps).toEqual(["send"]);
    expect(planSeed(s, [], undefined).steps).toEqual(["create", "send"]);
    expect(planSeed(s, [{ ...base, status: "CANCELLED" }], undefined)).toMatchObject({ fail: true, steps: [] });
    // A cancelled invoice next to a live one doesn't count as a duplicate.
    expect(planSeed(s, [{ ...base, status: "CANCELLED" }, { ...base, id: "X", status: "SENT" }], undefined)).toMatchObject({ steps: [], invoiceId: "X" });
  });
});
