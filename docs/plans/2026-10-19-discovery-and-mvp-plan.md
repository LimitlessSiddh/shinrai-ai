# Prediction Market Sandbox Discovery and MVP Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the approved project brief into a small, reproducible, paper-only agent market simulator with a final architecture diagram before implementation begins.

**Architecture:** The final design will use a deterministic market core and ledger as the source of truth. The agent will access typed, read-only research tools and request constrained actions; an event pipeline, durable workflows, and projections will be added only where the approved MVP needs them.

**Tech Stack:** TypeScript, React/Next.js, Fastify, PostgreSQL, Redis, NATS JetStream, OpenAI Agents SDK, Temporal, OpenTelemetry, Docker Compose, Vitest, Playwright, Testcontainers.

---

## Stage 0: Confirm the bounded product

**Outcome:** one market type, one fixture set, one demo story, and no ambiguity about the paper-only boundary.

1. The initial demo is confirmed as **NBA game-winner markets**.
2. Choose a starting balance, e.g. 10,000 paper credits, and a fixed per-order/per-day risk policy.
3. Define one happy-path demo: agent researches, requests a paper order, obtains a fill, then displays its audit record.
4. Define one failure-path demo: agent exceeds a budget or tries an unavailable tool; the platform blocks it and records why.
5. ADR-010 and ADR-011 are approved: NBA game-winner markets, owned fixtures in V1, then a read-only Polymarket adapter in V1.1. Kalshi is deferred.
6. ADR-012 is approved: AWS-first, local-first; target $0–10 USD/month and hard ceiling $30 USD/month.

## Stage 1: Write executable product contracts

**Outcome:** the system is specified before implementation, not reverse-engineered from UI screens.

1. Define domain vocabulary: market, outcome, order, fill, position, settlement, ledger account, agent identity, policy, evidence, run, and replay.
2. Write command contracts: `CreateMarket`, `CreateAgentAccount`, `SubmitOrder`, `CancelOrder`, `ResolveMarket`, and `RunReplay`.
3. Write event contracts: `MarketCreated`, `OrderAccepted`, `OrderRejected`, `OrderMatched`, `LedgerPosted`, `MarketResolved`, and `AgentRunCompleted`.
4. State invariants: no negative available balance, no fill beyond an order's remaining quantity, resolved markets reject new orders, and every fill has balancing ledger entries.
5. Define exact evaluation metrics and their formulas before the agent exists.

## Stage 2: Final architecture checkpoint — intentionally not started yet

**Outcome:** a reviewable architecture diagram and a final build plan.

Do not start this stage until Siddh approves the open decisions.

1. Record the approved local and AWS deployment profiles, including the $0–10 USD/month target, $30 hard ceiling, resource tags, budget alarms, and teardown path.
2. Produce a Figma/Canva-style UML/system diagram covering trust boundaries, synchronous commands, asynchronous events, data ownership, failure handling, and human approval.
3. Walk through the happy path, rejected order path, worker crash/retry path, and replay path using the diagram.
4. Freeze the V1 architecture; record deferred ideas separately.
5. Replace this discovery plan with a file-by-file TDD implementation plan containing exact paths, tests, commands, and checkpoint commits.

## Stage 3: Build order after the architecture is approved

1. Create the empty TypeScript workspace, Docker Compose local dependencies, formatting, linting, and CI.
2. Build the domain model and unit tests for money-like decimal values, order validation, and ledger invariants.
3. Build the transactional command path and matching engine with integration tests for concurrency and idempotency.
4. Add projections, websocket updates, and a minimal dashboard.
5. Add the fixture ingestion and replay pipeline.
6. Add the constrained agent tools, approval behavior, traces, and evaluation reports.
7. Add failure injection, load checks, security review, demo data, and deployment documentation.

## Definition of ready to implement

- ADR-010 through ADR-012 are approved or explicitly deferred.
- The final diagram exists and explains data and trust boundaries.
- The first fixture format and source are committed to a documented choice.
- The MVP has one measurable demo and one blocked-action demo.
- A detailed TDD implementation plan names actual folders, files, tests, and commands.
