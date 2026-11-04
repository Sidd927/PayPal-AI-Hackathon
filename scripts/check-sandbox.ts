/**
 * Verify PayPal sandbox connectivity and (optionally) register the Unstuck webhook.
 *
 *   npm run check:sandbox                       # OAuth + list invoices + list webhooks
 *   npm run check:sandbox -- --register-webhook # also register APP_BASE_URL/api/webhooks/paypal (must be public https)
 *
 * Reads PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / APP_BASE_URL from the environment (.env.local is loaded).
 */
import fs from "node:fs";
import { PayPalClient, PAYPAL_SANDBOX_BASE } from "../src/lib/paypal/client";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const EVENTS = ["INVOICING.INVOICE.PAID", "INVOICING.INVOICE.UPDATED", "INVOICING.INVOICE.CANCELLED", "INVOICING.INVOICE.REFUNDED"];

async function main() {
  const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (sandbox app credentials from developer.paypal.com).");
  const client = new PayPalClient({ clientId: id, clientSecret: secret, baseUrl: process.env.PAYPAL_API_BASE || PAYPAL_SANDBOX_BASE });

  await client.getAccessToken();
  console.log("✓ OAuth token obtained from", client.baseUrl);

  const list = await client.request<{ total_items?: number; items?: { id: string; status: string; detail?: { invoice_number?: string } }[] }>("GET", "/v2/invoicing/invoices", { query: { page: 1, page_size: 20, total_required: true } });
  console.log(`✓ Invoicing API reachable: ${list.data.total_items ?? list.data.items?.length ?? 0} invoices (debug id ${list.debugId})`);
  for (const i of list.data.items?.slice(0, 10) ?? []) console.log(`    ${i.detail?.invoice_number ?? "—"}  ${i.status}  ${i.id}`);

  const hooks = await client.request<{ webhooks?: { id: string; url: string; event_types: { name: string }[] }[] }>("GET", "/v1/notifications/webhooks");
  const ours = hooks.data.webhooks?.filter((w) => w.url.endsWith("/api/webhooks/paypal")) ?? [];
  console.log(`✓ Webhooks API reachable: ${hooks.data.webhooks?.length ?? 0} registered${ours.length ? `, Unstuck: ${ours.map((w) => `${w.id} → ${w.url}`).join(", ")}` : ""}`);

  if (process.argv.includes("--register-webhook")) {
    const base = process.env.APP_BASE_URL;
    if (!base?.startsWith("https://")) throw new Error("APP_BASE_URL must be a public https URL to register a webhook.");
    const url = `${base.replace(/\/$/, "")}/api/webhooks/paypal`;
    const existing = ours.find((w) => w.url === url);
    if (existing) {
      console.log(`✓ Webhook already registered. Set PAYPAL_WEBHOOK_ID=${existing.id}`);
      return;
    }
    const res = await client.request<{ id: string }>("POST", "/v1/notifications/webhooks", { requestId: `unstuck-webhook-${Date.now()}`, body: { url, event_types: EVENTS.map((name) => ({ name })) } });
    console.log(`✓ Registered ${url}\n  Set PAYPAL_WEBHOOK_ID=${res.data.id} in your environment and restart Unstuck.`);
  }
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
