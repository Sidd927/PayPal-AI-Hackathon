# Updated Product Strategy (Phase 2)

## Improvement scoring

Each improvement is scored 1–5 on: user value · innovation · feasibility · PayPal depth · AI differentiation · judge impact · reliability, with time cost subtracted (1–3).

| Improvement | Val | Inn | Feas | PP | AI | Judge | Rel | −Time | Score | Decision |
|---|---|---|---|---|---|---|---|---|---|---|
| **Observable agent run** (sync → gather → diagnose → plan → policy → act → verify, with a step trace; revisits promises, waits and installments) | 5 | 4 | 4 | 4 | 4 | 5 | 4 | −2 | **28** | Build |
| **Diagnosis v2**: evidence vs inference, expected outcome, risks, alternatives, required approval | 5 | 4 | 5 | 2 | 5 | 5 | 5 | −1 | **30** | Build |
| **Transparent risk score + 30-day cash outlook** (heuristic, labelled) | 4 | 3 | 5 | 3 | 2 | 4 | 5 | −1 | **25** | Build |
| **Installment and promise follow-ups** (deterministic, policy-gated) | 5 | 3 | 4 | 5 | 2 | 4 | 4 | −1 | **26** | Build (part of the agent run) |
| **AG Studio insights page** (sponsor) + AG Grid CSV export and bulk selection | 3 | 3 | 3 | 2 | 1 | 5 (AG Grid prize) | 3 | −2 | **18** | Build, isolated page |
| **AI evaluation harness** (25 scenarios) + safety suite | 3 | 3 | 5 | 2 | 5 | 5 | 5 | −1 | **27** | Build |
| UX: toasts, confirm-before-money, honest counts, mobile card list | 4 | 1 | 5 | 1 | 1 | 4 | 5 | −1 | **20** | Build |
| Email ingestion (Gmail/Outlook) | 5 | 2 | 1 | 1 | 3 | 3 | 2 | −3 | 14 | Roadmap |
| Trained payment-delay prediction | 3 | 3 | 1 | 1 | 3 | 2 | 1 | −3 | 11 | Rejected: no real data; a heuristic labelled as such is more honest |
| Multi-agent architecture | 1 | 2 | 3 | 1 | 3 | 2 | 2 | −2 | 12 | Rejected: one orchestrator with bounded capabilities is clearer and safer |
| PayPal AI Toolkit Claude Code plugin | 2 | 1 | 2 | 3 | 1 | 2 | 3 | −1 | 13 | Investigated: it's a *developer* aid (skills, hooks, sandbox MCP) for coding agents, not a runtime dependency. It can't be used here (network). Recommended for the owner's local sandbox debugging |

## Product principles (unchanged, now visible)

1. The agent proposes, the rules decide, PayPal executes, the owner stays in control.
2. Evidence is quoted; inference is labelled as inference.
3. Every number is derived from application data. Predictive numbers are heuristics, and the UI says so.

## Hypotheses to validate with real users after the hackathon

- H1: owners accept automatic reminders but want approval for money changes (the current default).
- H2: clients offered a self-serve plan choose one rather than go silent.
- H3: reason-specific remedies recover faster than reminders. This needs an A/B test on real invoices; no outcome claims are made in the submission.
