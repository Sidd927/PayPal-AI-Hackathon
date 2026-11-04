# Critical Blockers

| # | Blocker | Impact | Who can clear it | Exact requirement |
|---|---|---|---|---|
| B1 | Build environment cannot reach `api-m.sandbox.paypal.com` / `www.sandbox.paypal.com` (proxy 403, rechecked in Phase 2) | No real sandbox evidence; Stage One judging requires "meaningful use of PayPal APIs" | Owner | Allow both hosts in the cloud environment's **Network access → Allowed domains**, or run locally |
| B2 | No PayPal sandbox REST credentials | Same as B1 | Owner | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` from developer.paypal.com → Apps & Credentials (Sandbox); a sandbox **personal** account email for `DEMO_PAYER_EMAIL` |
| B3 | No Anthropic API key for the app | Real Claude output and evaluation not verified | Owner | `ANTHROPIC_API_KEY` (expected spend: the 25-case eval is ~25 calls, about $1–3 at Opus 5.5 prices; demo use under $10) |
| B4 | No Render account access; `render.com` blocked from here | No hosted URL | Owner | Render → New → Blueprint → this repo; set the secrets listed in `render.yaml` |
| B5 | Devpost, `ag-grid.com` and `docs.paypal.ai` not fetchable from here | Sponsor criteria and official API docs read only via search extracts and npm package sources | Owner (optional) | Allow `paypalaihackathon.devpost.com`, `www.ag-grid.com`, `docs.paypal.ai`, `developer.paypal.com` |
| B6 | AG Studio is commercially licensed (runs with a trial watermark) | Watermark visible in the Insights page | Owner (optional) | Free 45-day trial key from ag-grid.com → set `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` |
| B7 | Repository not public; no `main` branch | Submission requirement | Owner | Make the repo public; `main` was created from the verified Phase 2 head (see PROJECT_STATUS) |
| B8 | Video | Submission requirement | Owner | Record with `submission/VIDEO_SCRIPT.md` after B1–B3 |

Everything else is unblocked and was done in this environment.
