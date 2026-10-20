# Final Architecture — NBA Prediction Market Sandbox for AI Agents

**Status:** Approved V1 design. This is a build blueprint, not a claim that the system is deployed or production-certified.

## One-sentence architecture

An agent-safe, paper-only NBA prediction-market simulator in which deterministic TypeScript services own the ledger, matching, settlement, and policy enforcement; agents can only call narrow tools through an auditable gateway.

## What we are deliberately building

- NBA game-winner markets with owned, versioned fixtures.
- Paper credits only: no wallet, deposits, withdrawals, real-money orders, or exchange credentials.
- A web dashboard for observing markets, orders, fills, balances, agent decisions, and blocked actions.
- One research-and-trading agent whose tool calls are constrained by policy.
- Replays, evaluations, and event traces that make the project explainable in an interview.

## System boundaries

| Boundary | Owns | Must never own |
| --- | --- | --- |
| Browser / Agent SDK | Display and request submission | Ledger writes, settlement, provider credentials |
| Edge API | Authentication, request shaping, idempotency handoff | Business-rule bypasses |
| Command API | Market queries, command validation, orchestration | LLM decision-making |
| Matching core | Order book, fills, credit reservations, ledger postings | Network calls or long-running workflows |
| Agent gateway | Tool schemas, policy checks, model invocation, trace linkage | Direct database access or privileged state changes |
| Workers | Projection rebuilds, settlement jobs, evaluations | Synchronous match-path correctness |
| PostgreSQL | Immutable business facts and rebuildable read models | Provider-specific source-of-truth data |
| External adapters | Read-only enrichment and model reasoning | Market settlement or account activity |

## Final component model

The companion [FigJam architecture diagram](https://www.figma.com/board/UFJkv9UVaus0tYlvFvoyLI?utm_source=chatgpt&utm_content=edit_in_figjam&oai_id=v1%2FDWadJhYoX4OvQcMvMnv7POSeS3wFvBcpzYWdghJsI48OAsmzabAjFl&request_id=7f065468-3ce0-4a3c-b6bb-137475bd9189&architecture=true) is the visual source for this model. The components are intentionally logical deployment units, not premature microservices.

| Component | Initial runtime | Responsibility |
| --- | --- | --- |
| Web dashboard | Static Next.js export | Observes the simulator and submits human commands. V1 refreshes read models by polling; persistent sockets are deferred. |
| Agent SDK client | CLI or test harness | Starts a bounded agent run with a tenant/agent identity and correlation ID. |
| Edge API | API Gateway HTTP API + Lambda | Validates auth envelope, rate-limits at the edge where practical, forwards requests. |
| Command API | Lambda in AWS; Node process locally | Validates commands, invokes matching core, reads projections, exposes agent-safe market tools. |
| Matching core | In-process module owned by Command API | The only component that creates orders, fills, reservations, and ledger entries. |
| Agent gateway | Lambda in AWS; Node process locally | Exposes typed tools, enforces agent policy, invokes the model, records run metadata. |
| Projection worker | Lambda/SQS consumer; local worker | Builds dashboard read models from immutable domain events. |
| Evaluation worker | Step Functions task; local workflow | Replays fixtures and grades agent behavior without touching live state. |
| PostgreSQL | Local container; single-AZ RDS only for a temporary demo | Source of truth, ledger, outbox, audit records, and projections. |
| Object store | Local filesystem/MinIO; S3 in AWS | Versioned fixtures, replay reports, and exportable trace bundles. |
| Event transport | NATS JetStream locally; EventBridge + SQS in AWS | Delivers outbox events durably and enables replay. |

## Critical command path

This is the project’s most important engineering story: an AI agent cannot make balances incorrect.

1. A browser or agent submits a command with `idempotencyKey`, `correlationId`, actor identity, market ID, and payload.
2. The Edge API authenticates the caller and forwards it to the Command API.
3. For agent-originated commands, the Agent Gateway checks an `AgentPolicy` first: permitted tools, paper-credit allowance, order-size ceiling, market scope, run deadline, and approval requirement.
4. The Command API validates the command against the current market state and passes it to the matching core.
5. In a PostgreSQL `SERIALIZABLE` transaction, the matching core acquires a transaction-scoped advisory lock for that market. It locks affected accounts in stable order, checks available paper credits, creates the order/fills, writes balanced ledger entries, and inserts an outbox event.
6. The transaction commits once. A duplicate idempotency key returns the stored result rather than charging or filling twice.
7. An outbox relay publishes the committed event; projections, settlement, and evaluation consumers run asynchronously.

### Correctness invariants

- No accepted order can create a negative available balance.
- Every credit movement has equal debit and credit ledger entries.
- Market settlement is exactly-once from the business perspective, even if workers retry.
- A rejected command changes no ledger or order-book state.
- All externally visible state is traceable by `correlationId` and `causationId`.
- Read models may lag; ledger and order tables are authoritative.

## Data model: the minimum serious core

| Group | Tables / records |
| --- | --- |
| Market definition | `markets`, `outcomes`, `market_rules`, `market_resolutions` |
| Trading | `orders`, `fills`, `positions`, `idempotency_keys` |
| Accounting | `ledger_accounts`, `ledger_entries`, `credit_reservations` |
| Agent controls | `agent_policies`, `agent_runs`, `agent_tool_calls`, `approval_requests` |
| Eventing and audit | `outbox_events`, `event_deliveries`, `audit_log` |
| Dashboard | `market_snapshots`, `portfolio_snapshots`, `activity_feed` |
| Reproducibility | `fixture_versions`, `evidence_items`, `evaluation_runs`, `evaluation_results` |

Constraints belong in PostgreSQL as well as application code: foreign keys, check constraints, unique idempotency scopes, append-only ledger permissions, and market-resolution uniqueness.

## Local-first and AWS-first are the same architecture through ports

The domain depends on interfaces, not AWS SDK calls. This prevents the cheap local environment from becoming a toy and keeps deployment choices reversible.

| Port | Local adapter | AWS demo adapter |
| --- | --- | --- |
| `EventBus` | NATS JetStream | EventBridge + SQS |
| `WorkflowRunner` | Temporal development server | Step Functions Standard |
| `ObjectStore` | filesystem or MinIO | S3 |
| `Database` | Docker PostgreSQL | single-AZ RDS PostgreSQL |
| `MarketDataProvider` | owned fixture provider | owned fixture provider; later read-only Polymarket adapter |
| `ModelRunner` | deterministic fake for tests or configured OpenAI client | configured OpenAI client with spend limits |

Redis is a non-critical local development accelerator for cache/rate-limit experiments. It is **not** required by the AWS demo profile; do not add ElastiCache until measured load demonstrates a need.

## External integration posture

### NBA data

V1 markets are created and resolved from checked-in, versioned fixtures. That makes test scenarios deterministic and avoids depending on a live sports-data vendor. A future `SportsDataProvider` may ingest an approved official or licensed feed, but external data does not directly settle a market without a reviewed adapter and provenance record.

### Polymarket

V1.1 may add a read-only `MarketDataProvider` adapter that fetches public metadata, prices, and updates for comparison views. It cannot create an account, use a wallet, sign a message, retrieve trading credentials, or call order endpoints. Polymarket data is never the simulator’s settlement authority.

### Model provider

The Agent Gateway is the only model-provider caller. The model sees scoped tool outputs, not database credentials or unrestricted system access. Development and CI use deterministic fake responses; real runs use per-run token, tool-call, and dollar limits.

## Security and safety controls

- Treat all agent instructions, external evidence, and market descriptions as untrusted input.
- Use typed tool schemas with strict validation; no generic SQL, shell, browser, or arbitrary HTTP tool.
- Keep provider keys in local environment secrets or AWS Secrets Manager/SSM, never in source, fixtures, traces, or client bundles.
- Enforce least-privilege IAM with CDK; Lambda roles are per component rather than one project-wide admin role.
- Add tenant/actor scope to every query and audit row from day one, even with one demo user.
- Redact secrets and tool arguments designated sensitive before emitting traces.
- Require an explicit human approval record for any future capability expansion beyond paper trading.

## Observability and evaluation

Every request starts a trace and uses the same `correlationId` through commands, events, workers, and agent tool calls. Capture structured logs, metrics, and traces through OpenTelemetry.

The demo should show both system quality and agent quality:

- command acceptance/rejection, idempotency hits, transaction retries, projection lag, and outbox delivery lag;
- tool-call success rate, policy blocks, budget blocks, latency, and model spend;
- replay metrics: Brier score, log loss, paper PnL, max drawdown, and rule-adherence rate;
- a trace view that explains why an agent order was accepted or blocked.

## AWS profile and cost guardrails

AWS is a hosted-demo and release-verification profile, not a 24/7 default environment.

- Static dashboard: S3 + CloudFront.
- APIs/workers: Lambda without provisioned concurrency.
- Routing: API Gateway HTTP API.
- Database: local PostgreSQL until a short public demo needs single-AZ RDS; teardown afterwards.
- Events: EventBridge + SQS only where a real asynchronous consumer is being demonstrated.
- Workflows: Step Functions only for evaluation/replay/settlement orchestration, never matching.
- Forbidden in V1: NAT Gateway, EKS, MSK, Multi-AZ RDS, an always-on container fleet, provisioned concurrency, and always-on ElastiCache.
- CDK tags every resource with `project=agent-market-sandbox`, `environment`, and `owner`.
- AWS Budgets alerts: $5, $10, $20; $30 is the hard action threshold. The target is $0–10/month, but no dollar amount is guaranteed because region, account credits, and uptime determine actual charges.
- Model API expense is a separate budget: enforce a low daily cap, hard per-run cap, and deterministic test mode before enabling real model calls.

## Monorepo shape when implementation begins

```text
apps/
  web/                 # Next.js dashboard, static export
  api/                 # HTTP edge and command application
  worker/              # projections, settlement, replay workers
packages/
  domain/              # entities, command handlers, matching core, invariants
  contracts/           # API, event, and tool schemas
  agent-tools/         # narrow agent tools and policies
  adapters/            # Postgres, NATS, AWS, fixture, OpenAI adapters
  observability/       # correlation, tracing, logging
infra/
  cdk/                 # explicit AWS demo profile and cost controls
fixtures/
  nba/                 # versioned NBA scenarios and resolutions
tests/
  integration/         # database/event transport behavior
  e2e/                 # human and agent simulator flows
  evaluations/         # deterministic agent replay cases
docs/
```

## Scope sequence

1. Prove the deterministic core locally: fixture market, order placement, matching, double-entry ledger, settlement, and read model.
2. Add outbox/event replay and failure/retry tests.
3. Add the restricted agent gateway, fake-model evaluation suite, then capped real-model runs.
4. Add dashboard traceability and the blocked-action demonstration.
5. Ship a short-lived AWS demo profile through CDK only after local parity is green.
6. Add the read-only Polymarket adapter only after V1 can replay without it.

## Explicit non-goals for V1

- Real-money or exchange trading.
- Wallets, deposits, withdrawals, KYC, or user funds.
- Autonomous multi-agent systems.
- A live NBA data feed as a correctness dependency.
- Microservice deployment for its own sake.
- WebSocket infrastructure before polling proves insufficient.
