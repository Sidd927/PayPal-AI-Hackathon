/**
 * Demo scenario: Maya Okafor runs Juniper & Co. Studio, a two-person brand studio.
 * Eight open invoices, each stuck for a different reason (one with a promise to pay that was missed),
 * plus a little payment history.
 *
 * All companies, people and email addresses are fictional (`.example` domains). Client messages are
 * seeded into Unstuck's own store (as if forwarded from email); invoices are created through the
 * InvoiceGateway — i.e. as real PayPal sandbox invoices when credentials are configured.
 */
import { createHash } from "node:crypto";
import { addDays, formatDate, todayIso } from "../dates";
import { repo } from "../db";
import { buildInvoiceUpdateBody, type InvoiceGateway } from "../paypal/gateway";
import type { PPInvoice } from "../paypal/types";
import { fromMinor, toMinor } from "../money";
import { PayPalApiError } from "../paypal/client";

export type SeedInvoice = {
  key: string;
  number: number;
  recipient: { business: string; given: string; surname: string; email: string };
  items: { name: string; amount: number }[];
  issuedDaysAgo: number;
  dueInDays: number; // negative = overdue
  messages?: { daysAgo: number; author: "client" | "owner"; body: string }[];
  remindersDaysAgo?: number[];
  /** A promise to pay made `daysAgo` days ago for a date `byDaysAgo` days ago (already missed if > 0). "{promised_date}" in messages is filled in. */
  promise?: { daysAgo: number; byDaysAgo: number };
  paid?: { daysAfterDue: number; method: "CHECK" | "BANK_TRANSFER" };
  usePayerEmail?: boolean;
};

export const BUSINESS = { name: "Juniper & Co. Studio", owner: "Maya Okafor", email: "maya@juniperco.example" };

export const SCENARIO: SeedInvoice[] = [
  {
    key: "northwind",
    number: 1041,
    recipient: { business: "Northwind Logistics", given: "Dan", surname: "Reyes", email: "dan.reyes@northwind.example" },
    items: [{ name: "Brand refresh — phase 2 (identity system & guidelines)", amount: 4_800_00 }],
    issuedDaysAgo: 42,
    dueInDays: -12,
    remindersDaysAgo: [5],
    messages: [
      {
        daysAgo: 4,
        author: "client",
        body: "Hi Maya — the new guidelines look fantastic, the team loves them. Bad news on the invoice though: our AP team kicked it back because it doesn't have our purchase order number on it. It's PO-88412. Could you add that and make sure it goes to ap@northwind.example? They do payment runs every Thursday. Thanks! Dan",
      },
    ],
  },
  {
    key: "bluebird",
    number: 1043,
    recipient: { business: "Bluebird Café", given: "Priya", surname: "Shah", email: "priya@bluebirdcafe.example" },
    items: [
      { name: "Menu redesign (3 menus)", amount: 850_00 },
      { name: "Window signage artwork", amount: 350_00 },
    ],
    issuedDaysAgo: 39,
    dueInDays: -9,
    usePayerEmail: true,
    messages: [
      {
        daysAgo: 2,
        author: "client",
        body: "Hi Maya, I'm so sorry this is late. Summer was a lot slower than we hoped and cash is really tight this month. The menus have been great for us. Could I pay $400 now and the rest over the next few weeks? I really don't want to leave you hanging. — Priya",
      },
    ],
  },
  {
    key: "harbor",
    number: 1038,
    recipient: { business: "Harbor Dental", given: "Lena", surname: "Ortiz", email: "office@harbordental.example" },
    items: [{ name: "Website build — final milestone (launch & booking integration)", amount: 2_650_00 }],
    issuedDaysAgo: 51,
    dueInDays: -21,
    remindersDaysAgo: [14],
    messages: [
      {
        daysAgo: 10,
        author: "client",
        body: "Maya, we're not comfortable paying the final milestone yet. The online booking form still doesn't work properly on phones — patients keep calling to say it freezes — and that was the main reason we hired you. Please let us know when it's fixed.",
      },
    ],
  },
  {
    key: "lumen",
    number: 1045,
    recipient: { business: "Lumen Yoga", given: "Sam", surname: "Patel", email: "sam@lumenyoga.example" },
    items: [{ name: "Social media template pack (autumn)", amount: 650_00 }],
    issuedDaysAgo: 35,
    dueInDays: -5,
  },
  {
    key: "atlas",
    number: 1040,
    recipient: { business: "Atlas Robotics", given: "Kenji", surname: "Mori", email: "kenji@atlasrobotics.example" },
    items: [{ name: "Investor pitch deck design (24 slides)", amount: 3_900_00 }],
    issuedDaysAgo: 33,
    dueInDays: -3,
    messages: [{ daysAgo: 1, author: "client", body: "Hey Maya, our finance team mailed a check for this last Tuesday, so it should land with you any day now. Let me know if it doesn't turn up by the end of the week." }],
  },
  {
    key: "quill",
    number: 1036,
    recipient: { business: "Quill Publishing", given: "Rosa", surname: "Grant", email: "rosa.grant@quillpub.example" },
    items: [{ name: "Book cover series (4 covers)", amount: 1_750_00 }],
    issuedDaysAgo: 64,
    dueInDays: -34,
    remindersDaysAgo: [24, 13],
    messages: [
      {
        daysAgo: 13,
        author: "client",
        body: "Automatic reply: Thank you for your email. I left Quill Publishing at the end of September and this mailbox is no longer monitored. For invoices and payments please contact accounts@quillpub.example. — Rosa",
      },
    ],
  },
  {
    key: "kestrel",
    number: 1047,
    recipient: { business: "Kestrel Media", given: "Ana", surname: "Lindqvist", email: "ana@kestrelmedia.example" },
    items: [{ name: "Podcast cover art series (6 episodes)", amount: 1_250_00 }],
    issuedDaysAgo: 46,
    dueInDays: -16,
    remindersDaysAgo: [10],
    promise: { daysAgo: 9, byDaysAgo: 3 },
    messages: [{ daysAgo: 9, author: "client", body: "Hi Maya, apologies for the wait. It's approved on our side and we'll pay it by {promised_date}." }],
  },
  {
    key: "fernwood",
    number: 1046,
    recipient: { business: "Fernwood Architects", given: "Hana", surname: "Lee", email: "hana@fernwood.example" },
    items: [{ name: "Brand identity system — new practice launch", amount: 5_500_00 }],
    issuedDaysAgo: 5,
    dueInDays: 9,
  },
];

/** Paid history so the agent can judge relationships ("always pays", "new client"). */
export const HISTORY: SeedInvoice[] = [
  { key: "lumen-h1", number: 1012, recipient: SCENARIO[3]!.recipient, items: [{ name: "Studio launch posters", amount: 420_00 }], issuedDaysAgo: 160, dueInDays: -130, paid: { daysAfterDue: 1, method: "BANK_TRANSFER" } },
  { key: "lumen-h2", number: 1021, recipient: SCENARIO[3]!.recipient, items: [{ name: "Spring social templates", amount: 600_00 }], issuedDaysAgo: 120, dueInDays: -90, paid: { daysAfterDue: 0, method: "BANK_TRANSFER" } },
  { key: "lumen-h3", number: 1030, recipient: SCENARIO[3]!.recipient, items: [{ name: "Summer workshop flyers", amount: 380_00 }], issuedDaysAgo: 80, dueInDays: -50, paid: { daysAfterDue: 2, method: "BANK_TRANSFER" } },
  { key: "northwind-h1", number: 1027, recipient: SCENARIO[0]!.recipient, items: [{ name: "Brand refresh — phase 1 (discovery)", amount: 3_200_00 }], issuedDaysAgo: 95, dueInDays: -65, paid: { daysAfterDue: 6, method: "BANK_TRANSFER" } },
  { key: "bluebird-h1", number: 1025, recipient: SCENARIO[1]!.recipient, items: [{ name: "Logo refresh", amount: 900_00 }], issuedDaysAgo: 110, dueInDays: -80, paid: { daysAfterDue: 0, method: "CHECK" } },
];

function numberFor(n: number, live: boolean) {
  return live ? `JC-${n}-${Date.now().toString(36).slice(-4).toUpperCase()}` : `JC-${n}`;
}

/** The email an invoice for this scenario should be addressed to. */
export function desiredRecipientEmail(s: SeedInvoice, payerEmail: string | undefined) {
  return s.usePayerEmail && payerEmail ? payerEmail : s.recipient.email;
}

/** Create a DRAFT only. The back-dating fallback applies to the create call alone: no draft exists yet when it fails. */
async function createDraftWithDateFallback(gw: InvoiceGateway, s: SeedInvoice, recipientEmail: string, runId: string, log: (m: string) => void) {
  const today = todayIso();
  const base = {
    invoice_number: numberFor(s.number, gw.mode === "live"),
    currency_code: "USD",
    note: `Thank you for working with ${BUSINESS.name}.`,
    invoicer: { business_name: BUSINESS.name },
    recipient: { business_name: s.recipient.business, given_name: s.recipient.given, surname: s.recipient.surname, email_address: recipientEmail },
    items: s.items.map((i) => ({ name: i.name, quantity: "1", unit_amount: { currency_code: "USD", value: fromMinor(i.amount) } })),
  };
  try {
    return await gw.createDraftInvoice({ ...base, invoice_date: addDays(today, -s.issuedDaysAgo), due_date: addDays(today, s.dueInDays) }, `seed-${s.key}-${runId}`);
  } catch (e) {
    if (!(e instanceof PayPalApiError) || (e.status !== 422 && e.status !== 400)) throw e;
    // PayPal may reject back-dated invoices; fall back to today's date so the demo still runs on real sandbox data.
    log(`  ↳ PayPal rejected back-dated ${s.key} (${e.message}); creating with today's date`);
    return await gw.createDraftInvoice({ ...base, invoice_date: today, due_date: addDays(today, Math.max(0, s.dueInDays)) }, `seed-${s.key}-${runId}-b`);
  }
}

/* ------------------------------------------------------------------ */
/* Resumable seeding                                                   */
/* ------------------------------------------------------------------ */

export type SeedStep = "create" | "update-recipient" | "send" | "record-payment";
export type SeedPlan = { invoiceId?: string; status?: string; steps: SeedStep[]; reason: string; fail?: boolean };
export type SeedOutcome = {
  key: string;
  number: number;
  kind: "history" | "active";
  result: "created" | "resumed" | "skipped" | "failed" | "planned";
  invoiceId?: string;
  status?: string;
  steps: SeedStep[];
  detail: string;
};

const PAID_STATUSES = new Set(["PAID", "MARKED_AS_PAID"]);
/** Statuses that mean PayPal already sent the invoice to the recipient: never send again. */
const SENT_STATUSES = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "PAID", "MARKED_AS_PAID", "SCHEDULED", "PAYMENT_PENDING"]);
const NUMBER_RE = /^JC-(\d{4})(?:-[A-Z0-9]+)?$/;

const recipientEmailOf = (inv: PPInvoice) => inv.primary_recipients?.[0]?.billing_info?.email_address?.toLowerCase() ?? "";
const totalMinorOf = (s: SeedInvoice) => s.items.reduce((a, i) => a + i.amount, 0);
const paidMinorOf = (inv: PPInvoice) => toMinor(inv.payments?.paid_amount?.value ?? "0");
const invoiceTotalMinor = (inv: PPInvoice) => (inv.amount?.value ? toMinor(inv.amount.value) : null);

/**
 * Recording a payment is only ever done for the fictional paid-history invoices, on an invoice that is
 * addressed to the scenario's own `.example` address, has nothing paid yet, and has the expected total.
 * Anything else (a real address, a partial payment, a different amount) is refused.
 */
export function canRecordSeedPayment(s: SeedInvoice, inv: PPInvoice): string | null {
  if (!s.paid) return "Only paid-history scenarios record payments.";
  if (!/\.example$/i.test(s.recipient.email)) return "Refusing: the scenario recipient is not a fictional .example address.";
  if (recipientEmailOf(inv) !== s.recipient.email.toLowerCase()) return `Refusing: invoice is addressed to ${recipientEmailOf(inv) || "an unknown recipient"}, not ${s.recipient.email}.`;
  if (!["SENT", "UNPAID"].includes(inv.status)) return `Refusing: invoice status is ${inv.status}.`;
  if (paidMinorOf(inv) !== 0) return "Refusing: the invoice already has a payment recorded.";
  const total = invoiceTotalMinor(inv);
  if (total !== null && total !== totalMinorOf(s)) return `Refusing: invoice total ${fromMinor(total)} differs from the scenario's ${fromMinor(totalMinorOf(s))}.`;
  return null;
}

/**
 * Decide what to do for one scenario, given the invoices already in PayPal with its number (full details).
 * Pure: no I/O. Never plans to send an invoice that is not a DRAFT, and never plans a second create.
 */
export function planSeed(s: SeedInvoice, matches: PPInvoice[], payerEmail: string | undefined): SeedPlan {
  const history = !!s.paid;
  const want = desiredRecipientEmail(s, payerEmail).toLowerCase();
  const usable = matches.filter((m) => m.status !== "CANCELLED");
  if (usable.length > 1) {
    return { steps: [], fail: true, reason: `${usable.length} invoices already exist for JC-${s.number} (${usable.map((m) => `${m.id} ${m.status}`).join(", ")}). Resolve the duplicates in the sandbox dashboard; nothing was changed.` };
  }
  if (usable.length === 0) {
    if (matches.length) return { steps: [], fail: true, reason: `Only cancelled invoice(s) exist for JC-${s.number} (${matches.map((m) => m.id).join(", ")}). Not replacing them automatically; nothing was changed.` };
    return { steps: history ? ["create", "send", "record-payment"] : ["create", "send"], reason: "No invoice yet" };
  }
  const inv = usable[0]!;
  const base = { invoiceId: inv.id, status: inv.status };
  if (inv.status === "DRAFT") {
    const fix: SeedStep[] = recipientEmailOf(inv) !== want ? ["update-recipient"] : [];
    return { ...base, steps: [...fix, "send", ...(history ? (["record-payment"] as SeedStep[]) : [])], reason: fix.length ? `Draft is addressed to ${recipientEmailOf(inv) || "nobody"}; will readdress it to ${want} and send` : "Draft exists; will send it" };
  }
  if (history) {
    if (PAID_STATUSES.has(inv.status)) return { ...base, steps: [], reason: "Already paid" };
    const refusal = canRecordSeedPayment(s, inv);
    if (refusal) return { ...base, steps: [], fail: true, reason: refusal };
    return { ...base, steps: ["record-payment"], reason: "Sent but the history payment was never recorded" };
  }
  if (SENT_STATUSES.has(inv.status)) {
    const note = recipientEmailOf(inv) && recipientEmailOf(inv) !== want ? ` (addressed to ${recipientEmailOf(inv)}; not changed, because it was already sent)` : "";
    return { ...base, steps: [], reason: `Already sent (${inv.status}); not resent${note}` };
  }
  return { ...base, steps: [], fail: true, reason: `Unexpected status ${inv.status}; left for you to review.` };
}

/** Explain PayPal errors the seeder is known to hit. */
function hintFor(err: unknown): string {
  const text = `${(err as Error).message ?? ""} ${JSON.stringify((err as PayPalApiError).details ?? "")}`;
  if (/INR_FOREIGN_CURRENCY_BLOCKED/.test(text)) {
    return " PayPal won't send invoices to a recipient whose PayPal account is registered in India. Set DEMO_PAYER_EMAIL to a sandbox Personal account created with a country outside India (Sandbox Accounts → Create account), or leave it empty to use the fictional address, then re-run.";
  }
  return "";
}

/**
 * Seed the scenario, resuming from whatever already exists in PayPal. Discovery is read-only (list + get);
 * each write uses an idempotency key derived from the invoice id, and every write is preceded by a fresh
 * read of the invoice's status. One scenario failing does not stop the others.
 */
export async function seedScenarioWithReport(
  gw: InvoiceGateway,
  opts: { payerEmail?: string; log?: (m: string) => void; refresh: (id: string) => Promise<unknown>; dryRun?: boolean },
) {
  const log = opts.log ?? (() => {});
  const today = todayIso();
  const runId = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const outcomes: SeedOutcome[] = [];

  // 1. Discovery (read-only).
  const { invoices } = await gw.listInvoices();
  const byNumber = new Map<number, PPInvoice[]>();
  for (const inv of invoices) {
    const m = NUMBER_RE.exec(inv.detail?.invoice_number ?? "");
    if (!m) continue;
    const full = await gw.getInvoice(inv.id).catch(() => inv); // list entries (esp. drafts) are abbreviated
    byNumber.set(Number(m[1]), [...(byNumber.get(Number(m[1])) ?? []), full]);
  }

  // 2. Plan and execute, scenario by scenario.
  for (const s of [...HISTORY, ...SCENARIO]) {
    const kind = s.paid ? "history" : "active";
    const plan = planSeed(s, byNumber.get(s.number) ?? [], opts.payerEmail);
    const out: SeedOutcome = { key: s.key, number: s.number, kind, result: "skipped", invoiceId: plan.invoiceId, status: plan.status, steps: plan.steps, detail: plan.reason };
    outcomes.push(out);
    if (plan.fail) {
      out.result = "failed";
      log(`  ✗ ${s.key} (JC-${s.number}): ${plan.reason}`);
      continue;
    }
    if (opts.dryRun) {
      out.result = plan.steps.length ? "planned" : "skipped";
      if (plan.invoiceId) ids[s.key] = plan.invoiceId;
      log(`  ${plan.steps.length ? "→" : "="} ${s.key} (JC-${s.number}) ${plan.invoiceId ?? "new"}: ${plan.steps.length ? plan.steps.join(" → ") : "nothing to do"} (${plan.reason})`);
      continue;
    }
    let id = plan.invoiceId;
    const done: SeedStep[] = [];
    try {
      for (const step of plan.steps) {
        if (step === "create") {
          id = (await createDraftWithDateFallback(gw, s, desiredRecipientEmail(s, opts.payerEmail), runId, log)).id;
          out.invoiceId = id;
        } else if (step === "update-recipient") {
          const inv = await gw.getInvoice(id!);
          if (inv.status !== "DRAFT") throw new Error(`Invoice ${id} is ${inv.status}, no longer a draft; not readdressing it.`);
          const email = desiredRecipientEmail(s, opts.payerEmail);
          const body = buildInvoiceUpdateBody(inv, (b) => {
            b.primary_recipients = [{ ...(b.primary_recipients?.[0] ?? {}), billing_info: { ...(b.primary_recipients?.[0]?.billing_info ?? {}), email_address: email } }];
          });
          await gw.updateInvoice(id!, body, { requestId: `seed-recipient-${id}-${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12)}`, sendToRecipient: false });
        } else if (step === "send") {
          const inv = await gw.getInvoice(id!);
          if (inv.status !== "DRAFT") throw new Error(`Invoice ${id} is already ${inv.status}; not sending it again.`);
          await gw.sendInvoice(id!, `seed-send-${id}`);
        } else if (step === "record-payment") {
          const inv = await gw.getInvoice(id!);
          const refusal = canRecordSeedPayment(s, inv);
          if (refusal) throw new Error(refusal);
          const paidOn = addDays(today, s.dueInDays + s.paid!.daysAfterDue);
          await gw.recordPayment(id!, { method: s.paid!.method, payment_date: paidOn, amount: { currency_code: "USD", value: fromMinor(totalMinorOf(s)) }, note: "Seeded history (sandbox demo)" }, `seed-pay-${id}`);
        }
        done.push(step);
      }
      out.result = plan.steps.includes("create") ? "created" : plan.steps.length ? "resumed" : "skipped";
      ids[s.key] = id!;
      await opts.refresh(id!);
      out.status = (await gw.getInvoice(id!).catch(() => null))?.status ?? out.status;
      log(`  ${out.result === "skipped" ? "=" : "✓"} ${s.key} (JC-${s.number}) ${id}: ${out.result}${done.length ? ` [${done.join(" → ")}]` : ""}, ${out.status ?? ""} (${plan.reason})`);
    } catch (e) {
      out.result = "failed";
      out.invoiceId = id;
      const err = e as PayPalApiError;
      out.detail = `${done.length ? `completed [${done.join(" → ")}] then ` : ""}failed: ${err.message}${err.debugId ? ` (PayPal debug id ${err.debugId})` : ""}.${hintFor(e)}`;
      if (id) ids[s.key] = id; // a draft that exists is reused on the next run
      log(`  ✗ ${s.key} (JC-${s.number}) ${id ?? ""}: ${out.detail}`);
    }
  }

  // 3. Unstuck's own store: conversations for scenarios that reached PayPal, once.
  if (!opts.dryRun) {
    for (const s of SCENARIO) {
      const id = ids[s.key];
      const o = outcomes.find((x) => x.key === s.key);
      if (!id || o?.result === "failed") continue;
      if (repo.listMessages(id).length > 0 || repo.listEvents({ invoiceId: id, limit: 1000 }).some((e) => e.kind === "reminder_sent" || e.kind === "promise_to_pay")) continue;
      seedConversation(id, s, today);
    }
    repo.setSetting("demo_seeded_at", new Date().toISOString());
    repo.setPolicy({ ...repo.getPolicy(), businessName: BUSINESS.name, ownerName: BUSINESS.owner });
  }
  return { ids, outcomes };
}

/**
 * Seed the scenario through a gateway (simulation demo reset and tests). Returns invoice ids keyed by scenario
 * key. Throws if any scenario failed, so a broken demo never looks complete.
 */
export async function seedScenario(gw: InvoiceGateway, opts: { payerEmail?: string; log?: (m: string) => void; refresh: (id: string) => Promise<unknown> }) {
  const { ids, outcomes } = await seedScenarioWithReport(gw, opts);
  const failed = outcomes.filter((o) => o.result === "failed");
  if (failed.length) throw new Error(`Seeding failed for ${failed.map((o) => `${o.key}: ${o.detail}`).join("; ")}`);
  return ids;
}

/** Messages, prior PayPal reminders and any promise to pay, in Unstuck's own store. All fictional. */
function seedConversation(id: string, s: SeedInvoice, today: string) {
  const promisedBy = s.promise ? addDays(today, -s.promise.byDaysAgo) : null;
  for (const m of s.messages ?? []) {
    const body = promisedBy ? m.body.replace("{promised_date}", formatDate(promisedBy)) : m.body;
    repo.addMessage({ invoice_id: id, author: m.author, channel: "email", body, created_at: new Date(Date.now() - m.daysAgo * 86_400_000).toISOString() });
  }
  for (const d of s.remindersDaysAgo ?? []) {
    repo.logEvent({ invoice_id: id, kind: "reminder_sent", actor: "paypal", summary: `PayPal automatic reminder (${d} days ago, before Unstuck)`, data: { historical: true, days_ago: d } });
  }
  if (s.promise && promisedBy) {
    repo.logEvent({ invoice_id: id, kind: "promise_to_pay", actor: "payer", summary: `Client promised to pay by ${formatDate(promisedBy)}`, data: { date: promisedBy }, at: new Date(Date.now() - s.promise.daysAgo * 86_400_000).toISOString() });
  }
}

/**
 * Re-attach the demo conversations to demo invoices after a fresh sync (e.g. a Render free instance restarted
 * and lost its local disk). Matches invoices by the JC-<number> prefix the seeder uses. Idempotent.
 */
export function restoreDemoConversations(invoices: { id: string; number: string | null }[]) {
  let restored = 0;
  for (const inv of invoices) {
    const m = /^JC-(\d{4})(?:-|$)/.exec(inv.number ?? "");
    const s = m ? SCENARIO.find((x) => x.number === Number(m[1])) : undefined;
    if (!s || repo.listMessages(inv.id).length > 0 || (!s.messages?.length && !s.remindersDaysAgo?.length)) continue;
    if (repo.listEvents({ invoiceId: inv.id, limit: 1000 }).some((e) => e.kind === "reminder_sent")) continue;
    seedConversation(inv.id, s, todayIso());
    restored++;
  }
  if (restored) repo.setPolicy({ ...repo.getPolicy(), businessName: BUSINESS.name, ownerName: BUSINESS.owner });
  return restored;
}
