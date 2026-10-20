# Feasibility Research — 2026-10-19

## Bottom line

The project is feasible and current, provided it starts as a closed, paper-only simulator with owned fixtures. It should demonstrate market-system and agent-platform engineering without depending on live exchange access, money movement, or unstable third-party SDK behavior.

## External market and sports data

### Recommendation for V1: owned fixtures and replay files

Ship the core engine with versioned, synthetic or manually curated **NBA game-winner** fixtures. The NBA's 2026–27 regular season begins October 20, 2026, so this gives the demo a timely launch narrative while keeping tests deterministic, permitting meaningful replay, preventing rate-limit/data-license surprises, and letting the resume project run without API credentials.

### Read-only adapter, after the simulator works

Polymarket currently exposes agent-oriented materials and TypeScript SDKs, including read-only market access and websocket topics. Its client ecosystem changed during 2026: the older `clob-client` repository was archived, a v2 client was subsequently marked deprecated in favor of a unified SDK. That volatility is a reason to isolate any external provider behind an adapter rather than binding core logic to a vendor SDK. The recommended first external integration is therefore a **read-only Polymarket market-data adapter**: public metadata, price snapshots, and updates only. It must not use trading credentials, wallets, signing, order endpoints, or account actions.

Polymarket's current help documentation says that users in restricted Canadian regions, including Quebec, can view market data but cannot deposit or trade. That supports a data-only demo but does not permit real exchange activity. Kalshi should remain a later comparison adapter, not an MVP dependency.

Sportradar documents pre-match and live odds/probability products, but it is a commercial data provider. We may evaluate it later for a data-adapter case study; it is not a dependency for the first portfolio demo.

## Regulatory and product boundary

Ontario regulates internet gaming and sports/event betting. The AGCO describes approval and certification expectations for systems accepting, processing, determining, displaying, or logging player wagers. The project must therefore remain a local or hosted engineering simulator with paper credits, no deposits, withdrawals, wallet signing, exchange execution, or invitation to wager. It should include an unmissable educational/demo disclaimer.

This is a product-scope safeguard, not legal advice or a claim that a paper simulator is legally risk-free. Any future live, paid, or public wagering-related product would require a fresh professional compliance review.

## Architecture patterns worth demonstrating

### Ledger first, projections second

The source of truth should be append-only domain events and a double-entry paper-credit ledger. Read models such as portfolio balance, order book depth, and dashboard summaries are rebuildable projections. This makes audit and replay natural.

### Deterministic core, bounded agent

The matching engine, balance changes, risk checks, and settlement logic must be ordinary tested code. An LLM can research, summarize, and request an action; it cannot calculate balances or bypass policy. This gives the project a credible safety story.

### At-least-once events plus idempotent commands

JetStream persists events and supports replay; its consumers are at-least-once, so handlers must tolerate duplicate delivery. Every state-changing HTTP or tool call needs an idempotency key. This is a useful systems-design discussion point in interviews.

### Transaction boundaries

For the early single-service matching engine, PostgreSQL transactions should atomically write the order, ledger entries, and outbox record. If we use `SERIALIZABLE` isolation for a critical balance reservation, we must implement retry handling for serialization failures. We should not claim distributed exactly-once behavior.

## Recommended tool choices, with purpose

| Area | Recommended choice | Why |
| --- | --- | --- |
| Product/UI and API | TypeScript, React, Next.js, Fastify | Fits Siddh's experience; typed end-to-end system with a polished dashboard. |
| Core persistence | PostgreSQL | Transactions, constraints, strong relational ledger model, and local development simplicity. |
| Cache/ephemeral controls | Redis | Rate limits, short-lived locks, websocket fan-out helpers; not a system of record. |
| Event persistence/replay | NATS JetStream | Durable streams and consumer replay without introducing Kafka-scale operational overhead. |
| Agent harness | OpenAI Agents SDK for TypeScript | Tool calls, guardrails, tracing, and a current official TypeScript option. |
| Long-running research/evaluation jobs | Temporal | Durable workflows, retries, timeouts, and human approval waits. |
| Observability | OpenTelemetry | Portable traces, metrics, and logs across API, workers, and agent calls. |
| Testing | Vitest, Playwright, Testcontainers | Unit, integration, API, and browser-level confidence. |
| Local/dev packaging | Docker Compose, pnpm workspace | Reproducible developer setup before any cloud complexity. |

## Explicitly deferred tools

- **Kafka:** recognizable but operationally disproportionate for V1; revisit only if throughput or multi-team boundaries prove it necessary.
- **Kubernetes:** no value for a portfolio MVP before a containerized, observable single deployment works.
- **Graph database/vector database:** not part of the market simulator's critical path. Add only if evidence retrieval becomes a demonstrated requirement.
- **Multiple agent frameworks:** choose one SDK. More frameworks makes the system harder to explain, not more advanced.

## Approved AWS cost posture

The project is AWS-first in its production reference architecture but local-first in daily development. The normal target is **$0–10 USD/month** and the hard ceiling is **$30 USD/month**. This is achieved by running the full stack locally, provisioning cloud resources only when a hosted demo is needed, and deleting nonessential resources afterwards.

For a low-traffic demo, favor static hosting and pay-per-use compute/workflow services. Avoid NAT Gateway, continuously running containers, managed Kafka, Kubernetes, Multi-AZ database deployments, and provisioned concurrency in V1. AWS documents that Lambda includes a 1M-request/400,000-GB-second monthly free tier and Step Functions Standard includes 4,000 free state transitions monthly; AWS also documents that NAT Gateway charges accrue while the gateway exists, plus data processing charges. Cost alerts must be created before any application resources.

## Sources consulted

- [OpenAI: Building agents](https://developers.openai.com/tracks/building-agents) — agent loops, guardrails, tools, sessions, and tracing.
- [OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-js/guides/tracing/) — agent/tool/guardrail trace spans.
- [NATS JetStream concepts](https://docs.nats.io/concepts/jetstream) and [consumer behavior](https://docs.nats.io/nats-concepts/jetstream/consumers) — durable event storage, replay, acknowledgements, and at-least-once delivery.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/18/sql-set-transaction.html) — serializable semantics and retry requirement.
- [Polymarket agent skills](https://github.com/Polymarket/agent-skills), [unified TypeScript SDK](https://github.com/Polymarket/ts-sdk), and [archived CLOB client](https://github.com/Polymarket/clob-client) — external integration shape and SDK churn.
- [Polymarket geographic restrictions](https://help.polymarket.com/en/articles/13364163-geographic-restrictions) — market-data visibility versus unavailable trading in Quebec.
- [NBA 2026–27 schedule](https://www.nba.com/news/2026-27-nba-regular-season-schedule) — official October 20 regular-season opening date.
- [Sportradar Odds API overview](https://developer.sportradar.com/odds/reference/intro) — example commercial odds/probability data categories.
- [AGCO technology certification guidance](https://www.agco.ca/en/book/export/html/245876) and [Ontario iGaming operator registration](https://www.agco.ca/fr/loteries-et-jeux/demander-linscription-dun-exploitant-de-jeux-sur-internet) — regulatory context for anything that processes actual wagers.
