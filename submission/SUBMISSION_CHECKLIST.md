# Submission Checklist

Deadline: **Thu Nov 12 2026, 12:00 PM PT**. Target submission: **Wed Nov 11**.

## Requirements

| Item | Status | Owner action |
|---|---|---|
| Meaningful PayPal technology | ✅ Invoicing v2 + Webhooks | — |
| Meaningful AI | ✅ Claude diagnosis + payer agent | — |
| Functional prototype | ✅ Runs locally (simulation verified); sandbox code path contract-tested | Run against the real sandbox (`submission/DEMO_WALKTHROUGH.md`, Option B) |
| Public repository | ⏳ Repo exists on GitHub | Make `Sidd927/PayPal-AI-Hackathon` **public**; merge the branch to `main` |
| Open-source licence | ✅ MIT (`LICENSE`) | — |
| Setup instructions | ✅ README | — |
| Description | ✅ `submission/DEVPOST_DESCRIPTION.md` | Paste into Devpost |
| Which AI tools are used | ✅ In the description (Claude via the Anthropic SDK) | — |
| YouTube video < 3 min, public | ⏳ | Record with `submission/VIDEO_SCRIPT.md` |
| Testing access | ⏳ | Deploy to Render (`render.yaml`) and add the URL; or rely on the local quick start |
| Screenshots / gallery | ✅ `docs/screenshots/` (simulation) | Re-capture with sandbox badges after the live run (`npm run test:e2e` regenerates them in simulation) |

## Credentials and access the owner must provide

1. PayPal sandbox REST app **Client ID / Secret** (developer.paypal.com).
2. A sandbox **personal** account email (for paying as the client).
3. An **Anthropic API key** (expected spend under $10 for testing and the demo).
4. A **Render** account (free) if hosting.
5. To run the sandbox from a Claude Code cloud session, add `api-m.sandbox.paypal.com` and `www.sandbox.paypal.com` to the environment's allowed domains.

## Prize eligibility

- Grand Prize / honourable mentions: automatic.
- **AG Grid** sponsor prize: AG Grid on the board and activity log; AG Studio for Insights, including a custom Studio Agent Framework agent. Mention both in "Built with". **Request the AG Studio trial key** (info@ag-grid.com) and set `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` in hosting before judging, so the watermark is gone. See `qa/AG_STUDIO_SPONSOR_READINESS.md`.
- **Render** sponsor prize (alternative): only if deployed on Render. A project can win only one sponsor prize, and AG Grid is our primary target.

## Final checks before pressing Submit

- [ ] `npm run test:all` green on the submitted commit
- [ ] Live sandbox walkthrough done once end to end
- [ ] README "Honest status" updated after the sandbox run
- [ ] Repo public; no secrets (`git log -p | grep -i secret` is clean)
- [ ] Video public, < 3:00, link works in a private window
- [ ] Devpost fields: name, tagline, description, built-with, repo URL, video URL, demo URL, screenshots
- [ ] Replace the bracketed placeholders in `DEVPOST_DESCRIPTION.md` with the real sandbox and Claude results (or delete them); never publish a number that wasn't measured
- [ ] Hosted demo set to `UNSTUCK_MODE=simulation` for open judging, or real sandbox with `OWNER_BASIC_AUTH` and credentials in the testing-instructions field
- [ ] Re-read the official rules page once (it could not be fetched from the build environment)
