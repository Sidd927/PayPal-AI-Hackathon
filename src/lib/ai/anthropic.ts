import Anthropic from "@anthropic-ai/sdk";
import { readConfig } from "../config";

/**
 * Anthropic SDK client for the optional Claude provider (AI_PROVIDER=anthropic). Business logic should use
 * `getAiProvider()` from ./providers instead of this module.
 */
const g = globalThis as unknown as { __unstuckAnthropic?: Anthropic };

/** Returns a client when Claude is the configured provider with a key; otherwise null. */
export function getAnthropic(): Anthropic | null {
  const ai = readConfig().ai;
  if (!ai.configured || ai.provider !== "anthropic") return null;
  if (!g.__unstuckAnthropic) {
    g.__unstuckAnthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });
  }
  return g.__unstuckAnthropic;
}

/** Test hook. */
export function setAnthropic(client: Anthropic | null) {
  g.__unstuckAnthropic = client ?? undefined;
}

export const FALLBACK_BETA = "server-side-fallback-2026-07-01" as const;

// Provider-neutral helpers moved to ./shared; re-exported for existing imports.
export { consumeAiBudget, quoteUntrusted } from "./shared";
