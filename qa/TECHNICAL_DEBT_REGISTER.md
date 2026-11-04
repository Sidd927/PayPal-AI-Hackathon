# Technical Debt Register

| # | Debt | Impact | Fix | Priority |
|---|---|---|---|---|
| T1 | Owner console unauthenticated unless `OWNER_BASIC_AUTH` is set. **Phase 3:** fails closed in production when real PayPal is connected; simulation demos stay open | Anyone with a simulation URL can approve *simulated* actions | Real auth (passkeys / OAuth) | Medium (production), accepted for the demo |
| T2 | SQLite on ephemeral disk (Render free) | Audit log and agent runs reset on restart; PayPal state survives | Persistent disk or managed Postgres | Medium |
| T3 | No background scheduler on the free tier | Follow-ups run only when someone clicks Run (or a paid cron calls the token-protected endpoint) | Render cron or a queue | Medium |
| T4 | `npm run lint` is `tsc` only | Style issues not caught | Add ESLint (next/core-web-vitals) | Low |
| T5 | E2E relies on a globally installed Playwright | Judges need `npm i -D playwright` | Document (done) or add a devDependency | Low |
| T6 | `legacy-peer-deps` in `.npmrc` | Works around an npm arborist crash with Vitest 5 peers | Revisit when npm fixes it | Low |
| T7 | Payer-chat rate limiter is in-memory | Resets on restart; per instance | Redis or DB-backed limiter | Low |
| T8 | ~~Basic-auth comparison not constant-time~~ **Fixed in Phase 3** (`safeEqual` in `src/proxy.ts`) | — | — | Done |
| T9 | ~~Owner console shipped 1.9 MB JS on phones~~ **Fixed:** the grid is code-split and loaded only at md+, and prefetch is off for the grid-heavy routes. Phone: 626 KB (−68%) | — | — | Done |
| T10 | AG Studio report state is hand-written against the 3.0.0 types | A future AG Studio upgrade may need state migration | Pin the version (done) | Low |
| T11 | Confidence is self-reported by the model | Not calibrated | Calibrate against owner corrections once real usage exists | Medium (post-hackathon) |
| T12 | Outbound-text content gate is pattern-based | Subtly misleading model wording can still auto-send | Owner can disable automatic reminders; a second-model check or templated reminders | Medium |
| T13 | No per-payer-link rate limit beyond the daily AI budget | A hostile payer can exhaust the budget; payer agent falls back to rules | Per-token limits | Medium (production) |
| T14 | Insights questions are routed by keywords to 7 predefined reports | Rephrasings outside the keywords are declined (safe, but limited) | With Claude configured, Studio's built-in agents handle open questions | Low |
