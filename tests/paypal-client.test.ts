import { describe, expect, it } from "vitest";
import { PayPalApiError, PayPalClient } from "@/lib/paypal/client";
import { buildInvoiceUpdateBody, LivePayPalGateway } from "@/lib/paypal/gateway";
import { PPInvoice } from "@/lib/paypal/types";
import { fakeFetch } from "./helpers";

const BASE = "https://api-m.sandbox.paypal.com";
const token = { status: 200, body: { access_token: "A21AA-test", expires_in: 32400 } };

const sampleInvoice = PPInvoice.parse({
  id: "INV2-AAAA-BBBB-CCCC-DDDD",
  status: "SENT",
  detail: { invoice_number: "JC-1043", currency_code: "USD", note: "Thanks!", payment_term: { due_date: "2026-10-26" }, metadata: { recipient_view_url: "https://www.sandbox.paypal.com/invoice/p/#X", create_time: "x" } },
  invoicer: { business_name: "Juniper & Co. Studio" },
  primary_recipients: [{ billing_info: { business_name: "Bluebird Café", email_address: "priya@example.com" } }],
  items: [{ name: "Menu redesign", quantity: "1", unit_amount: { currency_code: "USD", value: "1200.00" } }],
  configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } },
  amount: { currency_code: "USD", value: "1200.00", breakdown: { item_total: { currency_code: "USD", value: "1200.00" }, discount: { invoice_discount: { percent: "0" } } } },
  due_amount: { currency_code: "USD", value: "1200.00" },
  payments: { paid_amount: { currency_code: "USD", value: "0.00" } },
  links: [{ href: "x", rel: "self" }],
  some_future_field: { keep: true },
});

describe("PayPalClient", () => {
  it("fetches and caches an OAuth token, then sends bearer + idempotency headers", async () => {
    const f = fakeFetch((r) => (r.url.pathname === "/v1/oauth2/token" ? token : { status: 202, body: {} }));
    const client = new PayPalClient({ clientId: "id", clientSecret: "secret", baseUrl: BASE, fetchImpl: f.impl });
    const gw = new LivePayPalGateway(client, "sandbox", "WH-1");
    await gw.sendReminder("INV2-1", { subject: "Hi", note: "Note" }, "unstuck-act_1");
    await gw.sendReminder("INV2-1", { subject: "Hi", note: "Note" }, "unstuck-act_2");
    const tokenCalls = f.calls.filter((c) => c.url.pathname === "/v1/oauth2/token");
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]!.headers.get("authorization")).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    const remind = f.calls.find((c) => c.url.pathname.endsWith("/remind"))!;
    expect(remind.method).toBe("POST");
    expect(remind.url.pathname).toBe("/v2/invoicing/invoices/INV2-1/remind");
    expect(remind.headers.get("authorization")).toBe("Bearer A21AA-test");
    expect(remind.headers.get("paypal-request-id")).toBe("unstuck-act_1");
    expect(remind.body).toEqual({ subject: "Hi", note: "Note", send_to_invoicer: false });
  });

  it("retries 5xx for idempotent writes and surfaces PayPal error details", async () => {
    let n = 0;
    const f = fakeFetch((r) => {
      if (r.url.pathname === "/v1/oauth2/token") return token;
      n++;
      if (n === 1) return { status: 503, body: {} };
      return { status: 422, body: { name: "UNPROCESSABLE_ENTITY", message: "The requested action could not be performed", details: [{ issue: "CANNOT_REMIND", description: "Invoice is paid" }] } };
    });
    const client = new PayPalClient({ clientId: "id", clientSecret: "s", baseUrl: BASE, fetchImpl: f.impl, sleep: async () => {} });
    const err = await client.request("POST", "/v2/invoicing/invoices/X/remind", { requestId: "r1", body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(PayPalApiError);
    expect(err.status).toBe(422);
    expect(err.message).toContain("Invoice is paid");
    expect(err.debugId).toBe("dbg123");
    expect(n).toBe(2);
  });

  it("refreshes the token once on 401", async () => {
    let tokens = 0;
    let calls = 0;
    const f = fakeFetch((r) => {
      if (r.url.pathname === "/v1/oauth2/token") return (tokens++, token);
      calls++;
      return calls === 1 ? { status: 401, body: {} } : { status: 200, body: { ok: true } };
    });
    const client = new PayPalClient({ clientId: "id", clientSecret: "s", baseUrl: BASE, fetchImpl: f.impl });
    await client.request("GET", "/v2/invoicing/invoices/X");
    expect(tokens).toBe(2);
  });

  it("does not retry writes without an idempotency key", async () => {
    let n = 0;
    const f = fakeFetch((r) => (r.url.pathname === "/v1/oauth2/token" ? token : (n++, { status: 500, body: {} })));
    const client = new PayPalClient({ clientId: "id", clientSecret: "s", baseUrl: BASE, fetchImpl: f.impl, sleep: async () => {} });
    await expect(client.request("POST", "/x", { body: {} })).rejects.toThrow();
    expect(n).toBe(1);
  });

  it("reports authentication failures clearly", async () => {
    const f = fakeFetch(() => ({ status: 401, body: { error: "invalid_client", error_description: "Client Authentication failed" } }));
    const client = new PayPalClient({ clientId: "bad", clientSecret: "bad", baseUrl: BASE, fetchImpl: f.impl });
    await expect(client.getAccessToken()).rejects.toThrow(/Client Authentication failed/);
  });
});

describe("buildInvoiceUpdateBody", () => {
  it("removes read-only fields, keeps everything writable (incl. unknown fields), applies the mutation", () => {
    const body = buildInvoiceUpdateBody(sampleInvoice, (b) => {
      b.configuration.partial_payment = { allow_partial_payment: true, minimum_amount_due: { currency_code: "USD", value: "400.00" } };
    }) as Record<string, any>;
    for (const k of ["id", "status", "links", "payments", "due_amount"]) expect(body).not.toHaveProperty(k);
    expect(body.detail.metadata).toBeUndefined();
    expect(body.detail.invoice_number).toBe("JC-1043");
    expect(body.items).toHaveLength(1);
    expect(body.primary_recipients[0].billing_info.email_address).toBe("priya@example.com");
    expect(body.amount).toEqual({ breakdown: { discount: { invoice_discount: { percent: "0" } } } });
    expect(body.configuration.partial_payment.minimum_amount_due.value).toBe("400.00");
    expect(body.some_future_field).toEqual({ keep: true });
    // The source object must not be mutated.
    expect(sampleInvoice.configuration?.partial_payment?.allow_partial_payment).toBe(false);
  });

  it("is sent as a full PUT with the right query parameters", async () => {
    const f = fakeFetch((r) => (r.url.pathname === "/v1/oauth2/token" ? token : { status: 200, body: { ...sampleInvoice, configuration: { partial_payment: { allow_partial_payment: true } } } }));
    const gw = new LivePayPalGateway(new PayPalClient({ clientId: "i", clientSecret: "s", baseUrl: BASE, fetchImpl: f.impl }), "sandbox", undefined);
    const body = buildInvoiceUpdateBody(sampleInvoice, () => {});
    const res = await gw.updateInvoice(sampleInvoice.id, body, { requestId: "unstuck-act_9", sendToRecipient: true });
    const put = f.calls.find((c) => c.method === "PUT")!;
    expect(put.url.searchParams.get("send_to_recipient")).toBe("true");
    expect(put.headers.get("prefer")).toBe("return=representation");
    expect(res.invoice.configuration?.partial_payment?.allow_partial_payment).toBe(true);
  });
});

describe("webhook verification", () => {
  it("posts the transmission headers and event to verify-webhook-signature", async () => {
    const f = fakeFetch((r) => (r.url.pathname === "/v1/oauth2/token" ? token : { status: 200, body: { verification_status: "SUCCESS" } }));
    const gw = new LivePayPalGateway(new PayPalClient({ clientId: "i", clientSecret: "s", baseUrl: BASE, fetchImpl: f.impl }), "sandbox", "WH-42");
    const headers = new Headers({ "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.sandbox.paypal.com/cert", "paypal-transmission-id": "t1", "paypal-transmission-sig": "sig", "paypal-transmission-time": "2026-11-04T10:00:00Z" });
    const ok = await gw.verifyWebhook(headers, JSON.stringify({ id: "WH-EVT-1", event_type: "INVOICING.INVOICE.PAID" }));
    expect(ok).toBe(true);
    const v = f.calls.find((c) => c.url.pathname === "/v1/notifications/verify-webhook-signature")!;
    expect(v.body).toMatchObject({ webhook_id: "WH-42", transmission_id: "t1", auth_algo: "SHA256withRSA", webhook_event: { id: "WH-EVT-1" } });
  });
  it("fails closed without a webhook id or with a bad body", async () => {
    const f = fakeFetch(() => token);
    const noId = new LivePayPalGateway(new PayPalClient({ clientId: "i", clientSecret: "s", baseUrl: BASE, fetchImpl: f.impl }), "sandbox", undefined);
    expect(await noId.verifyWebhook(new Headers(), "{}")).toBe(false);
    const withId = new LivePayPalGateway(new PayPalClient({ clientId: "i", clientSecret: "s", baseUrl: BASE, fetchImpl: f.impl }), "sandbox", "WH");
    expect(await withId.verifyWebhook(new Headers(), "not json")).toBe(false);
  });
});
