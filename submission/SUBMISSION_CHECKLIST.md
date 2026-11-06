# Submission Checklist

Deadline: **Thu Nov 12 2026, 12:00 PM PT**. Target: submit on **Wed Nov 11**. Re-read the official rules on Devpost once before submitting: they couldn't be fetched from the build environment, and the details below come from the owner's brief and public listings.

## Requirements

| Item | Status | Owner action |
|---|---|---|
| Meaningful PayPal technology | ✅ Invoicing v2 + Webhooks (`docs/PAYPAL_INTEGRATION.md`) | — |
| Meaningful AI | ✅ Gemini diagnosis + tool-using payer assistant (Claude optional) | Run `npm run verify:ai` (`submission/OWNER_VERIFICATION.md`) |
| Functional prototype | ✅ Simulation verified end to end (22 browser checks); live code path verified against a strict mock (26 checks) | Read-only sandbox check (`OWNER_VERIFICATION.md` §4) |
| Public repository | ⏳ | Make `Sidd927/PayPal-AI-Hackathon` public. Judges see the default branch, so bring `main` up to date (your decision; nothing has been merged) |
| Open-source licence | ✅ MIT (`LICENSE`, root) | — |
| Setup instructions | ✅ README → *Run it* (no keys needed for the simulation) | — |
| Text description | ✅ `submission/DEVPOST_DESCRIPTION.md` | Fill the two bracketed lines, then paste |
| Tools used | ✅ In the description | — |
| Demo video < 3 min, public | ⏳ | Record with `submission/VIDEO_SCRIPT.md` (Mode A) |
| Testing access | ✅ Local quick start (simulation, no keys) | Optional hosted demo: see the end of this file |
| Screenshots | ✅ `docs/screenshots/` (simulation, rules-only) | Optional: re-capture with **AI: Gemini** after preparing the video database |

## Credentials (yours, never in the repo or chat)

1. PayPal sandbox REST app **Client ID / Secret**, already in `.env.local`.
2. **Gemini API key** (`GEMINI_API_KEY`), already in `.env.local`. Anthropic is optional and not needed.
3. Optional: an AG Grid / AG Studio trial licence key (`NEXT_PUBLIC_AG_GRID_LICENSE_KEY`). AG Studio works locally without one, but its watermark may be visible. No key is included in the repository.

## Prize eligibility

- One Grand Prize **or** one honourable mention, plus one sponsor prize.
- **Sponsor prize: Best Use of AG Grid** (the Devpost rules' name; AG Grid's own announcement says "Best Use of AG Studio" for the same prize). Unstuck uses AG Grid for the board and activity log, and AG Studio for Insights with our own Agent Framework agent in Studio's AI panel. Name both in "Built with". See `qa/AG_STUDIO_SPONSOR_READINESS.md`.
- Render is not targeted: deploying only to qualify would add risk, not product value.

## Final checks before pressing Submit

- [ ] `npm run lint && npm test && npm run build && npm run test:contract` green on the submitted commit
- [ ] `npm run verify:ai` run locally; `real_provider_response_received: true` before claiming real Gemini
- [ ] `npm run check:sandbox` run locally (read-only); numbers match the description
- [ ] Bracketed placeholders in `DEVPOST_DESCRIPTION.md` filled from real output, or deleted; never publish an unmeasured number
- [ ] Hackathon start date on Devpost is on or before 4 Nov 2026 (the first commit), so the "Built during the hackathon" line holds
- [ ] Generated evidence reviewed before adding to git: `verify:ai` and `eval` write new files under `qa/ai-verification/` and `qa/eval/`, and `npm run test:e2e` rewrites the tracked `docs/screenshots/`. Add only the files you mean to publish, by name, never with `git add -A`; never add `.db` files or `.env*`
- [ ] Repo public; no secrets. `git log -p | grep -cE "AIza[0-9A-Za-z_-]{30,}|sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{20,}"` prints `0` (the redaction code and test fixtures mention the prefixes, so a plain grep shows harmless matches). No `.env.local` and no `.db` files are tracked
- [ ] Video public, < 3:00, link works in a private window
- [ ] Devpost fields: name, tagline, description, built-with, repo URL, video URL, screenshots; demo URL only if a hosted demo really exists

## Optional hosted demo (only with your approval)

`render.yaml` deploys on Render's free plan. For an open judge demo, leave the PayPal secrets empty (or add `UNSTUCK_MODE=simulation`): the app then runs the labelled simulation. A Gemini key is optional. It's open to judges and safe, because no PayPal calls are made and all data is fictional. Limits:
- the free instance sleeps when idle (first load is slow);
- the SQLite file is on an ephemeral disk (a restart re-seeds the demo);
- with a Gemini key on a public demo, anyone can spend your daily AI budget (`AI_DAILY_CALL_LIMIT` caps it).

Never deploy with real PayPal credentials without `OWNER_BASIC_AUTH`; the app refuses to serve the owner console in that case. The local quick start already satisfies the "run instructions" option.
