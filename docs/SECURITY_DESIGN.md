# Security Design

## Threat model (hackathon scope)

| Asset | Threat | Control |
|---|---|---|
| PayPal & Anthropic credentials | Leak via repo, logs, client bundle | Env vars only; `.env*` git-ignored; never sent to the browser; errors in production return generic messages; `.env.example` has no values |
| Money / invoice terms | AI hallucination or prompt injection changes terms | Structured outputs → `sanitize()` → typed params (zod) → **policy engine** → owner approval for money changes; arithmetic re-checked at execution; payer agent has no amount-changing tools |
| Invoice state | Double execution, races | Atomic status transitions; action id doubles as `PayPal-Request-Id`; offers accepted once |
| Webhooks | Forged or replayed events | PayPal signature verification with `PAYPAL_WEBHOOK_ID` (fails closed); event-id dedupe; payloads never trusted for amounts; refused entirely in simulation |
| Payer page | Enumeration / data exposure | 144-bit random token per invoice; the page shows only that invoice; `noindex`; message length cap and rate limit (12 per 10 min) |
| Owner console | Unauthorised use on a hosted demo | Optional `OWNER_BASIC_AUTH` (Next.js proxy). Left open by default so judges can explore the sandbox demo — documented trade-off |
| CSRF | Cross-site POSTs to owner APIs | `Content-Type: application/json` required (forces preflight) and `Origin` must match `Host` |
| XSS | Client messages rendered in UI | React escaping; no `dangerouslySetInnerHTML`; AG Grid cells use React renderers |
| SQL injection | User text in queries | Prepared statements only |
| Clickjacking / sniffing | — | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` |
| Cost abuse | Flooding AI calls | `AI_DAILY_CALL_LIMIT`, payer rate limit, diagnosis caching |
| Real money | Accidental live use | Gateway refuses any `PAYPAL_ENV` other than `sandbox` |

## Prompt-injection posture

Client-authored text is wrapped as data, the system prompts say so, and — more importantly — **nothing the model says is executed without deterministic checks**. The worst case for a successful injection is a badly worded draft that waits for owner approval, or an offer the policy already allows.

## Known limitations

- No multi-user accounts or roles (single owner per deployment).
- Basic-auth comparison is not constant-time.
- The payer link is a bearer secret; anyone with it can see that invoice (stated on the page).
- SQLite file on ephemeral storage when hosted on Render free.

## Phase 3 additions

- **Execution-time re-check:** `executeAction` re-evaluates the rules against PayPal's current invoice before any write. A `block` fails the action; a formerly automatic action that now needs approval returns to the owner. Owner approval never overrides `block`.
- **Fail-closed owner console:** with `NODE_ENV=production` and real PayPal credentials, the proxy returns 503 until `OWNER_BASIC_AUTH` is set. Credentials are compared in constant time.
- **Outbound content gate:** agent-written reminders containing a foreign link, another way to pay, an email address or legal or threatening language need the owner.
- **Sandbox guard:** a production PayPal host in `PAYPAL_API_BASE` is refused.

Full audit: `qa/FINAL_SECURITY_AND_RELIABILITY_REPORT.md`.
