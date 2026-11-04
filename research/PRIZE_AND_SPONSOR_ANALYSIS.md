# Prize and Sponsor Analysis

_2026-11-04. Prize figures were reconciled across the Devpost overview extract, PayPal's developer blog, and three aggregators._

## Prize table

| Category | Prize | Notes |
|---|---|---|
| **Grand — 1st** | $12,000 | |
| **Grand — 2nd** | $8,000 | |
| **Grand — 3rd** | $5,000 | |
| Honorable — Most Creative | $5,000 | |
| Honorable — Most Impactful | $5,000 | |
| Honorable — Best Demo Delivery | $5,000 | |
| Honorable — Best Use of PayPal + AI | $5,000 | |
| Honorable — Best Use of Agentic Commerce | $5,000 | |
| Sponsor — AG Grid | $5,000 / $2,000 / 3 × $1,000 | Condition: "eligible project using AG Grid tools" |
| Sponsor — APIMatic | 3 × $1,000 + 6 months Business subscription | |
| Sponsor — Bryntum | 3 × $1,000 | |
| Sponsor — Channel3 | $1,500 | |
| Sponsor — Render | $1,000 / $750 / $500 **credits** | Condition: "eligible project using Render tools" |

### Reconciling the "total pool"

Grand ($25,000) + Honorable (5 × $5,000 = $25,000) + AG Grid ($10,000) + APIMatic ($3,000) + Bryntum ($3,000) + Channel3 ($1,500) = **$67,500 cash**. Render adds **$2,250 in credits** → **$69,750 total value**, plus APIMatic subscriptions. PayPal's blog says "$60,000+", which is consistent with this. **We do not quote any other figure.**

## Combination rule → strategy

A project can win **one Grand _or_ one Honorable** + **one Sponsor** prize. Our realistic ceiling: **Grand Prize + AG Grid**. The fallback is **Most Impactful / Best Use of PayPal + AI + AG Grid**.

## Sponsor technologies

| Sponsor | What it is | Access | Fit with Unstuck | Decision |
|---|---|---|---|---|
| **AG Grid** | Enterprise-grade JS data grid (React/Angular/Vue) | Community edition MIT, on npm (`ag-grid-react@36`) — no key needed | **Strong.** The receivables board is a dense, sortable, filterable table of invoices with aging, risk, AI diagnosis and next action — exactly what AG Grid is built for | **Integrate (primary sponsor target)** |
| **Render** | PaaS for web services, Postgres, cron | Free web service tier (spins down after 15 min idle); free Postgres expires after 30 days | **Good.** Hosts the judge demo; Blueprint `render.yaml`. Free Postgres would expire mid-judging (Dec 1–15), so we use SQLite reseeded from PayPal | **Integrate (deployment); secondary** |
| APIMatic | SDK/docs generator from OpenAPI (it generates PayPal's own server SDKs) | Account signup | Weak — only useful if we publish a public API for partners. Not in core journey | Skip (roadmap) |
| Bryntum | Scheduler/Gantt components | Commercial licence, trial | Weak — a payment-plan schedule doesn't need a resource scheduler | Skip |
| Channel3 | Product-catalog search API for shopping agents | API key signup, 1,000 free searches/month | None — no product discovery in receivables | Skip |
| Elastic | Search/observability | Cloud trial | Over-engineering for this data volume | Skip |
| Postman | API platform | Free | Could publish our API collection; low prize value (no prize listed) | Optional: export collection |
| Zapier | Workflow automation | Free tier | Plausible future channel (e.g. "invoice paid → Slack"). Not core | Skip (roadmap) |
| KERNEL | Browser infra for agents | Signup | Not needed | Skip |
| Astropods | Agent hosting | Signup | Not needed | Skip |

Rule applied: **no sponsor tool unless it improves the real product.**
