# Architecture Decision Log

This is a decision log, not the final architecture. A final system diagram is intentionally deferred until the decisions marked **Needs approval** are resolved.

| ID | Decision | Status | Rationale |
| --- | --- | --- | --- |
| ADR-001 | Paper credits only; no live orders, wallets, deposits, or withdrawals. | Confirmed | Keeps the work educational, safely demoable, and centered on software systems. |
| ADR-002 | Build one narrow end-to-end market loop before supporting multiple sports or market types. | Confirmed | Depth is more credible than breadth; it enables meaningful tests and replay. |
| ADR-003 | Treat the agent as an untrusted requester; deterministic services enforce budgets, permissions, matching, and settlement. | Confirmed | An LLM must not own financial-like state transitions. |
| ADR-004 | Use a versioned fixture/replay dataset as the V1 data source. | Confirmed | Reproducible demos and tests; external vendor access becomes an adapter, not a requirement. |
| ADR-005 | Use a single TypeScript product/backend codebase first; introduce Go only if the matching engine demonstrates a real performance or concurrency need. | Confirmed | Limits moving parts while preserving a serious architecture path. |
| ADR-006 | Use PostgreSQL as the source of truth; model money-like paper credits as an append-only double-entry ledger. | Confirmed | Makes balance correctness, auditability, and replay explainable. |
| ADR-007 | Publish domain events through an outbox and consume them with NATS JetStream. | Confirmed | Gives a clear durable-event and replay story while avoiding premature microservices. |
| ADR-008 | Use the OpenAI Agents SDK for one research agent and explicit tool schemas; no multi-agent framework in V1. | Confirmed | Strong current tooling with a small, explainable surface area. |
| ADR-009 | Use Temporal only for long-running research, evaluation, scheduled replay, and approval workflows—not for the synchronous match path. | Confirmed | Durable workflows where they add value; low-latency trading simulation stays deterministic. |
| ADR-010 | First market family: NBA game-winner markets. | Confirmed | The 2026–27 regular season begins October 20; this gives the initial demo a timely, focused narrative. |
| ADR-011 | V1 uses owned NBA fixtures; V1.1 adds one read-only Polymarket market-data adapter; Kalshi is deferred. | Confirmed | The simulator remains reproducible and paper-only. Polymarket enriches the demo without becoming a dependency for correctness or allowing exchange activity. |
| ADR-012 | AWS-first, local-first deployment. Target $0–10 USD/month; hard ceiling $30 USD/month. | Confirmed | Local Docker development is the default. AWS demonstrates production deployment and operational thinking only when a hosted demo is needed. |

## Architecture principles to preserve

1. No actor may change a balance without a validated command, ledger entries, and an audit trail.
2. Every state-changing command has an idempotency key and a causal/correlation ID.
3. Domain events are immutable facts; dashboard views are rebuildable projections.
4. Agent outputs are suggestions or requests, never authoritative state transitions.
5. The project must be reproducible offline with seed data.
6. A demo must show both the happy path and a rejected/blocked unsafe action.

## Cost-control rules

1. **Target, not cap:** aim for $0–10 USD/month. $30 is a hard alarm ceiling, not normal monthly spend.
2. **Local by default:** Docker Compose and Testcontainers run the full development/test environment without cloud services.
3. **Deploy deliberately:** provision AWS only for a public-demo window or a release verification; tear down nonessential resources afterwards.
4. **No expensive always-on primitives in V1:** no NAT Gateway, EKS, MSK, provisioned concurrency, Multi-AZ RDS, or permanently running container fleet.
5. **Budget gates:** create forecast and actual-spend alerts at $5, $10, and $20; set an action threshold at $30.
6. **Infrastructure as code:** AWS CDK must own every cloud resource so the environment can be reproduced and removed predictably.
7. **Cost visibility:** tag every resource with `project=agent-market-sandbox`, `environment`, and `owner`; review the AWS cost dashboard before each new managed service.

## External-provider recommendation before architecture

**Recommended provider posture:** build a `MarketDataProvider` adapter and initially implement a **read-only Polymarket adapter** after the owned-fixture simulator passes its replay tests. It may retrieve public market metadata, prices, and updates; it must not create accounts, derive API credentials, sign messages, manage wallets, or call exchange order endpoints.

Why Polymarket first: it is directly agent-oriented, maintains public agent integration material, and its help center states that market data remains viewable globally even where trading is unavailable. Kalshi remains a useful future adapter comparison, but it is not needed to prove the project and should not drive the first architecture.

## Diagram readiness gate

ADR-010 through ADR-012 are approved. The next planning step is to create the final Figma/Canva-style system diagram, covering trust boundaries, command flow, event flow, data stores, background workflows, external adapters, human approval points, and the local-versus-AWS deployment profiles.
