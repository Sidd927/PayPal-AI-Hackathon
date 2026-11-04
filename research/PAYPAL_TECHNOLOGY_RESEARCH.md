# PayPal Technology Research

_2026-11-04. Primary technical source: the published source of `@paypal/agent-toolkit@1.11.0` and `@paypal/paypal-server-sdk@2.5.0` (both released 2026-09-29, downloaded from npm and inspected). Secondary: PayPal developer docs via search extracts._

## Ecosystem map

| Capability | Availability | Notes |
|---|---|---|
| Orders v2 (`/v2/checkout/orders`) | Server SDK + Agent Toolkit | Standard checkout |
| Payments v2 (captures, refunds) | Server SDK + Agent Toolkit | |
| **Invoicing v2** (`/v2/invoicing/...`) | **Agent Toolkit only** (not in server SDK) | The richest set of agent tools in the toolkit — see below |
| Recurring invoices | Agent Toolkit | `/v2/invoicing/recurring-invoices` |
| Subscriptions (`/v1/billing`) | Both | |
| Disputes (`/v1/customer/disputes`) | Agent Toolkit | list/get/accept-claim |
| Shipment tracking (`/v1/shipping/trackers`) | Agent Toolkit | |
| Transaction search / Merchant insights | Both / toolkit | |
| Payouts (`/v1/payments/payouts`) | REST; supports Venmo wallet (`PHONE`/`EMAIL`/`USER_HANDLE`) | Not in either package |
| Webhooks + signature verification | REST `/v1/notifications/verify-webhook-signature` | |
| PayPal MCP Server | `@paypal/mcp@1.8.1` (local) and remote `mcp.sandbox.paypal.com` | Exposes the same toolkit tools to MCP clients |
| Agentic commerce services | "Agent Ready" (payments on AI surfaces), "Store Sync" (catalog to AI platforms), ACP adoption for ChatGPT | Announced Oct 2025; merchant-facing programmes, not open sandbox APIs |

## Invoicing v2 — verified operations (from toolkit source)

| Operation | Endpoint | Use in Unstuck |
|---|---|---|
| Generate next number | `POST /v2/invoicing/generate-next-invoice-number` | Seeding demo invoices |
| Create draft | `POST /v2/invoicing/invoices` | Seed / new invoice |
| Send | `POST /v2/invoicing/invoices/{id}/send` | Seed |
| Get / list / search | `GET /v2/invoicing/invoices/{id}`, `GET /v2/invoicing/invoices`, `POST /v2/invoicing/search-invoices` | Sync loop |
| Full update | `PUT /v2/invoicing/invoices/{id}` | **Enable partial payments + minimum due** (payment plans), add PO number / reference |
| Remind | `POST /v2/invoicing/invoices/{id}/remind` (`subject`, `note`, `send_to_recipient`…) | **AI-written, reason-aware reminder delivered by PayPal** |
| Conditional rules | `POST /v2/invoicing/invoices/{id}/conditional-rules` — `EARLY_PAYMENT_DISCOUNT` (PERCENT/AMOUNT) or `AUTO_CANCEL`, with expiry | **Early-payment incentive** |
| Auto reminders | `POST /v2/invoicing/setup-reminders`, `PUT /v2/invoicing/reminders/{id}`, cancel | Pause PayPal's generic reminders while a plan/dispute is active |
| Record external payment | `POST /v2/invoicing/invoices/{id}/payments` | "Client says they paid by check" |
| Cancel | `POST /v2/invoicing/invoices/{id}/cancel` | Write-off (owner approval only) |
| QR code | `POST /v2/invoicing/invoices/{id}/generate-qr-code` | Resolution page |

**Partial payments** (`configuration.partial_payment.allow_partial_payment`, `minimum_amount_due`) — supported except for users in India, Brazil, Israel (toolkit schema description). The invoice shows **PARTIALLY_PAID** until settled.

### Webhooks

- `INVOICING.INVOICE.PAID` fires for **full, partial or pending** payments → handler must re-fetch the invoice and read `status` / `payments`.
- `INVOICING.INVOICE.CANCELLED`, `INVOICING.INVOICE.REFUNDED`, `INVOICING.INVOICE.SCHEDULED`, `INVOICING.INVOICE.UPDATED`.
- PayPal signs webhook payloads; verify via `POST /v1/notifications/verify-webhook-signature` using `PAYPAL_WEBHOOK_ID`.
- Sandbox test path documented by PayPal: create → send → `POST .../payments` triggers `INVOICING.INVOICE.PAID`.

### Auth & reliability

- OAuth2 client-credentials: `POST /v1/oauth2/token` (Basic auth) → bearer token, cache until `expires_in`.
- `PayPal-Request-Id` header for idempotent POSTs.
- Sandbox base `https://api-m.sandbox.paypal.com`; live `https://api-m.paypal.com`.

## Why Invoicing is the right PayPal surface

1. Invoicing is how PayPal serves **service businesses and freelancers** who do not run a storefront.
2. PayPal invested in it heavily for agents: 20 of the toolkit's ~45 tools are invoicing tools, many newly added in 2026 (conditional rules, auto reminders, recurring series).
3. Every remedy for a stuck invoice maps onto a **native PayPal primitive** — partial payments, early-payment discounts, reminders, recorded payments — so the agent's work produces real PayPal state changes, not just text.

## What PayPal already does (so we don't duplicate it)

- Sends invoices and **generic scheduled reminders** (before/after due).
- Lets the payer pay in full, or partially if enabled.

What it does **not** do: understand *why* a particular client hasn't paid, choose the right remedy, negotiate a plan with the client within the owner's rules, or keep the owner's relationship intact while doing it. That is Unstuck's job.

## Sources

- npm: https://www.npmjs.com/package/@paypal/agent-toolkit (v1.11.0), https://www.npmjs.com/package/@paypal/paypal-server-sdk (v2.5.0), https://www.npmjs.com/package/@paypal/mcp (v1.8.1)
- https://developer.paypal.com/docs/invoicing/ · https://developer.paypal.com/api/invoicing/webhooks · https://docs.paypal.ai/growth/grow-business/invoicing/webhooks
- https://developer.paypal.com/api/payouts · https://docs.paypal.ai/developer/tools/ai/mcp-quickstart.md
- https://www.digitalcommerce360.com/2025/10/28/paypal-agentic-commerce-ai-driven-shopping-services/ · https://paypal.ai/
