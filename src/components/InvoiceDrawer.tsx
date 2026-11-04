"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { invoiceDetail } from "@/lib/services/board";
import { REASON_META } from "@/lib/domain";
import { api, money, relTime, shortDate } from "@/lib/client";
import { ActionCard } from "./ActionCard";
import { Button, ReasonPhrase, Spinner, StatusPill } from "./ui";

type Detail = NonNullable<ReturnType<typeof invoiceDetail>>;

const EVENT_ICON: Record<string, string> = {
  payment_received: "＄",
  reminder_sent: "✉",
  diagnosed: "◎",
  action_executed: "✓",
  action_failed: "!",
  webhook: "⇣",
  client_message: "❝",
  offer_accepted: "✓",
  plan_advanced: "→",
  plan_completed: "★",
};

export function InvoiceDrawer({ id, onClose, onChanged, version }: { id: string; onClose: () => void; onChanged: () => void; version: number }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgAuthor, setMsgAuthor] = useState<"client" | "owner">("client");
  const [savingMsg, setSavingMsg] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      setD(await api<Detail>(`/api/invoices/${id}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changed = () => {
    load();
    onChanged();
  };

  async function rediagnose() {
    setDiagnosing(true);
    try {
      await api("/api/diagnose", { body: { invoiceId: id, force: true } });
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDiagnosing(false);
    }
  }

  async function addMessage() {
    if (!msg.trim()) return;
    setSavingMsg(true);
    try {
      await api(`/api/invoices/${id}/messages`, { body: { author: msgAuthor, body: msg } });
      setMsg("");
      await api("/api/diagnose", { body: { invoiceId: id, force: true } });
      changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingMsg(false);
    }
  }

  const row = d?.row;
  const live = d?.actions.filter((a) => a.diagnosis_id === d.diagnosis?.id || a.origin !== "agent") ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div aria-hidden className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <aside className="drawer-in relative flex h-full w-full max-w-[640px] flex-col overflow-y-auto border-l border-rule bg-paper shadow-[0_0_40px_rgba(23,49,42,0.18)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-rule bg-paper/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-sm text-ink-faint">{row ? `${row.number ?? "Invoice"}${row.contact ? `, ${row.contact}` : ""}` : "Loading"}</p>
            <h2 id="drawer-title" className="font-display truncate text-2xl text-ink">{row?.client ?? " "}</h2>
          </div>
          <Button ref={closeRef} variant="ghost" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>

        {error && <p className="mx-6 mt-4 rounded-[var(--radius-tight)] bg-alert-wash px-3 py-2 text-sm text-alert">{error}</p>}
        {!d && !error && <div className="p-6"><Spinner label="Loading invoice" /></div>}

        {d && row && (
          <div className="space-y-8 px-6 py-6">
            {/* Money */}
            <section className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-ink-soft">{row.open ? "Still owed" : "Settled"}</p>
                <p className="font-display tabular text-4xl text-ink">{money(row.dueMinor, row.currency)}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  of {money(row.totalMinor, row.currency)}
                  {row.paidMinor > 0 ? `, ${money(row.paidMinor, row.currency)} paid` : ""}. {row.open ? (row.daysOverdue > 0 ? `${row.daysOverdue} days past due (${shortDate(row.dueDate)})` : `Due ${shortDate(row.dueDate)}`) : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusPill kind={row.open ? (row.daysOverdue > 0 ? "warn" : "neutral") : "ok"}>PayPal status: {row.status.replace(/_/g, " ").toLowerCase()}</StatusPill>
                {d.payUrl && (
                  <a className="text-xs text-ink-soft underline underline-offset-4" href={d.payUrl} target="_blank" rel="noreferrer">
                    Open the invoice in PayPal
                  </a>
                )}
              </div>
            </section>

            {/* Plan */}
            {d.plan && (
              <section aria-labelledby="plan-h">
                <h3 id="plan-h" className="mb-2 font-medium text-ink">Payment plan{d.plan.status === "completed" ? ", completed" : ""}</h3>
                <ol className="divide-y divide-rule rounded-[var(--radius-soft)] border border-rule bg-surface">
                  {d.plan.progress.rows.map((r, i) => (
                    <li key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="text-ink-soft">Payment {i + 1} by {shortDate(r.due_date)}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-display tabular">{money(r.amount_minor, row.currency)}</span>
                        <StatusPill kind={r.state === "paid" ? "ok" : r.state === "overdue" ? "alert" : r.state === "due" || r.state === "partial" ? "warn" : "neutral"}>{r.state}</StatusPill>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Diagnosis */}
            {row.open && (
              <section aria-labelledby="diag-h" className="rounded-[var(--radius-soft)] border border-rule bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="diag-h" className="text-sm text-ink-soft">Why it&rsquo;s stuck</h3>
                    <div className="mt-1">
                      <ReasonPhrase reason={d.diagnosis?.reason ?? null} size="lg" />
                    </div>
                  </div>
                  <Button variant="quiet" onClick={rediagnose} busy={diagnosing}>
                    {d.diagnosis ? "Diagnose again" : "Diagnose"}
                  </Button>
                </div>
                {d.diagnosis ? (
                  <>
                    <p className="mt-3 text-ink">{d.diagnosis.summary}</p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-ink-faint">
                      <span className="flex h-1.5 w-24 overflow-hidden rounded-full bg-rule" aria-hidden>
                        <span className="bg-ink" style={{ width: `${Math.round(d.diagnosis.confidence * 100)}%` }} />
                      </span>
                      <span>
                        {Math.round(d.diagnosis.confidence * 100)}% confidence, {d.diagnosis.source === "ai" ? `by ${d.diagnosis.model}` : "rules only (AI not configured)"}, {relTime(d.diagnosis.created_at)}
                      </span>
                    </div>
                    {d.diagnosis.evidence.length > 0 && (
                      <ul className="mt-4 space-y-2">
                        {d.diagnosis.evidence.map((e, i) => (
                          <li key={i} className="border-l-2 border-rule-strong pl-3 text-sm text-ink-soft">
                            <span className="font-display italic">{e.quote}</span>
                            <span className="ml-1 text-xs text-ink-faint">({e.source.replace("_", " ")})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-4 text-xs text-ink-faint">{REASON_META[d.diagnosis.reason].description}</p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-soft">Unstuck hasn&rsquo;t looked at this invoice yet. Diagnose it to see why it&rsquo;s unpaid and what to do next.</p>
                )}
              </section>
            )}

            {/* Actions */}
            {live.length > 0 && (
              <section aria-labelledby="act-h" className="space-y-3">
                <h3 id="act-h" className="font-medium text-ink">Next steps</h3>
                {live.map((a) => (
                  <ActionCard key={`${a.id}-${a.status}`} action={a} currency={row.currency} onChanged={changed} />
                ))}
              </section>
            )}

            {/* Conversation */}
            <section aria-labelledby="conv-h">
              <h3 id="conv-h" className="mb-2 font-medium text-ink">Conversation</h3>
              <ul className="space-y-3">
                {d.messages.length === 0 && <li className="text-sm text-ink-soft">No messages from this client yet.</li>}
                {d.messages.map((m) => (
                  <li key={m.id} className={`rounded-[var(--radius-soft)] px-4 py-3 text-sm ${m.author === "client" ? "border border-rule bg-surface" : m.author === "agent" ? "ml-8 bg-rule/40" : "ml-8 bg-marigold-wash/60"}`}>
                    <p className="mb-1 text-xs text-ink-faint">
                      {m.author === "client" ? (row.contact ?? "Client") : m.author === "agent" ? "Unstuck assistant" : "You"}
                      {m.channel === "resolution_page" ? " on the payment page" : m.channel === "email" ? " by email" : " (note)"}, {relTime(m.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap text-ink">{m.body}</p>
                  </li>
                ))}
              </ul>
              {row.open && (
                <div className="mt-3 rounded-[var(--radius-soft)] border border-rule bg-surface p-3">
                  <div className="mb-2 flex gap-1 text-xs" role="radiogroup" aria-label="Message type">
                    {(["client", "owner"] as const).map((k) => (
                      <button key={k} role="radio" aria-checked={msgAuthor === k} onClick={() => setMsgAuthor(k)} className={`rounded-full px-2.5 py-1 ${msgAuthor === k ? "bg-ink text-surface" : "text-ink-soft hover:bg-rule/50"}`}>
                        {k === "client" ? "Paste a client email" : "Add a note"}
                      </button>
                    ))}
                  </div>
                  <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder={msgAuthor === "client" ? "Paste what the client wrote. Unstuck will re-diagnose." : "Context only you know, e.g. “they always pay after month-end”."} className="w-full rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-2.5 py-2 text-sm" aria-label="Message" />
                  <div className="mt-2 flex justify-end">
                    <Button variant="primary" onClick={addMessage} busy={savingMsg} disabled={!msg.trim()}>
                      Add and re-diagnose
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* Payer link */}
            {row.open && (
              <section className="rounded-[var(--radius-soft)] border border-dashed border-rule-strong p-4 text-sm">
                <p className="text-ink">Client&rsquo;s private payment page</p>
                <p className="mt-1 text-ink-soft">Every reminder Unstuck sends includes this link. The client can pay with PayPal, pick a plan within your rules, or ask a question.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={d.resolutionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-3 py-1.5 text-sm hover:border-ink-soft">
                    Open as the client
                  </a>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(d.resolutionUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? "Link copied" : "Copy link"}
                  </Button>
                </div>
              </section>
            )}

            {/* Timeline */}
            <section aria-labelledby="tl-h">
              <h3 id="tl-h" className="mb-3 font-medium text-ink">What happened</h3>
              <ol className="relative space-y-3 border-l border-rule pl-5">
                {d.events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <span aria-hidden className="absolute -left-[9px] flex size-[17px] items-center justify-center rounded-full border border-rule bg-surface text-[10px] text-ink-soft">
                      {EVENT_ICON[e.kind] ?? "·"}
                    </span>
                    <p className="text-ink">{e.summary}</p>
                    <p className="text-xs text-ink-faint">
                      {relTime(e.at)}, {e.actor}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
