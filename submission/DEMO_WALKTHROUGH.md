# Demo Walkthrough (for judges)

## Option A: no setup (simulation)

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>. The demo studio loads automatically, and the header shows **Simulation, not PayPal** and **Rules only**.

1. Read the sentence at the top: what's owed and how much is late. Below it, **The resolution loop** shows all eight invoices in *Spotted*. Kestrel Media is marked red: its promise to pay has passed.
2. Click **Run the agent** and watch the trace: sync, prioritise by risk, then gather, diagnose, plan, check rules and act for each client. The loop fills in from recorded results:
   - Lumen's and Kestrel's follow-ups go out automatically within your rules (*Acted*);
   - five fixes wait for you (*Waiting for you*).
3. Click **Northwind Logistics** in the loop. Read the client's own words (quoted), the inference, the expected outcome and the risks. Expand **Why this risk rating** and **Policy checks**, then click **Update invoice**. The toast and receipt show the PayPal operation. The rules are re-checked against the current invoice before it runs.
4. Open **Kestrel Media**: the client's promise is quoted, the missed date is cited as a recorded fact, and the inference says plainly that *why* is unknown. The follow-up has been sent.
5. Open **Harbor Dental**: the dispute is escalated with a suggested reply, and PayPal's automatic reminders are paused.
6. In **Needs you**, approve **Atlas Robotics**' cheque. A confirmation states exactly what PayPal will record before anything happens.
7. Open **Bluebird Café** → **Open as the client**. Tap *Can I pay part now and the rest later?* → **Accept this plan** → **Simulate payment** ($400, labelled as simulated).
8. Back on the console, Bluebird has moved to **Agreed**, shows *Plan: 1 of 3 paid*, and "Collected after Unstuck acted" reads $400. Hover the figure: it shows timing, not proof of causation, and promises are never counted.
9. **Insights** (AG Studio): click a suggested question or type one, such as:
   - "Which customers account for the highest overdue receivables?"
   - "Which payment promises have been missed?"
   - "What worked?"

   Each answer names clients and amounts from the data. Try one it can't answer ("What's the weather?"). Click **Build your own report**, open the AI panel on the right and ask there: the same *Unstuck Insights* agent runs inside AG Studio.
10. **Activity** lists every decision and PayPal call. **Your rules** lets you change the limits. **Reset demo** restores the scenario.

## Option B: real PayPal sandbox and AI (Gemini)

1. Create a sandbox REST app at developer.paypal.com, and find your sandbox *personal* account's email.
2. Copy the env template:

   ```bash
   cp .env.example .env.local
   ```

   Then set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `GEMINI_API_KEY` (free key from <https://aistudio.google.com/apikey>; for Claude instead, `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`) and, optionally, `DEMO_PAYER_EMAIL`. That must be a sandbox Personal account registered outside India: PayPal refuses to send invoices to India-based recipients.
3. Check the connection:

   ```bash
   npm run check:sandbox
   ```

4. Create the demo invoices in your sandbox. Check first with the read-only dry run; the seeder is resumable and safe to re-run:

   ```bash
   npm run seed:sandbox -- --dry-run
   ```

   ```bash
   npm run seed:sandbox
   ```

5. Start the app (with real PayPal credentials, a production build needs an owner password; dev mode does not):

   ```bash
   npm run dev
   ```

   The header shows **PayPal sandbox** and **AI: Gemini**. To check the AI on its own first (simulation, no PayPal calls): `npm run verify:ai`.
6. Follow steps 2–8 above. In step 6 the button reads **Pay $400.00 or more with PayPal**. It opens PayPal's sandbox invoice page; log in as the sandbox buyer and pay $400.
7. With a registered webhook, the board updates within seconds. Otherwise press **Sync with PayPal**.

## Option C: hosted

_Render URL to be added after deployment._ If it has been idle, the first load takes about 30 seconds.
