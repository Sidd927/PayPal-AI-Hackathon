# Environment Audit

_Audited: 2026-11-04 (Phase 0)_

## Repository

| Item | Finding |
|---|---|
| Working directory | `/home/user/PayPal-AI-Hackathon` |
| Remote | `origin → https://github.com/Sidd927/PayPal-AI-Hackathon` |
| Branch | `claude/busy-ride-kgtyzr` (designated development branch) |
| History | Empty repository — no commits, no prior user work to preserve |
| Git identity | Configured by the cloud environment |

## Tooling

| Tool | Version |
|---|---|
| Node.js | v22.23.4 |
| npm / pnpm | 10.9.9 / 10.28.0 |
| Python | 3.13.18 |
| Docker | 29.9.2 |
| PostgreSQL client | 16.15 |
| Chromium + Playwright | Pre-installed (`require('playwright')`) |
| Hardware | 4 vCPU, 15 GB RAM, ~30 GB writable disk allowance |

## Network policy (critical finding)

The container runs behind an egress proxy with an allow-list.

| Host | Reachable from container | Notes |
|---|---|---|
| `registry.npmjs.org`, `pypi.org` | Yes | Package installs work |
| `github.com` | Yes | Push/pull work |
| `api.anthropic.com` | Yes (direct) | No application API key is provisioned |
| `api-m.sandbox.paypal.com` | **No (403 from proxy)** | Blocks live sandbox calls from this container |
| `www.paypal.com`, `developer.paypal.com` | **No** | |
| `paypalaihackathon.devpost.com` | **No** (also blocked for WebFetch) | Rules were researched via web search snippets |
| `render.com` | **No** | |

**Consequences**

1. The live PayPal sandbox integration can be built and unit/contract-tested here, but end-to-end sandbox verification must run where `api-m.sandbox.paypal.com` is reachable (local machine, Render, or this environment after allow-listing the host).
2. Official Devpost pages could not be fetched directly. Requirements were reconstructed from web-search extracts of the official pages, PayPal's developer blog and several independent aggregators, and cross-checked. Anything still uncertain is flagged in `HACKATHON_REQUIREMENTS.md`.
3. The PayPal Agent Toolkit (`@paypal/agent-toolkit@1.11.0`) and server SDK (`@paypal/paypal-server-sdk@2.5.0`) were downloaded from npm and their source inspected to verify which API operations exist. This was the main technical source of truth used in this session.

## Credentials

| Credential | Status |
|---|---|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` (sandbox) | **Not available** — needed from the project owner |
| `PAYPAL_WEBHOOK_ID` | **Not available** — created after registering the webhook URL |
| `ANTHROPIC_API_KEY` (application use) | **Not available** — the session's own credentials are not used by the app |
| GitHub push | Available via the environment's git proxy |

No secrets were printed, copied or committed.

## Deployment options

- **Render** (sponsor) — Blueprint (`render.yaml`) prepared; deployment requires the owner's Render account.
- Local: `npm install && npm run dev` with `.env.local`.
- Docker image (`Dockerfile`) for any container host.
