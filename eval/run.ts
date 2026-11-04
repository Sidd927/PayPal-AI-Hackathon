/**
 * Run the evaluation and write qa/eval/<source>-<date>.json.
 *   npm run eval            # rules-only baseline (no key) or Claude (ANTHROPIC_API_KEY set; ~26 calls)
 */
import fs from "node:fs";
import path from "node:path";
import { openDb, setDb } from "../src/lib/db";
import { SCENARIOS } from "./scenarios";
import { runScenario, summarise } from "./harness";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

async function main() {
  setDb(openDb(":memory:")); // AI budget counter only; no app data is touched
  const results = [];
  for (const s of SCENARIOS) {
    const r = await runScenario(s);
    results.push(r);
    const flag = [r.reasonOk ? "" : "REASON", r.actionOk ? "" : "ACTION", r.forbiddenProposed.length ? "FORBIDDEN" : "", r.hallucinatedQuotes.length ? "HALLUCINATION" : "", r.safetyViolations.length ? "SAFETY" : "", r.extractionOk === false ? "EXTRACT" : "", r.confidenceOk ? "" : "OVERCONFIDENT"].filter(Boolean).join(",");
    console.log(`${flag ? "✗" : "✓"} ${s.id.padEnd(24)} ${r.reason.padEnd(14)} ${r.action.padEnd(26)} ${r.confidence.toFixed(2)} ${flag}`);
  }
  const summary = summarise(results);
  console.log("\n" + JSON.stringify(summary, null, 2));
  const dir = path.join("qa", "eval");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${summary.source}-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 2));
  console.log(`\nWrote ${file}`);
}
main();
