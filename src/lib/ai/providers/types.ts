/**
 * Provider-independent AI contract. Business logic (diagnosis, the payer assistant, the Insights proxy) talks
 * only to these types; provider SDKs live in the adapters next to this file.
 */
import type { z } from "zod";
import type { AiProviderId } from "../../config";
import type { AiErrorKind } from "../reliability";

/** Normalised token usage. Fields a provider doesn't report are null. */
/** cached_tokens = prompt tokens read from cache; cache_write_tokens = tokens written to cache (Claude only; null for Gemini). */
export type AiUsage = { input_tokens: number | null; output_tokens: number | null; thinking_tokens: number | null; cached_tokens: number | null; cache_write_tokens: number | null };

/** Evidence about one provider call. Never contains request content or credentials. */
export type AiCallMeta = {
  provider: AiProviderId;
  model: string;
  requestId: string | null;
  latencyMs: number;
  /** Provider's own finish/stop reason, verbatim (e.g. "STOP", "MAX_TOKENS", "end_turn"). */
  finishReason?: string | null;
  usage?: AiUsage;
  /** Gemini only: whether the response schema was enforced by the API or only by our validation. */
  schemaMode?: "api_schema" | "json_only";
  /** HTTP attempts made for this call (retries included; 0 if none was sent, e.g. circuit open or budget). */
  attempts?: number;
  /** Wall-clock time including retries, backoff and pacing waits. `latencyMs` is the final attempt only. */
  totalMs?: number;
  /** Classification of the failure (absent on success). */
  errorKind?: AiErrorKind;
  /** HTTP status of the final failed attempt, if any. */
  httpStatus?: number;
};

/** How a completed answer ended, normalised across providers. */
export type AiFinish = "complete" | "truncated" | "refused" | "other";

/** Failure classes shared by every provider. */
export type AiFailure = {
  /**
   * failed: the request didn't complete (auth, model, network, timeout, server, provider paused).
   * rate_limited: 429 / quota. budget_exhausted: AI_DAILY_CALL_LIMIT reached, nothing was sent.
   */
  status: "failed" | "rate_limited" | "budget_exhausted";
  /** Short, owner-readable, credential-free. */
  error: string;
  meta?: AiCallMeta;
};

export type StructuredRequest = {
  system: string;
  user: string;
  /** The application's schema for the answer. Adapters derive the provider's schema form from it; callers still validate. */
  schema: z.ZodType;
  maxOutputTokens: number;
};
export type StructuredResult = ({ ok: true; text: string; finish: AiFinish; refusalDetail?: string; meta: AiCallMeta }) | ({ ok: false } & AiFailure);

/* ------------------------------------------------------------------ */
/* Tool-using conversations                                            */
/* ------------------------------------------------------------------ */

/** `parameters` is JSON Schema. `strict` asks providers that support it to enforce the schema on tool inputs. */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown>; strict?: boolean };
export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
/**
 * A conversation in neutral form. `raw` on an assistant item is the provider's own message content, passed back
 * unchanged to the same provider (it carries thinking blocks / thought signatures that must be echoed).
 */
export type ChatItem =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[]; raw?: { provider: AiProviderId; content: unknown } }
  | { role: "tool_results"; results: { id: string; name: string; output: string; isError?: boolean }[] };

/** `effort` is a hint for providers with an effort control (Claude); others ignore it. */
export type ChatTurnRequest = { system: string[]; items: ChatItem[]; tools: ToolSpec[]; maxOutputTokens: number; effort?: "low" | "medium" | "high" };
export type ChatTurnResult =
  | ({ ok: true; text: string; toolCalls: ToolCall[]; finish: AiFinish | "tool_use"; raw: { provider: AiProviderId; content: unknown }; meta: AiCallMeta })
  | ({ ok: false } & AiFailure);

export interface AiProvider {
  readonly id: AiProviderId;
  /** Display name, e.g. "Gemini". */
  readonly label: string;
  readonly model: string;
  /** One schema-constrained answer (diagnosis). Validation of the answer is done by the caller. */
  generateStructured(req: StructuredRequest): Promise<StructuredResult>;
  /** One turn of a tool-using conversation; the caller runs the tools and the loop. */
  chatTurn(req: ChatTurnRequest): Promise<ChatTurnResult>;
  /** Confirm the configured model exists for this key (a metadata call; not billed as generation). */
  checkModel(): Promise<{ ok: true; detail: string } | ({ ok: false } & AiFailure)>;
}
