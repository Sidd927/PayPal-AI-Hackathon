# Resource and Budget Plan

| Resource | Plan | Expected cost |
|---|---|---|
| Claude Code cloud session (~$100 credits) | Research once and cache it in `research/`; batch file writes; avoid repeated large reads | Within budget |
| PayPal sandbox | Free | $0 |
| Anthropic API (app runtime) | `claude-opus-5-5` at `effort: low/medium`; ~9 diagnoses × ~3k tokens ≈ 30k tokens per full board diagnosis (~$0.25 at $4/$20 per MTok, mostly input). Payer chat ≈ 5–10k tokens per conversation. Prompt caching on the stable system prompt. The demo plus testing is expected to cost **< $10** | Owner's key |
| Render | Free web service | $0 |
| AG Grid | Community edition (MIT) | $0 |
| GitHub | Public repo | $0 |

Controls in code: per-request `max_tokens`, 30 s timeout, 2 retries, an in-memory diagnosis cache keyed by invoice state hash (no re-diagnosis unless something changed), and an `AI_DAILY_CALL_LIMIT` guard.

No purchases, no paid tiers, no real-money transactions.
