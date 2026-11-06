/**
 * Google Gemini adapter (official @google/genai SDK, Gemini Developer API with an API key).
 *
 * - Structured output: responseMimeType "application/json" + responseJsonSchema. If the API rejects the schema
 *   (HTTP 400 about the schema), the call is retried once with JSON mode only; the application still validates
 *   every field, so this never weakens validation.
 * - Retries: the SDK's own retry loop is switched off; every retry goes through ../reliability (runWithRetries),
 *   so each HTTP attempt is paced (GEMINI_MAX_RPM) and budgeted (AI_DAILY_CALL_LIMIT), 503/5xx/network errors get
 *   bounded exponential backoff with jitter, Google's RetryInfo and any Retry-After header are honoured, and 429 is
 *   handled separately from 503.
 * - Errors are classified from the HTTP status, Google's status token and RetryInfo/QuotaFailure details; only
 *   Google's short error message is kept (redacted, truncated), never request content or the key.
 */
import { randomUUID } from "node:crypto";
import { ApiError, GoogleGenAI, type Content, type Part } from "@google/genai";
import { z } from "zod";
import { readConfig } from "../../config";
import { safeErrorText } from "../shared";
import { CHAT_RETRY, parseRetryAfter, runWithRetries, STRUCTURED_RETRY, type AttemptFailure, type RetryOutcome, type RetryPolicy } from "../reliability";
import type { AiCallMeta, AiFinish, AiProvider, AiUsage, ChatItem, ChatTurnRequest, ChatTurnResult, StructuredRequest, StructuredResult, ToolCall } from "./types";

/** Per HTTP attempt. A client-side timeout is not retried (the request may still be running at Google). */
export const GEMINI_REQUEST_TIMEOUT_MS = 60_000;
/** SDK retries off (attempts counts the initial call): retries happen in runWithRetries, paced and budgeted. */
export const GEMINI_SDK_RETRY = { attempts: 1 };
/**
 * Always the Gemini Developer API, whatever the environment says: the SDK would otherwise honour
 * GOOGLE_GENAI_USE_VERTEXAI / GOOGLE_GENAI_USE_ENTERPRISE (switching to Vertex AI with Google Cloud credentials and
 * billing) and GOOGLE_GEMINI_BASE_URL (sending the API key to another host). Explicit options take precedence.
 */
export const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/";
const HTTP = { baseUrl: GEMINI_API_BASE_URL, timeout: GEMINI_REQUEST_TIMEOUT_MS, retryOptions: GEMINI_SDK_RETRY };

/** The subset of the SDK client this adapter uses (lets tests inject a fake). */
export type GeminiClientLike = {
  models: {
    generateContent(params: { model: string; contents: Content[]; config?: Record<string, unknown> }): Promise<unknown>;
    get(params: { model: string; config?: Record<string, unknown> }): Promise<{ name?: string; displayName?: string; outputTokenLimit?: number; supportedActions?: string[] }>;
  };
};

const g = globalThis as unknown as { __unstuckGemini?: { key: string; client: GeminiClientLike }; __unstuckGeminiOverride?: GeminiClientLike | null };

/** Test hook: inject a fake client (null restores the real one). */
export function setGeminiClient(client: GeminiClientLike | null) {
  g.__unstuckGeminiOverride = client;
}

function geminiClient(apiKey: string): GeminiClientLike {
  if (g.__unstuckGeminiOverride) return g.__unstuckGeminiOverride;
  if (!g.__unstuckGemini || g.__unstuckGemini.key !== apiKey) {
    g.__unstuckGemini = { key: apiKey, client: new GoogleGenAI({ apiKey, vertexai: false, httpOptions: HTTP }) as unknown as GeminiClientLike };
  }
  return g.__unstuckGemini.client;
}

/* ------------------------------------------------------------------ */
/* Schema normalisation                                                */
/* ------------------------------------------------------------------ */

/**
 * Convert application JSON Schema to the conservative form Gemini accepts: `type: [X, "null"]` becomes `anyOf`,
 * and keywords Gemini doesn't use ($schema, strict) are dropped. For tool parameters, additionalProperties is
 * dropped too (tool inputs are validated by our own code).
 */
export function toGeminiSchema(schema: unknown, opts: { forTools?: boolean } = {}): unknown {
  if (Array.isArray(schema)) return schema.map((s) => toGeminiSchema(s, opts));
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "$schema" || k === "strict") continue;
    if (opts.forTools && k === "additionalProperties") continue;
    out[k] = toGeminiSchema(v, opts);
  }
  if (Array.isArray(out.type)) {
    const types = out.type as string[];
    delete out.type;
    const rest = { ...out };
    for (const k of Object.keys(out)) delete out[k];
    out.anyOf = types.map((t) => (t === "null" ? { type: "null" } : { ...rest, type: t }));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Response and error interpretation                                   */
/* ------------------------------------------------------------------ */

type RawResponse = {
  responseId?: string;
  modelVersion?: string;
  candidates?: { content?: Content; finishReason?: string; finishMessage?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
};

const REFUSAL_REASONS = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT"]);

export function geminiFinish(res: RawResponse): { finish: AiFinish; reason: string | null; refusalDetail?: string } {
  if (res.promptFeedback?.blockReason) return { finish: "refused", reason: `BLOCKED:${res.promptFeedback.blockReason}`, refusalDetail: `blocked: ${res.promptFeedback.blockReason.toLowerCase()}` };
  const c = res.candidates?.[0];
  if (!c) return { finish: "other", reason: null };
  const r = c.finishReason ?? null;
  if (r === "STOP") return { finish: "complete", reason: r };
  if (r === "MAX_TOKENS") return { finish: "truncated", reason: r };
  if (r && REFUSAL_REASONS.has(r)) return { finish: "refused", reason: r, refusalDetail: r.toLowerCase().replace(/_/g, " ") };
  return { finish: "other", reason: r };
}

function usageOf(res: RawResponse): AiUsage | undefined {
  const u = res.usageMetadata;
  if (!u) return undefined;
  return { input_tokens: u.promptTokenCount ?? null, output_tokens: u.candidatesTokenCount ?? null, thinking_tokens: u.thoughtsTokenCount ?? null, cached_tokens: u.cachedContentTokenCount ?? null, cache_write_tokens: null };
}

/** Visible answer text: text parts that aren't thought summaries. */
function answerText(content: Content | undefined): string {
  return (content?.parts ?? [])
    .filter((p: Part) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
}

/** Google's error body, as the SDK puts it in ApiError.message (JSON of the response body). */
function googleError(message: string): { message?: string; status?: string; details?: { "@type"?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[] } | null {
  try {
    return (JSON.parse(message) as { error?: ReturnType<typeof googleError> }).error ?? null;
  } catch {
    return null;
  }
}

/** Google's RetryInfo.retryDelay ("37s", "1.5s") in ms. */
function retryInfoMs(details: NonNullable<ReturnType<typeof googleError>>["details"]): number | undefined {
  const d = details?.find((x) => x["@type"]?.endsWith("google.rpc.RetryInfo"))?.retryDelay;
  const m = d ? /^(\d+(?:\.\d+)?)s$/.exec(d) : null;
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

/**
 * Classify an SDK/HTTP error. Keeps Google's short message (redacted, ≤120 chars) so an operator can tell
 * "model overloaded" from other 503s, but never request content or the key. `retryAfterHeader` is the attempt's
 * Retry-After header, when the response had one (the SDK's ApiError doesn't carry headers).
 */
export function classifyGeminiError(err: unknown, retryAfterHeader?: string | null): AttemptFailure {
  const e = err as { status?: number; message?: string; name?: string; cause?: { code?: string; name?: string } };
  const message = String(e?.message ?? "");
  const body = googleError(message);
  const statusToken = body?.status ?? /\b(INVALID_ARGUMENT|PERMISSION_DENIED|UNAUTHENTICATED|NOT_FOUND|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|INTERNAL|FAILED_PRECONDITION)\b/.exec(message)?.[1];
  const status = err instanceof ApiError || typeof e?.status === "number" ? e.status : undefined;
  if (status !== undefined) {
    const head = `HTTP ${status}${statusToken ? ` ${statusToken}` : ""}`;
    const said = body?.message ? ` ("${safeErrorText(body.message).slice(0, 120)}")` : "";
    const retryAfterMs = parseRetryAfter(retryAfterHeader) ?? retryInfoMs(body?.details);
    const base = { httpStatus: status, retryAfterMs } as const;
    if (status === 429) {
      const quotaIds = (body?.details ?? []).flatMap((d) => d.violations ?? []).map((v) => v.quotaId ?? "");
      const daily = quotaIds.some((q) => /PerDay/i.test(q)) || /per ?day|PerDay|daily/i.test(message);
      return daily
        ? { ...base, status: "rate_limited", kind: "quota_exhausted", retryable: false, error: `AI rate limited: ${head} (daily quota exhausted; resets at midnight Pacific time)` }
        : { ...base, status: "rate_limited", kind: "rate_limited", retryable: true, error: `AI rate limited: ${head} (requests-per-minute limit${retryAfterMs ? `; Google asked to wait ${Math.ceil(retryAfterMs / 1000)} s` : ""})` };
    }
    const keyInvalid = /API[_ ]KEY[_ ]INVALID|API key not valid|API key expired/i.test(message);
    if (keyInvalid || status === 401 || status === 403) return { ...base, status: "failed", kind: "auth", retryable: false, error: safeErrorText(`AI request failed: ${head} (check GEMINI_API_KEY)`) };
    if (status === 404) return { ...base, status: "failed", kind: "model_not_found", retryable: false, error: safeErrorText(`AI request failed: ${head} (check GEMINI_MODEL)`) };
    if (status === 400 && /schema/i.test(message)) return { ...base, status: "failed", kind: "schema_rejected", retryable: false, error: safeErrorText(`AI request failed: ${head} (response schema rejected)`) };
    if (status === 400 && /FAILED_PRECONDITION|location is not supported|not available in your country/i.test(message)) return { ...base, status: "failed", kind: "region", retryable: false, error: safeErrorText(`AI request failed: ${head} (Gemini API not available for this key or region)`) };
    if (status === 503) return { ...base, status: "failed", kind: "unavailable", retryable: true, error: `AI request failed: Gemini temporarily unavailable, ${head}${said}` };
    if (status >= 500 || status === 408) return { ...base, status: "failed", kind: "server_error", retryable: true, error: `AI request failed: ${head}${said}` };
    return { ...base, status: "failed", kind: "invalid_request", retryable: false, error: `AI request failed: ${head}${said}` };
  }
  // Our own per-attempt timeout (the SDK aborts the request; some runtimes wrap it as the cause of "fetch failed"):
  // not retried, the request may still be running at Google.
  const isAbort = (x: { name?: string } | undefined) => x?.name === "AbortError" || x?.name === "TimeoutError";
  if (isAbort(e) || isAbort(e?.cause as { name?: string } | undefined))
    return { status: "failed", kind: "timeout", retryable: false, error: `AI request failed: Gemini did not respond within ${GEMINI_REQUEST_TIMEOUT_MS / 1000} s` };
  // Connection-level failures: the request never reached Gemini (or the connection dropped), so it is safe to
  // retry. This includes a TCP connect timeout (ETIMEDOUT / UND_ERR_CONNECT_TIMEOUT), which is not our request timeout.
  const code = String(e?.cause?.code ?? "");
  if (/\b(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|ENETUNREACH|EHOSTUNREACH)\b|UND_ERR_(CONNECT_TIMEOUT|SOCKET)|fetch failed|socket hang up/i.test(`${code} ${message}`))
    return { status: "failed", kind: "network", retryable: true, error: `AI request failed: could not reach the Gemini API${code || /\bE[A-Z]+\b/.test(message) ? ` (${code || /\bE[A-Z]+\b/.exec(message)![0]})` : ""}` };
  if (/aborted|timed? ?out|timeout/i.test(message))
    return { status: "failed", kind: "timeout", retryable: false, error: `AI request failed: Gemini did not respond within ${GEMINI_REQUEST_TIMEOUT_MS / 1000} s` };
  return { status: "failed", kind: "unknown", retryable: false, error: safeErrorText(`AI request failed: ${message || "unknown error"}`) };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

/** Prefix for ids we generate when Gemini returns a call without one (random, so they can't be guessed). */
const GENERATED_ID = "gem_";

function toContents(items: ChatItem[]): Content[] {
  const out: Content[] = [];
  for (const it of items) {
    if (it.role === "user") out.push({ role: "user", parts: [{ text: it.text }] });
    else if (it.role === "assistant") {
      if (it.raw?.provider === "gemini") out.push(it.raw.content as Content); // keeps thought signatures intact
      else
        out.push({
          role: "model",
          parts: [...(it.text ? [{ text: it.text }] : []), ...it.toolCalls.map((tc) => ({ functionCall: { ...(tc.id.startsWith(GENERATED_ID) ? {} : { id: tc.id }), name: tc.name, args: tc.args } }))],
        });
    } else {
      out.push({
        role: "user",
        parts: it.results.map((r) => {
          let parsed: unknown = r.output;
          try {
            parsed = JSON.parse(r.output);
          } catch {}
          return { functionResponse: { ...(r.id.startsWith(GENERATED_ID) ? {} : { id: r.id }), name: r.name, response: r.isError ? { error: r.output } : { result: parsed } } };
        }),
      });
    }
  }
  return out;
}

export class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;
  readonly label = "Gemini";
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly maxRpm: number,
  ) {}

  private meta(res: RawResponse | null, extra: Partial<AiCallMeta> & { latencyMs: number }): AiCallMeta {
    return { provider: "gemini", model: res?.modelVersion || this.model, requestId: res?.responseId ?? null, finishReason: res ? geminiFinish(res).reason : null, usage: res ? usageOf(res) : undefined, ...extra };
  }

  /** One logical generateContent call: paced, budgeted, bounded retries (see ../reliability). */
  private async generate(params: { contents: Content[]; config: Record<string, unknown> }, policy: RetryPolicy): Promise<{ out: RetryOutcome<{ res: RawResponse; latencyMs: number }>; lastLatencyMs: number }> {
    const client = geminiClient(this.apiKey);
    let lastLatency = 0;
    const out = await runWithRetries<{ res: RawResponse; latencyMs: number }>({
      provider: "gemini",
      label: "Gemini",
      perMinute: this.maxRpm,
      policy,
      attempt: async () => {
        let retryAfter: string | null = null;
        // Per-attempt fetch: only to read Retry-After, which the SDK's ApiError doesn't expose. Calls the global
        // fetch, so any network guard installed around it still applies.
        const captureHeaders = async (input: RequestInfo | URL, init?: RequestInit) => {
          const r = await fetch(input, init);
          retryAfter = r.headers.get("retry-after");
          return r;
        };
        const t = Date.now();
        try {
          const res = (await client.models.generateContent({ model: this.model, contents: params.contents, config: { ...params.config, httpOptions: { ...HTTP, fetch: captureHeaders } } })) as RawResponse;
          lastLatency = Date.now() - t;
          return { ok: true, value: { res, latencyMs: lastLatency } };
        } catch (err) {
          lastLatency = Date.now() - t;
          return { ok: false, failure: classifyGeminiError(err, retryAfter) };
        }
      },
    });
    return { out, lastLatencyMs: lastLatency };
  }

  /** Failure result with the evidence of what was tried (attempts, total time, kind, final HTTP status). */
  private failed(f: AttemptFailure, extra: Partial<AiCallMeta> & { latencyMs: number }) {
    return { ok: false as const, status: f.status, error: f.error, meta: this.meta(null, { errorKind: f.kind, httpStatus: f.httpStatus, ...extra }) };
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const base = { systemInstruction: req.system, maxOutputTokens: req.maxOutputTokens, responseMimeType: "application/json" };
    const contents: Content[] = [{ role: "user", parts: [{ text: req.user }] }];
    let schemaMode: "api_schema" | "json_only" = "api_schema";
    let g = await this.generate({ contents, config: { ...base, responseJsonSchema: toGeminiSchema(z.toJSONSchema(req.schema)) } }, STRUCTURED_RETRY);
    let attempts = g.out.attempts;
    let totalMs = g.out.totalMs;
    if (!g.out.ok && g.out.failure.kind === "schema_rejected") {
      schemaMode = "json_only"; // the API couldn't take our schema; ask for JSON and validate it ourselves
      g = await this.generate({ contents, config: base }, STRUCTURED_RETRY);
      attempts += g.out.attempts;
      totalMs += g.out.totalMs;
    }
    const out = g.out;
    if (!out.ok) return this.failed(out.failure, { latencyMs: g.lastLatencyMs, attempts, totalMs, schemaMode });
    const { res, latencyMs } = out.value;
    const f = geminiFinish(res);
    return { ok: true, text: answerText(res.candidates?.[0]?.content), finish: f.finish, refusalDetail: f.refusalDetail, meta: this.meta(res, { latencyMs, schemaMode, attempts, totalMs }) };
  }

  async chatTurn(req: ChatTurnRequest): Promise<ChatTurnResult> {
    const { out, lastLatencyMs } = await this.generate(
      {
        contents: toContents(req.items),
        config: {
          systemInstruction: req.system.join("\n\n"),
          maxOutputTokens: req.maxOutputTokens,
          tools: req.tools.length ? [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: toGeminiSchema(t.parameters, { forTools: true }) })) }] : undefined,
        },
      },
      CHAT_RETRY,
    );
    if (!out.ok) return this.failed(out.failure, { latencyMs: lastLatencyMs, attempts: out.attempts, totalMs: out.totalMs });
    const { res, latencyMs } = out.value;
    const content = res.candidates?.[0]?.content ?? { role: "model", parts: [] };
    const toolCalls: ToolCall[] = (content.parts ?? [])
      .filter((p) => p.functionCall?.name)
      .map((p) => ({ id: p.functionCall!.id || `${GENERATED_ID}${randomUUID()}`, name: p.functionCall!.name!, args: (p.functionCall!.args ?? {}) as Record<string, unknown> }));
    const f = geminiFinish(res);
    return { ok: true, text: answerText(content), toolCalls, finish: toolCalls.length ? "tool_use" : f.finish, raw: { provider: "gemini", content }, meta: this.meta(res, { latencyMs, attempts: out.attempts, totalMs: out.totalMs }) };
  }

  async checkModel() {
    const t0 = Date.now();
    try {
      const m = await geminiClient(this.apiKey).models.get({ model: this.model, config: { httpOptions: HTTP } });
      const canGenerate = !m.supportedActions || m.supportedActions.includes("generateContent");
      if (!canGenerate) return { ok: false as const, status: "failed" as const, error: `Model ${this.model} does not support generateContent`, meta: this.meta(null, { latencyMs: Date.now() - t0 }) };
      return { ok: true as const, detail: `${m.name ?? this.model}${m.displayName ? ` (${m.displayName})` : ""}${m.outputTokenLimit ? `, output limit ${m.outputTokenLimit} tokens` : ""}` };
    } catch (err) {
      const c = classifyGeminiError(err);
      return { ok: false as const, status: c.status, error: c.error, meta: this.meta(null, { latencyMs: Date.now() - t0, errorKind: c.kind, httpStatus: c.httpStatus }) };
    }
  }
}

/** Build the configured Gemini provider, or null if Gemini isn't the configured, keyed provider. */
export function geminiProviderFromConfig(): GeminiProvider | null {
  const ai = readConfig().ai;
  if (!ai.configured || ai.provider !== "gemini" || !process.env.GEMINI_API_KEY) return null;
  return new GeminiProvider(ai.model, process.env.GEMINI_API_KEY, ai.geminiMaxRpm);
}
