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

Most tools we found, including many AI ones, answer all of these with a better-written reminder.

## What it does

Unstuck is an AI receivables resolution agent for PayPal Invoicing. It diagnoses why payments are stuck, negotiates policy-compliant resolutions, executes supported actions through PayPal, and follows agreements through to actual payment. Press **Run the agent** and you watch it work through every invoice:

1. It syncs with PayPal and ranks invoices by a transparent risk score.
2. It diagnoses why each invoice is stuck, separating quoted evidence from inference.
3. It applies the remedy that matches the cause, as a **PayPal action**, within your rules:
   - add the PO and re-send to AP;
   - set up a payment plan with partial payments and a moving minimum due;
   - send a reason-specific reminder;
   - pause reminders during a dispute;
   - record a cheque once it arrives;
   - add an early-payment discount.
4. Anything that changes money waits for your one-tap approval. Each card shows the exact PayPal change and the rule checks behind it. When you approve, the rules are checked again against PayPal's current invoice, so an approval from yesterday can't record a cheque on an invoice paid this morning.
5. It follows through: installments advance the minimum due, missed promises and late installments come back to the agent, and only money PayPal reports counts as collected.

Every reminder links the client to a **private resolution page**. Clients who can't pay in full can say so. An assistant can only offer plans your rules already allow, the client sees the consequences in plain words before accepting, and acceptance switches the PayPal invoice to partial payments immediately. Each installment paid on PayPal arrives by verified webhook, and the plan moves on by itself.

**Insights**, built with AG Studio, shows owed by stuck reason, aging and risk, plus what the agent did and why. Ask it "Which customers have the largest outstanding balance?" or "Build a report for invoices requiring human approval". Our own agent, built with the AG Studio Agent Framework, answers from the data, opens the matching report, and declines questions it has no report for. It runs both on the page and in Studio's AI panel.

## How we built it

- **PayPal Invoicing v2 and Webhooks** are the backbone. Unstuck uses list/get, remind, full-replacement update (partial payments, minimum due, reference, CC), conditional rules, record payment, cancel reminders, create/send, and webhook verification and registration.
  - Request shapes follow PayPal's own Agent Toolkit source.
  - Every write carries an idempotency key.
  - Webhooks are verified, deduplicated and treated as signals: we always re-read the invoice.
- **Claude** acts as:
  - a diagnosis agent using structured outputs;
  - a client-facing assistant using a tool loop with four strict tools.
- **A deterministic policy engine** between AI and PayPal. The model never supplies amounts, links or recipients that go out unchecked, and agent-proposed money changes always require the owner.
- **Next.js 16 / React 19 / Tailwind 4** for the app. **AG Grid** powers the risk-sorted receivables board and the audit log. **AG Studio** powers Insights: a themed report over five read-only tables, plus a custom `clientToolRunner` agent registered as the primary agent with `createAiHarness`. With a Claude key, Studio's built-in agents also run through a server-side `AgLlmAdapter`. **SQLite** stores state.

## Challenges

- **The PayPal invoice update replaces the whole invoice.** We GET, strip read-only fields, change one thing, and PUT, all proven against a strict mock that rejects read-only fields.
- **Letting an AI talk money with a client safely.** The assistant can only ask the rules engine for a plan; nothing happens until the client clicks Accept.
- **Proving safety rather than asserting it.** We wrote tests where a *compromised model* tries to mark invoices paid, grant a 90% discount, inject instructions through a "PO number", or redirect reminders. Each is stopped by code. The tests also caught a real defect we then fixed.
- **Stale approvals.** A late audit found that an approved action ran even if the invoice had changed since. Execution now re-runs the rules against PayPal's current state, and three tests prove it (each fails if the re-check is removed).
- **Our build environment couldn't reach the PayPal sandbox**, so we built a strict PayPal mock and ran the full app against it over HTTP (25 checks, 97 API calls). The live sandbox run is documented step by step. _[Replace this line with the real sandbox result once recorded.]_

## Accomplishments

- An observable agent: every step it takes, and why, is on screen.
- Remedies executed as PayPal state, not drafts.
- Two-sided resolution: the client is part of the fix.
- 90 unit, agent, adversarial and reliability tests, 25 contract checks and 20 browser checks, plus a 26-scenario AI evaluation with strict scoring. The rules-only baseline scored 14/26 correct with 12 abstentions, zero forbidden actions and zero safety violations. _[Add the Claude result once run; don't publish it before.]_

## What we learned

The hard part of getting paid isn't the reminder; it's finding out what's actually in the way, and making the fix easy for both sides.

## What's next

- Run the Claude evaluation and publish it.
- Email-forwarding inbox.
- Learn which remedies work for which reasons.
- Expose the policy-gated actions as an MCP server, so a client's AP agent can settle through the same rules.

## Try it

- **Code:** https://github.com/Sidd927/PayPal-AI-Hackathon (MIT)
- **Demo:** _Render URL — add only once deployed_ (simulation mode, open to judges; a PayPal-connected deployment requires the owner password)
- **Video:** _YouTube URL_
- **Local, no keys:** `npm install && npm run dev` (labelled simulation)
- **Local with the PayPal sandbox and Claude:** README → "Run it"
