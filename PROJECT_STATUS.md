# Project Status

_Updated 2026-11-04, end of Phase 2. Branches: `claude/busy-ride-kgtyzr` (working) and `main` (created from the verified Phase 2 head)._

Legend: NOT STARTED · IN PROGRESS · BLOCKED · COMPLETED · VERIFIED (with evidence)

| Area | Status | Evidence / next step |
|---|---|---|
| Problem research (revalidated) | COMPLETED | `research/PHASE_2_COMPETITIVE_RESEARCH.md` (stats checked against originals; competitor claims corrected) |
| Positioning | COMPLETED | `research/PRODUCT_POSITIONING_REVIEW.md`: two-sided invoice resolution |
| Policy engine | VERIFIED | `tests/policy.test.ts` |
| Agent run orchestrator + trace | VERIFIED | `tests/agent.test.ts`, e2e, contract |
| Diagnosis v2 (evidence / inference / outcome / risks / alternatives) | VERIFIED (pipeline) | `tests/agent.test.ts`; output quality needs a real Claude run |
| Risk heuristic and 30-day outlook | VERIFIED | `tests/agent.test.ts` (heuristic, labelled) |
| AI safety (compromised-model tests) | VERIFIED | `tests/ai-security.test.ts` |
| AI evaluation, rules baseline | VERIFIED | `qa/eval/rules-2026-11-04.json` |
| AI evaluation, Claude | BLOCKED | Needs `ANTHROPIC_API_KEY` |
| PayPal live code path | VERIFIED (mock) | `npm run test:contract` 24/24 |
| PayPal real sandbox | BLOCKED | Network policy + credentials; plan in `qa/REAL_PAYPAL_SANDBOX_REPORT.md` |
| Owner console, drawer, payer page, mobile | VERIFIED | e2e 17/17 (dev and production), screenshots |
| AG Grid board + AG Studio insights | VERIFIED | e2e; trial watermark until a key is set |
| Deployment config | COMPLETED | `render.yaml`, `Dockerfile` |
| Hosted demo | BLOCKED | Owner's Render account |
| README / Devpost / video script | COMPLETED | Updated for Phase 2 with AI disclosure |
| Video | NOT STARTED | Owner, after the sandbox and Claude runs |
| Repo public | NOT STARTED | Owner |
| Git attribution | COMPLETED | Owner identity on all Phase 2 commits; history untouched |
