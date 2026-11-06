import { openDb, setDb } from "@/lib/db";
import { setAnthropic } from "@/lib/ai/anthropic";
import { setGeminiClient } from "@/lib/ai/providers/gemini";
import { resetPacing } from "@/lib/ai/shared";
import { resetBreakers, setRetryTiming } from "@/lib/ai/reliability";

/** Fresh in-memory database + simulation gateway + no AI (rules-only) for each test. */
export function freshEnv() {
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.AI_PROVIDER;
  delete process.env.UNSTUCK_AI;
  process.env.APP_BASE_URL = "http://localhost:3000";
  setDb(openDb(":memory:"));
  setAnthropic(null);
  setGeminiClient(null);
  resetPacing();
  // Retries and breakers are provider-wide state: reset them, and don't actually sleep between retries in tests
  // (tests that check the delays install their own recorder).
  resetBreakers();
  setRetryTiming({ sleep: async () => {}, random: () => 1 });
}

/** A scripted fetch for PayPal contract tests. Records every request. */
export function fakeFetch(handler: (req: { method: string; url: URL; headers: Headers; body: unknown }) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: { method: string; url: URL; headers: Headers; body: unknown }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    let body: unknown = init?.body;
    if (typeof body === "string" && headers.get("content-type")?.includes("json")) body = JSON.parse(body);
    const req = { method: init?.method ?? "GET", url, headers, body };
    calls.push(req);
    const res = handler(req);
    return new Response(res.body === undefined ? null : typeof res.body === "string" ? res.body : JSON.stringify(res.body), {
      status: res.status,
      headers: { "content-type": "application/json", "paypal-debug-id": "dbg123", ...(res.headers ?? {}) },
    });
  }) as typeof fetch;
  return { impl, calls };
}
