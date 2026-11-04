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
