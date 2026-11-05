/**
 * Owner-facing wording for how a diagnosis was produced. Shared by the board and the invoice drawer so a
 * rules diagnosis never claims "AI not configured" when the real cause was a failed or unusable Claude call.
 * Client-safe: no server imports.
 */
export type AiStatusValue = "used" | "not_configured" | "budget_exhausted" | "failed" | "unusable" | null;

export function describeAiStatus(source: "ai" | "rules" | null, status: AiStatusValue, model?: string | null): { short: string; long: string; problem: boolean } {
  if (source === "ai") return { short: "Claude", long: model ? `by ${model}` : "by Claude", problem: false };
  switch (status) {
    case "not_configured":
      return { short: "rules only", long: "rules only (AI not configured)", problem: false };
    case "budget_exhausted":
      return { short: "rules: AI limit reached", long: "rules fallback (daily AI limit reached)", problem: true };
    case "failed":
      return { short: "AI failed, rules used", long: "rules fallback (the Claude request failed)", problem: true };
    case "unusable":
      return { short: "AI unusable, rules used", long: "rules fallback (Claude's answer couldn't be used)", problem: true };
    default:
      // Rows written before the AI status was recorded: don't guess why.
      return { short: "rules only", long: "rules only", problem: false };
  }
}
