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
2. Click **Diagnose all open invoices**. Each row gets a reason. Lumen Yoga's reminder is sent automatically; check *Recently*.
3. Open **Northwind Logistics** (JC-1041). Read the evidence, expand **Policy checks**, then click **Update invoice**. The receipt shows the PayPal operation.
4. Open **Harbor Dental**: the dispute is escalated with a suggested reply, and automatic reminders are paused.
5. In **Needs you**, approve or decline **Atlas Robotics**' cheque.
6. Open **Bluebird Café** → **Open as the client**. Tap *Can I pay part now and the rest later?* → **Accept this plan** → **Simulate payment** ($400).
7. Back on the console: Bluebird shows *Plan: 1 of 3 paid*, and "Collected after Unstuck stepped in" reads $400.
8. **Activity** lists every decision and call. **Your rules** lets you change the limits; for example, set *Most installments* to 2 and ask for a plan again.
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

5. Start the app:

   ```bash
   npm run dev
   ```

   The header shows **PayPal sandbox** and **Claude**.
6. Follow steps 2–8 above. In step 6 the button reads **Pay $400.00 or more with PayPal**. It opens PayPal's sandbox invoice page; log in as the sandbox buyer and pay $400.
7. With a registered webhook, the board updates within seconds. Otherwise press **Sync with PayPal**.

## Option C: hosted

_Render URL to be added after deployment._ If it has been idle, the first load takes about 30 seconds.
