/**
 * The Unstuck agent run: one observable pass over the receivables ledger.
 *
 *   1. Sync from PayPal (source of truth)
 *   2. Follow-ups that need no AI: plan installments coming due, missed promises, expired waits
 *   3. For each open invoice (highest risk first): gather → diagnose → plan → check rules → act
 *   4. Verify: every executed action re-reads the invoice from PayPal (inside executeAction)
 *
 * Every step is persisted to agent_steps so the UI can show what the agent did and why, live.
 * One orchestrator with bounded capabilities, not a swarm: each capability is a plain function and
 * every write goes through the same policy gate.
 */
import { addDays, formatDate, todayIso } from "../dates";
import { repo } from "../db";
import { isOpenStatus } from "../domain";
import { formatMoney } from "../money";
import { getGateway, resolutionUrl } from "../config";
import { proposeAction } from "./actions";
import { diagnoseInvoice } from "./diagnose";
import { promiseState, reminderStats, syncFromPayPal } from "./invoices";
import { planProgress } from "./payments";
import { boardRows } from "./board";

const g = globalThis as unknown as { __unstuckRunning?: string };

export type RunSummary = { invoices: number; diagnosed: number; unchanged: number; autoExecuted: number; awaitingApproval: number; blocked: number; followUps: number; errors: number };

export async function runAgent(trigger: "manual" | "schedule" | "demo" = "manual", opts: { force?: boolean } = {}) {
  if (g.__unstuckRunning) return { runId: g.__unstuckRunning, alreadyRunning: true as const };
  const runId = repo.startRun(trigger);
  g.__unstuckRunning = runId;
  const step = (invoice_id: string | null, s: Parameters<typeof repo.addStep>[1]) => repo.addStep(runId, { ...s, invoice_id });
  const sum: RunSummary = { invoices: 0, diagnosed: 0, unchanged: 0, autoExecuted: 0, awaitingApproval: 0, blocked: 0, followUps: 0, errors: 0 };
  const today = todayIso();

  try {
    // 1. Sync
    try {
      const s = await syncFromPayPal();
      step(null, { kind: "sync", label: `Synced ${s.count} invoices from ${getGateway().mode === "live" ? "PayPal sandbox" : "the simulation"}`, detail: s.receipt.debugId ? `debug id ${s.receipt.debugId}` : undefined, status: "ok" });
    } catch (e) {
      sum.errors++;
      step(null, { kind: "sync", label: "Sync failed; working from last known state", detail: (e as Error).message, status: "error" });
    }

    // Highest risk first, so the most important work happens even if the run is interrupted.
    const order = boardRows(today).filter((r) => r.open).sort((a, b) => b.risk.score - a.risk.score);
    sum.invoices = order.length;
    step(null, { kind: "prioritise", label: `Prioritised ${order.length} open invoices by risk`, detail: order.slice(0, 3).map((r) => `${r.client} (${r.risk.score})`).join(", "), status: "info" });

    for (const r of order) {
      const inv = repo.getInvoice(r.id);
      if (!inv || !isOpenStatus(inv.status)) continue;

      // 2a. Plan installments coming due → deterministic reminder (policy decides if it can go out).
      const plan = repo.activePlan(inv.id);
      if (plan) {
        const prog = planProgress(plan, inv.paid_minor, today);
        const next = prog.next;
        const lastReminder = reminderStats(inv.id, today).last;
        if (next && next.due_date <= addDays(today, 2) && (!lastReminder || lastReminder < addDays(next.due_date, -3))) {
          const idx = prog.rows.indexOf(next) + 1;
          const amount = next.amount_minor - next.paid_minor;
          const a = await proposeAction(inv.id, {
            type: "send_reminder",
            origin: "agent",
            rationale: `Installment ${idx} of ${prog.rows.length} is ${next.due_date < today ? "overdue" : "due soon"}.`,
            params: {
              subject: `Installment ${idx} of ${prog.rows.length} for invoice ${inv.number ?? ""}`.trim(),
              note: `Hi ${inv.recipient_name?.split(" ")[0] ?? "there"}, a quick note that installment ${idx} of your plan (${formatMoney(amount, inv.currency)}) is due ${formatDate(next.due_date)}. You can pay it with the PayPal button in this email. If anything has changed, let me know here: ${resolutionUrl(inv.payer_token)}\n\nThanks,\n${repo.getPolicy().ownerName.split(" ")[0]}`,
            },
          });
          sum.followUps++;
          tally(a.decision, a.status);
          step(inv.id, { kind: "follow_up", label: `Installment ${idx} reminder ${a.status === "executed" ? "sent via PayPal" : a.decision === "approve" ? "waiting for your approval" : "blocked"}`, detail: a.reasons.join("; "), status: a.status === "executed" ? "ok" : "info" });
        } else {
          step(inv.id, { kind: "follow_up", label: `Plan ${prog.rows.filter((x) => x.state === "paid").length}/${prog.rows.length} paid, nothing due`, status: "skip" });
        }
        continue; // An active plan is the remedy; don't re-diagnose underneath it.
      }

      // 2b. Missed promise → force a fresh diagnosis with that fact in context.
      const promise = promiseState(inv.id, today);
      const forced = opts.force || promise.promise_missed;
      if (promise.promise_missed) step(inv.id, { kind: "follow_up", label: `Promise to pay by ${formatDate(promise.promised_by)} was missed`, status: "warn" });

      // 3. Gather → diagnose → plan → rules → act
      try {
        const res = await diagnoseInvoice(inv.id, { force: forced, onStep: (s) => step(inv.id, s) });
        if (res.skipped) sum.unchanged++;
        else {
          sum.diagnosed++;
          for (const a of res.actions ?? []) tally(a.decision, a.status);
        }
      } catch (e) {
        sum.errors++;
        step(inv.id, { kind: "diagnose", label: "Diagnosis failed", detail: (e as Error).message, status: "error" });
      }
    }

    step(null, {
      kind: "done",
      label: `Done: ${sum.autoExecuted} action(s) taken within your rules, ${sum.awaitingApproval} waiting for you`,
      detail: `${sum.diagnosed} diagnosed, ${sum.unchanged} unchanged, ${sum.followUps} follow-up(s), ${sum.blocked} blocked, ${sum.errors} error(s)`,
      status: sum.errors ? "warn" : "ok",
    });
    repo.finishRun(runId, "completed", sum);
    repo.logEvent({ kind: "agent_run", actor: "unstuck", summary: `Agent run: ${sum.autoExecuted} automatic, ${sum.awaitingApproval} for approval, ${sum.diagnosed} diagnosed`, data: { run_id: runId, ...sum } });
  } catch (e) {
    step(null, { kind: "done", label: "Run stopped", detail: (e as Error).message, status: "error" });
    repo.finishRun(runId, "failed", sum);
  } finally {
    g.__unstuckRunning = undefined;
  }
  return { runId, alreadyRunning: false as const, summary: sum };

  function tally(decision: string, status: string) {
    if (status === "executed") sum.autoExecuted++;
    else if (status === "blocked") sum.blocked++;
    else if (decision === "approve") sum.awaitingApproval++;
  }
}

export function runView(id?: string) {
  const run = id ? repo.getRun(id) : repo.latestRun();
  if (!run) return null;
  const names = new Map(repo.listInvoices().map((i) => [i.id, i.recipient_business ?? i.recipient_name ?? i.number ?? "Invoice"]));
  return {
    ...run,
    summary: run.summary_json ? (JSON.parse(run.summary_json) as RunSummary) : null,
    summary_json: undefined,
    steps: repo.listSteps(run.id).map((s) => ({ ...s, client: s.invoice_id ? names.get(s.invoice_id) ?? null : null })),
  };
}

