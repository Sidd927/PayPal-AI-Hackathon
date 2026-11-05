/** Provider-neutral AI plumbing: daily budget, untrusted-text quoting, error redaction, pacing. */
import { getDb } from "../db";
import { readConfig } from "../config";

/** Simple daily guard against runaway spend. One unit per logical AI request, whichever provider. */
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
 * Minimum spacing between request starts, process-wide per key (e.g. "gemini"). Keeps a free tier's
 * requests-per-minute limit from being exceeded by concurrent agent runs or the eval loop.
 */
const nextSlot = new Map<string, number>();
export async function paceRequests(key: string, perMinute: number, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const gap = Math.ceil(60_000 / perMinute);
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(key) ?? 0);
  nextSlot.set(key, slot + gap);
  if (slot > now) await sleep(slot - now);
}
/** Test hook. */
export function resetPacing() {
  nextSlot.clear();
}
