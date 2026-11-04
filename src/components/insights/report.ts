/**
 * AG Studio report definitions for Unstuck Insights: field metadata, the default report page, and the
 * predefined views the Unstuck Insights agent can open. Every view reads only the predefined tables.
 */
import type { AgReportState } from "ag-studio";
import type { InsightsTables } from "@/lib/services/insights";

type Agg = "sum" | "count" | "countd" | "avg" | "max";
const f = (id: string, aggregation?: Agg) => ({ id, ...(aggregation ? { aggregation } : {}) });
const title = (text: string) => ({ title: { enabled: true, text } });

const NAMES: Record<string, Record<string, string>> = {
  invoices: { invoice_id: "Invoice id", client: "Client", number: "Invoice", stuck_reason: "Stuck reason", aging: "Aging", risk_band: "Risk band", risk_score: "Risk score", days_overdue: "Days overdue", days_since_client_reply: "Days since client reply", amount_due: "Amount due", next_step: "Next step", awaiting_approval: "Awaiting approval" },
  actions: { action_id: "Action id", client: "Client", action: "Action", proposed_by: "Proposed by", rule_decision: "Rule decision", status: "Status" },
  payments: { client: "Client", amount: "Amount", date: "Date", source: "Source", timing: "Timing" },
  promises: { client: "Client", promised_by: "Promised by", status: "Status", amount_due: "Amount due" },
  approvals: { client: "Client", action: "Action", changes_money: "Changes money", waiting_since: "Waiting since", why: "Why it needs you" },
};
const DESCRIPTIONS: Record<string, string> = {
  invoices: "Open invoices in Unstuck, one row per invoice, with the agent's diagnosis and a transparent heuristic risk score.",
  actions: "Every action the agent, a client or the owner proposed, and how the rules decided.",
  payments: "Payments recorded on invoices. Source says whether it came from PayPal or the demo simulation.",
  promises: "Promises to pay made on the client resolution page (latest per invoice).",
  approvals: "Actions waiting for the owner's approval.",
};
const CURRENCY = new Set(["amount_due", "amount"]);
const INTEGER = new Set(["risk_score", "days_overdue", "days_since_client_reply"]);

export function dataSources(t: InsightsTables) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: t.currency, maximumFractionDigits: 0 });
  const fields = (table: string) =>
    Object.entries(NAMES[table]!).map(([id, name]) => ({
      id,
      name,
      format: CURRENCY.has(id) ? "currencyFormat" : INTEGER.has(id) ? "integerFormat" : "textFormat",
      ...(CURRENCY.has(id) ? { formatOptions: { format: money } } : {}),
      ...(id.endsWith("_id") ? { hide: true } : {}),
    }));
  const table = (id: string, name: string, data: object[]) => ({ id, name, description: DESCRIPTIONS[id], data: data as never, fields: fields(id) as never });
  return {
    sources: [
      table("invoices", "Open invoices", t.invoices),
      table("actions", "Agent actions", t.actions),
      table("payments", "Payments received", t.payments),
      table("promises", "Promises to pay", t.promises),
      table("approvals", "Awaiting approval", t.approvals),
    ],
  };
}

type Widget = Record<string, unknown>;
type Layout = { xTrack: number; yTrack: number; xSpan: number; ySpan: number };
function page(id: string, widgets: Record<string, Widget>, layout: Record<string, Layout>) {
  return { id, layout: { columns: 12, rowHeight: 56 }, widgets, widgetLayout: layout };
}
const value = (text: string, id: string, agg: Agg) => ({ type: "value", format: title(text), dataMapping: { value: [f(id, agg)] } });
const grid = (text: string, cols: string[]) => ({ type: "grid", format: title(text), dataMapping: { cols: cols.map((c) => f(c)) } });

export const OVERVIEW = page(
  "receivables",
  {
    owed: value("Still owed", "invoices.amount_due", "sum"),
    late: value("Avg days overdue", "invoices.days_overdue", "avg"),
    collected: value("Collected", "payments.amount", "sum"),
    waiting: value("Waiting for you", "approvals.action", "count"),
    byReason: { type: "donut-chart", format: title("Owed by stuck reason"), dataMapping: { categoryKey: [f("invoices.stuck_reason")], valueKey: [f("invoices.amount_due", "sum")] } },
    aging: { type: "column-chart-stacked", format: title("Aging: owed by how late"), dataMapping: { categoryKey: [f("invoices.aging")], valueKey: [f("invoices.amount_due", "sum")], legendKey: [f("invoices.risk_band")] } },
    decisions: { type: "bar-chart-stacked", format: title("What the agent did, by rule decision"), dataMapping: { categoryKey: [f("actions.action")], valueKey: [f("actions.action_id", "count")], legendKey: [f("actions.rule_decision")] } },
    ledger: grid("Receivables ledger", ["invoices.client", "invoices.number", "invoices.stuck_reason", "invoices.aging", "invoices.risk_score", "invoices.amount_due", "invoices.next_step"]),
  },
  {
    owed: { xTrack: 0, yTrack: 0, xSpan: 3, ySpan: 2 },
    late: { xTrack: 3, yTrack: 0, xSpan: 3, ySpan: 2 },
    collected: { xTrack: 6, yTrack: 0, xSpan: 3, ySpan: 2 },
    waiting: { xTrack: 9, yTrack: 0, xSpan: 3, ySpan: 2 },
    byReason: { xTrack: 0, yTrack: 2, xSpan: 4, ySpan: 6 },
    aging: { xTrack: 4, yTrack: 2, xSpan: 4, ySpan: 6 },
    decisions: { xTrack: 8, yTrack: 2, xSpan: 4, ySpan: 6 },
    ledger: { xTrack: 0, yTrack: 8, xSpan: 12, ySpan: 9 },
  },
);



/** Predefined, read-only answers the Unstuck Insights agent can open as report pages. */
export const VIEWS = {
  "overdue-by-reason": {
    title: "Overdue invoices by reason",
    keywords: [/overdue|late/i, /reason|why|stuck/i],
    page: page("view-overdue-by-reason", { chart: { type: "donut-chart", format: title("Owed by stuck reason"), dataMapping: { categoryKey: [f("invoices.stuck_reason")], valueKey: [f("invoices.amount_due", "sum")] } }, list: grid("Open invoices by reason", ["invoices.stuck_reason", "invoices.client", "invoices.days_overdue", "invoices.amount_due"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 5, ySpan: 7 }, list: { xTrack: 5, yTrack: 0, xSpan: 7, ySpan: 7 } }),
  },
  "largest-balances": {
    title: "Largest outstanding balances",
    keywords: [/largest|biggest|most|top/i, /balance|owe|outstanding|customer|client/i],
    page: page("view-largest-balances", { chart: { type: "bar-chart-grouped", format: title("Owed by client"), dataMapping: { categoryKey: [f("invoices.client")], valueKey: [f("invoices.amount_due", "sum")] }, sort: [{ field: f("invoices.amount_due", "sum"), direction: "desc" }] }, list: grid("Balances", ["invoices.client", "invoices.amount_due", "invoices.risk_band", "invoices.stuck_reason"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 7, ySpan: 7 }, list: { xTrack: 7, yTrack: 0, xSpan: 5, ySpan: 7 } }),
  },
  "promises-due": {
    title: "Promises to pay",
    keywords: [/promise/i],
    page: page("view-promises", { count: value("Promises", "promises.client", "count"), byStatus: { type: "donut-chart", format: title("Promises by status"), dataMapping: { categoryKey: [f("promises.status")], valueKey: [f("promises.amount_due", "sum")] } }, list: grid("Promises to pay", ["promises.client", "promises.promised_by", "promises.status", "promises.amount_due"]) }, { count: { xTrack: 0, yTrack: 0, xSpan: 4, ySpan: 2 }, byStatus: { xTrack: 0, yTrack: 2, xSpan: 4, ySpan: 6 }, list: { xTrack: 4, yTrack: 0, xSpan: 8, ySpan: 8 } }),
  },
  "collections-before-after": {
    title: "Collected with and without Unstuck",
    keywords: [/collect|recover|paid|payment/i, /before|after|compar|unstuck|agent|interven/i],
    page: page("view-collections", { chart: { type: "column-chart-stacked", format: title("Collected by timing and source"), dataMapping: { categoryKey: [f("payments.timing")], valueKey: [f("payments.amount", "sum")], legendKey: [f("payments.source")] } }, list: grid("Payments", ["payments.date", "payments.client", "payments.amount", "payments.source", "payments.timing"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 }, list: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 } }),
  },
  "high-risk-silent": {
    title: "High risk with no recent reply",
    keywords: [/risk/i, /silen|quiet|repl|respon|contact/i],
    page: page("view-high-risk", { list: grid("Riskiest invoices and time since the client last replied", ["invoices.client", "invoices.risk_score", "invoices.risk_band", "invoices.days_since_client_reply", "invoices.days_overdue", "invoices.amount_due", "invoices.stuck_reason"]), byBand: { type: "column-chart-stacked", format: title("Owed by risk band"), dataMapping: { categoryKey: [f("invoices.risk_band")], valueKey: [f("invoices.amount_due", "sum")], legendKey: [f("invoices.stuck_reason")] } } }, { list: { xTrack: 0, yTrack: 0, xSpan: 8, ySpan: 7 }, byBand: { xTrack: 8, yTrack: 0, xSpan: 4, ySpan: 7 } }),
  },
  "approvals": {
    title: "Waiting for your approval",
    keywords: [/approv|review|waiting|needs me|human/i],
    page: page("view-approvals", { count: value("Waiting for you", "approvals.action", "count"), list: grid("Actions waiting for approval", ["approvals.client", "approvals.action", "approvals.changes_money", "approvals.waiting_since", "approvals.why"]) }, { count: { xTrack: 0, yTrack: 0, xSpan: 3, ySpan: 2 }, list: { xTrack: 0, yTrack: 2, xSpan: 12, ySpan: 7 } }),
  },
  "aging": {
    title: "Receivables aging",
    keywords: [/aging|ageing|how late|buckets?/i],
    page: page("view-aging", { chart: { type: "column-chart-stacked", format: title("Owed by how late"), dataMapping: { categoryKey: [f("invoices.aging")], valueKey: [f("invoices.amount_due", "sum")], legendKey: [f("invoices.stuck_reason")] } }, list: grid("Invoices by aging", ["invoices.aging", "invoices.client", "invoices.days_overdue", "invoices.amount_due"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 }, list: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 } }),
  },
} as const;
export type ViewId = keyof typeof VIEWS;

/** Deterministic intent router: a view only matches when every keyword group matches. */
export function routeQuestion(q: string): ViewId | null {
  if (/missed/i.test(q) && /promise/i.test(q)) return "promises-due";
  let best: ViewId | null = null;
  let bestScore = 0;
  for (const [id, v] of Object.entries(VIEWS) as [ViewId, (typeof VIEWS)[ViewId]][]) {
    const hits = v.keywords.filter((re) => re.test(q)).length;
    if (hits === v.keywords.length && hits > bestScore) {
      best = id;
      bestScore = hits;
    }
  }
  return best;
}

/** A short, data-grounded explanation of the view, computed from the same tables the view reads. */
export function explain(view: ViewId, t: InsightsTables): string {
  const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: t.currency, maximumFractionDigits: 0 }).format(n);
  const sum = (xs: { amount_due?: number; amount?: number }[]) => xs.reduce((s, x) => s + (x.amount_due ?? x.amount ?? 0), 0);
  switch (view) {
    case "overdue-by-reason": {
      const late = t.invoices.filter((i) => i.days_overdue > 0);
      const by = new Map<string, number>();
      for (const i of late) by.set(i.stuck_reason, (by.get(i.stuck_reason) ?? 0) + i.amount_due);
      const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
      return late.length ? `${late.length} overdue invoices, ${money(sum(late))} in total. The biggest share is “${top![0]}” at ${money(top![1])}. Source: Open invoices table.` : "No invoices are overdue right now.";
    }
    case "largest-balances": {
      const top = [...t.invoices].sort((a, b) => b.amount_due - a.amount_due).slice(0, 3);
      return top.length ? `Largest balances: ${top.map((i) => `${i.client} ${money(i.amount_due)}`).join(", ")}. Source: Open invoices table.` : "There are no open balances.";
    }
    case "promises-due": {
      const missed = t.promises.filter((p) => p.status === "Missed").length;
      const due = t.promises.filter((p) => p.status === "Due").length;
      return t.promises.length ? `${t.promises.length} promise(s) to pay: ${due} due, ${missed} missed, ${t.promises.length - due - missed} kept. Source: promises made on client resolution pages.` : "No client has made a promise to pay yet. Promises appear here when a client commits to a date on their resolution page.";
    }
    case "collections-before-after": {
      const after = t.payments.filter((p) => p.timing === "After Unstuck acted");
      const sim = t.payments.some((p) => p.source === "Simulated");
      return t.payments.length
        ? `${money(sum(after))} collected after Unstuck acted, ${money(sum(t.payments) - sum(after))} without an Unstuck action.${sim ? " Some payments are simulated (demo mode) and are labelled as such." : ""} This shows timing, not proof that Unstuck caused the payment.`
        : "No payments have been recorded yet, so there is nothing to compare.";
    }
    case "high-risk-silent": {
      const quiet = t.invoices.filter((i) => i.risk_band === "High" || i.days_since_client_reply >= 14);
      return `${quiet.length} invoice(s) are high risk or haven't heard from the client in 14+ days. Risk is a transparent heuristic (hover a risk badge on the board for its factors), not a prediction.`;
    }
    case "approvals":
      return t.approvals.length ? `${t.approvals.length} action(s) wait for you, ${t.approvals.filter((a) => a.changes_money === "Yes").length} of them change money. Approve them on the Receivables page.` : "Nothing is waiting for your approval.";
    case "aging":
      return `${t.invoices.length} open invoices grouped by how late they are. Source: Open invoices table.`;
  }
}

export const PROMPT_STARTERS = [
  { label: "Overdue by reason", prompt: "Show overdue invoices by reason" },
  { label: "Largest balances", prompt: "Which customers have the largest outstanding balance?" },
  { label: "Promises", prompt: "Show promises due this week and any missed promises" },
  { label: "Before vs after", prompt: "Compare collected amounts before and after the agent acted" },
  { label: "Risky and silent", prompt: "Show invoices with the highest risk and no recent customer response" },
  { label: "Needs approval", prompt: "Build a report for invoices requiring human approval" },
];

/** All pages are registered up front so Studio's layout engine knows every page and widget (also navigable as tabs). */
export const ALL_PAGES = [OVERVIEW, ...Object.values(VIEWS).map((v) => v.page)];
export const INITIAL_REPORT = { selectedPageId: "receivables", pages: ALL_PAGES } as unknown as AgReportState;
