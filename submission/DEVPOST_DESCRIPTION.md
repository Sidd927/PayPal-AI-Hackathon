# Devpost Description: Unstuck

**Tagline (≤ 200 chars):** An AI receivables agent for PayPal Invoicing. It works out why each invoice is unpaid and fixes that cause with native PayPal actions, within rules the owner sets.

**Built with:** paypal-invoicing-api, paypal-webhooks, claude, anthropic-sdk, next.js, react, typescript, tailwindcss, ag-grid, sqlite, render, vitest, playwright

---

## Inspiration

Small service businesses do the work, send a PayPal invoice, and then wait. Over half of US small businesses have unpaid invoices outstanding, averaging $17,500 (QuickBooks, 2025). Almost three in ten owners have delayed their own pay because a client paid late (Bluevine, 2026). Most freelancers say they avoid chasing because they're afraid of losing the client.

When we looked closely, invoices weren't stuck for one reason. They were stuck for several:

- The client's AP team needed a PO number.
- The client was short on cash this month.
- The client disputed the work.
- The invoice went to someone who had left the company.
- A cheque was in the post.
- Or they simply forgot.

The only tool most small businesses have, another reminder, fixes only the last one.

Meanwhile, nearly everything in agentic commerce helps an agent **spend**. We wanted to build the agent that helps a small business **get paid**.

## What it does

Unstuck connects to a business's PayPal invoices and does three things.

1. **Diagnoses why each invoice is stuck.** Claude reads the invoice, the client's payment history and their replies, then names the reason with quoted evidence and a confidence score. Seven open invoices can be stuck for six different reasons, and the board shows each reason in plain words.
2. **Fixes the cause with PayPal itself.**
   - Missing PO: the invoice is updated with the PO and the AP inbox is CC'd.
   - Cash flow: a payment plan is set up with partial payments and a moving minimum due.
   - Forgotten: a short, specific reminder in the owner's voice, delivered by PayPal.
   - Dispute: PayPal's automatic reminders are paused and the owner gets a suggested reply.
   - Cheque in the post: the payment is recorded once the owner confirms it arrived.
   - Large first-time invoice: an early-payment discount, set as a PayPal rule that expires on its own.
3. **Gives the client a dignified way out.** Every reminder links to a private page. There, the client can pay with PayPal or tell an assistant "I can do $400 now". The assistant can only offer plans the owner has already allowed. One click applies the plan in PayPal, and each installment payment moves the plan forward automatically through verified webhooks.

The owner sets the rules: how many reminders, how many installments, the minimum first payment, the maximum discount. Anything that changes money waits for a one-tap approval, and every card shows the policy checks behind its decision.

## How we built it

- **PayPal Invoicing v2** is the backbone. Unstuck uses OAuth2, list/get, `remind`, full-replacement `PUT` (partial payments, minimum due, reference, additional recipients), `conditional-rules`, `payments`, `cancel-reminders`, create/send, and webhook verification and registration.
  - PayPal's server SDK doesn't cover Invoicing, so we wrote a small typed client. It caches tokens, sets `PayPal-Request-Id` on every write, retries safely and records `paypal-debug-id`s.
  - We matched request shapes against the source of PayPal's own Agent Toolkit.
- **Claude** (`claude-opus-5-5` via the Anthropic SDK) plays two roles:
  - a diagnosis agent using **structured outputs**;
  - a client-facing assistant using a **tool loop** with four strict tools.
- **A deterministic policy engine** sits between the AI and PayPal.
  - Model output is sanitised.
  - Plans and discounts are computed in integer cents by code.
  - Every action is classified *auto*, *needs approval* or *blocked* before anything touches PayPal.
- **Next.js 16 / React 19 / Tailwind 4** for the app, **AG Grid** for the receivables board and audit log, **SQLite** for Unstuck's own state, and **Render** for hosting.

## Challenges we ran into

- **The invoice update is a full replacement.** One missing field would silently damage a client's invoice. Every change is GET → strip read-only fields → mutate → PUT. We tested it against a strict mock that rejects read-only fields and missing items.
- **`INVOICING.INVOICE.PAID` fires for partial and pending payments too.** We treat webhooks as signals, never as data: verify, dedupe, re-fetch the invoice, then advance the plan. A sync path covers missed webhooks.
- **Letting an AI negotiate money safely.** The payer assistant has no tool that changes amounts. It can only ask the policy engine for a plan, and nothing happens until the client clicks Accept. We tested this with a scripted prompt-injection attempt.
- **Our build environment couldn't reach the PayPal sandbox.** So we built a stateful mock of the Invoicing and Webhooks APIs, ran the whole app against it over HTTP (23 checks, 84 API calls), and kept a clearly labelled simulation mode for anyone without credentials.

## Accomplishments we're proud of

- Every AI decision ends in a **real PayPal state change** or an explicit, explained refusal, never just a nicer email.
- A client-facing agent that **negotiates within bounds**: agentic commerce on the seller's side.
- 40 unit/flow tests, 23 contract checks and 14 browser end-to-end checks, all passing.

## What we learned

The hard part of getting paid isn't the reminder; it's the conversation. AI is good at reading the conversation. Code is good at doing the maths. PayPal already has the primitives (partial payments, discounts, reminders) that small businesses rarely set up by hand. Putting the three together is what makes it work.

## What's next for Unstuck

- Learn which remedy works for which reason and client.
- Recurring invoices and failed subscription renewals.
- Expose the policy-gated tools as an MCP server.
- Agent-to-agent settlement with clients' AP agents.
- Distribution as an add-on for PayPal Invoicing users.

## Try it

- **Code:** https://github.com/Sidd927/PayPal-AI-Hackathon (MIT)
- **Hosted demo:** _add the Render URL after deploy_
- **Video:** _add the YouTube URL_
- **Locally, no keys:** `npm install && npm run dev`. This opens a labelled simulation with seven stuck invoices.
- **Locally, with PayPal sandbox and Claude:** see the README. `npm run seed:sandbox` creates the demo invoices in your sandbox.
