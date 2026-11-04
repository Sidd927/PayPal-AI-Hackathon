# Video Script (target 2:50, hard limit < 3:00)

**Record only after the live sandbox and Claude runs.** Both header badges must read "PayPal sandbox" and "Claude". No simulated footage presented as real; no unlicensed music; captions on. Request the AG Studio trial key first so the watermark is gone.

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:15 | Board loads; the hero sentence | "Maya runs a two-person studio. She's owed twenty thousand dollars across seven PayPal invoices. Six are late, and every one is stuck for a different reason." |
| 0:15–0:30 | Hover the figure row, then the reason strip | "More than half of US small businesses are waiting on invoices like these. Most tools, AI ones included, answer with another reminder. Unstuck finds out *why*, and fixes that, inside PayPal." |
| 0:30–0:55 | Click **Run the agent**; the trace fills live (Sync → Prioritise → per-client Gather, Diagnose, Plan, Rules, Act) | "The agent syncs with PayPal, ranks invoices by risk, and works through each one. Lumen Yoga always pays, they forgot, so a friendly reminder already went out through PayPal, inside Maya's rules. Anything that changes money waits for her." |
| 0:55–1:20 | Open Northwind: evidence quote, inference, recommendation, expected outcome; the action card with PO-88412 and the PayPal endpoint; click **Update invoice**; the receipt with a debug id | "Northwind's accounts-payable team needs a PO number. Here's exactly what the client said, what the agent infers, and what it recommends: add the PO and copy their AP inbox. One click, and PayPal re-sends the corrected invoice." |
| 1:20–1:30 | Harbor Dental card: "Needs your judgement" | "Harbor Dental disputes the work. Unstuck won't pressure them: PayPal's reminders are paused and Maya gets a suggested reply." |
| 1:30–2:10 | Phone frame: Bluebird's resolution page → "Can I pay part now…" → offers with plain-language terms → **Accept this plan** → **Pay $400 or more with PayPal** → sandbox checkout as the buyer | "Every reminder links here. Priya at Bluebird Café is short on cash. She asks for a plan. The assistant can only offer what Maya's rules allow, and Priya sees exactly what she's agreeing to. She accepts, PayPal switches the invoice to partial payments, and she pays the first four hundred dollars." |
| 2:10–2:25 | Console: Bluebird row flashes, "Plan 1 of 3 paid", "Collected after Unstuck acted: $400"; Activity shows the verified webhook | "PayPal's webhook arrives, Unstuck verifies it, re-reads the invoice and moves the plan on. Four hundred dollars, unstuck." |
| 2:25–2:38 | Insights (AG Studio): type "Build a report for invoices requiring human approval" → the approvals report opens with the answer above it | "Maya can just ask. Our agent, built on AG Studio's Agent Framework, answers from her data and builds the report. If it can't answer from the data, it says so." |
| 2:38–2:50 | Your rules page, then the end card | "The agent proposes. Maya's rules decide. PayPal executes. Unstuck: get paid without the awkward chase." |

## Prep

1. Run `npm run seed:sandbox` the same day; set `DEMO_PAYER_EMAIL` to the sandbox buyer; pre-log in the buyer on the phone.
2. Run once before recording, so Claude diagnoses are cached and fast; then **Reset** with `npm run seed:sandbox` again for the take.
3. Use 1440×900 with 110% zoom for the desktop shots.
4. Record segments separately; cut the waits, never speed them up.
5. If the webhook is slow on the day, press **Sync**. The narration still holds, since sync runs the same plan logic.

## Checklists

- [ ] < 3:00 · captions · no real personal data · licensed or no music · end card with repo and demo URLs
- [ ] YouTube: **Public**, title "Unstuck: AI receivables agent for PayPal Invoicing (PayPal AI Hackathon 2026)", description with repo link and "Built with PayPal Invoicing API + Claude + AG Grid/AG Studio"
