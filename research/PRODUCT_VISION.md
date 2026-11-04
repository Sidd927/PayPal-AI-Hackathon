# Product Vision — Unstuck

**Tagline:** Find out why an invoice is stuck. Fix it inside PayPal. Keep the client.

**Value proposition (one sentence):** Unstuck is an AI receivables agent for PayPal Invoicing that works out why each overdue invoice hasn't been paid and resolves it with the right PayPal-native remedy — within rules the owner sets.

## Target users

- **Primary — the owner:** a freelancer or micro-business owner with 5–100 open invoices a month and no finance team.
- **Secondary — the payer:** the client who received the invoice, who may be willing to pay but blocked.

## Core idea

> The agent proposes. The policy engine decides what's allowed. PayPal executes. The owner stays in control.

## Key features (three, done well)

1. **Diagnosis board.** Every open invoice gets a *stuck reason* (forgot · cash-flow · missing PO/AP info · dispute · wrong contact · already paid · unknown), a confidence score, quoted evidence and a recommended next action. Built on AG Grid.
2. **Remedies that execute in PayPal.** Reason-aware reminders delivered through PayPal's remind endpoint; payment plans implemented as partial payments with a minimum due; early-payment discounts as PayPal conditional rules; PO/reference corrections via invoice update; off-PayPal payments recorded. Low-risk actions can run automatically; anything that changes money waits for one-tap owner approval.
3. **Payer resolution page.** A link in every reminder opens a calm page where the client can ask about the invoice and propose what works for them — "I can pay half now". A client-facing agent negotiates **only within the owner's pre-approved policy**, applies the plan in PayPal on the spot, and hands everything else to the owner.

## AI capabilities

- Structured intent extraction from free-text client messages (promise-to-pay date, plan proposal, dispute lines, PO numbers, contacts).
- Evidence-based diagnosis that combines invoice facts, payment history and the conversation.
- Next-best-action selection from a fixed action catalogue, with tool calling.
- Tone-calibrated writing that matches the relationship (long-term client vs. first job).
- Payer-side negotiation agent with constrained tools.

## PayPal integration

OAuth2, Invoicing v2 (search/get, update, remind, conditional rules, record payment, QR code, create/send for seeding), and webhooks with signature verification (`INVOICING.INVOICE.PAID` and others). The sandbox payer pays a real sandbox invoice.

## Expected impact

Faster cash for owners who can least afford to wait, with fewer awkward conversations, and payment plans offered *before* a client goes silent. Product metric: **"cash unstuck"** — dollars collected on invoices after Unstuck acted.

## Long-term vision

1. Distribute through PayPal's merchant ecosystem as an Invoicing add-on.
2. Learn which remedies work for which reasons (with consent) to improve recommendations.
3. Extend to recurring invoices and subscriptions (failed renewals), and to payer-side AP agents — agent-to-agent settlement of stuck invoices.
