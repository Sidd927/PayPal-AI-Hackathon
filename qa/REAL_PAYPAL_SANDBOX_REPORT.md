# Real PayPal Sandbox Report

**Status: NOT YET VERIFIED AGAINST THE REAL SANDBOX.** Nothing in this repository claims a real PayPal transaction has occurred.

**Exact blockers (rechecked 2026-11-04, Phase 3):**

1. Network: `curl -X POST https://api-m.sandbox.paypal.com/v1/oauth2/token` from this build environment returns no connection (HTTP 000; the egress proxy refuses the tunnel). `api.anthropic.com` and GitHub are reachable from the same environment, so this is a host allow-list, not an outage.
2. Credentials: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID` are not set, and there is no `.env`. They must come from the owner's PayPal developer account; none were invented.

**Fastest path for the owner (about 20 minutes, on any machine with normal internet):**

```bash
git clone https://github.com/Sidd927/PayPal-AI-Hackathon && cd PayPal-AI-Hackathon && npm ci
cp .env.example .env    # fill PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, DEMO_PAYER_EMAIL (sandbox personal account)
npm run check:sandbox   # rows 1–3 below
npm run seed:sandbox    # rows 4–6
npm run build && OWNER_BASIC_AUTH="you:a-long-password" npm start   # production + live PayPal now requires an owner password
```

Then walk rows 7–17 in the browser and paste the debug ids into the last table.

## What *is* verified

| Layer | Evidence |
|---|---|
| Request shapes | Matched against the source of PayPal's official `@paypal/agent-toolkit` 1.11.0, which implements the same Invoicing endpoints |
| Client behaviour (OAuth caching, 401 refresh, idempotency header, retry rules, error mapping, debug ids) | `tests/paypal-client.test.ts` |
| Full-replacement PUT body | Unit test + strict mock that **rejects** read-only fields and missing items/recipients |
| End-to-end live code path over HTTP | `npm run test:contract`: 25/25 checks, 97 calls against a stateful mock (seed, sync, remind, PUT, conditional rules, record payment, cancel reminders, signed, forged and duplicate webhooks, plan progression to PAID) |
| Webhook resource shape | Handler accepts `resource.id` (as in PayPal's published sample, `INV2-…`) and `resource.invoice.id` |

## Operations used and how to verify each in the sandbox

| # | Operation | Endpoint | How to verify | Expected evidence |
|---|---|---|---|---|
| 1 | OAuth | `POST /v1/oauth2/token` | `npm run check:sandbox` | "✓ OAuth token obtained" |
| 2 | List invoices | `GET /v2/invoicing/invoices` | same | "✓ Invoicing API reachable", plus a debug id |
| 3 | Webhooks API | `GET /v1/notifications/webhooks` | same | "✓ Webhooks API reachable" |
| 4 | Create + send | `POST /v2/invoicing/invoices`, `POST …/send` | `npm run seed:sandbox` | 12 ids; visible at sandbox.paypal.com under the business account → Invoices |
| 5 | Back-dated invoice / past due date | (create) | Note whether the seeder prints "rejected back-dated … creating with today's date" | Unknown until run; the fallback keeps the demo working |
| 6 | Record payment (history) | `POST …/payments` | Seed history invoices show MARKED_AS_PAID | Status in the PayPal UI |
| 7 | Get invoice | `GET …/{id}` | Open any invoice drawer → "Open the invoice in PayPal" | `recipient_view_url` present |
| 8 | Remind | `POST …/remind` | Run the agent → Lumen reminder; Activity shows `POST … /remind → 204` and a debug id | Reminder listed in the sandbox invoice's history / Notifications |
| 9 | Full update (reference + CC) | `PUT …/{id}?send_to_recipient=true` | Approve the Northwind PO fix | Reference `PO-88412` and CC visible on the sandbox invoice |
| 10 | Partial payments | `PUT …` with `configuration.partial_payment` | Bluebird payer page → accept a plan | Sandbox invoice page lets the buyer pay ≥ $400 |
| 11 | Payer pays | PayPal hosted invoice page | Log in as `DEMO_PAYER_EMAIL`, pay $400 | Status PARTIALLY_PAID |
| 12 | Webhook PAID | `INVOICING.INVOICE.PAID` → `/api/webhooks/paypal` | Requires a public https URL + `PAYPAL_WEBHOOK_ID` | Activity: "PayPal webhook INVOICING.INVOICE.PAID (verified)"; plan 1/3 paid |
| 13 | Verify signature | `POST /v1/notifications/verify-webhook-signature` | Same | `verification_status: SUCCESS` (a forged POST is rejected with 401) |
| 14 | Minimum due advances | `PUT …` | After installment 1 | `minimum_amount_due` = next installment |
| 15 | Conditional rule | `POST …/conditional-rules` | Approve the Fernwood discount (owner action) | Discount visible on the sandbox invoice |
| 16 | Cancel reminders | `POST …/cancel-reminders` | Run the agent (Harbor dispute) | 204 in Activity |
| 17 | Error scenario | Any | Set a wrong `PAYPAL_CLIENT_SECRET` | UI badge "PayPal misconfigured"; sync shows "PayPal authentication failed (401)" |

## Sandbox requirements

- A PayPal developer account, with a sandbox **business** account (the invoicer) and a sandbox **personal** account (the payer). Both are created by default under Testing Tools → Sandbox Accounts.
- A REST app (Apps & Credentials → Sandbox) → `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
- `OWNER_BASIC_AUTH` when running `next start` with real credentials: the owner console fails closed (503) without it.
- For webhooks: a public https URL (Render, or a tunnel such as `cloudflared tunnel --url http://localhost:3000`), then `npm run check:sandbox -- --register-webhook` → `PAYPAL_WEBHOOK_ID`.
- **Known PayPal behaviour:** webhook events fire only for the REST app that processed the action. Create the invoices (seed) with the same app whose webhook is registered.

## Optional developer aid

PayPal's open-source [AI-Toolkit](https://github.com/paypal/AI-Toolkit) is a Claude Code plugin with PayPal best-practice skills, a pre-edit hook and a sandbox MCP server. It is useful when debugging this integration locally (`/plugin install paypal@claude-plugins-official`). It is a development tool, not a runtime dependency of Unstuck. It wasn't installed here because the sandbox was unreachable.

## Fill in after the run

| # | Result | Debug id / screenshot |
|---|---|---|
| 1–17 | _pending_ | |
