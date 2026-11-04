# Phase 3: Competitor Recheck and Capability Matrix

_2026-11-04. Sources are public README files and vendor pages, read as data. **Hackathon entries' claims are their own and were not run or verified by us.** Phase 2 found four overlapping entries. This recheck finds at least eight, and two of them are stronger than Unstuck on evidence: a real sandbox run and a hosted demo._

## Hackathon entries in the same space

| Entry | One-line summary (their words, condensed) | Evidence they publish |
|---|---|---|
| [Settle](https://github.com/Shashank4864/Settle) | Predicts late PayPal invoices from payment history, forecasts a 90-day cash gap, negotiates payment plans between a merchant agent and a *simulated* client agent; human approval; policy re-checked before execution | Sandbox instructions; mock mode by default; payment history simulated |
| [Past Due Desk](https://github.com/DesignMaster-Solutions/past-due-desk) | Plans each overdue account (nudge / firm / split / settlement discount / escalate), policy clamps the model, owner approves, sends a PayPal invoice with partial payments or discount, follow-ups via `/remind`; AG Studio board with a custom widget | **Hosted demo; real sandbox invoice ids, including one paid by a sandbox buyer; 1-minute video; AG trial licence** |
| [Owed (edilsonsantos)](https://github.com/edilsonsantos-co-za/owed) | Claude agents draft per-client reminders into an approval queue; AG Studio dashboard with Studio's built-in agents on Claude via a custom adapter; PayPal Agent Toolkit morning brief | Screenshots; demo mode |
| [Owed (Stephen-Psaradellis)](https://github.com/Stephen-Psaradellis/owed) | Bills via PayPal Invoicing, plans polite → final reminders tuned by risk, stops when paid; verified webhooks; idempotency keys | Detailed README; demo model |
| [Invoice Chaser](https://github.com/leex0x0/invoice-chaser) | Escalating follow-ups by age; stops on `INVOICING.INVOICE.PAID` webhook | Dry-run mode |
| [Sorted](https://github.com/OlsOls4/sorted) | UK sole traders: notes → PayPal invoices, chases late payers, "Ask Sorted" Q&A; signed single-use approval tokens | **Hosted demo (Vercel)** |
| [InvoicePilot](https://github.com/Talal-ah-cloud/invoicepilot) | WhatsApp → PayPal invoice → follow-ups | n/a |
| [The Debt Collector](https://github.com/theposwizz-cmd/The-Debt-Collector) | Group bill-splitting and chasing PayPal requests | Different segment (consumer) |

## Capability matrix

✓ = described in their public README · ~ = partial or simulated · – = not described. Unstuck's column uses our own tests; "unverified" marks what needs the owner's credentials.

| Capability | Unstuck | Past Due Desk | Settle | Owed (E.S.) | Owed (S.P.) | Chaser (commercial) |
|---|---|---|---|---|---|---|
| Diagnoses *why* a specific invoice is stuck (8 reasons, cited evidence from the client's own words) | ✓ | ~ (strategy with a reason) | – (lateness prediction) | ~ (tone by client) | – | – (dispute flag) |
| Remedy is a PayPal state change, not just a message (PO/reference fix + re-send, partial payments, conditional discount, record external payment, pause reminders) | ✓ | ✓ (discount, partial payments) | ~ (cancel + N new invoices) | – (reminders) | – (reminders) | ~ |
| Client-facing resolution page (client picks an in-policy plan, asks a question, says "already paid") | ✓ | – (PayPal hosted invoice only) | ~ (simulated client agent) | – | – | ✓ (payment portal) |
| Deterministic policy engine with visible checks | ✓ | ✓ | ✓ | ~ (approval queue) | – | rules config |
| Re-check of rules at execution time (stale approvals) | ✓ (Phase 3) | ✓ ("ledger written after every invoice") | ✓ | – | – | n/a |
| Follow-through: installments advance, missed promises re-open, plan completes | ✓ | ✓ (follow-ups, "back to you") | ✓ (verifies payment) | – | ✓ (stops when paid) | ✓ |
| Verified webhooks + idempotency keys | ✓ | – (polling) | – (polling) | – | ✓ | n/a |
| Prediction / forecast | ~ (transparent heuristic, grouped outlook, no probabilities) | – | ✓ (history-based, simulated history) | ~ | ~ | ✓ (AI late-payment predictor) |
| AG Studio | ✓ (custom agent in the Studio AI panel + report) | ✓ (custom widget, theme, licensed) | – (AG Grid only) | ✓ (built-in agents on Claude) | – | – |
| Real PayPal sandbox evidence | **– (blocked here; scripted for the owner)** | **✓** | ~ | ? | ? | n/a |
| Hosted demo | **– (Render config ready; needs the owner's account)** | **✓** | – | ? | ? | n/a |
| Real model evaluation published | **– (harness ready; needs a key)** | – (recorded answers) | – | – | – | – |

## What this means

1. **Unstuck's real differentiators** are (a) diagnosis with cited evidence followed by a reason-specific *PayPal state change*, and (b) the two-sided resolution page where the client chooses an in-policy plan that is applied in PayPal immediately. No other entry found does (b) against real PayPal state; Settle's counterparty is a simulated agent.
2. **Unstuck's real weakness is evidence, not features.** Past Due Desk shows real sandbox invoice ids, a buyer payment and a hosted demo. Until the owner runs `npm run seed:sandbox` and deploys, a judge comparing the two will trust Past Due Desk's claims more. **This is the single most important remaining action.**
3. "Prediction" is not a differentiator: Settle and Chaser both claim it. Unstuck should keep its risk score framed as a transparent heuristic and lead with diagnosis and resolution.
4. AG Studio is contested. Our angle is a domain agent that answers grounded receivables questions and declines the rest. It needs the trial licence key to remove the watermark before judging.

## Positioning (final)

> **Unstuck is the AI receivables resolution agent that diagnoses why payments are stuck, negotiates policy-compliant resolutions, executes supported actions through PayPal, and follows agreements through to actual payment.**

Proof points, each tied to a test or screenshot: diagnosis with quotes (`tests/flow.test.ts`), policy-bounded plan chosen by the client and applied as PayPal partial payments (`e2e`: "plan applied"), installment tracking to PAID (`contract`: plan progression), stale approvals refused (`reliability.test.ts`).
