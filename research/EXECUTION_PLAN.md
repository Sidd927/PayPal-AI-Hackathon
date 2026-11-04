# Execution Plan

Hard deadline: **Thu Nov 12 2026, 12:00 PM PT**. Today: Wed Nov 4.

| Date | Phase | Exit criterion |
|---|---|---|
| Nov 4 | Research, problem selection, architecture, core build | Research docs committed; app runs in simulation mode with tests green |
| Nov 4–5 | PayPal live gateway + webhooks; AI diagnosis + payer agent | Contract tests green; code paths ready for sandbox |
| **Nov 5 (owner)** | Add sandbox + Anthropic credentials; allow-list `api-m.sandbox.paypal.com` or run locally; `npm run seed:sandbox`; walk the primary journey | Real sandbox invoices, real payment, webhook received |
| Nov 6–7 | Fix sandbox findings; UI polish; Render deploy | Hosted URL works end to end |
| Nov 8 | QA pass, security audit, judge simulation | `qa/` reports updated with real results |
| Nov 9–10 | Record video (< 3 min), upload to YouTube (public) | Video link |
| Nov 11 | Submit on Devpost (a full day early) | Submission confirmed |
| Nov 12 AM | Buffer only | — |

A submission-capable build exists from the first commit onward. `main` receives only working builds.

The **Nov 5 early review** could not be confirmed from accessible sources. If the Devpost Updates tab announces it, submit the Nov 5 build as a draft.
