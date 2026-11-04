# API Specification

All endpoints are JSON. Owner mutations require `Content-Type: application/json`, and the request `Origin` (when present) must match the host (CSRF defence). If `OWNER_BASIC_AUTH` is set, everything except `/r/*`, `/api/pay/*`, `/api/webhooks/*` and `/api/health` requires HTTP Basic auth.

## Owner

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | — | `{ok, paypal: sandbox\|simulation\|misconfigured, webhookConfigured, ai: claude\|rules, model}` |
| GET | `/api/board` | — | KPIs, rows (board read model), pending actions, recent events, policy, mode |
| POST | `/api/sync` | `{}` | `{count, receipt}` — pulls invoices from PayPal; advances plans if payments are seen |
| POST | `/api/diagnose` | `{invoiceId?, force?}` | One invoice: `{skipped, diagnosisId, source, actions[]}`; all: `{results[]}` |
| GET | `/api/invoices/:id` | — | Invoice, diagnosis, messages, actions, events, plan progress, offers, resolution URL |
| POST | `/api/invoices/:id/messages` | `{author: client\|owner, body}` | `{id}` |
| POST | `/api/invoices/:id/actions` | `{type, params, rationale?}` | Owner-initiated action (validated + policy-checked); 422 if blocked |
| POST | `/api/actions/:id/approve` | `{params?}` | Executed action (params edits re-validated as an owner action) |
| POST | `/api/actions/:id/reject` | `{reason?}` | Rejected action |
| GET / PUT | `/api/policy` | partial policy | Policy (zod-validated) |
| GET | `/api/activity` | — | Last 500 audit events |
| POST | `/api/demo/reset` | `{}` | Simulation: re-seed. Sandbox: clear local state, re-sync |

## Payer (token-scoped, public)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/pay/:token` | — | Payer view (invoice summary, PayPal pay URL, plan, offers, chat) |
| POST | `/api/pay/:token/messages` | `{body ≤1500}` | Agent turn + updated view. Rate-limited to 12 per 10 min per link |
| POST | `/api/pay/:token/offers/:offerId/accept` | `{}` | `{pendingOwner, actionStatus, view}` |
| POST | `/api/pay/:token/simulate-payment` | `{amount}` | Simulation mode only (409 otherwise) |

## PayPal

| Method | Path | Notes |
|---|---|---|
| POST | `/api/webhooks/paypal` | Verified via `POST /v1/notifications/verify-webhook-signature` with `PAYPAL_WEBHOOK_ID`. 401 if unverified; duplicates → `{duplicate: true}`; processing failure → 500 so PayPal retries |

## Action types

| `type` | `params` | PayPal call on execution |
|---|---|---|
| `send_reminder` | `{subject, note, additional_recipients?}` | `POST /v2/invoicing/invoices/{id}/remind` |
| `offer_payment_plan` | `{installments: [{amount_minor, due_date}]}` | `GET` + `PUT /v2/invoicing/invoices/{id}` (partial payments, minimum due, note) |
| `add_early_payment_discount` | `{percent, expires_on}` | `POST …/conditional-rules` (`EARLY_PAYMENT_DISCOUNT`, `SPECIFIC_DATE`) |
| `update_reference` | `{reference, note_append?, cc_email?}` | `GET` + `PUT …?send_to_recipient=true` |
| `record_external_payment` | `{amount_minor, method, payment_date, note?}` | `POST …/payments` |
| `pause_reminders` | `{}` | `POST …/cancel-reminders` |
| `escalate_to_owner` | `{summary, draft_reply?}` | none |
| `wait` | `{until, reason}` | none |
