# Product Brief: Agent-native Prediction Market Sandbox

## Problem

Most prediction-market interfaces assume the participant is a human clicking a website. An AI agent needs different primitives: a machine identity, a restricted budget, explicit permissions, structured market data, durable work, reviewable actions, and a record that explains what happened after a task fails or a market resolves.

This project is not an agent that claims to predict sports better than people. It is the software platform that lets developers safely run and evaluate paper-trading agents.

## Product statement

Build a paper-only prediction-market sandbox where an agent can research a sports question, cite its evidence, submit a simulated order through a constrained API, receive market events, and later be replayed and evaluated against the actual outcome.

## Primary user

A developer building or evaluating an AI agent for a sports prediction-market workflow.

The user wants to answer questions such as:

- What did this agent know when it placed an order?
- Which tools and sources did it use?
- Did it follow its budget and permission policy?
- What would have happened if the same strategy ran against historical events?
- Was the agent calibrated, or merely confident?

## MVP: one narrow, complete loop

The first complete version should support **NBA game-winner markets, one binary market type, paper credits only, and one research-to-order workflow**.

1. An administrator creates a simulated market from a normalized event feed or a recorded fixture.
2. An agent receives a scoped account with a fake balance and fixed risk limits.
3. The agent queries approved read-only tools for market and evidence data.
4. The agent requests a limit order.
5. Deterministic risk rules accept or reject it; the matching engine handles accepted orders.
6. The platform writes an immutable ledger entry and publishes an event.
7. A dashboard shows the order, evidence, policy decision, portfolio impact, and trace.
8. A resolved event settles the market and calculates evaluation metrics.

## Non-goals

- Live trading, real-money balances, custody, wallet signing, or exchange execution.
- Gambling recommendations or a consumer betting product.
- Every sport, every market type, multi-leg products, parlays, or a production-grade exchange.
- Autonomous source scraping without a reviewed data-provider agreement.
- A generic chatbot that merely talks about markets.

## Why this is a strong SWE project

The project makes the difficult systems work visible: transaction safety, idempotency, event replay, access control, websockets, testable risk rules, observability, and agent evaluation. The AI component is deliberately bounded by deterministic policy and a paper-only environment.

## MVP success criteria

- Two paper agents can submit valid competing limit orders concurrently without double-spending a balance or corrupting an order book.
- Every state-changing action has an actor, request ID, policy decision, timestamp, and ledger record.
- A failed worker can safely retry without creating a duplicate order or duplicate settlement.
- A developer can replay one recorded market and reproduce the resulting ledger and portfolio values.
- An evaluation report can distinguish market outcome, economic return, calibration, and policy violations.

## Confirmed initial scope

The initial event family is **NBA game-winner markets**. The 2026–27 regular season opens October 20, 2026, which gives the project a timely, understandable demo story.

The simulator will begin with deterministic NBA fixtures stored in our own seed dataset. A read-only public prediction-market adapter may enrich the demo after the full simulator works; it must never be required for correctness, tests, or replay.
