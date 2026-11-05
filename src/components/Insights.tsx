"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgStudio } from "ag-studio-react";
import { AgStudioAiModule, AgStudioLicenseManager, type AgStudioApi, studioTheme } from "ag-studio";
import type { InsightsTables } from "@/lib/services/insights";
import { api } from "@/lib/client";
import { dataSources, explain, INITIAL_REPORT, OVERVIEW, pageHeight, PROMPT_STARTERS, routeQuestion, VIEWS } from "./insights/report";
import { buildHarness, openView } from "./insights/agents";
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

export default function Insights() {
  const [data, setData] = useState<InsightsTables | null>(null);
  /** Configured AI provider label (e.g. "Gemini") when the server has one; enables Studio's built-in agents. */
  const [aiLabel, setAiLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [answer, setAnswer] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string>(OVERVIEW.id);
  const [q, setQ] = useState("");
  const studioRef = useRef<AgStudio | null>(null);
  const studioApi = { get current(): AgStudioApi | null { return studioRef.current?.api ?? null; } };
  const dataRef = useRef<InsightsTables | null>(null);

  useEffect(() => {
    api<InsightsTables>("/api/insights").then((d) => {
      dataRef.current = d;
      setData(d);
    }, (e) => setError(e.message));
    api<{ ai: string; aiLabel: string | null }>("/api/health").then((h) => setAiLabel(h.ai !== "rules" ? h.aiLabel : null), () => {});
  }, []);
  const sources = useMemo(() => (data ? dataSources(data) : null), [data]);
  const initialReport = useMemo(() => structuredClone(INITIAL_REPORT), []);
  const ai = useCallback((p: { api: AgStudioApi }) => buildHarness(p.api, () => dataRef.current!, !!aiLabel), [aiLabel]);

  /** The same deterministic agent logic, reachable from the page as well as Studio's chat. */
  function ask(question: string) {
    const view = routeQuestion(question);
    if (!view || !studioApi.current || !dataRef.current) {
      setAnswer(view ? "Insights is still loading." : `I can't answer that from Unstuck's data yet. Try: ${PROMPT_STARTERS.map((s) => s.label.toLowerCase()).join(", ")}.`);
      return;
    }
    openView(studioApi.current, view);
    setPageId(VIEWS[view].page.id);
    setAnswer(`${VIEWS[view].title}. ${explain(view, dataRef.current)}`);
  }

  if (error) return <p role="alert" className="text-alert">{error}</p>;
  if (!sources || !data) return <Spinner label="Loading insights" />;
  return (
    <div>
      <form
        className="mb-3 flex flex-col gap-2 rounded-[var(--radius-soft)] border border-rule bg-surface p-3 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q);
        }}
      >
        <label htmlFor="ask" className="shrink-0 text-sm font-medium text-ink">Ask Insights</label>
        <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Which customers have the largest outstanding balance?" className="min-w-0 flex-1 rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-3 py-1.5 text-sm" />
        <button type="submit" className="rounded-[var(--radius-tight)] bg-ink px-3 py-1.5 text-sm font-medium text-surface">Show me</button>
        <button type="button" onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))} className="rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-3 py-1.5 text-sm hover:border-ink-soft" aria-pressed={mode === "edit"}>
          {mode === "view" ? "Build your own report" : "Done editing"}
        </button>
      </form>
      <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Suggested questions">
        {PROMPT_STARTERS.map((s) => (
          <button key={s.label} onClick={() => { setQ(s.prompt); ask(s.prompt); }} className="rounded-full border border-rule-strong bg-surface px-3 py-1 text-xs text-ink-soft hover:border-ink-soft hover:text-ink">
            {s.label}
          </button>
        ))}
        <button onClick={() => { if (studioApi.current) { openView(studioApi.current, "overview"); setPageId(OVERVIEW.id); setAnswer(null); } }} className="rounded-full px-3 py-1 text-xs text-ink-soft underline decoration-rule-strong underline-offset-4 hover:text-ink">
          Back to overview
        </button>
      </div>
      {answer && <p role="status" className="mb-3 rounded-[var(--radius-tight)] bg-ok-wash/70 px-3 py-2 text-sm text-ink">{answer}</p>}
      <p className="mb-2 text-xs text-ink-faint">
        {data.currency} only{data.excludedOtherCurrency ? `; ${data.excludedOtherCurrency} invoice(s) in other currencies excluded` : ""}. In <em>Build your own report</em>, the AG Studio AI panel hosts the <strong>Unstuck Insights</strong> agent, which answers the questions above from these read-only tables{aiLabel ? `; Studio's built-in agents run on ${aiLabel} for anything else.` : ". Connect an AI provider (GEMINI_API_KEY) to enable Studio's built-in agents for open-ended questions."}
      </p>
      <div style={{ height: mode === "edit" ? 1060 : pageHeight(pageId) }} className="overflow-hidden rounded-[var(--radius-soft)] border border-rule bg-surface">
        <AgStudio
          ref={studioRef}
          data={sources}
          mode={mode}
          initialState={initialReport}
          style={{ height: "100%" }}
          theme={theme}
          modules={[AgStudioAiModule]}
          ai={ai as never}
          panels={{ edit: { left: ["data"], right: ["ai", "edit", "filters"] }, view: { right: ["filters"] } }}
        />
      </div>
    </div>
  );
}
