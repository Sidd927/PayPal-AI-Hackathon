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
  invoices: { invoice_id: "Invoice id", client: "Client", number: "Invoice", stuck_reason: "Stuck reason", aging: "Aging", risk_band: "Risk band", risk_score: "Risk score", days_overdue: "Days overdue", days_since_client_reply: "Days since client reply", client_reply: "Client last replied", top_risk_factor: "Biggest risk factor", overdue_amount: "Overdue amount", missed_promise: "Missed a promise", amount_due: "Amount due", next_step: "Next step", awaiting_approval: "Awaiting approval" },
  actions: { action_id: "Action id", client: "Client", action: "Action", proposed_by: "Proposed by", rule_decision: "Rule decision", status: "Status", outcome: "What happened after" },
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
const CURRENCY = new Set(["amount_due", "amount", "overdue_amount"]);
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
    collected: value("Overdue", "invoices.overdue_amount", "sum"),
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
    keywords: [/\b(reasons?|why|stuck|causes?)\b/i],
    page: page("view-overdue-by-reason", { chart: { type: "donut-chart", format: title("Owed by stuck reason"), dataMapping: { categoryKey: [f("invoices.stuck_reason")], valueKey: [f("invoices.amount_due", "sum")] } }, list: grid("Open invoices by reason", ["invoices.stuck_reason", "invoices.client", "invoices.days_overdue", "invoices.amount_due"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 5, ySpan: 7 }, list: { xTrack: 5, yTrack: 0, xSpan: 7, ySpan: 7 } }),
  },
  "largest-balances": {
    title: "Largest outstanding balances",
    keywords: [/largest|biggest|most|top|highest/i, /balances?|owes?|owed|outstanding/i],
    page: page("view-largest-balances", { chart: { type: "bar-chart-grouped", format: title("Owed by client"), dataMapping: { categoryKey: [f("invoices.client")], valueKey: [f("invoices.amount_due", "sum")] }, sort: [{ field: f("invoices.amount_due", "sum"), direction: "desc" }] }, list: grid("Balances", ["invoices.client", "invoices.amount_due", "invoices.risk_band", "invoices.stuck_reason"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 7, ySpan: 7 }, list: { xTrack: 7, yTrack: 0, xSpan: 5, ySpan: 7 } }),
  },
  "promises-due": {
    title: "Promises to pay",
    keywords: [/promise/i],
    page: page("view-promises", { count: value("Promises", "promises.client", "count"), byStatus: { type: "donut-chart", format: title("Promises by status"), dataMapping: { categoryKey: [f("promises.status")], valueKey: [f("promises.amount_due", "sum")] } }, list: grid("Promises to pay", ["promises.client", "promises.promised_by", "promises.status", "promises.amount_due"]) }, { count: { xTrack: 0, yTrack: 0, xSpan: 4, ySpan: 2 }, byStatus: { xTrack: 0, yTrack: 2, xSpan: 4, ySpan: 6 }, list: { xTrack: 4, yTrack: 0, xSpan: 8, ySpan: 8 } }),
  },
  "collections-before-after": {
    title: "Collected with and without Unstuck",
    keywords: [/collect|recover|paid|payment/i, /before|after|compar|unstuck|agent|interven|action/i],
    page: page("view-collections", { chart: { type: "column-chart-stacked", format: title("Collected by timing and source"), dataMapping: { categoryKey: [f("payments.timing")], valueKey: [f("payments.amount", "sum")], legendKey: [f("payments.source")] } }, list: grid("Payments", ["payments.date", "payments.client", "payments.amount", "payments.source", "payments.timing"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 }, list: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 } }),
  },
  "high-risk-silent": {
    title: "High risk with no recent reply",
    keywords: [/risk/i, /silen|quiet|repl|respon|heard/i],
    page: page("view-high-risk", { list: grid("Riskiest invoices and time since the client last replied", ["invoices.client", "invoices.risk_score", "invoices.risk_band", "invoices.days_since_client_reply", "invoices.days_overdue", "invoices.amount_due", "invoices.stuck_reason"]), byBand: { type: "column-chart-stacked", format: title("Owed by risk band"), dataMapping: { categoryKey: [f("invoices.risk_band")], valueKey: [f("invoices.amount_due", "sum")], legendKey: [f("invoices.stuck_reason")] } } }, { list: { xTrack: 0, yTrack: 0, xSpan: 8, ySpan: 7 }, byBand: { xTrack: 8, yTrack: 0, xSpan: 4, ySpan: 7 } }),
  },
  "approvals": {
    title: "Waiting for your approval",
    keywords: [/approv|review|waiting|needs? (me|my|you|the owner|owner)|human|interven|attention/i],
    page: page("view-approvals", { count: value("Waiting for you", "approvals.action", "count"), list: grid("Actions waiting for approval", ["approvals.client", "approvals.action", "approvals.changes_money", "approvals.waiting_since", "approvals.why"]) }, { count: { xTrack: 0, yTrack: 0, xSpan: 3, ySpan: 2 }, list: { xTrack: 0, yTrack: 2, xSpan: 12, ySpan: 7 } }),
  },
  "aging": {
    title: "Receivables aging",
    keywords: [/aging|ageing|how late|buckets?/i],
    page: page("view-aging", { chart: { type: "column-chart-stacked", format: title("Owed by how late"), dataMapping: { categoryKey: [f("invoices.aging")], valueKey: [f("invoices.amount_due", "sum")], legendKey: [f("invoices.stuck_reason")] } }, list: grid("Invoices by aging", ["invoices.aging", "invoices.client", "invoices.days_overdue", "invoices.amount_due"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 }, list: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 } }),
  },
  "overdue-by-customer": {
    title: "Overdue receivables by customer",
    keywords: [/overdue|late|past due/i, /customers?|clients?|who/i],
    page: page("view-overdue-by-customer", { chart: { type: "bar-chart-grouped", format: title("Overdue by customer"), dataMapping: { categoryKey: [f("invoices.client")], valueKey: [f("invoices.overdue_amount", "sum")] }, sort: [{ field: f("invoices.overdue_amount", "sum"), direction: "desc" }] }, list: grid("Overdue invoices", ["invoices.client", "invoices.overdue_amount", "invoices.days_overdue", "invoices.stuck_reason"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 }, list: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 } }),
  },
  "no-response": {
    title: "Customers who haven't responded",
    keywords: [/silen|quiet|not (replied|responded|answered)|no (reply|response|answer)|respon|repl|heard back|ghost/i],
    page: page("view-no-response", { list: grid("When each client last replied", ["invoices.client", "invoices.client_reply", "invoices.days_overdue", "invoices.amount_due", "invoices.stuck_reason", "invoices.next_step"]) }, { list: { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 8 } }),
  },
  "highest-risk": {
    title: "Highest risk under your risk rules",
    keywords: [/risk/i],
    page: page("view-highest-risk", { chart: { type: "bar-chart-grouped", format: title("Risk score by client (55+ is high)"), dataMapping: { categoryKey: [f("invoices.client")], valueKey: [f("invoices.risk_score", "max")] }, sort: [{ field: f("invoices.risk_score", "max"), direction: "desc" }] }, list: grid("Score, band and the biggest factor", ["invoices.client", "invoices.risk_score", "invoices.risk_band", "invoices.top_risk_factor", "invoices.amount_due"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 }, list: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 } }),
  },
  outcomes: {
    title: "What happened after each action",
    keywords: [/work(ed|s|ing)?\b|outcomes?|results?|effective|success|helped/i],
    page: page("view-outcomes", { chart: { type: "bar-chart-grouped", format: title("Actions by what happened after"), dataMapping: { categoryKey: [f("actions.outcome")], valueKey: [f("actions.action_id", "count")] } }, list: grid("Every action and its outcome", ["actions.client", "actions.action", "actions.outcome"]) }, { chart: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 7 }, list: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 7 } }),
  },
} as const;
export type ViewId = keyof typeof VIEWS;

/**
 * Deterministic intent router. A view is a candidate only when every one of its keyword groups matches; the
 * candidate with the most groups wins (so "risk and no response" beats "risk"). No match → the agent declines.
 */
export function routeQuestion(q: string): ViewId | null {
  if (/missed|broken|kept/i.test(q) && /promise/i.test(q)) return "promises-due";
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
      const by = new Map<string, { n: number; amt: number }>();
      for (const i of late) by.set(i.stuck_reason, { n: (by.get(i.stuck_reason)?.n ?? 0) + 1, amt: (by.get(i.stuck_reason)?.amt ?? 0) + i.amount_due });
      const ranked = [...by.entries()].sort((a, b) => b[1].n - a[1].n || b[1].amt - a[1].amt);
      return late.length
        ? `${late.length} overdue invoices, ${money(sum(late))} in total, stuck for ${ranked.length} different reason${ranked.length === 1 ? "" : "s"}. Most common: ${ranked.slice(0, 3).map(([r, x]) => `${r} (${x.n}, ${money(x.amt)})`).join(", ")}. Source: Open invoices table.`
        : "No invoices are overdue right now.";
    }
    case "overdue-by-customer": {
      const late = t.invoices.filter((i) => i.overdue_amount > 0).sort((a, b) => b.overdue_amount - a.overdue_amount);
      const total = late.reduce((s2, i) => s2 + i.overdue_amount, 0);
      return late.length
        ? `${money(total)} is overdue across ${late.length} customers. Highest: ${late.slice(0, 3).map((i) => `${i.client} ${money(i.overdue_amount)} (${i.days_overdue} days late)`).join(", ")}${late[0] ? `, so ${late[0].client} alone is ${Math.round((late[0].overdue_amount / total) * 100)}% of it` : ""}. Source: Open invoices table.`
        : "No customer is overdue right now.";
    }
    case "no-response": {
      const never = t.invoices.filter((i) => i.days_since_client_reply === null && i.days_overdue > 0);
      const stale = t.invoices.filter((i) => i.days_since_client_reply !== null && i.days_since_client_reply >= 14);
      if (!never.length && !stale.length) return "Every overdue customer has replied in the last two weeks.";
      return `${never.length ? `No reply at all from ${never.map((i) => i.client).join(", ")} on overdue invoices` : ""}${never.length && stale.length ? "; " : ""}${stale.length ? `nothing in 14+ days from ${stale.map((i) => `${i.client} (${i.days_since_client_reply} days)`).join(", ")}` : ""}. Source: the conversation on each invoice.`;
    }
    case "highest-risk": {
      const top = [...t.invoices].sort((a, b) => b.risk_score - a.risk_score).slice(0, 3);
      return top.length
        ? `Highest risk: ${top.map((i) => `${i.client} ${i.risk_score} (${i.risk_band}; biggest factor: ${i.top_risk_factor.toLowerCase()})`).join(", ")}. Your risk rules add points for named factors; 55+ is high and 28+ is watch. It's a transparent score, not a prediction.`
        : "There are no open invoices to score.";
    }
    case "outcomes": {
      const done = t.actions.filter((a) => a.status === "executed");
      if (!done.length) return "No actions have run yet. Run the agent on the Receivables page.";
      const count = (o: string) => done.filter((a) => a.outcome === o).length;
      return `${done.length} actions have run. Paid in full since: ${count("Paid in full since")}. Part paid since: ${count("Part paid since")}. No payment yet: ${count("No payment yet")}. This is what happened after each action, not proof that the action caused it.`;
    }
    case "largest-balances": {
      const top = [...t.invoices].sort((a, b) => b.amount_due - a.amount_due).slice(0, 3);
      return top.length ? `Largest balances: ${top.map((i) => `${i.client} ${money(i.amount_due)}`).join(", ")}. Source: Open invoices table.` : "There are no open balances.";
    }
    case "promises-due": {
      const missed = t.promises.filter((p) => p.status === "Missed").length;
      const due = t.promises.filter((p) => p.status === "Due").length;
      const missedNames = t.promises.filter((p) => p.status === "Missed").map((p) => `${p.client} (by ${p.promised_by})`);
      return t.promises.length ? `${t.promises.length} promise(s) to pay: ${due} due, ${missed} missed, ${t.promises.length - due - missed} kept.${missedNames.length ? ` Missed: ${missedNames.join(", ")}. The agent follows these up on its next run.` : ""} Source: promises recorded from clients.` : "No client has made a promise to pay yet. Promises appear here when a client commits to a date on their resolution page.";
    }
    case "collections-before-after": {
      const after = t.payments.filter((p) => p.timing === "After Unstuck acted");
      const sim = t.payments.some((p) => p.source === "Simulated");
      return t.payments.length
        ? `${money(sum(after))} collected after Unstuck acted, ${money(sum(t.payments) - sum(after))} without an Unstuck action.${sim ? " Some payments are simulated (demo mode) and are labelled as such." : ""} This shows timing, not proof that Unstuck caused the payment.`
        : "No payments have been recorded yet, so there is nothing to compare.";
    }
    case "high-risk-silent": {
      const quiet = t.invoices.filter((i) => i.risk_band === "High" && (i.days_since_client_reply === null || i.days_since_client_reply >= 14));
      const high = t.invoices.filter((i) => i.risk_band === "High");
      return quiet.length
        ? `${quiet.map((i) => `${i.client} (risk ${i.risk_score}, ${i.client_reply.toLowerCase()})`).join(", ")} ${quiet.length === 1 ? "is" : "are"} high risk with no reply in 14+ days. Risk is a transparent score from your risk rules, not a prediction.`
        : `${high.length} high-risk invoice(s), and each has heard from the client in the last two weeks. Risk is a transparent score from your risk rules, not a prediction.`;
    }
    case "approvals":
      return t.approvals.length
        ? `${t.approvals.length} action(s) wait for you, ${t.approvals.filter((a) => a.changes_money === "Yes").length} of them change money: ${t.approvals.slice(0, 4).map((a) => `${a.client} (${a.action})`).join(", ")}${t.approvals.length > 4 ? ", …" : ""}. Approve them on the Receivables page.`
        : "Nothing is waiting for your approval.";
    case "aging":
      return `${t.invoices.length} open invoices grouped by how late they are. Source: Open invoices table.`;
  }
}

export const PROMPT_STARTERS = [
  { label: "Who's most overdue", prompt: "Which customers account for the highest overdue receivables?" },
  { label: "Why it's stuck", prompt: "What are the most common reasons invoices are stuck?" },
  { label: "Missed promises", prompt: "Which payment promises have been missed?" },
  { label: "Needs me today", prompt: "Which invoices need owner intervention today?" },
  { label: "Not responding", prompt: "Which customers have not responded?" },
  { label: "Highest risk", prompt: "Which invoices are at highest risk based on our risk rules?" },
  { label: "What worked", prompt: "What happened after Unstuck's actions? What worked?" },
  { label: "Collected after", prompt: "How much has been collected after Unstuck actions?" },
];

/** Height the report container needs for a page, from its own layout (rows × row height + Studio chrome). */
export function pageHeight(pageId: string): number {
  const p = ALL_PAGES.find((x) => x.id === pageId) ?? OVERVIEW;
  const rows = Math.max(...Object.values(p.widgetLayout as Record<string, { yTrack: number; ySpan: number }>).map((l) => l.yTrack + l.ySpan));
  return Math.max(520, rows * 56 + 108);
}

/** All pages are registered up front so Studio's layout engine knows every page and widget (also navigable as tabs). */
export const ALL_PAGES = [OVERVIEW, ...Object.values(VIEWS).map((v) => v.page)];
export const INITIAL_REPORT = { selectedPageId: "receivables", pages: ALL_PAGES } as unknown as AgReportState;
