# Product Requirements — Unstuck (Hackathon MVP)

## Personas

- **Maya — owner.** Runs a two-person brand studio and invoices through PayPal. She is owed $14k across nine invoices and hates chasing.
- **Dan — payer.** Operations lead at a client company. He wants to pay but his AP team needs a PO number.
- **Priya — payer.** A café owner who received Maya's invoice. Cash is tight this month.

## Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | Sync open invoices from PayPal (search/list + get) into the local store; show them on a receivables board with amount due, days overdue, client, status, stuck reason, confidence, next action | Must |
| F2 | Ingest client messages per invoice (from the payer page, or pasted by the owner from email) | Must |
| F3 | AI diagnosis per invoice: reason ∈ fixed taxonomy, confidence, evidence quotes, summary, recommended action + arguments (structured, schema-validated) | Must |
| F4 | Policy engine: owner-defined limits (max installments, min first payment %, max plan length, max discount %, auto-send reminders on/off, quiet period between reminders, max reminders) → each proposed action is classified **auto / needs approval / blocked** with reasons | Must |
| F5 | Execute approved actions against PayPal: reminder (custom subject/note), enable payment plan (partial payment + minimum due), early-payment discount (conditional rule), update reference/PO, record external payment | Must |
| F6 | Approval queue with one-tap approve/reject; edits to drafted text | Must |
| F7 | Payer resolution page (public, unguessable token): invoice summary, pay with PayPal link, chat with an assistant that can only offer policy-approved options and apply them | Must |
| F8 | Webhook endpoint with PayPal signature verification; on `INVOICING.INVOICE.PAID` re-fetch the invoice and update status, plan progress, and the activity timeline | Must |
| F9 | Audit log of every AI proposal, policy decision, human decision, and PayPal call (request id, status) | Must |
| F10 | Seed script that creates real demo invoices in the owner's PayPal sandbox | Must |
| F11 | Simulation mode when PayPal credentials are absent — clearly labelled in the UI, no claims of real transactions | Should |
| F12 | Rules-only fallback when the AI key is absent or the AI call fails — labelled as such | Should |
| F13 | "Cash unstuck" KPI and aging summary | Should |
| F14 | Manual "Sync now" and periodic sync | Should |

## Non-functional

- Money as integer minor units; currency validated against the invoice.
- No LLM output reaches PayPal without schema validation **and** policy evaluation.
- Idempotent PayPal writes (`PayPal-Request-Id` derived from action id).
- Secrets only via environment variables; `.env.example` provided.
- The payer page works on a 375 px-wide phone.
- AI calls time out (30 s) with retry and a fallback.

## Out of scope (MVP)

Email sending (PayPal delivers reminders), multi-user auth for the owner (single-owner demo, with an optional basic-auth guard), multi-currency conversion, credit scoring, legal collection steps.

## Acceptance — primary journey

1. Owner opens the board → sees 6–9 sandbox invoices, several overdue.
2. Clicks **Diagnose all** → each gets a reason with evidence.
3. "Missing PO" invoice → action *update reference + reminder to AP* → approve → PayPal invoice updated and reminder sent (request ids in the log).
4. Payer Priya opens her resolution link → says she can pay $400 now and the rest in two weeks → assistant offers a 3-part plan within policy → she accepts → invoice now allows partial payments with minimum $400 → she pays $400 in PayPal sandbox → webhook marks installment 1 paid → board shows PARTIALLY_PAID and the next installment date.
5. "Dispute" invoice → automatic reminders paused, owner gets a summary plus a draft reply; nothing is sent automatically.
