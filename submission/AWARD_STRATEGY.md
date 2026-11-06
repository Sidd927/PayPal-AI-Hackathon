# Award Strategy and Demo Story

_Updated 2026-11-05. Prize structure as given in the official Devpost rules (read by the owner; Devpost can't be fetched from the build environment, so re-check it once before submitting): five equally weighted criteria (technological implementation, design, potential impact, innovation, presentation). A project can win **one Grand Prize, or one honourable mention, plus one sponsor prize**. The AG Grid sponsor category is named **Best Use of AG Grid** in the Devpost rules; AG Grid's own announcement calls its prize "Best Use of AG Studio". We treat these as one sponsor prize, not two categories._

## Positioning

> **Unstuck is an AI receivables-resolution agent that turns unpaid PayPal invoices into evidence-backed, policy-checked actions in PayPal, and follows each one until the money arrives.**

What makes it more than a chatbot or an invoice dashboard is the combination, shown as one loop:
1. **Diagnosis** separating quoted evidence from inference, and abstaining when unsure.
2. **A cause-specific remedy executed as PayPal state:** reference + re-send, partial payments, conditional discount, recorded payment, paused reminders. Not just an email.
3. **A deterministic policy engine** and owner approval between the AI and PayPal.
4. **Two-sided:** the client negotiates only within pre-approved terms.
5. **Honest verification:** "accepted by PayPal" vs "confirmed on re-read", and nothing counts as collected until PayPal reports the money.

## Prize fit (evidence-based, no guarantees)

| Prize | Fit | Evidence | What it hinges on |
|---|---|---|---|
| **Grand Prize** | Credible | A complete product with an end-to-end loop, two-sided flow, safety shown by tests, and a provider-independent AI layer | Real-integration evidence (owner's `verify:ai` and read-only sandbox run) and a tight video |
| **Best Use of PayPal + AI** (HM) | **Strongest** | The AI's diagnosis picks *which* PayPal Invoicing operation fits the cause; the code bounds it; PayPal executes | Show one remedy and its PayPal-side effect clearly (simulation-labelled or sandbox) |
| **Best Use of Agentic Commerce** (HM) | **Strong** | The agent negotiates payment terms with the client inside owner-set rules; acceptance changes the PayPal invoice | Scene 6 of the video |
| **Most Impactful** (HM) | Moderate | A specific, real problem (sourced late-payment statistics) and a specific user | No user validation yet: present impact as a hypothesis, not a result |
| **Most Creative** (HM) | Moderate | The resolution loop and client-side resolution page | Several entries draft reminders; ours is the combination |
| **Best Demo Delivery** (HM) | Depends on the video | One story, visible state changes | `VIDEO_SCRIPT.md` Mode A, under 3:00 |
| **Best Use of AG Grid** (sponsor) | **Strong** | AG Grid board and activity log are core to the workflow; AG Studio Insights with our own Agent Framework agent answering grounded questions in Studio's AI panel | Show the agent in the AI panel (*Build your own report*), not only the page's *Ask Insights* box. AG Studio works locally without a licence, but its watermark may show; no licence key is included |
| Render / APIMatic / Bryntum | Not targeted | No authentic product need; adding them would be superficial | — |

**Recommended focus:** Grand Prize on the strength of the whole product; **Best Use of PayPal + AI** as the honourable mention it fits best; **Best Use of AG Grid** as the sponsor prize. Only one honourable mention can be won, and judges choose.

## Scored against the five criteria (honest)

| Criterion | Strength | Gap |
|---|---|---|
| Technological implementation | Breadth of PayPal Invoicing operations, idempotency, verified webhooks, execution-time policy re-check, per-invoice concurrency control, a provider reliability layer; strict-mock contract test | Real-service evidence is the owner's local run; webhooks not live-tested |
| Design | Coherent flow: dashboard → loop → drawer → client page → Insights; responsive; honest labelling | AG Studio watermark without a key |
| Potential impact | A real, specific problem; remedies map to how invoices actually stall | No user validation |
| Innovation | Diagnosis + cause-specific PayPal remedy + client resolution page + missed-promise follow-through, as one loop | Category is crowded; the combination is the claim |
| Presentation | Timed script with backups | Video not recorded |

## What not to claim

- Any Gemini accuracy figure before `npm run eval` has produced a `gemini-…` result.
- That anything ran against the PayPal sandbox beyond what the owner's local run shows.
- That a reminder was delivered: PayPal reports acceptance, not delivery.
- Recovered revenue or causation: the figure is "collected after Unstuck acted".
- That the risk score is predictive: it is a transparent score from named rules.
- That Unstuck is the only AI collections entry.
- That webhooks were verified live: they are tested against a strict mock only.
- Any live PayPal payment collection, customer validation or real-world impact: none has been demonstrated.
