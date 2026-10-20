# Shinrai AI

**An auditable, agent-native NBA prediction-market sandbox.**

Shinrai AI is a paper-only system where AI agents can research and request market actions, while deterministic services enforce policy, matching, paper-credit accounting, settlement, and a complete audit trail.

The repository currently contains the V1 product, research, architecture, and implementation foundation. Application code begins with Phase 0 of the documented implementation plan.

## Documentation

- [Project documentation index](docs/README.md)
- [Final V1 architecture](docs/architecture/2026-10-19-final-architecture.md)
- [Implementation plan](docs/plans/2026-10-19-mvp-implementation-plan.md)
- [Printable architecture checkpoint](docs/architecture/2026-10-19-nba-agent-market-sandbox-architecture-print.pdf)

## V1 boundaries

- NBA game-winner markets using versioned fixtures
- Paper credits only
- Deterministic ledger, matching, policy, and settlement controls
- Read-only market-data comparison planned after the core simulator is proven
- No real-money trading, wallets, deposits, withdrawals, or exchange-order execution
