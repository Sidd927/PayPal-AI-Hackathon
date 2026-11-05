/**
 * Translation between AG Studio's LLM-adapter items and the provider-neutral conversation, plus a short-lived
 * cache of the provider's raw message content (see below). Used by /api/insights/llm.
 */
import { createHash } from "node:crypto";
import type { ChatItem, ToolCall } from "./providers/types";

export type Item = { type: string; role?: string; content?: { type: string; text?: string }[]; callId?: string; name?: string; arguments?: string; output?: string };
export type StudioRequest = { input: Item[]; instructions?: string; tools?: { name: string; description: string; parameters: Record<string, unknown> }[]; toolChoice?: unknown };

/**
 * AG Studio's protocol is stateless: it replays only its own items, not the provider's raw message content. Some
 * providers require that content back unchanged during tool use (Gemini thought signatures, Claude thinking
 * blocks), so it is kept here briefly and restored when Studio replays that turn. The raw content never leaves
 * the server.
 *
 * Isolation and integrity:
 * - Entries are scoped to one conversation (a hash of its opening user message) and keyed by the provider's
 *   call id, which is random and only ever returned to the client that made the request.
 * - An entry is restored only if the replayed turn has exactly the same calls (ids, names and arguments) as the
 *   cached one, so a forged or edited call can't pick up another turn's content.
 * - Expired entries (30 minutes) are never served; at most 500 are kept (oldest evicted first).
 * - Process-local: a miss (restart, expiry, another instance) just sends the neutral form.
 * Node runs these synchronous operations one at a time, so concurrent requests can't interleave inside them.
 */
export const RAW_TTL_MS = 30 * 60_000;
export const RAW_MAX_ENTRIES = 500;
type Entry = { provider: string; content: unknown; calls: string; at: number };
const rawCache = new Map<string, Entry>();

/** Stable JSON (sorted keys) so argument comparison doesn't depend on key order. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
const callsSignature = (calls: ToolCall[]) => stable(calls.map((c) => [c.id, c.name, c.args ?? {}]));

/** Conversation scope: a hash of the first user message Studio sends (stable across the turns of one chat). */
export function conversationScope(items: Item[]): string {
  const first = (items ?? []).find((it) => it.type === "message" && it.role !== "assistant");
  const text = (first?.content ?? []).map((c) => c.text ?? "").join("\n");
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function sweep(now: number) {
  for (const [k, v] of rawCache) if (now - v.at > RAW_TTL_MS) rawCache.delete(k);
}

export function rememberRaw(scope: string, calls: ToolCall[], raw: { provider: string; content: unknown }) {
  if (!calls.length) return;
  const now = Date.now();
  sweep(now);
  const entry: Entry = { ...raw, calls: callsSignature(calls), at: now };
  for (const c of calls) {
    const key = `${scope}:${c.id}`;
    rawCache.delete(key); // re-insert so eviction order follows recency
    rawCache.set(key, entry);
  }
  while (rawCache.size > RAW_MAX_ENTRIES) rawCache.delete(rawCache.keys().next().value!);
}

function restoreRaw(scope: string, provider: string, calls: ToolCall[]): Entry | null {
  if (!calls.length) return null;
  const key = `${scope}:${calls[0]!.id}`;
  const e = rawCache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > RAW_TTL_MS) {
    rawCache.delete(key);
    return null;
  }
  if (e.provider !== provider || e.calls !== callsSignature(calls)) return null;
  return e;
}

/** Test hooks. */
export function rawCacheSize() {
  return rawCache.size;
}
export function clearRawCache() {
  rawCache.clear();
}

/** Translate Studio items into the provider-neutral conversation. */
export function studioItemsToChat(items: Item[], provider: string, scope = conversationScope(items)): ChatItem[] {
  const out: ChatItem[] = [];
  let pending: Extract<ChatItem, { role: "assistant" }> | null = null;
  const flush = () => {
    if (!pending) return;
    const cached = restoreRaw(scope, provider, pending.toolCalls);
    if (cached) pending.raw = { provider: cached.provider as "gemini" | "anthropic", content: cached.content };
    out.push(pending);
    pending = null;
  };
  for (const it of items ?? []) {
    if (it.type === "message") {
      const text = (it.content ?? []).map((c) => c.text ?? "").join("\n");
      if (!text) continue;
      if (it.role === "assistant") {
        if (pending && pending.toolCalls.length) flush();
        pending = pending ?? { role: "assistant", text: "", toolCalls: [] };
        pending.text = pending.text ? `${pending.text}\n${text}` : text;
      } else {
        flush();
        const last = out.at(-1);
        if (last?.role === "user") last.text = `${last.text}\n${text}`;
        else out.push({ role: "user", text });
      }
    } else if (it.type === "function_call" && it.callId && it.name) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(it.arguments || "{}");
      } catch {}
      pending = pending ?? { role: "assistant", text: "", toolCalls: [] };
      pending.toolCalls.push({ id: it.callId, name: it.name, args });
    } else if (it.type === "function_call_output" && it.callId) {
      const callName = [...out, ...(pending ? [pending] : [])].flatMap((x) => (x.role === "assistant" ? x.toolCalls : [])).find((c) => c.id === it.callId)?.name ?? "tool";
      flush();
      const last = out.at(-1);
      const result = { id: it.callId, name: callName, output: String(it.output ?? "") };
      if (last?.role === "tool_results") last.results.push(result);
      else out.push({ role: "tool_results", results: [result] });
    }
  }
  flush();
  if (out[0]?.role !== "user") out.unshift({ role: "user", text: "(continue)" });
  return out;
}
