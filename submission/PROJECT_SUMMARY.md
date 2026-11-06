# Project Summary

**Unstuck**: an AI receivables-resolution agent that turns unpaid PayPal invoices into evidence-backed, policy-checked next actions, and follows each one until PayPal records the money.

| | |
|---|---|
| **User** | Freelancers and small service businesses that bill through PayPal Invoicing |
| **Problem** | Invoices stall for different reasons (missing PO, cash flow, dispute, wrong contact, cheque in the post, forgotten, broken promise), but the usual tool is another generic reminder, and owners avoid chasing for fear of losing the client |
| **Solution** | An agent that diagnoses why each invoice is stuck, separating quoted evidence from inference, then applies the matching PayPal-native remedy within owner-set rules. A client-facing page offers only pre-approved payment plans |
| **PayPal** | Invoicing v2: list/get, remind, full-replacement update (reference, CC, partial payments, minimum due), conditional rules, record payment, cancel reminders, create/send. Webhooks: signature verification, deduplication |
| **AI** | Google Gemini (default, `gemini-3.5-flash-lite`) behind a provider-independent interface (Claude optional): schema-constrained diagnosis re-validated by the app, and a tool-using payer assistant with four allowlisted, schema-checked tools. A deterministic policy engine sits between the AI and PayPal. Labelled rules fallback when AI is unavailable |
| **Safety** | Money changes need the owner; rules re-checked against PayPal's current invoice before execution; per-invoice locks; idempotency keys; outcomes reported as "accepted by PayPal" vs "confirmed on re-read" |
| **Reliability** | One retry runner: paced and budgeted per attempt, 503 backoff with jitter, clamped Retry-After/RetryInfo, daily-quota pause, circuit breaker with a single recovery probe |
| **Evidence** | 276 unit/flow/agent/adversarial/reliability/concurrency tests, 26 contract checks against a strict PayPal mock, 22 browser checks; 26-scenario AI evaluation harness (rules baseline 14/26 strict, 0 forbidden actions) |
| **Sponsor** | Best Use of AG Grid: AG Grid (receivables board, activity log) and AG Studio (Insights report and a custom Agent Framework agent in Studio's AI panel) |
| **Stack** | Next.js 16, React 19, TypeScript, Tailwind 4, AG Grid 36, AG Studio 3, SQLite (better-sqlite3), Google Gen AI SDK, Anthropic SDK (optional), Vitest, Playwright |
