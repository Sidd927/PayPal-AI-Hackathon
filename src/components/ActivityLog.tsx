"use client";
import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, type ColDef, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { api } from "@/lib/client";
import { AppHeader } from "./AppHeader";
import { Spinner } from "./ui";

ModuleRegistry.registerModules([AllCommunityModule]);

type Ev = { id: number; at: string; kind: string; actor: string; summary: string; data: any; invoice_number: string | null; client: string | null };

const theme = themeQuartz.withParams({
  fontFamily: "var(--font-sans)", fontSize: 13.5, backgroundColor: "#fafbf8", foregroundColor: "#17312a", headerBackgroundColor: "#eef2eb",
  headerTextColor: "#52645c", borderColor: "#d3ddd2", rowBorder: { color: "#e3e9e2" }, columnBorder: false, wrapperBorderRadius: 10, accentColor: "#a86b0c", spacing: 6,
});

const ACTOR: Record<string, string> = { ai: "Claude", rules: "Rules", unstuck: "Unstuck", paypal: "PayPal", owner: "You", client: "Client", agent: "Unstuck", payer: "Client", system: "System", simulation: "Simulation" };

function receiptText(d: any): string {
  const r = d?.receipts ?? (d?.receipt ? [d.receipt] : null);
  if (d?.request_id) return `Claude request ${d.request_id}${typeof d.latency_ms === "number" ? `, ${(d.latency_ms / 1000).toFixed(1)}s` : ""}`;
  if (!Array.isArray(r) || !r.length) return d?.debugId ? `debug id ${d.debugId}` : "";
  return r.map((x: any) => `${x.simulated ? "sim " : ""}${x.operation} → ${x.status}${x.debugId && !x.simulated ? ` (${x.debugId})` : ""}`).join("; ");
}

export function ActivityLog() {
  const [rows, setRows] = useState<Ev[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const load = () => api<Ev[]>("/api/activity").then(setRows).catch(() => setRows([]));
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  const cols = useMemo<ColDef<Ev>[]>(
    () => [
      { headerName: "When", field: "at", width: 150, sort: "desc", valueFormatter: (p) => new Date(p.value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) },
      { headerName: "Who", field: "actor", width: 110, valueFormatter: (p) => ACTOR[p.value] ?? p.value, filter: true },
      { headerName: "Invoice", field: "client", width: 190, valueFormatter: (p) => (p.data?.client ? `${p.data.client} (${p.data.invoice_number})` : "—"), filter: true },
      { headerName: "What happened", field: "summary", flex: 2, minWidth: 320, wrapText: true, autoHeight: true },
      { headerName: "Receipt", colId: "receipt", flex: 1, minWidth: 220, valueGetter: (p) => receiptText(p.data?.data), wrapText: true, autoHeight: true, cellClass: "text-xs text-ink-soft" },
    ],
    [],
  );
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-[1320px] px-4 py-8 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-ink">Activity</h1>
            <p className="mt-1 max-w-2xl text-ink-soft">Every diagnosis, policy decision, approval and PayPal call, with PayPal&rsquo;s debug ids so any action can be traced.</p>
          </div>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity" aria-label="Search activity" className="w-64 rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-3 py-1.5 text-sm" />
        </div>
        {!rows ? (
          <Spinner label="Loading activity" />
        ) : (
          <div className="h-[70dvh]">
            <AgGridReact<Ev> theme={theme} rowData={rows} columnDefs={cols} quickFilterText={q} getRowId={(p) => String(p.data.id)} defaultColDef={{ sortable: true, resizable: true }} suppressCellFocus overlayNoRowsTemplate="<span>No activity yet.</span>" />
          </div>
        )}
      </main>
    </div>
  );
}
