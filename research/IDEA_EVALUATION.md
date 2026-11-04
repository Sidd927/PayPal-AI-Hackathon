# Idea Evaluation

_2026-11-04. Weights: Problem 15 · PayPal 15 · AI 15 · Innovation 15 · Impact 10 · Feasibility 10 · Demo 10 · Sponsor 5 · Commercial 5 = 100._

Penalties were applied for crowding in **this** hackathon (see `COMPETITOR_AND_EXISTING_SOLUTIONS.md` §A), superficial PayPal use, and dependency on APIs we can't access in sandbox.

## The 15 candidates

Each entry: **user · problem · current workflow & why it fails · solution · why PayPal · why AI · demo · main risk.**

1. **Unstuck — reason-aware receivables agent on PayPal Invoicing.** Micro-business owners · invoices stall for different reasons, owners avoid chasing · generic reminders and awkward emails · AI diagnoses why each invoice is stuck, executes the remedy as PayPal primitives (partial-payment plan, early-pay discount, reminder, recorded payment) within owner policy; payer gets a self-serve resolution page · Invoicing *is* the rail · understanding replies, diagnosing, negotiating within bounds, writing tone-aware outreach · four stuck invoices resolved four different ways, one paid live in sandbox · risk: AR agents exist in enterprise.
2. **Relief payouts for mutual-aid funds.** Volunteer coordinators · spreadsheet + personal Venmo, burnout · AI intake triage → human approval → Payouts · Payouts/Venmo · multilingual intake, dedupe · *risk: near-identical entry (neighborline) already public.*
3. **Agent spend firewall / mandates.** Users delegating purchases to agents · agents overspend or get prompt-injected · *at least three entries already*.
4. **Agentic B2B procurement + negotiation.** · *two entries already (MateiS2002, The Table)*.
5. **Returns & refund resolution agent for PayPal merchants.** Small online sellers · email-driven returns, abuse · AI reads request/photos, applies policy, refunds via Payments API · Refund + Tracking + Disputes APIs · vision + policy reasoning · risk: Loop/AfterShip/Gorgias AI exist; sandbox photos contrived.
6. **Dispute evidence agent.** · Disputes API · sandbox disputes hard to create on demand · Chargeflow/Justt mature.
7. **DM-to-checkout for social sellers.** Instagram/WhatsApp sellers · orders lost in DMs, screenshot reconciliation · AI parses chats into orders, sends PayPal checkout, reconciles via webhook · Orders API · risk: ManyChat/Shopify Inbox; DM APIs need Meta approval.
8. **Subscription dunning for PayPal Subscriptions.** Creators/SaaS · involuntary churn · AI chooses retry/outreach · sandbox can't easily simulate failed renewals.
9. **Volunteer expense reimbursement.** PTAs/clubs · receipts + slow cheques · AI receipt audit → Payouts · risk: Open Collective already does PayPal-paid expenses.
10. **Scam-hold for P2P payments.** Elderly users · *entry exists (SureSend)*; third parties can't hold a consumer's P2P payment via API.
11. **Marketplace payout ops copilot.** Platform operators · payout-file errors · AI anomaly review → Payouts · rules do most of the work; AI thin.
12. **College emergency micro-grants.** Students · weeks-long disbursal · structurally similar to #2 (crowding).
13. **Voice POS for market vendors.** · Orders/QR · AI = speech-to-cart only; Zettle exists.
14. **Creator brand-deal milestone billing.** · Invoicing · AI verifies posts are live · narrow; verification brittle.
15. **Pay-per-call billing for MCP servers.** Tool builders · no way to charge agents · Orders/prepaid credits · AI is a consumer, not the intelligence → weak on AI criterion.

## Scores

| # | Idea | Prob 15 | PP 15 | AI 15 | Innov 15 | Impact 10 | Feas 10 | Demo 10 | Spons 5 | Comm 5 | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Unstuck (receivables)** | 13 | 14 | 13 | 12 | 8 | 9 | 9 | 4 | 5 | **87** |
| 5 | Returns & refunds agent | 11 | 13 | 13 | 9 | 7 | 8 | 8 | 3 | 4 | 76 |
| 7 | DM-to-checkout | 10 | 12 | 12 | 10 | 7 | 7 | 9 | 2 | 4 | 73 |
| 2 | Relief payouts | 13 | 14 | 12 | 5 | 10 | 8 | 9 | 3 | 2 | 76 (innovation already penalised; **rejected**: near-identical public entry) |
| 6 | Dispute evidence | 11 | 13 | 12 | 7 | 6 | 5 | 5 | 3 | 4 | 66 |
| 3 | Agent spend firewall | 10 | 12 | 11 | 4 | 6 | 8 | 8 | 2 | 3 | 64 |
| 4 | B2B negotiation | 8 | 11 | 12 | 4 | 5 | 7 | 8 | 3 | 3 | 61 |
| 9 | Expense reimbursement | 10 | 12 | 10 | 5 | 7 | 8 | 8 | 3 | 3 | 66 |
| 11 | Payout ops | 9 | 13 | 7 | 6 | 5 | 8 | 7 | 4 | 4 | 63 |
| 12 | Emergency micro-grants | 12 | 13 | 11 | 4 | 9 | 7 | 8 | 3 | 2 | 69 |
| 8 | Dunning | 11 | 12 | 10 | 6 | 6 | 5 | 5 | 3 | 4 | 62 |
| 14 | Brand-deal billing | 7 | 12 | 10 | 8 | 5 | 6 | 7 | 2 | 3 | 60 |
| 10 | Scam-hold | 13 | 6 | 11 | 5 | 9 | 3 | 6 | 1 | 2 | 56 |
| 13 | Voice POS | 6 | 11 | 7 | 6 | 5 | 8 | 8 | 1 | 3 | 55 |
| 15 | MCP billing | 7 | 11 | 5 | 9 | 5 | 7 | 6 | 2 | 4 | 56 |

### Score reasoning (top five)

- **Unstuck (87).** *Problem 13:* multiple independent surveys, large and recurring. *PayPal 14:* PayPal is the system of record; every remedy is an Invoicing API call. *AI 13:* reading free-text replies, diagnosing reasons, bounded negotiation, tone-aware writing. Not 15, because the money math is (correctly) deterministic. *Innovation 12:* enterprise AI-AR exists; executed-in-rail remedies, payer-side negotiation and the micro-business focus are new, and no entrant here does it. *Feasibility 9:* all APIs verified; sandbox-testable. *Demo 9:* four invoices, four different outcomes. *Sponsor 4:* AG Grid is the natural board.
- **Returns agent (76).** Solid, but returns tooling is a mature category, and the demo relies on contrived photos.
- **Relief payouts (76 → 70).** Highest impact, but a public entry is near-identical; judges would compare directly.
- **DM-to-checkout (73).** Realistic DM ingestion needs Meta API approval; a demo would paste chats.
- **Emergency micro-grants (69).** Same structure as relief payouts.

## Challenging the winner

| Question | Answer |
|---|---|
| Would a real user need this? | Yes — 56% of SMBs have unpaid invoices; owners report avoiding the chase |
| Repeated use? | Every invoice cycle, every month |
| Better than existing? | PayPal's reminders are reason-blind; enterprise AR tools are out of reach for this user |
| Is PayPal essential? | Yes — the money sits in PayPal invoices; the remedies are PayPal features |
| Is AI doing real work? | Yes — without language understanding, diagnosis from replies isn't possible; we keep math deterministic |
| < 3-minute demo? | Yes — one owner, four invoices, one live payment |
| Would a PayPal engineer see why it exists? | It drives usage of Invoicing features (partial pay, discounts) that merchants rarely set up by hand |
| Startup potential? | Freemium for PayPal Invoicing users; success-based pricing; later distribution via PayPal's app ecosystem |

**Decision: Unstuck.** Selected autonomously on the evidence above.
