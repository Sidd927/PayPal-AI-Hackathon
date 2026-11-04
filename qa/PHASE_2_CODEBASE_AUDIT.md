# Phase 2: Independent Codebase Audit

_2026-11-04. Re-read of the code, git state, configuration, tests and UI, not of the Phase 1 summary._

## Git state (as found)

| Item | Finding |
|---|---|
| Remote | `https://github.com/Sidd927/PayPal-AI-Hackathon` |
| Branches | Only `claude/busy-ride-kgtyzr` (local and remote). **No `main` exists**; the repo was empty before Phase 1 |
| Latest commit | `16896a2 docs: architecture, QA reports, README and submission package` |
| Uncommitted changes | None |
| Authorship | All 5 commits: author and committer `Claude <noreply@anthropic.com>`, each with `Co-Authored-By: Claude Opus 5.5` and `Claude-Session:` trailers, SSH-signed by the environment's Claude signing key. See `docs/GIT_ATTRIBUTION_POLICY.md`. History is **not** rewritten |
| Owner identity (verified via GitHub API) | Login `Sidd927`, id `212080526`, display name `Sidd_927` |

## Inventory

- **Source:** `src/lib` (domain, money, dates, policy, db, config, http, paypal/*, ai/*, services/*, demo/*), `src/app` (5 pages, 19 API routes), `src/components` (9 components), `src/proxy.ts`.
- **Tests:** `tests/*.test.ts` (40), `scripts/contract-test.mjs` (23 checks), `scripts/e2e.mjs` (14 checks).
- **Dependencies (runtime):** next, react, react-dom, ag-grid-community, ag-grid-react, @anthropic-ai/sdk, better-sqlite3, zod, two @fontsource packages. All are used, and none are unused.
- **Deployment:** `render.yaml`, `Dockerfile`, `.env.example`.

## Findings

### Defects (fixed in Phase 2)

| # | Severity | Finding | Where |
|---|---|---|---|
| D1 | Medium | "Diagnose again" re-runs without `force`; unchanged invoices are **skipped**, but the toast says "Diagnosed 7 open invoices" (misleading) | `Console.tsx` → `/api/diagnose` |
| D2 | High (product) | **No orchestration loop.** `wait` actions, promises to pay and plan installments are never revisited: nothing runs unless the owner clicks. The "agent" is a one-shot classifier plus executor | services |
| D3 | Medium | Diagnosis has no explicit **inference vs evidence**, expected outcome, risks or alternatives; the confidence is self-reported by the model with no calibration context | `ai/diagnosis.ts`, drawer |
| D4 | Medium | Board has no **risk/priority** signal. The default sort is days overdue, which ignores amount, history and reason | `board.ts` |
| D5 | Medium (security) | On a hosted deployment without `OWNER_BASIC_AUTH`, **anyone can approve actions or record payments** on the sandbox account. This is acceptable for a sandbox demo, but it isn't surfaced in the UI | `proxy.ts` |
| D6 | Low | `payer-agent.ts` re-exports `fromMinor` unused; `diagnosis.ts` has a dead `void cur` and an unused `describeAmount` | AI module |
| D7 | Low | `npm run lint` is only `tsc`; no ESLint | package.json |
| D8 | Low | The e2e script depends on a globally installed Playwright | scripts |
| D9 | Medium (claims) | Phase 1 docs claimed **"no entrant works on receivables"**. That is false: *Owed*, *Invoice Chaser* and *paypal-bill-agent* exist (see `research/PHASE_2_COMPETITIVE_RESEARCH.md`) | research/, README, Devpost draft |
| D10 | Low | Escalation cards on the dashboard can be clipped by the scroll mask; the "Recently" summaries truncate mid-word | UI |

### Verified strengths (kept)

- A pure policy engine with exhaustive branch tests; money in integer cents; idempotent PayPal writes; atomic status transitions.
- A full-replacement PUT builder verified against a strict mock.
- Webhooks treated as signals, with signature verification, deduplication and re-fetch, and retry-safe failure handling.
- Clear labelling of simulation and rules-only modes.

### Mock-only or simulated functionality (must stay labelled)

- `SimulatedGateway`, the simulated payment endpoint, the contract-test mock PayPal.
- Seeded client messages (fictional `.example` clients).
- Rules-only diagnosis (keyword heuristics).

### Not verified against external services

- The PayPal sandbox (network blocked, no credentials).
- Claude (no application key).
- Render deployment (no account access).
