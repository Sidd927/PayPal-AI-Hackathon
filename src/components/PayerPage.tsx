"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { payerView } from "@/lib/services/payer";
import { api, money, shortDate } from "@/lib/client";
import { Button, Spinner, StatusPill } from "./ui";

type View = ReturnType<typeof payerView>;

const SUGGESTIONS = ["Can I pay part now and the rest later?", "What are my payment options?", "I have a question about the invoice"];

export function PayerPage({ token }: { token: string }) {
  const [v, setV] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [simAmount, setSimAmount] = useState("");
  const [simBusy, setSimBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setV(await api<View>(`/api/pay/${token}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!v) return;
    const min = v.invoice.partial_allowed && v.invoice.min_due_minor ? Math.min(v.invoice.min_due_minor, v.invoice.due_minor) : v.invoice.due_minor;
    setSimAmount((min / 100).toFixed(2));
  }, [v?.invoice.due_minor, v?.invoice.min_due_minor, v?.invoice.partial_allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(body: string) {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const r = await api<{ view: View }>(`/api/pay/${token}/messages`, { body: { body } });
      setV(r.view);
      setText("");
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function accept(id: string) {
    setAccepting(id);
    setError(null);
    try {
      const r = await api<{ view: View; pendingOwner: boolean; actionStatus: string; error?: string }>(`/api/pay/${token}/offers/${id}/accept`, { body: {} });
      setV(r.view);
      if (r.actionStatus === "failed") setError(r.error ?? "We couldn't set up the plan in PayPal. Please try again.");
      else setNotice(r.pendingOwner ? `Thanks. ${r.view.owner} will confirm this plan by email.` : "Your plan is set up. You can now pay the first installment with PayPal.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAccepting(null);
    }
  }

  async function simulatePay() {
    setSimBusy(true);
    setError(null);
    try {
      const r = await api<{ view: View }>(`/api/pay/${token}/simulate-payment`, { body: { amount: simAmount } });
      setV(r.view);
      setNotice(`Simulated payment of $${simAmount} recorded.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSimBusy(false);
    }
  }

  if (error && !v) {
    return (
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-2xl">This link isn&rsquo;t working</h1>
        <p className="mt-2 text-ink-soft">{error}. If you received it by email, ask the sender for a new link.</p>
      </main>
    );
  }
  if (!v) return <main className="mx-auto max-w-md px-5 py-24"><Spinner label="Loading your invoice" /></main>;

  const inv = v.invoice;
  const cur = inv.currency;
  const payNow = inv.partial_allowed && inv.min_due_minor ? Math.min(inv.min_due_minor, inv.due_minor) : inv.due_minor;
  const openOffers = v.offers.filter((o) => o.status === "open");
  const pendingOffer = v.offers.find((o) => o.status === "pending_owner");

  return (
    <div className="min-h-dvh">
      {v.simulation && (
        <p className="bg-marigold-wash px-4 py-2 text-center text-xs text-marigold-deep">Demo simulation: no real PayPal invoice or payment is involved on this page.</p>
      )}
      <main className="mx-auto max-w-[560px] px-4 pb-20 pt-10 sm:px-5">
        <header>
          <p className="text-sm text-ink-soft">Invoice {inv.number} from</p>
          <h1 className="font-display text-[2rem] leading-tight text-ink">{v.business}</h1>
          {inv.recipient_name && <p className="mt-1 text-sm text-ink-faint">Prepared for {inv.recipient_name}</p>}
        </header>

        <section className="mt-8 rounded-[var(--radius-soft)] border border-rule bg-surface p-5" aria-labelledby="amount-h">
          {inv.open ? (
            <>
              <h2 id="amount-h" className="text-sm text-ink-soft">{inv.paid_minor > 0 ? "Remaining balance" : "Amount due"}</h2>
              <p className="font-display tabular mt-1 text-[2.6rem] leading-none text-ink">{money(inv.due_minor, cur)}</p>
              <p className="mt-2 text-sm text-ink-soft">
                {inv.paid_minor > 0 ? `${money(inv.paid_minor, cur)} paid so far. ` : ""}
                {v.plan?.next ? `Next payment ${money(v.plan.next.amount_minor - v.plan.next.paid_minor, cur)} by ${shortDate(v.plan.next.due_date)}.` : `Due ${shortDate(inv.due_date)}.`}
              </p>
            </>
          ) : (
            <>
              <h2 id="amount-h" className="font-display text-2xl text-ok">Paid in full. Thank you.</h2>
              <p className="mt-1 text-sm text-ink-soft">{money(inv.total_minor, cur)} received. Nothing more is needed.</p>
            </>
          )}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-ink-soft">What this invoice covers</summary>
            <ul className="mt-2 divide-y divide-rule">
              {inv.items.map((it: { name: string; quantity?: string; unit?: string }, i: number) => (
                <li key={i} className="flex justify-between gap-4 py-1.5">
                  <span>{it.name}</span>
                  {it.unit && <span className="tabular text-ink-soft">{money(Math.round(Number(it.unit) * 100) * Number(it.quantity ?? 1), cur)}</span>}
                </li>
              ))}
            </ul>
          </details>

          {inv.open && (
            <div className="mt-5 border-t border-rule pt-5">
              {v.payUrl ? (
                <>
                  <a href={v.payUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center rounded-[var(--radius-tight)] bg-ink px-4 py-3 font-medium text-surface hover:bg-[#21443a]">
                    {inv.partial_allowed && payNow < inv.due_minor ? `Pay ${money(payNow, cur)} or more with PayPal` : `Pay ${money(inv.due_minor, cur)} with PayPal`}
                  </a>
                  <p className="mt-2 text-center text-xs text-ink-faint">Opens PayPal&rsquo;s secure invoice page. Card or PayPal balance; no account needed for cards.</p>
                </>
              ) : (
                <div className="rounded-[var(--radius-tight)] border border-dashed border-marigold/70 p-3">
                  <label htmlFor="sim-amt" className="text-sm text-ink">Simulate paying on PayPal&rsquo;s invoice page</label>
                  <div className="mt-2 flex gap-2">
                    <input id="sim-amt" inputMode="decimal" value={simAmount} onChange={(e) => setSimAmount(e.target.value)} className="tabular w-32 rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-2.5 py-2 text-sm" />
                    <Button variant="primary" onClick={simulatePay} busy={simBusy} className="flex-1">
                      Simulate payment
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">
                    {inv.partial_allowed ? `Partial payments are on: minimum ${money(payNow, cur)}.` : "This invoice must be paid in full."} Connect PayPal sandbox credentials to pay a real sandbox invoice instead.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {notice && <p role="status" className="mt-4 rounded-[var(--radius-tight)] bg-ok-wash px-4 py-2.5 text-sm text-ok">{notice}</p>}
        {error && <p role="alert" className="mt-4 rounded-[var(--radius-tight)] bg-alert-wash px-4 py-2.5 text-sm text-alert">{error}</p>}

        {v.plan && (
          <section className="mt-6" aria-labelledby="plan-h">
            <h2 id="plan-h" className="font-medium text-ink">{v.plan.status === "completed" ? "Your payment plan is complete" : "Your payment plan"}</h2>
            <ol className="mt-2 divide-y divide-rule rounded-[var(--radius-soft)] border border-rule bg-surface">
              {v.plan.rows.map((r, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-ink-soft">By {shortDate(r.due_date)}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-display tabular">{money(r.amount_minor, cur)}</span>
                    <StatusPill kind={r.state === "paid" ? "ok" : r.state === "overdue" ? "alert" : r.state === "due" ? "warn" : "neutral"}>{r.state === "due" ? "next" : r.state}</StatusPill>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {inv.open && !v.plan && (
          <section className="mt-10" aria-labelledby="help-h">
            <h2 id="help-h" className="font-display text-2xl text-ink">Can&rsquo;t pay it all today?</h2>
            <p className="mt-2 text-ink-soft">
              That&rsquo;s okay. You can choose a payment plan {v.owner} has already agreed to, or ask a question. {v.ai ? "The assistant below can only offer options within those rules." : ""}
            </p>

            {pendingOffer && <p className="mt-4 rounded-[var(--radius-tight)] bg-marigold-wash px-4 py-2.5 text-sm text-marigold-deep">Your requested plan is with {v.owner} for approval. You&rsquo;ll hear back by email.</p>}

            <div className="mt-5 space-y-3">
              {v.messages.map((m) => (
                <div key={m.id} className={`max-w-[88%] rounded-[var(--radius-soft)] px-4 py-2.5 text-[0.95rem] leading-relaxed ${m.author === "client" ? "ml-auto bg-ink text-surface" : "border border-rule bg-surface text-ink"}`}>
                  {m.author === "agent" && <p className="mb-0.5 text-xs text-ink-faint">{v.business}</p>}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
              {sending && <div className="text-sm"><Spinner label="Checking your options" /></div>}
              <div ref={endRef} />
            </div>

            {openOffers.length > 0 && (
              <div className="mt-5 space-y-3">
                {openOffers.map((o) => (
                  <div key={o.id} className="rounded-[var(--radius-soft)] border border-marigold/70 bg-surface p-4">
                    <p className="text-sm text-ink">
                      {o.installments.length} payments of about {money(o.installments[1]?.amount_minor ?? o.installments[0]!.amount_minor, cur, true)}
                    </p>
                    <ol className="mt-2 space-y-1 text-sm">
                      {o.installments.map((i, n) => (
                        <li key={n} className="flex justify-between">
                          <span className="text-ink-soft">{n === 0 ? "First payment" : `Payment ${n + 1}`}, by {shortDate(i.due_date)}</span>
                          <span className="font-display tabular">{money(i.amount_minor, cur)}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                      If you accept, {v.business}&rsquo;s PayPal invoice will allow part-payments, starting with {money(o.installments[0]!.amount_minor, cur)}. Nothing is charged automatically: you pay each installment yourself with PayPal by its date. The total stays {money(o.installments.reduce((s, i) => s + i.amount_minor, 0), cur)}, with no fees or interest added.
                    </p>
                    <Button variant="money" className="mt-3 w-full" busy={accepting === o.id} disabled={!!accepting} onClick={() => accept(o.id)}>
                      Accept this plan
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <form
              className="mt-5"
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              {v.messages.length === 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} disabled={sending} className="rounded-full border border-rule-strong bg-surface px-3 py-1.5 text-sm text-ink-soft hover:border-ink-soft hover:text-ink">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <label htmlFor="payer-msg" className="sr-only">Your message</label>
              <textarea
                id="payer-msg"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(text);
                  }
                }}
                rows={2}
                maxLength={1500}
                placeholder="For example: I can pay $400 now and the rest next month"
                className="w-full rounded-[var(--radius-soft)] border border-rule-strong bg-surface px-4 py-3 text-[0.95rem]"
              />
              <div className="mt-2 flex justify-end">
                <Button type="submit" variant="primary" busy={sending} disabled={!text.trim()}>
                  Send
                </Button>
              </div>
            </form>
          </section>
        )}

        <footer className="mt-14 border-t border-rule pt-4 text-xs leading-relaxed text-ink-faint">
          Payments are processed by PayPal. This page is private to you; anyone with the link can view this invoice, so please don&rsquo;t forward it. Unstuck helps {v.business} manage invoices.
        </footer>
      </main>
    </div>
  );
}
