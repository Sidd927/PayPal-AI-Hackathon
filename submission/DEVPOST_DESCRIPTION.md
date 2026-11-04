# Devpost Description: Unstuck

**Tagline (≤ 200 chars):** Every unpaid invoice has a reason. Unstuck finds it, fixes it inside PayPal within your rules, and follows it until the money arrives.

**Built with:** paypal-invoicing-api, paypal-webhooks, claude, anthropic-sdk, ag-grid, ag-studio, next.js, react, typescript, tailwindcss, sqlite, vitest, playwright

**AI tools used (disclosure):**
- *In the product:* Anthropic Claude (`claude-opus-5-5`) through the Anthropic SDK, used for:
  - structured-output invoice diagnosis;
  - a tool-using assistant on the client's resolution page;
  - optionally, AG Studio's built-in Insights agents.

  Without a key, a labelled rules-only fallback runs instead. The *Unstuck Insights* agent in AG Studio uses no LLM: it routes questions to predefined reports over read-only data.
- *In development:* Claude Code, an AI coding assistant, wrote much of the code and documentation under our direction.

---

## Inspiration

A two-person design studio sends a PayPal invoice, does the work, and waits. More than half of US small businesses have unpaid invoices outstanding, and those that do are owed $17,500 on average (QuickBooks, 2025). About three in ten owners have delayed their own pay because of it (Bluevine, 2026).

When we looked at why invoices actually stall, the reasons were different every time:
- an AP team that needs a PO number;
- a client short on cash this month;
- a dispute about the work;
- an invoice sent to someone who left;
- a cheque in the post;
- a promise to pay "by Friday" that quietly passed.

Most tools answer every one of these with another reminder, and a reminder fixes only one of them.

## What it does

Unstuck is an AI receivables-resolution agent for businesses that invoice with PayPal. It runs one loop for every unpaid invoice:

1. **Spot:** sync invoices from PayPal, and find what's late, unanswered or a broken promise.
2. **Understand:** read the invoice, payment history and the client's replies. The diagnosis keeps what the client actually *said* (quoted verbatim) separate from what the agent *infers*. It says so when the cause is unknown.
3. **Resolve within your rules.** Pick the remedy that matches the cause:
   - add the PO and re-send to AP;
   - a payment plan as PayPal partial payments;
   - a reminder to the right person;
   - pause reminders during a dispute;
   - record the cheque once it arrives;
   - an early-payment discount that expires on its own.

   A deterministic policy engine, not the model, decides whether the remedy runs automatically, needs your OK, or is blocked.
4. **Your OK:** anything that changes money waits for one tap. The card shows the exact PayPal change and every rule check. When you approve, the rules are checked again against PayPal's *current* invoice, so yesterday's approval can't record a cheque on an invoice paid this morning.
5. **Act in PayPal:** the change is made through the PayPal Invoicing API with an idempotency key, and shown only after PayPal confirms it.
6. **Agree with the client:** every reminder links to a private resolution page. A client who can't pay in full picks a plan your rules allow, sees the consequences in plain words, and accepting it switches the PayPal invoice to partial payments immediately.
7. **Verify:** payments arrive by verified PayPal webhook. Unstuck re-reads the invoice and never trusts the payload. Installments advance the minimum due. A missed promise or installment sends the invoice back into the loop, where the agent follows it up within your rules.
8. **Learn:** Insights shows what happened after each action: paid in full since, part paid, or nothing yet. It is labelled as timing, not proof of causation.

The dashboard shows the loop itself. Every open invoice sits in exactly one stage (Spotted, Understood, Waiting for you, Acted, Agreed, Paid), computed from recorded facts.

**Insights (AG Studio).** Ask questions such as:
- "Which customers account for the highest overdue receivables?"
- "Which payment promises have been missed?"
- "Which invoices need owner intervention today?"

Our own agent, built with the AG Studio Agent Framework, answers with names and amounts from read-only data and opens the matching report. It declines anything it can't answer from the data.

## How we built it

- **PayPal Invoicing v2 and Webhooks:**
  - list/get, remind, full-replacement update (partial payments, minimum due, reference, CC), conditional rules (discounts), record payment, cancel reminders, and create/send;
  - webhook verification and registration;
  - request shapes checked against PayPal's own Agent Toolkit source;
  - idempotency keys on every write;
  - webhooks deduplicated and treated as signals: we always re-read the invoice.
- **Claude** in two roles:
  - structured-output diagnosis, sanitised and converted to typed actions *by code*;
  - a client-facing assistant with four strict tools, which can only surface plans the policy engine produced.
- **A deterministic policy engine** between the AI and PayPal:
  - plan maths, discount caps, recipients and links are never taken from the model;
  - money changes proposed by the agent always need the owner;
  - reminders the agent writes are never sent automatically if they contain foreign links, other payment details or legal threats.
- **AG Grid** for the risk-ranked receivables board and the audit log.
- **AG Studio** for Insights:
  - a themed report over five read-only tables;
  - a custom `clientToolRunner` agent registered with `createAiHarness`;
  - with a key, Studio's built-in agents run through a server-side `AgLlmAdapter` for Claude.
- **Next.js 16, React 19, Tailwind 4, SQLite.**

## Challenges

- **PayPal's invoice update replaces the whole invoice.** We GET, strip read-only fields, change one thing and PUT. This is proven against a strict mock that rejects read-only fields.
- **Letting an AI talk money with a client safely.** The assistant can only ask the rules engine for a plan, and nothing happens until the client accepts.
- **Stale approvals.** Our own audit found that an approved action ran even if the invoice had changed since. Execution now re-runs the rules against PayPal's current state, and the tests fail if that check is removed.
- **No sandbox access from our build environment.** Its network policy blocked PayPal's sandbox. We built a strict PayPal mock and ran the real app against it over HTTP (25 checks, 104 API calls). The live sandbox run has a step-by-step runbook. _[Replace this line with the sandbox result once it is recorded.]_

## Accomplishments

- You can *see* the resolution loop: every invoice, every stage, and every number traceable to a record.
- Remedies happen as PayPal state changes, not drafts, and the client is part of the fix.
- Safety is shown by tests, not asserted. A deliberately *compromised model* tries to:
  - mark invoices paid;
  - grant a 90% discount;
  - inject instructions through a "PO number";
  - redirect reminders.

  Code stops each one.
- Test coverage:
  - 100 unit, agent, adversarial and reliability tests;
  - 25 contract checks;
  - 22 browser checks;
  - a 26-scenario AI evaluation with strict scoring. The rules-only baseline scored 14/26 correct with 12 abstentions, 0 forbidden actions and 0 safety violations. _[Add the Claude result once it has run; don't publish one before.]_

## What we learned

The hard part of getting paid isn't the reminder. It's finding out what's actually in the way, making the fix easy for both sides, and noticing when a promise quietly breaks.

## What's next

- Publish the Claude evaluation.
- An email-forwarding inbox, so client replies arrive without copy-paste.
- Learn which remedies work for which reasons, once real outcomes exist.
- Expose the policy-gated actions as an MCP server, so a client's AP agent can settle through the same rules.

## Try it

- **Code:** https://github.com/Sidd927/PayPal-AI-Hackathon (MIT)
- **Local, no keys (2 minutes):** run `npm install && npm run dev`, open http://localhost:3000 and press **Run the agent**. This is a labelled simulation: no PayPal calls, rules-only AI. The judge walkthrough is in `submission/DEMO_WALKTHROUGH.md`.
- **Local with the PayPal sandbox and Claude:** README → "Run it".
- **Hosted demo:** _add only once deployed_
- **Video:** _YouTube URL_
