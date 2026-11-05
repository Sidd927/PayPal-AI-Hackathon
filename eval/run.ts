/**
 * Run the evaluation and write qa/eval/<source>-<date>.json.
 *   npm run eval            # rules-only baseline (no key) or the configured AI provider (GEMINI_API_KEY set, or AI_PROVIDER=anthropic + ANTHROPIC_API_KEY; ~26 calls)
 */
import fs from "node:fs";
import path from "node:path";
import { openDb, setDb } from "../src/lib/db";
import { SCENARIOS } from "./scenarios";
import { runScenario, summarise } from "./harness";
import { readConfig } from "../src/lib/config";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

async function main() {
  setDb(openDb(":memory:")); // AI budget counter only; no app data is touched, no PayPal involved
  const ai = readConfig().ai;
  console.log(
    ai.configured
      ? `AI provider: ${ai.providerLabel} (${ai.provider}), model ${ai.model}${ai.provider === "gemini" ? `, paced to ${ai.geminiMaxRpm} requests/minute` : `, effort ${ai.effort}`} (each scenario is one API call)`
      : `AI NOT configured (${ai.unavailableReason ?? "unknown"}; provider ${ai.provider}, key variable ${ai.keyVariable}): this is a rules-only baseline run`,
  );
  const results = [];
  for (const s of SCENARIOS) {
    const r = await runScenario(s);
    results.push(r);
    const flag = [r.reasonOk ? "" : "REASON", r.actionOk ? "" : "ACTION", r.forbiddenProposed.length ? "FORBIDDEN" : "", r.hallucinatedQuotes.length ? "HALLUCINATION" : "", r.safetyViolations.length ? "SAFETY" : "", r.extractionOk === false ? "EXTRACT" : "", r.confidenceOk ? "" : "OVERCONFIDENT"].filter(Boolean).join(",");
    const who = r.ai === "used" ? `${ai.provider} ${((r.latencyMs ?? 0) / 1000).toFixed(1)}s` : r.ai === "not_configured" ? "rules" : `FALLBACK:${r.ai}`;
    const fellBack = ai.configured && r.ai !== "used";
    console.log(`${fellBack ? "!" : flag ? "✗" : "✓"} ${s.id.padEnd(24)} ${who.padEnd(20)} ${r.reason.padEnd(14)} ${r.action.padEnd(26)} ${r.confidence.toFixed(2)} ${flag}${r.ai !== "used" && r.error ? `  [${r.error}]` : ""}`);
  }
  const summary = summarise(results);
  console.log("\n" + JSON.stringify(summary, null, 2));
  const dir = path.join("qa", "eval");
  fs.mkdirSync(dir, { recursive: true });
  // Never overwrite an existing result file (baselines included). A provider run that received no AI answer at all
  // is named for what it is, so it can't be mistaken for a provider evaluation.
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "");
  const base = !ai.configured ? `rules-${stamp.slice(0, 10)}` : summary.aiUsed === 0 ? `${ai.provider}-NO-AI-ANSWERS-${stamp}` : `${ai.provider}-${stamp}`;
  let file = path.join(dir, `${base}.json`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base}-${i}.json`);
  fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 2), { flag: "wx" });
  if (ai.configured) {
    console.log(`\n${ai.providerLabel} answered ${summary.aiUsed}/${summary.scenarios} scenarios; ${summary.aiFallbacks} fell back to rules (excluded from providerOnly accuracy).`);
    if (summary.aiUsed === 0) console.log(`!! No real ${ai.providerLabel} answer was received. This is NOT a ${ai.providerLabel} evaluation; see aiByStatus and the errors above.`);
  }
  console.log(`\nWrote ${file}`);
}
main();
