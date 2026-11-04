# Demo Walkthrough (for judges)

## Option A: no setup (simulation)

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>. The demo studio loads automatically, and the header shows **Simulation, not PayPal** and **Rules only**.

1. Read the sentence at the top: what's owed and why.
2. Click **Run the agent** and watch the trace: sync, prioritise by risk, then gather, diagnose, plan, check rules and act for each client. Each row gets a stuck reason and a risk badge (hover it to see the factors). Lumen Yoga's reminder goes out automatically; five items wait in **Needs you**.
3. Open **Northwind Logistics** (JC-1041). Read the evidence (quoted), the inference, the expected outcome and the risks. Expand **Why this risk rating** and **Policy checks**, then click **Update invoice**. The toast and receipt show the PayPal operation.
4. Open **Harbor Dental**: the dispute is escalated with a suggested reply, and automatic reminders are paused.
5. In **Needs you**, approve **Atlas Robotics**' cheque. A confirmation states exactly what PayPal will record before anything happens.
6. Open **Bluebird Café** → **Open as the client**. Tap *Can I pay part now and the rest later?* → **Accept this plan** → **Simulate payment** ($400).
7. Back on the console: Bluebird shows *Plan: 1 of 3 paid*, and "Collected after Unstuck acted" reads $400. Hover it: this is timing, not proof of causation, and promises are never counted.
8. **Insights** (AG Studio): type a question in **Ask Insights**, e.g. "Which customers have the largest outstanding balance?" or "Build a report for invoices requiring human approval". Then try one it can't answer ("What's the weather?"). Click **Build your own report**, open the AI panel on the right and ask the same questions there: the *Unstuck Insights* agent runs inside AG Studio. Click a chart slice to cross-filter. **Activity** lists every decision and call. **Your rules** lets you change the limits; for example, set *Most installments* to 2 and ask for a plan again.
9. **Reset demo** restores the scenario.

## Option B: real PayPal sandbox and Claude

1. Create a sandbox REST app at developer.paypal.com, and find your sandbox *personal* account's email.
2. Copy the env template:

   ```bash
   cp .env.example .env.local
   ```

   Then set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `DEMO_PAYER_EMAIL` and `ANTHROPIC_API_KEY`.
3. Check the connection:

   ```bash
   npm run check:sandbox
   ```

4. Create the demo invoices in your sandbox:

   ```bash
   npm run seed:sandbox
   ```

5. Start the app (with real PayPal credentials, a production build needs an owner password; dev mode does not):

   ```bash
   npm run dev
   ```

   The header shows **PayPal sandbox** and **Claude**.
6. Follow steps 2–8 above. In step 6 the button reads **Pay $400.00 or more with PayPal**. It opens PayPal's sandbox invoice page; log in as the sandbox buyer and pay $400.
7. With a registered webhook, the board updates within seconds. Otherwise press **Sync with PayPal**.

## Option C: hosted

_Render URL to be added after deployment._ If it has been idle, the first load takes about 30 seconds.
