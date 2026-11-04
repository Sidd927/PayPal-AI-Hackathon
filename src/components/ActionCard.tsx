"use client";
import { useState } from "react";
import type { ActionView } from "@/lib/services/actions";
import { ACTION_META, type ActionType, type Installment } from "@/lib/domain";
import { api, money, relTime, shortDate } from "@/lib/client";
import { Button, StatusPill } from "./ui";

const ORIGIN: Record<string, string> = { agent: "Unstuck suggests", payer: "Your client chose", owner: "You asked", system: "Unstuck" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1 text-sm">
      <span className="text-ink-faint">{label}</span>
      <span className="min-w-0 text-ink">{children}</span>
    </div>
  );
}

function PlanTable({ installments, currency }: { installments: Installment[]; currency: string }) {
  return (
    <ol className="mt-1 divide-y divide-rule rounded-[var(--radius-tight)] border border-rule bg-paper/50 text-sm">
      {installments.map((i, n) => (
        <li key={n} className="flex items-center justify-between px-3 py-1.5">
          <span className="text-ink-soft">
            Payment {n + 1} by {shortDate(i.due_date)}
          </span>
          <span className="font-display tabular">{money(i.amount_minor, currency)}</span>
        </li>
      ))}
    </ol>
  );
}

export function ActionCard({ action, currency, clientName, onChanged, compact }: { action: ActionView; currency: string; clientName?: string; onChanged: () => void; compact?: boolean }) {
  const type = action.type as ActionType;
  const meta = ACTION_META[type];
  const p = action.params as Record<string, any>;
  const [subject, setSubject] = useState<string>(p.subject ?? "");
  const [note, setNote] = useState<string>(p.note ?? "");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showChecks, setShowChecks] = useState(false);
  const editable = action.status === "proposed" && type === "send_reminder";
  const edited = editable && (subject !== p.subject || note !== p.note);

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "approve") {
        const res = await api<ActionView>(`/api/actions/${action.id}/approve`, { body: edited ? { params: { ...p, subject, note } } : {} });
        if (res.status === "failed") setError(res.error ?? "PayPal rejected the request");
      } else await api(`/api/actions/${action.id}/reject`, { body: {} });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const statusPill =
    action.status === "proposed" ? <StatusPill kind="warn">Needs your approval</StatusPill>
    : action.status === "executed" ? <StatusPill kind="ok">Done</StatusPill>
    : action.status === "failed" ? <StatusPill kind="alert">Failed</StatusPill>
    : action.status === "blocked" ? <StatusPill kind="alert">Blocked by your policy</StatusPill>
    : action.status === "rejected" ? <StatusPill>Declined</StatusPill>
    : <StatusPill>{action.status}</StatusPill>;

  const result = action.result as { summary?: string; receipts?: { operation: string; status: number; debugId?: string; simulated?: boolean }[] } | null;

  return (
    <article className={`rounded-[var(--radius-soft)] border bg-surface ${action.status === "proposed" ? "border-marigold/60" : "border-rule"} ${compact ? "p-3.5" : "p-4"}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-ink-faint">
            {ORIGIN[action.origin] ?? action.origin}
            {clientName ? ` for ${clientName}` : ""}, {relTime(action.created_at)}
          </p>
          <h4 className="mt-0.5 font-medium text-ink">{meta.label}</h4>
        </div>
        {statusPill}
      </header>

      {action.rationale && <p className="mt-2 text-sm text-ink-soft">{action.rationale}</p>}

      <div className="mt-3">
        {type === "send_reminder" &&
          (editable ? (
            <div className="space-y-2">
              <label className="block text-xs text-ink-faint" htmlFor={`s-${action.id}`}>Subject</label>
              <input id={`s-${action.id}`} value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-2.5 py-1.5 text-sm" />
              <label className="block text-xs text-ink-faint" htmlFor={`n-${action.id}`}>Message PayPal will deliver</label>
              <textarea id={`n-${action.id}`} value={note} onChange={(e) => setNote(e.target.value)} rows={compact ? 5 : 7} className="w-full rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-2.5 py-2 text-sm leading-relaxed" />
              {p.additional_recipients?.length > 0 && <Field label="Also send to">{p.additional_recipients.join(", ")}</Field>}
            </div>
          ) : (
            <>
              <Field label="Subject">{p.subject}</Field>
              {!compact && <p className="mt-1 whitespace-pre-wrap rounded-[var(--radius-tight)] bg-paper/60 p-3 text-sm leading-relaxed text-ink-soft">{p.note}</p>}
              {p.additional_recipients?.length > 0 && <Field label="Also sent to">{p.additional_recipients.join(", ")}</Field>}
            </>
          ))}
        {type === "offer_payment_plan" && <PlanTable installments={p.installments} currency={currency} />}
        {type === "update_reference" && (
          <>
            <Field label="Reference">{p.reference}</Field>
            {p.cc_email && <Field label="CC">{p.cc_email}</Field>}
            {p.note_append && !compact && <p className="mt-1 whitespace-pre-wrap rounded-[var(--radius-tight)] bg-paper/60 p-3 text-sm text-ink-soft">{p.note_append}</p>}
          </>
        )}
        {type === "add_early_payment_discount" && (
          <Field label="Discount">
            {p.percent}% if paid by {shortDate(p.expires_on)}
          </Field>
        )}
        {type === "record_external_payment" && (
          <>
            <Field label="Amount">{money(p.amount_minor, currency)}</Field>
            <Field label="Method">{String(p.method).toLowerCase().replace("_", " ")}</Field>
          </>
        )}
        {type === "escalate_to_owner" && (
          <>
            <p className="text-sm text-ink">{p.summary}</p>
            {p.draft_reply && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-ink-soft">Suggested reply you can send yourself</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-[var(--radius-tight)] bg-paper/60 p-3 text-ink-soft">{p.draft_reply}</p>
              </details>
            )}
          </>
        )}
        {type === "wait" && <Field label="Until">{shortDate(p.until)}</Field>}
      </div>

      {meta.paypal && action.status !== "executed" && <p className="mt-3 text-xs text-ink-faint">In PayPal: {meta.paypal}</p>}

      {result?.summary && (
        <div className="mt-3 rounded-[var(--radius-tight)] bg-ok-wash/60 px-3 py-2 text-sm text-ok">
          {result.summary}
          {result.receipts?.map((r, i) => (
            <p key={i} className="mt-0.5 text-xs text-ok/80">
              {r.simulated ? "Simulated " : "PayPal "}
              {r.operation}: HTTP {r.status}
              {r.debugId && !r.simulated ? `, debug id ${r.debugId}` : ""}
            </p>
          ))}
        </div>
      )}
      {(error || (action.status === "failed" && action.error)) && <p className="mt-3 rounded-[var(--radius-tight)] bg-alert-wash px-3 py-2 text-sm text-alert">{error ?? action.error}</p>}

      {action.checks.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowChecks((v) => !v)} className="text-xs text-ink-soft underline decoration-rule-strong underline-offset-4 hover:text-ink" aria-expanded={showChecks}>
            {showChecks ? "Hide policy checks" : `Policy checks (${action.checks.filter((c) => c.ok).length}/${action.checks.length} passed)`}
          </button>
          {showChecks && (
            <ul className="mt-2 space-y-1 text-xs">
              {action.checks.map((c, i) => (
                <li key={i} className={c.ok ? "text-ok" : "text-alert"}>
                  <span aria-hidden>{c.ok ? "✓" : "✕"}</span> {c.label}
                  {c.detail ? <span className="text-ink-faint">, {c.detail}</span> : null}
                </li>
              ))}
              {action.reasons.map((r, i) => (
                <li key={`r${i}`} className="text-ink-soft">{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {action.status === "proposed" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant={meta.movesMoney ? "money" : "primary"} busy={busy === "approve"} disabled={!!busy} onClick={() => decide("approve")}>
            {type === "escalate_to_owner" ? "Mark as handled" : edited ? `${meta.verb} with my edits` : meta.verb}
          </Button>
          <Button variant="ghost" busy={busy === "reject"} disabled={!!busy} onClick={() => decide("reject")}>
            Decline
          </Button>
        </div>
      )}
    </article>
  );
}
