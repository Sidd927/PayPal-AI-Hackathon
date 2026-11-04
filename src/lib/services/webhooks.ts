import { repo } from "../db";
import { getGateway } from "../config";
import { PPWebhookEvent } from "../paypal/types";
import { handleInvoicePaymentUpdate } from "./payments";
import { refreshInvoice } from "./invoices";

export type WebhookOutcome = { status: number; body: Record<string, unknown> };

const INVOICE_EVENTS = new Set([
  "INVOICING.INVOICE.PAID",
  "INVOICING.INVOICE.UPDATED",
  "INVOICING.INVOICE.CANCELLED",
  "INVOICING.INVOICE.REFUNDED",
  "INVOICING.INVOICE.SCHEDULED",
  "INVOICING.INVOICE.CREATED",
]);

/** Extract the invoice id from an INVOICING.* resource (shape differs slightly between event types). */
export function invoiceIdFromResource(resource: Record<string, unknown> | undefined): string | null {
  if (!resource) return null;
  const inv = resource.invoice as { id?: string } | undefined;
  if (inv?.id) return inv.id;
  if (typeof resource.id === "string") return resource.id;
  return null;
}

/**
 * Verify → dedupe → re-fetch. The payload is never trusted for amounts or status: Unstuck always
 * re-reads the invoice from PayPal after a verified notification.
 */
export async function processPayPalWebhook(headers: Headers, rawBody: string): Promise<WebhookOutcome> {
  const gw = getGateway();
  if (gw.mode !== "live") return { status: 409, body: { error: "Webhooks are only accepted when connected to the PayPal sandbox" } };

  let verified = false;
  try {
    verified = await gw.verifyWebhook(headers, rawBody);
  } catch (e) {
    return { status: 502, body: { error: `Could not verify webhook with PayPal: ${(e as Error).message}` } };
  }
  if (!verified) {
    repo.logEvent({ kind: "webhook_rejected", actor: "paypal", summary: "Webhook signature verification failed — ignored" });
    return { status: 401, body: { error: "Signature verification failed" } };
  }

  const parsed = PPWebhookEvent.safeParse(JSON.parse(rawBody));
  if (!parsed.success) return { status: 400, body: { error: "Malformed event" } };
  const event = parsed.data;
  if (!repo.recordWebhook(event.id, event.event_type, true)) return { status: 200, body: { ok: true, duplicate: true } };

  if (!INVOICE_EVENTS.has(event.event_type)) {
    repo.setWebhookOutcome(event.id, "ignored");
    return { status: 200, body: { ok: true, ignored: event.event_type } };
  }
  const invoiceId = invoiceIdFromResource(event.resource);
  if (!invoiceId) {
    repo.setWebhookOutcome(event.id, "no invoice id");
    return { status: 200, body: { ok: true, ignored: "no invoice id" } };
  }
  repo.logEvent({ invoice_id: invoiceId, kind: "webhook", actor: "paypal", summary: `PayPal webhook ${event.event_type} (verified)`, data: { event_id: event.id } });
  try {
    if (event.event_type === "INVOICING.INVOICE.PAID") await handleInvoicePaymentUpdate(invoiceId, "webhook");
    else await refreshInvoice(invoiceId);
    repo.setWebhookOutcome(event.id, "processed");
  } catch (e) {
    repo.forgetWebhook(event.id);
    repo.logEvent({ invoice_id: invoiceId, kind: "webhook_failed", actor: "unstuck", summary: `Processing ${event.event_type} failed; PayPal will retry: ${(e as Error).message}` });
    // 500 makes PayPal retry delivery later.
    return { status: 500, body: { error: "Processing failed" } };
  }
  return { status: 200, body: { ok: true } };
}
