/**
 * SimulatedGateway — a local stand-in that follows the PayPal Invoicing v2 contract closely enough to
 * explore Unstuck without credentials. Every receipt is tagged `simulated: true`, the UI shows a
 * "Simulation" badge, and no screen describes simulated activity as a PayPal transaction.
 */
import { getDb } from "../db";
import { fromMinor, toMinor } from "../money";
import type { CallReceipt, InvoiceGateway } from "./gateway";
import { type ConditionalRuleInput, type CreateInvoiceInput, PPInvoice, type RecordPaymentInput, type ReminderInput } from "./types";

type SimInvoice = PPInvoice & { x_sim?: { reminders?: { at: string; subject: string; note: string; to?: string[] }[]; rules?: ConditionalRuleInput[]; auto_reminders_cancelled?: boolean } };

function load(id: string): SimInvoice {
  const row = getDb().prepare("SELECT json FROM sim_invoices WHERE id = ?").get(id) as { json: string } | undefined;
  if (!row) throw Object.assign(new Error(`Simulated invoice ${id} not found`), { status: 404 });
  return JSON.parse(row.json) as SimInvoice;
}
function save(inv: SimInvoice) {
  getDb().prepare("INSERT INTO sim_invoices (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json").run(inv.id, JSON.stringify(inv));
}

function totalOf(inv: SimInvoice): number {
  return (inv.items ?? []).reduce((s, it) => {
    const item = it as unknown as { quantity?: string; unit_amount?: { value: string } };
    return s + Math.round(Number(item.quantity ?? "1") * toMinor(item.unit_amount?.value ?? "0"));
  }, 0);
}
function paidOf(inv: SimInvoice): number {
  return (inv.payments?.transactions ?? []).reduce((s, t) => s + toMinor(t.amount?.value ?? "0"), 0);
}
function recompute(inv: SimInvoice) {
  const cur = inv.detail.currency_code;
  const total = totalOf(inv);
  const paid = paidOf(inv);
  inv.amount = { ...(inv.amount ?? {}), currency_code: cur, value: fromMinor(total) };
  inv.due_amount = { currency_code: cur, value: fromMinor(Math.max(0, total - paid)) };
  inv.payments = { ...(inv.payments ?? {}), paid_amount: { currency_code: cur, value: fromMinor(paid) }, transactions: inv.payments?.transactions ?? [] };
  if (["CANCELLED", "DRAFT"].includes(inv.status)) return;
  const viaPayPal = (inv.payments.transactions ?? []).some((t) => t.type === "PAYPAL");
  if (paid >= total) inv.status = viaPayPal ? "PAID" : "MARKED_AS_PAID";
  else if (paid > 0) inv.status = "PARTIALLY_PAID";
}

const receipt = (operation: string, status: number, requestId?: string): CallReceipt & { simulated: true } => ({
  operation,
  status,
  requestId,
  debugId: `sim-${Math.random().toString(36).slice(2, 10)}`,
  simulated: true,
});

export class SimulatedGateway implements InvoiceGateway {
  readonly mode = "simulated" as const;
  readonly environment = "simulation" as const;

  async listInvoices() {
    const rows = getDb().prepare("SELECT json FROM sim_invoices").all() as { json: string }[];
    return { invoices: rows.map((r) => PPInvoice.parse(JSON.parse(r.json))), receipt: receipt("GET /v2/invoicing/invoices", 200) };
  }

  async getInvoice(id: string) {
    return PPInvoice.parse(load(id));
  }

  async sendReminder(id: string, input: ReminderInput, requestId: string) {
    const inv = load(id);
    inv.x_sim = { ...inv.x_sim, reminders: [...(inv.x_sim?.reminders ?? []), { at: new Date().toISOString(), subject: input.subject, note: input.note, to: input.additional_recipients }] };
    save(inv);
    return receipt("POST /v2/invoicing/invoices/{id}/remind", 202, requestId);
  }

  async updateInvoice(id: string, body: Record<string, unknown>, opts: { requestId: string; sendToRecipient: boolean }) {
    const prev = load(id);
    const next = { ...(body as object), id, status: prev.status, payments: prev.payments, links: prev.links, x_sim: prev.x_sim } as SimInvoice;
    next.detail = { ...(next.detail ?? prev.detail), metadata: prev.detail.metadata };
    const pp = next.configuration?.partial_payment;
    if (pp?.allow_partial_payment && pp.minimum_amount_due) {
      const min = toMinor(pp.minimum_amount_due.value);
      const due = totalOf(next) - paidOf(next);
      if (min > due) throw Object.assign(new Error("MINIMUM_AMOUNT_DUE_EXCEEDS_DUE_AMOUNT"), { status: 422 });
    }
    recompute(next);
    save(next);
    return { invoice: PPInvoice.parse(next), receipt: receipt("PUT /v2/invoicing/invoices/{id}", 200, opts.requestId) };
  }

  async addConditionalRules(id: string, rules: ConditionalRuleInput[], requestId: string) {
    const inv = load(id);
    inv.x_sim = { ...inv.x_sim, rules: [...(inv.x_sim?.rules ?? []), ...rules] };
    save(inv);
    return receipt("POST /v2/invoicing/invoices/{id}/conditional-rules", 201, requestId);
  }

  async recordPayment(id: string, input: RecordPaymentInput, requestId: string) {
    const inv = load(id);
    const due = totalOf(inv) - paidOf(inv);
    if (toMinor(input.amount.value) > due) throw Object.assign(new Error("PAYMENT_AMOUNT_EXCEEDS_DUE"), { status: 422 });
    inv.payments = { ...(inv.payments ?? {}), transactions: [...(inv.payments?.transactions ?? []), { payment_id: `SIMEXT-${Date.now()}`, type: "EXTERNAL", method: input.method, payment_date: input.payment_date, amount: input.amount }] };
    recompute(inv);
    save(inv);
    return receipt("POST /v2/invoicing/invoices/{id}/payments", 200, requestId);
  }

  async cancelAutoReminders(id: string, requestId: string) {
    const inv = load(id);
    inv.x_sim = { ...inv.x_sim, auto_reminders_cancelled: true };
    save(inv);
    return receipt("POST /v2/invoicing/invoices/{id}/cancel-reminders", 204, requestId);
  }

  async createAndSendInvoice(input: CreateInvoiceInput, requestId: string) {
    const id = `SIM2-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const inv: SimInvoice = {
      id,
      status: "SENT",
      detail: {
        invoice_number: input.invoice_number,
        reference: input.reference,
        currency_code: input.currency_code,
        note: input.note,
        invoice_date: input.invoice_date,
        payment_term: { due_date: input.due_date },
        metadata: { create_time: new Date().toISOString() },
      },
      invoicer: input.invoicer,
      primary_recipients: [
        {
          billing_info: {
            business_name: input.recipient.business_name,
            name: input.recipient.given_name ? { given_name: input.recipient.given_name, surname: input.recipient.surname, full_name: `${input.recipient.given_name} ${input.recipient.surname ?? ""}`.trim() } : undefined,
            email_address: input.recipient.email_address,
          },
        },
      ],
      items: input.items.map((i) => ({ ...i, unit_of_measure: "AMOUNT" })),
      configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } },
      payments: { transactions: [] },
    };
    recompute(inv);
    save(inv);
    return { id, receipt: receipt("POST /v2/invoicing/invoices + /send", 202, requestId) };
  }

  async verifyWebhook() {
    return false; // Simulation never accepts external webhooks.
  }

  /** Simulation-only: the payer pays through the (simulated) PayPal invoice page. Enforces partial-payment rules. */
  simulatePayerPayment(id: string, amountMinor: number): PPInvoice {
    const inv = load(id);
    const due = totalOf(inv) - paidOf(inv);
    const pp = inv.configuration?.partial_payment;
    if (amountMinor <= 0 || amountMinor > due) throw Object.assign(new Error("Amount must be between 0 and the amount due"), { status: 422 });
    if (amountMinor < due) {
      if (!pp?.allow_partial_payment) throw Object.assign(new Error("This invoice must be paid in full"), { status: 422 });
      const min = pp.minimum_amount_due ? toMinor(pp.minimum_amount_due.value) : 1;
      if (amountMinor < min) throw Object.assign(new Error(`Minimum payment is ${fromMinor(min)}`), { status: 422 });
    }
    const cur = inv.detail.currency_code;
    inv.payments = {
      ...(inv.payments ?? {}),
      transactions: [...(inv.payments?.transactions ?? []), { payment_id: `SIMPP-${Date.now()}`, type: "PAYPAL", payment_date: new Date().toISOString().slice(0, 10), amount: { currency_code: cur, value: fromMinor(amountMinor) } }],
    };
    recompute(inv);
    save(inv);
    return PPInvoice.parse(inv);
  }

  /** Simulation-only: rewrite dates/payments for seeding history. */
  patchForSeed(id: string, patch: (inv: SimInvoice) => void) {
    const inv = load(id);
    patch(inv);
    recompute(inv);
    save(inv);
  }
}
