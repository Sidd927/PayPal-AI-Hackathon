# Test Results

_Executed 2026-11-04 in the build container (Node 22.23.4, Chromium via Playwright). Only tests that actually ran are reported as passed._

| Suite | Command | Result |
|---|---|---|
| Typecheck | `npm run lint` | ✅ 0 errors |
| Unit + flow | `npm test` | ✅ **40 / 40** (3 files: `policy`, `paypal-client`, `flow`) |
| Production build | `npm run build` | ✅ 22 routes compiled |
| Contract (live gateway vs strict mock PayPal) | `npm run test:contract` | ✅ **23 / 23**, 84 PayPal API calls |
| Browser E2E on dev server | `npm run test:e2e` | ✅ **14 / 14** |
| Browser E2E on production server (`next start`) | `BASE_URL=http://localhost:3001 npm run test:e2e` | ✅ **14 / 14** |
| Dependency audit | `npm audit` | ✅ 0 vulnerabilities |
| Live PayPal sandbox | `npm run check:sandbox` | ⏳ **Not run.** The build container's network policy blocks `api-m.sandbox.paypal.com` (proxy 403), and no sandbox credentials were provided |
| Live Claude | Diagnose with `ANTHROPIC_API_KEY` | ⏳ **Not run.** No application API key was provided; AI paths were verified with a scripted client |

## Defects found by testing and fixed

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | Unit (flow) | Rules fallback missed "mailed a check", so Atlas was diagnosed "unknown" | Broadened the already-paid pattern |
| 2 | Unit (flow) | Extracted email kept a trailing period (`accounts@quillpub.example.`); the schema then **blocked** the reminder | Strip trailing punctuation; the schema block shows the safety net works |
| 3 | Unit (flow) | Cache test expected a skip after an auto-reminder changed state | Test corrected; behaviour (re-diagnose after state change) is right |
| 4 | E2E | `instanceof SimulatedGateway` false across Next.js bundles, so simulated payment refused | Check `gateway.mode` instead |
| 5 | E2E / screenshot review | Agent's plan proposal stayed in "Needs you" after the payer accepted a plan | Executed actions supersede pending proposals of the same type |
| 6 | E2E | Drawer backdrop was a second accessible "Close" button | Backdrop is now `aria-hidden` (Esc and the Close button remain) |
| 7 | Screenshot review | Settled history sorted above not-yet-due invoices | Timing sort sinks closed invoices |
| 8 | E2E (prod) | Payment links used `APP_BASE_URL` (correct), but the test followed them to the wrong port | Test follows the link path on the server under test |
| 9 | Review | Escalations auto-completed, so disputes disappeared from the owner's queue | Escalations wait for the owner ("Mark as handled") |
| 10 | Review | Webhook that failed processing was deduped forever | Failed events are forgotten so PayPal's retry is processed |
| 11 | Re-running `test:all` | The contract harness killed `npx` but not its `next-server` grandchild, so a re-run hit the stale server and failed (6/10) | Next is started in its own process group, the whole group is killed, and the run aborts if the port is busy; re-run 23/23 |

_Final run after all fixes: lint ✅ · unit 40/40 ✅ · build ✅ · contract 23/23 ✅ · E2E 14/14 on a fresh production build ✅._


## Phase 3 final gates (2026-11-04, final code)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run lint` | ✅ |
| Unit, flow, agent, adversarial, reliability, Insights | `npm test` | ✅ 90/90 (7 files) |
| Production build | `npm run build` | ✅ |
| Live code path vs strict mock PayPal (now with owner auth) | `npm run test:contract` | ✅ 25/25, 97 PayPal API calls |
| Browser journey on the production build | `UNSTUCK_MODE=simulation npm start` then `npm run test:e2e` | ✅ 20/20 (incl. Ask Insights, unsupported question, Studio AI panel agent, no AG Studio fatal errors, no phone overflow) |
| Dependencies | `npm audit` | ✅ 0 vulnerabilities |
| AI eval, rules baseline, strict scoring | `npm run eval` | 14/26 correct, 12 abstained, 0 forbidden, 0 safety violations (`qa/REAL_AI_EVALUATION_REPORT.md`) |
| Widths 390 / 768 / 1440 | screenshot script | No horizontal overflow on console, payer page or activity |
| Real PayPal sandbox | `npm run check:sandbox` | ⏳ blocked: host unreachable from this environment, no credentials |
| Real Claude | `npm run eval` with a key | ⏳ blocked: no `ANTHROPIC_API_KEY` |

### Phase 3 defects found and fixed (each with a test)

| # | Defect | Test |
|---|---|---|
| 12 | AG Studio first view switch failed (malformed widget sort) | e2e Insights checks; e2e fails on Studio fatal errors |
| 13 | Stale approvals executed on a changed invoice | `reliability.test.ts` (3, mutation-checked) |
| 14 | Owner console open with real PayPal in production | `reliability.test.ts`; contract "owner APIs require the owner password" |
| 15 | Non-constant-time credential compare; malformed Basic header threw | `reliability.test.ts` |
| 16 | KPIs summed across currencies | `reliability.test.ts`, `insights.test.ts` |
| 17 | "Recovered" implied causation | wording + tooltip; `reliability.test.ts` (promises never counted) |
| 18 | Model-written automatic reminders not content-checked | `ai-security.test.ts` (6) |
| 19 | `PAYPAL_API_BASE` could point at production PayPal | `reliability.test.ts` (3) |
| 20 | Insights LLM proxy would 413 on Studio's normal payloads | `insights.test.ts` |
