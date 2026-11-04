# AG Studio Sponsor Readiness

_Phase 3, 2026-11-04. Package versions: `ag-studio` / `ag-studio-react` 3.0.0, `ag-grid-community` / `ag-grid-react` 36.2.0._

## What is integrated, and how it was verified

| Capability | Where | Status | Evidence |
|---|---|---|---|
| AG Grid Community board (risk-ranked, CSV export, change flash only on money moves) | `src/components/Board.tsx` | VERIFIED | e2e "risk column ranks a high-risk invoice first", screenshots |
| AG Studio report over five read-only tables (open invoices, agent actions, payments, promises, approvals) | `src/lib/services/insights.ts`, `src/components/insights/report.ts` | VERIFIED | e2e "AG Studio insights report renders", `docs/screenshots/10-insights-ag-studio.png` |
| Field metadata: names, descriptions, currency and integer formats, hidden id fields | `report.ts` › `dataSources` | VERIFIED | rendered values ($20,450 etc.) |
| Theming: `studioTheme.withParams` with Unstuck's fonts, accent and reason colour palette | `src/components/Insights.tsx` | VERIFIED | screenshots |
| **Studio Agent Framework: custom agent** `Unstuck Insights` built with `clientToolRunner` and registered as the primary agent via `createAiHarness` | `src/components/insights/agents.ts` | VERIFIED in a production build | e2e "Studio AI panel runs the Unstuck Insights agent", `docs/screenshots/11-insights-studio-agent.png` |
| Natural-language questions on the page (same router), answered from data, opening a predefined report page with `api.setState` | `Insights.tsx` › Ask Insights | VERIFIED | e2e "Insights answers a balance question from data"; all seven judge questions (below) |
| Unsupported questions declined, not guessed | `routeQuestion` returns null | VERIFIED | e2e + `tests/insights.test.ts` |
| Empty data handled honestly ("No client has made a promise to pay yet…") | `explain()` | VERIFIED | `tests/insights.test.ts` |
| Studio's five built-in agents (lead, planning, data, page, widget) running on Claude through a server-side `AgLlmAdapter` | `claudeAdapter` → `/api/insights/llm` | IMPLEMENTED, protocol-tested, **not verified with a real model** | `tests/insights.test.ts` checks message/tool-call translation with a fake client; no `ANTHROPIC_API_KEY` here |
| Commercial licence key | `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` → `AgStudioLicenseManager.setLicenseKey` | NOT SET | Trial watermark and console banner until the owner adds a key |

### Questions answered (production build, simulation data after one agent run)

The router is deterministic and scored. A report matches only when all of its keyword groups match, and the report with the most matched groups wins. Answers are computed by `explain()` from the same read-only tables the report shows. Below are the answers as measured in the final pass. All 15 phrasings are covered by `tests/insights.test.ts`.

| Question | Report opened | Answer (abridged, as measured) |
|---|---|---|
| Which customers account for the highest overdue receivables? | Overdue receivables by customer | "$16,200 is overdue across 7 customers. Highest: Northwind Logistics $4,800 (12 days late), Atlas Robotics $3,900, Harbor Dental $2,650 …" |
| What are the most common reasons invoices are stuck? | Overdue invoices by reason | "7 overdue invoices, $16,200 in total, stuck for 6 different reasons. Most common: Forgot (2, $1,900) …" |
| Which payment promises have been missed? | Promises to pay | "1 missed. Missed: Kestrel Media (by 2026-11-01). The agent follows these up on its next run." |
| Which invoices need owner intervention today? | Waiting for your approval | "5 action(s) wait for you, 2 of them change money: Bluebird Café (Payment plan), Atlas Robotics (Record payment received) …" |
| How much has been collected after Unstuck actions? | Collected with and without Unstuck | Before any payment: "No payments have been recorded yet…". After: split by timing, "not proof that Unstuck caused the payment" |
| Which customers have not responded? | Customers who haven't responded | "No reply at all from Lumen Yoga on overdue invoices." |
| Which invoices are at highest risk based on our actual risk rules? | Highest risk under your risk rules | "Harbor Dental 59 (High; biggest factor: 21 days past due), Quill Publishing 56 … 55+ is high and 28+ is watch. It's a transparent score, not a prediction." |
| What worked? | What happened after each action | "4 actions have run. Paid in full since: 0. Part paid since: 0. No payment yet: 4. … not proof that the action caused it." |

The previous seven phrasings (largest balances, promises due this week, before/after comparison, risky and silent, human approval) still route as before.

## Defect found and fixed in this pass

The first `api.setState` page switch failed with "State property 'widgets' is malformed … Widget with id 'owed' does not exist in layout", and the view did not change. The root cause, traced in the Studio bundle, was a widget `sort` written as `{id, aggregation, direction}`. Studio expects `{field: {id, aggregation}, direction}`. Hydration threw, Studio rolled the page back, and the layout error was reported. After the fix, the page switches on the first request with zero console errors. The e2e suite now fails on any "AG Studio – Fatal error" console message.

## Honest framing for the Devpost text

- Say: "Insights is built with AG Studio. Its AI panel runs our own agent, built with the Studio Agent Framework (`clientToolRunner`), which answers receivables questions from read-only data and opens the matching report. With a Claude key, Studio's built-in agents also run, through a server-side Claude adapter."
- Do not say the built-in agents were tested with Claude until the key run is done.
- Do not say the dashboard is unwatermarked until a licence key is set.

## Licence (45-day trial)

The Studio console banner reads: "All AG Studio Pro with AI features are unlocked for trial. If you want to hide the watermark please email info@ag-grid.com for a trial license key." Another hackathon entry reports running its hosted demo on AG Grid's 45-day trial licence, so this route is available to entrants. Steps for the owner:

1. Email info@ag-grid.com (or use the trial form on ag-grid.com) asking for an AG Studio trial key for the PayPal AI Hackathon.
2. Set `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` in the hosting dashboard (Render: Environment). Never commit it. It is a public client-side key by design, but it should still not live in git.
3. Rebuild, because `NEXT_PUBLIC_*` values are inlined at build time.

## Competitive note

At least two other entries use AG Studio. `past-due-desk` has a custom Studio widget, a theme and a hosted demo with a trial key. One `owed` entry runs Studio's built-in agents on Claude with a custom adapter. Unstuck's distinct contribution is a domain agent in the Studio AI panel that grounds every answer in Unstuck's own data and declines what it can't answer. Its gap is the missing licence key and hosted demo.
