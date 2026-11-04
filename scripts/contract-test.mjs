/**
 * Full-stack contract test of the LIVE PayPal code path, against a local stateful mock of the
 * PayPal REST endpoints Unstuck uses. It exercises everything over real HTTP: OAuth, invoice
 * create/send/list/get, full-replacement PUT (rejecting read-only fields like the real API ignores/forbids),
 * remind, conditional rules, record payment, cancel-reminders, webhook signature verification,
 * and INVOICING.INVOICE.PAID delivery to the app.
 *
 * This is NOT a substitute for the real sandbox (see docs/PAYPAL_INTEGRATION.md → "Sandbox verification"),
 * but it proves the app's live gateway, webhook handler and plan logic work end to end.
 *
 *   npm run build && node scripts/contract-test.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MOCK_PORT = 4010;
const APP_PORT = 3007;
const APP = `http://localhost:${APP_PORT}`;
const WEBHOOK_ID = "WH-MOCK-123";

/* ---------------- mock PayPal ---------------- */
const invoices = new Map();
const calls = [];
const idem = new Map();
const money = (v) => Math.round(Number(v) * 100);
const dec = (m) => (m / 100).toFixed(2);

function recompute(inv) {
  const total = (inv.items ?? []).reduce((s, i) => s + Math.round(Number(i.quantity ?? 1) * money(i.unit_amount.value)), 0);
  const paid = (inv.payments?.transactions ?? []).reduce((s, t) => s + money(t.amount.value), 0);
  const cur = inv.detail.currency_code;
  inv.amount = { currency_code: cur, value: dec(total), breakdown: { item_total: { currency_code: cur, value: dec(total) } } };
  inv.due_amount = { currency_code: cur, value: dec(Math.max(0, total - paid)) };
  inv.payments = { ...(inv.payments ?? {}), paid_amount: { currency_code: cur, value: dec(paid) }, transactions: inv.payments?.transactions ?? [] };
  if (inv.status !== "DRAFT" && inv.status !== "CANCELLED") {
    const viaPP = inv.payments.transactions.some((t) => t.type === "PAYPAL");
    if (paid >= total && total > 0) inv.status = viaPP ? "PAID" : "MARKED_AS_PAID";
    else if (paid > 0) inv.status = "PARTIALLY_PAID";
  }
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "paypal-debug-id": `mock${Math.random().toString(16).slice(2, 10)}` });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${MOCK_PORT}`);
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw && req.headers["content-type"]?.includes("json") ? JSON.parse(raw) : raw;
  calls.push({ method: req.method, path: url.pathname, query: url.search, requestId: req.headers["paypal-request-id"], body });
  const p = url.pathname;

  if (p === "/v1/oauth2/token") {
    const ok = req.headers.authorization === `Basic ${Buffer.from("mock-id:mock-secret").toString("base64")}`;
    return ok ? send(res, 200, { access_token: "MOCK-TOKEN", token_type: "Bearer", expires_in: 32400 }) : send(res, 401, { error: "invalid_client" });
  }
  if (req.headers.authorization !== "Bearer MOCK-TOKEN") return send(res, 401, { name: "AUTHENTICATION_FAILURE" });

  // Idempotency: same PayPal-Request-Id + path returns the stored response.
  const key = req.headers["paypal-request-id"] ? `${req.method} ${p} ${req.headers["paypal-request-id"]}` : null;
  if (key && idem.has(key)) {
    const [s, b] = idem.get(key);
    return send(res, s, b);
  }
  const reply = (s, b) => {
    if (key) idem.set(key, [s, b]);
    send(res, s, b);
  };

  if (p === "/v1/notifications/verify-webhook-signature" && req.method === "POST") {
    const ok = body.transmission_sig === "valid-signature" && body.webhook_id === WEBHOOK_ID && body.webhook_event?.id;
    return reply(200, { verification_status: ok ? "SUCCESS" : "FAILURE" });
  }
  if (p === "/v2/invoicing/invoices" && req.method === "POST") {
    const id = `INV2-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const inv = { id, status: "DRAFT", ...body, detail: { ...body.detail, metadata: { create_time: new Date().toISOString(), recipient_view_url: `https://www.sandbox.paypal.com/invoice/p/#${id}` } }, payments: { transactions: [] } };
    recompute(inv);
    invoices.set(id, inv);
    return reply(201, inv);
  }
  if (p === "/v2/invoicing/invoices" && req.method === "GET") {
    const items = [...invoices.values()].map((i) => ({ id: i.id, status: i.status, detail: { invoice_number: i.detail.invoice_number, currency_code: i.detail.currency_code } }));
    return reply(200, { items, total_items: items.length, total_pages: 1 });
  }
  const m = /^\/v2\/invoicing\/invoices\/([^/]+)(\/[a-z-]+)?$/.exec(p);
  if (m) {
    const inv = invoices.get(m[1]);
    if (!inv) return reply(404, { name: "RESOURCE_NOT_FOUND" });
    const sub = m[2];
    if (!sub && req.method === "GET") return reply(200, inv);
    if (!sub && req.method === "PUT") {
      const forbidden = ["id", "status", "payments", "due_amount", "links"].filter((k) => k in body);
      if (forbidden.length || body.detail?.metadata) return reply(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "READ_ONLY_FIELD", description: `Read-only fields sent: ${forbidden.join(", ") || "detail.metadata"}` }] });
      if (!body.items?.length || !body.primary_recipients?.length) return reply(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "MISSING_REQUIRED_FIELD", description: "Full replacement requires items and primary_recipients" }] });
      const pp = body.configuration?.partial_payment;
      const next = { ...body, id: inv.id, status: inv.status, payments: inv.payments, detail: { ...body.detail, metadata: inv.detail.metadata } };
      recompute(next);
      if (pp?.allow_partial_payment && pp.minimum_amount_due && money(pp.minimum_amount_due.value) > money(next.due_amount.value)) {
        return reply(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INVALID_MINIMUM_AMOUNT_DUE" }] });
      }
      invoices.set(inv.id, next);
      return reply(200, next);
    }
    if (sub === "/send") {
      inv.status = "SENT";
      return reply(200, { links: [{ href: `https://www.sandbox.paypal.com/invoice/p/#${inv.id}`, rel: "payer-view" }] });
    }
    if (sub === "/remind") return body.subject && body.note ? reply(204) : reply(400, { name: "INVALID_REQUEST" });
    if (sub === "/cancel-reminders") return reply(204);
    if (sub === "/conditional-rules") {
      const r = body.rules?.[0];
      if (!r?.rule_expiry_terms?.condition_rule_end_date) return reply(400, { name: "INVALID_REQUEST", details: [{ issue: "MISSING_EXPIRY" }] });
      inv.conditional_rules = body.rules;
      return reply(204);
    }
    if (sub === "/payments") {
      if (money(body.amount.value) > money(inv.due_amount.value)) return reply(422, { name: "UNPROCESSABLE_ENTITY" });
      inv.payments.transactions.push({ payment_id: `EXTR-${Date.now()}`, type: "EXTERNAL", method: body.method, payment_date: body.payment_date, amount: body.amount });
      recompute(inv);
      return reply(200, { payment_id: inv.payments.transactions.at(-1).payment_id });
    }
  }
  return send(res, 404, { name: "NOT_MOCKED", path: p });
});

/** Simulate the buyer paying `amount` on PayPal's invoice page, then PayPal sending the webhook. */
async function buyerPays(id, amount, signature = "valid-signature") {
  const inv = invoices.get(id);
  const due = money(inv.due_amount.value);
  const pp = inv.configuration?.partial_payment;
  if (money(amount) < due && (!pp?.allow_partial_payment || money(amount) < money(pp.minimum_amount_due?.value ?? "0"))) throw new Error(`PayPal would refuse a ${amount} payment`);
  inv.payments.transactions.push({ payment_id: `PAYID-${Date.now()}`, type: "PAYPAL", payment_date: new Date().toISOString().slice(0, 10), amount: { currency_code: "USD", value: amount } });
  recompute(inv);
  const event = { id: `WH-${randomUUID()}`, event_type: "INVOICING.INVOICE.PAID", resource_type: "invoices", resource: { invoice: { id, status: inv.status } } };
  const res = await fetch(`${APP}/api/webhooks/paypal`, {
    method: "POST",
    headers: { "content-type": "application/json", "paypal-transmission-id": randomUUID(), "paypal-transmission-time": new Date().toISOString(), "paypal-transmission-sig": signature, "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-mock", "paypal-auth-algo": "SHA256withRSA" },
    body: JSON.stringify(event),
  });
  return { status: res.status, body: await res.json(), event };
}

/* ---------------- test driver ---------------- */
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const api = async (p, body) => {
  const r = await fetch(`${APP}${p}`, { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
};

await new Promise((r) => mock.listen(MOCK_PORT, r));
const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "unstuck-ct-")), "ct.db");
const env = {
  ...process.env,
  PAYPAL_CLIENT_ID: "mock-id",
  PAYPAL_CLIENT_SECRET: "mock-secret",
  PAYPAL_ENV: "sandbox",
  PAYPAL_API_BASE: `http://localhost:${MOCK_PORT}`,
  PAYPAL_WEBHOOK_ID: WEBHOOK_ID,
  DEMO_PAYER_EMAIL: "buyer@personal.example",
  DATABASE_PATH: dbPath,
  APP_BASE_URL: APP,
  UNSTUCK_MODE: "",
  ANTHROPIC_API_KEY: "",
};
let app;
try {
  // Seed through the real seeding script (live gateway → mock PayPal).
  const seed = spawn("npx", ["tsx", "scripts/seed-sandbox.ts"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let seedOut = "";
  seed.stdout.on("data", (d) => (seedOut += d));
  seed.stderr.on("data", (d) => (seedOut += d));
  const code = await new Promise((r) => seed.on("close", r));
  check("seed-sandbox created invoices via PayPal API", code === 0 && invoices.size === 12, `${invoices.size} invoices, exit ${code}`);
  if (code !== 0) console.log(seedOut);
  check("seeding used idempotency keys", calls.filter((c) => c.method === "POST" && c.path.startsWith("/v2/")).every((c) => !!c.requestId));

  app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { env, stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${APP}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const health = await api("/api/health");
  check("app runs in PayPal sandbox mode", health.data.paypal === "sandbox" && health.data.webhookConfigured, JSON.stringify(health.data));

  const sync = await api("/api/sync", {});
  check("sync pulls invoices from PayPal", sync.status === 200 && sync.data.count === 12, `count ${sync.data.count}`);

  const diag = await api("/api/diagnose", {});
  check("diagnose all", diag.status === 200 && diag.data.results.every((r) => r.ok));

  const board = (await api("/api/board")).data;
  const byClient = (c) => board.rows.find((r) => r.client === c && r.open);
  const lumen = byClient("Lumen Yoga");
  check("auto reminder hit PayPal /remind with an idempotency key", calls.some((c) => c.path === `/v2/invoicing/invoices/${lumen.id}/remind` && c.requestId?.startsWith("unstuck-act_")));
  const harbor = byClient("Harbor Dental");
  check("dispute paused PayPal auto-reminders", calls.some((c) => c.path === `/v2/invoicing/invoices/${harbor.id}/cancel-reminders`));
  check("dispute: no reminder sent to the client", !calls.some((c) => c.path === `/v2/invoicing/invoices/${harbor.id}/remind`));

  // Owner approves the PO fix → full-replacement PUT accepted by the strict mock.
  const nw = byClient("Northwind Logistics");
  const nwAction = board.pending.find((a) => a.invoice_id === nw.id && a.type === "update_reference");
  const approved = await api(`/api/actions/${nwAction.id}/approve`, {});
  const nwInv = invoices.get(nw.id);
  check("PO fix: PUT accepted (read-only fields stripped)", approved.data.status === "executed", approved.data.error ?? "");
  check("PO fix: reference + AP CC persisted in PayPal, items/recipients intact", nwInv.detail.reference === "PO-88412" && nwInv.additional_recipients?.[0]?.email_address === "ap@northwind.example" && nwInv.items.length === 1 && nwInv.primary_recipients.length === 1);
  check("PO fix: re-sent to recipient", calls.some((c) => c.method === "PUT" && c.path.endsWith(nw.id) && c.query.includes("send_to_recipient=true")));

  // Double-approve is rejected; idempotent at PayPal anyway.
  const again = await api(`/api/actions/${nwAction.id}/approve`, {});
  check("double approval rejected", again.status >= 400);

  // Payer plan on Bluebird.
  const bb = byClient("Bluebird Café");
  const detail = (await api(`/api/invoices/${bb.id}`)).data;
  const token = new URL(detail.resolutionUrl).pathname.split("/").pop();
  const chat = await api(`/api/pay/${token}/messages`, { body: "Could I split this into a few payments?" });
  const offer = chat.data.view.offers.filter((o) => o.status === "open").at(-1);
  const accepted = await api(`/api/pay/${token}/offers/${offer.id}/accept`, {});
  const bbInv = invoices.get(bb.id);
  check("plan accepted → PayPal partial payments enabled", accepted.data.actionStatus === "executed" && bbInv.configuration.partial_payment.allow_partial_payment === true && bbInv.configuration.partial_payment.minimum_amount_due.value === "400.00", accepted.data.error ?? "");
  check("plan note written to the PayPal invoice", /Payment plan agreed/.test(bbInv.detail.note ?? ""));

  // Forged webhook is refused.
  let forged;
  try {
    const before = JSON.stringify(invoices.get(bb.id).payments);
    forged = await buyerPays(bb.id, "400.00", "forged");
    invoices.get(bb.id).payments = JSON.parse(before);
    recompute(invoices.get(bb.id));
  } catch (e) {
    forged = { status: 0, error: e.message };
  }
  check("forged webhook rejected (401)", forged.status === 401);

  // Buyer pays installment 1 on PayPal → signed webhook → plan advances.
  const paid1 = await buyerPays(bb.id, "400.00");
  check("verified webhook processed", paid1.status === 200, JSON.stringify(paid1.body));
  const dup = await fetch(`${APP}/api/webhooks/paypal`, { method: "POST", headers: { "content-type": "application/json", "paypal-transmission-sig": "valid-signature" }, body: JSON.stringify(paid1.event) }).then((r) => r.json());
  check("duplicate webhook delivery ignored", dup.duplicate === true);
  const bbRow = (await api(`/api/invoices/${bb.id}`)).data;
  check("invoice re-fetched from PayPal: PARTIALLY_PAID, $800 due", bbRow.row.status === "PARTIALLY_PAID" && bbRow.row.dueMinor === 80000);
  check("plan shows installment 1 paid", bbRow.plan.progress.rows[0].state === "paid" && bbRow.plan.progress.rows[1].state === "due");

  await buyerPays(bb.id, "400.00");
  await buyerPays(bb.id, "400.00");
  const done = (await api(`/api/invoices/${bb.id}`)).data;
  check("plan completed after final installment", done.row.status === "PAID" && done.plan.status === "completed");
  const after = (await api("/api/board")).data;
  check("cash unstuck = $1,200", after.kpis.cashUnstuckMinor === 120000, String(after.kpis.cashUnstuckMinor));

  // Owner records Atlas's cheque.
  const atlas = byClient("Atlas Robotics");
  const atlasAction = after.pending.find((a) => a.invoice_id === atlas.id && a.type === "record_external_payment");
  const rec = await api(`/api/actions/${atlasAction.id}/approve`, {});
  check("record cheque payment → MARKED_AS_PAID in PayPal", rec.data.status === "executed" && invoices.get(atlas.id).status === "MARKED_AS_PAID");

  // Owner adds an early-payment discount to Fernwood.
  const fern = byClient("Fernwood Architects");
  const disc = await fetch(`${APP}/api/invoices/${fern.id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "add_early_payment_discount", params: { percent: 2, expires_on: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) } }) }).then((r) => r.json());
  check("early-payment discount → PayPal conditional rule", disc.status === "executed" && invoices.get(fern.id).conditional_rules?.[0]?.conditional_rule_value === "2");
} catch (e) {
  check("contract run completed", false, e.stack);
} finally {
  app?.kill();
  mock.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} contract checks passed; ${calls.length} PayPal API calls made`);
process.exit(failed ? 1 : 0);
