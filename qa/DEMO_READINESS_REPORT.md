# Demo Readiness Report

_2026-11-04_

| Area | Status | Notes |
|---|---|---|
| Primary journey (simulation) | ✅ VERIFIED | E2E 14/14 on dev and production servers |
| Live gateway code path | ✅ VERIFIED (mock) | Contract 23/23 against a strict PayPal mock |
| Live PayPal sandbox run | ⏳ BLOCKED | Needs sandbox credentials + network access; run `npm run check:sandbox && npm run seed:sandbox` |
| Live Claude diagnosis | ⏳ BLOCKED | Needs `ANTHROPIC_API_KEY`; rules-only fallback works and is labelled |
| Hosted URL | ⏳ NOT STARTED | `render.yaml` ready; needs the owner's Render account |
| Video | ⏳ NOT STARTED | Script in `submission/VIDEO_SCRIPT.md` |
| Screenshots | ✅ | `docs/screenshots/` (simulation mode; replace with sandbox captures after the live run) |

## Pre-demo checklist (owner)

1. `npm run check:sandbox`: all three ✓ lines.
2. `npm run seed:sandbox`: 12 invoices created (note whether back-dating was accepted).
3. Open the console; it auto-syncs. Badges read **PayPal sandbox** and **Claude**.
4. **Diagnose all**: seven different reasons; Lumen's reminder shows a PayPal receipt.
5. Approve the Northwind PO fix; open the invoice in PayPal and confirm the reference and CC.
6. Open Bluebird's payment page (drawer → *Open as the client*); ask for a plan; accept.
7. **Pay with PayPal** → log in as the sandbox buyer → pay $400.
8. Within seconds (webhook) or after **Sync**: Bluebird shows PARTIALLY_PAID, plan 1 of 3, cash unstuck $400.

## Fallbacks during a live demo

- Webhook slow? Press **Sync with PayPal**; the same plan logic runs.
- Claude slow or down? Diagnosis falls back to rules automatically (badge reads "rules only").
- Sandbox down? Restart with `UNSTUCK_MODE=simulation`; the journey is identical and labelled as a simulation.
