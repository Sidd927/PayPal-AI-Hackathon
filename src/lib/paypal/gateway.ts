/**
 * InvoiceGateway — the only way Unstuck talks to PayPal Invoicing.
 *
 * `LivePayPalGateway` calls the real PayPal REST API (sandbox or live).
 * `SimulatedGateway` (simulated.ts) implements the same contract locally for credential-free exploration;
 * the UI labels it "Simulation" everywhere and never claims a real PayPal transaction happened.
 */
import { PayPalClient } from "./client";
import {
  type ConditionalRuleInput,
  type CreateInvoiceInput,
  PPInvoice,
  PPInvoiceList,
  type RecordPaymentInput,
  type ReminderInput,
} from "./types";

export type CallReceipt = { operation: string; status: number; debugId?: string; requestId?: string };

export interface InvoiceGateway {
  readonly mode: "live" | "simulated";
  readonly environment: "sandbox" | "live" | "simulation";
  listInvoices(): Promise<{ invoices: PPInvoice[]; receipt: CallReceipt }>;
  getInvoice(id: string): Promise<PPInvoice>;
  sendReminder(id: string, input: ReminderInput, requestId: string): Promise<CallReceipt>;
  /** Full replacement update (PayPal semantics). Use `buildInvoiceUpdateBody` to derive the body from a fetched invoice. */
  updateInvoice(id: string, body: Record<string, unknown>, opts: { requestId: string; sendToRecipient: boolean }): Promise<{ invoice: PPInvoice; receipt: CallReceipt }>;
  addConditionalRules(id: string, rules: ConditionalRuleInput[], requestId: string): Promise<CallReceipt>;
  recordPayment(id: string, input: RecordPaymentInput, requestId: string): Promise<CallReceipt>;
  cancelAutoReminders(id: string, requestId: string): Promise<CallReceipt>;
  createAndSendInvoice(input: CreateInvoiceInput, requestId: string): Promise<{ id: string; receipt: CallReceipt }>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
}

/**
 * Derive a PUT body from an invoice returned by GET. PUT is a full replacement, so every writable
 * field must be carried over; read-only/computed fields are removed.
 */
export function buildInvoiceUpdateBody(invoice: PPInvoice, mutate: (body: Record<string, any>) => void): Record<string, unknown> {
  const body = structuredClone(invoice) as Record<string, any>;
  for (const k of ["id", "status", "links", "payments", "refunds", "due_amount", "gratuity"]) delete body[k];
  if (body.detail) delete body.detail.metadata;
  if (body.amount) {
    const breakdown = body.amount.breakdown ?? {};
    const kept: Record<string, unknown> = {};
    for (const k of ["custom", "shipping", "discount"]) if (breakdown[k]) kept[k] = breakdown[k];
    body.amount = Object.keys(kept).length ? { breakdown: kept } : undefined;
    if (!body.amount) delete body.amount;
  }
  mutate(body);
  return body;
}

export class LivePayPalGateway implements InvoiceGateway {
  readonly mode = "live" as const;
  constructor(
    private readonly client: PayPalClient,
    readonly environment: "sandbox" | "live",
    private readonly webhookId: string | undefined,
  ) {}

  async listInvoices() {
    const all: PPInvoice[] = [];
    let receipt: CallReceipt = { operation: "GET /v2/invoicing/invoices", status: 0 };
    for (let page = 1; page <= 5; page++) {
      const res = await this.client.request("GET", "/v2/invoicing/invoices", { query: { page, page_size: 100, total_required: true } });
      receipt = { operation: "GET /v2/invoicing/invoices", status: res.status, debugId: res.debugId };
      const parsed = PPInvoiceList.parse(res.data ?? {});
      all.push(...(parsed.items ?? []));
      if (!parsed.total_pages || page >= parsed.total_pages) break;
    }
    // List results can be abbreviated; fetch full detail for open invoices so amounts/recipients are complete.
    const relevant = all.filter((inv) => inv.status !== "DRAFT").slice(0, 100);
    const full = await Promise.all(relevant.map((inv) => this.getInvoice(inv.id).catch(() => inv)));
    return { invoices: full, receipt };
  }

  async getInvoice(id: string) {
    const res = await this.client.request("GET", `/v2/invoicing/invoices/${encodeURIComponent(id)}`);
    return PPInvoice.parse(res.data);
  }

  async sendReminder(id: string, input: ReminderInput, requestId: string) {
    const res = await this.client.request("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/remind`, {
      requestId,
      body: {
        subject: input.subject,
        note: input.note,
        send_to_invoicer: false,
        ...(input.additional_recipients?.length ? { additional_recipients: input.additional_recipients } : {}),
      },
    });
    return { operation: "POST /v2/invoicing/invoices/{id}/remind", status: res.status, debugId: res.debugId, requestId };
  }

  async updateInvoice(id: string, body: Record<string, unknown>, opts: { requestId: string; sendToRecipient: boolean }) {
    const res = await this.client.request("PUT", `/v2/invoicing/invoices/${encodeURIComponent(id)}`, {
      requestId: opts.requestId,
      body,
      query: { send_to_recipient: opts.sendToRecipient, send_to_invoicer: false },
      headers: { Prefer: "return=representation" },
    });
    const invoice = res.data ? PPInvoice.parse(res.data) : await this.getInvoice(id);
    return { invoice, receipt: { operation: "PUT /v2/invoicing/invoices/{id}", status: res.status, debugId: res.debugId, requestId: opts.requestId } };
  }

  async addConditionalRules(id: string, rules: ConditionalRuleInput[], requestId: string) {
    const res = await this.client.request("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/conditional-rules`, { requestId, body: { rules } });
    return { operation: "POST /v2/invoicing/invoices/{id}/conditional-rules", status: res.status, debugId: res.debugId, requestId };
  }

  async recordPayment(id: string, input: RecordPaymentInput, requestId: string) {
    const res = await this.client.request("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/payments`, { requestId, body: input });
    return { operation: "POST /v2/invoicing/invoices/{id}/payments", status: res.status, debugId: res.debugId, requestId };
  }

  async cancelAutoReminders(id: string, requestId: string) {
    const res = await this.client.request("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/cancel-reminders`, { requestId, body: {} });
    return { operation: "POST /v2/invoicing/invoices/{id}/cancel-reminders", status: res.status, debugId: res.debugId, requestId };
  }

  async createAndSendInvoice(input: CreateInvoiceInput, requestId: string) {
    const draft = await this.client.request<{ id?: string; href?: string; links?: { href: string; rel: string }[] }>("POST", "/v2/invoicing/invoices", {
      requestId: `${requestId}-create`,
      headers: { Prefer: "return=representation" },
      body: {
        detail: {
          invoice_number: input.invoice_number,
          reference: input.reference,
          currency_code: input.currency_code,
          note: input.note,
          invoice_date: input.invoice_date,
          payment_term: { due_date: input.due_date },
        },
        invoicer: { business_name: input.invoicer.business_name, email_address: input.invoicer.email_address },
        primary_recipients: [
          {
            billing_info: {
              business_name: input.recipient.business_name,
              name: input.recipient.given_name ? { given_name: input.recipient.given_name, surname: input.recipient.surname } : undefined,
              email_address: input.recipient.email_address,
            },
          },
        ],
        items: input.items.map((i) => ({ ...i, unit_of_measure: "AMOUNT" })),
        configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } },
      },
    });
    const id = draft.data?.id ?? draft.data?.href?.split("/").pop() ?? draft.data?.links?.find((l) => l.rel === "self")?.href.split("/").pop();
    if (!id) throw new Error("PayPal did not return an invoice id");
    const sent = await this.client.request("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, {
      requestId: `${requestId}-send`,
      body: { send_to_recipient: true, send_to_invoicer: false },
    });
    return { id, receipt: { operation: "POST /v2/invoicing/invoices + /send", status: sent.status, debugId: sent.debugId, requestId } };
  }

  /** Verify a webhook with PayPal's verify-webhook-signature API. Requires PAYPAL_WEBHOOK_ID. */
  async verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
    if (!this.webhookId) return false;
    const h = (n: string) => headers.get(n) ?? "";
    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return false;
    }
    const res = await this.client.request<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", {
      body: {
        auth_algo: h("paypal-auth-algo"),
        cert_url: h("paypal-cert-url"),
        transmission_id: h("paypal-transmission-id"),
        transmission_sig: h("paypal-transmission-sig"),
        transmission_time: h("paypal-transmission-time"),
        webhook_id: this.webhookId,
        webhook_event: event,
      },
    });
    return res.data?.verification_status === "SUCCESS";
  }
}
