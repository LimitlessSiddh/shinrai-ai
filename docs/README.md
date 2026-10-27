# Project Documentation

This folder holds the product, research, architecture and plan documents that V1 was built from, plus the implementation notes under [`implementation/`](implementation/).

## Read in this order

1. [Product brief](product/00-product-brief.md) — what we are building, for whom, and the boundaries.
2. [Research and feasibility](research/2026-10-19-feasibility-research.md) — current platform, data, and engineering findings.
3. [Decision log](architecture/decision-log.md) — the decisions that led to the selected design.
4. [Final architecture](architecture/2026-10-19-final-architecture.md) — system boundaries, data integrity model, runtime profiles, and cost controls.
5. [Implementation plan](plans/2026-10-19-mvp-implementation-plan.md) — the test-first build order.
6. [Printable architecture checkpoint](architecture/2026-10-19-nba-agent-market-sandbox-architecture-print.pdf) — notebook-ready diagram and summary.
7. [Discovery and MVP plan](plans/2026-10-19-discovery-and-mvp-plan.md) — the original staged discovery record.
8. [Stealth Signal UI system](design/2026-10-20-stealth-signal-ui-system.md) — the dashboard's design rules.
9. [Implementation notes](implementation/) — decisions, progress, architecture map, testing, safety and cost, demo walkthrough.
10. [Frontend reset handoff](design/2026-10-26-frontend-implementation-handoff.md) — approved light research-workspace direction, prototype, and implementation map.

## Current checkpoint

**Working title:** Agent-native Prediction Market Sandbox

**One-line pitch:** A safe, paper-only prediction-market platform where AI agents have scoped identities, budgets, tool permissions, live-or-replayed data, and fully auditable decisions.

**Hard boundary:** No real-money wagering, custody, wallet management, exchange order placement, gambling advice, or production trading integration.

**Status:** V1 is implemented and runs locally; see [implementation progress](implementation/progress.md) and the root [README](../README.md). The AWS profile is synth-only and has not been deployed.
