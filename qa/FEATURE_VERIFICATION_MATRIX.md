# Feature Verification Matrix

_Updated end of Phase 3, 2026-11-04. Phase 3 rows are at the end of the table._

**Classes:**

1. IMPLEMENTED AND VERIFIED
2. IMPLEMENTED BUT NOT FULLY TESTED
3. SIMULATED
4. PARTIALLY IMPLEMENTED
5. NOT IMPLEMENTED
6. BLOCKED BY EXTERNAL DEPENDENCY

"Verified" means an automated test in this repo exercises it. "Live" means against the real service.

| Feature | Class | Evidence | Live status |
|---|---|---|---|
| Deterministic policy engine (auto / approve / block) | 1 | `tests/policy.test.ts` (15 cases) | n/a |
| Money in integer cents, exact plan sums | 1 | policy tests | n/a |
| PayPal OAuth, token cache, 401 refresh | 1 | `paypal-client.test.ts` | **6** (sandbox blocked) |
| Invoicing: list/get, remind, full PUT, conditional rules, record payment, cancel reminders, create/send | 1 (mock) | contract test 24/24 over HTTP | **6** |
| Idempotent writes (`PayPal-Request-Id`), double-approval guard | 1 | unit + contract | 6 |
| Webhook signature verification, dedupe, retry-safe failure | 1 (mock) | flow + contract (forged → 401, duplicate ignored) | 6 |
| Payment-plan progression (moving minimum due) | 1 (mock + sim) | flow + contract to PAID | 6 |
| Claude diagnosis (structured outputs) | 2 | Code path tested with a scripted model; never run against Claude | **6** (no key) |
| Diagnosis v2: evidence vs inference, outcome, risks, alternatives | 1 (pipeline) / 2 (quality) | `agent.test.ts`; quality depends on the real model | 6 |
| Rules-only diagnosis fallback | 1 | eval baseline 81% reason / 0 safety violations | n/a |
| Payer agent tool loop (strict tools) | 2 | scripted-model tests incl. injection | 6 |
| Agent run orchestrator + observable trace | 1 | `agent.test.ts`, e2e, contract (live-gateway sync step) | 6 |
| Installment follow-ups, missed-promise re-diagnosis | 1 | `agent.test.ts` | — |
| Transparent risk heuristic | 1 | `agent.test.ts` (score = sum of factors). **Heuristic, not a trained model** | — |
| 30-day outlook by basis | 1 | `agent.test.ts` (weeks sum = totals) | — |
| Owner console, drawer, approvals, confirmations, toasts | 1 | e2e 17/17 (dev + production) | — |
| Mobile owner view (cards) and payer page | 1 | e2e overflow check, screenshots | — |
| AG Grid board (risk sort, CSV export, filters) | 1 / 2 | e2e checks risk sort; CSV export manually reviewed, no automated download test | — |
| AG Studio insights report | 1 | e2e renders report; trial watermark without key | — |
| SimulatedGateway + simulated payment | **3** | labelled "Simulation" in UI | — |
| Seeded demo conversations | **3** | fictional `.example` clients | — |
| AI evaluation harness | 1 | rules baseline run | Claude run **6** |
| Render deployment | **4** | `render.yaml` validated by reading only | **6** (no account) |
| Docker image | 2 | Dockerfile written, never built here | — |
| Email ingestion (Gmail/Outlook) | **5** | roadmap | — |
| Multi-user accounts / roles | **5** | single owner + optional basic auth | — |
| Trained payment-delay prediction | **5** | deliberately replaced by a transparent heuristic | — |
| Execution-time policy re-check (stale approvals refused or returned to owner) | 1 | `reliability.test.ts` | n/a |
| Owner console fails closed (prod + real PayPal + no password); constant-time auth | 1 | `reliability.test.ts`, contract | n/a |
| Content gate on agent-written automatic reminders | 1 | `ai-security.test.ts` | n/a |
| Sandbox-only guard incl. base-URL override | 1 | `reliability.test.ts` | n/a |
| Single-currency KPIs with exclusion note | 1 | `reliability.test.ts` | n/a |
| AG Studio: Unstuck Insights agent (clientToolRunner) in the Studio AI panel and on the page | 1 | e2e (production build) | n/a |
| AG Studio: built-in agents on Claude via server adapter | 2 | `insights.test.ts` (protocol, fake client) | **6** (no key) |
| AG Studio licence key (no watermark) | 6 | — | owner must request trial key |
