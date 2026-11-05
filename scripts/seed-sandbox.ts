/**
 * Create the demo studio's invoices as REAL invoices in your PayPal sandbox business account,
 * then sync them into Unstuck with the seeded client conversations.
 *
 *   npm run seed:sandbox -- --dry-run   # read-only: shows what exists and what would happen
 *   npm run seed:sandbox                # creates / resumes
 *
 * Resumable and idempotent: invoices already in PayPal (matched by number JC-<n>-…) are reused. A DRAFT
 * is (re)addressed if needed and sent; anything already sent or paid is left alone and never resent; the
 * five paid-history invoices get their sandbox payment recorded only if they have none yet. Each scenario
 * is reported as created, resumed, skipped or failed, and a failure doesn't stop the others.
 *
 * Bluebird Café's invoice is addressed to DEMO_PAYER_EMAIL (if set) so you can log in to the sandbox as
 * the buyer and pay it. That sandbox Personal account must be registered in a country other than India:
 * PayPal refuses to send invoices to India-based recipients (INR_FOREIGN_CURRENCY_BLOCKED).
 */
import fs from "node:fs";
import { getGateway, readConfig } from "../src/lib/config";
import { seedScenarioWithReport } from "../src/lib/demo/scenario";
import { refreshInvoice } from "../src/lib/services/invoices";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cfg = readConfig();
  const gw = getGateway();
  if (gw.mode !== "live") throw new Error("PayPal sandbox credentials are not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET), or UNSTUCK_MODE=simulation is set.");
  if (!cfg.demoPayerEmail) console.warn("! DEMO_PAYER_EMAIL is not set: Bluebird Café's invoice goes to a fictional address, so you can't log in as that buyer.");
  console.log(dryRun ? "Dry run (read-only): comparing the demo scenario with your PayPal sandbox…" : "Seeding the demo scenario into your PayPal sandbox (resuming where possible)…");

  const { outcomes } = await seedScenarioWithReport(gw, { payerEmail: cfg.demoPayerEmail, refresh: refreshInvoice, log: (m) => console.log(m), dryRun });

  console.log("\nSummary");
  for (const o of outcomes) console.log(`  ${o.result.padEnd(8)} ${`JC-${o.number}`.padEnd(8)} ${o.key.padEnd(13)} ${(o.invoiceId ?? "—").padEnd(26)} ${o.status ?? ""}`);
  const count = (r: string) => outcomes.filter((o) => o.result === r).length;
  const failed = count("failed");
  console.log(
    dryRun
      ? `\n${count("planned")} would change, ${count("skipped")} already complete, ${failed} need attention. Nothing was sent to PayPal.`
      : `\n${count("created")} created, ${count("resumed")} resumed, ${count("skipped")} already complete, ${failed} failed.`,
  );
  if (failed) {
    for (const o of outcomes.filter((x) => x.result === "failed")) console.log(`  ✗ ${o.key}: ${o.detail}`);
    console.log("\nFix the cause above and run the same command again: completed scenarios are skipped.");
    process.exit(1);
  }
  if (!dryRun) console.log("All 13 demo invoices are in place. Start Unstuck (npm run dev) and open the board.");
}

main().catch((e) => {
  console.error("✗", e.message, e.details ? JSON.stringify(e.details, null, 2) : "");
  process.exit(1);
});
