/**
 * AG Studio Agent Framework integration.
 *
 * - "Unstuck Insights" is a custom agent built with `clientToolRunner`. It understands a fixed set of
 *   receivables questions with a deterministic router, opens a predefined read-only report page with
 *   AG Studio's own API, and answers with numbers computed from the same tables. It needs no LLM.
 * - When an AI provider is configured on the server (Gemini by default), Studio's built-in agents (Lead,
 *   Planning, Data, Page, Widget) are added, running against `serverAiAdapter`, which proxies to /api/insights/llm so the
 *   API key never reaches the browser.
 */
import { clientToolRunner, createAiHarness, directLlmRunner, type AgAiEvent, type AgAiHarness, type AgLlmAdapter, type AgLlmRequest, type AgLlmResponse, type AgStudioApi } from "ag-studio";
import type { InsightsTables } from "@/lib/services/insights";
import { ALL_PAGES, explain, OVERVIEW, PROMPT_STARTERS, routeQuestion, VIEWS } from "./report";

const uid = () => Math.random().toString(36).slice(2, 10);

function textEvents(threadId: string, runId: string, text: string): AgAiEvent[] {
  const messageId = `msg-${uid()}`;
  return [
    { type: "RUN_STARTED", threadId, runId },
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId, delta: text },
    { type: "TEXT_MESSAGE_END", messageId },
    { type: "RUN_FINISHED", threadId, runId },
  ] as AgAiEvent[];
}

/**
 * Open a predefined view as a report page and select it. Read-only: only dashboard state changes.
 * State is rebuilt from our own page definitions (Studio's getState() output is normalised internally
 * and is not valid input for setState()).
 */
export function openView(api: AgStudioApi, id: keyof typeof VIEWS | "overview") {
  // Fresh copies every time: Studio normalises (mutates) the state objects it is given.
  const pages = structuredClone(ALL_PAGES);
  const version = (api.getState() as { version?: string }).version;
  api.setState({ pages, selectedPageId: id === "overview" ? OVERVIEW.id : VIEWS[id].page.id, ...(version ? { version } : {}) } as never);
}

export function unstuckInsightsAgent(api: AgStudioApi, getData: () => InsightsTables) {
  return clientToolRunner({
    id: "unstuck",
    name: "Unstuck Insights",
    description: "Answers receivables questions (overdue by reason, largest balances, promises, approvals, risk, aging, collections) from Unstuck's live data, using predefined read-only reports.",
    run: (input) => {
      const last = [...input.messages].reverse().find((m) => m.role === "user");
      const q = (last && "content" in last && typeof last.content === "string" ? last.content : "").slice(0, 500);
      const view = routeQuestion(q);
      let text: string;
      if (!view) {
        text = `I can answer these from Unstuck's data: ${PROMPT_STARTERS.map((s) => `“${s.prompt}”`).join(", ")}. I won't guess at other questions, to avoid made-up numbers.`;
      } else {
        try {
          openView(api, view);
          text = `Opened “${VIEWS[view].title}”. ${explain(view, getData())}`;
        } catch (e) {
          text = `I couldn't open that report: ${(e as Error).message}`;
        }
      }
      const events = textEvents(input.threadId, input.runId, text);
      return (async function* () {
        for (const e of events) yield e;
      })();
    },
  });
}

/** LLM adapter for Studio's built-in agents: one turn per request, proxied to the configured AI provider by the server. */
export const serverAiAdapter: AgLlmAdapter = {
  executeTurn(request: AgLlmRequest, options) {
    const complete: Promise<AgLlmResponse> = fetch("/api/insights/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: options?.signal,
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { id: `err-${uid()}`, createdAt: Date.now(), status: "failed", output: [], error: { code: String(r.status), message: data.error ?? "AI request failed" } } as AgLlmResponse;
      return data as AgLlmResponse;
    });
    return {
      complete,
      stream: {
        async *[Symbol.asyncIterator]() {
          const res = await complete;
          for (const item of res.output) {
            if (item.type === "message") {
              const messageId = item.id;
              yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant" } as AgAiEvent;
              for (const c of item.content) if (c.type === "text") yield { type: "TEXT_MESSAGE_CONTENT", messageId, delta: c.text } as AgAiEvent;
              yield { type: "TEXT_MESSAGE_END", messageId } as AgAiEvent;
            } else if (item.type === "function_call") {
              yield { type: "TOOL_CALL_START", toolCallId: item.callId, toolCallName: item.name } as AgAiEvent;
              yield { type: "TOOL_CALL_ARGS", toolCallId: item.callId, delta: item.arguments } as AgAiEvent;
              yield { type: "TOOL_CALL_END", toolCallId: item.callId } as AgAiEvent;
            }
          }
        },
      },
    };
  },
};

export function buildHarness(api: AgStudioApi, getData: () => InsightsTables, aiAvailable: boolean): AgAiHarness {
  return createAiHarness(api, (ctx) => {
    const builtIns = aiAvailable ? (["lead", "planning", "data", "page", "widget"] as const).map((id) => directLlmRunner({ ...ctx.builtIn[id], adapter: serverAiAdapter })) : [];
    return {
      agents: [unstuckInsightsAgent(api, getData), ...builtIns],
      primary: "unstuck",
      promptStarters: PROMPT_STARTERS,
    };
  });
}
