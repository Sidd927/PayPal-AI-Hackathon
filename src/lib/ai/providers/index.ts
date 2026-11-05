/** Provider registry: the one place that knows which adapter serves the configured AI_PROVIDER. */
import { readConfig } from "../../config";
import { anthropicProviderFromConfig } from "./anthropic";
import { geminiProviderFromConfig } from "./gemini";
import type { AiProvider } from "./types";

export type { AiProvider } from "./types";

/** The configured provider, or null when AI is not configured (no key, turned off, or unknown provider). */
export function getAiProvider(): AiProvider | null {
  const ai = readConfig().ai;
  if (!ai.configured) return null;
  return ai.provider === "gemini" ? geminiProviderFromConfig() : anthropicProviderFromConfig();
}
