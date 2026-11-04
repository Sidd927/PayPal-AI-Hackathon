# Phase 2: Competitive Research (corrected)

_2026-11-04. Phase 1 claimed there were no receivables entrants in this hackathon. **That was wrong.** Corrected below._

## A. Entries in this hackathon in the same space (public GitHub repos found via search)

| Project | What it does (from its public description) | Overlap | Where Unstuck differs |
|---|---|---|---|
| **Owed** ([edilsonsantos-co-za/owed](https://github.com/edilsonsantos-co-za/owed)) | AI collections copilot for freelancers and small studios billing through PayPal invoices. Claude agents with tools (`get_receivables`, `get_client_profile`, `draft_reminder`, `draft_invoice`); approval queue; AG Studio dashboard | **High:** same user, same rail, same AI vendor, same sponsor | Owed drafts reminders and invoices. Unstuck diagnoses the *blocker* and executes non-reminder remedies in PayPal (partial-payment plans with a moving minimum due, PO/AP re-issue, conditional discounts, recorded payments, paused reminders during disputes), and adds a **client-side** resolution page where the client negotiates within the owner's rules |
| **Invoice Chaser** ([leex0x0/invoice-chaser](https://github.com/leex0x0/invoice-chaser)) | Autonomous agent that chases unpaid invoices with progressively firmer follow-ups as they age; listens for PayPal webhooks to stop | Medium | Age-based escalation is the "generic reminder" pattern Unstuck is designed against. Its README lists sandbox wiring as a next step |
| **AI Bill & Invoice Agent** ([guannan1031/paypal-bill-agent](https://github.com/guannan1031/paypal-bill-agent)) | Parses bills, flags risks, pays and gets paid, human in the loop | Low–medium | Payables-and-receivables generalist; no reason-specific recovery |
| Agentic B2B commerce ([MateiS2002](https://github.com/MateiS2002/paypal-ai-hackathon-2026)) | Buyer/seller agents negotiate, settle via PayPal Invoicing | Low | Settlement, not recovery |

**Conclusion:** the space is contested. Unstuck's defensible differences are:

1. **A reason-specific remedy library executed as PayPal state changes** (not reminder drafting).
2. **Two-sided resolution:** the client gets a dignified, policy-bounded way to propose a plan, and acceptance applies it in PayPal.
3. **A deterministic trust layer** that shows its checks.

Phase 2 makes these visible in the first 30 seconds of the product and the video.

## B. Commercial products

| Product | Segment | AI | Payment rail | Gap for a PayPal-invoicing freelancer |
|---|---|---|---|---|
| PayPal Invoicing (native) | Micro | None | PayPal | Generic scheduled reminders; partial payments and discounts must be configured by hand |
| Chaser | SMB on QuickBooks/Xero | Template automation | Accounting integrations | Requires an accounting stack; reminder-centric |
| Upflow, Tesorio, Kolleno, Gaviti | Mid-market AR teams | Increasing (reply classification, prioritisation) | ERP/accounting | Priced and designed for finance teams |
| Paraglide, Daylit (2026) | Mid-market | AI-native agents (email, calls, texts) | ERP | Not PayPal-native; enterprise onboarding |
| Mesha, Paystorm, InvoiceAgent | Freelancers | AI reminder writing | Various | Reminder drafting; no rail-level remedies |
| HoneyBook / Dubsado | Creative services | Some AI | Own payments | Plans set up front; no reactive negotiation |

## C. Revalidated statistics

| Claim | Status | Source and context |
|---|---|---|
| 56% of US small businesses have unpaid invoices; $17.5k average among those businesses | ✅ Confirmed on Intuit's own report page. Context: the average is **among businesses with outstanding invoices**; survey = Intuit QuickBooks Small Business Insights, Jan 2025 wave, n=2,487 US | [QuickBooks 2025 Late Payments Report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2025/) |
| 47% have invoices > 30 days overdue | ✅ Secondary sources citing the same report | [Firm of the Future](https://www.firmofthefuture.com/news/small-business-late-payments-report-2025/) |
| 29% delayed their own pay; 19% charge late fees vs 59% experience late payment | ✅ Bluevine press release, fielded Feb 2–5 2026, n=1,052 US (vendor-commissioned) | [Bluevine](https://www.bluevine.com/newsroom/late-payment-gap-survey-press-release) |
| 57–61% of freelancers fear losing the client if they chase | ⚠️ UK survey (Ormsby Street, n=1,002), date not confirmed, figure varies between write-ups. We now present it as **UK** and as a range | smallbusiness.co.uk |
| 49% of finance execs cite PO problems | ⚠️ 2013, n=100. Used only qualitatively ("a common reason"), never as a headline | CFO.com |

**Relevance to our user.** The QuickBooks and Bluevine samples are US small businesses broadly, not freelancers specifically. We say "small businesses" and do not claim freelancer-specific prevalence.

## D. Trust: would owners let an AI talk to their clients?

No direct survey was found. The design assumption is the cautious one: **nothing that changes money or reaches a new recipient happens without owner approval**, and the client-facing assistant can only surface plans the owner pre-approved. This is a hypothesis to validate with users (see `UPDATED_PRODUCT_STRATEGY.md`).
