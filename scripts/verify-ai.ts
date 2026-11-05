/**
 * Verify that invoice diagnosis really uses the Claude API (Phase 2). Simulation only: no PayPal calls.
 *
 *   npm run verify:ai
 *
 * Reads ANTHROPIC_API_KEY (and optional ANTHROPIC_MODEL / ANTHROPIC_EFFORT) from .env.local or the environment.
 * The key is never printed or written anywhere. Uses an isolated database
 * (node_modules/.cache/unstuck/ai-verify.db) that you can open in the app afterwards:
 *
 *   UNSTUCK_MODE=simulation DATABASE_PATH=node_modules/.cache/unstuck/ai-verify.db npm run dev
 *
 * Safety: PayPal credentials are removed from this process, UNSTUCK_MODE is forced to "simulation", the gateway
 * is asserted to be the simulated one, and any HTTP request to a PayPal host is blocked and counted.
 * Cost: roughly 12 Claude calls (one per demo invoice plus a few checks); one deliberate call to a non-existent
 * model returns an error and is not billed.
 */
import fs from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

// ---- Safety first: no PayPal, isolated database. -----------------------------------------------
for (const k of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_API_BASE"]) delete process.env[k];
process.env.UNSTUCK_MODE = "simulation";
delete process.env.UNSTUCK_AI;
const DB_FILE = path.join(process.cwd(), "node_modules", ".cache", "unstuck", "ai-verify.db");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB_FILE + suffix, { force: true });
process.env.DATABASE_PATH = DB_FILE;
const paypalAttempts: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (/(^|\.)paypal\.com$/i.test(url.hostname)) {
    paypalAttempts.push(`${init?.method ?? "GET"} ${url.hostname}${url.pathname}`);
    throw new Error("Blocked by verify-ai: PayPal requests are not allowed in this check");
  }
  return realFetch(input, init);
}) as typeof fetch;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  // Imported only after the environment is locked down.
  const { getDb, repo } = await import("../src/lib/db");
  const { getGateway, readConfig } = await import("../src/lib/config");
  const { seedScenario } = await import("../src/lib/demo/scenario");
  const { refreshInvoice } = await import("../src/lib/services/invoices");
  const { diagnoseInvoice } = await import("../src/lib/services/diagnose");
  const { runAgent, runView } = await import("../src/lib/services/agent");
  const { STUCK_REASONS, ACTION_TYPES, isOpenStatus } = await import("../src/lib/domain");

  const gw = getGateway();
  if (gw.mode !== "simulated") throw new Error("Refusing to run: the PayPal gateway is not the simulated one.");
  const ai = readConfig().ai;
  console.log(`PayPal: simulation (no PayPal calls). Database: ${path.relative(process.cwd(), DB_FILE)}`);
  console.log(`Claude: ${ai.configured ? "configured" : `NOT configured (${ai.unavailableReason})`}; API key ${process.env.ANTHROPIC_API_KEY ? "set (not shown)" : "missing"}; model ${ai.model}; effort ${ai.effort}; daily limit ${ai.dailyCallLimit}\n`);
  if (!ai.configured) {
    console.error("Set ANTHROPIC_API_KEY in .env.local (and make sure UNSTUCK_AI is not 'off'), then run this again.");
    process.exit(2);
  }

  const calls = () => {
    const row = getDb().prepare("SELECT value_json FROM settings WHERE key = 'ai_usage'").get() as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as { calls: number }).calls : 0;
  };
  const lastDiagEvent = (invoiceId: string) => {
    const e = repo.listEvents({ invoiceId, limit: 50 }).find((x) => x.kind === "diagnosed");
    return e?.data_json ? (JSON.parse(e.data_json) as { request_id?: string | null; latency_ms?: number | null; usage?: { input_tokens: number; output_tokens: number } | null; ai_status?: string; error?: string }) : null;
  };
  /** Independent re-validation of a stored diagnosis, including a check that client quotes are verbatim. */
  const validate = (invoiceId: string) => {
    const d = repo.latestDiagnosis(invoiceId)!;
    const evidence = JSON.parse(d.evidence_json) as { source: string; quote: string }[];
    const rec = JSON.parse(d.recommendation_json) as { action: string };
    const said = repo.listMessages(invoiceId).map((m) => m.body.toLowerCase().replace(/\s+/g, " ")).join(" \n ");
    const unquoted = evidence.filter((e) => e.source === "client_message" && !said.includes(e.quote.toLowerCase().replace(/\s+/g, " ").replace(/…$/, "")));
    const problems = [
      (STUCK_REASONS as readonly string[]).includes(d.reason) ? "" : `reason ${d.reason}`,
      d.confidence >= 0 && d.confidence <= 1 ? "" : `confidence ${d.confidence}`,
      evidence.length >= 1 ? "" : "no evidence",
      (ACTION_TYPES as readonly string[]).includes(rec.action) ? "" : `action ${rec.action}`,
      unquoted.length ? `quotes not found in the conversation: ${unquoted.map((u) => JSON.stringify(u.quote)).join(", ")}` : "",
    ].filter(Boolean);
    return { d, evidence, action: rec.action, problems };
  };

  const ids = await seedScenario(gw, { refresh: refreshInvoice });
  const nw = ids.northwind!;

  // 1. Rules-only first, then upgraded when Claude is available.
  process.env.UNSTUCK_AI = "off";
  let c0 = calls();
  await diagnoseInvoice(nw);
  delete process.env.UNSTUCK_AI;
  const rulesRow = repo.latestDiagnosis(nw)!;
  check("1a. With AI turned off, Northwind gets a rules-only diagnosis and no API call", rulesRow.source === "rules" && rulesRow.ai_status === "not_configured" && calls() === c0, `${rulesRow.source}/${rulesRow.ai_status}`);

  c0 = calls();
  await diagnoseInvoice(nw); // no force
  const up = validate(nw);
  const upEv = lastDiagEvent(nw);
  check("1b. Once Claude is available, the rules-only diagnosis is upgraded with exactly one call", up.d.source === "ai" && up.d.ai_status === "used" && calls() === c0 + 1, `${up.d.source}/${up.d.ai_status}${up.d.ai_detail ? `: ${up.d.ai_detail}` : ""}`);
  check("1c. Real API response: request id, model, schema-valid diagnosis with evidence", !!upEv?.request_id && !!up.d.model && up.problems.length === 0, `request ${upEv?.request_id ?? "none"}, model ${up.d.model}, ${upEv?.latency_ms ?? "?"} ms, tokens in/out ${upEv?.usage?.input_tokens ?? "?"}/${upEv?.usage?.output_tokens ?? "?"}${up.problems.length ? `; problems: ${up.problems.join("; ")}` : ""}`);
  console.log(`      → reason ${up.d.reason}, confidence ${up.d.confidence}, action ${up.action}`);
  for (const e of up.evidence) console.log(`      → evidence (${e.source}): ${e.quote}`);

  // 2. Reuse while inputs are unchanged.
  c0 = calls();
  const before = up.d.id;
  const reused = await diagnoseInvoice(nw);
  const reusedRow = repo.latestDiagnosis(nw)!;
  check("2. A Claude diagnosis is reused while the invoice is unchanged (no API call)", up.d.source === "ai" && reused.skipped === true && calls() === c0 && reusedRow.id === before && reusedRow.source === "ai", up.d.source === "ai" ? "" : "no Claude diagnosis to reuse");

  // 3. Explicit refresh.
  c0 = calls();
  await diagnoseInvoice(nw, { force: true });
  const forcedEv = lastDiagEvent(nw);
  const forcedRow = repo.latestDiagnosis(nw)!;
  check("3. Diagnose again (force) makes a new Claude call and a new diagnosis", calls() === c0 + 1 && forcedRow.id !== before && forcedRow.source === "ai" && !!forcedEv?.request_id && forcedEv.request_id !== upEv?.request_id, `request ${forcedEv?.request_id ?? "none"}`);

  // 4. Full agent run over every open demo invoice (simulated PayPal).
  c0 = calls();
  const run1 = runView((await runAgent("manual")).runId)!;
  const open = repo.listInvoices().filter((i) => isOpenStatus(i.status));
  const perInvoice = open.map((inv) => {
    const v = validate(inv.id);
    const ev = lastDiagEvent(inv.id);
    return { client: inv.recipient_business, number: inv.number, source: v.d.source, ai_status: v.d.ai_status, ai_detail: v.d.ai_detail, model: v.d.model, reason: v.d.reason, confidence: v.d.confidence, action: v.action, evidence: v.evidence.length, problems: v.problems, request_id: ev?.request_id ?? null, latency_ms: ev?.latency_ms ?? null, usage: ev?.usage ?? null };
  });
  console.log("\n      Client                 Source  Reason          Conf  Action                       Request id");
  for (const r of perInvoice) console.log(`      ${String(r.client).padEnd(22)} ${(r.source === "ai" ? "claude" : `RULES:${r.ai_status}`).padEnd(7)} ${r.reason.padEnd(15)} ${r.confidence.toFixed(2)}  ${r.action.padEnd(28)} ${r.request_id ?? "-"}${r.ai_detail ? `  [${r.ai_detail}]` : ""}`);
  const claudeCount = perInvoice.filter((r) => r.source === "ai" && r.ai_status === "used" && r.problems.length === 0).length;
  check(`4. Agent run: every open demo invoice has a valid Claude diagnosis (${claudeCount}/${open.length})`, claudeCount === open.length, `${calls() - c0} API calls this run; run summary ${JSON.stringify(run1.summary)}`);

  // 5. A second run calls Claude only for invoices whose inputs changed.
  c0 = calls();
  const run2 = runView((await runAgent("manual")).runId)!;
  const stillClaude = open.filter((i) => repo.latestDiagnosis(i.id)!.source === "ai").length;
  check("5. Second agent run: Claude is called only for invoices whose inputs changed, and they stay Claude-diagnosed", calls() - c0 === (run2.summary?.diagnosed ?? -1) && (run2.summary?.unchanged ?? 0) > 0 && (run2.summary?.aiFallbacks ?? 0) === 0 && stillClaude === open.length, `${calls() - c0} call(s), ${run2.summary?.diagnosed} re-diagnosed, ${run2.summary?.unchanged} reused, ${run2.summary?.aiFallbacks ?? 0} fell back, ${stillClaude}/${open.length} Claude-diagnosed`);

  // 6. Failure classification against the real API (a model that doesn't exist: an error, not billed).
  const lumen = ids.lumen!;
  const realModel = process.env.ANTHROPIC_MODEL;
  process.env.ANTHROPIC_MODEL = "claude-unstuck-nonexistent-model";
  await diagnoseInvoice(lumen, { force: true });
  if (realModel === undefined) delete process.env.ANTHROPIC_MODEL;
  else process.env.ANTHROPIC_MODEL = realModel;
  const failRow = repo.latestDiagnosis(lumen)!;
  check("6a. A real API error is classified as 'failed' and falls back to rules (never counted as AI)", failRow.source === "rules" && failRow.ai_status === "failed" && /HTTP \d{3}/.test(failRow.ai_detail ?? ""), failRow.ai_detail ?? "");
  check("6b. The recorded error contains no credentials", !/sk-ant|x-api-key|authorization/i.test(failRow.ai_detail ?? ""));

  // 7. Cooldown: no immediate retry after a failure.
  c0 = calls();
  const cooled = await diagnoseInvoice(lumen);
  check("7. Retry cooldown: the failed invoice is not retried immediately (no API call)", cooled.skipped === true && calls() === c0);

  // 8. Daily budget.
  const atlas = ids.atlas!;
  const prevLimit = process.env.AI_DAILY_CALL_LIMIT;
  process.env.AI_DAILY_CALL_LIMIT = String(calls());
  c0 = calls();
  await diagnoseInvoice(atlas, { force: true });
  if (prevLimit === undefined) delete process.env.AI_DAILY_CALL_LIMIT;
  else process.env.AI_DAILY_CALL_LIMIT = prevLimit;
  const budgetRow = repo.latestDiagnosis(atlas)!;
  check("8. Daily limit reached: no API call, recorded as budget_exhausted, rules used", calls() === c0 && budgetRow.ai_status === "budget_exhausted" && budgetRow.source === "rules");

  check("9. No PayPal request was attempted", paypalAttempts.length === 0, paypalAttempts.join(", "));

  const passed = checks.filter((c) => c.ok).length;
  const report = {
    generated_at: new Date().toISOString(),
    environment: { paypal: "simulation", model: ai.model, effort: ai.effort, database: path.relative(process.cwd(), DB_FILE) },
    checks,
    invoices: perInvoice,
    totals: { api_calls_counted: calls(), paypal_requests_attempted: paypalAttempts.length },
    not_verified_here: ["'unusable' outcomes (cut-off, refusal, invalid JSON) cannot be triggered safely against the real API; they are covered by tests/ai-diagnosis.test.ts"],
  };
  const dir = path.join("qa", "ai-verification");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `verify-ai-${report.generated_at.slice(0, 19).replace(/:/g, "")}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\n${passed}/${checks.length} checks passed. Evidence written to ${file} (no secrets).`);
  console.log(`To inspect in the app (simulation, no PayPal):\n  UNSTUCK_MODE=simulation DATABASE_PATH=${path.relative(process.cwd(), DB_FILE)} npm run dev`);
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((e) => {
  console.error("✗", (e as Error).message.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]"));
  process.exit(1);
});
