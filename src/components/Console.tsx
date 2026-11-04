"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { boardSnapshot } from "@/lib/services/board";
import { REASON_META, type StuckReason } from "@/lib/domain";
import { api, countWord, money, relTime } from "@/lib/client";
import { AppHeader } from "./AppHeader";
import { Board } from "./Board";
import { InvoiceDrawer } from "./InvoiceDrawer";
import { ActionCard } from "./ActionCard";
import { Button, ReasonDot, Spinner } from "./ui";

type Snapshot = ReturnType<typeof boardSnapshot>;

function HeroSentence({ s }: { s: Snapshot }) {
  const k = s.kpis;
  const cur = s.rows[0]?.currency ?? "USD";
  const reasons = Object.keys(k.byReason).filter((r) => r !== "not_due" && r !== "undiagnosed" && r !== "unknown");
  const stuck = s.rows.filter((r) => r.open && r.daysOverdue > 0).length;
  if (k.openCount === 0) return <h1 className="font-display text-[2.1rem] leading-[1.15] text-ink sm:text-[2.6rem]">Nothing is owed to you right now.</h1>;
  const second =
    stuck === 0
      ? "None of them is late yet."
      : reasons.length >= 2
        ? `${countWord(stuck).replace(/^./, (c) => c.toUpperCase())} ${stuck === 1 ? "is" : "are"} late, stuck for ${countWord(reasons.length)} different reasons.`
        : reasons.length === 1
          ? `${countWord(stuck).replace(/^./, (c) => c.toUpperCase())} ${stuck === 1 ? "is" : "are"} late. ${REASON_META[reasons[0] as StuckReason].label}.`
          : `${countWord(stuck).replace(/^./, (c) => c.toUpperCase())} ${stuck === 1 ? "is" : "are"} late. Diagnose them to see why.`;
  return (
    <h1 className="font-display text-[2.1rem] leading-[1.18] tracking-[-0.01em] text-ink sm:text-[2.6rem]">
      You&rsquo;re owed <span className="tabular">{money(k.outstandingMinor, cur, true)}</span> across {countWord(k.openCount)} invoice{k.openCount === 1 ? "" : "s"}. <span className="text-ink-soft">{second}</span>
    </h1>
  );
}

function ReasonStrip({ s, active, onPick }: { s: Snapshot; active: string | null; onPick: (r: string | null) => void }) {
  const entries = Object.entries(s.kpis.byReason).sort((a, b) => b[1].dueMinor - a[1].dueMinor);
  const total = entries.reduce((a, [, v]) => a + v.dueMinor, 0) || 1;
  const cur = s.rows[0]?.currency ?? "USD";
  const color: Record<string, string> = { sky: "#3a6c8f", amber: "#9a6512", violet: "#6b4f93", rose: "#a13d4f", teal: "#2b7470", emerald: "#357049", slate: "#5b6670", stone: "#a9a395" };
  if (!entries.length) return null;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-rule" aria-hidden>
        {entries.map(([r, v]) => (
          <span key={r} style={{ width: `${(v.dueMinor / total) * 100}%`, background: color[r === "undiagnosed" ? "stone" : REASON_META[r as StuckReason].tone], opacity: active && active !== r ? 0.25 : 1 }} className="transition-opacity" />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-1 gap-y-1.5 text-sm" aria-label="Filter by reason">
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
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<null | "sync" | "diagnose" | "seed">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [flash, setFlash] = useState<string[]>([]);
  const prev = useRef<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    try {
      const s = await api<Snapshot>("/api/board");
      // Flash rows whose money or next step changed (e.g. a webhook arrived).
      const changed: string[] = [];
      for (const r of s.rows) {
        const sig = `${r.dueMinor}|${r.status}|${r.next?.status}|${r.reason}`;
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

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [load]);

  const refreshAll = () => {
    setVersion((v) => v + 1);
    load();
  };

  async function run(kind: "sync" | "diagnose" | "seed") {
    setBusy(kind);
    setNotice(null);
    try {
      if (kind === "sync") {
        const r = await api<{ count: number }>("/api/sync", { body: {} });
        setNotice(`Synced ${r.count} invoices.`);
      } else if (kind === "diagnose") {
        const r = await api<{ results: { ok: boolean }[] }>("/api/diagnose", { body: {} });
        const failed = r.results.filter((x) => !x.ok).length;
        setNotice(failed ? `Diagnosed ${r.results.length - failed} invoices; ${failed} failed.` : `Diagnosed ${r.results.length} open invoices.`);
      } else {
        await api("/api/demo/reset", { body: {} });
        setNotice("Demo studio loaded.");
      }
      refreshAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const clientById = useMemo(() => new Map(snap?.rows.map((r) => [r.id, r]) ?? []), [snap]);
  const undiagnosed = snap?.rows.filter((r) => r.open && !r.reason).length ?? 0;
  const simulation = snap?.mode.paypal === "simulation";

  return (
    <div className="min-h-dvh">
      <AppHeader
        mode={snap?.mode}
        business={snap?.policy.businessName}
        right={
          <Button variant="ghost" onClick={() => run("sync")} busy={busy === "sync"} disabled={!!busy}>
            Sync with PayPal
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
                ? "Load a demo studio with seven unpaid invoices, each stuck for a different reason. No PayPal credentials are needed; everything runs as a labelled simulation."
                : "Unstuck reads invoices from your PayPal sandbox account. Sync to import them, or run npm run seed:sandbox to create the demo invoices in your sandbox."}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              {simulation ? (
                <Button variant="primary" onClick={() => run("seed")} busy={busy === "seed"}>
                  Load the demo studio
                </Button>
              ) : (
                <Button variant="primary" onClick={() => run("sync")} busy={busy === "sync"}>
                  Sync with PayPal
                </Button>
              )}
            </div>
          </section>
        )}

        {snap && snap.rows.length > 0 && (
          <>
            <section className="grid gap-8 pt-10 pb-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
              <div className="min-w-0">
                <HeroSentence s={snap} />
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Button variant="primary" onClick={() => run("diagnose")} busy={busy === "diagnose"} disabled={!!busy}>
                    {busy === "diagnose" ? "Reading invoices and replies" : undiagnosed ? `Diagnose ${undiagnosed === snap.kpis.openCount ? "all" : undiagnosed} open invoice${undiagnosed === 1 ? "" : "s"}` : "Diagnose again"}
                  </Button>
                  <p className="text-sm text-ink-soft">
                    Collected after Unstuck stepped in: <span className="font-display tabular text-base text-ink">{money(snap.kpis.cashUnstuckMinor, snap.rows[0]?.currency, true)}</span>
                  </p>
                </div>
                {notice && <p className="mt-3 text-sm text-ok" role="status">{notice}</p>}
                <div className="mt-8">
                  <ReasonStrip s={snap} active={reason} onPick={setReason} />
                </div>
                {snap.recent.length > 0 && (
                  <div className="mt-8">
                    <h2 className="text-sm text-ink-soft">Recently</h2>
                    <ul className="mt-2 divide-y divide-rule border-y border-rule">
                      {snap.recent.map((e) => (
                        <li key={e.id}>
                          <button className="flex w-full items-baseline gap-3 py-2 text-left text-sm hover:bg-surface/70" onClick={() => e.invoiceId && setOpenId(e.invoiceId)}>
                            <span className="w-24 shrink-0 text-xs text-ink-faint">{relTime(e.at)}</span>
                            <span className="min-w-0 flex-1 truncate text-ink">
                              {e.client && <span className="font-medium">{e.client}: </span>}
                              {e.summary}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <aside aria-labelledby="needs-h" className="min-w-0">
                <h2 id="needs-h" className="flex items-baseline justify-between">
                  <span className="font-display text-xl text-ink">Needs you</span>
                  <span className="text-sm text-ink-faint">{snap.pending.length ? `${snap.pending.length} waiting` : ""}</span>
                </h2>
                <div className="mt-3 max-h-[560px] space-y-3 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,black_92%,transparent)]">
                  {snap.pending.length === 0 ? (
                    <p className="rounded-[var(--radius-soft)] border border-dashed border-rule-strong px-4 py-6 text-sm text-ink-soft">
                      {undiagnosed ? "Diagnose your invoices and anything that changes money or needs your judgement will wait here." : "Nothing needs your approval. Reminders inside your rules go out on their own."}
                    </p>
                  ) : (
                    snap.pending.map((a) => (
                      <ActionCard key={`${a.id}-${a.status}`} action={a} compact currency={clientById.get(a.invoice_id)?.currency ?? "USD"} clientName={clientById.get(a.invoice_id)?.client} onChanged={refreshAll} />
                    ))
                  )}
                </div>
              </aside>
            </section>

            <section aria-labelledby="board-h">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 id="board-h" className="font-display text-xl text-ink">
                  Every invoice{reason ? `: ${reason === "undiagnosed" ? "not diagnosed" : REASON_META[reason as StuckReason].short.toLowerCase()}` : ""}
                </h2>
                <div className="flex items-center gap-2">
                  {simulation && (
                    <Button variant="ghost" onClick={() => run("seed")} busy={busy === "seed"} disabled={!!busy} title="Wipe and re-seed the simulated demo">
                      Reset demo
                    </Button>
                  )}
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients, numbers, notes" aria-label="Search invoices" className="w-64 rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div className="h-[560px]">
                <Board rows={snap.rows} reasonFilter={reason} quickFilter={q} onOpen={setOpenId} selectedId={openId} flashIds={flash} />
              </div>
            </section>
          </>
        )}
      </main>

      {openId && <InvoiceDrawer id={openId} version={version} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
