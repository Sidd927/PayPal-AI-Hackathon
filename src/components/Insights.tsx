"use client";
import { useEffect, useMemo, useState } from "react";
import { AgStudio } from "ag-studio-react";
import { AgStudioLicenseManager, type AgReportState, studioTheme } from "ag-studio";
import { api } from "@/lib/client";
import { Spinner } from "./ui";

const key = process.env.NEXT_PUBLIC_AG_GRID_LICENSE_KEY;
if (key) AgStudioLicenseManager.setLicenseKey(key);

// Brand tokens; the chart palette reuses the stuck-reason hues so colours mean the same thing everywhere.
const theme = studioTheme.withParams({
  fontFamily: "Instrument Sans Variable, Segoe UI, sans-serif",
  accentColor: "#a86b0c",
  foregroundColor: "#17312a",
  backgroundColor: "#fafbf8",
  chartPaletteFills1Color: "#6b4f93",
  chartPaletteFills2Color: "#a13d4f",
  chartPaletteFills3Color: "#357049",
  chartPaletteFills4Color: "#9a6512",
  chartPaletteFills5Color: "#2b7470",
  chartPaletteFills6Color: "#3a6c8f",
  chartPaletteFills7Color: "#5b6670",
  chartPaletteFills8Color: "#a9a395",
});

const FIELD_NAMES: Record<string, Record<string, string>> = {
  invoices: { client: "Client", number: "Invoice", status: "Status", stuck_reason: "Stuck reason", risk_band: "Risk band", risk_score: "Risk score", days_overdue: "Days overdue", amount_due: "Amount due", amount_paid: "Paid", total: "Total", next_step: "Next step", invoice_id: "Invoice id" },
  actions: { action_id: "Action id", client: "Client", action: "Action", proposed_by: "Proposed by", rule_decision: "Rule decision", status: "Status", created: "Date" },
  payments: { client: "Client", amount: "Amount", date: "Date", source: "Source" },
};
const CURRENCY = new Set(["amount_due", "amount_paid", "total", "amount"]);
const INTEGER = new Set(["risk_score", "days_overdue"]);
const fieldsFor = (table: string) =>
  Object.entries(FIELD_NAMES[table]!).map(([id, name]) => ({
    id,
    name,
    format: CURRENCY.has(id) ? "currencyFormat" : INTEGER.has(id) ? "integerFormat" : "textFormat",
    ...(CURRENCY.has(id) ? { formatOptions: { format: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) } } : {}),
    ...(id.endsWith("_id") ? { hide: true } : {}),
  }));

type Data = { invoices: Record<string, unknown>[]; actions: Record<string, unknown>[]; payments: Record<string, unknown>[] };

const f = (id: string, aggregation?: "sum" | "count" | "countd" | "avg" | "max") => ({ id, ...(aggregation ? { aggregation } : {}) });
const title = (text: string) => ({ title: { enabled: true, text } });

/** The pre-built receivables report. Owners can switch to edit mode and build their own. */
const REPORT = {
  selectedPageId: "receivables",
  pages: [
    {
      id: "receivables",
      layout: { columns: 12, rowHeight: 56 },
      widgets: {
        owed: { type: "value", format: title("Still owed"), dataMapping: { value: [f("invoices.amount_due", "sum")] } },
        overdue: { type: "value", format: title("Avg days late"), dataMapping: { value: [f("invoices.days_overdue", "avg")] } },
        collected: { type: "value", format: title("Collected"), dataMapping: { value: [f("payments.amount", "sum")] } },
        actions: { type: "value", format: title("Agent actions"), dataMapping: { value: [f("actions.action_id", "count")] } },
        byReason: { type: "donut-chart", format: title("Owed by stuck reason"), dataMapping: { categoryKey: [f("invoices.stuck_reason")], valueKey: [f("invoices.amount_due", "sum")] } },
        byRisk: {
          type: "column-chart-stacked",
          format: title("Owed by risk band"),
          dataMapping: { categoryKey: [f("invoices.risk_band")], valueKey: [f("invoices.amount_due", "sum")], legendKey: [f("invoices.stuck_reason")] },
        },
        decisions: {
          type: "bar-chart-stacked",
          format: title("What the agent did, by rule decision"),
          dataMapping: { categoryKey: [f("actions.action")], valueKey: [f("actions.action_id", "count")], legendKey: [f("actions.rule_decision")] },
        },
        ledger: {
          type: "grid",
          format: title("Receivables ledger"),
          dataMapping: {
            cols: [f("invoices.client"), f("invoices.number"), f("invoices.stuck_reason"), f("invoices.risk_score"), f("invoices.days_overdue"), f("invoices.amount_due"), f("invoices.next_step")],
          },
        },
      },
      widgetLayout: {
        owed: { xTrack: 0, yTrack: 0, xSpan: 3, ySpan: 2 },
        overdue: { xTrack: 3, yTrack: 0, xSpan: 3, ySpan: 2 },
        collected: { xTrack: 6, yTrack: 0, xSpan: 3, ySpan: 2 },
        actions: { xTrack: 9, yTrack: 0, xSpan: 3, ySpan: 2 },
        byReason: { xTrack: 0, yTrack: 2, xSpan: 4, ySpan: 6 },
        byRisk: { xTrack: 4, yTrack: 2, xSpan: 4, ySpan: 6 },
        decisions: { xTrack: 8, yTrack: 2, xSpan: 4, ySpan: 6 },
        ledger: { xTrack: 0, yTrack: 8, xSpan: 12, ySpan: 9 },
      },
    },
  ],
} as unknown as AgReportState;

export default function Insights() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  useEffect(() => {
    api<Data>("/api/insights").then(setData, (e) => setError(e.message));
  }, []);
  const sources = useMemo(
    () =>
      data && {
        sources: [
          { id: "invoices", name: "Open invoices", data: data.invoices.filter((i) => i.status !== "Settled") as never, fields: fieldsFor("invoices") as never },
          { id: "actions", name: "Agent actions", data: data.actions as never, fields: fieldsFor("actions") as never },
          { id: "payments", name: "Payments received", data: data.payments as never, fields: fieldsFor("payments") as never },
        ],
      },
    [data],
  );
  if (error) return <p className="text-alert">{error}</p>;
  if (!sources) return <Spinner label="Loading insights" />;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))} className="rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-3 py-1.5 text-sm hover:border-ink-soft" aria-pressed={mode === "edit"}>
          {mode === "view" ? "Build your own report" : "Done editing"}
        </button>
      </div>
      <div className="h-[1060px] overflow-hidden rounded-[var(--radius-soft)] border border-rule bg-surface">
        <AgStudio data={sources} mode={mode} initialState={REPORT} theme={theme} />
      </div>
    </div>
  );
}
