"use client";
import type { BoardRow } from "@/lib/services/board";
import { ACTION_META } from "@/lib/domain";
import { money, shortDate } from "@/lib/client";
import { ReasonPhrase, RiskPill } from "./ui";

/** Small-screen alternative to the AG Grid board: the reason stays visible on a phone. */
export function InvoiceCards({ rows, onOpen }: { rows: BoardRow[]; onOpen: (id: string) => void }) {
  const open = rows.filter((r) => r.open).sort((a, b) => b.risk.score - a.risk.score);
  if (!open.length) return <p className="text-sm text-ink-soft">No open invoices match.</p>;
  return (
    <ul className="space-y-2.5">
      {open.map((r) => (
        <li key={r.id}>
          <button onClick={() => onOpen(r.id)} className="w-full rounded-[var(--radius-soft)] border border-rule bg-surface p-4 text-left hover:border-rule-strong">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{r.client}</p>
                <p className="text-xs text-ink-faint">
                  {r.number}, {r.daysOverdue > 0 ? `${r.daysOverdue} days late` : `due ${shortDate(r.dueDate)}`}
                </p>
              </div>
              <p className="font-display tabular text-lg text-ink">{money(r.dueMinor, r.currency)}</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <ReasonPhrase reason={r.reason} size="sm" />
              <RiskPill risk={r.risk} />
            </div>
            {(r.next || r.plan) && (
              <p className="mt-2 text-xs text-ink-soft">
                {r.plan ? `Plan: ${r.plan.paidCount} of ${r.plan.count} paid` : `${ACTION_META[r.next!.type].label}: ${r.next!.status === "proposed" ? "waiting for you" : r.next!.status === "executed" ? "done" : r.next!.status}`}
              </p>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
