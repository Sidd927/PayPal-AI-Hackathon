# AI providers

Unstuck's AI features (invoice diagnosis, the payer assistant and, optionally, AG Studio's built-in Insights agents) run behind one provider interface. **Google Gemini is the default.** Anthropic Claude is still supported as an alternative. With no key, everything runs on deterministic rules, and the UI says so.

## Quick start (Gemini)

1. Sign in at <https://aistudio.google.com/apikey> with a Google account and choose **Create API key**. The Gemini API has a free tier, and no billing account is needed to start.
2. Put the key in `.env.local`. This file is git-ignored, so never put a key in `.env.example` or any other tracked file.

   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your-key-here
   ```

3. Check that the key and model work, in simulation and without touching PayPal:

   ```bash
   npm run verify:ai
   ```

4. Start the app. The header shows **AI: Gemini**, and each diagnosis shows "by Gemini (model)".

   ```bash
   npm run dev
   ```

`GEMINI_API_KEY` is the only setting you need. Everything else has a default.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `AI_PROVIDER` | `gemini` | `gemini`, `anthropic`, or `none` (rules only). An unknown value is treated as "not configured" and named in the diagnosis note. |
| `GEMINI_API_KEY` | (none) | Gemini Developer API key. Server-side only: it is never sent to the browser, logged or stored. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Any model id your key can use for `generateContent`. |
| `GEMINI_MAX_RPM` | `10` | Unstuck spaces its own Gemini **HTTP attempts (retries included)** to stay at or below this many per minute, across the whole server process. It is Unstuck's pacing, not a statement of Google's quota. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` / `ANTHROPIC_EFFORT` | (none) / `claude-opus-5-5` / `medium` | Used only when `AI_PROVIDER=anthropic`. |
| `AI_DAILY_CALL_LIMIT` | `500` | Unstuck's own cap on AI **HTTP attempts** per day (retries count), for any provider. Not Google's quota. When it is reached, Unstuck uses rules and labels the result "AI: Daily limit reached". |
| `UNSTUCK_AI=off` | (none) | Legacy switch, the same as `AI_PROVIDER=none`. |

### Model choice

The default is `gemini-3.5-flash-lite`, a Flash-Lite model, chosen because diagnosis is a short structured-output task.

What is and isn't verified (audit of 2026-11-05):

| Claim | Status | Source |
|---|---|---|
| `gemini-3.5-flash-lite` is the model id, stable (GA, released 2026-07-21) | Supported by search excerpts of Google's model page; **the page itself could not be opened** from the build environment (`ai.google.dev` blocked) | Search results for ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite |
| Structured outputs and function calling are supported | Same: Google's model, structured-output and function-calling pages, via search excerpts | as above |
| The model exists **for your key** | **Not verified**: no real key was used. `npm run verify:ai` check 0 confirms it live before anything is generated | the API itself |
| Free-tier eligibility and its RPM / TPM / RPD | **Not verified.** Third-party figures disagree (10 RPM / 500 RPD vs 30 RPM / 1,500 RPD), and Google sets limits per project | Your project's limits in AI Studio (rate-limit page) are authoritative |

If check 0 fails for your key, set `GEMINI_MODEL` to a model AI Studio lists for your key; Unstuck does not switch models silently. No alternative model was verified either, so none is recommended over the default here.

### Free-tier limits

Google sets the free-tier limits per project and per model, and changes them from time to time. Check the current values for your key in AI Studio, under the rate-limit page. Third-party summaries disagree (about 10–30 requests per minute and 500–1,500 per day for Flash-Lite models). **No figure is verified here, and none is hard-coded:** `GEMINI_MAX_RPM` (default 10, the conservative end) and `AI_DAILY_CALL_LIMIT` are yours to set.

Unstuck handles the limits as follows:

- **Requests per minute.** Every HTTP attempt, retries included, waits for a pacing slot (`GEMINI_MAX_RPM`, default 10). At 10/min a cold agent run over the 8 demo invoices takes about a minute; at 3/min, about three.
- **429, per minute.** Retried **once**, after the delay Google gives in `RetryInfo` (or a `Retry-After` header; 60 s if neither), and every other Gemini request is pushed back by the same delay. If it fails again: **AI: Rate limited**, rules for that invoice.
- **429, daily quota** (`QuotaFailure` names a per-day quota). Never retried. Gemini calls are paused: for the reset time Google gives (`RetryInfo`, or a `Retry-After` header), capped at **one hour**; or for **30 minutes** when no usable hint is given. Calls during the pause send nothing and use no budget. **AI: Rate limited**.
- **Daily cap.** `AI_DAILY_CALL_LIMIT` is Unstuck's own cap, checked before every HTTP attempt.
- **Failed invoices.** An invoice whose AI call failed is not retried automatically for 30 minutes; **Diagnose again** retries it straight away.
- **Reuse.** A valid AI diagnosis is reused until the invoice, conversation, notes or rules change. A second agent run makes no calls for unchanged invoices.

## Switching providers

| Goal | Setting |
|---|---|
| Gemini (default) | `GEMINI_API_KEY=…` (with `AI_PROVIDER` unset or `gemini`) |
| Claude | `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=…` |
| Rules only | `AI_PROVIDER=none`, or no key |

Restart the server after changing provider. Existing diagnoses keep the provider and model that produced them; this is stored per diagnosis in `ai_provider` and `model`. When the configured provider becomes available, rules-only diagnoses are upgraded on the next run.

## What each status means

| Badge | Meaning | Counts as AI? |
|---|---|---|
| AI: Gemini (or AI: Claude) | A schema-valid answer from that provider was used. | Yes |
| AI: Not configured | No key, `AI_PROVIDER=none`, or an unknown provider. A genuine rules-only run. | No |
| AI: Rate limited | The provider returned 429 (per-minute or daily quota). Rules were used. | No |
| AI: Request failed | Auth error, unknown model, region restriction, server error, timeout or network error. Rules were used. | No |
| AI: Invalid response | Malformed JSON, missing or invalid fields, a refusal or safety block, or a cut-off answer. Rules were used. | No |
| AI: Daily limit reached | `AI_DAILY_CALL_LIMIT` was reached and no request was sent. Rules were used. | No |

Activity shows, for each AI diagnosis, the provider, model, request id (Gemini `responseId`), latency and token usage. Token usage is broken down into input, output, thinking and cached tokens.

## Architecture

```
src/lib/ai/
  providers/types.ts      AiProvider interface: generateStructured, chatTurn, checkModel; neutral ChatItem transcript
  providers/gemini.ts     @google/genai adapter (default)
  providers/anthropic.ts  @anthropic-ai/sdk adapter (optional)
  providers/index.ts      getAiProvider(): the configured provider, or null (→ rules)
  shared.ts               daily budget, untrusted-text quoting, key redaction, request pacing
  reliability.ts          the one retry runner: classification, backoff, hint clamping, quota pause, circuit breaker
  diagnosis.ts            prompt, schema (zod), provider-independent validation, rules fallback
  payer-agent.ts          payer tool loop over provider.chatTurn (four strict, server-validated tools)
  studio-chat.ts          AG Studio turn format ⇄ neutral transcript
```

How the Gemini adapter works:

- **Structured output.** Diagnosis requests use `responseMimeType: "application/json"` with `responseJsonSchema`, generated from the application's zod schema and normalised to the conservative subset Gemini accepts. If the API rejects the schema with a 400, the adapter retries once in plain JSON mode. Either way, **Unstuck validates every answer against its own schema** and checks client quotes against the conversation. A schema-constrained answer is never trusted on its own.
- **Finish reasons.** `STOP` means complete. `MAX_TOKENS` means cut off, which counts as unusable. `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII` and a blocked prompt (`promptFeedback.blockReason`) are refusals, which also count as unusable. Any other reason is treated as unusable. Thought-summary parts are never read as the answer.
- **Endpoint pinned.** The client always uses the Gemini Developer API (`https://generativelanguage.googleapis.com/`, key in the `x-goog-api-key` header). Environment variables the SDK would otherwise honour (`GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_GENAI_USE_ENTERPRISE`, `GOOGLE_GEMINI_BASE_URL`) cannot switch it to Vertex AI billing or send the key elsewhere.
- **Retries (one place, `src/lib/ai/reliability.ts`).** The SDK's own retry loop is off (`attempts: 1`): it would bypass pacing and the budget, ignores `RetryInfo`, and retries after ~1 s, too soon for "model overloaded". Instead, every attempt is budgeted and paced, and:

  | Failure | Retried? |
  |---|---|
  | 503 (model overloaded) / 500 / 502 / 504 / 408, connection errors (reset, refused, DNS, TCP connect timeout) | Yes. Diagnosis: up to 3 attempts, backoff 4 s → 8 s (±50% jitter, capped at 30 s), and no new attempt starts more than 120 s after the first. Chat turns: up to 2 attempts within 30 s |
  | 429 per minute | Once, after Google's delay (see above) |
  | 429 daily quota, invalid key (400/401/403), unknown model (404), malformed request (400), client timeout (60 s per attempt; the request may still be running) | Never |
  | 400 "schema rejected" | Not retried as is; asked again once in plain JSON mode |

  Two calls in a row that run out of retries on transient errors **pause Gemini for 2 minutes** (circuit breaker). The pause is checked when a call starts *and again right before every attempt*, after its pacing wait, so calls that were already queued stop too: nothing is sent or charged while paused. When the pause ends, the first **new** call to arrive becomes the single recovery probe and sends one request; everyone else still fails at once until it settles. Success closes the breaker. So does a *definite* answer from Gemini (schema rejected, invalid request, bad key or permission, unknown model, region): it proves Gemini is reachable, so a follow-up such as the JSON-mode fallback goes ahead and the real error is reported, instead of the outage being extended. An availability failure (503 or other 5xx, network, our timeout, a per-minute 429, an unexpected error) pauses Gemini for another 2 minutes; a daily-quota 429 sets the quota pause instead. Calls that were already queued when the pause began never become the probe, even if the pause ends while they wait: at their pre-send check they are refused, unsent and uncharged, so a backlog can't turn into a burst of recovery requests. Probe ownership is held by exactly one call and is always handed back (success, failure, or a probe that couldn't send because of the queue limit, the daily limit or an unexpected error), so the breaker can't get stuck; this state, like the pacer and the locks, lives in the single server process and resets on restart. The header shows **AI: Gemini paused** (owner view only; the public `/api/health` carries no pause details) and rules carry on. An invoice skipped because nothing was sent is retried on the next run, without the usual 30-minute cooldown. Interactive turns (payer page, Studio) never queue more than 25 s behind background diagnoses, and a background diagnosis never more than 10 minutes; they fall back to rules instead.
- **Provider hints are untrusted.** `Retry-After` and Google's `RetryInfo` are sanitised (negative, non-numeric or infinite values are ignored) and clamped before they affect any wait: at most 60 s for a retry or for pushing back the shared pacer, at most 60 minutes for a daily-quota pause (30 minutes when no hint is given).
- **Evidence.** Each diagnosis event in Activity records the attempts, total time including waits, the final attempt's latency, and on failure the class (`unavailable`, `rate_limited`, `quota_exhausted`, `auth`, `model_not_found`, `timeout`, `network`, `circuit_open`, …) and HTTP status, with Google's short message (for example "The model is overloaded. Please try again later."). The eval summary counts them (`errorKinds`, `httpAttempts`). The payer agent makes at most 5 turns per message.
- **Tool calls.** The model's turn, including its *thought signatures*, is echoed back unchanged on the next turn, as Gemini requires, with exactly one response per call (matching id and name). If Gemini returns no call id, none is invented on the wire. Every payer tool call is checked against an allowlist and a strict argument schema **before** it runs (Gemini does not enforce tool schemas the way Claude's strict mode does); a rejected call gets an error result and is never executed. Each provider call in the payer loop counts against the daily limit.
- **AG Studio and thought signatures.** Studio's protocol is stateless, so the server keeps the provider's raw turn for 30 minutes (at most 500 entries) and restores it only within the same conversation and only for exactly the same calls (ids, names, arguments). Call ids are random. Raw content and signatures are never returned to the browser. A miss (restart, expiry, another server instance) sends the turn without a signature; Gemini 3 models may then reject the request, which shows as "AI request failed" in Studio, never as a wrong answer.
- **Errors.** Errors are classified from the HTTP status and Google's status token (for example `RESOURCE_EXHAUSTED`, `INVALID_ARGUMENT`, `NOT_FOUND`, `PERMISSION_DENIED` or `FAILED_PRECONDITION`). For Gemini, Google's own error message may be kept in a **short, redacted form: at most 120 characters** of it, inside an error note that is itself capped at 200 characters. That is enough for an operator to tell "The model is overloaded" from other failures. The note is stored as the diagnosis's AI detail, shown in the invoice drawer and on Activity events. Claude API errors keep only the HTTP status, error type and request id. Anything that looks like a key (`AIza…`, `sk-ant-…`, `?key=`, auth headers) is redacted before any error text is kept. Raw provider responses, request content and credentials are never written to the database or logs. AG Studio's thought-signature cache is the one exception for raw turns: it holds them in server memory only, for at most 30 minutes, and never returns them to the browser.

The provider never decides money matters or PayPal operations. The policy engine, plan maths and PayPal calls are deterministic code, unchanged by this migration.

## Verification and evaluation

- `npm run verify:ai` runs 16 checks against the real provider API on an isolated, disposable database, in forced simulation. Each check is labelled `real_provider` (needs a genuine answer), `negative_control` (a deliberate failure against the real API), `local` or `safety`, and the evidence says `real_provider_response_received: true` only when a real, valid diagnosis came back. If the key or model check fails, it stops before generating anything. PayPal credentials and provider-redirecting variables are removed from the process, and every outgoing connection (any HTTP client, redirects included) is limited to the provider's API host; everything else, PayPal included, is blocked and counted. Evidence is written to `qa/ai-verification/verify-ai-<provider>-<timestamp>.json` with no key. See [`qa/REAL_AI_EVALUATION_REPORT.md`](../qa/REAL_AI_EVALUATION_REPORT.md).
- `npm run eval` runs the 26-scenario evaluation with the configured provider. It writes `qa/eval/<provider>-<timestamp>.json`, `<provider>-NO-AI-ANSWERS-<timestamp>.json` if the provider answered nothing, or `rules-<date>.json` when no AI is configured. No run ever overwrites an existing file. Fallbacks are excluded from provider-only accuracy and from provider latency.
- `npm test` covers the adapters with scripted fakes: valid output, malformed JSON, missing fields, refusal, truncation, rate limit, daily quota, auth, timeout, retry limits, cooldown, budget, provider selection, rules fallback, thought-signature round trips and no PayPal access. The relevant files are `tests/ai-providers.test.ts`, `tests/ai-diagnosis.test.ts` and `tests/ai-tool-security.test.ts` (tool allowlist and argument validation, cache scoping/expiry/eviction, real-SDK retry behaviour with a stubbed network, endpoint pinning, the verification network guard).
