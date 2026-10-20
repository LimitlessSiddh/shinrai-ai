# MVP Implementation Plan — NBA Prediction Market Sandbox for AI Agents

> **For the future implementation session:** Build this in order. Do not start cloud infrastructure, a real model call, or a Polymarket adapter until the prior local acceptance checks pass.

## Goal

Deliver one interview-ready, paper-only NBA game-winner market loop: a user or constrained agent can inspect a fixture market, submit a safe order request, receive a deterministic match/rejection, see a ledger-backed balance, and replay the run with evidence.

## Quality gates

Every phase must pass type-checking, linting, unit tests, and its named integration/e2e checks before the next phase begins. CI must run with no provider secrets and no AWS account.

## Phase 0 — Foundation and developer experience

Create the monorepo directories from the final architecture, a pinned Node/TypeScript toolchain, package manager workspace, `.env.example`, Compose stack, test conventions, and CI workflows.

**Create:** `apps/web`, `apps/api`, `apps/worker`, `packages/{domain,contracts,adapters,agent-tools,observability}`, `infra/cdk`, `fixtures/nba`, `tests/{integration,e2e,evaluations}`.

**Acceptance checks:** a fresh clone can run static checks; local Compose starts PostgreSQL, NATS, and the optional observability stack; no secret or cloud credential is necessary.

## Phase 1 — Domain and ledger before HTTP

Implement the domain in `packages/domain`: NBA market/outcome lifecycle, limit-order command types, matching rules, paper-credit reservations, double-entry ledger postings, and idempotency behavior. Put Zod/TypeScript contract definitions in `packages/contracts`.

**Tests first:**

- `tests/unit/ledger.test.ts`: every accepted movement balances; an overspend is rejected.
- `tests/unit/matching.test.ts`: price-time priority and partial fills are deterministic.
- `tests/unit/idempotency.test.ts`: repeating a command changes state once.
- `tests/unit/settlement.test.ts`: a resolved market settles once and cannot be resolved twice.

**Acceptance checks:** deterministic fixtures produce identical order/fill/ledger outputs on two runs; every domain event carries a correlation and causation ID.

## Phase 2 — PostgreSQL source of truth and outbox

Add migrations and repositories in `packages/adapters/postgres`. Implement transaction boundaries, advisory market locks, ordered account locks, unique idempotency records, append-only ledger constraints, and the transactional outbox.

**Tests first:**

- `tests/integration/postgres-concurrency.test.ts`: concurrent orders cannot overspend a paper account.
- `tests/integration/outbox.test.ts`: a committed command yields exactly one persisted outbox event; a rolled-back command yields none.
- `tests/integration/retry.test.ts`: a transient serializable failure retries safely and returns the original idempotent result.

**Acceptance checks:** Testcontainers runs the database suite locally and in CI; dashboard projections can be deleted/rebuilt from source facts.

## Phase 3 — Event transport, projections, and replay

Define `EventBus` and `ProjectionStore` ports. Implement the NATS JetStream adapter locally, consumer idempotency, retry/dead-letter behavior, and projection worker in `apps/worker`.

**Tests first:**

- `tests/integration/event-replay.test.ts`: replaying events rebuilds equivalent market/portfolio/activity projections.
- `tests/integration/consumer-retry.test.ts`: duplicate delivery changes a projection once.

**Acceptance checks:** an injected worker failure can be retried without corrupting the ledger or views.

## Phase 4 — Human API and dashboard

Implement the HTTP surface in `apps/api` and the static Next.js dashboard in `apps/web`. V1 supports market list/detail, order submit/cancel, portfolio, activity trace, and a deliberately blocked request. Use polling for projections initially.

**Tests first:**

- `tests/e2e/human-market-loop.spec.ts`: create fixture → submit order → match → settle → inspect final ledger and portfolio.
- `tests/e2e/rejected-order.spec.ts`: an insufficient-credit order is rejected with no state mutation.

**Acceptance checks:** the dashboard has no privileged database route; API responses expose correlation IDs useful for debugging.

## Phase 5 — Restricted agent gateway and evaluation harness

Create `packages/agent-tools` with strict schemas for `getMarket`, `getRules`, `getPortfolio`, `searchEvidence`, and `requestOrder`. The gateway must route every state-changing agent tool through the same Command API. Add fake-model tests before enabling an OpenAI client.

**Tests first:**

- `tests/evaluations/policy-blocks.test.ts`: out-of-scope market, excessive order size, and expired run are blocked.
- `tests/evaluations/tool-contracts.test.ts`: malformed tool arguments never reach the domain.
- `tests/evaluations/replay-score.test.ts`: the fixed evaluation fixture emits a stable report containing Brier score, log loss, PnL, drawdown, and policy adherence.

**Acceptance checks:** an agent cannot call SQL, shell, arbitrary HTTP, or a privileged order endpoint; real-model runs are opt-in and capped.

## Phase 6 — Observability, failure drills, and demo narrative

Wire OpenTelemetry, structured logs, and redaction. Add a trace view and scripted failure drills: duplicate request, insufficient credits, worker retry, and policy-blocked agent action.

**Acceptance checks:** one correlation ID lets us navigate from an agent decision to HTTP request, ledger transaction, outbox event, projection, and evaluation result without exposing secrets.

## Phase 7 — AWS demo profile, only after local parity

Implement `infra/cdk` for a short-lived environment: S3/CloudFront, API Gateway, Lambda handlers, EventBridge/SQS, optional single-AZ RDS, S3 artifacts, least-privilege IAM, tags, budgets, and a teardown command. Local adapters remain the CI default.

**Tests first:** CDK synth/assertion tests validate no NAT Gateway, EKS, MSK, Multi-AZ RDS, provisioned concurrency, or ElastiCache appears in V1.

**Acceptance checks:** deploy and teardown are documented and repeatable; resources are verified gone after a demo; budget alerts and model spend caps are configured before a public URL is shared.

## Phase 8 — Optional read-only Polymarket comparison

Only after the V1 replay works without it, add a `MarketDataProvider` adapter that retrieves public metadata/prices for a comparison panel. No trading/account/wallet code is allowed.

**Acceptance checks:** disabling the adapter leaves all simulator correctness tests and fixtures green; provenance identifies provider timestamp and payload version.

## Demo completion definition

The project is ready to place on a resume when we can record a 2–3 minute walkthrough showing:

1. a versioned NBA market and its rules;
2. an order that creates matched fills and balanced ledger entries;
3. an agent trace that uses only approved tools;
4. a policy or budget block that prevents an unsafe request;
5. a replay/evaluation report; and
6. the local-to-AWS design plus cost controls, without pretending the project is a real exchange.
