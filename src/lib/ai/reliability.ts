/**
 * Provider-independent retry runner: the only place an AI request is retried.
 *
 * Why here and not in the SDKs: SDK-internal retries (the Gemini SDK's p-retry loop, the Anthropic SDK's
 * maxRetries) happen inside one SDK call, so they bypass Unstuck's request pacing and daily budget, ignore Google's
 * RetryInfo, and start after ~1 s, which is too soon for "model overloaded". Both adapters therefore disable SDK
 * retries and call `runWithRetries`. A call is refused at once if the provider's circuit breaker is open (nothing
 * queued, sent or charged); otherwise every HTTP attempt goes, in this order:
 *   1. pacing wait for a request slot (GEMINI_MAX_RPM holds for retries too; Claude is not paced);
 *   2. breaker re-check (a breaker that opened while this call waited stops it here; it never makes it a probe);
 *   3. budget charge: one unit of AI_DAILY_CALL_LIMIT (real requests, retries included);
 *   4. the HTTP attempt.
 * Only transient failures are retried, with exponential backoff and jitter, honouring the provider's (clamped)
 * Retry-After / RetryInfo hint, within a bounded number of attempts and a wall-clock deadline.
 *
 * 503/500/502/504 and network errors are transient. A 429 is different: a per-minute limit is retried at most once,
 * after the provider's hint, and pushes everyone's next request back; a daily quota is never retried and opens the
 * breaker. Auth, unknown-model, malformed-request and client-timeout failures are never retried.
 */
import type { AiProviderId } from "../config";
import { consumeAiBudget, deferPacing, paceRequests, pacingWaitMs } from "./shared";

export type AiErrorKind =
  | "unavailable" // 503 / provider overloaded
  | "server_error" // 500, 502, 504, 408
  | "rate_limited" // 429, per-minute
  | "quota_exhausted" // 429, daily quota
  | "auth" // invalid key, 401, 403
  | "model_not_found" // 404
  | "schema_rejected" // 400 about the response schema
  | "region" // API not available for this key or region
  | "invalid_request" // other 4xx
  | "timeout" // no response within the per-attempt timeout
  | "network" // could not reach the API
  | "circuit_open" // paused after repeated transient failures or an exhausted quota
  | "queue_full" // an interactive call would wait too long behind queued requests (our own pacing)
  | "budget_exhausted" // AI_DAILY_CALL_LIMIT reached
  | "unknown";

/** One failed attempt, classified by an adapter. `error` is safe to store and show (no keys, no content). */
export type AttemptFailure = {
  status: "failed" | "rate_limited" | "budget_exhausted";
  kind: AiErrorKind;
  error: string;
  retryable: boolean;
  /** Provider's hint (Retry-After header or Google RetryInfo), in ms. */
  retryAfterMs?: number;
  httpStatus?: number;
};

export type RetryPolicy = {
  /** Total HTTP attempts for transient failures (initial request included). */
  maxAttempts: number;
  /** Backoff before retry n (n ≥ 2): baseDelayMs·2^(n-2), capped at maxDelayMs, with jitter in [50%, 100%]. */
  baseDelayMs: number;
  maxDelayMs: number;
  /** No new attempt starts if it would begin more than this long after the first one started. */
  deadlineMs: number;
  /** A provider hint longer than this is not waited for (the call fails instead). */
  maxRetryAfterMs: number;
  /** If the first attempt would wait longer than this for a pacing slot, fail at once (interactive calls). */
  maxQueueWaitMs: number;
};

/**
 * Diagnosis: a background job, worth a few patient retries. Its queue wait is still bounded (10 minutes), so no
 * invoice's diagnosis lock can be held for longer than that plus the retry window.
 */
export const STRUCTURED_RETRY: RetryPolicy = { maxAttempts: 3, baseDelayMs: 4_000, maxDelayMs: 30_000, deadlineMs: 120_000, maxRetryAfterMs: 60_000, maxQueueWaitMs: 600_000 };
/** Chat turns (payer page, AG Studio): someone is waiting, so fail over to the rules reply sooner. */
export const CHAT_RETRY: RetryPolicy = { maxAttempts: 2, baseDelayMs: 2_000, maxDelayMs: 10_000, deadlineMs: 30_000, maxRetryAfterMs: 20_000, maxQueueWaitMs: 25_000 };

/** Circuit breaker: after this many consecutive calls that ran out of retries on transient errors, pause the provider. */
export const BREAKER_THRESHOLD = 2;
export const BREAKER_OPEN_MS = 120_000;

/**
 * Provider hints (Retry-After, Google RetryInfo) are untrusted input. Before they touch retry waits, the shared
 * pacer or a pause they are sanitised (negative / NaN / infinite → no hint) and clamped:
 * - MAX_HINT_MS: the longest any hint can make a request wait or push back the shared pacer;
 * - DEFAULT_RATE_LIMIT_WAIT_MS: used for a 429 without a usable hint;
 * - QUOTA_PAUSE_MS / MAX_QUOTA_PAUSE_MS: default and maximum pause after a daily-quota 429. When the pause ends,
 *   one probe request checks whether the quota is back (see half-open below).
 */
export const MAX_HINT_MS = 60_000;
export const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;
export const QUOTA_PAUSE_MS = 30 * 60_000;
export const MAX_QUOTA_PAUSE_MS = 60 * 60_000;

/** A usable hint in ms, or undefined. Never negative, never non-finite, never above `max`. */
export function sanitizeHintMs(ms: number | undefined, max = MAX_HINT_MS): number | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return undefined;
  return Math.min(Math.round(ms), max);
}

/**
 * Breaker states:
 * - closed: openUntil 0, counting consecutive transient failures;
 * - open: openUntil in the future; every call fails at once, nothing sent or charged;
 * - half-open: openUntil passed. The first *new* call to arrive claims the probe (probeOwner = its own token) and
 *   sends a single attempt; everyone else fails at once until the probe settles. Calls that were already queued
 *   when the breaker opened never become the probe: at their re-check they are refused, unsent and uncharged.
 * The owner token makes release exact: only the call holding the token can release it, so a stale call can't
 * clear someone else's probe, and every exit path of the probe (success, failure, nothing sent, exception) ends it.
 */
type Breaker = { consecutive: number; openUntil: number; reason: string; status: "failed" | "rate_limited"; probeOwner: symbol | null };
type State = { breakers: Map<string, Breaker>; sleep: ((ms: number) => Promise<void>) | null; random: (() => number) | null };
const state = ((globalThis as unknown as { __unstuckAiReliability?: State }).__unstuckAiReliability ??= { breakers: new Map(), sleep: null, random: null });
const sleep = (ms: number) => (state.sleep ? state.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms)));
const random = () => (state.random ? state.random() : Math.random());

/** Test hooks: replace sleeping and jitter so tests don't wait; reset breakers. */
export function setRetryTiming(t: { sleep?: ((ms: number) => Promise<void>) | null; random?: (() => number) | null }) {
  if ("sleep" in t) state.sleep = t.sleep ?? null;
  if ("random" in t) state.random = t.random ?? null;
}
export function resetBreakers() {
  state.breakers.clear();
}
/** For owner diagnostics: is the provider paused (open, or half-open with a probe in flight), and until when? */
export function breakerState(provider: string): { open: boolean; until: number | null; reason: string | null } {
  const b = state.breakers.get(provider);
  const open = !!b && b.openUntil > 0 && (b.openUntil > Date.now() || b.probeOwner !== null);
  return { open, until: open ? b!.openUntil : null, reason: open ? b!.reason : null };
}

/** Errors for calls refused without sending anything start with this (see reuseDecision: no cooldown for them). */
export const NOT_SENT_PREFIX = "AI request not sent:";

/**
 * At call start: may this call proceed, and is it the half-open probe? Claiming is synchronous (no await between
 * the check and the claim), so concurrent callers can never both own the probe.
 */
function gateAtStart(provider: string, label: string): { ok: true; probeToken: symbol | null } | { ok: false; failure: AttemptFailure } {
  const b = state.breakers.get(provider);
  if (!b || !b.openUntil) return { ok: true, probeToken: null };
  if (b.openUntil > Date.now()) return { ok: false, failure: pausedFailure(b, label) };
  if (b.probeOwner) return { ok: false, failure: { status: b.status, kind: "circuit_open", retryable: false, error: `${NOT_SENT_PREFIX} ${label} is being re-checked after a pause (${b.reason}); try again shortly` } };
  const token = Symbol("probe");
  b.probeOwner = token;
  return { ok: true, probeToken: token };
}

/**
 * Right before an attempt (after any pacing or backoff wait): may this call send now? Never claims the probe.
 * - The probe owner may send while it still owns the probe (or if a success elsewhere closed the breaker).
 * - Any other call may send only while the breaker is closed: if it opened, or is recovering, while this call
 *   waited, the call is refused here, before it is charged or sent.
 */
function gateBeforeSend(provider: string, label: string, probeToken: symbol | null): { ok: true } | { ok: false; failure: AttemptFailure } {
  const b = state.breakers.get(provider);
  if (!b || !b.openUntil) return { ok: true };
  if (probeToken && b.probeOwner === probeToken && b.openUntil <= Date.now()) return { ok: true };
  if (b.openUntil > Date.now()) return { ok: false, failure: pausedFailure(b, label) };
  return { ok: false, failure: { status: b.status, kind: "circuit_open", retryable: false, error: `${NOT_SENT_PREFIX} ${label} was paused while this request waited (${b.reason}); it was not sent` } };
}

function pausedFailure(b: Breaker, label: string): AttemptFailure {
  const at = new Date(b.openUntil).toISOString().slice(11, 19);
  return { status: b.status, kind: "circuit_open", retryable: false, error: `${NOT_SENT_PREFIX} ${label} calls are paused until ${at} UTC (${b.reason})` };
}

/**
 * Failure kinds that prove the provider is reachable: it received the request and answered with a definite
 * rejection. They never count as an outage. (A daily quota is handled separately with its own, longer pause.)
 */
export const PROVIDER_ANSWERED: ReadonlySet<AiErrorKind> = new Set<AiErrorKind>(["schema_rejected", "invalid_request", "auth", "model_not_found", "region"]);

/** Does this call still own the probe? */
const ownsProbe = (provider: string, token: symbol | null) => !!token && state.breakers.get(provider)?.probeOwner === token;

export function backoffMs(attempt: number, policy: RetryPolicy): number {
  const raw = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** Math.max(0, attempt - 2));
  return Math.round(raw * (0.5 + 0.5 * random()));
}

/** Parse an HTTP Retry-After header (seconds or an HTTP date) into ms. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  const v = (value ?? "").trim();
  if (!v) return undefined;
  if (/^\d+(\.\d+)?$/.test(v)) return sanitizeHintMs(Number(v) * 1000, Number.MAX_SAFE_INTEGER);
  if (!/[a-z]/i.test(v)) return undefined; // "-5", "1e309", "+3" and the like are not valid Retry-After values
  const at = Date.parse(v); // HTTP-date
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

export type RetryOutcome<T> =
  | { ok: true; value: T; attempts: number; totalMs: number }
  | { ok: false; failure: AttemptFailure; attempts: number; totalMs: number };

/**
 * Run `attempt` with the policy above. `perMinute` is the provider's pacing (null: no pacing).
 * `attempt` must not throw for API errors: it returns a classified failure (a throw is treated as unknown).
 */
export async function runWithRetries<T>(opts: {
  provider: AiProviderId;
  label: string;
  perMinute: number | null;
  policy: RetryPolicy;
  attempt: (n: number) => Promise<{ ok: true; value: T } | { ok: false; failure: AttemptFailure }>;
}): Promise<RetryOutcome<T>> {
  const { provider, label, policy } = opts;
  const t0 = Date.now();
  const first = gateAtStart(provider, label);
  if (!first.ok) return { ok: false, attempts: 0, totalMs: 0, failure: first.failure };
  const probeToken = first.probeToken;
  const probe = probeToken !== null;
  try {
    if (opts.perMinute && pacingWaitMs(provider) > policy.maxQueueWaitMs) {
      const secs = Math.ceil(pacingWaitMs(provider) / 1000);
      return { ok: false, attempts: 0, totalMs: 0, failure: { status: "rate_limited", kind: "queue_full", retryable: false, error: `${NOT_SENT_PREFIX} ${label} is busy with queued requests (next free slot in ${secs} s at ${opts.perMinute}/min)` } };
    }

    // A half-open probe sends exactly one attempt; its result closes or re-opens the breaker.
    const maxAttempts = probe ? 1 : policy.maxAttempts;
    let last: AttemptFailure | null = null;
    let attempts = 0;
    let firstStart = 0;
    let rateLimitRetries = 0;
    for (let n = 1; n <= maxAttempts; n++) {
      if (n > 1) {
        const wait = Math.max(backoffMs(n, policy), sanitizeHintMs(last?.retryAfterMs) ?? 0);
        const pacingAfter = Math.max(0, pacingWaitMs(provider) - wait);
        if (Date.now() + wait + pacingAfter - firstStart > policy.deadlineMs) {
          last = { ...last!, error: `${last!.error}; not retried (retry window of ${Math.round(policy.deadlineMs / 1000)} s exceeded)` };
          break;
        }
        await sleep(wait);
      }
      if (opts.perMinute) await paceRequests(provider, opts.perMinute, sleep);
      // Re-check after waiting: a breaker that opened (or is recovering) while this call queued stops it here,
      // before anything is charged or sent. This never makes the call a probe.
      const g = gateBeforeSend(provider, label, probeToken);
      if (!g.ok) {
        if (!last) return { ok: false, attempts, totalMs: Date.now() - t0, failure: g.failure };
        last = { ...last, error: `${last.error}; not retried (${label} calls were paused meanwhile)`, retryable: false };
        break;
      }
      if (!consumeAiBudget()) {
        if (!last) return { ok: false, attempts, totalMs: Date.now() - t0, failure: { status: "budget_exhausted", kind: "budget_exhausted", retryable: false, error: "AI not used: daily AI call limit reached (AI_DAILY_CALL_LIMIT)" } };
        last = { ...last, error: `${last.error}; not retried (daily AI call limit reached)` };
        break;
      }
      if (!firstStart) firstStart = Date.now();
      attempts++;
      let r: Awaited<ReturnType<typeof opts.attempt>>;
      try {
        r = await opts.attempt(n);
      } catch (e) {
        r = { ok: false, failure: { status: "failed", kind: "unknown", retryable: false, error: `AI request failed: ${String((e as Error)?.message ?? e).slice(0, 120)}` } };
      }
      if (r.ok) {
        state.breakers.delete(provider); // closes the breaker (and ends any probe)
        return { ok: true, value: r.value, attempts, totalMs: Date.now() - t0 };
      }
      last = r.failure;

      if (last.kind === "quota_exhausted") {
        openBreaker(provider, sanitizeHintMs(last.retryAfterMs, MAX_QUOTA_PAUSE_MS) ?? QUOTA_PAUSE_MS, "the daily quota is exhausted", "rate_limited");
        break;
      }
      if (last.kind === "rate_limited") {
        // Everyone waits, not just this call: the limit is shared by the whole project. Clamped first.
        const waitMs = sanitizeHintMs(last.retryAfterMs) ?? DEFAULT_RATE_LIMIT_WAIT_MS;
        deferPacing(provider, Date.now() + waitMs);
        last = { ...last, retryAfterMs: waitMs };
        if (rateLimitRetries++ >= 1 || waitMs > policy.maxRetryAfterMs) break;
        continue;
      }
      if (!last.retryable) break;
    }

    const failure = last!;
    if (attempts > 0 && ownsProbe(provider, probeToken)) {
      if (PROVIDER_ANSWERED.has(failure.kind)) {
        // The provider answered the recovery request with a definite rejection (schema, request, key, model,
        // region): it is reachable, so the outage is over. Close the breaker (ending the probe) instead of pausing
        // an available provider; a follow-up such as Gemini's JSON-mode fallback can then go ahead. The rejection
        // itself is still returned to the caller.
        state.breakers.delete(provider);
      } else {
        // Still unavailable (5xx, network, our timeout, a per-minute 429, an unexpected error): pause again.
        // Re-opening replaces the breaker, which also ends the probe.
        openBreaker(provider, BREAKER_OPEN_MS, `${label} was still unavailable when re-checked`, failure.status === "rate_limited" ? "rate_limited" : "failed");
      }
    } else if (!probe && failure.retryable && failure.kind !== "rate_limited") {
      const br = state.breakers.get(provider) ?? { consecutive: 0, openUntil: 0, reason: "", status: "failed" as const, probeOwner: null };
      if (!br.openUntil) {
        // Only a closed breaker counts; calls that were already in flight when it opened don't extend the pause.
        br.consecutive++;
        state.breakers.set(provider, br);
        if (br.consecutive >= BREAKER_THRESHOLD) openBreaker(provider, BREAKER_OPEN_MS, `${label} was unavailable on ${br.consecutive} calls in a row`, "failed");
      }
    }
    const tried = attempts > 1 ? ` after ${attempts} attempts over ${Math.round((Date.now() - firstStart) / 1000)} s` : "";
    return { ok: false, attempts, totalMs: Date.now() - t0, failure: { ...failure, error: `${failure.error}${tried}` } };
  } finally {
    // Every exit of a probe that still owns the slot (nothing sent: queue full, budget, refused, or an unexpected
    // exception) hands it back, so the next new call can probe. Only the owner can release it.
    if (ownsProbe(provider, probeToken)) state.breakers.get(provider)!.probeOwner = null;
  }
}

function openBreaker(provider: string, ms: number, reason: string, status: "failed" | "rate_limited") {
  state.breakers.set(provider, { consecutive: 0, openUntil: Date.now() + ms, reason, status, probeOwner: null });
}
