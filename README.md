# Shinrai AI

[![CI](https://github.com/LimitlessSiddh/shinrai-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/LimitlessSiddh/shinrai-ai/actions/workflows/ci.yml)

**An auditable, paper-only NBA prediction-market sandbox for AI agents.**

A constrained research agent reads a versioned NBA fixture market, cites evidence through five typed tools and requests a paper limit order. Deterministic policy decides whether the order may exist. A SERIALIZABLE matching core reserves credits, fills by price-time priority and posts balanced double-entry ledger entries with exactly one outbox event. Workers project read models over NATS JetStream. The run can then be resolved once, replayed bit-for-bit and graded.

> Paper credits only. No real money, wallets, deposits, exchange credentials or betting advice. The market data is a synthetic, versioned fixture.

## Quickstart (no cloud account, no model key)

Requirements: Docker, Node **24.21.0** (`nvm use`), Corepack.

```bash
corepack enable                 # uses the pinned pnpm 10.34.7
pnpm install --frozen-lockfile
pnpm stack:up                   # PostgreSQL (host port 55432) + NATS JetStream
pnpm db:migrate
pnpm dev                        # API :4000, worker, dashboard :3000
```

In a second terminal:

```bash
pnpm demo          # seeds fixture nba-2026-10-20.1 and runs a happy, a blocked and an approval-held agent run
pnpm demo:replay   # deterministic replay + evaluation report (also saved to var/reports/)
pnpm drill         # six scripted failure drills in an isolated scratch database
```

Open http://localhost:3000. You can also seed straight from the dashboard's empty state.

No `.env` is needed: every setting has a safe local default, and the API falls back to local-only dev identities when `SHINRAI_PROFILE=local`. See [`.env.example`](.env.example) for overrides. Real model runs are opt-in only, with `SHINRAI_MODEL=openai` plus `OPENAI_API_KEY`, and capped per run and per day. No test or demo calls a model.

## What to look at

| View                            | Shows                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Market** (`/`)                | Live paper market, the agent's thesis and policy result, market pulse, operator console (run agent, human paper order, approve/reject held orders, resolve once), balances, activity |
| **Dossier** (`/dossier/?run=…`) | Evidence → order → policy gate → committed/blocked, and the full correlation trace: tool calls, command audit, ledger postings, outbox events, projections                           |
| **Replay** (`/replay/`)         | Brier score, log loss, paper PnL, drawdown, policy adherence, tool success, violations per agent; report hash reproduced across replays                                              |

Screenshots: [`docs/demo/screenshots/`](docs/demo/screenshots/) (1440px and 375px).

## Commands

| Command                                              | What it runs                                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check` / `pnpm lint` / `pnpm typecheck` | Prettier, ESLint (enforces domain purity and agent-tool isolation), strict `tsc` for every project                                                                                             |
| `pnpm test:unit`                                     | Pure domain: matching, ledger, idempotency, settlement, events, policy, metrics                                                                                                                |
| `pnpm test:integration`                              | Testcontainers PostgreSQL + NATS: concurrency, outbox, retries, settlement, DB invariants, projections, DLQ, replay parity, HTTP API                                                           |
| `pnpm test:eval`                                     | Deterministic agent suites: policy blocks, tool contracts, golden replay report                                                                                                                |
| `pnpm test:e2e`                                      | Playwright on an isolated stack (API :4100, web :3100, database `shinrai_e2e`): lifecycle, rejection, blocked agent, replay, axe, keyboard, reduced motion, screenshots. Needs `pnpm stack:up` |
| `pnpm build`                                         | Static export of the dashboard to `apps/web/out`                                                                                                                                               |
| `pnpm cdk:test` / `pnpm cdk:synth`                   | CDK assertions and synth for the AWS demo profile. There is no deploy script                                                                                                                   |

## Repository map

```text
apps/web            Next.js static dashboard (Stealth Signal design system)
apps/api            Fastify command/query API, agent gateway wiring, Lambda entry
apps/worker         Outbox relay + projector (local loop and Lambda entries)
packages/contracts  Zod schemas: commands, events, records, tools, fixtures
packages/domain     Pure core: matching, ledger, policy, evaluation, executor
packages/agent-tools  Restricted gateway, fake model, fixture seed/replay
packages/adapters   PostgreSQL, NATS, EventBridge, OpenAI (opt-in), fixtures
packages/observability  Redacting logger, OpenTelemetry, correlation context
infra/cdk           AWS demo profile (synth only)
fixtures/nba        Versioned fixture + scripted agent scenarios
tests/              unit, integration, evaluations, e2e
```

More detail: [architecture-to-code map](docs/implementation/architecture-map.md) · [testing and drills](docs/implementation/testing.md) · [safety, threat model and cost posture](docs/implementation/safety-and-cost.md) · [demo walkthrough](docs/implementation/demo-walkthrough.md) · [decisions](docs/implementation/decisions.md) · [progress](docs/implementation/progress.md) · [original design docs](docs/README.md).

## CI and contribution

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- **quality**: format, lint, typecheck, unit and evaluation tests
- **integration**: Testcontainers
- **e2e**: production build plus Playwright, with reports uploaded on failure
- **infra**: CDK assertions and synth
- **workflows**: actionlint

Superseded branch runs are cancelled. `release-validation.yml` builds the web artifact and verifies the infrastructure plan. It holds no credentials and never deploys. A future deploy workflow needs explicit approval and a protected GitHub environment.

Recommended branch protection for `main`, applied manually in GitHub settings:

- require a pull request with one approving review
- require these status checks to pass: `quality`, `integration`, `e2e`, `infra`, `workflows`
- require branches to be up to date
- block force pushes and deletions

Security reports: see [SECURITY.md](SECURITY.md).
