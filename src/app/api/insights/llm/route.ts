import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { consumeAiBudget } from "@/lib/ai/shared";
import { getAiProvider } from "@/lib/ai/providers";
import { conversationScope, rememberRaw, studioItemsToChat, type StudioRequest } from "@/lib/ai/studio-chat";
import { safeErrorText } from "@/lib/ai/shared";
import type { ChatTurnResult } from "@/lib/ai/providers/types";
import { readConfig } from "@/lib/config";

export const maxDuration = 120;

/**
 * One LLM turn for AG Studio's built-in agents (AgLlmAdapter protocol), served by the configured AI provider.
 * Owner-only (proxy), same-origin, budget-limited; the agents only see report metadata and query results
 * that Studio's own tools produce from the read-only Insights tables. The provider runs no tools here.
 */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const provider = getAiProvider();
  const ai = readConfig().ai;
  if (!provider) return json({ error: `AI is not configured on this server (set ${ai.keyVariable}). The Unstuck Insights agent still works.` }, 503);
  if (!consumeAiBudget()) return json({ error: "Daily AI call limit reached" }, 429);
  const body = await readJson<StudioRequest>(req, 1_000_000); // Studio sends the report schema and query results each turn

  const scope = conversationScope(body.input);
  let res: ChatTurnResult;
  try {
    res = await provider.chatTurn({
      system: [body.instructions ?? "You help a small-business owner analyse receivables in AG Studio."],
      items: studioItemsToChat(body.input, provider.id, scope),
      tools: (body.tools ?? []).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
      maxOutputTokens: 8000,
      effort: "low",
    });
  } catch (e) {
    // Adapters return errors as values; this only catches the unexpected, with the same safe wording.
    return json({ error: safeErrorText(`AI request failed: ${(e as Error)?.message ?? "unknown error"}`) }, 502);
  }
  if (!res.ok) return json({ error: res.error }, res.status === "rate_limited" ? 429 : 502);
  rememberRaw(scope, res.toolCalls, res.raw); // server-side only; never part of the response

  const id = res.meta.requestId ?? `turn_${Date.now().toString(36)}`;
  const output: Record<string, unknown>[] = [
    ...(res.text ? [{ id: `msg_${id}`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: res.text, annotations: [] }] }] : []),
    ...res.toolCalls.map((c) => ({ id: `fc_${c.id}`, kind: "output", type: "function_call", callId: c.id, name: c.name, arguments: JSON.stringify(c.args ?? {}), status: "completed" })),
  ];
  return json({
    id,
    createdAt: Date.now(),
    status: res.finish === "refused" ? "failed" : res.finish === "truncated" ? "incomplete" : "completed",
    ...(res.finish === "refused" ? { error: { code: "refusal", message: `${provider.label} declined this request.` } } : {}),
    output,
    model: res.meta.model,
    provider: provider.id,
    usage: { inputTokens: res.meta.usage?.input_tokens ?? 0, outputTokens: res.meta.usage?.output_tokens ?? 0 },
  });
});
