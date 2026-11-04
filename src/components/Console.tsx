"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { boardSnapshot } from "@/lib/services/board";
import { REASON_META, type StuckReason } from "@/lib/domain";
import { api, countWord, money, relTime } from "@/lib/client";
import { AppHeader } from "./AppHeader";
import dynamic from "next/dynamic";
import type { BoardHandle } from "./Board";
import { InvoiceCards } from "./InvoiceCards";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { ActionCard } from "./ActionCard";
import { AgentRunTrace, type RunView } from "./AgentRun";
import { ToastProvider, useToast } from "./Toast";
import { Button, ReasonDot, Spinner } from "./ui";

type Snapshot = ReturnType<typeof boardSnapshot>;

// AG Grid is only needed at md+ (phones get InvoiceCards), so it is code-split and loaded on wide screens only.
const Board = dynamic(() => import("./Board").then((m) => m.Board), { ssr: false, loading: () => <Spinner label="Loading the board" /> });

function useWide(query = "(min-width: 768px)") {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return wide;
}
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

function HeroSentence({ s }: { s: Snapshot }) {
  const k = s.kpis;
  const cur = s.rows[0]?.currency ?? "USD";
  const late = s.rows.filter((r) => r.open && r.daysOverdue > 0);
  const reasons = new Set(late.map((r) => r.reason).filter((r): r is StuckReason => !!r && r !== "unknown" && r !== "not_due"));
  if (k.openCount === 0) return <h1 className="font-display text-[2rem] leading-[1.15] text-ink sm:text-[2.5rem]">Nothing is owed to you right now.</h1>;
  const second =
    late.length === 0
      ? "None of them is late yet."
      : reasons.size === 0
        ? `${cap(countWord(late.length))} ${late.length === 1 ? "is" : "are"} late. Run the agent to find out why.`
        : reasons.size === 1
          ? `${cap(countWord(late.length))} ${late.length === 1 ? "is" : "are"} late: ${REASON_META[[...reasons][0]!].label.toLowerCase()}.`
          : `${cap(countWord(late.length))} ${late.length === 1 ? "is" : "are"} late, stuck for ${countWord(reasons.size)} different reasons.`;
  return (
    <h1 className="font-display text-[2rem] leading-[1.16] tracking-[-0.01em] text-ink sm:text-[2.5rem]">
      You&rsquo;re owed <span className="tabular">{money(k.outstandingMinor, cur, true)}</span> across {countWord(k.openCount)} invoice{k.openCount === 1 ? "" : "s"}. <span className="text-ink-soft">{second}</span>
    </h1>
  );
}

function Figures({ s }: { s: Snapshot }) {
  const k = s.kpis;
  const o = s.outlook;
  const cur = s.rows[0]?.currency ?? "USD";
  const expected = o.committedMinor + o.inTransitMinor + o.dueMinor;
  const items = [
    { label: "Waiting to receive", value: money(k.outstandingMinor, cur, true), note: `${k.openCount} open invoice${k.openCount === 1 ? "" : "s"}` },
    { label: "Overdue", value: money(k.overdueMinor, cur, true), note: k.overdueCount ? `${k.overdueCount} invoices, ${k.avgDaysOverdue} days late on average` : "Nothing overdue" },
    {
      label: "Expected in 30 days",
      value: money(expected, cur, true),
      note: [o.committedMinor && `${money(o.committedMinor, cur, true)} agreed`, o.inTransitMinor && `${money(o.inTransitMinor, cur, true)} in transit`, o.dueMinor && `${money(o.dueMinor, cur, true)} coming due`].filter(Boolean).join(", ") || "Nothing scheduled",
      title: "Grouped by why we expect it: an agreed plan or promise, a payment the client says is on its way, or an invoice coming due. High-risk balances are excluded. No probabilities are applied.",
    },
    { label: "At risk", value: money(o.atRiskMinor, cur, true), note: k.atRiskCount ? `${k.atRiskCount} high-risk invoice${k.atRiskCount === 1 ? "" : "s"}` : "None flagged", alert: o.atRiskMinor > 0, title: "Invoices whose transparent risk score is 55 or more. Open an invoice to see the factors." },
  ];
  return (
    <dl className="grid grid-cols-2 border-y border-rule lg:grid-cols-4">
      {items.map((it, i) => (
        <div key={it.label} title={it.title} className={`px-0 py-4 sm:px-4 ${i % 2 === 1 ? "border-l border-rule pl-4" : ""} ${i >= 2 ? "border-t border-rule lg:border-t-0" : ""} ${i === 2 ? "lg:border-l lg:pl-4" : ""} ${i === 0 ? "sm:pl-0" : ""}`}>
          <dt className="text-sm text-ink-soft">{it.label}</dt>
          <dd className={`font-display tabular mt-0.5 text-[1.7rem] leading-tight ${it.alert ? "text-alert" : "text-ink"}`}>{it.value}</dd>
          <dd className="mt-0.5 text-xs leading-snug text-ink-faint">{it.note}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReasonStrip({ s, active, onPick }: { s: Snapshot; active: string | null; onPick: (r: string | null) => void }) {
  const entries = Object.entries(s.kpis.byReason).sort((a, b) => b[1].dueMinor - a[1].dueMinor);
  const total = entries.reduce((a, [, v]) => a + v.dueMinor, 0) || 1;
  const cur = s.rows[0]?.currency ?? "USD";
  const color: Record<string, string> = { sky: "#3a6c8f", amber: "#9a6512", violet: "#6b4f93", rose: "#a13d4f", teal: "#2b7470", emerald: "#357049", slate: "#5b6670", stone: "#a9a395" };
  if (!entries.length || (entries.length === 1 && entries[0]![0] === "undiagnosed")) return null;
  return (
    <div>
      <h2 className="mb-2 text-sm text-ink-soft">Why the money is stuck</h2>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-rule" aria-hidden>
        {entries.map(([r, v]) => (
          <span key={r} style={{ width: `${(v.dueMinor / total) * 100}%`, background: color[r === "undiagnosed" ? "stone" : REASON_META[r as StuckReason].tone], opacity: active && active !== r ? 0.25 : 1 }} className="transition-opacity" />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-1 gap-y-1.5 text-sm" aria-label="Filter invoices by reason">
        {entries.map(([r, v]) => (
          <li key={r}>
            <button onClick={() => onPick(active === r ? null : r)} aria-pressed={active === r} className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 ${active === r ? "bg-ink text-surface" : "text-ink-soft hover:bg-rule/50 hover:text-ink"}`}>
              <ReasonDot reason={r as StuckReason | "undiagnosed"} />
              {r === "undiagnosed" ? "Not diagnosed" : REASON_META[r as StuckReason].short}
              <span className="tabular opacity-70">{money(v.dueMinor, cur, true)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Console() {
  return (
    <ToastProvider>
      <ConsoleInner />
    </ToastProvider>
  );
}

function ConsoleInner() {
  const toast = useToast();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<null | "sync" | "run" | "seed">(null);
  const [version, setVersion] = useState(0);
  const [flash, setFlash] = useState<string[]>([]);
  const [lastRun, setLastRun] = useState<RunView | null>(null);
  const prev = useRef<Map<string, string>>(new Map());
  const boardRef = useRef<BoardHandle>(null);
  const wide = useWide();

  const load = useCallback(async () => {
    try {
      const s = await api<Snapshot>("/api/board");
      const changed: string[] = [];
      for (const r of s.rows) {
        // Flash only when money moved (e.g. a PayPal webhook arrived), not on every re-diagnosis.
        const sig = `${r.dueMinor}|${r.status}`;
        const before = prev.current.get(r.id);
        if (before && before !== sig) changed.push(r.id);
        prev.current.set(r.id, sig);
      }
      if (changed.length) setFlash(changed);
      setSnap(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadRun = useCallback(async () => {
    try {
      const r = await api<RunView | { none: true }>("/api/agent/runs/latest");
      setLastRun("none" in r ? null : r);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    loadRun();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load, loadRun]);

  const refreshAll = () => {
    setVersion((v) => v + 1);
    load();
  };

  const autoLoaded = useRef(false);
  useEffect(() => {
    if (!snap || autoLoaded.current || snap.rows.length > 0 || busy) return;
    autoLoaded.current = true;
    if (snap.mode.paypal === "simulation") run("seed");
    else if (snap.mode.paypal === "sandbox") run("sync");
  }, [snap]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(kind: "sync" | "run" | "seed") {
    setBusy(kind);
    try {
      if (kind === "sync") {
        const r = await api<{ count: number }>("/api/sync", { body: {} });
        toast(`Synced ${r.count} invoices from ${snap?.mode.paypal === "sandbox" ? "PayPal" : "the simulation"}.`);
      } else if (kind === "run") {
        const r = await api<{ run: RunView }>("/api/agent/run", { body: {} });
        setLastRun(r.run);
        const s = r.run.summary;
        toast(s ? `Agent run finished: ${s.autoExecuted} done within your rules, ${s.awaitingApproval} waiting for you.` : "Agent run finished.");
      } else {
        await api("/api/demo/reset", { body: {} });
        setLastRun(null);
        toast("Demo studio loaded.");
      }
      refreshAll();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const clientById = useMemo(() => new Map(snap?.rows.map((r) => [r.id, r]) ?? []), [snap]);
  const simulation = snap?.mode.paypal === "simulation";
  const filteredRows = useMemo(() => {
    if (!snap) return [];
    const needle = q.trim().toLowerCase();
    return snap.rows.filter((r) => (!reason || (r.open && (r.reason ?? "undiagnosed") === reason)) && (!needle || `${r.client} ${r.number} ${r.contact} ${r.summary}`.toLowerCase().includes(needle)));
  }, [snap, reason, q]);

  return (
    <div className="min-h-dvh">
      <AppHeader
        mode={snap?.mode}
        business={snap?.policy.businessName}
        right={
          <Button variant="ghost" onClick={() => run("sync")} busy={busy === "sync"} disabled={!!busy}>
            Sync
          </Button>
        }
      />

      <main className="mx-auto max-w-[1320px] px-4 pb-16 sm:px-6">
        {error && (
          <p role="alert" className="mt-4 rounded-[var(--radius-tight)] bg-alert-wash px-4 py-2 text-sm text-alert">
            {error}
          </p>
        )}
        {!snap && !error && <div className="py-24"><Spinner label="Loading your receivables" /></div>}

        {snap && snap.rows.length === 0 && (
          <section className="mx-auto max-w-xl py-24 text-center">
            <h1 className="font-display text-3xl text-ink">No invoices yet</h1>
            <p className="mt-3 text-ink-soft">
              {simulation
                ? "Loading a demo studio with seven unpaid invoices, each stuck for a different reason. It runs as a labelled simulation; no PayPal credentials needed."
                : "Unstuck reads invoices from your PayPal sandbox account. Sync to import them, or run npm run seed:sandbox to create the demo invoices."}
            </p>
            <div className="mt-6 flex justify-center">
              <Button variant="primary" onClick={() => run(simulation ? "seed" : "sync")} busy={!!busy}>
                {simulation ? "Load the demo studio" : "Sync with PayPal"}
              </Button>
            </div>
          </section>
        )}

        {snap && snap.rows.length > 0 && (
          <>
            {/* 1. How much am I waiting for, and why? */}
            <section className="grid gap-8 pt-8 pb-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12 lg:pt-10">
              <div className="min-w-0 space-y-7">
                <HeroSentence s={snap} />
                <Figures s={snap} />
                <ReasonStrip s={snap} active={reason} onPick={setReason} />
                {snap.recent.length > 0 && (
                  <div className="hidden lg:block">
                    <h2 className="text-sm text-ink-soft">Recently</h2>
                    <ul className="mt-2 divide-y divide-rule border-y border-rule">
                      {snap.recent.slice(0, 4).map((e) => (
                        <li key={e.id}>
                          <button className="grid w-full grid-cols-[6.5rem_1fr] gap-3 py-2 text-left text-sm hover:bg-surface/70" onClick={() => e.invoiceId && setOpenId(e.invoiceId)}>
                            <span className="text-xs leading-5 text-ink-faint">{relTime(e.at)}</span>
                            <span className="min-w-0 text-ink">
                              {e.client && <span className="font-medium">{e.client}. </span>}
                              {e.summary}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 2. What should happen next? */}
              <div className="min-w-0 space-y-4">
                <div className="rounded-[var(--radius-soft)] bg-ink p-5 text-surface">
                  <p className="font-display text-xl leading-snug">Let the agent work through every invoice</p>
                  <p className="mt-1.5 text-sm text-surface/75">It syncs with PayPal, works out why each invoice is stuck, acts where your rules allow, and asks you about the rest.</p>
                  <Button variant="money" className="mt-4 w-full py-2.5" onClick={() => run("run")} busy={busy === "run"} disabled={!!busy}>
                    {busy === "run" ? "Agent is working" : lastRun ? "Run the agent again" : "Run the agent"}
                  </Button>
                  <p className="mt-3 border-t border-surface/15 pt-3 text-sm text-surface/75" title="Payments received on invoices after Unstuck first acted on them (reminder, plan, PO fix, recorded payment).">
                    Recovered after Unstuck acted: <span className="font-display tabular text-base text-surface">{money(snap.kpis.cashUnstuckMinor, snap.rows[0]?.currency, true)}</span>
                  </p>
                </div>
                <AgentRunTrace running={busy === "run"} initial={lastRun} onFinished={loadRun} />
              </div>
            </section>

            {/* 3. What needs me? */}
            <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
              <div className="min-w-0 lg:order-1">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-xl text-ink">
                    Every invoice{reason ? `: ${reason === "undiagnosed" ? "not diagnosed" : REASON_META[reason as StuckReason].short.toLowerCase()}` : ""}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {simulation && (
                      <Button variant="ghost" onClick={() => run("seed")} busy={busy === "seed"} disabled={!!busy} title="Wipe and re-seed the simulated demo">
                        Reset demo
                      </Button>
                    )}
                    <span className="hidden md:inline">
                      <Button variant="ghost" onClick={() => boardRef.current?.exportCsv()} title="Download every invoice with its reason, risk and next step">
                        Export CSV
                      </Button>
                    </span>
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients, numbers, notes" aria-label="Search invoices" className="w-full rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-3 py-1.5 text-sm sm:w-60" />
                  </div>
                </div>
                <div className="hidden h-[600px] md:block">
                  {wide && <Board ref={boardRef} rows={snap.rows} reasonFilter={reason} quickFilter={q} onOpen={setOpenId} selectedId={openId} flashIds={flash} />}
                </div>
                <div className="md:hidden">
                  <InvoiceCards rows={filteredRows} onOpen={setOpenId} />
                </div>
              </div>

              <aside aria-labelledby="needs-h" className="order-first min-w-0 lg:order-2">
                <h2 id="needs-h" className="flex items-baseline justify-between">
                  <span className="font-display text-xl text-ink">Needs you</span>
                  <span className="text-sm text-ink-faint">{snap.pending.length ? `${snap.pending.length} waiting, riskiest first` : ""}</span>
                </h2>
                <div className="mt-3 space-y-3">
                  {snap.pending.length === 0 ? (
                    <p className="rounded-[var(--radius-soft)] border border-dashed border-rule-strong px-4 py-5 text-sm text-ink-soft">
                      {lastRun ? "Nothing needs your approval. Reminders inside your rules go out on their own." : "Run the agent. Anything that changes money or needs your judgement will wait here."}
                    </p>
                  ) : (
                    snap.pending.map((a) => (
                      <ActionCard key={`${a.id}-${a.status}`} action={a} compact currency={clientById.get(a.invoice_id)?.currency ?? "USD"} clientName={clientById.get(a.invoice_id)?.client} onChanged={refreshAll} />
                    ))
                  )}
                </div>
              </aside>
            </section>
          </>
        )}
      </main>

      {openId && <InvoiceDrawer id={openId} version={version} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
