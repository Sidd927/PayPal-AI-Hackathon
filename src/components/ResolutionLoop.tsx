"use client";
import type { LoopStage } from "@/lib/services/loop-stages";
import { money } from "@/lib/client";

export type LoopEntry = { stage: LoopStage; count: number; amountMinor: number; missed: number; items: { id: string; client: string; missed: boolean }[] };

/** Plain-language names for the loop. Every number under them comes from recorded state. */
export const STAGE_META: Record<LoopStage, { label: string; hint: string; amountLabel: string }> = {
  detected: { label: "Spotted", hint: "Late or unanswered, not diagnosed yet", amountLabel: "owed" },
  diagnosed: { label: "Understood", hint: "The agent knows why; nothing to send yet", amountLabel: "owed" },
  approval: { label: "Waiting for you", hint: "A fix is ready and needs your OK", amountLabel: "owed" },
  acted: { label: "Acted", hint: "Done in PayPal or by you; waiting on the client", amountLabel: "owed" },
  agreed: { label: "Agreed", hint: "Plan or promise in place; tracking payments", amountLabel: "still owed" },
  paid: { label: "Paid", hint: "Collected after Unstuck acted", amountLabel: "collected" },
};

/**
 * The resolution loop, the product's centrepiece: every open invoice sits in exactly one stage, computed on
 * the server from diagnoses, action statuses, plans, promises and PayPal's status. Missed promises are
 * flagged where they sit and go back to the agent on its next run.
 */
export function ResolutionLoop({ loop, currency, onOpen }: { loop: LoopEntry[]; currency: string; onOpen: (id: string) => void }) {
  const missed = loop.reduce((s, l) => s + l.missed, 0);
  return (
    <section aria-labelledby="loop-h" className="overflow-hidden rounded-[var(--radius-soft)] border border-rule bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-5 py-3.5">
        <h2 id="loop-h" className="font-display text-xl text-ink">
          The resolution loop
        </h2>
        <p className="text-sm text-ink-soft">
          Spot it, understand why, fix it within your rules, follow it to payment.
          {missed > 0 && (
            <span className="ml-2 font-medium text-alert">
              {missed} missed {missed === 1 ? "promise" : "promises"}, back with the agent.
            </span>
          )}
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-3 xl:grid-cols-6">
        {loop.map((l, i) => {
          const meta = STAGE_META[l.stage];
          const empty = l.count === 0;
          const tone = l.stage === "approval" && !empty ? "text-marigold-deep" : l.stage === "paid" && !empty ? "text-ok" : empty ? "text-ink-faint" : "text-ink";
          return (
            <li
              key={l.stage}
              data-stage={l.stage}
              className={`min-w-0 px-4 py-4 ${l.stage === "approval" && !empty ? "bg-marigold-wash" : "bg-surface"}`}
            >
              <p className="flex items-center gap-2 text-xs text-ink-faint">
                <span aria-hidden className={`flex size-5 items-center justify-center rounded-full border text-[10px] ${empty ? "border-rule text-ink-faint" : "border-ink-soft text-ink"}`}>
                  {i + 1}
                </span>
                <span className="sr-only">Stage {i + 1}:</span>
                <span className={`text-sm font-medium ${empty ? "text-ink-faint" : "text-ink"}`}>{meta.label}</span>
              </p>
              <p className={`font-display tabular mt-2 text-3xl leading-none ${tone}`}>
                {l.count}
                <span className="ml-1.5 font-sans text-xs text-ink-faint">{l.count === 1 ? "invoice" : "invoices"}</span>
              </p>
              <p className="mt-1 text-xs text-ink-soft">{empty ? meta.hint : `${money(l.amountMinor, currency, true)} ${meta.amountLabel}`}</p>
              {!empty && (
                <ul className="mt-2.5 flex flex-wrap gap-1">
                  {l.items.slice(0, 3).map((it) => (
                    <li key={it.id}>
                      <button
                        onClick={() => onOpen(it.id)}
                        className={`max-w-[11rem] truncate rounded-full border px-2 py-0.5 text-xs hover:border-ink-soft ${it.missed ? "border-alert/40 bg-alert-wash text-alert" : "border-rule-strong bg-paper text-ink-soft"}`}
                        title={it.missed ? `${it.client}: promise or installment missed` : `Open ${it.client}`}
                      >
                        {it.missed ? "! " : ""}
                        {it.client}
                      </button>
                    </li>
                  ))}
                  {l.items.length > 3 && <li className="px-1 py-0.5 text-xs text-ink-faint">+{l.items.length - 3} more</li>}
                </ul>
              )}
              {!empty && <p className="mt-2 text-[11px] leading-snug text-ink-faint">{meta.hint}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
