# User Problem Discovery

_2026-11-04. Facts are labelled **[V]** verified from a cited source, **[I]** reasonable inference, **[H]** hypothesis to validate._

## Domains explored

Small-business receivables · mutual-aid/relief payouts · social-commerce (DM) sellers · merchant returns & refunds · disputes/chargebacks · buyer-side agentic shopping · subscription dunning · expense reimbursement for volunteer orgs · scam-hold for P2P · marketplace payouts ops · research-participant incentives · college emergency micro-grants · micro-vendor voice POS · creator brand-deal milestones · MCP/agent monetisation.

The full set of 15 candidates is scored in `IDEA_EVALUATION.md`. This document details the problem we selected.

## The selected problem: stuck invoices at micro-businesses

### Who

Solo operators and micro-businesses (1–10 people) who bill clients after doing the work: designers, developers, photographers, consultants, tutors, trades, small agencies. Many invoice with **PayPal Invoicing** because it is free to send and clients can pay by card or PayPal without an account **[V: PayPal invoicing pricing pages]**.

### What is happening

- **56%** of US small businesses have unpaid invoices outstanding, owed **$17,500** on average; **47%** have invoices more than 30 days overdue **[V: QuickBooks 2025 survey, n=2,487]**.
- **29%** of US owners have delayed their own pay because customers paid late; **~17%** missed or nearly missed payroll **[V: Bluevine Payment Gap Report, Mar 2026, n=1,052]**.
- **59%** experience late payment, but only **19%** charge late fees **[V: Bluevine]** — owners are reluctant to apply pressure.
- **57–61%** of UK freelancers worry the client won't hire them again if they chase; **~two-thirds** feel uncomfortable chasing **[V: Ormsby Street survey, n=1,002]**. **40%** don't request late fees, to protect relationships **[V: Ruul survey]**.
- UK estimate: **86 hours/year** of chasing per affected business **[V: UK government study 2025, UK only]**.

### Why it happens

Invoices stall for **different reasons**:

| Reason | Evidence | Right response |
|---|---|---|
| Missing/invalid PO or AP details | 49% of finance execs cited it **[V: TermSync 2013 via CFO.com — older, small sample]** | Re-issue with the PO / send to the AP contact — not a reminder |
| Cash-flow constraint | Cited as a top reason in vendor surveys **[V, low quality]** | Payment plan / partial payments |
| Dispute over line items or quality | Widely reported **[V, qualitative]** | Escalate to owner with context; pause reminders |
| Forgot / buried in inbox | **[I]** | A friendly, specific reminder |
| Wrong contact | **[V, qualitative]** | Find the right recipient |
| Already paid another way | **[I]** | Record the payment, stop reminders |

A generic reminder fixes only one row of that table, yet it is the only tool most micro-businesses have **[I]**.

### Consequences of leaving it unsolved

Owners skip their own pay and borrow on personal credit **[V: Bluevine; e-commerce.news]**. They write off revenue to avoid conflict **[I]**, and burn hours on awkward emails **[V: IPSE ~20 days/year, UK]**.

### Why it has remained unsolved

1. AR software is priced and designed for finance teams, not a solo designer **[V: competitor analysis]**.
2. Diagnosing the reason needs **reading and understanding** messy client replies, which was impractical to automate before capable LLMs **[I]**.
3. Executing the remedy needs a payment rail that supports **partial payments, discounts and reminders by API**. PayPal Invoicing now exposes all of these, and PayPal shipped agent tooling for them in 2025–26 **[V: toolkit source]**.

### Hypotheses to validate (post-hackathon)

- **[H1]** Owners will let an agent send reminders automatically but want approval for anything that changes money. _(Designed in.)_
- **[H2]** Clients offered a self-serve plan page will choose a plan rather than go silent.
- **[H3]** Reason-specific outreach recovers more than generic reminders.
