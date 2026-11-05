/**
 * AI diagnosis reliability: refreshing rules-only diagnoses when Claude becomes available, caching valid
 * Claude diagnoses, explicit handling of failed / cut-off / refused / invalid answers, force refresh, and
 * no repeated API calls. Claude is a scripted fake; no network.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import Anthropic from "@anthropic-ai/sdk";
import { openDb, repo } from "@/lib/db";
import { getGateway, setGateway } from "@/lib/config";
import { SimulatedGateway } from "@/lib/paypal/simulated";
import { seedScenario } from "@/lib/demo/scenario";
import { refreshInvoice } from "@/lib/services/invoices";
import { AI_RETRY_COOLDOWN_MS, diagnoseInvoice, reuseDecision } from "@/lib/services/diagnose";
import { runAgent, runView } from "@/lib/services/agent";
import { DIAGNOSIS_MAX_TOKENS, interpretDiagnosisResponse, safeErrorText } from "@/lib/ai/diagnosis";
import { setAnthropic } from "@/lib/ai/anthropic";
import { describeAiStatus } from "@/lib/ai-status";
import { freshEnv } from "./helpers";

/** A complete, schema-valid diagnosis for Northwind (missing PO). */
const VALID = {
  reason: "missing_info",
  confidence: 0.92,
  summary: "AP rejected the invoice for a missing PO number.",
  evidence: [{ source: "client_message", quote: "It's PO-88412." }],
  extracted: { po_number: "PO-88412", new_contact_email: null, promised_date: null, proposed_first_payment: null, disputed_item: null },
  inference: "None",
  recommended_action: "update_reference",
  rationale: "The client asked for the PO on the invoice.",
  expected_outcome: "AP pays on their next Thursday run.",
  risks: [],
  alternatives: [],
  message: { subject: "Invoice updated with your PO", body: "Hi Dan, I've added PO-88412." },
  plan: null,
  discount_percent: null,
  tone: "warm",
};

type Reply = { stop_reason: string; content: { type: string; text?: string }[]; stop_details?: { category: string } } | Error;
const ok = (o: object = VALID): Reply => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(o) }] });

/** Scripted Claude: returns (or throws) the next reply; records every request and its per-request options. */
function fakeClaude(...replies: Reply[]) {
  const calls: { body: any; options: any }[] = [];
  const client = {
    beta: {
      messages: {
        create: async (body: any, options: any) => {
          calls.push({ body, options });
          const r = replies.length > 1 ? replies.shift()! : replies[0]!;
          if (r instanceof Error) throw r;
          return { model: "claude-opus-5-5", ...r };
        },
      },
    },
  };
  setAnthropic(client as unknown as Anthropic);
  return calls;
}
const apiError = (status: number, type: string, message: string) => Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, message, new Headers({ "request-id": "req_test123" }));

let ids: Record<string, string>;
beforeEach(async () => {
  freshEnv();
  setGateway(new SimulatedGateway());
  ids = await seedScenario(getGateway(), { refresh: refreshInvoice });
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.UNSTUCK_AI;
  delete process.env.AI_DAILY_CALL_LIMIT;
  setAnthropic(null);
});
const enableAi = () => {
  process.env.AI_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "test-key";
};
const latest = (k = "northwind") => repo.latestDiagnosis(ids[k]!)!;

describe("refresh: rules-only diagnoses are upgraded once Claude is available", () => {
  it("a rules-only diagnosis is replaced by a Claude diagnosis on the next normal run, with one call", async () => {
    await diagnoseInvoice(ids.northwind!);
    expect(latest()).toMatchObject({ source: "rules", ai_status: "not_configured", ai_detail: null });

    enableAi();
    const calls = fakeClaude(ok());
    const res = await diagnoseInvoice(ids.northwind!); // no force
    expect(res.skipped).toBe(false);
    expect(calls).toHaveLength(1);
    expect(latest()).toMatchObject({ source: "ai", ai_status: "used", model: "claude-opus-5-5", reason: "missing_info" });
  });

  it("the reported agent-run scenario: rules-only everywhere, then a key is added, then nothing is repeated", async () => {
    await runAgent("manual");
    const open = repo.listInvoices().filter((i) => ["SENT", "UNPAID", "PARTIALLY_PAID"].includes(i.status));
    expect(open.every((i) => repo.latestDiagnosis(i.id)!.source === "rules")).toBe(true);

    enableAi();
    const calls = fakeClaude(ok());
    const second = runView((await runAgent("manual")).runId)!;
    expect(calls).toHaveLength(open.length); // every rules-only diagnosis retried once with Claude
    expect(second.summary).toMatchObject({ diagnosed: open.length, unchanged: 0, aiFallbacks: 0 });
    expect(open.every((i) => repo.latestDiagnosis(i.id)!.source === "ai")).toBe(true);

    const third = runView((await runAgent("manual")).runId)!;
    // Only invoices whose inputs changed (e.g. a reminder went out) are diagnosed again; nothing else calls Claude.
    expect(calls.length - open.length).toBe(third.summary!.diagnosed);
    expect(third.summary!.unchanged).toBeGreaterThan(0);
  });

  it("legacy rows without a recorded AI status are retried when AI is configured", () => {
    const row = { source: "rules" as const, input_hash: "h", ai_status: null, ai_attempted_at: null, created_at: new Date().toISOString() };
    expect(reuseDecision(row, "h", { aiConfigured: true })).toMatchObject({ reuse: false, aiRetry: true });
    expect(reuseDecision(row, "h", { aiConfigured: false })).toMatchObject({ reuse: true });
  });
});

describe("caching and force refresh", () => {
  it("a valid Claude diagnosis is reused while inputs are unchanged (no API call)", async () => {
    enableAi();
    const calls = fakeClaude(ok());
    await diagnoseInvoice(ids.northwind!);
    const first = latest().id;
    const again = await diagnoseInvoice(ids.northwind!);
    expect(again.skipped).toBe(true);
    expect(calls).toHaveLength(1);
    expect(latest().id).toBe(first);
  });

  it("force refresh always calls Claude again and writes a new diagnosis", async () => {
    enableAi();
    const calls = fakeClaude(ok());
    await diagnoseInvoice(ids.northwind!);
    const first = latest().id;
    const forced = await diagnoseInvoice(ids.northwind!, { force: true });
    expect(forced.skipped).toBe(false);
    expect(calls).toHaveLength(2);
    expect(latest().id).not.toBe(first);
  });

  it("changed inputs (a new client message) trigger a new diagnosis", async () => {
    enableAi();
    const calls = fakeClaude(ok());
    await diagnoseInvoice(ids.northwind!);
    repo.addMessage({ invoice_id: ids.northwind!, author: "client", channel: "email", body: "Any update on the PO fix?", created_at: new Date().toISOString() });
    await diagnoseInvoice(ids.northwind!);
    expect(calls).toHaveLength(2);
  });
});

describe("explicit handling of failed and unusable answers", () => {
  it("sends the documented request: 16k output budget, effort, structured format without the SDK parser, timeout and one retry", async () => {
    enableAi();
    const calls = fakeClaude(ok());
    await diagnoseInvoice(ids.northwind!);
    const { body, options } = calls[0]!;
    expect(body).toMatchObject({ model: "claude-opus-5-5", max_tokens: DIAGNOSIS_MAX_TOKENS, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium", format: { type: "json_schema" } } });
    expect(DIAGNOSIS_MAX_TOKENS).toBe(16_000);
    expect(typeof body.output_config.format.parse).toBe("undefined");
    expect(body).not.toHaveProperty("thinking"); // Opus 5.5 rejects disabling thinking
    expect(body).not.toHaveProperty("temperature");
    expect(options).toEqual({ timeout: 120_000, maxRetries: 1 });
  });

  it.each([
    ["an HTTP error", apiError(500, "api_error", "Internal server error"), "failed", /HTTP 500 api_error.*request id req_test123/],
    ["a bad key", apiError(401, "authentication_error", "invalid x-api-key sk-ant-api03-SECRETSECRET"), "failed", /HTTP 401 authentication_error \(check ANTHROPIC_API_KEY\)/],
    ["a network failure", new Anthropic.APIConnectionError({ message: "fetch failed" }), "failed", /could not reach the Claude API/],
    ["a timeout", new Anthropic.APIConnectionTimeoutError(), "failed", /did not respond in time/],
    ["a cut-off answer", { stop_reason: "max_tokens", content: [{ type: "text", text: '{"reason":"missing_info","confid' }] }, "unusable", /cut off at the 16,000-token output limit/],
    ["a refusal", { stop_reason: "refusal", content: [], stop_details: { category: "cyber" } }, "unusable", /declined this request \(cyber\)/],
    ["invalid JSON", { stop_reason: "end_turn", content: [{ type: "text", text: "Sure! Here is the diagnosis: ..." }] }, "unusable", /not valid JSON/],
    ["schema-invalid JSON", ok({ ...VALID, reason: "aliens", inference: undefined }), "unusable", /didn't match the diagnosis schema/],
    ["an empty answer", { stop_reason: "end_turn", content: [] }, "unusable", /no diagnosis in the answer/],
  ] as [string, Reply, string, RegExp][])("%s → rules fallback, recorded as %s, never as an AI diagnosis", async (_label, reply, status, detail) => {
    enableAi();
    const calls = fakeClaude(reply);
    const res = await diagnoseInvoice(ids.northwind!);
    expect(calls).toHaveLength(1);
    const d = latest();
    expect(d).toMatchObject({ source: "rules", ai_status: status, model: null, reason: "missing_info" }); // rules still diagnose
    expect(d.ai_detail).toMatch(detail);
    expect(d.ai_detail).not.toMatch(/sk-ant|SECRET/);
    expect(res).toMatchObject({ aiFallback: true });
    // Visible in Activity, with the reason, and never worded as "AI not configured".
    const ev = repo.listEvents({ invoiceId: ids.northwind!, limit: 20 }).find((e) => e.kind === "diagnosed")!;
    expect(ev.summary).toMatch(/Rules fallback/);
    expect(ev.summary).not.toMatch(/sk-ant|SECRET/);
    expect(describeAiStatus("rules", d.ai_status).long).not.toMatch(/not configured/);
  });

  it("a cut-off answer is not accepted even if its partial JSON would happen to parse", () => {
    const v = interpretDiagnosisResponse({ stop_reason: "max_tokens", content: [{ type: "text", text: JSON.stringify(VALID) }] });
    expect(v.ok).toBe(false);
  });

  it("redacts anything that looks like a credential", () => {
    expect(safeErrorText("x-api-key: sk-ant-api03-abcDEF_123 Authorization: Bearer xyz")).not.toMatch(/sk-ant-api03|abcDEF|Bearer xyz/);
  });

  it("AI not configured and AI turned off are genuine rules-only runs, labelled as such", async () => {
    await diagnoseInvoice(ids.northwind!);
    expect(latest()).toMatchObject({ ai_status: "not_configured", ai_detail: null });
    expect(describeAiStatus("rules", "not_configured").long).toBe("rules only (AI not configured)");
    enableAi();
    process.env.UNSTUCK_AI = "off";
    await diagnoseInvoice(ids.northwind!, { force: true });
    expect(latest()).toMatchObject({ ai_status: "not_configured", ai_detail: "AI is turned off (AI_PROVIDER=none or UNSTUCK_AI=off)" });
  });
});

describe("no repeated API calls after a failure", () => {
  it("a failed AI call isn't retried on the next run; after the cooldown it retries once, and a second failure keeps the existing diagnosis", async () => {
    enableAi();
    const calls = fakeClaude(apiError(503, "overloaded_error", "Overloaded"));
    await diagnoseInvoice(ids.northwind!);
    const failed = latest();
    expect(failed.ai_status).toBe("failed");
    const proposals = repo.listActions({ invoiceId: ids.northwind! }).map((a) => a.id);

    await diagnoseInvoice(ids.northwind!); // immediately again: within the cooldown
    expect(calls).toHaveLength(1);

    // Move the last attempt past the cooldown.
    const past = new Date(Date.now() - AI_RETRY_COOLDOWN_MS - 1000).toISOString();
    repo.recordAiAttempt(failed.id, { status: "failed", detail: failed.ai_detail });
    (await import("@/lib/db")).getDb().prepare("UPDATE diagnoses SET ai_attempted_at = ? WHERE id = ?").run(past, failed.id);

    const retry = await diagnoseInvoice(ids.northwind!);
    expect(calls).toHaveLength(2);
    expect(retry).toMatchObject({ skipped: true, aiFallback: true });
    expect(latest().id).toBe(failed.id); // kept, not rewritten
    expect(repo.listActions({ invoiceId: ids.northwind! }).map((a) => a.id)).toEqual(proposals); // no churn
    expect(repo.listEvents({ invoiceId: ids.northwind!, limit: 20 }).some((e) => e.kind === "ai_retry_failed")).toBe(true);

    await diagnoseInvoice(ids.northwind!); // the failed retry restarted the cooldown
    expect(calls).toHaveLength(2);
  });

  it("a successful retry after the cooldown replaces the rules diagnosis with Claude's", async () => {
    enableAi();
    fakeClaude(apiError(500, "api_error", "boom"));
    await diagnoseInvoice(ids.northwind!);
    const failed = latest();
    (await import("@/lib/db")).getDb().prepare("UPDATE diagnoses SET ai_attempted_at = ? WHERE id = ?").run(new Date(Date.now() - AI_RETRY_COOLDOWN_MS - 1000).toISOString(), failed.id);
    const calls = fakeClaude(ok());
    await diagnoseInvoice(ids.northwind!);
    expect(calls).toHaveLength(1);
    expect(latest()).toMatchObject({ source: "ai", ai_status: "used" });
    expect(latest().id).not.toBe(failed.id);
  });

  it("daily limit reached: no call, recorded as budget_exhausted, retried only on a new day", async () => {
    enableAi();
    process.env.AI_DAILY_CALL_LIMIT = "0";
    const calls = fakeClaude(ok());
    await diagnoseInvoice(ids.northwind!);
    expect(calls).toHaveLength(0);
    expect(latest()).toMatchObject({ source: "rules", ai_status: "budget_exhausted" });
    const row = latest();
    expect(reuseDecision(row, row.input_hash, { aiConfigured: true })).toMatchObject({ reuse: true });
    expect(reuseDecision(row, row.input_hash, { aiConfigured: true, now: Date.now() + 86_400_000 })).toMatchObject({ reuse: false, aiRetry: true });
  });

  it("a missed promise no longer forces a Claude call on every agent run", async () => {
    enableAi();
    const calls = fakeClaude(ok({ ...VALID, reason: "forgot", recommended_action: "wait", extracted: { ...VALID.extracted, po_number: null }, message: null }));
    await runAgent("manual");
    const kestrelCalls = () => calls.filter((c) => JSON.stringify(c.body.messages).includes("Kestrel")).length;
    const after1 = kestrelCalls();
    expect(after1).toBe(1);
    await runAgent("manual");
    expect(kestrelCalls()).toBe(after1); // inputs unchanged → reused
  });
});

describe("existing databases are migrated", () => {
  it("adds the AI status columns to a diagnoses table created by an earlier version, keeping its rows", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "unstuck-mig-")), "old.db");
    const old = new Database(file);
    old.exec("CREATE TABLE diagnoses (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id TEXT NOT NULL, reason TEXT NOT NULL, confidence REAL NOT NULL, summary TEXT NOT NULL, evidence_json TEXT NOT NULL, extracted_json TEXT NOT NULL, recommendation_json TEXT NOT NULL, source TEXT NOT NULL, model TEXT, input_hash TEXT NOT NULL, created_at TEXT NOT NULL)");
    old.prepare("INSERT INTO diagnoses (invoice_id, reason, confidence, summary, evidence_json, extracted_json, recommendation_json, source, model, input_hash, created_at) VALUES ('INV-1','forgot',0.6,'s','[]','{}','{}','rules',NULL,'h','2026-11-01T00:00:00Z')").run();
    old.close();
    const db = openDb(file);
    const cols = (db.prepare("PRAGMA table_info(diagnoses)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["ai_status", "ai_detail", "ai_attempted_at"]));
    expect(db.prepare("SELECT source, ai_status FROM diagnoses").get()).toEqual({ source: "rules", ai_status: null });
    openDb(file).close(); // idempotent
    db.close();
  });
});

describe("measurement evidence (Phase 2)", () => {
  it("a successful Claude diagnosis records the Anthropic request id, latency and token usage in Activity data", async () => {
    enableAi();
    const client = {
      beta: {
        messages: {
          create: async () => {
            const res: Record<string, unknown> = { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(VALID) }], usage: { input_tokens: 1234, output_tokens: 567, cache_read_input_tokens: 0, cache_creation_input_tokens: 900 } };
            Object.defineProperty(res, "_request_id", { value: "req_success_1", enumerable: false });
            return res;
          },
        },
      },
    };
    setAnthropic(client as unknown as Anthropic);
    await diagnoseInvoice(ids.northwind!);
    const ev = repo.listEvents({ invoiceId: ids.northwind!, limit: 10 }).find((e) => e.kind === "diagnosed")!;
    const data = JSON.parse(ev.data_json!);
    expect(data).toMatchObject({ ai_status: "used", request_id: "req_success_1", provider: "anthropic", model: "claude-opus-5-5", usage: { input_tokens: 1234, output_tokens: 567, thinking_tokens: null, cached_tokens: 0, cache_write_tokens: 900 } });
    expect(typeof data.latency_ms).toBe("number");
    expect(ev.summary).toMatch(/Claude \(claude-opus-5-5\)/);
  });

  it("a failed call keeps the API's request id for support, without counting as AI", async () => {
    enableAi();
    fakeClaude(apiError(529, "overloaded_error", "Overloaded"));
    await diagnoseInvoice(ids.northwind!);
    const data = JSON.parse(repo.listEvents({ invoiceId: ids.northwind!, limit: 10 }).find((e) => e.kind === "diagnosed")!.data_json!);
    expect(data).toMatchObject({ ai_status: "failed", source: "rules", request_id: "req_test123" });
  });

  it("eval summary: a mixed run is labelled 'mixed' and provider-only accuracy excludes the fallbacks", async () => {
    const { summarise } = await import("../eval/harness");
    const base = { category: "core", model: null, reasonOk: true, abstained: false, actionOk: true, forbiddenProposed: [], extractionOk: null, confidence: 0.9, confidenceOk: true, hallucinatedQuotes: [], safetyViolations: [], decisions: [], reason: "forgot", action: "send_reminder" };
    const s = summarise([
      { ...base, id: "a", source: "ai", ai: "used", reasonStrictOk: true, latencyMs: 4000, usage: { input_tokens: 100, output_tokens: 50, thinking_tokens: 20, cached_tokens: 80, cache_write_tokens: 10 } },
      { ...base, id: "b", source: "ai", ai: "used", reasonStrictOk: false, confidence: 0.4, latencyMs: 6000, usage: { input_tokens: 100, output_tokens: 70, thinking_tokens: null, cached_tokens: 80, cache_write_tokens: 0 } },
      { ...base, id: "c", source: "rules", ai: "failed", reasonStrictOk: true, latencyMs: 30, error: "AI request failed: HTTP 529" },
    ] as never);
    expect(s).toMatchObject({ source: "mixed", aiUsed: 2, aiFallbacks: 1, aiByStatus: { used: 2, failed: 1 } });
    expect(s.providerOnly).toMatchObject({ of: 2, reasonCorrectStrict: 1, confidenceBuckets: { "<0.5": 1, ">=0.85": 1 } });
    expect(s.tokens).toEqual({ calls: 2, input: 200, output: 120, thinking: 20, cached: 160, cacheWrite: 10 });
    expect(s.latencyMs).toMatchObject({ measured: 2, max: 6000 }); // the failed call's 30 ms is not provider latency
  });
});
