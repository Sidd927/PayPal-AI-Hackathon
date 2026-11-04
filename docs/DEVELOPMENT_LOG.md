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
