# Phase 2 Judge Simulation

Scored 1–10 on the five official Stage Two criteria, harshly. Each judge reviewed the build at `f9a3e21` and later, using the screenshots, the tests and a live run in simulation. **The live sandbox and Claude runs are still pending**, and the scores reflect that.

## Round 1 (start of Phase 2, Phase 1 build)

| Judge | Tech | Design | Impact | Innovation | Presentation | Main criticism |
|---|---|---|---|---|---|---|
| PayPal engineer | 6 | 7 | 7 | 6 | 5 | "Mock-only; the 'agent' is a one-shot classifier; nothing revisits plans or promises" |
| AI specialist | 5 | 6 | 6 | 6 | 5 | "No evaluation at all; evidence and inference blended; confidence unexplained" |
| Product | 6 | 6 | 7 | 5 | 6 | "Claims to be the only receivables entry; it isn't (Owed, Invoice Chaser)" |
| Innovation | 6 | 6 | 6 | 5 | 5 | "Looks like an AI reminder tool until you open a drawer" |
| Design | 6 | 7 | 6 | 6 | 5 | "Phone hides the reason; the pre-run dashboard is empty; no sense of an agent working" |

## Round 2 (after Phase 2)

| Criterion | PayPal eng. | AI spec. | Product | Innovation | Design | **Avg** | Evidence |
|---|---|---|---|---|---|---|---|
| **Technological Implementation** | 7 | 8 | 7 | 7 | 7 | **7.2** | Agent orchestrator with persisted trace; 59 tests including adversarial-model tests; 24-check contract test of the live gateway incl. the agent run; 26-scenario eval harness; the dev reload loop found and fixed. *Held back:* no real sandbox or Claude run |
| **Design** | 8 | 8 | 8 | 8 | 8 | **8.0** | First screen answers the three questions; live trace; evidence vs inference card; confirmations; mobile cards (−68% JS); AG Studio report themed to the brand |
| **Potential Impact** | 7 | 7 | 8 | 7 | 7 | **7.2** | Revalidated stats with context; a client-side page addresses the real blocker (awkwardness). *Held back:* no user validation yet |
| **Innovation** | 7 | 8 | 7 | 8 | 8 | **7.6** | Two-sided resolution and remedies as PayPal state distinguish it from Owed and Invoice Chaser; transparent risk and outlook bases are unusual honesty for this category |
| **Presentation** | 6 | 6 | 7 | 7 | 7 | **6.6** | Clear story and script. *Held back:* no video yet; screenshots show the simulation badge |

## What still blocks a 9 in each criterion, and whether we can fix it here

| Criterion | Gap | Fixable in this environment? |
|---|---|---|
| Tech | Real sandbox evidence (debug ids, webhook delivered); real Claude eval numbers | **No:** network policy and keys (B1–B3). Plans and scripts ready |
| Design | Sandbox-mode screenshots; a tablet layout for the grid | Partly. Tablet works but scrolls one column |
| Impact | Any real-user signal (even 3 freelancer interviews) | No: needs the owner |
| Innovation | Show the client-side resolution and the agent trace in the first 30 s of the video | Yes, done in the script |
| Presentation | The video itself; hosted URL | No: needs the owner (B4, B8) |

## Highest-impact improvements implemented between rounds

1. Observable agent runs and deterministic follow-ups (Tech, Innovation).
2. Diagnosis v2 plus the drawer redesign (AI, Design).
3. Dashboard redesign, mobile cards, confirmations (Design).
4. Eval plus adversarial tests, which found 3 defects (Tech, AI).
5. AG Studio Insights (sponsor, Design).
6. Corrected competitive claims and repositioning (Product, Innovation).

## Honest overall

The code-complete product is strong and distinctive. The **submission** is not ready until the owner runs the sandbox and Claude once, deploys, and records the video. Those three actions move Tech and Presentation the most.
