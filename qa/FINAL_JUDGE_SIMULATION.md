# Final Judge Simulation

_Five simulated judges, scored 1–10 on the five Stage Two criteria, done as harshly as we could manage. Run on 2026-11-04 against the build in this repository._

## Judge 1: PayPal engineer

- *Is PayPal genuinely integrated?* Yes. Invoicing is the system of record, and every remedy is an Invoicing call: remind, full-replacement PUT with partial payments, conditional rules, record payment, cancel reminders. Webhooks are verified via the official endpoint.
- *Is it technically sound?* Strong points:
  - GET→PUT round-trip that preserves unknown fields;
  - idempotency keys;
  - debug-id capture;
  - webhook-as-signal;
  - sync fallback.
- *Concern:* it hasn't yet run against the real sandbox. The contract mock is strict, but real PayPal validation differs in details. Back-dated seed invoices may be rejected.
- **Tech 8 · Design 7 · Impact 8 · Innovation 8 · Presentation 7**

## Judge 2: AI specialist

- *Is AI necessary?* Yes. Diagnosing from messy client replies, and negotiating with a client in natural language, can't be done with rules alone (the rules-only mode shows how much weaker it is).
- *Controlled?* It's exemplary that structured outputs, then sanitisation, then code-built actions, then the policy engine stand between the model and PayPal, and that the payer agent's tools can't change money.
- *Concern:* there are no evals of diagnosis accuracy on real Claude output yet, and the confidence score is self-reported.
- **Tech 8 · Design 7 · Impact 7 · Innovation 8 · Presentation 7**

## Judge 3: Product manager

- *Clear user and problem?* Yes, backed by credible surveys, and the "seven invoices, six reasons" framing lands in seconds.
- *Would someone use it?* Plausibly weekly. The approval queue is the right level of control.
- *Concern:* client replies arrive by pasting or through the payer page. Without email ingestion (Gmail/Outlook forwarding), real-world adoption needs another step.
- **Tech 7 · Design 8 · Impact 8 · Innovation 7 · Presentation 8**

## Judge 4: Innovation

- *Original?* Most entries in this hackathon are buyer-side agents: shopping, spend firewalls, negotiation. Seller-side receivables, with remedies *executed* in PayPal, is fresh. The policy-bounded payer agent is a genuinely new interaction.
- *Defensible?* Medium. Enterprise AI-AR tools exist, but none are PayPal-native for micro-businesses.
- **Tech 7 · Design 7 · Impact 8 · Innovation 9 · Presentation 7**

## Judge 5: Presentation

- *Understood in 30 s?* Yes. The sentence hero plus the reason phrases explain the product without a tutorial.
- *Polished?* Yes. A distinctive ledger-green and marigold identity, real empty, loading and error states, and a mobile payer page.
- *Concern:* the video isn't recorded yet, and the screenshots carry "Simulation" badges.
- **Tech 7 · Design 9 · Impact 7 · Innovation 8 · Presentation 6 (no video yet)**

## Aggregate

| Criterion | Avg |
|---|---|
| Technological Implementation | 7.4 |
| Design | 7.6 |
| Potential Impact | 7.6 |
| Innovation / Idea | 8.0 |
| Presentation | 7.0 |

## Weakest areas and what we did

| Weakness | Action | Status |
|---|---|---|
| Not yet run on the real sandbox or with real Claude | Exact steps in DEMO_WALKTHROUGH (Option B); scripts `check:sandbox` and `seed:sandbox` | **Owner action** (credentials and network) |
| No video | Script, shot list and checklists ready | **Owner action** |
| Screenshots show simulation | Re-capture after the sandbox run | Owner action |
| Diagnosis latency on stage | Concurrency raised to 6 parallel diagnoses | Done |
| Escalated disputes vanished from the queue | Escalations now wait for the owner | Done |
| Email ingestion missing | Paste-a-client-email in the drawer plus payer-page chat; email forwarding on the roadmap | Accepted scope |
| No accuracy evals | Roadmap: a labelled set of client replies, with reason-classification accuracy | Accepted scope |
