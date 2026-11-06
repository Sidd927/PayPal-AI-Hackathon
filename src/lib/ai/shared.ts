/** Provider-neutral AI plumbing: daily budget, untrusted-text quoting, error redaction, pacing. */
import { getDb } from "../db";
import { readConfig } from "../config";

/** Daily guard against runaway spend: one unit per HTTP attempt to the provider (retries count), any provider. Charged by ./reliability. */
export function consumeAiBudget(): boolean {
  const limit = readConfig().ai.dailyCallLimit;
  const day = new Date().toISOString().slice(0, 10);
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM settings WHERE key = 'ai_usage'").get() as { value_json: string } | undefined;
  const usage = row ? (JSON.parse(row.value_json) as { day: string; calls: number }) : { day, calls: 0 };
  const current = usage.day === day ? usage.calls : 0;
  if (current >= limit) return false;
  db.prepare("INSERT INTO settings (key, value_json) VALUES ('ai_usage', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").run(JSON.stringify({ day, calls: current + 1 }));
  return true;
}

/** Wrap untrusted, client-authored text so the model treats it as data. */
export function quoteUntrusted(tag: string, text: string): string {
  const safe = text.replace(/<\/?(client_message|invoice_facts|history)[^>]*>/gi, "");
  return `<${tag}>\n${safe}\n</${tag}>`;
}

/** Keep error text short and free of anything that looks like a credential (Anthropic or Google keys, auth headers, key= params). */
export function safeErrorText(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_\-]+/g, "[redacted]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[redacted]")
    .replace(/([?&](key|api_key|apikey)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(x-api-key|x-goog-api-key|authorization)\s*[:=]\s*\S+/gi, "$1: [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Minimum spacing between request starts, process-wide per key (e.g. "gemini"). Every HTTP attempt to the provider
 * takes a slot (the retry runner in ./reliability calls this before each attempt), so the configured
 * requests-per-minute holds for retries too. Kept on globalThis so dev reloads or duplicated module instances
 * can't reset it.
 */
const pacing = ((globalThis as unknown as { __unstuckPacing?: Map<string, number> }).__unstuckPacing ??= new Map<string, number>());
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export async function paceRequests(key: string, perMinute: number, sleep: (ms: number) => Promise<void> = realSleep) {
  const gap = Math.ceil(60_000 / perMinute);
  const now = Date.now();
  const slot = Math.max(now, pacing.get(key) ?? 0);
  pacing.set(key, slot + gap);
  if (slot > now) await sleep(slot - now);
}
/** How long the next request for `key` would wait for its slot (no reservation). */
export function pacingWaitMs(key: string): number {
  return Math.max(0, (pacing.get(key) ?? 0) - Date.now());
}
/** Push the next slot for `key` to at least `untilMs` (a provider asked everyone to wait, e.g. a 429 RetryInfo). */
export function deferPacing(key: string, untilMs: number) {
  pacing.set(key, Math.max(pacing.get(key) ?? 0, untilMs));
}
/** Test hook. */
export function resetPacing() {
  pacing.clear();
}
