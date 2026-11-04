# Test Strategy

Four layers, cheapest first. Each layer runs from a single npm script.

| Layer | Command | What it proves | Needs |
|---|---|---|---|
| Static | `npm run lint` (tsc, strict + `noUncheckedIndexedAccess`) | Types across server/client boundaries | — |
| Unit + flow (Vitest, 40 tests) | `npm test` | Money maths, plan building, every policy branch, PayPal client (OAuth caching, idempotency headers, retries, 401 refresh, error mapping), PUT body builder, webhook verification request, end-to-end service flows in simulation, AI paths with a scripted Claude (structured output sanitising, fallback, payer tool loop, injection attempt) | — |
| Contract (23 checks) | `npm run build && npm run test:contract` | The **live** PayPal code path over real HTTP against a strict, stateful mock of Invoicing v2 and Webhooks: seeding, sync, remind, full-replacement PUT, conditional rules, record payment, cancel-reminders, signed/forged/duplicate webhooks, plan progression to PAID | — |
| Browser E2E (14 checks) | `UNSTUCK_MODE=simulation npm run dev` then `npm run test:e2e` | The primary user journey in Chromium: diagnose, approve, payer plan, payment, KPIs, activity, rules, mobile overflow, no page errors; also captures screenshots | Playwright |
| Live sandbox | `npm run check:sandbox`, `npm run seed:sandbox`, manual walkthrough (`submission/DEMO_WALKTHROUGH.md`) | Real PayPal sandbox behaviour | Sandbox credentials + network access to `api-m.sandbox.paypal.com` |
| Live AI | Manual: diagnose the seeded board with `ANTHROPIC_API_KEY` set | Real Claude output quality | Anthropic key |

## Coverage by risk

| Risk | Covered by |
|---|---|
| Wrong amounts in plans | `policy.test.ts` (exact sums, min first payment, block on bad arithmetic), contract (`minimum_amount_due` = 400.00) |
| LLM proposes something unsafe | `flow.test.ts` (clamping, policy approval for agent money changes, payer injection) |
| Invoice data loss on PUT | `paypal-client.test.ts` (unknown fields kept, read-only stripped), contract (strict mock rejects read-only fields and missing items) |
| Double execution | Flow (offer accepted once), contract (double approval rejected) |
| Forged / duplicate webhooks | Flow + contract |
| Missing credentials | Simulation + rules-only modes exercised by unit/E2E suites |
| PayPal/AI errors | Client error-mapping tests; AI failure → rules fallback test; action failures recorded (status `failed`) |
| UI regressions | E2E + screenshots in `docs/screenshots/` |
