# Competitors and Existing Solutions

_2026-11-04._

## A. What other entrants in this hackathon are building (public repos found via search)

| Project | Concept | Overlap with Unstuck |
|---|---|---|
| paypal-agent-firewall (midas-png, fork by sulmamdouh55-cloud) | Rule/Z3-verified firewall for AI-agent payments | None (buyer-agent spend control) |
| Mandate (andreyalchin) | Shopping agent paying only within signed rules | None |
| MateiS2002/paypal-ai-hackathon-2026 | B2B buyer/seller agents negotiate, settle via PayPal Invoicing | Uses Invoicing as **settlement**, not receivables recovery |
| The Table (xkazm04) | Agent-to-agent haggling | None |
| neighborline (Aaaaarin) | Mutual-aid intake → AI → two-person approval → PayPal Payouts | None (we rejected a similar aid-payouts idea because of it) |
| SureSend (Awais-Asghar) | Scam-hold before P2P payment | None |
| paypal-budget-agent (itzbnny) | Conversational budgeting | None |
| PayAgent AI (samikshasainii) | Pay AI agents via Payouts | None |

**Insight:** the field is crowded with *buyer-side* agentic commerce (spend control, mandates, shopping, haggling). We found no entrant working on the **seller's receivables**: getting paid *after* the work is done. This is where small businesses actually lose money and sleep.

## B. Commercial products

| Product | Target | What it does | Gap for our user |
|---|---|---|---|
| PayPal Invoicing (native) | Freelancers, micro-businesses | Send invoices, generic scheduled reminders, partial payments, discounts | No understanding of *why* a client hasn't paid; no negotiation; reminders are identical whatever the situation |
| QuickBooks / Xero reminders | SMBs on accounting software | Template reminders | Same template-only behaviour; requires accounting stack |
| Chaser, Upflow, Tesorio | Mid-market finance teams | Rule-based dunning workflows, portals | Built for AR teams, priced per seat/month, integrate with QuickBooks/Xero/NetSuite — not PayPal Invoicing |
| Paraglide, Daylit, AgentCollect (AI-native AR, 2025–26) | Mid-market/enterprise AR | Classify replies, capture promises to pay, draft follow-ups, human approval for disputes/credits | Enterprise focus; ERP integrations; not PayPal-native; do not *execute* remedies inside the payment rail |
| HoneyBook / Dubsado | Creative service businesses | CRM + invoicing + payment schedules set up front | Plans must be designed in advance; no reactive negotiation when a client gets stuck |
| Collection agencies | Severely delinquent debt | Third-party collection, 20–50% contingency | Relationship-destroying; overkill for a 30-day-late client |

## C. Open-source / hackathon prior art (other events)

- **Settle** (hahzterry) — B2B receivables agent, Stripe Connect success fee (NVIDIA/Stripe/Nous hackathon).
- **PhantomPay** — bandit-chosen reminder strategy + LLM emails.
- **SettleMate** — collections agent for Australian tradies on Pinch Payments.
- **ar-collections-agent** (withoneai) — QuickBooks overdue invoices → Gmail drafts.

None run on PayPal. Most stop at *sending a better email*. None turn the diagnosis into an executed payment-rail change (partial payment plan, early-pay discount) bounded by the owner's policy, and none give the **payer** a dignified self-serve way to say "I can't pay it all right now".

## D. What works, what's missing

**Works:** reminders do recover some late payments; AI reply classification is proven in enterprise AR; partial payments and discounts exist in PayPal.

**Missing for micro-businesses:**
1. **Diagnosis.** Invoices stall for different reasons — missing PO, wrong AP contact, cash crunch, dispute, simple forgetfulness — and each needs a different response.
2. **Execution.** The fix (a plan, a discount, a corrected PO) has to be set up by hand in PayPal, so owners don't bother.
3. **Relationship safety.** Owners avoid chasing because they fear losing the client. Nobody solves the *awkwardness*.
4. **Payer dignity.** A client who can't pay in full has no low-friction way to propose a plan; they go silent.
