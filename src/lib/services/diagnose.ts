import { repo } from "../db";
import { ACTION_META, isOpenStatus } from "../domain";
import { diagnose, hashInput, proposalsFromDiagnosis } from "../ai/diagnosis";
import { buildDiagnosisInput, policyContextFor, resolutionUrl } from "./invoices";
import { proposeAction } from "./actions";

export type StepFn = (s: { kind: string; label: string; detail?: string; status: "ok" | "info" | "warn" | "error" | "skip" }) => void;

export async function diagnoseInvoice(invoiceId: string, opts: { force?: boolean; onStep?: StepFn } = {}) {
  const step: StepFn = opts.onStep ?? (() => {});
  const row = repo.getInvoice(invoiceId);
  if (!row) throw new Error("Invoice not found");
  if (!isOpenStatus(row.status)) return { skipped: true as const, reason: `Invoice is ${row.status}` };
  const policy = repo.getPolicy();
  const input = buildDiagnosisInput(row, policy);
  const inputHash = hashInput(input);
  const latest = repo.latestDiagnosis(invoiceId);
  step({ kind: "gather", label: "Gathered evidence", detail: `${input.messages.length} message(s), ${input.history.previous_invoices} past invoice(s), ${input.reminders.sent} reminder(s)${input.commitments.promise_missed ? ", missed promise" : ""}`, status: "info" });
  if (!opts.force && latest && latest.input_hash === inputHash) {
    step({ kind: "diagnose", label: "Nothing new since last diagnosis", detail: `Still “${latest.reason.replace("_", " ")}”`, status: "skip" });
    return { skipped: true as const, reason: "Nothing changed since the last diagnosis", diagnosisId: latest.id };
  }

  const t0 = Date.now();
  const result = await diagnose(input);
  step({
    kind: "diagnose",
    label: `Diagnosed: ${result.output.reason.replace("_", " ")} (${Math.round(result.output.confidence * 100)}%)`,
    detail: `${result.source === "ai" ? `Claude (${result.model})` : "Rules only"} in ${((Date.now() - t0) / 1000).toFixed(1)}s${result.error ? `. ${result.error}` : ""}`,
    status: result.error ? "warn" : "ok",
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
  });
  repo.logEvent({
    invoice_id: invoiceId,
    kind: "diagnosed",
    actor: result.source === "ai" ? "ai" : "rules",
    summary: `Diagnosed as “${o.reason.replace("_", " ")}” (${Math.round(o.confidence * 100)}% confidence)${result.error ? `. ${result.error}` : ""}`,
    data: { diagnosis_id: diagnosisId, model: result.model, source: result.source, error: result.error },
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
  return { skipped: false as const, diagnosisId, source: result.source, error: result.error, actions };
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
