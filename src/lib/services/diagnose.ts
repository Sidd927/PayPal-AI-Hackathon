import { repo } from "../db";
import { isOpenStatus } from "../domain";
import { diagnose, hashInput, proposalsFromDiagnosis } from "../ai/diagnosis";
import { buildDiagnosisInput, policyContextFor, resolutionUrl } from "./invoices";
import { proposeAction } from "./actions";

export async function diagnoseInvoice(invoiceId: string, opts: { force?: boolean } = {}) {
  const row = repo.getInvoice(invoiceId);
  if (!row) throw new Error("Invoice not found");
  if (!isOpenStatus(row.status)) return { skipped: true as const, reason: `Invoice is ${row.status}` };
  const policy = repo.getPolicy();
  const input = buildDiagnosisInput(row, policy);
  const inputHash = hashInput(input);
  const latest = repo.latestDiagnosis(invoiceId);
  if (!opts.force && latest && latest.input_hash === inputHash) return { skipped: true as const, reason: "Nothing changed since the last diagnosis", diagnosisId: latest.id };

  const result = await diagnose(input);
  const o = result.output;
  const diagnosisId = repo.addDiagnosis({
    invoice_id: invoiceId,
    reason: o.reason,
    confidence: o.confidence,
    summary: o.summary,
    evidence_json: JSON.stringify(o.evidence),
    extracted_json: JSON.stringify(o.extracted),
    recommendation_json: JSON.stringify({ action: o.recommended_action, rationale: o.rationale, message: o.message, plan: o.plan, discount_percent: o.discount_percent, tone: o.tone }),
    source: result.source,
    model: result.model,
    input_hash: inputHash,
  });
  repo.logEvent({
    invoice_id: invoiceId,
    kind: "diagnosed",
    actor: result.source === "ai" ? "ai" : "rules",
    summary: `Diagnosed as “${o.reason.replace("_", " ")}” (${Math.round(o.confidence * 100)}% confidence)${result.error ? ` — ${result.error}` : ""}`,
    data: { diagnosis_id: diagnosisId, model: result.model, source: result.source, error: result.error },
  });
  if (o.reason === "dispute") repo.setDisputed(invoiceId, true);
  else if (row.disputed && o.reason !== "unknown") repo.setDisputed(invoiceId, false);

  repo.supersedeProposals(invoiceId);
  const fresh = repo.getInvoice(invoiceId)!;
  const proposals = proposalsFromDiagnosis(o, { ...policyContextFor(fresh), resolutionUrl: resolutionUrl(fresh.payer_token), invoiceDueDate: fresh.due_date }, policy);
  const actions = [];
  for (const p of proposals) actions.push(await proposeAction(invoiceId, p, { diagnosisId }));
  return { skipped: false as const, diagnosisId, source: result.source, error: result.error, actions };
}

export async function diagnoseAll(opts: { force?: boolean } = {}) {
  const open = repo.listInvoices().filter((i) => isOpenStatus(i.status));
  // Small concurrency: fast enough for a live demo, gentle on rate limits.
  const results: { id: string; ok: boolean; error?: string }[] = [];
  const queue = [...open];
  async function worker() {
    for (let inv = queue.shift(); inv; inv = queue.shift()) {
      try {
        await diagnoseInvoice(inv.id, opts);
        results.push({ id: inv.id, ok: true });
      } catch (e) {
        results.push({ id: inv.id, ok: false, error: (e as Error).message });
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return results;
}
