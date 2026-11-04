# Award Strategy and Demo Story

_Final pass, 2026-11-04. Prize structure from the official rules, as quoted in the owner's brief (Devpost itself can't be reached from the build environment, so re-check it once before submitting): a project can win **one Grand Prize or one Honorable Mention, plus one Sponsor Prize**. All five criteria are weighted equally._

## Targets

| Prize | Why Unstuck is credible | What it hinges on |
|---|---|---|
| **Grand Prize** (1st $12k, 2nd $8k, 3rd $5k) | A complete product rather than a proof of concept: the full resolution loop, two-sided (owner and client), with PayPal state changes and visible safety | Real sandbox evidence and a strong video. Rival entries already show sandbox ids and hosted demos |
| **Best Use of PayPal + AI** ($5k, HM) | The AI decides *which* PayPal operation fits the cause (PUT reference, partial payments, conditional rules, record payment, cancel reminders), and code bounds it | Same evidence |
| **Best Use of Agentic Commerce** ($5k, HM) | An agent negotiates payment terms with the client inside owner-set rules, and acceptance executes in PayPal | Show scene 6 clearly |
| **Most Impactful** ($5k, HM) | A specific audience (small service businesses on PayPal Invoicing) and a measurable problem (late invoices) | Keep the stats sourced; don't overclaim recovery |
| **Best Demo Delivery** ($5k, HM) | One story, one loop, visible state changes | The video. Use `VIDEO_SCRIPT.md` exactly; under 3:00 |
| **Best Use of AG Grid** (sponsor: $5k / $2k / $1k) | AG Grid board and audit log, plus an AG Studio report and **our own Studio Agent Framework agent**, which answers 14 phrasings with grounded figures and declines the rest | The licence key (watermark) and a few seconds of Insights in the video |

At most one honourable mention can be won; we don't pick which. Render, APIMatic, Bryntum and Channel3 are not targeted: adding them would distract from the main submission.

## Scored against the five criteria (honest)

| Criterion | Strength | Gap |
|---|---|---|
| Technological implementation | Breadth of PayPal Invoicing operations, idempotency, verified webhooks, execution-time policy re-check; strict-mock contract test | **No real sandbox run yet**; no real Claude run yet |
| Design | Coherent product: dashboard → loop → drawer → client page → Insights; responsive; honest labelling | AG Studio watermark until a key is set |
| Potential impact | A real, specific problem; the loop maps to how invoices actually stall | No user validation beyond research |
| Innovation | Diagnosis plus a cause-specific PayPal remedy plus a client-side resolution page plus missed-promise follow-through, shown as one loop | Several entries draft reminders or set up plans; ours is the combination, not a single feature |
| Presentation | Script and shot list ready | Video not recorded |

## The three actions that matter most (owner)

1. **Sandbox run** (about 20 minutes, `qa/REAL_PAYPAL_SANDBOX_REPORT.md`): it turns "mock-verified" into "PayPal-verified" for the technology criterion.
2. **Record the video** (`VIDEO_SCRIPT.md`), ideally against the sandbox.
3. **AG Studio trial key** for the sponsor prize, and a **Claude key** to publish a real evaluation (`npm run eval`).

## Demo story in one line

> Maya is owed $21,700 on eight PayPal invoices, each stuck for a different reason. Unstuck works out why, fixes what her rules allow inside PayPal, gets her client onto a plan she approved in advance, and catches the promise that quietly broke.

## What not to claim

- That Unstuck is the only AI collections entry, or the only one with PayPal-native remedies.
- Any Claude accuracy figure before the run.
- Recovered revenue or causation: the figure is "collected after Unstuck acted".
- That the risk score is predictive: it is a transparent score from named rules.
- That anything was verified against the PayPal sandbox before the owner's run.
