/**
 * Owner-facing wording for how a diagnosis was produced, shared by the board, the invoice drawer and Activity.
 * Provider-aware: names the actual provider when AI was used, and never claims AI was used for a fallback.
 * Client-safe: no server imports.
 */
export type AiStatusValue = "used" | "not_configured" | "budget_exhausted" | "rate_limited" | "failed" | "unusable" | null;

const PROVIDER_LABEL: Record<string, string> = { gemini: "Gemini", anthropic: "Claude" };
export function providerLabel(provider: string | null | undefined): string {
  return (provider && PROVIDER_LABEL[provider]) || "AI";
}

export function describeAiStatus(
  source: "ai" | "rules" | null,
  status: AiStatusValue,
  model?: string | null,
  provider?: string | null,
): { short: string; long: string; badge: string; problem: boolean } {
  const label = providerLabel(provider);
  if (source === "ai") return { short: label === "AI" ? "AI" : label, long: model ? `by ${label} (${model})` : `by ${label}`, badge: `AI: ${label}`, problem: false };
  switch (status) {
    case "not_configured":
      return { short: "rules only", long: "rules only (AI not configured)", badge: "AI: Not configured", problem: false };
    case "budget_exhausted":
      return { short: "AI limit reached, rules used", long: "rules fallback (daily AI limit reached)", badge: "AI: Daily limit reached", problem: true };
    case "rate_limited":
      return { short: "AI rate limited, rules used", long: `rules fallback (${label} rate limited)`, badge: "AI: Rate limited", problem: true };
    case "failed":
      return { short: "AI failed, rules used", long: `rules fallback (the ${label} request failed)`, badge: "AI: Request failed", problem: true };
    case "unusable":
      return { short: "AI answer invalid, rules used", long: `rules fallback (${label} returned an invalid response)`, badge: "AI: Invalid response", problem: true };
    default:
      // Rows written before the AI status was recorded: don't guess why.
      return { short: "rules only", long: "rules only", badge: "AI: Rules fallback", problem: false };
  }
}
