import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../db";
import { readConfig } from "../config";

const g = globalThis as unknown as { __unstuckAnthropic?: Anthropic };

/** Returns a configured client, or null when no API key is set (the app then runs in rules-only mode). */
export function getAnthropic(): Anthropic | null {
  if (!readConfig().ai.configured) return null;
  if (!g.__unstuckAnthropic) {
    g.__unstuckAnthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });
  }
  return g.__unstuckAnthropic;
}

/** Test hook. */
export function setAnthropic(client: Anthropic | null) {
  g.__unstuckAnthropic = client ?? undefined;
}

/** Simple daily guard against runaway spend. */
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

export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;
