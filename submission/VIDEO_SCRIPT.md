# Video Script (target 2:50, hard limit < 3:00)

**Rules:** record the real app connected to the **PayPal sandbox** with **Claude** enabled; both header badges must be visible. No simulated footage presented as real. No copyrighted music (use silence or a royalty-free track you have rights to). Captions on.

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:18 | Black title card: "You did the work. Why haven't you been paid?" then cut to the Unstuck board | "Maya runs a two-person design studio. She invoices through PayPal, and right now she's owed twenty thousand dollars. Over half of US small businesses are in the same spot, and most owners would rather wait than chase a client." |
| 0:18–0:35 | Hover the hero sentence and the reason strip | "Here's the thing: invoices don't get stuck for one reason. Unstuck is an AI receivables agent for PayPal Invoicing. It figures out *why* each invoice is unpaid, and fixes that, inside PayPal." |
| 0:35–0:55 | Click **Diagnose all**; the board fills with reason phrases; the Recently feed shows "Reminder delivered by PayPal" | "Claude reads each invoice, the client's history and their replies. Seven invoices, six different reasons. Lumen Yoga always pays; they just forgot. So a short, friendly reminder already went out through PayPal, because it fits Maya's rules." |
| 0:55–1:20 | Open Northwind; show the evidence quote, then the action card with PO-88412, the CC, the policy checks; click **Update invoice**; the receipt shows the PayPal PUT and debug id | "Northwind's accounts-payable team needs a PO number. Another reminder would be useless. Unstuck proposes adding the PO and copying their AP inbox. Anything that changes an invoice waits for Maya. One tap, and PayPal re-sends the corrected invoice." |
| 1:20–1:35 | Open Harbor Dental | "Harbor Dental is disputing the work. Unstuck won't pressure them. It pauses PayPal's automatic reminders and drafts a reply for Maya to send herself." |
| 1:35–2:15 | Switch to a phone frame showing Bluebird's payment page; tap "Can I pay part now…"; the assistant offers plans; tap **Accept this plan**; tap **Pay with PayPal**; the sandbox invoice page shows a $400 minimum; pay as the sandbox buyer | "Every reminder links here. Priya at Bluebird Café is short on cash. Instead of going quiet, she asks for a plan. The assistant can only offer plans Maya has pre-approved, and the maths is done in code, not by the model. She accepts, and Unstuck turns on partial payments in PayPal with a four-hundred-dollar minimum. She pays the first installment with PayPal." |
| 2:15–2:35 | Back on the console: the Bluebird row flashes to "Plan: 1 of 3 paid"; the cash-unstuck figure reads $400; Activity shows the verified webhook | "PayPal's webhook arrives, Unstuck verifies it, re-reads the invoice and moves the plan forward. Four hundred dollars that would have sat there, unstuck." |
| 2:35–2:50 | Rules page, then the architecture one-liner card | "The agent proposes. Maya's rules decide what's allowed. PayPal executes. Unstuck: get paid without the awkward chase." |

## Shot list and prep

1. `npm run seed:sandbox` the same day (so "days late" is right); set `DEMO_PAYER_EMAIL` to the sandbox buyer.
2. Browser zoom 110%, 1440×900 window; hide bookmarks; use a clean profile.
3. Phone segment: Chrome device toolbar (iPhone 14) or a real phone on the Render URL.
4. Pre-log the sandbox buyer into sandbox.paypal.com in the phone browser to save time.
5. Record each segment separately and trim the waits (Claude diagnosis takes a few seconds; cut, don't speed up).
6. Keep one take of the raw webhook arriving (Activity tab) as evidence.

## Editing checklist

- [ ] Total length < 3:00 (aim for 2:50)
- [ ] Both badges visible: "PayPal sandbox" and "Claude"
- [ ] The PayPal sandbox invoice page is visible during payment
- [ ] Captions burned in or uploaded as an SRT
- [ ] No real personal data; only `.example` clients and sandbox accounts
- [ ] Music licensed or none
- [ ] End card: repo URL and demo URL

## YouTube upload checklist

- [ ] Visibility: **Public**
- [ ] Title: "Unstuck: an AI receivables agent for PayPal Invoicing (PayPal AI Hackathon 2026)"
- [ ] Description: one-paragraph summary, repo link, "Built with PayPal Invoicing API + Claude"
- [ ] Not marked "made for kids"
- [ ] Link pasted into Devpost and README
