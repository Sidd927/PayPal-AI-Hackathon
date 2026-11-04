"use client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AgGridReact, type CustomCellRendererProps } from "ag-grid-react";
import { AllCommunityModule, type ColDef, type GetRowIdParams, type IRowNode, ModuleRegistry, type RowClassParams, themeQuartz } from "ag-grid-community";
import type { BoardRow } from "@/lib/services/board";
import { ACTION_META } from "@/lib/domain";
import { money, shortDate } from "@/lib/client";
import { ReasonPhrase } from "./ui";

ModuleRegistry.registerModules([AllCommunityModule]);

const unstuckTheme = themeQuartz.withParams({
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  backgroundColor: "#fafbf8",
  foregroundColor: "#17312a",
  headerBackgroundColor: "#eef2eb",
  headerTextColor: "#52645c",
  headerFontWeight: 500,
  borderColor: "#d3ddd2",
  rowBorder: { color: "#e3e9e2" },
  columnBorder: false,
  wrapperBorderRadius: 10,
  accentColor: "#a86b0c",
  rowHoverColor: "#f3f6f0",
  selectedRowBackgroundColor: "#fbefd8",
  spacing: 7,
});

type PinnedTotal = { id: string; client: string; dueMinor: number; currency: string; __total: true };

function ClientCell(p: CustomCellRendererProps<BoardRow>) {
  const r = p.data;
  if (!r) return null;
  if ((r as unknown as PinnedTotal).__total) return <span className="font-medium text-ink-soft">{(r as unknown as PinnedTotal).client}</span>;
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="truncate font-medium text-ink">{r.client}</span>
      <span className="truncate text-xs text-ink-faint">
        {r.number ?? "Draft"}
        {r.contact ? `, ${r.contact}` : ""}
      </span>
    </div>
  );
}

function AmountCell(p: CustomCellRendererProps<BoardRow>) {
  const r = p.data;
  if (!r) return null;
  const total = (r as unknown as PinnedTotal).__total;
  const paidShare = !total && r.totalMinor ? r.paidMinor / r.totalMinor : 0;
  return (
    <div className="flex w-full flex-col items-end leading-tight">
      <span className={`font-display tabular text-[1.05rem] ${total ? "font-semibold" : ""}`}>{money(r.dueMinor, r.currency)}</span>
      {!total && r.paidMinor > 0 && (
        <span className="mt-1 flex w-20 overflow-hidden rounded-full bg-rule" title={`${money(r.paidMinor, r.currency)} paid of ${money(r.totalMinor, r.currency)}`}>
          <span className="h-1 bg-ok" style={{ width: `${Math.round(paidShare * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function AgeCell(p: CustomCellRendererProps<BoardRow>) {
  const r = p.data;
  if (!r || (r as unknown as PinnedTotal).__total) return null;
  if (!r.open) return <span className="text-sm text-ok">{r.status === "PAID" ? "Paid" : r.status === "MARKED_AS_PAID" ? "Marked paid" : r.status.toLowerCase()}</span>;
  const d = r.daysOverdue;
  return (
    <div className="flex flex-col leading-tight">
      <span className={`tabular text-sm ${d > 30 ? "font-semibold text-alert" : d > 0 ? "text-ink" : "text-ink-soft"}`}>{d > 0 ? `${d} days late` : d === 0 ? "Due today" : `Due in ${-d} days`}</span>
      <span className="text-xs text-ink-faint">{shortDate(r.dueDate)}</span>
    </div>
  );
}

function ReasonCell(p: CustomCellRendererProps<BoardRow>) {
  const r = p.data;
  if (!r || (r as unknown as PinnedTotal).__total || !r.open) return null;
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <ReasonPhrase reason={r.reason} size="sm" />
      {r.confidence !== null && <span className="mt-0.5 text-xs text-ink-faint">{Math.round(r.confidence * 100)}% sure{r.source === "rules" ? ", rules only" : ""}</span>}
    </div>
  );
}

function NextCell(p: CustomCellRendererProps<BoardRow>) {
  const r = p.data;
  if (!r || (r as unknown as PinnedTotal).__total || !r.open) return null;
  if (r.plan) {
    return (
      <div className="flex flex-col leading-tight">
        <span className="text-sm text-ink">
          Plan: {r.plan.paidCount} of {r.plan.count} paid
        </span>
        {r.plan.nextDue && <span className="text-xs text-ink-faint">Next by {shortDate(r.plan.nextDue)}</span>}
      </div>
    );
  }
  if (!r.next) return <span className="text-sm text-ink-faint">—</span>;
  const s = r.next.status;
  const label = ACTION_META[r.next.type].label;
  const state =
    s === "proposed" ? <span className="text-marigold-deep">Waiting for you</span> : s === "executed" ? <span className="text-ok">Done</span> : s === "failed" ? <span className="text-alert">Failed</span> : s === "blocked" ? <span className="text-alert">Blocked by policy</span> : <span className="text-ink-faint">{s}</span>;
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-sm text-ink">{label}</span>
      <span className="text-xs">{state}</span>
    </div>
  );
}

export function Board({
  rows,
  reasonFilter,
  quickFilter,
  onOpen,
  selectedId,
  flashIds,
}: {
  rows: BoardRow[];
  reasonFilter: string | null;
  quickFilter: string;
  onOpen: (id: string) => void;
  selectedId: string | null;
  flashIds: string[];
}) {
  const gridRef = useRef<AgGridReact<BoardRow>>(null);

  const columnDefs = useMemo<ColDef<BoardRow>[]>(
    () => [
      { headerName: "Client", field: "client", cellRenderer: ClientCell, flex: 1.5, minWidth: 190, getQuickFilterText: (p) => `${p.data?.client} ${p.data?.number} ${p.data?.contact} ${p.data?.email}` },
      { headerName: "Owed", field: "dueMinor", cellRenderer: AmountCell, width: 140, type: "rightAligned", sort: undefined },
      {
        headerName: "Timing",
        colId: "timing",
        // Open invoices first (most overdue at the top); settled invoices sink to the bottom.
        valueGetter: (p) => (p.data && p.data.open ? p.data.daysOverdue : -100_000),
        cellRenderer: AgeCell,
        width: 140,
        sort: "desc",
        sortingOrder: ["desc", "asc"],
      },
      { headerName: "Why it's stuck", field: "reason", cellRenderer: ReasonCell, flex: 1.4, minWidth: 200, getQuickFilterText: (p) => p.data?.summary ?? "", tooltipField: "summary" },
      { headerName: "Next step", colId: "next", cellRenderer: NextCell, flex: 1.2, minWidth: 180, sortable: false },
    ],
    [],
  );

  const pinnedBottom = useMemo(() => {
    const open = rows.filter((r) => r.open && (!reasonFilter || (r.reason ?? "undiagnosed") === reasonFilter));
    if (!open.length) return [];
    return [{ id: "__total", client: `${open.length} open invoice${open.length === 1 ? "" : "s"}`, dueMinor: open.reduce((s, r) => s + r.dueMinor, 0), currency: open[0]!.currency, __total: true } as unknown as BoardRow];
  }, [rows, reasonFilter]);

  const isExternalFilterPresent = useCallback(() => reasonFilter !== null, [reasonFilter]);
  const doesExternalFilterPass = useCallback((node: IRowNode<BoardRow>) => !reasonFilter || (node.data?.open && (node.data.reason ?? "undiagnosed") === reasonFilter) || false, [reasonFilter]);

  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [reasonFilter]);

  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api || !flashIds.length) return;
    const nodes = flashIds.map((id) => api.getRowNode(id)).filter(Boolean) as IRowNode<BoardRow>[];
    if (nodes.length) api.flashCells({ rowNodes: nodes, flashDuration: 900, fadeDuration: 700 });
  }, [flashIds, rows]);

  return (
    <div className="ag-theme-unstuck h-full w-full">
      <AgGridReact<BoardRow>
        ref={gridRef}
        theme={unstuckTheme}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
        getRowId={(p: GetRowIdParams<BoardRow>) => p.data.id}
        rowHeight={62}
        headerHeight={40}
        quickFilterText={quickFilter}
        isExternalFilterPresent={isExternalFilterPresent}
        doesExternalFilterPass={doesExternalFilterPass}
        pinnedBottomRowData={pinnedBottom}
        tooltipShowDelay={400}
        getRowClass={(p: RowClassParams<BoardRow>) => (p.data?.id === selectedId ? "ag-row-selected" : p.data && !p.data.open ? "opacity-60" : undefined)}
        onRowClicked={(e) => e.data && !(e.data as unknown as PinnedTotal).__total && onOpen(e.data.id)}
        overlayNoRowsTemplate="<span style='color:#52645c'>No invoices yet. Sync from PayPal or load the demo studio.</span>"
        animateRows
        suppressCellFocus
        domLayout="normal"
      />
    </div>
  );
}
