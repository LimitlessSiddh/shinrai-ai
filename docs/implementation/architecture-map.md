# Architecture-to-code map

How the [final architecture](../architecture/2026-10-19-final-architecture.md) maps to code.

## Components

| Architecture component | Code | Notes |
| --- | --- | --- |
| Web dashboard | `apps/web` | Static export; polls the API every 2–3s; no business rules in the client |
| Agent SDK client | `scripts/demo.ts`, `scripts/client.ts` | CLI that starts bounded runs over HTTP |
| Edge/Command API | `apps/api/src/{app,http,routes-*}.ts` | Bearer principal → scopes; correlation id on every response; `lambda.ts` for AWS |
| Matching core | `packages/domain/src/{matching,decide,executor}.ts` | Pure; the only code that creates orders, fills, reservations and postings |
| Agent gateway | `packages/agent-tools/src/gateway.ts` (+ `apps/api/src/agents.ts`) | Five tools, policy, recording; approved orders reuse the human command path |
| Projection worker | `packages/adapters/src/{worker,postgres/projector}.ts`, `apps/worker` | JetStream locally, SQS on AWS |
| Evaluation worker | `packages/agent-tools/src/replay.ts`, `packages/adapters/src/replay.ts` | Runs as an explicit command (no Temporal in V1, see IMP-013) |
| PostgreSQL | `packages/adapters/src/postgres/migrations/001_core.sql` | Every table named in the architecture's data model |
| Event transport | `packages/adapters/src/nats/bus.ts`, `eventbridge.ts` | Same `EventBus` port |
| Object store | `var/reports` locally, S3 artifacts bucket on AWS | |

## Ports

| Port (`packages/domain/src/ports.ts`, `packages/agent-tools/src/ports.ts`) | Local adapter | AWS adapter |
| --- | --- | --- |
| `Exchange` / `CommandStore` | `PostgresExchange` / `PgCommandStore` (+ `InMemoryExchange` reference) | same, on RDS |
| `EventBus` | `JetStreamBus` | `EventBridgeBus` |
| `RunRecorder`, `EvidenceSource` | `PgRunRecorder`, `PgEvidence` (+ in-memory) | same |
| `ModelRunner` | `FakeModelRunner` | `OpenAIAgentsRunner` (opt-in, capped) |
| `Clock`, `IdSource` | system / uuid; stepping / counter for replay | same |

## The critical command path

All commands go through `packages/domain/src/executor.ts#executeCommand`, whether they come from humans, agents, replays or seeds.

1. **Lock**, in `PgCommandStore.prepare`:
   - `pg_try_advisory_xact_lock` on the market, retrying while busy (IMP-017)
   - then `SELECT … FOR UPDATE` on every account the command can touch, sorted by account id
2. **Idempotency.** Look up the scope `tenant|actor|type|key`.
   - Same request: return the stored result with `replayed: true`.
   - Different request under the same key: `IDEMPOTENCY_CONFLICT`.
3. **Decide.** Pure `decide*` functions return either a `Decision` or a typed `Rejection`.
4. **Commit, atomically.** One transaction writes:
   - the facts: orders, reservations, fills, positions, market
   - balanced ledger transactions
   - exactly one outbox event
   - an audit row with the policy result
   - the idempotency record
5. **Database guarantees:**
   - Triggers maintain balances.
   - A deferred trigger rejects any unbalanced transaction at commit.
   - Append-only triggers protect the ledger, outbox, audit and resolutions.
   - CHECK constraints forbid negative balances.
6. **Retry.** The transaction runs at `SERIALIZABLE`. Error codes 40001, 40P01 and 23505 retry with jittered backoff (8 attempts).

A rejected command writes only the audit row, the idempotency record and a `command.rejected` event. It never writes orders, reservations, fills or ledger rows.

## Correlation

One correlation id flows through:

- the agent run
- its tool calls (`agent_tool_calls`, `agent.tool.called` events)
- the command (`audit_log`)
- the ledger transactions
- the outbox event
- its deliveries and projections (`event_deliveries`, `activity_feed`)
- any evaluation (`evaluation_runs.correlation_id`)

`GET /trace/:correlationId` joins all of them; the Dossier renders the result. HTTP requests run inside `withCorrelation`, so pino logs and OpenTelemetry spans carry the same id.
