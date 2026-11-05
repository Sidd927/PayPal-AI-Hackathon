/**
 * Anthropic Claude adapter (optional; AI_PROVIDER=anthropic). This is the Phase 1–2 Claude implementation moved
 * behind the provider interface, unchanged in behaviour: structured output via the SDK's zod helper passed to
 * create() (so a cut-off answer is detected before parsing), server-side refusal fallbacks, a bounded
 * per-request timeout and one retry.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readConfig } from "../../config";
import { FALLBACK_BETA, getAnthropic } from "../anthropic";
import { safeErrorText } from "../shared";
import type { AiCallMeta, AiFailure, AiFinish, AiProvider, ChatItem, ChatTurnRequest, ChatTurnResult, StructuredRequest, StructuredResult, ToolCall } from "./types";

const REQUEST_OPTIONS = { timeout: 120_000, maxRetries: 1 } as const;

export function classifyAnthropicError(err: unknown): Omit<AiFailure, "meta"> {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: "failed", error: "AI request failed: Claude did not respond in time" };
  if (err instanceof Anthropic.APIConnectionError) return { status: "failed", error: "AI request failed: could not reach the Claude API" };
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { type?: string } } | undefined;
    const type = body?.error?.type;
    const head = `HTTP ${err.status ?? "?"}${type ? ` ${type}` : ""}`;
    const rid = err.requestID ? `, request id ${err.requestID}` : "";
    if (err.status === 429) return { status: "rate_limited", error: safeErrorText(`AI rate limited: ${head}${rid}`) };
    const hint = err.status === 401 ? " (check ANTHROPIC_API_KEY)" : err.status === 404 ? " (check ANTHROPIC_MODEL)" : "";
    return { status: "failed", error: safeErrorText(`AI request failed: ${head}${hint}${rid}`) };
  }
  return { status: "failed", error: safeErrorText(`AI request failed: ${(err as Error)?.message ?? "unknown error"}`) };
}

type RawMessage = { model: string; stop_reason?: string | null; stop_details?: { category?: string | null } | null; content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[]; usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } };

function finishOf(stop: string | null | undefined): AiFinish {
  return stop === "end_turn" ? "complete" : stop === "max_tokens" ? "truncated" : stop === "refusal" ? "refused" : "other";
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  readonly label = "Claude";
  constructor(
    readonly model: string,
    private readonly effort: "low" | "medium" | "high",
  ) {}

  private meta(t0: number, res: RawMessage | null, requestId: string | null = null): AiCallMeta {
    const u = res?.usage;
    return {
      provider: "anthropic",
      model: res?.model ?? this.model,
      requestId: (res as { _request_id?: string | null } | null)?._request_id ?? requestId,
      latencyMs: Date.now() - t0,
      finishReason: res?.stop_reason ?? null,
      usage: u ? { input_tokens: u.input_tokens, output_tokens: u.output_tokens, thinking_tokens: null, cached_tokens: u.cache_read_input_tokens ?? null, cache_write_tokens: u.cache_creation_input_tokens ?? null } : undefined,
    };
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const client = getAnthropic()!;
    const { parse: _sdkParse, ...format } = betaZodOutputFormat(req.schema as never);
    const t0 = Date.now();
    let res: RawMessage;
    try {
      res = (await client.beta.messages.create(
        {
          model: this.model,
          max_tokens: req.maxOutputTokens,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: this.effort, format },
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: req.user }],
        },
        REQUEST_OPTIONS,
      )) as unknown as RawMessage;
    } catch (err) {
      const c = classifyAnthropicError(err);
      return { ok: false, ...c, meta: this.meta(t0, null, err instanceof Anthropic.APIError ? (err.requestID ?? null) : null) };
    }
    const text = (res.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const finish = finishOf(res.stop_reason);
    return { ok: true, text, finish, refusalDetail: finish === "refused" ? (res.stop_details?.category ?? undefined) : undefined, meta: this.meta(t0, res) };
  }

  async chatTurn(req: ChatTurnRequest): Promise<ChatTurnResult> {
    const client = getAnthropic()!;
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    const push = (role: "user" | "assistant", blocks: Anthropic.Beta.BetaContentBlockParam[]) => {
      const last = messages.at(-1);
      if (last && last.role === role && Array.isArray(last.content)) (last.content as Anthropic.Beta.BetaContentBlockParam[]).push(...blocks);
      else messages.push({ role, content: blocks });
    };
    for (const it of req.items as ChatItem[]) {
      if (it.role === "user") push("user", [{ type: "text", text: it.text }]);
      else if (it.role === "assistant") {
        if (it.raw?.provider === "anthropic") push("assistant", it.raw.content as Anthropic.Beta.BetaContentBlockParam[]);
        else push("assistant", [...(it.text ? [{ type: "text" as const, text: it.text }] : []), ...it.toolCalls.map((tc) => ({ type: "tool_use" as const, id: tc.id, name: tc.name, input: tc.args }))]);
      } else push("user", it.results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.output, ...(r.isError ? { is_error: true } : {}) })));
    }
    if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: "(continue)" });
    const t0 = Date.now();
    let res: RawMessage;
    try {
      res = (await client.beta.messages.create(
        {
          model: this.model,
          max_tokens: req.maxOutputTokens,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: req.effort ?? "low" },
          system: req.system.map((text, i) => ({ type: "text" as const, text, ...(i === 0 ? { cache_control: { type: "ephemeral" as const } } : {}) })),
          tools: req.tools.map((t) => ({ name: t.name, description: t.description, ...(t.strict ? { strict: true } : {}), input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema })),
          messages,
        },
        REQUEST_OPTIONS,
      )) as unknown as RawMessage;
    } catch (err) {
      const c = classifyAnthropicError(err);
      return { ok: false, ...c, meta: this.meta(t0, null, err instanceof Anthropic.APIError ? (err.requestID ?? null) : null) };
    }
    const toolCalls: ToolCall[] = (res.content ?? []).filter((b) => b.type === "tool_use").map((b) => ({ id: b.id!, name: b.name!, args: (b.input ?? {}) as Record<string, unknown> }));
    const text = (res.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n").trim();
    const finish = res.stop_reason === "tool_use" && toolCalls.length ? "tool_use" : finishOf(res.stop_reason);
    return { ok: true, text, toolCalls, finish, raw: { provider: "anthropic", content: res.content }, meta: this.meta(t0, res) };
  }

  async checkModel() {
    const t0 = Date.now();
    try {
      const m = await getAnthropic()!.models.retrieve(this.model);
      return { ok: true as const, detail: `${m.id}${m.display_name ? ` (${m.display_name})` : ""}` };
    } catch (err) {
      return { ok: false as const, ...classifyAnthropicError(err), meta: this.meta(t0, null) };
    }
  }
}

export function anthropicProviderFromConfig(): AnthropicProvider | null {
  const ai = readConfig().ai;
  if (!ai.configured || ai.provider !== "anthropic" || !getAnthropic()) return null;
  return new AnthropicProvider(ai.model, ai.effort);
}
