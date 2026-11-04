# Devpost Description: Unstuck

**Tagline (≤ 200 chars):** Every unpaid invoice has a reason. Unstuck finds it — and resolves it with your client, inside PayPal.

**Built with:** paypal-invoicing-api, paypal-webhooks, claude, anthropic-sdk, ag-grid, ag-studio, next.js, react, typescript, tailwindcss, sqlite, render, vitest, playwright

**AI tools used:**
- *In the product:* Anthropic Claude (`claude-opus-5-5`) via the Anthropic SDK, with structured outputs for diagnosis and tool use for the client-facing assistant.
- *In development:* Claude Code, an AI coding assistant, wrote much of the code and documentation under our direction.

---

## Inspiration

Small service businesses do the work, send a PayPal invoice, and wait. More than half of US small businesses have unpaid invoices, and those that do are owed $17,500 on average (QuickBooks, 2025). About three in ten owners have delayed their own pay because of it (Bluevine, 2026).

When we looked at real reasons, invoices weren't stuck for one reason but for many:

- an AP team needing a PO number;
- a client short on cash this month;
- a dispute about the work;
- an invoice sent to someone who had left;
- a cheque in the post;
- a client who forgot.

Every tool we found, including AI ones, answers all of these with a better-written reminder.

## What it does

Unstuck is an AI receivables agent for PayPal Invoicing. Press **Run the agent** and you watch it work through every invoice:

1. It syncs with PayPal and ranks invoices by a transparent risk score.
2. It diagnoses why each invoice is stuck, separating quoted evidence from inference.
3. It applies the remedy that matches the cause, as a **PayPal action**, within your rules:
   - add the PO and re-send to AP;
   - set up a payment plan with partial payments and a moving minimum due;
   - send a reason-specific reminder;
   - pause reminders during a dispute;
   - record a cheque once it arrives;
   - add an early-payment discount.
4. Anything that changes money waits for your one-tap approval. Each card shows the exact PayPal change and the rule checks behind it.

Every reminder links the client to a **private resolution page**. Clients who can't pay in full can say so. An assistant can only offer plans your rules already allow, the client sees the consequences in plain words before accepting, and acceptance switches the PayPal invoice to partial payments immediately. Each installment paid on PayPal arrives by verified webhook, and the plan moves on by itself.

**Insights**, built with AG Studio, shows owed by stuck reason and risk, plus what the agent did and why.

## How we built it

- **PayPal Invoicing v2 and Webhooks** are the backbone. Unstuck uses list/get, remind, full-replacement update (partial payments, minimum due, reference, CC), conditional rules, record payment, cancel reminders, create/send, and webhook verification and registration.
  - Request shapes follow PayPal's own Agent Toolkit source.
  - Every write carries an idempotency key.
  - Webhooks are verified, deduplicated and treated as signals: we always re-read the invoice.
- **Claude** acts as:
  - a diagnosis agent using structured outputs;
  - a client-facing assistant using a tool loop with four strict tools.
- **A deterministic policy engine** between AI and PayPal. The model never supplies amounts, links or recipients that go out unchecked, and agent-proposed money changes always require the owner.
- **Next.js 16 / React 19 / Tailwind 4** for the app. **AG Grid** powers the risk-sorted receivables board and the audit log; **AG Studio** powers the Insights report. **SQLite** stores state and **Render** hosts it.

## Challenges

- **The PayPal invoice update replaces the whole invoice.** We GET, strip read-only fields, change one thing, and PUT, all proven against a strict mock that rejects read-only fields.
- **Letting an AI talk money with a client safely.** The assistant can only ask the rules engine for a plan; nothing happens until the client clicks Accept.
- **Proving safety rather than asserting it.** We wrote tests where a *compromised model* tries to mark invoices paid, grant a 90% discount, inject instructions through a "PO number", or redirect reminders. Each is stopped by code. The tests also caught a real defect we then fixed.
- **Our build environment couldn't reach the PayPal sandbox**, so we built a strict PayPal mock and ran the full app against it over HTTP (24 checks, 97 API calls). The live sandbox run is documented step by step.

## Accomplishments

- An observable agent: every step it takes, and why, is on screen.
- Remedies executed as PayPal state, not drafts.
- Two-sided resolution: the client is part of the fix.
- 59 unit/agent/adversarial tests, 24 contract checks, 17 browser checks, and a 26-scenario AI evaluation (rules baseline: 81% reason accuracy, zero safety violations).

## What we learned

The hard part of getting paid isn't the reminder; it's finding out what's actually in the way, and making the fix easy for both sides.

## What's next

- Run the Claude evaluation and publish it.
- Email-forwarding inbox.
- Learn which remedies work for which reasons.
- Expose the policy-gated actions as an MCP server, so a client's AP agent can settle through the same rules.

## Try it

- **Code:** https://github.com/Sidd927/PayPal-AI-Hackathon (MIT)
- **Demo:** _Render URL_ (owner console behind basic auth; credentials in the testing instructions)
- **Video:** _YouTube URL_
- **Local, no keys:** `npm install && npm run dev` (labelled simulation)
- **Local with the PayPal sandbox and Claude:** README → "Run it"
