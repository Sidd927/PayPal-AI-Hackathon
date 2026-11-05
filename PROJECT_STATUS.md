# Project Status

_Updated 2026-11-04, final competition pass. Branches: `claude/busy-ride-kgtyzr` (working) and `main` (fast-forwarded to the verified Phase 3 head)._

Legend: NOT STARTED · IN PROGRESS · BLOCKED · COMPLETED · VERIFIED (with evidence)

| Area | Status | Evidence / next step |
|---|---|---|
| Problem research (revalidated) | COMPLETED | `research/PHASE_2_COMPETITIVE_RESEARCH.md`; competitors rechecked in `research/PHASE_3_COMPETITOR_RECHECK.md` (8+ entries; capability matrix) |
| Positioning | COMPLETED | `research/PRODUCT_POSITIONING_REVIEW.md`: two-sided invoice resolution |
| Policy engine | VERIFIED | `tests/policy.test.ts` |
| Agent run orchestrator + trace | VERIFIED | `tests/agent.test.ts`, e2e, contract |
| Diagnosis v2 (evidence / inference / outcome / risks / alternatives) | VERIFIED (pipeline) | `tests/agent.test.ts`; output quality needs a real AI-provider run (Gemini by default) |
| Risk heuristic and 30-day outlook | VERIFIED | `tests/agent.test.ts` (heuristic, labelled) |
| AI safety (compromised-model tests) | VERIFIED | `tests/ai-security.test.ts` |
| AI evaluation, rules baseline (strict, per category) | VERIFIED | `qa/REAL_AI_EVALUATION_REPORT.md`: 14/26 correct, 12 abstained, 0 forbidden, 0 unsafe |
| AI evaluation and `verify:ai`, Gemini (default provider since Phase 2B) | BLOCKED | Needs `GEMINI_API_KEY`. Adapter verified with scripted fakes (`tests/ai-providers.test.ts`); live API checked only with an invalid placeholder key (classified correctly). Claude remains optional and equally unverified live |
| PayPal live code path | VERIFIED (mock) | `npm run test:contract` 25/25 |
| PayPal real sandbox | BLOCKED | Network policy + credentials; plan in `qa/REAL_PAYPAL_SANDBOX_REPORT.md` |
| Owner console, drawer, payer page, mobile | VERIFIED | e2e 22/22 (production build); no overflow at 390/768/1440 |
| Resolution loop (dashboard + drawer), missed-promise follow-through | VERIFIED | `tests/agent.test.ts` › resolution loop; e2e loop checks |
| AG Grid board + AG Studio insights | VERIFIED | e2e; trial watermark until a key is set |
| AG Studio Agent Framework (Unstuck Insights agent) | VERIFIED | e2e: page question, unsupported question, Studio AI panel; `qa/AG_STUDIO_SPONSOR_READINESS.md` |
| AG Studio built-in agents (Gemini default, Claude optional) | IMPLEMENTED (protocol-tested) | Needs `GEMINI_API_KEY` |
| Security and reliability (stale approvals, fail-closed auth, content gate, sandbox guard, currency) | VERIFIED | `tests/reliability.test.ts`, `tests/ai-security.test.ts`; `qa/FINAL_SECURITY_AND_RELIABILITY_REPORT.md` |
| AG Studio licence key | BLOCKED | Owner requests a trial key |
| Deployment config | COMPLETED | `render.yaml`, `Dockerfile` |
| Hosted demo | BLOCKED | Owner's Render account |
| README / Devpost / video script | COMPLETED | Updated for Phase 2 with AI disclosure |
| Video | NOT STARTED | Owner, after the sandbox and Claude runs |
| Repo public | NOT STARTED | Owner |
| Git attribution | COMPLETED | Owner identity on all Phase 2 and 3 commits, no AI trailers, unsigned; history untouched |
