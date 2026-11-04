# Judging Strategy

## Stage One — pass/fail gate

| Gate | How Unstuck passes |
|---|---|
| Baseline viability | Runs locally in one command; hosted on Render; seeded demo |
| Fit with theme | PayPal + AI is the whole product |
| Meaningful PayPal API use | 9 Invoicing v2 operations + OAuth + verified webhooks; every agent action ends in a PayPal state change |

## Stage Two — judging matrix

| Criterion | What judges must see | Evidence we produce | Checklist |
|---|---|---|---|
| **Technological Implementation** | Real PayPal lifecycle; AI doing non-trivial work under control | Live sandbox invoice → AI diagnosis → policy-checked plan → `PUT` invoice with partial payments → payer pays in sandbox → webhook → plan progresses | ☐ OAuth token caching ☐ idempotency keys ☐ webhook signature verification ☐ structured-output validation ☐ deterministic policy engine ☐ tests |
| **Design** | Feels like a product, not a hackathon dashboard | Owner console (AG Grid board, diagnosis drawer, approval queue) + payer resolution page | ☐ Distinct visual identity ☐ empty/loading/error states ☐ mobile payer page ☐ a11y |
| **Potential Impact** | Real, quantified problem; clear user | QuickBooks/Bluevine/freelancer-survey evidence; recovered-cash metric in product | ☐ Problem slide ☐ "cash unstuck" KPI ☐ honest claims only |
| **Innovation** | Something others don't do | (1) Reason-aware diagnosis (2) remedies executed as native PayPal primitives (3) payer-side negotiation agent bounded by owner policy | ☐ Show the difference vs. a generic reminder in the demo |
| **Presentation** | Understood in 30 s; working demo | 2:50 video; story of one owner and four stuck invoices | ☐ Script ☐ captions ☐ no fake footage |

## Positioning lines

- "PayPal can remind your client. Unstuck figures out *why* they haven't paid — and fixes that, inside PayPal."
- "The AI proposes; the policy engine decides what's allowed; PayPal executes; the owner stays in control."
