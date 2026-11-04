# Final Security and Reliability Report

_Phase 3 audit, 2026-11-04. Each defect found in this pass has a test that fails without the fix. Severity: **P0** = real money or data at risk in normal use. **P1** = exploitable or wrong financial action under plausible conditions. **P2** = wrong figures or weak defence in depth. **P3** = hardening or documentation._

## Defects found in this pass

| # | Sev | Defect | Fix | Test |
|---|---|---|---|---|
| 1 | P1 | **Stale approvals.** An approval executed whatever was proposed, even if the invoice had been paid, disputed or changed since, or the owner had tightened the rules. Example: "record a $3,900 check" approved after the client paid through PayPal would have double-recorded the payment, or failed at PayPal only by luck. | `executeAction` re-runs the policy engine against PayPal's *current* invoice before any write. `block` → the action fails with "Rules re-checked…". An action that was automatic but now needs approval goes back to the owner. Owner approval satisfies "approve" but never overrides "block". | `tests/reliability.test.ts` › stale approvals (3 tests, mutation-checked: all 3 fail with the re-check removed) |
| 2 | P1 | **Owner console could run open with real PayPal.** With `OWNER_BASIC_AUTH` unset, every owner route (approve, run agent, rules) was public, whatever the PayPal mode. | `src/proxy.ts` fails closed (503) when `NODE_ENV=production` and real PayPal credentials are configured without an owner password. Simulation demos stay open, because they move no money. | `reliability.test.ts` › owner console auth; contract test "owner APIs require the owner password" (401) |
| 3 | P1 | **Model-written automatic reminders were not content-checked.** With Claude enabled, client text could steer the reminder body: a foreign payment link, other bank details, threats. It would go out automatically from the owner's PayPal account. | `outboundTextConcerns` in the policy engine sends such reminders to the owner instead. | `ai-security.test.ts` › content-checked (6 tests) |
| 4 | P2 | **Non-constant-time credential comparison** for Basic auth and the scheduler token; a malformed Basic header threw inside the proxy. | `safeEqual` (Edge-compatible), guarded `atob`. | `reliability.test.ts` (wrong password, near-miss token, token on the wrong route) |
| 5 | P2 | **Cross-currency sums.** Board KPIs, the 30-day outlook and "cash unstuck" added minor units across currencies. | KPIs use the primary currency (most open invoices). Other currencies are counted and shown as "N in other currencies not included". Insights does the same. | `reliability.test.ts` › KPIs never add amounts across currencies; `insights.test.ts` |
| 6 | P2 | **Attribution overclaim.** "Recovered after Unstuck acted" implied causation. | Renamed "Collected after Unstuck acted", with a tooltip: "timing, not proof that Unstuck caused the payment. Promises and plans are not counted." | `reliability.test.ts` › promises and plans are never counted as collected; e2e |
| 7 | P2 | **AG Studio first view switch failed** (malformed widget sort; Studio rolled back). | Correct sort shape; e2e fails on any Studio fatal error. | e2e "Insights answers a balance question from data" |
| 8 | P1 | **Sandbox guard bypass.** `PAYPAL_API_BASE=https://api-m.paypal.com` with `PAYPAL_ENV=sandbox` would have pointed the "sandbox-only" build at production PayPal. | The base-URL override is refused for any non-sandbox `paypal.com` host; local mocks stay allowed. | `reliability.test.ts` › sandbox-only guard (3 tests) |
| 9 | P3 | Insights LLM proxy reused the 64 KB JSON cap; Studio's agents send schema and results each turn and would have been rejected with 413. | Route-specific 1 MB cap. | `insights.test.ts` (adapter translation) |

## Re-verified controls

| Area | Control | Evidence |
|---|---|---|
| Scheduler auth | `/api/agent/run` accepts `Authorization: Bearer $AGENT_RUN_TOKEN` (constant-time in the proxy) or a same-origin JSON request. The token opens no other route. | `reliability.test.ts` |
| Duplicate execution | Atomic status transition `proposed → approved → executing`. The action id is the `PayPal-Request-Id`, so PayPal also dedupes retries. | `reliability.test.ts` › three concurrent approvals execute once; `paypal-client.test.ts` |
| Client-supplied state | Approve takes only an action id and optional params. Params are schema-validated and re-checked by policy. The invoice is always the server's, refreshed from PayPal at execution. Payer routes act only through the invoice bound to the link token (144-bit `randomBytes`). Offers are bound to their invoice. | `ai-security.test.ts` › payer-side isolation; `flow.test.ts` |
| Webhooks | Signature verified with PayPal. Deduped by event id, forgotten on failure so a retry can succeed. The invoice is re-fetched from PayPal; the payload is never trusted. Refused in simulation. | `flow.test.ts` › PayPal webhooks; contract test (forged → 401, duplicate ignored) |
| CSRF | State-changing routes require `application/json` and reject a foreign `Origin`. | `insights.test.ts` › rejects cross-origin calls |
| Production guard | `getGateway` refuses any `PAYPAL_ENV` other than `sandbox`, and any production PayPal host in `PAYPAL_API_BASE`. | `reliability.test.ts` › sandbox-only guard |
| Secrets | No secret in the repo or client bundle. The Claude key is server-only; the AG licence key is a public client key set in hosting env. `.env*` is gitignored. | `git grep` for Anthropic, PayPal and AWS key patterns: no matches (2026-11-04) |
| Simulated money | Simulated payments are labelled "Simulated" in Activity and Insights, and refused outside simulation mode. | `insights.test.ts`; `flow.test.ts` |

## Accepted risks (documented, not fixed)

| Sev | Risk | Why accepted / mitigation |
|---|---|---|
| P2 | A **public simulation-mode** deployment lets any visitor approve actions and reset the demo. | It is fake data with no PayPal connection, which is how judges try it. Real PayPal mode fails closed without a password. |
| P2 | No per-link rate limit on the payer page. A hostile payer can spend the daily AI budget. | Afterwards the payer agent falls back to rules, so it degrades and does not fail. A production launch should add per-token limits. |
| P3 | Basic auth is single-user and has no lockout. | Adequate for a single-owner demo. A product would use real sessions. |
| P3 | The Insights LLM proxy accepts the system prompt and tools from the owner's browser. | Owner-only, same-origin and budgeted. Documented in `qa/AI_SECURITY_REPORT.md`. |
| P3 | SQLite on an ephemeral disk loses state on redeploy. | Documented in `render.yaml`. Re-sync from PayPal rebuilds invoice state; the audit history is lost. |

## Test gates on the final code

See `qa/TEST_RESULTS.md` (Phase 3 section) for the exact command output: unit, contract, e2e on a production build, typecheck, and `npm audit`.
