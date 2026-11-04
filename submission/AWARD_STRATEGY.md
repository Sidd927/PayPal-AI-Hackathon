# Award Strategy and Demo Story

_Phase 3, 2026-11-04. Based on `research/PHASE_3_COMPETITOR_RECHECK.md`._

## Where Unstuck can win

| Prize | Fit | What decides it | Status |
|---|---|---|---|
| **AG Grid sponsor prize** (primary) | Strong | AG Grid on the core workflow (board, activity), plus AG Studio Insights with **our own agent built on the Studio Agent Framework**. At least two rivals also use Studio: one has a custom widget and hosted demo, one has built-in agents on Claude | Integration done and e2e-verified. **Needs the trial licence key** (watermark) and ideally a hosted URL |
| Grand prize / honourable mention | Possible, not likely without evidence | Judges compare against entries that show real sandbox invoice ids and hosted demos | **Blocked on the owner's sandbox run and deployment** |
| Render sponsor prize | Alternative only (one sponsor prize per project) | Deployed on Render | `render.yaml` ready |

## The three things that move the needle, in order

1. **Real sandbox run, with evidence in the repo** (about 20 minutes): `npm run check:sandbox`, `npm run seed:sandbox`, walk the Bluebird plan with the sandbox buyer, and paste the invoice ids and debug ids into `qa/REAL_PAYPAL_SANDBOX_REPORT.md`. Without this, Unstuck's strongest claim, that remedies are executed as PayPal state, is supported only by a mock.
2. **Hosted demo** on Render in simulation mode (open to judges), with the AG Studio trial key set.
3. **Claude eval run** (`npm run eval` with a key) and publish the table as measured, whatever it shows.

Feature work beyond this has lower return than any of the three.

## Demo story (2:50)

One business and one week. The owner, Maya, is owed $20,050 across seven PayPal invoices. Six are late, each for a different reason.

1. **Hook (0:00–0:30):** the sentence at the top of the console. "Every unpaid invoice has a reason."
2. **The agent works (0:30–0:55):** Run the agent, and the trace shows it acting within the rules and asking about the rest.
3. **Diagnosis → PayPal action (0:55–1:30):** Northwind's PO fix: quote, inference, one click, PayPal re-sends. Harbor's dispute: reminders paused, a suggested reply.
4. **Resolution with the client (1:30–2:10):** Bluebird's page. The client asks for a plan, sees the consequences, accepts, PayPal switches to partial payments, and they pay $400 in the sandbox.
5. **Follow-through (2:10–2:25):** a verified webhook. "Plan 1 of 3 paid. Collected after Unstuck acted: $400."
6. **Ask Insights (2:25–2:38):** "Build a report for invoices requiring human approval", answered by our AG Studio agent.
7. **Close (2:38–2:50):** "The agent proposes. Your rules decide. PayPal executes."

**Rule:** no footage presented as real unless the header badges read "PayPal sandbox" and "Claude". If those runs can't happen, record in simulation and say so on screen.

## What not to claim

- That Unstuck is the only AI collections entry, or the only one with PayPal-native remedies.
- Any Claude accuracy figure before the run.
- Recovered revenue or causation: the figure is "collected after Unstuck acted".
- That the risk score is predictive: it is a transparent heuristic.
