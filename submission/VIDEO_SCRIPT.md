# Video Script and Shot List (target 2:45, hard limit < 3:00)

**One story: Maya's studio, one morning.** It shows the full loop on screen: spot, understand, your OK, act in PayPal, agree with the client, verify, and back into the loop when a promise breaks.

**Honesty rules for the recording**
- If the header reads **Simulation, not PayPal** and **Rules only**, say so in the first 20 seconds ("this is the demo mode; the same flow runs on the PayPal sandbox") and keep the badge visible.
- Never describe a simulated payment as a PayPal payment. If the sandbox run has been done, record scenes 5–7 against it, with the badge reading **PayPal sandbox**.
- Captions on. No music, or licensed music only. Request the AG Studio trial key first so the watermark is gone. If you can't, leave it; don't crop it out.

## Shot list

| # | Time | Screen (what to click) | Narration |
|---|---|---|---|
| 1 | 0:00–0:18 | Dashboard, before the run. Slowly highlight the hero sentence, then the "Overdue" figure | "Maya runs a two-person design studio. She's owed twenty-one thousand dollars on eight PayPal invoices, and seven are late. Her invoicing tool can tell her *that*. It can't tell her *why*, or fix it." |
| 2 | 0:18–0:40 | Click **Run the agent**; the trace fills live; scroll to **The resolution loop** as the stages fill | "Unstuck is an AI receivables-resolution agent. It syncs with PayPal and works through every invoice: it spots what's stuck, works out why, fixes what your rules allow, and follows it until the money arrives. This loop shows where every invoice is right now, computed from what actually happened." |
| 3 | 0:40–1:05 | Click the **Northwind Logistics** chip → drawer: quoted evidence, then the inference, then the recommendation | "Northwind's accounts-payable team bounced the invoice for a missing PO number. Here's exactly what the client said, kept separate from what the agent infers. The fix isn't a reminder. It's putting PO-88412 on the invoice." |
| 4 | 1:05–1:20 | Scroll to the action card → expand **Policy checks** → **Update invoice** → toast and receipt | "Changes that touch the invoice wait for Maya. She sees the rule checks, approves, and Unstuck re-checks the rules against PayPal's current invoice before PayPal re-sends it." |
| 5 | 1:20–1:30 | Close the drawer; the **Kestrel Media** chip with the red mark; open it | "Kestrel promised to pay by the first. Nothing arrived. Unstuck noticed the broken promise, says honestly that it doesn't know why, and sent a kind, specific follow-up, inside Maya's rules." |
| 6 | 1:30–2:05 | **Bluebird Café** → **Open as the client** (phone-width window). Tap "Can I pay part now…" → offers with consequences → **Accept this plan** → pay $400 (sandbox buyer, or **Simulate payment** labelled) | "Every reminder links to a private page for the client. Priya at Bluebird is short on cash. She can only choose plans Maya's rules allow, and she sees exactly what she's agreeing to. Accepting switches the PayPal invoice to partial payments, and she pays the first four hundred." |
| 7 | 2:05–2:20 | Back to the dashboard: Bluebird moves to **Agreed**, "Plan 1 of 3 paid", **Collected after Unstuck acted: $400** | "The payment comes back, Unstuck verifies it, and the plan moves on. If an installment is missed, the invoice goes straight back into the loop." |
| 8 | 2:20–2:38 | **Insights**: type "Which customers account for the highest overdue receivables?" → report + answer; then click **Missed promises** | "Maya can just ask. Our agent, built on AG Studio's Agent Framework, answers from her data with names and amounts, opens the report, and says so when it can't answer." |
| 9 | 2:38–2:48 | Back to the loop; end card: Unstuck · github.com/Sidd927/PayPal-AI-Hackathon · PayPal Invoicing + Claude + AG Studio | "Unstuck doesn't just chase unpaid invoices. It understands why they're stuck, helps resolve them, and verifies what happens next." |

## Prep checklist

1. `npm run build && npm start` (or `npm run dev`); press **Reset demo** right before recording.
2. Browser at 1440×900, 110% zoom; a second window at 390 px for the client page.
3. Record each scene separately and cut the waits. Never speed up the footage of the agent run.
4. For the sandbox version: run `npm run seed:sandbox` the same day, log the buyer in on the second window, and if the webhook is slow press **Sync** (the narration still holds).
5. Upload to YouTube as **Public**, titled "Unstuck: AI receivables resolution for PayPal Invoicing (PayPal AI Hackathon 2026)", with the repo link in the description. Check the link in a private window.
