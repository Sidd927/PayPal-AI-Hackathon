/**
 * Demo scenario: Maya Okafor runs Juniper & Co. Studio, a two-person brand studio.
 * Seven open invoices, each stuck for a different reason, plus a little payment history.
 *
 * All companies, people and email addresses are fictional (`.example` domains). Client messages are
 * seeded into Unstuck's own store (as if forwarded from email); invoices are created through the
 * InvoiceGateway — i.e. as real PayPal sandbox invoices when credentials are configured.
 */
import { addDays, todayIso } from "../dates";
import { repo } from "../db";
import type { InvoiceGateway } from "../paypal/gateway";
import { fromMinor } from "../money";
import { PayPalApiError } from "../paypal/client";

type SeedInvoice = {
  key: string;
  number: number;
  recipient: { business: string; given: string; surname: string; email: string };
  items: { name: string; amount: number }[];
  issuedDaysAgo: number;
  dueInDays: number; // negative = overdue
  messages?: { daysAgo: number; author: "client" | "owner"; body: string }[];
  remindersDaysAgo?: number[];
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

async function createWithDateFallback(gw: InvoiceGateway, s: SeedInvoice, payerEmail: string, log: (m: string) => void) {
  const today = todayIso();
  const live = gw.mode === "live";
  const base = {
    invoice_number: numberFor(s.number, live),
    currency_code: "USD",
    note: `Thank you for working with ${BUSINESS.name}.`,
    invoicer: { business_name: BUSINESS.name },
    recipient: { business_name: s.recipient.business, given_name: s.recipient.given, surname: s.recipient.surname, email_address: s.usePayerEmail && payerEmail ? payerEmail : s.recipient.email },
    items: s.items.map((i) => ({ name: i.name, quantity: "1", unit_amount: { currency_code: "USD", value: fromMinor(i.amount) } })),
  };
  try {
    return await gw.createAndSendInvoice({ ...base, invoice_date: addDays(today, -s.issuedDaysAgo), due_date: addDays(today, s.dueInDays) }, `seed-${s.key}-${Date.now()}`);
  } catch (e) {
    if (!(e instanceof PayPalApiError) || e.status !== 422 && e.status !== 400) throw e;
    // PayPal may reject back-dated invoices; fall back to today's date so the demo still runs on real sandbox data.
    log(`  ↳ PayPal rejected back-dated ${s.key} (${e.message}); creating with today's date`);
    return await gw.createAndSendInvoice({ ...base, invoice_date: today, due_date: addDays(today, Math.max(0, s.dueInDays)) }, `seed-${s.key}-${Date.now()}-b`);
  }
}

/**
 * Seed the scenario through a gateway. Returns created invoice ids keyed by scenario key.
 * `storeLocally` must persist an invoice row (services/invoices.storeInvoice) — injected to avoid import cycles.
 */
export async function seedScenario(gw: InvoiceGateway, opts: { payerEmail?: string; log?: (m: string) => void; refresh: (id: string) => Promise<unknown> }) {
  const log = opts.log ?? (() => {});
  const ids: Record<string, string> = {};
  const today = todayIso();
  for (const s of [...HISTORY, ...SCENARIO]) {
    const { id } = await createWithDateFallback(gw, s, opts.payerEmail ?? "", log);
    ids[s.key] = id;
    if (s.paid) {
      const paidOn = addDays(today, s.dueInDays + s.paid.daysAfterDue);
      const amount = s.items.reduce((a, i) => a + i.amount, 0);
      await gw.recordPayment(id, { method: s.paid.method, payment_date: paidOn, amount: { currency_code: "USD", value: fromMinor(amount) }, note: "Seeded history" }, `seed-pay-${s.key}-${Date.now()}`);
    }
    await opts.refresh(id);
    log(`  ✓ ${s.key} → ${id}`);
  }
  // Conversation and prior reminder history (Unstuck's own store).
  for (const s of SCENARIO) {
    const id = ids[s.key]!;
    for (const m of s.messages ?? []) {
      repo.addMessage({ invoice_id: id, author: m.author, channel: "email", body: m.body, created_at: new Date(Date.now() - m.daysAgo * 86_400_000).toISOString() });
    }
    for (const d of s.remindersDaysAgo ?? []) {
      repo.logEvent({ invoice_id: id, kind: "reminder_sent", actor: "paypal", summary: `PayPal automatic reminder (${d} days ago, before Unstuck)`, data: { historical: true, days_ago: d } });
    }
  }
  repo.setSetting("demo_seeded_at", new Date().toISOString());
  repo.setPolicy({ ...repo.getPolicy(), businessName: BUSINESS.name, ownerName: BUSINESS.owner });
  return ids;
}
