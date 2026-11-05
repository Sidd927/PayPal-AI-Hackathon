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
| `GEMINI_MAX_RPM` | `10` | Unstuck spaces its own Gemini requests to stay at or below this many per minute, across the whole server process. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` / `ANTHROPIC_EFFORT` | (none) / `claude-opus-5-5` / `medium` | Used only when `AI_PROVIDER=anthropic`. |
| `AI_DAILY_CALL_LIMIT` | `500` | Hard cap on AI calls per day, for any provider. When it is reached, Unstuck uses rules and labels the result "AI: Daily limit reached". |
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

- **Requests per minute.** Requests are paced to `GEMINI_MAX_RPM` (default 10). A full agent run over the 8 demo invoices therefore takes about a minute with a cold start.
- **429 responses.** A 429 (per-minute or daily quota) is recorded as **AI: Rate limited**, and rules are used for that invoice. The SDK does not retry 429s. The invoice is not retried automatically for 30 minutes, though **Diagnose again** retries it straight away.
- **Daily cap.** `AI_DAILY_CALL_LIMIT` is Unstuck's own cap, applied before any request is sent.
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
  diagnosis.ts            prompt, schema (zod), provider-independent validation, rules fallback
  payer-agent.ts          payer tool loop over provider.chatTurn (four strict, server-validated tools)
  studio-chat.ts          AG Studio turn format ⇄ neutral transcript
```

How the Gemini adapter works:

- **Structured output.** Diagnosis requests use `responseMimeType: "application/json"` with `responseJsonSchema`, generated from the application's zod schema and normalised to the conservative subset Gemini accepts. If the API rejects the schema with a 400, the adapter retries once in plain JSON mode. Either way, **Unstuck validates every answer against its own schema** and checks client quotes against the conversation. A schema-constrained answer is never trusted on its own.
- **Finish reasons.** `STOP` means complete. `MAX_TOKENS` means cut off, which counts as unusable. `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII` and a blocked prompt (`promptFeedback.blockReason`) are refusals, which also count as unusable. Any other reason is treated as unusable. Thought-summary parts are never read as the answer.
- **Endpoint pinned.** The client always uses the Gemini Developer API (`https://generativelanguage.googleapis.com/`, key in the `x-goog-api-key` header). Environment variables the SDK would otherwise honour (`GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_GENAI_USE_ENTERPRISE`, `GOOGLE_GEMINI_BASE_URL`) cannot switch it to Vertex AI billing or send the key elsewhere.
- **Bounded calls.** Each request has a 120 s timeout. The SDK makes at most 2 attempts in total, and only on 408 or 5xx responses; 429 is never retried. There is no unbounded loop anywhere. The payer agent makes at most 5 turns per message.
- **Tool calls.** The model's turn, including its *thought signatures*, is echoed back unchanged on the next turn, as Gemini requires, with exactly one response per call (matching id and name). If Gemini returns no call id, none is invented on the wire. Every payer tool call is checked against an allowlist and a strict argument schema **before** it runs (Gemini does not enforce tool schemas the way Claude's strict mode does); a rejected call gets an error result and is never executed. Each provider call in the payer loop counts against the daily limit.
- **AG Studio and thought signatures.** Studio's protocol is stateless, so the server keeps the provider's raw turn for 30 minutes (at most 500 entries) and restores it only within the same conversation and only for exactly the same calls (ids, names, arguments). Call ids are random. Raw content and signatures are never returned to the browser. A miss (restart, expiry, another server instance) sends the turn without a signature; Gemini 3 models may then reject the request, which shows as "AI request failed" in Studio, never as a wrong answer.
- **Errors.** Errors are classified from the HTTP status and Google's status token (for example `RESOURCE_EXHAUSTED`, `INVALID_ARGUMENT`, `NOT_FOUND`, `PERMISSION_DENIED` or `FAILED_PRECONDITION`). Messages from the provider are not stored. Anything that looks like a key (`AIza…`, `sk-ant-…`, `?key=`, auth headers) is redacted before any error text is kept.

The provider never decides money matters or PayPal operations. The policy engine, plan maths and PayPal calls are deterministic code, unchanged by this migration.

## Verification and evaluation

- `npm run verify:ai` runs 16 checks against the real provider API on an isolated, disposable database, in forced simulation. Each check is labelled `real_provider` (needs a genuine answer), `negative_control` (a deliberate failure against the real API), `local` or `safety`, and the evidence says `real_provider_response_received: true` only when a real, valid diagnosis came back. If the key or model check fails, it stops before generating anything. PayPal credentials and provider-redirecting variables are removed from the process, and every outgoing connection (any HTTP client, redirects included) is limited to the provider's API host; everything else, PayPal included, is blocked and counted. Evidence is written to `qa/ai-verification/verify-ai-<provider>-<timestamp>.json` with no key. See [`qa/REAL_AI_EVALUATION_REPORT.md`](../qa/REAL_AI_EVALUATION_REPORT.md).
- `npm run eval` runs the 26-scenario evaluation with the configured provider. It writes `qa/eval/<provider>-<timestamp>.json`, `<provider>-NO-AI-ANSWERS-<timestamp>.json` if the provider answered nothing, or `rules-<date>.json` when no AI is configured. No run ever overwrites an existing file. Fallbacks are excluded from provider-only accuracy and from provider latency.
- `npm test` covers the adapters with scripted fakes: valid output, malformed JSON, missing fields, refusal, truncation, rate limit, daily quota, auth, timeout, retry limits, cooldown, budget, provider selection, rules fallback, thought-signature round trips and no PayPal access. The relevant files are `tests/ai-providers.test.ts`, `tests/ai-diagnosis.test.ts` and `tests/ai-tool-security.test.ts` (tool allowlist and argument validation, cache scoping/expiry/eviction, real-SDK retry behaviour with a stubbed network, endpoint pinning, the verification network guard).
