# Frontend Design Audit (Phase 2)

Screenshots captured with Playwright at 1440×900/1000, 820×1180 (tablet) and 390×844 (phone), before and after the changes. Findings come from reading the screenshots, not from the code.

| # | Screen | Finding (before) | Severity | Change |
|---|---|---|---|---|
| F1 | Board, phone | AG Grid clipped to Client and Owed: the *reason*, the product's core idea, was invisible on a phone | High | Phone layout uses `InvoiceCards` (reason, risk and next step visible); the grid stays on `md+` |
| F2 | Dashboard, pre-run | Half the first screen was a grey "Not diagnosed" bar and an empty queue | High | Figure row and agent panel always carry information; the reason strip is hidden until something is diagnosed |
| F3 | Dashboard | Only "how much" was answered. No forward view, no at-risk view | High | Figures: waiting, overdue (average days late), expected in 30 days (by basis), at risk |
| F4 | Agent | One button, then results appeared; nothing showed a process | High | "Run the agent" panel with a live trace grouped by client |
| F5 | Board | Default sort by days late ignored amount, history and reason | Medium | Transparent risk column, default sort |
| F6 | Drawer | Diagnosis mixed evidence and conclusion; no outcome, risks or alternatives | High | Evidence, inference, recommendation, outcome, risks and alternatives in separate sections, plus a risk-factor breakdown |
| F7 | Approvals | One click changed PayPal money terms | High | Inline confirmation stating the consequence |
| F8 | Feedback | Inline green text could be missed; errors mixed in | Medium | Toast system with `status` and `alert` roles |
| F9 | Board after run | AG Grid's default flash painted every row teal | Medium | Flash only when money moves, in marigold wash |
| F10 | Header, phone | Badges wrapped awkwardly; "Simulation, not PayPal" too long | Low | Short label on phones; the full label from `sm` up |
| F11 | Payer page | Accept button without spelling out consequences | High | Plain-language terms above the button: part-payments, nothing charged automatically, same total, no fees |
| F12 | Copy | Middle-dot meta strings and "label — fragment" patterns | Low | Replaced with commas and sentences |

## Remaining (documented, not fixed)

- On a 1440 px screen the left column ends above the right column (some empty paper above the board). We accepted this to keep the agent panel fixed beside the story.
- The tablet (820 px) layout uses the AG Grid board; the Next step column scrolls horizontally.
- Screenshots show "Simulation" and "Rules only" badges. Recapture after the live sandbox and Claude run.
