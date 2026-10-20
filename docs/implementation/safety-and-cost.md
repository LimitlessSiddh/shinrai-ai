# Safety boundary, threat model and cost posture

## Hard boundaries (enforced in code, not just documented)

- **Paper only.** There is no wallet, payment, deposit, withdrawal, KYC, signing or exchange endpoint anywhere. Credits are integer credit-cents in a closed double-entry ledger whose only source is `system:issuance`.
- **Agents are untrusted requesters.**
  - They reach the system only through `AgentRun.invoke`, which has five tools with strict Zod input and output schemas.
  - Unknown tools are blocked and recorded: SQL, shell, HTTP, settlement and anything else.
  - Agents never receive a database, ledger, settlement or provider-secret handle.
  - ESLint forbids `packages/agent-tools` from importing I/O modules or adapters.
- **Defense in depth on agent writes:**
  - Agent principals are clamped to read-only scopes, whatever the token config says.
  - `POST /orders` refuses agent principals.
  - The domain refuses `OpenMarket`, `GrantCredits` and `ResolveMarket` from any agent actor.
  - Agent orders reuse the human command path, with policy evaluated first.
- **Policy** is deterministic and checked on every request. It covers:
  - tool allowlist
  - market scope (reads too)
  - run budget, including committed spend
  - order-size cap
  - run deadline
  - an approval threshold, which creates a human approval record
  - evidence citation: an order may only cite evidence retrieved in that run
- **Model calls** are opt-in only, through `SHINRAI_MODEL=openai` plus a key. The SDK is lazily imported in `adapters` and capped per run (turns and tool calls) and per day. On AWS, only the agent-gateway role can read the key parameter.

## Threat model (V1)

| Threat | Mitigation | Test |
| --- | --- | --- |
| Agent overspends or double-spends | Advisory market lock + sorted account locks + SERIALIZABLE + `balance >= 0` CHECK | `postgres-concurrency.test.ts` |
| Retried request charges twice | Idempotency scope with request fingerprint; stored result replay | `idempotency.test.ts`, `outbox-retry.test.ts`, drill 1 |
| Worker retry settles twice | One `market_resolutions` row per market; same-outcome re-resolve returns the original event | `settlement-constraints.test.ts` |
| Ledger tampering | Append-only and TRUNCATE triggers; trigger-maintained balances; deferred balanced-transaction check | `settlement-constraints.test.ts` |
| Prompt-injected tool calls (SQL/shell/HTTP) | Closed tool enum; allowlist; schema parsing before any handler | `tool-contracts.test.ts`, `policy-blocks.test.ts` |
| Malformed or injection-shaped input | Strict schemas at HTTP, tool and command boundaries; parameterized SQL only | `api.test.ts`, `tool-contracts.test.ts` |
| Event redelivery corrupts views | `event_deliveries` dedupe in the projection transaction; JetStream `msgID` dedupe | `events-projections.test.ts`, drills 4–5 |
| Secret leakage | No secrets in repo, fixtures or client bundle; pino redaction paths; dev tokens refused in the aws profile | config + logger |
| Misconfigured hosted deploy | aws profile refuses dev tokens, so every scoped route is closed until an identity provider exists (IMP-021) | `config.ts` |

The browser's `dev-operator-local-only` token is a local identity, not a secret. It works only in the local profile.

## AWS cost posture

**The target is $0–10 a month, and only while hosted.** $30 is an alarm ceiling, not a budget to spend. **Nothing has been deployed.**

Resources and their cost:

- **Pay-per-use while idle-cheap:**
  - S3 + CloudFront (price class 100)
  - HTTP API
  - 4 arm64 Lambdas, with no provisioned or reserved concurrency
  - EventBridge + SQS
  - one-week log retention
- **Scheduled relay:** runs once a minute only while the stack exists. That is about 43k invocations a month, inside the free tier.
- **Optional RDS** (`-c enableRds=true`): a single-AZ `db.t4g.micro`, plus Secrets Manager and EventBridge interface endpoints in one AZ instead of a NAT. These accrue hourly charges while they exist, so use them for a demo window only and tear down afterwards.
- **Forbidden, and asserted absent by tests:** NAT Gateway, EKS, MSK, ElastiCache, ECS services, EC2 instances, Multi-AZ RDS, provisioned concurrency.
- **Budget:** a $30 monthly budget filtered on the `project=agent-market-sandbox` cost tag, with alerts at $5 and $10 (actual), $20 (forecast) and $30 (actual) to SNS (and optionally email). Activate the cost-allocation tag in Billing before relying on the filter.
- **Teardown:** everything uses `RemovalPolicy.DESTROY` with auto-deleted buckets, so `cdk destroy` removes it all.

## Deliberately out of scope

- Real-money or exchange trading, wallets, custody
- Hosted identity provider
- WebSockets
- Temporal
- Redis/MinIO
- Multi-agent orchestration
- Sell-to-close
- Live NBA feeds
- The read-only Polymarket adapter (deferred, IMP-016)
