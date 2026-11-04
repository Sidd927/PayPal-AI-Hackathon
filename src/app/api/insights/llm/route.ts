import type Anthropic from "@anthropic-ai/sdk";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { consumeAiBudget, FALLBACK_BETA, getAnthropic } from "@/lib/ai/anthropic";
import { readConfig } from "@/lib/config";

export const maxDuration = 120;

type Item = { type: string; role?: string; content?: { type: string; text?: string }[]; callId?: string; name?: string; arguments?: string; output?: string };
type Req = { input: Item[]; instructions?: string; tools?: { name: string; description: string; parameters: Record<string, unknown> }[]; toolChoice?: unknown };

/**
 * One LLM turn for AG Studio's built-in agents (AgLlmAdapter protocol), served by Claude.
 * Owner-only (proxy), same-origin, budget-limited; the agents only see report metadata and query results
 * that Studio's own tools produce from the read-only Insights tables.
 */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const client = getAnthropic();
  if (!client) return json({ error: "Claude is not configured on this server (ANTHROPIC_API_KEY). The Unstuck Insights agent still works." }, 503);
  if (!consumeAiBudget()) return json({ error: "Daily AI call limit reached" }, 429);
  const body = await readJson<Req>(req, 1_000_000); // Studio sends the report schema and query results each turn

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  const push = (role: "user" | "assistant", block: Anthropic.Beta.BetaContentBlockParam) => {
    const last = messages.at(-1);
    if (last && last.role === role && Array.isArray(last.content)) (last.content as Anthropic.Beta.BetaContentBlockParam[]).push(block);
    else messages.push({ role, content: [block] });
  };
  for (const it of body.input ?? []) {
    if (it.type === "message") {
      const text = (it.content ?? []).map((c) => c.text ?? "").join("\n");
      if (text) push(it.role === "assistant" ? "assistant" : "user", { type: "text", text });
    } else if (it.type === "function_call" && it.callId && it.name) {
      let input: unknown = {};
      try {
        input = JSON.parse(it.arguments || "{}");
      } catch {}
      push("assistant", { type: "tool_use", id: it.callId, name: it.name, input });
    } else if (it.type === "function_call_output" && it.callId) {
      push("user", { type: "tool_result", tool_use_id: it.callId, content: String(it.output ?? "") });
    }
  }
  if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: "(continue)" });

  const res = await client.beta.messages.create({
    model: readConfig().ai.model,
    max_tokens: 8000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: body.instructions ?? "You help a small-business owner analyse receivables in AG Studio." }],
    tools: (body.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema })),
    messages,
  });

  const output = res.content.flatMap((b): Record<string, unknown>[] =>
    b.type === "text"
      ? [{ id: `msg_${res.id}_${Math.random().toString(36).slice(2, 7)}`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: b.text, annotations: [] }] }]
      : b.type === "tool_use"
        ? [{ id: `fc_${b.id}`, kind: "output", type: "function_call", callId: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}), status: "completed" }]
        : [],
  );
  return json({
    id: res.id,
    createdAt: Date.now(),
    status: res.stop_reason === "refusal" ? "failed" : res.stop_reason === "max_tokens" ? "incomplete" : "completed",
    ...(res.stop_reason === "refusal" ? { error: { code: "refusal", message: "The model declined this request." } } : {}),
    output,
    model: res.model,
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  });
});
