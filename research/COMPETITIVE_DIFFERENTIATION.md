# Competitive Differentiation

> **Correction (Phase 2, 2026-11-04):** this Phase 1 document says no entrant in this hackathon works on seller receivables. That was wrong: *Owed*, *Invoice Chaser* and *paypal-bill-agent* do. See `research/PHASE_2_COMPETITIVE_RESEARCH.md` for the corrected analysis and how Unstuck differs.

| Capability | PayPal reminders | QuickBooks/Xero | Chaser/Upflow | AI-native AR (Paraglide, Daylit) | **Unstuck** |
|---|---|---|---|---|---|
| Built for 1–10 person businesses | ✓ | ~ | ✗ | ✗ | ✓ |
| Works on PayPal Invoicing | ✓ | ✗ | ✗ | ✗ | ✓ |
| Understands client replies | ✗ | ✗ | ~ | ✓ | ✓ |
| Diagnoses *why* an invoice is stuck | ✗ | ✗ | ✗ | ~ | ✓ (taxonomy + evidence) |
| Executes the remedy in the payment rail | ✗ | ✗ | ~ (portals) | ✗ (drafts) | ✓ (partial payments, discounts, reminders, references) |
| Payer can self-negotiate a plan within seller rules | ✗ | ✗ | ✗ | ✗ | ✓ |
| Deterministic policy + human approval for money changes | n/a | n/a | rules | approval | ✓ (auto / approve / block per action) |

## Defensibility

1. **Remedy library mapped to PayPal primitives.** Each stuck reason links to an executable PayPal action. This is deep integration, not a wrapper.
2. **Policy-bounded payer agent.** Agent-to-human negotiation that changes payment terms safely. This is a new interaction model for agentic commerce on the seller side.
3. **Outcome data.** Over time, which remedy resolves which reason for which client type (opt-in), which compounds into better recommendations.

## The one-line contrast for judges

Most agentic-commerce projects help an agent **spend**. Unstuck helps a small business **get paid**.
