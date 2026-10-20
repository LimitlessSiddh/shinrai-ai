# Test strategy and failure drills

| Layer | Where | What it proves |
| --- | --- | --- |
| Unit (no I/O) | `tests/unit` | Price-time priority, partial fills, maker-price execution with refunds, balanced postings, escrow = 100 × matched pairs, idempotent replay/conflict, exactly-once settlement, event metadata, policy rules, metric math |
| Integration (Testcontainers) | `tests/integration` | See the list below |
| Evaluations (no I/O) | `tests/evaluations` | Every unsafe scenario is blocked with zero mutation; malformed input never reaches the domain; only five tools exist; golden replay report snapshot |
| E2E (Playwright) | `tests/e2e` | Empty state → seed; rejected order with zero mutation; blocked agent with a visible reason; full lifecycle with exact balances; replay reproduced; axe WCAG 2.1 A/AA, keyboard, focus ring, reduced motion, colour-independent status, no horizontal scroll at 375px; screenshots |
| Infra | `infra/cdk/test` | Forbidden primitives absent, tags, budgets, per-function roles, DLQ, private bucket, RDS single-AZ |

What the integration suites cover:

- 20 parallel orders against one account never overspend.
- Two competing agents' fills equal the in-memory reference engine replayed in commit order.
- The outbox commits exactly one event; a rollback commits none.
- Serialization failures retry and return the original result.
- Two racers sharing one idempotency key produce one order.
- Five concurrent resolutions settle once.
- Append-only and balance triggers hold.
- JetStream relay and dedupe work.
- Duplicate delivery is a no-op.
- A failed projection is retried; a poison event goes to the dead-letter queue.
- Rebuilt projections are identical.
- A PostgreSQL replay equals the in-memory replay exactly.
- The HTTP API enforces auth, scopes and typed errors.

## Determinism controls

Nothing relies on bare retries to pass.

- Replays and evaluations inject a `steppingClock` and `counterIds`.
- Backoff is injectable (`backoffMs`).
- Fault injection uses explicit hooks: `beforeCommit`, `failWhen`.
- Each integration file gets its own database, and its own NATS namespace for streams and consumers.
- E2E runs on its own ports and database, serially, in one worker.

Two nondeterminism issues were found and fixed at the root:

- A blocking advisory lock fixed the SERIALIZABLE snapshot before the wait (IMP-017).
- `jsonb` key reordering broke a byte comparison. Comparisons now use canonical JSON.

## Failure drills (`pnpm drill`)

These run against the local stack in an isolated `shinrai_drills` database and a fresh NATS namespace. They print a PASS/FAIL table and exit non-zero on any failure.

1. **Duplicate request.** The stored result is returned; there is one order.
2. **Insufficient credits.** Typed rejection; order, reservation and ledger counts are unchanged.
3. **Policy-blocked agent action.** `ORDER_SIZE_EXCEEDED` and `BUDGET_EXCEEDED`; no facts written.
4. **Worker failure and retry.** The first delivery fails and is NAKed; the redelivery applies once.
5. **Duplicate event delivery.** Recognised as a duplicate; projections unchanged.
6. **Projection rebuild.** Truncate, then refold from the outbox; the result is identical.
