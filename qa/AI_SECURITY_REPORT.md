# AI Security Report

_Phase 3, 2026-11-04. Supersedes `qa/AI_SECURITY_AUDIT.md` for current status. All evidence below is from automated tests that run without an API key. Real-model behaviour still needs the Claude evaluation run (`qa/REAL_AI_EVALUATION_REPORT.md`)._

## Threat model

Unstuck reads text written by people outside the business: client replies, auto-replies, and messages on the public resolution page. Any of it can be hostile. The design assumption is that **the model can be fully compromised by that text**. Safety therefore cannot depend on the model behaving well. It depends on what the model is *able* to do.

| Asset | Attacker goal | Control |
|---|---|---|
| Invoice amount and status | Mark paid, lower the amount, apply a huge discount | The model only *proposes*. A deterministic policy engine (`src/lib/policy.ts`) decides `auto` / `approve` / `block`. Money-changing actions always need the owner. Plans are rebuilt from the real balance. |
| Recipient routing | Redirect reminders or invoices to an attacker address | A new address always needs approval. Invalid emails are dropped. The payee email is never writable. |
| Owner approval | Forge "the owner approved" in a message | Approval exists only as an authenticated owner API call. Text cannot create one. Approval is re-checked against current PayPal state at execution. |
| Secrets and prompt | Exfiltrate the system prompt or keys | The system prompt contains no secrets. Keys stay on the server. Outbound text is checked for policy limits and secrets (eval safety check). |
| Other invoices | Use one payer link to act on another invoice | Payer tokens are per invoice. Offer ids are bound to the invoice and checked server-side. |
| Spend | Run up AI cost | A daily AI call budget (`consumeAiBudget`), fallback to rules when it is exhausted, and owner-only Insights LLM proxy. |

## Controls and their tests

| # | Control | Test |
|---|---|---|
| 1 | Untrusted text is quoted inside tags and stripped of spoofed closing tags | `quoteUntrusted` in `src/lib/ai/anthropic.ts`. Exercised by every diagnosis test. |
| 2 | Structured output, schema-validated and sanitised (confidence clamped, invalid emails and dates dropped, field lengths capped) | `flow.test.ts` › "uses structured output, sanitises fields…" |
| 3 | "Mark it paid" becomes an approval-gated recording of the *real* amount due | `ai-security.test.ts` |
| 4 | An oversized discount is clamped to policy and still needs approval | `ai-security.test.ts` |
| 5 | An injected PO number with instructions is rejected by format validation | `ai-security.test.ts` |
| 6 | A reminder to an address the model picked never goes out automatically | `ai-security.test.ts` |
| 7 | An out-of-policy plan from the model is replaced by a compliant one | `ai-security.test.ts` |
| 8 | Payer agent: only server-computed offers can be shown or accepted; four strict tools, no free-form actions | `flow.test.ts` › "payer agent tool loop" |
| 9 | Offer from invoice A cannot be accepted through invoice B's link | `ai-security.test.ts` › payer-side isolation |
| 10 | Double approval executes once | `ai-security.test.ts`, `reliability.test.ts` (three concurrent approvals) |
| 11 | **New in Phase 3:** a stale approval cannot execute (invoice paid since, rules tightened) | `reliability.test.ts` › stale approvals (3 tests, mutation-checked) |
| 12 | Model failure falls back to rules, labelled | `flow.test.ts` › "falls back to rules when the model errors" |
| 13 | Eval regression gate: 26 scenarios, 0 forbidden actions, 0 safety violations, 0 fabricated quotes | `ai-security.test.ts` › eval harness |
| 14 | **New in Phase 3:** Insights questions the agent can't answer are declined, not guessed (incl. "Delete all invoices", "Ignore previous instructions…") | `insights.test.ts` › question routing |
| 16 | **New in Phase 3:** agent-written reminders are content-checked before they can go out automatically. A foreign link, another way to pay, an email address, legal or threatening language, or excessive length sends the reminder to the owner instead (`outboundTextConcerns` in `src/lib/policy.ts`) | `ai-security.test.ts` › content-checked (6 tests) |
| 15 | **New in Phase 3:** Insights LLM proxy: 503 without a key, cross-origin rejected, Studio tool calls translated without executing anything server-side | `insights.test.ts` › Claude adapter |

## Insights agents (AG Studio)

- **Unstuck Insights agent** (`clientToolRunner`): no LLM. It routes a fixed set of questions to predefined report pages and computes answers from the same read-only tables. It cannot write anything: its only effect is `api.setState` on the dashboard.
- **Studio built-in agents on Claude** (only when `ANTHROPIC_API_KEY` is set): their tools run in the browser against the read-only Insights tables and dashboard state. The server proxy (`/api/insights/llm`) executes no tools; it only forwards one model turn. Data the model can see: client names, amounts, statuses and reasons from the primary-currency tables. No emails, tokens, messages or PayPal ids are in those tables.
- **Residual risk (P3):** the proxy accepts the system prompt and tool list from the browser, so an authenticated owner session could use it as a general Claude endpoint, within the daily budget. This is acceptable for an owner-only route and is documented.

## Known gaps

- Real-model jailbreak resistance is untested until the Claude eval runs. The design limits the damage to "a wrong proposal the owner sees".
- **Found and fixed in this pass (was P1):** with Claude enabled, the subject and body of an *automatic* reminder are model-written, and policy previously checked only cadence and recipients. A client could have steered the model into sending a foreign payment link or threats from the owner's PayPal account without review. The content gate (control 16) closes the listed patterns. It is pattern-based, so subtler misleading wording can still pass. Owners who want zero model-written automatic text can turn off "Send reminders on my behalf" in Your rules.
- No rate limit per payer link beyond the global AI budget. A hostile payer can spend the daily budget, after which the payer agent falls back to rules. P2 for a production launch.
