import { type DiagnosisRow, repo } from "../db";
import { AI_PROVIDER_LABEL, readConfig } from "../config";
import { ACTION_META, isOpenStatus } from "../domain";
import { diagnose, type DiagnosisResult, hashInput, proposalsFromDiagnosis } from "../ai/diagnosis";
import { buildDiagnosisInput, policyContextFor, resolutionUrl } from "./invoices";
import { proposeAction } from "./actions";
import { withLock } from "../locks";
import { NOT_SENT_PREFIX } from "../ai/reliability";

export type StepFn = (s: { kind: string; label: string; detail?: string; status: "ok" | "info" | "warn" | "error" | "skip" }) => void;

/** A failed or unusable AI attempt is retried for unchanged inputs only after this long (avoids hammering the API). */
export const AI_RETRY_COOLDOWN_MS = 30 * 60_000;

/**
 * Should the latest diagnosis be reused, or should we diagnose again?
 * - force, or inputs changed: diagnose again.
 * - An AI diagnosis with unchanged inputs: reuse (no API call).
 * - A rules diagnosis with unchanged inputs: reuse while AI is unavailable; once AI is available, retry with AI
 *   (rules-only because unconfigured: retry now; daily limit hit: retry on a new day; failed/unusable: retry after
 *   a cooldown). `aiRetry` means "only a better (AI) answer is worth replacing the current one".
 */
export function reuseDecision(
  latest: Pick<DiagnosisRow, "source" | "input_hash" | "ai_status" | "ai_attempted_at" | "created_at"> & { ai_detail?: string | null } | undefined,
  inputHash: string,
  opts: { force?: boolean; aiConfigured: boolean; now?: number },
): { reuse: true; why: string } | { reuse: false; aiRetry: boolean; why: string } {
  if (opts.force) return { reuse: false, aiRetry: false, why: "Diagnosing again on request" };
  if (!latest || latest.input_hash !== inputHash) return { reuse: false, aiRetry: false, why: latest ? "Something changed since the last diagnosis" : "First diagnosis" };
  if (latest.source === "ai") return { reuse: true, why: "Nothing new since the last AI diagnosis" };
  if (!opts.aiConfigured) return { reuse: true, why: "Nothing new since the last diagnosis" };
  const now = opts.now ?? Date.now();
  const attempted = Date.parse(latest.ai_attempted_at ?? latest.created_at);
  switch (latest.ai_status) {
    case null:
    case "not_configured":
      return { reuse: false, aiRetry: true, why: "AI is now available; upgrading the rules-only diagnosis" };
    case "budget_exhausted":
      return new Date(now).toISOString().slice(0, 10) !== new Date(attempted).toISOString().slice(0, 10)
        ? { reuse: false, aiRetry: true, why: "New day: retrying with AI" }
        : { reuse: true, why: "Daily AI limit was reached; keeping the rules diagnosis until tomorrow" };
    case "failed":
    case "unusable":
    case "rate_limited":
      // Nothing was sent (provider paused, or our own queue was full): no request to back off from, so the next run
      // may try again. While the pause lasts that retry fails at once, sending and charging nothing.
      if (latest.ai_detail?.startsWith(NOT_SENT_PREFIX)) return { reuse: false, aiRetry: true, why: "Retrying AI: the last attempt was never sent" };
      return now - attempted >= AI_RETRY_COOLDOWN_MS
        ? { reuse: false, aiRetry: true, why: "Retrying AI after an earlier failure" }
        : { reuse: true, why: latest.ai_status === "rate_limited" ? "AI was rate limited recently; keeping the rules diagnosis for now" : "AI failed recently; keeping the rules diagnosis for now" };
    default:
      return { reuse: true, why: "Nothing new since the last diagnosis" };
  }
}

/** One line describing who produced a diagnosis, for traces and Activity. Names the real provider and model. */
export function aiLine(r: Pick<DiagnosisResult, "source" | "model" | "ai" | "error" | "provider">): string {
  const label = r.provider ? AI_PROVIDER_LABEL[r.provider] : "AI";
  if (r.source === "ai") return `${label} (${r.model})`;
  switch (r.ai) {
    case "not_configured":
      return r.error ? `Rules only: ${r.error}` : "Rules only: AI not configured";
    case "budget_exhausted":
      return "Rules fallback: daily AI limit reached";
    case "rate_limited":
      return `Rules fallback: ${label} rate limited. ${r.error ?? ""}`.trim();
    default:
      return `Rules fallback: ${label} ${r.ai === "unusable" ? "returned an invalid response" : "request failed"}. ${r.error ?? ""}`.trim();
  }
}

/**
 * Provider evidence kept on Activity events: provider, model, request id, latency of the final attempt, total time
 * including retries and waits, attempts, usage, and (on failure) the error class and HTTP status. No content, no keys.
 */
function evidenceData(r: DiagnosisResult) {
  const m = r.meta;
  return {
    provider: m?.provider ?? r.provider,
    model: m?.model ?? r.model,
    request_id: m?.requestId ?? null,
    latency_ms: m?.latencyMs ?? null,
    total_ms: m?.totalMs ?? null,
    attempts: m?.attempts ?? null,
    usage: m?.usage ?? null,
    finish_reason: m?.finishReason ?? null,
    // Gemini: "api_schema" when the API enforced the response schema, "json_only" when it rejected the schema and
    // Unstuck fell back to plain JSON (still validated by Unstuck's own schema).
    schema_mode: m?.schemaMode ?? null,
    ...(m?.errorKind ? { error_kind: m.errorKind, http_status: m.httpStatus ?? null } : {}),
  };
}

/**
 * Diagnose one invoice. Calls for the same invoice run one at a time (agent run, "Diagnose all" and "Diagnose
 * again" can overlap): a second caller waits, then sees the first one's result (reused unless forced), instead of
 * making a duplicate AI call and proposing (and possibly auto-executing) the same action twice.
 */
export function diagnoseInvoice(invoiceId: string, opts: { force?: boolean; onStep?: StepFn } = {}) {
  return withLock(`diagnose:${invoiceId}`, () => diagnoseInvoiceUnlocked(invoiceId, opts));
}

async function diagnoseInvoiceUnlocked(invoiceId: string, opts: { force?: boolean; onStep?: StepFn }) {
  const step: StepFn = opts.onStep ?? (() => {});
  const row = repo.getInvoice(invoiceId);
  if (!row) throw new Error("Invoice not found");
  if (!isOpenStatus(row.status)) return { skipped: true as const, reason: `Invoice is ${row.status}` };
  const policy = repo.getPolicy();
  const input = buildDiagnosisInput(row, policy);
  const inputHash = hashInput(input);
  const latest = repo.latestDiagnosis(invoiceId);
  step({ kind: "gather", label: "Gathered evidence", detail: `${input.messages.length} message(s), ${input.history.previous_invoices} past invoice(s), ${input.reminders.sent} reminder(s)${input.commitments.promise_missed ? ", missed promise" : ""}`, status: "info" });
  const decision = reuseDecision(latest, inputHash, { force: opts.force, aiConfigured: readConfig().ai.configured });
  if (decision.reuse) {
    step({ kind: "diagnose", label: decision.why, detail: `Still “${latest!.reason.replace("_", " ")}”`, status: "skip" });
    return { skipped: true as const, reason: decision.why, diagnosisId: latest!.id };
  }

  const t0 = Date.now();
  const result = await diagnose(input);
  const took = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const bad = result.ai === "failed" || result.ai === "unusable" || result.ai === "budget_exhausted" || result.ai === "rate_limited";

  // An AI retry for unchanged inputs only matters if the AI answered. Otherwise keep the existing diagnosis and
  // its pending actions untouched (no churn, no re-proposed actions) and just record the attempt.
  if (decision.aiRetry && result.source !== "ai" && latest) {
    repo.recordAiAttempt(latest.id, { status: result.ai, detail: result.error ?? null, provider: result.provider });
    step({ kind: "diagnose", label: "Kept the previous diagnosis", detail: `${aiLine(result)} (${took})`, status: bad ? "warn" : "skip" });
    if (bad) repo.logEvent({ invoice_id: invoiceId, kind: "ai_retry_failed", actor: "ai", summary: `The AI couldn't re-diagnose this invoice; kept the earlier rules diagnosis. ${aiLine(result)}`.trim(), data: { diagnosis_id: latest.id, ai_status: result.ai, ...evidenceData(result) } });
    return { skipped: true as const, reason: "AI retry did not produce a diagnosis", diagnosisId: latest.id, aiFallback: bad };
  }

  step({
    kind: "diagnose",
    label: `Diagnosed: ${result.output.reason.replace("_", " ")} (${Math.round(result.output.confidence * 100)}%)`,
    detail: `${aiLine(result)} in ${took}`,
    status: bad ? "warn" : "ok",
  });
  const o = result.output;
  const diagnosisId = repo.addDiagnosis({
    invoice_id: invoiceId,
    reason: o.reason,
    confidence: o.confidence,
    summary: o.summary,
    evidence_json: JSON.stringify(o.evidence),
    extracted_json: JSON.stringify(o.extracted),
    recommendation_json: JSON.stringify({ action: o.recommended_action, rationale: o.rationale, message: o.message, plan: o.plan, discount_percent: o.discount_percent, tone: o.tone, inference: o.inference, expected_outcome: o.expected_outcome, risks: o.risks, alternatives: o.alternatives }),
    source: result.source,
    model: result.model,
    input_hash: inputHash,
    ai_status: result.ai,
    ai_detail: result.error ?? null,
    ai_provider: result.provider,
  });
  repo.logEvent({
    invoice_id: invoiceId,
    kind: "diagnosed",
    actor: result.source === "ai" ? "ai" : "rules",
    summary: `Diagnosed as “${o.reason.replace("_", " ")}” (${Math.round(o.confidence * 100)}% confidence). ${aiLine(result)}`,
    data: { diagnosis_id: diagnosisId, source: result.source, ai_status: result.ai, error: result.error, ...evidenceData(result) },
  });
  if (o.reason === "dispute") repo.setDisputed(invoiceId, true);
  else if (row.disputed && o.reason !== "unknown") repo.setDisputed(invoiceId, false);

  repo.supersedeProposals(invoiceId);
  const fresh = repo.getInvoice(invoiceId)!;
  const proposals = proposalsFromDiagnosis(o, { ...policyContextFor(fresh), resolutionUrl: resolutionUrl(fresh.payer_token), invoiceDueDate: fresh.due_date }, policy);
  step({ kind: "plan", label: `Planned: ${proposals.map((p) => ACTION_META[p.type].label).join(" + ") || "no action"}`, detail: o.rationale, status: "info" });
  const actions = [];
  for (const p of proposals) {
    const a = await proposeAction(invoiceId, p, { diagnosisId });
    actions.push(a);
    const decided = a.decision === "auto" ? "inside your rules" : a.decision === "approve" ? "needs your approval" : "blocked by your rules";
    step({ kind: "policy", label: `${ACTION_META[a.type].label}: ${decided}`, detail: a.reasons.join("; "), status: a.decision === "block" ? "warn" : "info" });
    if (a.status === "executed") {
      const r = a.result as { summary?: string; receipts?: { operation: string; status: number; simulated?: boolean }[] } | null;
      step({ kind: "act", label: r?.summary ?? "Executed", detail: r?.receipts?.map((x) => `${x.simulated ? "simulated " : ""}${x.operation} → ${x.status}`).join("; "), status: "ok" });
    } else if (a.status === "failed") step({ kind: "act", label: "PayPal call failed", detail: a.error ?? "", status: "error" });
  }
  return { skipped: false as const, diagnosisId, source: result.source, ai: result.ai, error: result.error, aiFallback: bad, actions };
}

export async function diagnoseAll(opts: { force?: boolean } = {}) {
  const open = repo.listInvoices().filter((i) => isOpenStatus(i.status));
  // Bounded concurrency: a full board diagnoses in about the time of one call during a live demo.
  const results: { id: string; ok: boolean; skipped?: boolean; error?: string }[] = [];
  const queue = [...open];
  async function worker() {
    for (let inv = queue.shift(); inv; inv = queue.shift()) {
      try {
        const r = await diagnoseInvoice(inv.id, opts);
        results.push({ id: inv.id, ok: true, skipped: r.skipped });
      } catch (e) {
        results.push({ id: inv.id, ok: false, error: (e as Error).message });
      }
    }
  }
  const n = Math.max(1, Math.min(Number(process.env.DIAGNOSE_CONCURRENCY ?? 6), open.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
