# Final Problem Statement

> **Correction (Phase 2, 2026-11-04):** this Phase 1 document says no entrant in this hackathon works on seller receivables. That was wrong: *Owed*, *Invoice Chaser* and *paypal-bill-agent* do. See `research/PHASE_2_COMPETITIVE_RESEARCH.md` for the corrected analysis and how Unstuck differs.

**Small service businesses do the work, send a PayPal invoice — and then wait. More than half of US small businesses have unpaid invoices outstanding, averaging $17,500 each.¹ The tools they have can only send the same reminder again, but invoices get stuck for different reasons, and the owners most affected are the ones least willing to push.**

## Who

Freelancers and micro-businesses (1–10 people) who bill clients after delivering a service, often through PayPal Invoicing: designers, developers, consultants, photographers, tutors, trades.

## What is happening

An invoice goes out. It isn't paid by the due date. The owner's options are:

- let PayPal send another generic reminder;
- write an awkward email themselves;
- or wait and hope.

Meanwhile 29% of US owners have delayed their own paycheck because customers paid late.²

## Why it happens

Invoices stall for **specific, different reasons**: the client's accounts-payable team needs a PO number; the client is short on cash this month; the client disputes a line item; the invoice went to the wrong person; or they simply forgot. Each needs a different response. A reminder only fixes "forgot".

Owners also **avoid the conversation**. Most freelancers fear losing the client if they chase,³ and only 19% of small businesses charge late fees even though 59% experience late payment.²

## Why existing solutions fall short

- **PayPal Invoicing** sends reminders but can't tell *why* an invoice is unpaid, and setting up a plan or a discount means editing the invoice by hand.
- **AR automation tools** (Chaser, Upflow, Tesorio, and AI-native newcomers) are built for finance teams on QuickBooks, Xero or ERPs, and priced accordingly.
- **Collection agencies** destroy the relationship the owner is trying to protect.

## The consequence

Money the owner has already earned sits idle for weeks. Owners skip their own pay, borrow on personal credit, or quietly write it off to avoid conflict.

## Why now

1. LLMs can now reliably read a client's messy reply ("we can do half now, rest after the 15th — also AP needs PO 4471") and turn it into structured intent.
2. PayPal's Invoicing API now exposes partial payments, early-payment discounts, reminders and recorded payments. PayPal has released agent tooling for them (Agent Toolkit, MCP server), so an agent can **execute** the remedy, not just suggest it.
3. Agentic commerce is PayPal's strategic focus, but nearly all of it targets the *buyer*. The seller's back office has been left behind.

---
¹ QuickBooks 2025 small-business late payments survey (n=2,487). ² Bluevine Payment Gap Report, March 2026 (n=1,052). ³ Ormsby Street survey of 1,002 UK freelancers: 57–61% worried the client wouldn't return if chased. See `SOURCE_REGISTER.md`.
