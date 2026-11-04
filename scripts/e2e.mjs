/**
 * Browser end-to-end test of the primary journey (simulation mode).
 *
 *   UNSTUCK_MODE=simulation npm run dev        # in one terminal
 *   npm run test:e2e                            # in another (BASE_URL defaults to http://localhost:3000)
 *
 * Steps: reset demo → diagnose all → open Northwind → approve PO fix → open Bluebird's payer page →
 * ask for a plan → accept → simulated first installment → owner board reflects the payment.
 * Screenshots are written to docs/screenshots/.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.resolve("docs/screenshots");
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function json(p, url, body) {
  return p.evaluate(
    async ([u, b]) => {
      const r = await fetch(u, { method: b ? "POST" : "GET", headers: b ? { "Content-Type": "application/json" } : {}, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, data: await r.json() };
    },
    [url, body],
  );
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  const health = await json(page, "/api/health");
  check("server healthy", health.status === 200, `paypal=${health.data.paypal} ai=${health.data.ai}`);
  if (health.data.paypal !== "simulation") throw new Error("Run the e2e suite in simulation mode (UNSTUCK_MODE=simulation)");

  const reset = await json(page, "/api/demo/reset", {});
  check("demo reset", reset.status === 200);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  check("hero sentence shows money owed", /owed \$20,450 across seven invoices/.test(await page.getByRole("heading", { level: 1 }).innerText()));
  await page.screenshot({ path: path.join(OUT, "01-board-before.png") });

  await page.getByRole("button", { name: /Diagnose all/ }).click();
  await page.getByText(/Diagnosed 7 open invoices/).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(800);
  const grid = page.locator(".ag-grid-scrolling-rows");
  check("board shows reasons", (await grid.getByText("Missing PO / AP details").count()) === 1 && (await grid.getByText("Cash is tight").count()) === 1 && (await grid.getByText("Disputing the work").count()) === 1);
  check("friendly reminder sent automatically", (await page.getByText(/Reminder delivered/).count()) > 0);
  await page.screenshot({ path: path.join(OUT, "02-board-diagnosed.png") });

  // Owner approves the PO fix from the drawer.
  await grid.locator(".ag-row", { hasText: "JC-1041" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByText("Why it’s stuck").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "03-drawer-northwind.png") });
  await drawer.getByRole("button", { name: "Update invoice" }).click();
  await drawer.getByText(/Reference set to PO-88412/).first().waitFor({ timeout: 20_000 });
  check("PO fix executed against the invoice", true);
  await drawer.getByRole("button", { name: "Close" }).click();

  // Payer side: Bluebird asks for a plan.
  const board = await json(page, "/api/board");
  const bluebird = board.data.rows.find((r) => r.client === "Bluebird Café" && r.open);
  const detail = await json(page, `/api/invoices/${bluebird.id}`);
  const payer = await ctx.newPage();
  await payer.setViewportSize({ width: 430, height: 932 });
  await payer.goto(detail.data.resolutionUrl, { waitUntil: "networkidle" });
  await payer.screenshot({ path: path.join(OUT, "04-payer-page.png"), fullPage: true });
  await payer.getByRole("button", { name: "Can I pay part now and the rest later?" }).click();
  await payer.getByRole("button", { name: "Accept this plan" }).first().waitFor({ timeout: 60_000 });
  check("payer sees in-policy plan offers", (await payer.getByRole("button", { name: "Accept this plan" }).count()) >= 1);
  await payer.screenshot({ path: path.join(OUT, "05-payer-offers.png"), fullPage: true });
  await payer.getByRole("button", { name: "Accept this plan" }).last().click();
  await payer.getByText(/Your plan is set up/).waitFor({ timeout: 20_000 });
  check("plan applied (partial payments enabled)", (await payer.getByText(/Partial payments are on/).count()) === 1);
  await payer.getByRole("button", { name: "Simulate payment" }).click();
  await payer.getByText(/Simulated payment of \$400.00 recorded/).waitFor({ timeout: 20_000 });
  check("first installment paid", (await payer.getByText("Remaining balance").count()) === 1);
  await payer.screenshot({ path: path.join(OUT, "06-payer-plan-progress.png"), fullPage: true });

  // Owner sees the money.
  await page.bringToFront();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  check("cash unstuck reflects payment", /\$400/.test(await page.getByText(/Collected after Unstuck stepped in/).innerText()));
  await page.screenshot({ path: path.join(OUT, "07-board-after.png") });

  // Activity log and rules pages render.
  await page.goto(`${BASE}/activity`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  check("activity log lists PayPal operations", (await page.getByText(/invoicing\/invoices/).count()) > 0);
  await page.screenshot({ path: path.join(OUT, "08-activity.png") });
  await page.goto(`${BASE}/policy`, { waitUntil: "networkidle" });
  check("rules page renders", (await page.getByRole("heading", { name: "Your rules" }).count()) === 1);
  await page.screenshot({ path: path.join(OUT, "09-rules.png") });

  // Mobile owner view sanity.
  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(BASE, { waitUntil: "networkidle" });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("no horizontal overflow on a phone", overflow <= 1, `overflow ${overflow}px`);
  check("no uncaught page errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  check("journey completed", false, e.message);
  await page.screenshot({ path: path.join(OUT, "failure.png") }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
