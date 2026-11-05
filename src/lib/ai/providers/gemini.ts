/**
 * Google Gemini adapter (official @google/genai SDK, Gemini Developer API with an API key).
 *
 * - Structured output: responseMimeType "application/json" + responseJsonSchema. If the API rejects the schema
 *   (HTTP 400 about the schema), the call is retried once with JSON mode only; the application still validates
 *   every field, so this never weakens validation.
 * - Bounded: per-request timeout, at most one retry for 408/5xx, and 429 (rate limit / quota) is never retried.
 * - Paced: a process-wide requests-per-minute ceiling (GEMINI_MAX_RPM, default 10) for the free tier.
 * - Errors are classified from the HTTP status and Google's status token only; no request content or key is kept.
 */
import { randomUUID } from "node:crypto";
import { ApiError, GoogleGenAI, type Content, type Part } from "@google/genai";
import { z } from "zod";
import { readConfig } from "../../config";
import { paceRequests, safeErrorText } from "../shared";
import type { AiCallMeta, AiFailure, AiFinish, AiProvider, AiUsage, ChatItem, ChatTurnRequest, ChatTurnResult, StructuredRequest, StructuredResult, ToolCall } from "./types";

export const GEMINI_REQUEST_TIMEOUT_MS = 120_000;
/** attempts = total tries: 2 means one retry. 429 deliberately excluded (rate limits and quotas don't clear in seconds). */
export const GEMINI_RETRY = { attempts: 2, httpStatusCodes: [408, 500, 502, 503, 504] };
/**
 * Always the Gemini Developer API, whatever the environment says: the SDK would otherwise honour
 * GOOGLE_GENAI_USE_VERTEXAI / GOOGLE_GENAI_USE_ENTERPRISE (switching to Vertex AI with Google Cloud credentials and
 * billing) and GOOGLE_GEMINI_BASE_URL (sending the API key to another host). Explicit options take precedence.
 */
export const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/";
const HTTP = { baseUrl: GEMINI_API_BASE_URL, timeout: GEMINI_REQUEST_TIMEOUT_MS, retryOptions: GEMINI_RETRY };

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

/** Classify an SDK/HTTP error into the shared failure classes, without keeping the provider's message body. */
export function classifyGeminiError(err: unknown): Omit<AiFailure, "meta"> & { schemaRejected?: boolean } {
  const e = err as { status?: number; message?: string; name?: string };
  const message = String(e?.message ?? "");
  const statusToken = /"status"\s*:\s*"([A-Z_]+)"/.exec(message)?.[1] ?? /\b(INVALID_ARGUMENT|PERMISSION_DENIED|UNAUTHENTICATED|NOT_FOUND|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|INTERNAL|FAILED_PRECONDITION)\b/.exec(message)?.[1];
  const status = err instanceof ApiError || typeof e?.status === "number" ? e.status : undefined;
  if (status !== undefined) {
    const keyInvalid = /API[_ ]KEY[_ ]INVALID|API key not valid|API key expired/i.test(message);
    const head = `HTTP ${status}${statusToken ? ` ${statusToken}` : ""}`;
    if (status === 429) {
      const daily = /per ?day|PerDay|daily/i.test(message);
      return { status: "rate_limited", error: `AI rate limited: ${head}${daily ? " (daily quota exhausted; resets at midnight Pacific time)" : " (requests-per-minute or quota limit; try again later)"}` };
    }
    if (keyInvalid || status === 401 || status === 403) return { status: "failed", error: safeErrorText(`AI request failed: ${head} (check GEMINI_API_KEY)`) };
    if (status === 404) return { status: "failed", error: safeErrorText(`AI request failed: ${head} (check GEMINI_MODEL)`) };
    if (status === 400 && /schema/i.test(message)) return { status: "failed", error: safeErrorText(`AI request failed: ${head} (response schema rejected)`), schemaRejected: true };
    if (status === 400 && /FAILED_PRECONDITION|location is not supported|not available in your country/i.test(message)) return { status: "failed", error: safeErrorText(`AI request failed: ${head} (Gemini API not available for this key or region)`) };
    return { status: "failed", error: safeErrorText(`AI request failed: ${head}`) };
  }
  if (e?.name === "AbortError" || /timed? ?out|timeout|aborted/i.test(message)) return { status: "failed", error: "AI request failed: Gemini did not respond in time" };
  if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|network/i.test(message)) return { status: "failed", error: "AI request failed: could not reach the Gemini API" };
  return { status: "failed", error: safeErrorText(`AI request failed: ${message || "unknown error"}`) };
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

  private meta(t0: number, res: RawResponse | null, extra: Partial<AiCallMeta> = {}): AiCallMeta {
    return { provider: "gemini", model: res?.modelVersion || this.model, requestId: res?.responseId ?? null, latencyMs: Date.now() - t0, finishReason: res ? geminiFinish(res).reason : null, usage: res ? usageOf(res) : undefined, ...extra };
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const client = geminiClient(this.apiKey);
    const base = { systemInstruction: req.system, maxOutputTokens: req.maxOutputTokens, responseMimeType: "application/json", httpOptions: HTTP };
    const contents: Content[] = [{ role: "user", parts: [{ text: req.user }] }];
    let schemaMode: "api_schema" | "json_only" = "api_schema";
    await paceRequests("gemini", this.maxRpm);
    let t0 = Date.now();
    let res: RawResponse;
    try {
      res = (await client.models.generateContent({ model: this.model, contents, config: { ...base, responseJsonSchema: toGeminiSchema(z.toJSONSchema(req.schema)) } })) as RawResponse;
    } catch (err) {
      const c = classifyGeminiError(err);
      if (!c.schemaRejected) return { ok: false, status: c.status, error: c.error, meta: this.meta(t0, null) };
      schemaMode = "json_only"; // the API couldn't take our schema; ask for JSON and validate it ourselves
      await paceRequests("gemini", this.maxRpm);
      t0 = Date.now();
      try {
        res = (await client.models.generateContent({ model: this.model, contents, config: base })) as RawResponse;
      } catch (err2) {
        const c2 = classifyGeminiError(err2);
        return { ok: false, status: c2.status, error: c2.error, meta: this.meta(t0, null, { schemaMode }) };
      }
    }
    const f = geminiFinish(res);
    return { ok: true, text: answerText(res.candidates?.[0]?.content), finish: f.finish, refusalDetail: f.refusalDetail, meta: this.meta(t0, res, { schemaMode }) };
  }

  async chatTurn(req: ChatTurnRequest): Promise<ChatTurnResult> {
    const client = geminiClient(this.apiKey);
    await paceRequests("gemini", this.maxRpm);
    const t0 = Date.now();
    let res: RawResponse;
    try {
      res = (await client.models.generateContent({
        model: this.model,
        contents: toContents(req.items),
        config: {
          systemInstruction: req.system.join("\n\n"),
          maxOutputTokens: req.maxOutputTokens,
          tools: req.tools.length ? [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: toGeminiSchema(t.parameters, { forTools: true }) })) }] : undefined,
          httpOptions: HTTP,
        },
      })) as RawResponse;
    } catch (err) {
      const c = classifyGeminiError(err);
      return { ok: false, status: c.status, error: c.error, meta: this.meta(t0, null) };
    }
    const content = res.candidates?.[0]?.content ?? { role: "model", parts: [] };
    const toolCalls: ToolCall[] = (content.parts ?? [])
      .filter((p) => p.functionCall?.name)
      .map((p) => ({ id: p.functionCall!.id || `${GENERATED_ID}${randomUUID()}`, name: p.functionCall!.name!, args: (p.functionCall!.args ?? {}) as Record<string, unknown> }));
    const f = geminiFinish(res);
    return { ok: true, text: answerText(content), toolCalls, finish: toolCalls.length ? "tool_use" : f.finish, raw: { provider: "gemini", content }, meta: this.meta(t0, res) };
  }

  async checkModel() {
    const t0 = Date.now();
    try {
      const m = await geminiClient(this.apiKey).models.get({ model: this.model, config: { httpOptions: HTTP } });
      const canGenerate = !m.supportedActions || m.supportedActions.includes("generateContent");
      if (!canGenerate) return { ok: false as const, status: "failed" as const, error: `Model ${this.model} does not support generateContent`, meta: this.meta(t0, null) };
      return { ok: true as const, detail: `${m.name ?? this.model}${m.displayName ? ` (${m.displayName})` : ""}${m.outputTokenLimit ? `, output limit ${m.outputTokenLimit} tokens` : ""}` };
    } catch (err) {
      const c = classifyGeminiError(err);
      return { ok: false as const, status: c.status, error: c.error, meta: this.meta(t0, null) };
    }
  }
}

/** Build the configured Gemini provider, or null if Gemini isn't the configured, keyed provider. */
export function geminiProviderFromConfig(): GeminiProvider | null {
  const ai = readConfig().ai;
  if (!ai.configured || ai.provider !== "gemini" || !process.env.GEMINI_API_KEY) return null;
  return new GeminiProvider(ai.model, process.env.GEMINI_API_KEY, ai.geminiMaxRpm);
}
