# Improvement Backlog

## Done in Phase 2 (ranked by score in `research/UPDATED_PRODUCT_STRATEGY.md`)

1. Diagnosis v2 (evidence vs inference, outcome, risks, alternatives) and its drawer UI.
2. Observable agent runs with follow-ups (installments, missed promises) and a live trace.
3. 26-scenario AI eval and adversarial model tests (found and fixed 3 defects).
4. Transparent risk score and 30-day outlook; dashboard answers the three questions.
5. Mobile cards, confirmation before money moves, toasts, consequence copy on the payer page.
6. AG Studio insights report; AG Grid risk sort and CSV export.
7. Fixed the dev-server reload loop caused by the DB inside the watched tree.

## Next, in order (needs owner action first where marked)

1. **[Owner: credentials]** Run the sandbox plan in `REAL_PAYPAL_SANDBOX_REPORT.md`; record debug ids.
2. **[Owner: key]** `npm run eval` with Claude; publish results in `AI_EVALUATION_REPORT.md`; tune prompts only if core accuracy falls below the rules baseline.
3. **[Owner: Render]** Deploy; set `OWNER_BASIC_AUTH` and give judges the credentials.
4. Real-model payer-agent adversarial chats (10).
5. Email forwarding inbox (client replies arrive without pasting).
6. Per-reason outcome tracking (which remedy resolved which reason) to replace hand-set risk weights.
7. Expose the policy-gated actions as an MCP server so other agents (a client's AP agent) can settle through the same rules.
