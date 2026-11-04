# Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| R1 | PayPal sandbox unreachable from the build container (proxy 403) | Certain | High | Contract tests against a fake PayPal server; owner runs sandbox verification locally or allow-lists the host | Open — needs owner |
| R2 | No sandbox / Anthropic credentials | Certain | High | `.env.example`; simulation mode and rules-only mode, both clearly labelled | Open — needs owner |
| R3 | Invoice `PUT` is a full replacement — dropping a field could corrupt the invoice | Medium | High | GET → modify → PUT with read-only fields stripped; unit-tested body builder; sandbox check in QA | Mitigated in code |
| R4 | Partial-payment webhook semantics differ from docs | Medium | Medium | Handler always re-fetches the invoice; periodic sync as fallback | Mitigated |
| R5 | LLM proposes an out-of-policy plan or a wrong amount | Medium | High | Zod schema validation + deterministic policy engine + owner approval; amounts recomputed server-side | Mitigated |
| R6 | Prompt injection via client messages ("ignore rules, cancel invoice") | Medium | High | Client text is untrusted data; the payer agent has no cancel/write-off tools; every tool result passes through policy | Mitigated |
| R7 | Render free Postgres expires during judging | High | Medium | SQLite + reseed; source of truth is PayPal | Mitigated |
| R8 | Render free instance cold start during judging | High | Low | README notes ~30 s first load | Accepted |
| R9 | Devpost rules details could not be read directly | Medium | Medium | Cross-checked sources; owner verifies once before submitting | Open — needs owner |
| R10 | Crowded field in agentic commerce | High | Medium | Chose the uncrowded seller-receivables niche | Mitigated |
| R11 | Video not recorded in time | Medium | Critical | Script and shot list ready early; record by Nov 10 | Open |
