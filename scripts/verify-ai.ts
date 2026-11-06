/**
 * Verify that invoice diagnosis really uses the configured AI provider (Gemini by default). Simulation only.
 *
 *   npm run verify:ai
 *
 * Reads AI_PROVIDER (default gemini), GEMINI_API_KEY / GEMINI_MODEL (or ANTHROPIC_API_KEY / ANTHROPIC_MODEL when
 * AI_PROVIDER=anthropic) from .env.local or the environment. The key is never printed or written anywhere.
 * Uses an isolated database (node_modules/.cache/unstuck/ai-verify.db) you can open in the app afterwards:
 *
 *   UNSTUCK_MODE=simulation DATABASE_PATH=node_modules/.cache/unstuck/ai-verify.db npm run dev
 *
 * Safety: PayPal credentials are removed from this process, UNSTUCK_MODE is forced to "simulation", the gateway
 * is asserted to be the simulated one, and network access is limited to the configured AI provider's API host:
 * every other request (PayPal included) is blocked and counted.
 * Cost: about a dozen generation calls (one per demo invoice plus a few checks; more if Gemini returns 503 and a call is retried), paced to the provider's free-tier
 * rate (Gemini: GEMINI_MAX_RPM, default 10/minute, so expect a few minutes). The deliberate failure checks
 * (unknown model, invalid key) return errors and generate nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { installNetworkGuard } from "./lib/network-guard";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

// ---- Safety first: no PayPal, isolated database, provider-only network. -------------------------
const originalDbPath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(process.cwd(), "node_modules", ".cache", "unstuck", "unstuck.db");
for (const k of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_API_BASE"]) delete process.env[k];
process.env.UNSTUCK_MODE = "simulation";
delete process.env.UNSTUCK_AI;
// Variables that could send AI traffic (and the key) somewhere other than the provider's public API, or log it.
for (const k of ["GOOGLE_GENAI_USE_VERTEXAI", "GOOGLE_GENAI_USE_ENTERPRISE", "GOOGLE_GEMINI_BASE_URL", "GOOGLE_VERTEX_BASE_URL", "GOOGLE_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_LOG"]) delete process.env[k];
const DB_DIR = path.join(process.cwd(), "node_modules", ".cache", "unstuck");
const DB_FILE = path.join(DB_DIR, "ai-verify.db");
if (path.resolve(DB_FILE) === originalDbPath) throw new Error("Refusing to run: DATABASE_PATH points at the verification database file.");
const removed: string[] = [];
for (const suffix of ["", "-wal", "-shm"]) {
  if (fs.existsSync(DB_FILE + suffix)) removed.push(path.basename(DB_FILE + suffix));
  fs.rmSync(DB_FILE + suffix, { force: true });
}
process.env.DATABASE_PATH = DB_FILE;

const providerId = (process.env.AI_PROVIDER || "gemini").trim().toLowerCase();
const ALLOWED_HOSTS: Record<string, string[]> = { gemini: ["generativelanguage.googleapis.com"], anthropic: ["api.anthropic.com"] };
const allowed = ALLOWED_HOSTS[providerId] ?? [];
const KEY_VAR = providerId === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY";
const MODEL_VAR = providerId === "anthropic" ? "ANTHROPIC_MODEL" : "GEMINI_MODEL";
const realKey = process.env[KEY_VAR] ?? "";
// Installed before any application module is imported (they are imported dynamically in main()).
const guard = installNetworkGuard(allowed);
const paypalAttempts = guard.log.paypal;
const otherBlocked = guard.log.other;
let resolvedModel = "";

/**
 * real_provider: needs a genuine answer from the provider. negative_control: a deliberate failure against the real
 * API (nothing is generated). local: no API call is expected. safety: isolation and redaction guarantees.
 */
type CheckKind = "real_provider" | "negative_control" | "local" | "safety";
type Check = { name: string; kind: CheckKind; ok: boolean; detail: string };
const checks: Check[] = [];
const logLines: string[] = [];
const say = (line: string) => {
  logLines.push(line);
  console.log(line);
};
function check(kind: CheckKind, name: string, ok: boolean, detail = "") {
  checks.push({ name, kind, ok, detail });
  say(`${ok ? "PASS" : "FAIL"}  [${kind}] ${name}${detail ? `  (${detail})` : ""}`);
}
const containsSecret = (text: string) => (realKey.length >= 8 && text.includes(realKey)) || /sk-ant-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}/.test(text);

/** Writes the evidence file (never overwriting one), redacting the key if it somehow appears. */
function writeEvidence(extra: Record<string, unknown>): string {
  const real = checks.filter((c) => c.kind === "real_provider");
  const body = {
    generated_at: new Date().toISOString(),
    environment: { paypal: "simulation (credentials removed from this process)", provider: providerId, model: resolvedModel, database: path.relative(process.cwd(), DB_FILE), allowed_hosts: allowed },
    // True only when the provider really answered with a valid diagnosis (check 1c). Negative controls never count.
    real_provider_response_received: checks.some((c) => c.name.startsWith("1c.") && c.ok),
    summary: { real_provider: `${real.filter((c) => c.ok).length}/${real.length}`, all: `${checks.filter((c) => c.ok).length}/${checks.length}` },
    checks,
    ...extra,
  };
  let text = JSON.stringify(body, null, 2);
  if (realKey.length >= 8) text = text.split(realKey).join("[redacted]");
  const dir = path.join("qa", "ai-verification");
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `verify-ai-${providerId}-${body.generated_at.slice(0, 19).replace(/:/g, "")}`);
  let file = `${base}.json`;
  for (let i = 2; fs.existsSync(file); i++) file = `${base}-${i}.json`;
  fs.writeFileSync(file, text, { flag: "wx" });
  return file;
}

async function main() {
  // Imported only after the environment is locked down.
  const { getDb, repo } = await import("../src/lib/db");
  const { getGateway, readConfig } = await import("../src/lib/config");
  const { getAiProvider } = await import("../src/lib/ai/providers");
  const { seedScenario } = await import("../src/lib/demo/scenario");
  const { refreshInvoice } = await import("../src/lib/services/invoices");
  const { diagnoseInvoice } = await import("../src/lib/services/diagnose");
  const { runAgent, runView } = await import("../src/lib/services/agent");
  const { STUCK_REASONS, ACTION_TYPES, isOpenStatus } = await import("../src/lib/domain");

  const gw = getGateway();
  if (gw.mode !== "simulated") throw new Error("Refusing to run: the PayPal gateway is not the simulated one.");
  const ai = readConfig().ai;
  say(`PayPal: simulation (no PayPal calls). Database: ${path.relative(process.cwd(), DB_FILE)}. Network: only ${allowed.join(", ") || "(none)"}`);
  say(`AI provider: ${ai.providerLabel} (${ai.provider}); ${ai.configured ? "configured" : `NOT configured (${ai.unavailableReason})`}; ${KEY_VAR} ${realKey ? "set (not shown)" : "missing"}; model ${ai.model}; daily limit ${ai.dailyCallLimit}${ai.provider === "gemini" ? `; paced to ${ai.geminiMaxRpm} requests/minute` : ""}\n`);
  if (!ai.configured || !allowed.length) {
    console.error(`Set ${KEY_VAR} in .env.local (AI_PROVIDER=${providerId}; it must be gemini or anthropic, not none), then run this again.`);
    process.exit(2);
  }
  const label = ai.providerLabel;
  resolvedModel = ai.model;

  const calls = () => {
    const row = getDb().prepare("SELECT value_json FROM settings WHERE key = 'ai_usage'").get() as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as { calls: number }).calls : 0;
  };
  /** HTTP attempts recorded on diagnosis events after `afterId` (each attempt is one unit of the daily budget). */
  const maxEventId = () => (getDb().prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events").get() as { id: number }).id;
  const attemptsSince = (afterId: number) =>
    (getDb().prepare("SELECT data_json FROM events WHERE id > ? AND kind IN ('diagnosed', 'ai_retry_failed') AND data_json IS NOT NULL").all(afterId) as { data_json: string }[]).reduce((a, e) => a + ((JSON.parse(e.data_json) as { attempts?: number | null }).attempts ?? 0), 0);
  const lastDiagEvent = (invoiceId: string) => {
    const e = repo.listEvents({ invoiceId, limit: 50 }).find((x) => x.kind === "diagnosed");
    return e?.data_json ? (JSON.parse(e.data_json) as { provider?: string; model?: string; request_id?: string | null; latency_ms?: number | null; usage?: { input_tokens: number | null; output_tokens: number | null; thinking_tokens: number | null } | null; ai_status?: string; finish_reason?: string | null; attempts?: number | null; total_ms?: number | null; error_kind?: string; http_status?: number | null; schema_mode?: string | null }) : null;
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

  // 0. The configured model exists for this key (metadata call, nothing generated).
  const mc = await getAiProvider()!.checkModel();
  check("real_provider", `0. ${label} model "${ai.model}" is available for this key`, mc.ok, mc.ok ? mc.detail : mc.error);
  if (!mc.ok) {
    // Nothing below can pass without a working key and model; stop instead of making a dozen failing calls.
    writeEvidence({ stopped_early: "the key or model check failed; no diagnosis was attempted", network: { provider_http_requests: guard.log.allowedRequests, paypal_requests_attempted: paypalAttempts.length, other_requests_blocked: otherBlocked.length } });
    console.error(`\nStopped: fix ${KEY_VAR} or ${MODEL_VAR} and run again. No real ${label} response was received.`);
    process.exit(1);
  }

  const ids = await seedScenario(gw, { refresh: refreshInvoice });
  const nw = ids.northwind!;

  // 1. Rules-only first, then upgraded when the provider is available.
  process.env.AI_PROVIDER = "none";
  let c0 = calls();
  await diagnoseInvoice(nw);
  process.env.AI_PROVIDER = providerId;
  const rulesRow = repo.latestDiagnosis(nw)!;
  check("local", "1a. With AI turned off, Northwind gets a rules-only diagnosis and no API call", rulesRow.source === "rules" && rulesRow.ai_status === "not_configured" && calls() === c0, `${rulesRow.source}/${rulesRow.ai_status}`);

  c0 = calls();
  await diagnoseInvoice(nw); // no force
  const up = validate(nw);
  const upEv = lastDiagEvent(nw);
  check("real_provider", `1b. Once ${label} is available, the rules-only diagnosis is upgraded with one logical call (budget = HTTP attempts)`, up.d.source === "ai" && up.d.ai_status === "used" && up.d.ai_provider === providerId && (upEv?.attempts ?? 0) >= 1 && calls() === c0 + (upEv?.attempts ?? -1), `${up.d.source}/${up.d.ai_status}${up.d.ai_detail ? `: ${up.d.ai_detail}` : ""}; ${upEv?.attempts ?? "?"} HTTP attempt(s), ${calls() - c0} budget unit(s)`);
  check("real_provider", `1c. Real ${label} response: provider, model, schema-valid diagnosis with evidence`, up.d.source === "ai" && upEv?.provider === providerId && !!up.d.model && up.problems.length === 0, `provider ${upEv?.provider ?? "?"}, model ${up.d.model}, request ${upEv?.request_id ?? "not provided"}, ${upEv?.latency_ms ?? "?"} ms, finish ${upEv?.finish_reason ?? "?"}, tokens in/out/thinking ${upEv?.usage?.input_tokens ?? "?"}/${upEv?.usage?.output_tokens ?? "?"}/${upEv?.usage?.thinking_tokens ?? "?"}${up.problems.length ? `; problems: ${up.problems.join("; ")}` : ""}`);
  say(`      → reason ${up.d.reason}, confidence ${up.d.confidence}, action ${up.action}`);
  for (const e of up.evidence) say(`      → evidence (${e.source}): ${e.quote}`);

  // 2. Reuse while inputs are unchanged.
  c0 = calls();
  const before = up.d.id;
  const reused = await diagnoseInvoice(nw);
  const reusedRow = repo.latestDiagnosis(nw)!;
  check("real_provider", `2. A ${label} diagnosis is reused while the invoice is unchanged (no API call)`, up.d.source === "ai" && reused.skipped === true && calls() === c0 && reusedRow.id === before && reusedRow.source === "ai", up.d.source === "ai" ? "" : `no ${label} diagnosis to reuse`);

  // 3. Explicit refresh.
  c0 = calls();
  await diagnoseInvoice(nw, { force: true });
  const forcedEv = lastDiagEvent(nw);
  const forcedRow = repo.latestDiagnosis(nw)!;
  const differentRequest = !forcedEv?.request_id || !upEv?.request_id || forcedEv.request_id !== upEv.request_id;
  check("real_provider", `3. Diagnose again (force) makes a new ${label} call and a new diagnosis`, calls() === c0 + (forcedEv?.attempts ?? -1) && forcedRow.id !== before && forcedRow.source === "ai" && differentRequest, `request ${forcedEv?.request_id ?? "not provided"}`);

  // 4. Full agent run over every open demo invoice (simulated PayPal).
  c0 = calls();
  const run1 = runView((await runAgent("manual")).runId)!;
  const open = repo.listInvoices().filter((i) => isOpenStatus(i.status));
  const perInvoice = open.map((inv) => {
    const v = validate(inv.id);
    const ev = lastDiagEvent(inv.id);
    return { client: inv.recipient_business, number: inv.number, source: v.d.source, ai_status: v.d.ai_status, provider: v.d.ai_provider, ai_detail: v.d.ai_detail, model: v.d.model, reason: v.d.reason, confidence: v.d.confidence, action: v.action, evidence: v.evidence.length, problems: v.problems, request_id: ev?.request_id ?? null, latency_ms: ev?.latency_ms ?? null, total_ms: ev?.total_ms ?? null, attempts: ev?.attempts ?? null, error_kind: ev?.error_kind ?? null, schema_mode: ev?.schema_mode ?? null, usage: ev?.usage ?? null };
  });
  say("\n      Client                 Source       Reason          Conf  Action                       Tries  Request id");
  for (const r of perInvoice) say(`      ${String(r.client).padEnd(22)} ${(r.source === "ai" ? String(r.provider) : `RULES:${r.ai_status}`).padEnd(12)} ${r.reason.padEnd(15)} ${r.confidence.toFixed(2)}  ${r.action.padEnd(28)} ${String(r.attempts ?? "-").padEnd(6)} ${r.request_id ?? "-"}${r.ai_detail ? `  [${r.ai_detail}]` : ""}`);
  const aiCount = perInvoice.filter((r) => r.source === "ai" && r.ai_status === "used" && r.provider === providerId && r.problems.length === 0).length;
  check("real_provider", `4. Agent run: every open demo invoice has a valid ${label} diagnosis (${aiCount}/${open.length})`, aiCount === open.length, `${calls() - c0} API calls this run; run summary ${JSON.stringify(run1.summary)}`);

  // 5. A second run calls the provider only for invoices whose inputs changed.
  c0 = calls();
  const ev2 = maxEventId();
  const run2 = runView((await runAgent("manual")).runId)!;
  const stillAi = open.filter((i) => repo.latestDiagnosis(i.id)!.source === "ai").length;
  check("real_provider", `5. Second agent run: ${label} is called only for invoices whose inputs changed, and they stay AI-diagnosed`, calls() - c0 === attemptsSince(ev2) && (run2.summary?.unchanged ?? 0) > 0 && (run2.summary?.aiFallbacks ?? 0) === 0 && stillAi === open.length, `${calls() - c0} call(s), ${run2.summary?.diagnosed} re-diagnosed, ${run2.summary?.unchanged} reused, ${run2.summary?.aiFallbacks ?? 0} fell back, ${stillAi}/${open.length} AI-diagnosed`);

  // 6. Deliberate failures against the real API: unknown model, then an invalid key. Neither generates anything.
  const lumen = ids.lumen!;
  const realModel = process.env[MODEL_VAR];
  process.env[MODEL_VAR] = "unstuck-nonexistent-model";
  await diagnoseInvoice(lumen, { force: true });
  if (realModel === undefined) delete process.env[MODEL_VAR];
  else process.env[MODEL_VAR] = realModel;
  const failRow = repo.latestDiagnosis(lumen)!;
  check("negative_control", "6a. An unknown model is classified as 'failed' with a model hint and falls back to rules (never counted as AI)", failRow.source === "rules" && failRow.ai_status === "failed" && new RegExp(`HTTP \\d{3}.*check ${MODEL_VAR}`).test(failRow.ai_detail ?? ""), failRow.ai_detail ?? "");

  const quill = ids.quill!;
  process.env[KEY_VAR] = "invalid-key-for-unstuck-verification";
  await diagnoseInvoice(quill, { force: true });
  process.env[KEY_VAR] = realKey;
  const authRow = repo.latestDiagnosis(quill)!;
  check("negative_control", "6b. An invalid key is classified as 'failed' with a key hint, and rules are used", authRow.source === "rules" && authRow.ai_status === "failed" && new RegExp(KEY_VAR).test(authRow.ai_detail ?? ""), authRow.ai_detail ?? "");

  // 7. Cooldown: no immediate retry after a failure.
  c0 = calls();
  const cooled = await diagnoseInvoice(lumen);
  check("local", "7. Retry cooldown: the failed invoice is not retried immediately (no API call)", cooled.skipped === true && calls() === c0);

  // 8. Daily budget.
  const atlas = ids.atlas!;
  const prevLimit = process.env.AI_DAILY_CALL_LIMIT;
  process.env.AI_DAILY_CALL_LIMIT = String(calls());
  c0 = calls();
  await diagnoseInvoice(atlas, { force: true });
  if (prevLimit === undefined) delete process.env.AI_DAILY_CALL_LIMIT;
  else process.env.AI_DAILY_CALL_LIMIT = prevLimit;
  const budgetRow = repo.latestDiagnosis(atlas)!;
  check("local", "8. Daily limit reached: no API call, recorded as budget_exhausted, rules used", calls() === c0 && budgetRow.ai_status === "budget_exhausted" && budgetRow.source === "rules");

  // 9–10. Network: nothing but the provider.
  check("safety", "9. No PayPal request was attempted", paypalAttempts.length === 0, paypalAttempts.join(", "));
  check("safety", `10. No request went anywhere except ${allowed.join(", ")}`, otherBlocked.length === 0 && guard.log.allowedRequests > 0, `${guard.log.allowedRequests} provider request(s); blocked: ${otherBlocked.join(", ") || "none"}`);

  // 11. Redaction: the key appears nowhere we store or print.
  const stored = [
    ...(getDb().prepare("SELECT data_json, summary FROM events").all() as { data_json: string | null; summary: string }[]).map((e) => `${e.summary} ${e.data_json ?? ""}`),
    ...(getDb().prepare("SELECT ai_detail FROM diagnoses").all() as { ai_detail: string | null }[]).map((d) => d.ai_detail ?? ""),
  ].join("\n");
  check("safety", "11. No API key or credential pattern in stored diagnoses, Activity events or console output", !containsSecret(stored) && !containsSecret(logLines.join("\n")));

  const report = {
    invoices: perInvoice,
    totals: { api_calls_counted: calls(), provider_http_requests: guard.log.allowedRequests, paypal_requests_attempted: paypalAttempts.length, other_requests_blocked: otherBlocked.length },
    // Every provider failure seen during the run, by class (unavailable = 503, rate_limited = 429 per minute, …).
    provider_errors: (() => {
      const kinds: Record<string, number> = {};
      for (const e of getDb().prepare("SELECT data_json FROM events WHERE kind IN ('diagnosed', 'ai_retry_failed') AND data_json IS NOT NULL").all() as { data_json: string }[]) {
        const k = (JSON.parse(e.data_json) as { error_kind?: string }).error_kind;
        if (k) kinds[k] = (kinds[k] ?? 0) + 1;
      }
      return kinds;
    })(),
    cleanup: { removed_before_run: removed, kept_for_inspection: path.relative(process.cwd(), DB_FILE), sandbox_database_untouched: originalDbPath !== path.resolve(DB_FILE) },
    not_verified_here: ["'unusable' (cut-off, refusal, invalid JSON) and 'rate_limited' outcomes cannot be triggered safely against the real API; they are covered by tests/ai-providers.test.ts and tests/ai-diagnosis.test.ts"],
  };
  const draft = JSON.stringify({ report, checks, log: logLines });
  const evidenceOk = !containsSecret(draft) && report.cleanup.sandbox_database_untouched;
  check("safety", "12. Evidence has no key or credential pattern; only the verification database was replaced", evidenceOk, `removed: ${removed.join(", ") || "nothing (first run)"}`);
  const file = writeEvidence(report);
  const total = checks.length;
  const ok = checks.filter((c) => c.ok).length;
  const real = checks.filter((c) => c.kind === "real_provider");
  console.log(`\n${ok}/${total} checks passed (real-provider ${real.filter((c) => c.ok).length}/${real.length}, negative controls ${checks.filter((c) => c.kind === "negative_control" && c.ok).length}/${checks.filter((c) => c.kind === "negative_control").length}). Evidence written to ${file} (no secrets).`);
  console.log(`To inspect in the app (simulation, no PayPal):\n  UNSTUCK_MODE=simulation DATABASE_PATH=${path.relative(process.cwd(), DB_FILE)} npm run dev`);
  process.exit(ok === total ? 0 : 1);
}

main().catch((e) => {
  const msg = String((e as Error).message ?? e);
  console.error("✗", realKey ? msg.split(realKey).join("[redacted]") : msg);
  process.exit(1);
});
