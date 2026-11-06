# Video Script and Shot List (target 2:45, hard limit < 3:00)

**One story: Maya's studio, one morning.** The loop on screen: spot → understand → your OK → act → agree with the client → verify, and back into the loop when a promise breaks.

## Choose the recording mode first

| | **Mode A: recommended** | Mode B: full sandbox (needs your explicit approval) |
|---|---|---|
| PayPal | Labelled simulation for the walkthrough, plus a 10-second **read-only** clip of the app connected to your real sandbox (scene 2b) | Everything against the sandbox |
| AI | **Real Gemini** (`GEMINI_API_KEY` in `.env.local`), header reads **AI: Gemini** | Real Gemini |
| Writes to your sandbox | **None** | Yes: running the agent sends sandbox reminders and pauses; approving updates invoices; the client plan changes an invoice. Your seeded data changes permanently |
| Risk on camera | Low: diagnoses are prepared before recording and reused | Higher: live sandbox latency, webhooks, and a 3/min Gemini pace |

Mode A shows real AI on the exact demo story and proves the PayPal integration without touching your seeded invoices. Choose Mode B only if you accept those writes; never re-run the seeder for it.

**Honesty rules (both modes)**
- Keep the header badges visible. In Mode A, say once in the first 20 s: "This walkthrough runs in Unstuck's simulation, with real Gemini; I'll show the live PayPal sandbox connection too."
- Never call a simulated action a PayPal action. The app labels them "(simulation: PayPal was not called)": let that show.
- In the simulation, reminders are **recorded, not sent**, and payments are **simulated: no money moves and PayPal collects nothing**. Say so on camera when they appear.
- If a diagnosis on screen reads **rules fallback**, don't call it AI. (Prepare as below so it doesn't happen.)
- Captions on. No music, or licensed music only. Don't crop the AG Studio watermark if there is no licence key.

## Prepare (about 15 minutes before recording)

1. Start the app in Mode A on a **separate database** (keeps your sandbox database untouched):

   ```bash
   UNSTUCK_MODE=simulation DATABASE_PATH=node_modules/.cache/unstuck/video.db npm run dev
   ```

2. Open http://localhost:3000, press **Reset demo**, then **Run the agent**. At `GEMINI_MAX_RPM=3` this takes about 3 minutes. Don't record it.
3. Check every invoice reads **"… sure, Gemini"** in the *Why it's stuck* column. If any reads *rules fallback* (e.g. a Gemini 503), wait 2 minutes, open that invoice and press **Diagnose again**. Diagnoses are reused afterwards, so recording makes no new AI calls for them.
4. Note the state in **Needs you** and the loop. With the rules run, Northwind and Atlas wait for your OK, and Lumen and Kestrel get reminders recorded (simulated, not sent). Gemini may route some invoices differently: narrate what is on screen, not this list.
5. Browser at 1440×900, 110% zoom, clean profile, no extensions, bookmarks bar hidden. Have a second window at 390 px for the client page.
6. Scene 2b is recorded **separately**, because Next.js runs only one dev server per project folder: stop the simulation server, record the read-only sandbox clip, stop that server, then restart the simulation server on the same `video.db` (see that scene). Your prepared state is kept in `video.db`.

## Shot list

| # | Time | Screen and action | What the judge should notice | Narration | Backup if something fails |
|---|---|---|---|---|---|
| 1 | 0:00–0:15 | Dashboard top: hero sentence ("You're owed $21,700 across eight invoices. Seven are late."), then **Overdue** | Money owed, seven late, and the badges | "Maya runs a two-person studio. She's owed twenty-one thousand seven hundred dollars on eight invoices, and seven are late. Her invoicing tool can tell her *that*. Not *why*." | Static: nothing live |
| 2 | 0:15–0:35 | Scroll to **Last agent run** (trace) and **The resolution loop** | Real steps (plan → rules → act), invoices in stages | "Unstuck is an AI receivables agent. It synced the invoices and worked through every one: what's stuck, why, what Maya's rules allow it to fix, and what needs her. This walkthrough is the simulation, with real Gemini doing the diagnosis." | Uses the prepared run; no live call |
| 2b | 0:35–0:45 | Separately recorded clip (cut in during editing) of the **read-only sandbox** server on http://localhost:3100: header **PayPal sandbox**, the synced invoices | The same app connected to the real PayPal sandbox | "And here's the same app connected to our PayPal sandbox, reading Maya's sandbox invoices. Only reading: nothing is changed there." | Skip the scene (the walkthrough doesn't depend on it) |
| 3 | 0:45–1:10 | Back to the simulation. Click **Northwind Logistics** → drawer: quoted evidence, inference, recommendation | Evidence separate from inference; confidence labelled self-reported; "by Gemini" | "Northwind's accounts-payable team bounced the invoice for a missing PO. Here's exactly what the client said, kept separate from what Gemini infers. The fix isn't a reminder. It's putting PO-88412 on the invoice." | If the line says rules fallback, say "rules diagnosis" instead, or use another AI-diagnosed invoice |
| 4 | 1:10–1:25 | Action card → expand **Policy checks** → **Update invoice** → result text | Approval required; rules re-checked at execution; honest result | "Anything that changes the invoice waits for Maya. She sees the rule checks and approves. The rules run again right before it executes. In the simulation it says plainly that PayPal wasn't called; live, it re-reads the invoice to confirm." | None needed (local) |
| 5 | 1:25–1:35 | Close; **Kestrel Media** chip (red mark) → drawer: the client's message with the promised date, and the recorded follow-up with its simulation label | A broken promise came back to the agent | "Kestrel promised to pay by [read the date shown in the drawer]. Nothing arrived. Unstuck noticed and, inside Maya's rules, prepared a kind, specific follow-up. Here it's recorded in the simulation, not sent; live, it would go out through PayPal." | Local |
| 6 | 1:35–2:05 | **Bluebird Café** → **Open as the client** (390 px window). Tap "Can I pay part now…" → two offers appear → on the **3-payment option** ("3 payments of about $400", i.e. 3 × $400), tap **Accept this plan** (not the 2 × $600 option) → **Simulate payment** with the pre-filled $400.00 | Only pre-approved plans; plain-language terms; the simulation banner | "Every reminder links to a private page. Priya is short on cash. She can only choose plans Maya's rules allow, and she sees exactly what she's agreeing to. She picks three payments of four hundred. Her first payment is simulated here: no real money moves." | If the AI reply is slow, the page answers with the rules reply and the same offers. If the offers on screen differ, pick the 3-payment one and narrate the amounts shown, not $400 |
| 7 | 2:05–2:20 | Dashboard: Bluebird in **Agreed**, "Plan: 1 of 3 paid", **Collected after Unstuck acted: $400** (from the simulated payment) | The state change, honest wording | "Unstuck records the simulated payment and the plan moves on to payment two. Live, this would come from PayPal's own payment record. If an installment is missed, the invoice goes straight back into the loop." | Local |
| 8 | 2:20–2:38 | **Insights** → **Build your own report** → the **AI panel** on the right. In the panel's chat box (not the *Ask Insights* box at the top of the page) type "Which customers account for the highest overdue receivables?" and press Enter → the agent replies "Opened “Overdue receivables by customer”. …" with names and amounts, and the report switches to that page. Optional: ask "What is the weather tomorrow?" → it declines | The AG Studio Agent Framework running our own agent, grounded in data, navigating the report | "Maya can just ask. This is AG Studio's AI panel running our own agent, built on its Agent Framework. It answers from her data with names and amounts, opens the matching report, and says so when it can't answer." | The Unstuck Insights agent needs no LLM, so it works even if Gemini is slow |
| 9 | 2:38–2:48 | Back to the loop; end card: Unstuck · github.com/Sidd927/PayPal-AI-Hackathon · PayPal Invoicing + Gemini + AG Grid/AG Studio | — | "Unstuck doesn't just chase unpaid invoices. It understands why they're stuck, resolves them within your rules, and verifies what happens next." | — |

### Scene 2b: the read-only sandbox clip (Mode A)

Only one Next.js dev server can run in this project folder at a time, so record this clip on its own:

1. **Stop the simulation server** (Ctrl-C in its terminal). `video.db` keeps your prepared state.
2. Start the read-only server with your sandbox credentials from `.env.local` and a **fresh, separate database**:

   ```bash
   PORT=3100 DATABASE_PATH=node_modules/.cache/unstuck/readonly-proof.db npm run dev
   ```

   If it says "You can access the existing server at http://localhost:3000", the simulation server is still running: stop it first.
3. Open http://localhost:3100 and **only look**. On first load the app gets an OAuth token and syncs invoices from PayPal with GET requests only. With a fresh database there are no Unstuck payment plans, so the sync has nothing to write. Do **not** press **Run the agent**, **Diagnose again** or **Diagnose all**, approve anything, or open the client page on this server: in sandbox mode those act on your sandbox invoices.
4. Record the clip, then **stop this server** (Ctrl-C).
5. Restart the simulation server on the same database and carry on with scene 3:

   ```bash
   UNSTUCK_MODE=simulation DATABASE_PATH=node_modules/.cache/unstuck/video.db npm run dev
   ```

## Recording checklist

- [ ] Clean browser profile, 1440×900, 110% zoom; no extensions, no bookmarks, no other tabs
- [ ] No terminal or `.env.local` on screen; no API keys anywhere in view
- [ ] Demo data only: fictional `.example` client addresses; no personal or real customer data
- [ ] Header badges visible: **Simulation, not PayPal** and **AI: Gemini** (scene 2b: **PayPal sandbox**)
- [ ] Every diagnosis shown reads "Gemini", not "rules fallback" (or narrate it as rules)
- [ ] No failed requests or error toasts on screen; no debug panels
- [ ] No success wording for simulated actions beyond what the app shows: simulated reminders are "recorded, not sent"; simulated payments move no money
- [ ] Scene 8 uses the AG Studio **AI panel** (Build your own report), not the *Ask Insights* box
- [ ] Each scene recorded separately; waits cut, never sped up
- [ ] Audio checked; captions added
- [ ] Final length under 3:00
- [ ] Uploaded to YouTube as **Public**, titled "Unstuck: AI receivables resolution for PayPal Invoicing (PayPal AI Hackathon 2026)", repo link in the description; link checked in a private window
- [ ] Backup: keep the prepared `video.db`. If anything goes wrong, restart the server on it and continue from the same state
