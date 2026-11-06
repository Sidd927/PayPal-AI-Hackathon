/**
 * Regression tests for the post-review corrections:
 *   G1 provider retry hints are sanitised and clamped before they touch waits, the shared pacer or a pause;
 *   G2 the circuit breaker is re-checked after every pacing wait, so queued calls never send or pay while paused;
 *   G3 after a pause exactly one caller probes; everyone else fails at once until the probe settles;
 *   G4 a call that was never sent doesn't start the 30-minute retry cooldown;
 *   G5 connection-level timeouts are retryable network errors, our own request timeout is not;
 *   S1 the public /api/health payload carries no internal pause details;
 *   payment updates: honest wording in both modes, and no stale overwrite of a concurrent action.
 * The real Gemini SDK runs against a stubbed fetch; PayPal is simulated or a local fake. No network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getGateway, setGateway } from "@/lib/config";
import { getDb, repo } from "@/lib/db";
import { SimulatedGateway } from "@/lib/paypal/simulated";
import { LivePayPalGateway } from "@/lib/paypal/gateway";
import { PayPalClient } from "@/lib/paypal/client";
import { seedScenario } from "@/lib/demo/scenario";
import { refreshInvoice } from "@/lib/services/invoices";
import { diagnoseInvoice, reuseDecision } from "@/lib/services/diagnose";
import { handleInvoicePaymentUpdate } from "@/lib/services/payments";
import { payerAcceptOffer, payerSendMessage, simulatePayment } from "@/lib/services/payer";
import { approveAction, proposeAction } from "@/lib/services/actions";
import { boardSnapshot } from "@/lib/services/board";
import { GeminiProvider, classifyGeminiError, setGeminiClient, type GeminiClientLike } from "@/lib/ai/providers/gemini";
import { BREAKER_OPEN_MS, MAX_HINT_MS, MAX_QUOTA_PAUSE_MS, NOT_SENT_PREFIX, QUOTA_PAUSE_MS, breakerState, parseRetryAfter, sanitizeHintMs, setRetryTiming } from "@/lib/ai/reliability";
import { deferPacing, pacingWaitMs, resetPacing } from "@/lib/ai/shared";
import { activeLocks } from "@/lib/locks";
import { GET as health } from "@/app/api/health/route";
import { fakeFetch, freshEnv } from "./helpers";

const req = { system: "s", user: "u", schema: z.object({ a: z.string() }), maxOutputTokens: 10 };
const okBody = { responseId: "ok", candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: '{"a":"x"}' }] } }] };
const e503 = { error: { code: 503, status: "UNAVAILABLE", message: "The model is overloaded." } };
const json = (status: number, body: object, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const usage = () => JSON.parse((getDb().prepare("SELECT value_json FROM settings WHERE key = 'ai_usage'").get() as { value_json: string } | undefined)?.value_json ?? '{"calls":0}').calls as number;
const gemini = (key: string, rpm = 600000) => new GeminiProvider("gemini-test", key, rpm);
/** Stub fetch with one reply for every request; counts requests. */
function stub(reply: () => Response | Promise<Response>) {
  const seen = { n: 0 };
  vi.stubGlobal("fetch", async () => {
    seen.n++;
    return reply();
  });
  return seen;
}
function recordWaits() {
  const waits: number[] = [];
  setRetryTiming({ sleep: async (ms) => void waits.push(ms), random: () => 1 });
  return waits;
}
/** Open Gemini's breaker the honest way: two calls that exhaust their retries on 503. */
async function openBreaker() {
  stub(() => json(503, e503));
  await gemini("k-open").generateStructured(req);
  await gemini("k-open").generateStructured(req);
  expect(breakerState("gemini").open).toBe(true);
}

beforeEach(() => {
  freshEnv();
  process.env.GEMINI_API_KEY = "test-gemini-key";
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MAX_RPM;
  delete process.env.AI_DAILY_CALL_LIMIT;
  setGeminiClient(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("G1: retry hints are sanitised and clamped", () => {
  it("sanitizeHintMs drops negative, non-finite and non-numeric hints and caps the rest", () => {
    expect(sanitizeHintMs(-1)).toBeUndefined();
    expect(sanitizeHintMs(Number.NaN)).toBeUndefined();
    expect(sanitizeHintMs(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(sanitizeHintMs(undefined)).toBeUndefined();
    expect(sanitizeHintMs(7_000)).toBe(7_000);
    expect(sanitizeHintMs(86_400_000)).toBe(MAX_HINT_MS);
    expect(sanitizeHintMs(86_400_000, MAX_QUOTA_PAUSE_MS)).toBe(MAX_QUOTA_PAUSE_MS);
  });

  it("parseRetryAfter accepts only valid delta-seconds and HTTP dates", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    expect(parseRetryAfter("120", now)).toBe(120_000);
    expect(parseRetryAfter("0", now)).toBe(0);
    expect(parseRetryAfter("1.5", now)).toBe(1_500);
    expect(parseRetryAfter("Thu, 05 Nov 2026 12:00:30 GMT", now)).toBe(30_000);
    expect(parseRetryAfter("Thu, 05 Nov 2026 11:00:00 GMT", now)).toBe(0); // in the past
    for (const bad of ["-5", "abc", "1e309", " ", "", "+3", "NaN", "Infinity", null, undefined]) expect(parseRetryAfter(bad as string, now)).toBeUndefined();
  });

  it("a 429 asking for a day only pushes the shared pacer back by the cap, and the next diagnosis isn't held for a day", async () => {
    const waits = recordWaits();
    stub(() => json(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "86400s" }] } }));
    await gemini("k-g1").generateStructured(req);
    expect(pacingWaitMs("gemini")).toBeLessThanOrEqual(MAX_HINT_MS);
    expect(Math.max(...waits)).toBeLessThanOrEqual(MAX_HINT_MS);
    // A whole diagnosis right after (with its invoice lock) waits at most the cap, then completes.
    setGateway(new SimulatedGateway());
    const ids = await seedScenario(getGateway(), { refresh: refreshInvoice });
    stub(() => json(200, okBody));
    waits.length = 0;
    await diagnoseInvoice(ids.northwind!, { force: true });
    expect(Math.max(0, ...waits)).toBeLessThanOrEqual(MAX_HINT_MS);
    expect(activeLocks()).toBe(0);
  });

  it.each([
    ["an absurd Retry-After on a 503", { "retry-after": "999999999" }, MAX_HINT_MS],
    ["a malformed Retry-After on a 503", { "retry-after": "-5" }, 4_000], // falls back to the backoff
    ["a valid Retry-After on a 503", { "retry-after": "12" }, 12_000],
  ])("%s: the retry waits %i ms", async (_n, headers, expected) => {
    const waits = recordWaits();
    let n = 0;
    stub(() => (++n === 1 ? json(503, e503, headers as Record<string, string>) : json(200, okBody)));
    const r = await gemini(`k-${expected}`).generateStructured(req);
    expect(r.ok).toBe(true);
    expect(n).toBe(2);
    expect(waits[0]).toBe(expected);
  });

  it("a malformed RetryInfo on a 429 falls back to the safe default wait", async () => {
    const waits = recordWaits();
    let n = 0;
    stub(() => (++n === 1 ? json(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "rate", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "-5s" }] } }) : json(200, okBody)));
    const r = await gemini("k-badinfo").generateStructured(req);
    expect(r.ok).toBe(true);
    expect(waits[0]).toBe(60_000);
  });

  it("a daily-quota pause is capped (huge hint) and defaulted (no hint)", async () => {
    recordWaits();
    const daily = (details: object[]) => json(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }, ...details] } });
    stub(() => daily([{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "999999s" }]));
    let t = Date.now();
    await gemini("k-q1").generateStructured(req);
    expect(breakerState("gemini").until! - t).toBeLessThanOrEqual(MAX_QUOTA_PAUSE_MS + 50);
    freshEnv();
    process.env.GEMINI_API_KEY = "k";
    recordWaits();
    stub(() => daily([]));
    t = Date.now();
    await gemini("k-q2").generateStructured(req);
    expect(breakerState("gemini").until! - t).toBeGreaterThanOrEqual(QUOTA_PAUSE_MS - 50);
    expect(breakerState("gemini").until! - t).toBeLessThanOrEqual(QUOTA_PAUSE_MS + 50);
  });
});

describe("G2: nothing is sent or charged while the breaker is open (fake timers)", () => {
  it("queued calls that wait out their pacing slot after the breaker opened stop before sending", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000 });
    setRetryTiming({ sleep: null, random: () => 1 }); // real setTimeout sleeps, driven by the fake clock
    const sends: { at: number; paused: boolean }[] = [];
    vi.stubGlobal("fetch", async () => {
      sends.push({ at: Date.now(), paused: breakerState("gemini").open });
      return json(503, e503);
    });
    const all = Promise.all(Array.from({ length: 6 }, () => gemini("k-g2", 3).generateStructured(req)));
    for (let i = 0; i < 600; i++) await vi.advanceTimersByTimeAsync(1_000);
    const results = await all;
    expect(sends.length).toBeGreaterThan(0);
    expect(sends.filter((s) => s.paused)).toEqual([]); // the old code sent 4 requests while paused
    expect(usage()).toBe(sends.length); // only real HTTP attempts were charged
    const stopped = results.filter((r) => !r.ok && /paused/.test(r.error));
    expect(stopped.length).toBeGreaterThan(0); // queued calls stopped by the re-check
    for (const r of stopped) expect(r.ok).toBe(false);
  });
});

describe("G3: one half-open probe after a pause", () => {
  it("after the pause, exactly one concurrent caller sends; the rest fail at once; success closes the breaker", async () => {
    recordWaits();
    await openBreaker();
    const t = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(t + BREAKER_OPEN_MS + 1_000);
    let release!: () => void;
    const gateOpen = new Promise<void>((r) => (release = r));
    const seen = stub(async () => {
      await gateOpen; // keep the probe in flight while the others arrive
      return json(200, okBody);
    });
    const before = usage();
    const calls = Array.from({ length: 5 }, () => gemini("k-g3").generateStructured(req));
    await new Promise((r) => setTimeout(r, 10));
    expect(seen.n).toBe(1);
    release();
    const results = await Promise.all(calls);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.filter((r) => !r.ok);
    expect(refused).toHaveLength(4);
    for (const r of refused) expect(!r.ok && r.error).toMatch(/being re-checked after a pause/);
    expect(usage() - before).toBe(1);
    expect(breakerState("gemini").open).toBe(false);
    const after = await gemini("k-g3").generateStructured(req);
    expect(after.ok).toBe(true);
    expect(seen.n).toBe(2);
  });

  it("a failed probe sends one request (no retries) and pauses again", async () => {
    recordWaits();
    await openBreaker();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + BREAKER_OPEN_MS + 1_000);
    const seen = stub(() => json(503, e503));
    const r = await gemini("k-g3b").generateStructured(req);
    expect(seen.n).toBe(1);
    expect(r).toMatchObject({ ok: false, meta: { attempts: 1, errorKind: "unavailable" } });
    expect(breakerState("gemini").open).toBe(true);
    expect(breakerState("gemini").reason).toMatch(/still unavailable when re-checked/);
  });

  it("a probe that couldn't send (daily limit) hands the probe back instead of wedging the breaker", async () => {
    recordWaits();
    await openBreaker();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + BREAKER_OPEN_MS + 1_000);
    process.env.AI_DAILY_CALL_LIMIT = String(usage());
    const seen = stub(() => json(200, okBody));
    const r1 = await gemini("k-g3c").generateStructured(req);
    expect(r1).toMatchObject({ ok: false, status: "budget_exhausted" });
    process.env.AI_DAILY_CALL_LIMIT = String(usage() + 5);
    const r2 = await gemini("k-g3c").generateStructured(req);
    expect(r2.ok).toBe(true); // a new caller could become the probe
    expect(seen.n).toBe(1);
  });
});

describe("H1: queued calls never become the recovery probe; the breaker can't get stuck", () => {
  type B = { openUntil: number; probeOwner?: symbol | null; probing?: boolean };
  const breaker = () => (globalThis as unknown as { __unstuckAiReliability: { breakers: Map<string, B> } }).__unstuckAiReliability.breakers.get("gemini");
  /** closed / open / half-open, from the breaker itself at this instant. */
  const phase = () => {
    const b = breaker();
    return !b || !b.openUntil ? "closed" : b.openUntil > Date.now() ? "open" : "half-open";
  };
  const probeHeld = () => {
    const b = breaker();
    return !!b && (b.probeOwner != null || b.probing === true);
  };
  const okBody2 = { responseId: "ok", candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: '{"a":"x"}' }] } }] };

  /** The audit scenario: 10 diagnoses queued at 3/min through a 503 outage, run until all settle. */
  async function outageWithQueuedCalls() {
    vi.useFakeTimers({ now: 1_800_000_000_000 });
    setRetryTiming({ sleep: null, random: () => 1 }); // real setTimeout sleeps on the fake clock
    const sends: { phase: string; probeHeld: boolean }[] = [];
    const net = { healthy: false };
    vi.stubGlobal("fetch", async () => {
      sends.push({ phase: phase(), probeHeld: probeHeld() });
      return net.healthy ? json(200, okBody2) : json(503, e503);
    });
    const calls = Promise.all(Array.from({ length: 10 }, () => gemini("k-h1", 3).generateStructured(req)));
    for (let i = 0; i < 900; i++) await vi.advanceTimersByTimeAsync(1_000);
    return { results: await calls, sends, net };
  }

  it("queued calls that reach their re-check after the pause are refused unsent and uncharged; a new call recovers", async () => {
    const { results, sends, net } = await outageWithQueuedCalls();
    // The pause (2 min) ended while calls were still queued (slots every 20 s for ~3 min).
    expect(sends.filter((x) => x.phase !== "closed")).toEqual([]); // nothing sent while open or recovering
    expect(usage()).toBe(sends.length); // only real attempts charged
    expect(probeHeld()).toBe(false); // no queued call took (and kept) the probe
    expect(phase()).toBe("half-open"); // waiting for a new call to probe
    const refused = results.filter((r) => !r.ok && r.meta?.errorKind === "circuit_open");
    expect(refused.length).toBeGreaterThan(0);
    for (const r of refused) expect(r).toMatchObject({ ok: false, meta: { attempts: 0 } });
    expect(refused.some((r) => !r.ok && /was paused while this request waited/.test(r.error))).toBe(true);

    // Gemini recovers. A new call becomes the single probe; success closes the breaker without a restart.
    net.healthy = true;
    const before = { sends: sends.length, usage: usage() };
    const probe = await gemini("k-h1", 3).generateStructured(req);
    expect(probe).toMatchObject({ ok: true, meta: { attempts: 1 } });
    expect(sends.length - before.sends).toBe(1);
    expect(sends.at(-1)).toEqual({ phase: "half-open", probeHeld: true }); // it was the probe
    expect(phase()).toBe("closed");
    expect(probeHeld()).toBe(false);
    // Normal traffic resumes (each request paced, sent while closed, charged once).
    const next = gemini("k-h1", 3).generateStructured(req);
    await vi.advanceTimersByTimeAsync(30_000);
    expect((await next).ok).toBe(true);
    expect(sends.length - before.sends).toBe(2);
    expect(sends.at(-1)!.phase).toBe("closed");
    expect(usage() - before.usage).toBe(2);
  });

  it("a failed recovery probe sends once, re-opens the pause and releases ownership; the next pause recovers", async () => {
    const { sends, net } = await outageWithQueuedCalls();
    const n0 = sends.length;
    const failed = await gemini("k-h1", 3).generateStructured(req); // still 503
    expect(sends.length - n0).toBe(1); // a probe gets one attempt, no retries
    expect(failed).toMatchObject({ ok: false, meta: { attempts: 1, errorKind: "unavailable" } });
    expect(phase()).toBe("open");
    expect(probeHeld()).toBe(false);
    expect(breakerState("gemini").reason).toMatch(/still unavailable when re-checked/);
    // While open: refused, nothing sent.
    const during = await gemini("k-h1", 3).generateStructured(req);
    expect(during).toMatchObject({ ok: false, meta: { errorKind: "circuit_open", attempts: 0 } });
    expect(sends.length - n0).toBe(1);
    // After the new pause, a new call probes and recovers.
    await vi.advanceTimersByTimeAsync(BREAKER_OPEN_MS + 1_000);
    net.healthy = true;
    const recovered = await gemini("k-h1", 3).generateStructured(req);
    expect(recovered.ok).toBe(true);
    expect(phase()).toBe("closed");
  });

  it("a probe that can't send (queue full) releases ownership, sends nothing, charges nothing", async () => {
    const { sends, net } = await outageWithQueuedCalls();
    net.healthy = true;
    const n0 = sends.length;
    const u0 = usage();
    deferPacing("gemini", Date.now() + 700_000); // longer than the 10-minute background queue limit
    const r = await gemini("k-h1", 3).generateStructured(req);
    expect(r).toMatchObject({ ok: false, meta: { errorKind: "queue_full", attempts: 0 } });
    expect(sends.length).toBe(n0);
    expect(usage()).toBe(u0);
    expect(probeHeld()).toBe(false);
    resetPacing();
    const next = await gemini("k-h1", 3).generateStructured(req); // the next new call can probe
    expect(next.ok).toBe(true);
    expect(phase()).toBe("closed");
  });

  it("a probe interrupted by an unexpected exception releases ownership", async () => {
    const { net } = await outageWithQueuedCalls();
    net.healthy = true;
    deferPacing("gemini", Date.now() + 5_000); // the probe will have to sleep for its slot...
    setRetryTiming({ sleep: async () => { throw new Error("unexpected"); } }); // ...and sleeping blows up
    await expect(gemini("k-h1", 3).generateStructured(req)).rejects.toThrow("unexpected");
    expect(probeHeld()).toBe(false);
    setRetryTiming({ sleep: null });
    resetPacing();
    const next = await gemini("k-h1", 3).generateStructured(req);
    expect(next.ok).toBe(true);
    expect(phase()).toBe("closed");
  });
});

describe("P2-1: a recovery probe that Gemini answers definitively ends the outage instead of re-pausing it", () => {
  type B = { consecutive: number; openUntil: number; reason: string; status: string; probeOwner: symbol | null };
  const breakers = () => (globalThis as unknown as { __unstuckAiReliability: { breakers: Map<string, B> } }).__unstuckAiReliability.breakers;
  const phase = () => {
    const b = breakers().get("gemini");
    return !b || !b.openUntil ? "closed" : b.openUntil > Date.now() ? "open" : "half-open";
  };
  /** Open the breaker honestly, then move past the pause: the next new call is the recovery probe. */
  async function halfOpen() {
    recordWaits();
    await openBreaker();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + BREAKER_OPEN_MS + 1_000);
    expect(phase()).toBe("half-open");
  }
  const schema400 = { error: { code: 400, status: "INVALID_ARGUMENT", message: "Invalid JSON payload received: response_schema is not supported" } };

  it("1–2: a schema-rejected structured probe closes the breaker and the JSON-mode fallback goes ahead and succeeds", async () => {
    await halfOpen();
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (_u: unknown, init?: RequestInit) => {
      const structured = String(init?.body ?? "").includes("responseJsonSchema");
      sent.push(structured ? "structured" : "json_only");
      return structured ? json(400, schema400) : json(200, okBody);
    });
    const u0 = usage();
    const r = await gemini("k-p21").generateStructured(req);
    expect(r).toMatchObject({ ok: true, meta: { schemaMode: "json_only", attempts: 2 } });
    expect(sent).toEqual(["structured", "json_only"]); // the fallback was not refused as "paused"
    expect(usage() - u0).toBe(2); // both real requests charged, nothing else
    expect(phase()).toBe("closed");
  });

  it.each([
    ["3: a definite invalid request", { error: { code: 400, status: "INVALID_ARGUMENT", message: "Invalid value at 'generation_config.max_output_tokens'" } }, 400, "invalid_request"],
    ["4: an invalid API key", { error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } }, 400, "auth"],
    ["4b: a key without permission", { error: { code: 403, status: "PERMISSION_DENIED", message: "Permission denied" } }, 403, "auth"],
    ["4c: an unknown model", { error: { code: 404, status: "NOT_FOUND", message: "models/x is not found" } }, 404, "model_not_found"],
  ])("%s on the probe: Gemini is reachable, so the breaker closes and the real error is reported", async (_n, body, status, kind) => {
    await halfOpen();
    let sends = 0;
    vi.stubGlobal("fetch", async () => {
      sends++;
      return json(status as number, body as object);
    });
    const r = await gemini("k-p21b").chatTurn({ system: ["s"], items: [{ role: "user", text: "hi" }], tools: [], maxOutputTokens: 10 });
    expect(r).toMatchObject({ ok: false, meta: { errorKind: kind, attempts: 1 } });
    expect(sends).toBe(1);
    expect(phase()).toBe("closed");
    // Not "paused": the next call reaches Gemini and gets the same honest error (one attempt, not retried).
    const again = await gemini("k-p21b").chatTurn({ system: ["s"], items: [{ role: "user", text: "hi" }], tools: [], maxOutputTokens: 10 });
    expect(again).toMatchObject({ ok: false, meta: { errorKind: kind, attempts: 1 } });
    expect(sends).toBe(2);
  });

  it("5–6: a transient 503 on the probe re-opens the pause (one request); after it, recovery works without a restart", async () => {
    await halfOpen();
    let healthy = false;
    let sends = 0;
    vi.stubGlobal("fetch", async () => {
      sends++;
      return healthy ? json(200, okBody) : json(503, e503);
    });
    const r = await gemini("k-p21c").generateStructured(req);
    expect(r).toMatchObject({ ok: false, meta: { errorKind: "unavailable", attempts: 1 } });
    expect(sends).toBe(1);
    expect(phase()).toBe("open");
    expect(breakerState("gemini").reason).toMatch(/still unavailable when re-checked/);
    const t = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(t + BREAKER_OPEN_MS + 1_000);
    healthy = true;
    expect((await gemini("k-p21c").generateStructured(req)).ok).toBe(true);
    expect(phase()).toBe("closed");
  });

  it("a per-minute 429 on the probe is still treated as unavailable: the pause re-opens as rate limited", async () => {
    await halfOpen();
    stub(() => json(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }] } }));
    const r = await gemini("k-p21d").generateStructured(req);
    expect(r).toMatchObject({ ok: false, status: "rate_limited", meta: { attempts: 1 } });
    expect(phase()).toBe("open");
  });

  it("8: a daily-quota 429 on the probe sets the quota pause (not the 2-minute one) and ends the probe", async () => {
    await halfOpen();
    const seen = stub(() => json(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }));
    const t = Date.now();
    const r = await gemini("k-p21e").generateStructured(req);
    expect(r).toMatchObject({ ok: false, status: "rate_limited", meta: { errorKind: "quota_exhausted", attempts: 1 } });
    const b = breakers().get("gemini")!;
    expect(b.openUntil - t).toBe(QUOTA_PAUSE_MS);
    expect(b.reason).toMatch(/daily quota/);
    expect(b.probeOwner).toBeNull();
    const during = await gemini("k-p21e").generateStructured(req);
    expect(during).toMatchObject({ ok: false, meta: { errorKind: "circuit_open", attempts: 0 } });
    expect(seen.n).toBe(1);
  });

  it("9: an unexpected error inside the probe's request is treated as unavailable and never leaves the probe held", async () => {
    await halfOpen();
    vi.stubGlobal("fetch", async () => {
      throw new Error("boom");
    });
    const r = await gemini("k-p21f").generateStructured(req);
    expect(r).toMatchObject({ ok: false, meta: { attempts: 1 } });
    expect(phase()).toBe("open");
    expect(breakers().get("gemini")!.probeOwner).toBeNull();
  });

  it("7: a stale probe can neither release a newer probe nor overwrite the newer breaker state", async () => {
    await halfOpen();
    // Each request waits until the test releases it, so two probes from different breaker generations overlap.
    const pending: ((r: Response) => void)[] = [];
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => pending.push(resolve)));
    const a = gemini("k-p21g").generateStructured(req); // probe A (generation 1)
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const gen1 = breakers().get("gemini")!;
    const tokenA = gen1.probeOwner;
    expect(tokenA).not.toBeNull();
    // Generation 2: the breaker is replaced (as a quota pause would) and that pause has already passed.
    breakers().set("gemini", { consecutive: 0, openUntil: Date.now() - 1, reason: "the daily quota is exhausted", status: "rate_limited", probeOwner: null });
    const b = gemini("k-p21g").generateStructured(req); // probe B (generation 2)
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    const gen2 = breakers().get("gemini")!;
    const tokenB = gen2.probeOwner;
    expect(tokenB).not.toBeNull();
    expect(tokenB).not.toBe(tokenA);
    // A fails: it no longer owns the probe, so it must not re-open, release or otherwise touch generation 2.
    pending[0]!(json(503, e503));
    expect(await a).toMatchObject({ ok: false });
    expect(breakers().get("gemini")).toBe(gen2);
    expect(gen2.probeOwner).toBe(tokenB);
    expect(gen2.openUntil).toBeLessThan(Date.now()); // still half-open, not re-paused by A
    // B succeeds and closes the breaker.
    pending[1]!(json(200, okBody));
    expect((await b).ok).toBe(true);
    expect(phase()).toBe("closed");
  });
});

describe("G4: no 30-minute cooldown for a call that was never sent", () => {
  it("reuseDecision retries at once after a not-sent failure, but keeps the cooldown after a real one", () => {
    const base = { source: "rules" as const, input_hash: "h", ai_attempted_at: new Date().toISOString(), created_at: new Date().toISOString() };
    expect(reuseDecision({ ...base, ai_status: "failed", ai_detail: `${NOT_SENT_PREFIX} Gemini calls are paused until 12:00:00 UTC (x)` }, "h", { aiConfigured: true })).toMatchObject({ reuse: false, aiRetry: true });
    expect(reuseDecision({ ...base, ai_status: "rate_limited", ai_detail: `${NOT_SENT_PREFIX} Gemini is busy with queued requests` }, "h", { aiConfigured: true })).toMatchObject({ reuse: false, aiRetry: true });
    expect(reuseDecision({ ...base, ai_status: "failed", ai_detail: "AI request failed: Gemini temporarily unavailable, HTTP 503 UNAVAILABLE after 3 attempts" }, "h", { aiConfigured: true })).toMatchObject({ reuse: true });
  });

  it("end to end: an invoice skipped while Gemini was paused is diagnosed by AI on the next normal run", async () => {
    recordWaits();
    setGateway(new SimulatedGateway());
    const ids = await seedScenario(getGateway(), { refresh: refreshInvoice });
    await openBreaker();
    await diagnoseInvoice(ids.northwind!);
    const skipped = repo.latestDiagnosis(ids.northwind!)!;
    expect(skipped).toMatchObject({ source: "rules", ai_status: "failed" });
    expect(skipped.ai_detail!.startsWith(NOT_SENT_PREFIX)).toBe(true);
    // Gemini recovers (pause over): the next normal, non-forced run retries straight away.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + BREAKER_OPEN_MS + 1_000);
    const answer = {
      reason: "missing_info", confidence: 0.9, summary: "Missing PO.", evidence: [{ source: "client_message", quote: "It's PO-88412." }],
      extracted: { po_number: "PO-88412", new_contact_email: null, promised_date: null, proposed_first_payment: null, disputed_item: null },
      inference: "None", recommended_action: "update_reference", rationale: "Needs the PO.", expected_outcome: "Paid next run.", risks: [], alternatives: [],
      message: { subject: "PO added", body: "Added." }, plan: null, discount_percent: null, tone: "warm",
    };
    stub(() => json(200, { responseId: "r", candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(answer) }] } }] }));
    await diagnoseInvoice(ids.northwind!);
    expect(repo.latestDiagnosis(ids.northwind!)).toMatchObject({ source: "ai", ai_status: "used" });
  });
});

describe("G5: connection-level vs request timeouts", () => {
  it.each<[string, Error, string, boolean]>([
    ["connect ETIMEDOUT (raw)", new Error("connect ETIMEDOUT 142.250.0.1:443"), "network", true],
    ["fetch failed + ETIMEDOUT cause", Object.assign(new TypeError("fetch failed"), { cause: { code: "ETIMEDOUT" } }), "network", true],
    ["undici connect timeout", Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }), "network", true],
    ["connection reset", Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }), "network", true],
    ["our timeout (TimeoutError)", Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }), "timeout", false],
    ["our timeout (AbortError)", Object.assign(new Error("This operation was aborted"), { name: "AbortError" }), "timeout", false],
    ["our timeout wrapped as the cause of fetch failed", Object.assign(new TypeError("fetch failed"), { cause: { name: "TimeoutError" } }), "timeout", false],
  ])("%s → %s (retryable %s)", (_n, err, kind, retryable) => {
    expect(classifyGeminiError(err)).toMatchObject({ kind, retryable });
  });

  it("a raw ETIMEDOUT is retried as a network error (3 HTTP attempts)", async () => {
    recordWaits();
    const seen = { n: 0 };
    vi.stubGlobal("fetch", async () => {
      seen.n++;
      throw new Error("connect ETIMEDOUT 142.250.0.1:443");
    });
    const r = await gemini("k-g5").generateStructured(req);
    expect(seen.n).toBe(3);
    expect(r).toMatchObject({ ok: false, meta: { errorKind: "network" } });
  });
});

describe("S1: the public health payload has no internal pause details", () => {
  it("omits pause reason and time even while paused; the owner-only board data keeps them", async () => {
    recordWaits();
    setGateway(new SimulatedGateway());
    await seedScenario(getGateway(), { refresh: refreshInvoice });
    await openBreaker();
    const body = (await (await health()).json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body).not.toHaveProperty("aiPausedUntil");
    expect(body).not.toHaveProperty("aiPausedReason");
    expect(JSON.stringify(body)).not.toMatch(/paused|unavailable on/i);
    const mode = boardSnapshot().mode as { aiPausedUntil: number | null; aiPausedReason: string | null };
    expect(mode.aiPausedUntil).toBeGreaterThan(Date.now());
    expect(mode.aiPausedReason).toMatch(/unavailable on 2 calls in a row/);
  });
});

describe("payment updates: honest wording and no stale overwrite", () => {
  it("simulation: the plan update says PayPal was not called", async () => {
    setGateway(new SimulatedGateway());
    const ids = await seedScenario(getGateway(), { refresh: refreshInvoice });
    delete process.env.GEMINI_API_KEY; // rules reply: offers come from the policy engine
    const row = repo.getInvoice(ids.bluebird!)!;
    const turn = await payerSendMessage(row, "Can I split this up? Things are tight.");
    const out = await payerAcceptOffer(row, turn.offerIds.at(-1)!); // 3-part plan, applied automatically
    expect(out.action.status).toBe("executed");
    // Make the installments uneven so paying the first one must move PayPal's minimum due (400 → 500).
    const plan = repo.activePlan(row.id)!;
    const inst = JSON.parse(plan.installments_json) as { due_date: string; amount_minor: number }[];
    inst[1]!.amount_minor = 50_000;
    inst[2]!.amount_minor = 30_000;
    getDb().prepare("UPDATE plans SET installments_json = ? WHERE id = ?").run(JSON.stringify(inst), plan.id);
    await simulatePayment(repo.getInvoice(row.id)!, 40_000);
    const ev = repo.listEvents({ invoiceId: row.id, limit: 50 }).find((e) => e.kind === "plan_advanced")!;
    expect(ev.summary).toMatch(/minimum due updated \(simulation: PayPal was not called\)$/);
    expect(JSON.parse(ev.data_json!)).toMatchObject({ simulated: true, verified: null });
  });

  /** A stateful fake PayPal for one invoice (live gateway code path, no network). */
  function livePayPal(opts: { ignoreMinimum?: boolean } = {}) {
    let inv: Record<string, any> = {
      id: "INV2-LIVE",
      status: "PARTIALLY_PAID",
      detail: { currency_code: "USD", invoice_number: "JC-1", payment_term: { due_date: "2026-10-01" }, metadata: {} },
      primary_recipients: [{ billing_info: { email_address: "c@example.com", business_name: "Client" } }],
      items: [{ name: "Work", quantity: "1", unit_amount: { currency_code: "USD", value: "120.00" } }],
      amount: { currency_code: "USD", value: "120.00" },
      due_amount: { currency_code: "USD", value: "80.00" },
      payments: { paid_amount: { currency_code: "USD", value: "40.00" } },
      configuration: { partial_payment: { allow_partial_payment: true, minimum_amount_due: { currency_code: "USD", value: "40.00" } } },
    };
    const puts: unknown[] = [];
    const f = fakeFetch((r) => {
      if (r.url.pathname === "/v1/oauth2/token") return { status: 200, body: { access_token: "t", expires_in: 3600 } };
      if (r.url.pathname === "/v2/invoicing/invoices/INV2-LIVE" && r.method === "GET") return { status: 200, body: inv };
      if (r.url.pathname === "/v2/invoicing/invoices/INV2-LIVE" && r.method === "PUT") {
        puts.push(r.body);
        const b = r.body as Record<string, any>;
        inv = { ...b, id: inv.id, status: inv.status, payments: inv.payments, due_amount: inv.due_amount, configuration: opts.ignoreMinimum ? inv.configuration : b.configuration };
        return { status: 200, body: inv };
      }
      return { status: 404, body: {} };
    });
    const gw = new LivePayPalGateway(new PayPalClient({ clientId: "i", clientSecret: "s", baseUrl: "https://api-m.sandbox.paypal.com", fetchImpl: f.impl }), "sandbox", "WH-1");
    return { gw, puts, current: () => inv };
  }

  it.each([
    ["confirmed by re-reading", false, /PayPal accepted the new minimum due, and re-reading the invoice confirms it$/, true],
    ["not reflected by the re-read", true, /PayPal accepted the update, but the re-read invoice shows a minimum due of \$40\.00$/, false],
  ])("live: acceptance is distinguished from confirmation (%s)", async (_n, ignoreMinimum, wording, verified) => {
    const p = livePayPal({ ignoreMinimum: ignoreMinimum as boolean });
    setGateway(p.gw);
    await refreshInvoice("INV2-LIVE");
    repo.insertPlan({ id: "plan_live", invoice_id: "INV2-LIVE", action_id: "act_x", installments_json: JSON.stringify([{ due_date: "2026-11-01", amount_minor: 4_000 }, { due_date: "2026-12-01", amount_minor: 5_000 }, { due_date: "2027-01-01", amount_minor: 3_000 }]), paid_minor_at_start: 0, status: "active" });
    await handleInvoicePaymentUpdate("INV2-LIVE", "webhook");
    expect(p.puts).toHaveLength(1);
    const ev = repo.listEvents({ invoiceId: "INV2-LIVE", limit: 50 }).find((e) => e.kind === "plan_advanced")!;
    expect(ev.summary).toMatch(wording as RegExp);
    expect(ev.summary).not.toMatch(/simulation/);
    expect(JSON.parse(ev.data_json!)).toMatchObject({ simulated: false, verified });
  });

  it("a payment update and an owner action on the same invoice can't overwrite each other's change", async () => {
    const p = livePayPal();
    setGateway(p.gw);
    await refreshInvoice("INV2-LIVE");
    repo.insertPlan({ id: "plan_live", invoice_id: "INV2-LIVE", action_id: "act_x", installments_json: JSON.stringify([{ due_date: "2026-11-01", amount_minor: 4_000 }, { due_date: "2026-12-01", amount_minor: 5_000 }, { due_date: "2027-01-01", amount_minor: 3_000 }]), paid_minor_at_start: 0, status: "active" });
    const proposed = await proposeAction("INV2-LIVE", { type: "update_reference", origin: "agent", rationale: "PO", params: { reference: "PO-777" } } as never);
    expect(proposed.status).toBe("proposed");
    // Both read-modify-write the whole invoice at the same moment.
    await Promise.all([handleInvoicePaymentUpdate("INV2-LIVE", "webhook"), approveAction(proposed.id)]);
    const inv = p.current();
    expect(inv.detail.reference).toBe("PO-777"); // the action's change survived
    expect(inv.configuration.partial_payment.minimum_amount_due.value).toBe("50.00"); // and so did the payment update
    expect(activeLocks()).toBe(0);
  });
});
