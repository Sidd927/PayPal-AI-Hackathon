/**
 * Create the demo studio's invoices as REAL invoices in your PayPal sandbox business account,
 * then sync them into Unstuck with the seeded client conversations.
 *
 *   DEMO_PAYER_EMAIL=<your sandbox personal account email> npm run seed:sandbox
 *
 * Bluebird Café's invoice is addressed to DEMO_PAYER_EMAIL so you can log in to the sandbox as the
 * buyer and pay it (fully or partially) on PayPal's invoice page during the demo.
 */
import fs from "node:fs";
import { getGateway, readConfig } from "../src/lib/config";
import { seedScenario } from "../src/lib/demo/scenario";
import { refreshInvoice } from "../src/lib/services/invoices";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const cfg = readConfig();
  const gw = getGateway();
  if (gw.mode !== "live") throw new Error("PayPal sandbox credentials are not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET), or UNSTUCK_MODE=simulation is set.");
  if (!cfg.demoPayerEmail) console.warn("! DEMO_PAYER_EMAIL is not set: Bluebird Café's invoice will go to a fictional address and you won't be able to pay it as the buyer.");
  console.log("Creating demo invoices in the PayPal sandbox…");
  const ids = await seedScenario(gw, { payerEmail: cfg.demoPayerEmail, refresh: refreshInvoice, log: (m) => console.log(m) });
  console.log(`\n✓ Created ${Object.keys(ids).length} sandbox invoices. Start Unstuck (npm run dev) and open the board.`);
}

main().catch((e) => {
  console.error("✗", e.message, e.details ? JSON.stringify(e.details, null, 2) : "");
  process.exit(1);
});
