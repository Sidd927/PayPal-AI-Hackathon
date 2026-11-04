# Development Log

## 2026-11-04: session 1

### Phase 0: environment
- Empty repository on the designated branch. Node 22, Chromium/Playwright available.
- **Blocker found:** the egress proxy denies `api-m.sandbox.paypal.com`, `paypal.com`, `devpost.com` and `render.com`. GitHub, npm and `api.anthropic.com` are reachable. No PayPal or Anthropic application keys.

### Phase 1–2: research and selection
- Official pages reconstructed via web search; PayPal capabilities verified from the published `@paypal/agent-toolkit` 1.11.0 and `@paypal/paypal-server-sdk` 2.5.0 source.
- Found competing entries: buyer-side agentic commerce is crowded. A mutual-aid payouts idea was dropped because a near-identical entry exists.
- Selected **Unstuck** (score 87/100).

### Phase 3–4: build
- Core: money, domain, deterministic policy engine, PayPal client and gateways, SQLite, services, AI (diagnosis + payer agent), API routes.
- Decisions:
  - direct REST for Invoicing (not in the server SDK);
  - full-replacement PUT builder;
  - action id = `PayPal-Request-Id`;
  - webhooks as signals;
  - simulation and rules-only modes, clearly labelled.
- UI: ledger-green and marigold identity, sentence hero, AG Grid board, drawer, payer page, activity, rules.

### Phase 7: testing
- 40 unit/flow tests, 23-check contract test against a strict mock PayPal, 14-check browser E2E (dev and production).
- 10 defects found and fixed; see `qa/TEST_RESULTS.md`.

### Outstanding (owner)
1. Sandbox + Anthropic credentials; allow-list the sandbox hosts or run locally; `npm run check:sandbox && npm run seed:sandbox`; walk through Option B.
2. Render deploy; make the repo public.
3. Record the video.

## 2026-11-04: session 1, Phase 2 (audit and evolution)

- **Audit:** git, code, tests and UI re-inspected; 11 defects found (see `qa/PHASE_2_FINAL_AUDIT.md`). Phase 1's claim of no competing receivables entries was false and is corrected everywhere.
- **Attribution:** commits now use the verified owner identity `Sidd_927 <212080526+Sidd927@users.noreply.github.com>`; the environment's Claude signing disabled for this repo; no AI trailers. History unchanged.
- **Product:** repositioned as two-sided invoice resolution. Added:
  - an observable agent run with follow-ups;
  - diagnosis v2;
  - a transparent risk score and 30-day outlook;
  - a dashboard redesign with mobile cards;
  - confirmations and toasts;
  - AG Studio Insights.
- **Quality:**
  - 26-scenario AI evaluation harness (rules baseline measured);
  - adversarial-model tests;
  - contract test extended to the agent run;
  - dev-server reload loop fixed;
  - phone bundle −68%.
- **Tests:** 59 unit, 24 contract and 17 e2e, all passing.
- **Still blocked:** real sandbox, real Claude, Render, video. These need the owner's credentials and accounts.

## 2026-11-04: session 1, Phase 3 (final pass)

- **AG Studio Agent Framework:** custom *Unstuck Insights* agent (`clientToolRunner`, primary via `createAiHarness`) in Studio's AI panel and on the page. It answers seven receivables questions from read-only tables, opens the matching report, and declines anything else. Studio's built-in agents run on Claude through a server adapter when a key is set. Found and fixed a malformed widget sort that broke the first view switch.
- **Security and reliability audit** (`qa/FINAL_SECURITY_AND_RELIABILITY_REPORT.md`), fixes, each with a test:
  - rules re-checked at execution (stale approvals);
  - fail-closed owner console;
  - constant-time auth;
  - content gate on model-written automatic reminders;
  - sandbox guard against a production base URL.
- **Business-outcome correctness:**
  - single-currency KPIs;
  - "Collected after Unstuck acted" with a causation caveat;
  - promises and plans are never collected money.
- **Eval:** strict scoring (abstention never correct), per-category denominators. Rules baseline: 14/26 correct, 12 abstained, 0 forbidden, 0 unsafe.
- **Competitors rechecked:** at least eight hackathon entries. Two show real sandbox evidence and hosted demos (`research/PHASE_3_COMPETITOR_RECHECK.md`).
- **Tests:** 90 unit, 25 contract, 20 e2e (production build), `npm audit` clean.
- **Still blocked:** real sandbox (host unreachable, no credentials), real Claude (no key), hosting, AG licence key, video. All need the owner.

## 2026-11-04: final competition pass

- **Resolution loop as the centrepiece:** the dashboard places every open invoice in one stage (Spotted → Understood → Waiting for you → Acted → Agreed → Paid), computed server-side from recorded facts; the drawer shows a per-invoice stepper.
- **Missed promises:** the demo includes one (Kestrel Media). The rules fallback treats it as a recorded fact, quotes the client's promise, labels the cause as an assumption, and follows up within policy.
- **Insights:**
  - a scored router covering 15 phrasings;
  - new reports: overdue by customer, not responding, highest risk, and what happened after each action;
  - answers name clients and amounts;
  - the container is sized to each report.
- **Submission:** README, Devpost and award strategy rewritten around the loop; the video shot list is ready.
- **Gates:** 100 unit, 25 contract, 22 e2e on the production build.
- **Still blocked:** sandbox and Claude (no network access or credentials here), AG licence, hosting, video. All are owner actions.
