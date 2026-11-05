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
  const invoices = await gw.listAllInvoices(); // every status, drafts included
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

/* ------------------------------------------------------------------ */
/* Regression: the real sandbox dry run planned to re-create Bluebird.  */
/* LivePayPalGateway.listInvoices() drops DRAFTs (board sync), and the  */
/* discovery used it, so JC-1043-KH5S was never seen.                   */
/* ------------------------------------------------------------------ */
import { PayPalClient } from "@/lib/paypal/client";
import { LivePayPalGateway } from "@/lib/paypal/gateway";
import { fakeFetch } from "./helpers";

const BASE = "https://api-m.sandbox.paypal.com";
const IN_BUYER = "india-buyer@personal.example"; // placeholder for the owner's India-registered sandbox buyer

/** The seven invoices `npm run check:sandbox` reported on 2026-11-05, in PayPal's list order. */
const OBSERVED = [
  { number: "JC-1043-KH5S", status: "DRAFT", id: "INV2-WGM3-AQMX-YL5E-ZC96", key: "bluebird", email: IN_BUYER },
  { number: "JC-1041-KECL", status: "SENT", id: "INV2-S9BV-FQEK-3KDP-CGK6", key: "northwind" },
  { number: "JC-1025-KAGC", status: "MARKED_AS_PAID", id: "INV2-67DQ-YFU6-YKEQ-VFTP", key: "bluebird-h1" },
  { number: "JC-1027-K74I", status: "MARKED_AS_PAID", id: "INV2-RSTZ-ZDQ8-NPMT-YEQZ", key: "northwind-h1" },
  { number: "JC-1030-K3PS", status: "MARKED_AS_PAID", id: "INV2-3CQ6-AU3Q-GQMA-RBVF", key: "lumen-h3" },
  { number: "JC-1021-JZWH", status: "MARKED_AS_PAID", id: "INV2-PKL3-UTKV-B6WX-HCNL", key: "lumen-h2" },
  { number: "JC-1012-JV1Q", status: "MARKED_AS_PAID", id: "INV2-DLS5-XXY2-LR8F-7H8S", key: "lumen-h1" },
];

function fullInvoice(o: (typeof OBSERVED)[number]) {
  const s = byKey(o.key);
  const value = fromMinor(total(s));
  return {
    id: o.id,
    status: o.status,
    detail: { invoice_number: o.number, currency_code: "USD" },
    primary_recipients: [{ billing_info: { business_name: s.recipient.business, email_address: o.email ?? s.recipient.email } }],
    amount: { currency_code: "USD", value },
    payments: { paid_amount: { currency_code: "USD", value: o.status === "MARKED_AS_PAID" ? value : "0.00" } },
  };
}

/** A read-only fake of the sandbox: serves the list (paged) and details; any other request is recorded and refused. */
function observedSandbox(opts: { pageSize?: number; totalItemsOverride?: number } = {}) {
  return fakeFetch((r) => {
    if (r.url.pathname === "/v1/oauth2/token") return { status: 200, body: { access_token: "T", token_type: "Bearer", expires_in: 3600 } };
    if (r.method === "GET" && r.url.pathname === "/v2/invoicing/invoices") {
      const size = opts.pageSize ?? Number(r.url.searchParams.get("page_size") ?? 20);
      const page = Number(r.url.searchParams.get("page") ?? 1);
      // PayPal's list entries are abbreviated: no recipient, no payments.
      const items = OBSERVED.slice((page - 1) * size, page * size).map((o) => ({ id: o.id, status: o.status, detail: { invoice_number: o.number, currency_code: "USD" } }));
      return { status: 200, body: { items, total_items: opts.totalItemsOverride ?? OBSERVED.length, total_pages: Math.ceil(OBSERVED.length / size) } };
    }
    const m = /^\/v2\/invoicing\/invoices\/([^/]+)$/.exec(r.url.pathname);
    if (r.method === "GET" && m) {
      const o = OBSERVED.find((x) => x.id === decodeURIComponent(m[1]!));
      return o ? { status: 200, body: fullInvoice(o) } : { status: 404, body: { name: "RESOURCE_NOT_FOUND" } };
    }
    return { status: 500, body: { name: "WRITE_NOT_ALLOWED_IN_THIS_TEST" } };
  });
}
const liveGateway = (f: ReturnType<typeof fakeFetch>) => new LivePayPalGateway(new PayPalClient({ clientId: "id", clientSecret: "secret", baseUrl: BASE, fetchImpl: f.impl }), "sandbox", undefined);
const writesIn = (f: ReturnType<typeof fakeFetch>) => f.calls.filter((c) => c.method !== "GET" && c.url.pathname !== "/v1/oauth2/token");

describe("regression: discovery sees the existing Bluebird draft (JC-1043-KH5S)", () => {
  it("the board-sync listing drops DRAFTs, which is why discovery must not use it", async () => {
    const f = observedSandbox();
    const gw2 = liveGateway(f);
    expect((await gw2.listInvoices()).invoices.map((i) => i.id)).not.toContain("INV2-WGM3-AQMX-YL5E-ZC96");
    expect((await gw2.listAllInvoices()).map((i) => i.id)).toContain("INV2-WGM3-AQMX-YL5E-ZC96");
    expect(writesIn(f)).toHaveLength(0);
  });

  it("dry run against the observed sandbox resumes the draft and creates only the six missing invoices", async () => {
    const f = observedSandbox();
    const lines: string[] = [];
    const { outcomes } = await seedScenarioWithReport(liveGateway(f), { payerEmail: INTL, refresh: refreshInvoice, dryRun: true, log: (l) => lines.push(l) });
    const out = Object.fromEntries(outcomes.map((o) => [o.key, o]));

    expect(out.bluebird).toMatchObject({ result: "planned", invoiceId: "INV2-WGM3-AQMX-YL5E-ZC96", status: "DRAFT", steps: ["update-recipient", "send"] });
    expect(lines.find((l) => l.includes("bluebird (JC-1043)"))).toContain("INV2-WGM3-AQMX-YL5E-ZC96: update-recipient → send");
    for (const o of OBSERVED.filter((x) => x.key !== "bluebird")) expect(out[o.key]).toMatchObject({ result: "skipped", invoiceId: o.id, steps: [] });
    const creates = outcomes.filter((o) => o.steps[0] === "create").map((o) => o.key);
    expect(creates.sort()).toEqual(["atlas", "fernwood", "harbor", "kestrel", "lumen", "quill"]);
    expect(outcomes.filter((o) => o.result === "failed")).toHaveLength(0);
    expect(writesIn(f)).toHaveLength(0); // read-only: list + get only
  });

  it("without DEMO_PAYER_EMAIL the draft is readdressed to the fictional address; with the same India buyer it would only retry the send", async () => {
    const a = await seedScenarioWithReport(liveGateway(observedSandbox()), { refresh: refreshInvoice, dryRun: true });
    expect(a.outcomes.find((o) => o.key === "bluebird")).toMatchObject({ invoiceId: "INV2-WGM3-AQMX-YL5E-ZC96", steps: ["update-recipient", "send"] });
    expect(a.outcomes.find((o) => o.key === "bluebird")!.detail).toContain("priya@bluebirdcafe.example");
    const b = await seedScenarioWithReport(liveGateway(observedSandbox()), { payerEmail: IN_BUYER, refresh: refreshInvoice, dryRun: true });
    expect(b.outcomes.find((o) => o.key === "bluebird")).toMatchObject({ invoiceId: "INV2-WGM3-AQMX-YL5E-ZC96", steps: ["send"] });
  });

  it("follows every page (the draft on a later page is still found)", async () => {
    const f = observedSandbox({ pageSize: 3 }); // forces 3 pages; the fake ignores the requested page_size
    const { outcomes } = await seedScenarioWithReport(liveGateway(f), { payerEmail: INTL, refresh: refreshInvoice, dryRun: true });
    expect(f.calls.filter((c) => c.url.pathname === "/v2/invoicing/invoices").length).toBe(3);
    expect(outcomes.filter((o) => o.result === "skipped")).toHaveLength(6);
    expect(outcomes.find((o) => o.key === "bluebird")!.invoiceId).toBe("INV2-WGM3-AQMX-YL5E-ZC96");
  });

  it("refuses to plan anything if the listing is incomplete", async () => {
    const f = observedSandbox({ totalItemsOverride: 9 });
    await expect(seedScenarioWithReport(liveGateway(f), { payerEmail: INTL, refresh: refreshInvoice, dryRun: true })).rejects.toThrow(/incomplete list/);
    expect(writesIn(f)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Review of the real draft update: request shape, ordering, retries,   */
/* and guards, through the live gateway against a stateful fake PayPal. */
/* ------------------------------------------------------------------ */
const BLUEBIRD_ID = "INV2-WGM3-AQMX-YL5E-ZC96";

/** A realistic GET representation of the existing Bluebird DRAFT (richer than what the seeder set). */
function bluebirdDraft() {
  return {
    id: BLUEBIRD_ID,
    status: "DRAFT",
    detail: {
      invoice_number: "JC-1043-KH5S",
      currency_code: "USD",
      note: "Thank you for working with Juniper & Co. Studio.",
      memo: "private memo",
      invoice_date: "2026-09-27",
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: "2026-10-27" },
      metadata: { create_time: "2026-11-05T10:00:00Z", created_by: "sb-merchant", last_update_time: "2026-11-05T10:00:00Z", invoicer_view_url: "https://www.sandbox.paypal.com/invoice/details/x" },
    },
    invoicer: { business_name: "Juniper & Co. Studio", email_address: "sb-merchant@business.example", name: { given_name: "Maya", surname: "Okafor" } },
    primary_recipients: [
      {
        billing_info: { business_name: "Bluebird Café", name: { given_name: "Priya", surname: "Shah", full_name: "Priya Shah" }, email_address: IN_BUYER, language: "en_US" },
        shipping_info: { name: { given_name: "Priya", surname: "Shah" } },
      },
    ],
    items: [
      { name: "Menu redesign (3 menus)", description: "Breakfast, lunch and dinner menus", quantity: "1", unit_amount: { currency_code: "USD", value: "850.00" }, unit_of_measure: "AMOUNT", tax: { name: "Sales tax", percent: "0" } },
      { name: "Window signage artwork", quantity: "1", unit_amount: { currency_code: "USD", value: "350.00" }, unit_of_measure: "AMOUNT" },
    ],
    configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false }, tax_calculated_after_discount: true, tax_inclusive: false },
    amount: { currency_code: "USD", value: "1200.00", breakdown: { item_total: { currency_code: "USD", value: "1200.00" }, tax_total: { currency_code: "USD", value: "0.00" } } },
    due_amount: { currency_code: "USD", value: "1200.00" },
    links: [{ href: `${BASE}/v2/invoicing/invoices/${BLUEBIRD_ID}`, rel: "self", method: "GET" }],
  };
}

type FakeOpts = { putStatus?: number; ignoreRecipientChange?: boolean; bluebirdOverride?: Record<string, unknown> };
/** Stateful fake: the six other observed invoices, the Bluebird draft, create/send for new ones. Records everything. */
function statefulSandbox(opts: FakeOpts = {}) {
  const store = new Map<string, Record<string, unknown>>();
  for (const o of OBSERVED.filter((x) => x.key !== "bluebird")) store.set(o.id, fullInvoice(o) as unknown as Record<string, unknown>);
  store.set(BLUEBIRD_ID, { ...bluebirdDraft(), ...(opts.bluebirdOverride ?? {}) });
  let seq = 0;
  const f = fakeFetch((r) => {
    const p = r.url.pathname;
    if (p === "/v1/oauth2/token") return { status: 200, body: { access_token: "T", token_type: "Bearer", expires_in: 3600 } };
    if (r.method === "GET" && p === "/v2/invoicing/invoices") {
      const items = [...store.values()].map((i) => ({ id: i.id, status: i.status, detail: { invoice_number: (i.detail as { invoice_number: string }).invoice_number, currency_code: "USD" } }));
      return { status: 200, body: { items, total_items: items.length, total_pages: 1 } };
    }
    if (r.method === "POST" && p === "/v2/invoicing/invoices") {
      const id = `INV2-NEW-${++seq}`;
      const b = r.body as Record<string, unknown>;
      store.set(id, { ...b, id, status: "DRAFT" });
      return { status: 201, body: { id } };
    }
    const m = /^\/v2\/invoicing\/invoices\/([^/]+)(\/[a-z-]+)?$/.exec(p);
    const inv = m ? store.get(decodeURIComponent(m[1]!)) : undefined;
    if (!m || !inv) return { status: 404, body: { name: "RESOURCE_NOT_FOUND" } };
    if (r.method === "GET" && !m[2]) return { status: 200, body: inv };
    if (r.method === "PUT" && !m[2]) {
      if (opts.putStatus) return { status: opts.putStatus, body: { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "TEST_FAILURE" }] } };
      const b = r.body as Record<string, unknown>;
      const next: Record<string, unknown> = { ...b, id: inv.id, status: inv.status, links: inv.links, detail: { ...(b.detail as object), metadata: (inv.detail as { metadata?: unknown }).metadata } };
      if (opts.ignoreRecipientChange) next.primary_recipients = inv.primary_recipients;
      store.set(inv.id as string, next);
      return { status: 200, body: next };
    }
    if (r.method === "POST" && m[2] === "/send") {
      const email = (inv.primary_recipients as { billing_info: { email_address: string } }[])[0]!.billing_info.email_address;
      if (email === IN_BUYER) return { status: 406, body: { name: "MEDIA_TYPE_NOT_ACCEPTABLE", details: [{ issue: "INR_FOREIGN_CURRENCY_BLOCKED" }] } };
      inv.status = "SENT";
      return { status: 200, body: {} };
    }
    return { status: 500, body: { name: "UNEXPECTED_IN_TEST", path: p } };
  });
  return { f, store };
}
const fastGateway = (f: ReturnType<typeof fakeFetch>) => new LivePayPalGateway(new PayPalClient({ clientId: "id", clientSecret: "secret", baseUrl: BASE, fetchImpl: f.impl, sleep: async () => {} }), "sandbox", undefined);
const noRefresh = { refresh: async () => {} };
const bluebirdCalls = (f: ReturnType<typeof fakeFetch>) => f.calls.filter((c) => c.url.pathname.includes(BLUEBIRD_ID)).map((c) => `${c.method} ${c.url.pathname.replace(`/v2/invoicing/invoices/${BLUEBIRD_ID}`, "")||"/"}`);

describe("review: updating the real Bluebird draft", () => {
  it("PUTs a full replacement to the right endpoint, identical to the draft except the recipient email, then sends", async () => {
    const { f, store } = statefulSandbox();
    const { outcomes } = await seedScenarioWithReport(fastGateway(f), { payerEmail: INTL, ...noRefresh });
    expect(outcomes.find((o) => o.key === "bluebird")).toMatchObject({ result: "resumed", invoiceId: BLUEBIRD_ID, status: "SENT" });

    const put = f.calls.find((c) => c.method === "PUT")!;
    expect(f.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(put.url.pathname).toBe(`/v2/invoicing/invoices/${BLUEBIRD_ID}`);
    expect(Object.fromEntries(put.url.searchParams)).toEqual({ send_to_recipient: "false", send_to_invoicer: "false" });
    expect(put.headers.get("PayPal-Request-Id")).toMatch(/^seed-recipient-INV2-WGM3-AQMX-YL5E-ZC96-[0-9a-f]{12}$/);
    expect(put.headers.get("PayPal-Request-Id")).not.toContain("@"); // no email in headers

    // Expected body, written out by hand: the draft minus read-only fields, with only the email changed.
    const d = bluebirdDraft();
    const expected = {
      detail: { invoice_number: "JC-1043-KH5S", currency_code: "USD", note: d.detail.note, memo: d.detail.memo, invoice_date: "2026-09-27", payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: "2026-10-27" } },
      invoicer: d.invoicer,
      primary_recipients: [{ billing_info: { ...d.primary_recipients[0]!.billing_info, email_address: INTL }, shipping_info: d.primary_recipients[0]!.shipping_info }],
      items: d.items,
      configuration: d.configuration,
    };
    expect(put.body).toEqual(expected);

    // Order on this invoice: discovery read → fresh read → PUT → fresh read → send → status read.
    expect(bluebirdCalls(f)).toEqual(["GET /", "GET /", "PUT /", "GET /", "POST /send", "GET /"]);
    const send = f.calls.find((c) => c.method === "POST" && c.url.pathname.endsWith(`${BLUEBIRD_ID}/send`))!;
    expect(send.body).toEqual({ send_to_recipient: true, send_to_invoicer: false });
    expect(send.headers.get("PayPal-Request-Id")).toMatch(/^seed-send-INV2-WGM3-AQMX-YL5E-ZC96-[0-9a-f]{12}$/);
    expect(f.calls.findIndex((c) => c === send)).toBeGreaterThan(f.calls.findIndex((c) => c === put));

    // No write reached any of the six existing invoices.
    const existing = OBSERVED.filter((x) => x.key !== "bluebird").map((x) => x.id);
    expect(f.calls.filter((c) => c.method !== "GET" && existing.some((id) => c.url.pathname.includes(id)))).toHaveLength(0);
    expect((store.get(BLUEBIRD_ID)!.primary_recipients as { billing_info: { email_address: string } }[])[0]!.billing_info.email_address).toBe(INTL);
  });

  it("a failed PUT never sends, leaves the draft untouched, and the next run plans the same safe retry", async () => {
    const { f, store } = statefulSandbox({ putStatus: 422 });
    const { outcomes } = await seedScenarioWithReport(fastGateway(f), { payerEmail: INTL, ...noRefresh });
    const bb = outcomes.find((o) => o.key === "bluebird")!;
    expect(bb.result).toBe("failed");
    expect(f.calls.some((c) => c.url.pathname.endsWith(`${BLUEBIRD_ID}/send`))).toBe(false);
    expect(store.get(BLUEBIRD_ID)).toMatchObject({ status: "DRAFT", primary_recipients: bluebirdDraft().primary_recipients });

    const again = await seedScenarioWithReport(fastGateway(statefulSandbox().f), { payerEmail: INTL, ...noRefresh, dryRun: true });
    expect(again.outcomes.find((o) => o.key === "bluebird")).toMatchObject({ invoiceId: BLUEBIRD_ID, steps: ["update-recipient", "send"] });
  });

  it("a 5xx on PUT is retried with the same idempotency key and the same body; still sent only once", async () => {
    const inner = statefulSandbox();
    const failedPuts: { headers: Headers; body: unknown }[] = [];
    let failures = 1;
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "PUT" && failures-- > 0) {
        failedPuts.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({ name: "SERVICE_UNAVAILABLE" }), { status: 503, headers: { "content-type": "application/json" } });
      }
      return inner.f.impl(input, init);
    }) as typeof fetch;
    const { outcomes } = await seedScenarioWithReport(fastGateway({ impl, calls: [] }), { payerEmail: INTL, ...noRefresh });
    expect(outcomes.find((o) => o.key === "bluebird")!.result).toBe("resumed");
    const retried = inner.f.calls.filter((c) => c.method === "PUT");
    expect(failedPuts).toHaveLength(1);
    expect(retried).toHaveLength(1);
    expect(failedPuts[0]!.headers.get("PayPal-Request-Id")).toBe(retried[0]!.headers.get("PayPal-Request-Id"));
    expect(failedPuts[0]!.body).toEqual(retried[0]!.body);
    expect(inner.f.calls.filter((c) => c.url.pathname.endsWith(`${BLUEBIRD_ID}/send`))).toHaveLength(1);
  });

  it("does not PUT if, at execution time, the draft was already sent or is a different invoice", async () => {
    for (const bluebirdOverride of [
      { status: "SENT" },
      { detail: { ...bluebirdDraft().detail, invoice_number: "JC-1099-ZZZZ" } },
      { items: [{ name: "Something else", quantity: "1", unit_amount: { currency_code: "USD", value: "99.00" } }] },
      { primary_recipients: [{ billing_info: { business_name: "Another Client", email_address: IN_BUYER } }] },
    ]) {
      // Discovery sees the normal draft; the override applies only to reads made after planning.
      const { f, store } = statefulSandbox();
      const gw2 = fastGateway(f);
      const orig = gw2.getInvoice.bind(gw2);
      let reads = 0;
      gw2.getInvoice = async (id: string) => {
        if (id === BLUEBIRD_ID && ++reads > 1) store.set(BLUEBIRD_ID, { ...bluebirdDraft(), ...bluebirdOverride });
        return orig(id);
      };
      const { outcomes } = await seedScenarioWithReport(gw2, { payerEmail: INTL, ...noRefresh });
      expect(outcomes.find((o) => o.key === "bluebird")!.result).toBe("failed");
      expect(f.calls.filter((c) => c.method !== "GET" && c.url.pathname.includes(BLUEBIRD_ID))).toHaveLength(0);
    }
  });

  it("does not send if PayPal didn't apply the new recipient", async () => {
    const { f } = statefulSandbox({ ignoreRecipientChange: true });
    const { outcomes } = await seedScenarioWithReport(fastGateway(f), { payerEmail: INTL, ...noRefresh });
    const bb = outcomes.find((o) => o.key === "bluebird")!;
    expect(bb.result).toBe("failed");
    expect(bb.detail).toMatch(/not sending it/);
    expect(f.calls.some((c) => c.url.pathname.endsWith(`${BLUEBIRD_ID}/send`))).toBe(false);
  });
});
