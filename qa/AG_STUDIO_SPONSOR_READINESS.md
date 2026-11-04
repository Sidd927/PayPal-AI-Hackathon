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

### The seven questions from the directive (production build, simulation data)

| Question | Report opened | Answer (abridged) |
|---|---|---|
| Show overdue invoices by reason | Overdue invoices by reason | "6 overdue invoices, $14,950 in total. The biggest share is 'Missing info' at $4,800." |
| Which customers have the largest outstanding balance? | Largest outstanding balances | "Fernwood Architects $5,500, Northwind Logistics $4,800, Atlas Robotics $3,900." |
| Show promises due this week | Promises to pay | "No client has made a promise to pay yet…" (true for fresh demo data) |
| Compare collected amounts before and after agent intervention | Collected with and without Unstuck | "No payments have been recorded yet…" before any payment; afterwards it splits by timing and says "timing, not proof that Unstuck caused the payment" |
| Show invoices with the highest risk and no recent customer response | High risk with no recent reply | "4 invoice(s) are high risk or haven't heard from the client in 14+ days." |
| Break down missed promises by customer | Promises to pay | Same view, with a Kept / Missed / Due status per customer |
| Build a report for invoices requiring human approval | Waiting for your approval | "5 action(s) wait for you, 2 of them change money." |

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
