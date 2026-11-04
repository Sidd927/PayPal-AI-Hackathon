# Project Summary

**Unstuck**: find out why an invoice is stuck, fix it inside PayPal, keep the client.

| | |
|---|---|
| **User** | Freelancers and micro-businesses that bill through PayPal Invoicing |
| **Problem** | Invoices stall for different reasons (missing PO, cash flow, dispute, wrong contact, cheque in the post, forgotten), but the only tool small businesses have is another generic reminder, and owners avoid chasing for fear of losing clients |
| **Solution** | An AI agent that diagnoses each invoice's stuck reason and applies the matching PayPal-native remedy within owner-set rules, plus a client-facing page where an assistant offers only pre-approved payment plans |
| **PayPal** | Invoicing v2 (remind, full-replacement update with partial payments and minimum due, conditional rules, record payment, cancel reminders, create/send) and Webhooks (verification, registration) |
| **AI** | Claude: structured-output diagnosis plus a strict-tool payer agent, with a deterministic policy engine between the AI and PayPal |
| **Differentiator** | Seller-side agentic commerce. Remedies are *executed* in the payment rail, not just drafted, and the payer can negotiate within bounds |
| **Evidence** | 40 unit/flow tests, 23 live-path contract checks, 14 browser E2E checks |
| **Sponsors** | AG Grid (board + audit log), Render (Blueprint) |
| **Stack** | Next.js 16, React 19, TypeScript, Tailwind 4, AG Grid 36, SQLite, Anthropic SDK |
