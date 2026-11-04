"use client";
import { useEffect, useMemo, useState } from "react";
import type { runView } from "@/lib/services/agent";
import { api, relTime } from "@/lib/client";

export type RunView = NonNullable<ReturnType<typeof runView>>;
type Step = RunView["steps"][number];

const ICON: Record<Step["status"], string> = { ok: "✓", info: "•", warn: "!", error: "✕", skip: "–" };
const TONE: Record<Step["status"], string> = { ok: "text-ok", info: "text-ink-soft", warn: "text-marigold-deep", error: "text-alert", skip: "text-ink-faint" };
const KIND: Record<string, string> = { sync: "Sync", prioritise: "Prioritise", gather: "Gather", diagnose: "Diagnose", plan: "Plan", policy: "Rules", act: "Act", follow_up: "Follow up", done: "Done" };

/** Live trace of what the agent is doing and why. Polls while a run is in progress. */
export function AgentRunTrace({ running, onFinished, initial }: { running: boolean; onFinished: () => void; initial: RunView | null }) {
  const [run, setRun] = useState<RunView | null>(initial);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => setRun(initial), [initial]);

  useEffect(() => {
    if (!running) return;
    setExpanded(true);
    let stop = false;
    const tick = async () => {
      try {
        const r = await api<RunView | { none: true }>("/api/agent/runs/latest");
        if (!stop && !("none" in r)) setRun(r);
      } catch {}
      if (!stop) setTimeout(tick, 700);
    };
    tick();
    return () => {
      stop = true;
      onFinished();
    };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => (run?.steps ?? []).filter((s) => s.kind !== "gather" || expanded), [run, expanded]);
  if (!run) return null;
  const s = run.summary;
  const visible = expanded ? steps : steps.slice(-4);

  return (
    <section aria-labelledby="run-h" className="rounded-[var(--radius-soft)] border border-rule bg-surface">
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3">
        <h2 id="run-h" className="text-sm font-medium text-ink">
          {run.status === "running" ? "Agent is working" : "Last agent run"}
          <span className="ml-2 font-normal text-ink-faint">{run.status === "running" ? `${run.steps.length} steps so far` : relTime(run.finished_at ?? run.started_at)}</span>
        </h2>
        <button className="text-xs text-ink-soft underline decoration-rule-strong underline-offset-4 hover:text-ink" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "Show less" : `All ${run.steps.length} steps`}
        </button>
      </header>
      {s && run.status !== "running" && (
        <p className="px-4 pt-3 text-sm text-ink">
          <span className="font-display tabular text-base">{s.autoExecuted}</span> done within your rules, <span className="font-display tabular text-base">{s.awaitingApproval}</span> waiting for you, {s.diagnosed} diagnosed
          {s.unchanged ? `, ${s.unchanged} unchanged` : ""}
          {s.errors ? <span className="text-alert">, {s.errors} error(s)</span> : null}
        </p>
      )}
      <ol className={`space-y-1.5 px-4 py-3 text-sm ${expanded ? "max-h-[360px] overflow-y-auto" : ""}`} aria-live={run.status === "running" ? "polite" : undefined}>
        {visible.map((st, i) => (
          <li key={st.id} className="grid grid-cols-[1rem_4.5rem_1fr] gap-x-2">
            {st.client && st.client !== visible[i - 1]?.client && <span className="col-span-3 mt-2 text-xs font-medium text-ink">{st.client}</span>}
            <span aria-hidden className={`${TONE[st.status]} text-center`}>
              {ICON[st.status]}
            </span>
            <span className="text-xs leading-5 text-ink-faint">{KIND[st.kind] ?? st.kind}</span>
            <span className="min-w-0">
              <span className={st.status === "skip" ? "text-ink-faint" : "text-ink"}>{st.label}</span>
              {st.detail && expanded && <span className="block truncate text-xs text-ink-faint" title={st.detail}>{st.detail}</span>}
            </span>
          </li>
        ))}
        {run.status === "running" && (
          <li className="grid grid-cols-[1rem_4.5rem_1fr] gap-2 text-ink-faint">
            <span aria-hidden className="mx-auto mt-1 size-2.5 animate-ping rounded-full bg-marigold" />
            <span />
            <span>Working…</span>
          </li>
        )}
      </ol>
    </section>
  );
}
