# Security Audit

_Self-audit, 2026-11-04. Design rationale in `docs/SECURITY_DESIGN.md`._

| Check | Result | Evidence |
|---|---|---|
| Secrets in git | ✅ None | `git ls-files` has no `.env`/`.db`; `.gitignore` covers `.env*` except `.env.example` |
| Secrets to browser | ✅ None | Keys read only in server modules (`config.ts`, `ai/anthropic.ts`, `paypal/client.ts`); `/api/health` exposes booleans and model id only |
| Dependency vulnerabilities | ✅ 0 | `npm audit` |
| SQL injection | ✅ | All queries are prepared statements with bound parameters |
| XSS | ✅ | No `dangerouslySetInnerHTML`; user and AI text rendered as React text nodes; AG Grid overlay templates are static strings |
| CSRF | ✅ | JSON content type + Origin/Host match on every owner mutation (`assertSameOrigin`) |
| Webhook authenticity | ✅ | Signature verified with PayPal (fails closed without `PAYPAL_WEBHOOK_ID`); forged event → 401 (contract test) |
| Webhook replay | ✅ | Event-id dedupe (contract test) |
| Payment tampering | ✅ | Amounts never taken from webhook payloads or the client; plan totals re-checked against PayPal's current `due_amount` before execution |
| Duplicate execution | ✅ | Atomic status transitions + `PayPal-Request-Id` per action (double approval → 4xx in contract test) |
| Authorization on payer routes | ✅ | Token → single invoice; offer must belong to that invoice; simulation endpoint refuses in sandbox mode |
| Prompt injection | ✅ mitigated | Untrusted-data wrapping + no dangerous tools + policy gate (unit test with a scripted injection attempt) |
| Rate limiting | ⚠️ partial | Payer chat limited per link; AI calls capped per day; owner APIs not rate-limited (owner-only surface) |
| Owner authentication | ⚠️ optional | `OWNER_BASIC_AUTH` available; open by default for judge access to a **sandbox** demo |
| Sensitive logging | ✅ | Server logs only 5xx errors; no tokens or credentials logged; audit events hold invoice-level data only |
| Real-money safety | ✅ | Non-sandbox `PAYPAL_ENV` refused |
| Security headers | ✅ | `nosniff`, `DENY` framing, referrer policy, `poweredByHeader: false` |

**Recommended before production:** real accounts/roles, constant-time credential comparison, persistent encrypted database, per-IP rate limits, CSP with nonces, and DPA review for sending client correspondence to an AI provider.
