# V1 implementation progress

Source: [`docs/plans/2026-10-20-full-v1-implementation-goal-prompt.md`](../plans/2026-10-20-full-v1-implementation-goal-prompt.md). Branch: `v1-implementation` (local, not pushed).

Legend: `[x]` verified by a command run locally · `[ ]` not done yet.

## Phase A — Foundation

- [x] pnpm workspace, strict TypeScript, ESLint (domain purity rule), Prettier, Vitest projects
- [x] Docker Compose: PostgreSQL 17 + NATS JetStream; optional `otel` profile (Jaeger)
- [x] `.env.example`, `.gitignore`, `SECURITY.md`, issue/PR templates, Dependabot
- [x] `ci.yml` (quality, integration, e2e, infra, workflow lint) and non-deploying `release-validation.yml`; actionlint clean
- [ ] README quickstart verified from a fresh clone

## Phase B — Deterministic domain core

- [x] Contracts: commands, events, records, results, agent tools/policy (Zod)
- [x] Matching (price-time, partial fills, maker-price execution), reservations, double-entry ledger
- [x] Idempotency (replay, conflict, per-actor scope), exactly-once settlement, cancellation
- [x] Agent policy and evaluation metrics (pure)
- [x] Unit suite: `pnpm test:unit`

## Phase C — PostgreSQL and outbox

- [x] Migrations with DB constraints and append-only triggers (ledger balance maintained by trigger; deferred balanced-transaction check)
- [x] Serializable command transaction, advisory market lock (try-lock, IMP-017), ordered account locks, retries
- [x] Concurrency, outbox, retry, settlement and no-mutation integration tests: `pnpm test:integration` (stable over 3 consecutive runs)

## Phase D — Events, projections, replay

- [x] NATS JetStream outbox relay (msgID dedupe), idempotent projector (`event_deliveries`), NAK backoff retry, dead letter table + DLQ stream
- [x] Projection rebuild from the outbox (`rebuildProjections`), verified equal after truncate
- [x] Replay into a fresh tenant with a stable report hash; PostgreSQL replay equals the in-memory reference report exactly (`replay-postgres.test.ts`)

## Phase E — API and dashboard

- [ ] Typed Fastify API with scopes and correlation IDs
- [ ] Market, Dossier and Replay Proof views on live API data

## Phase F — Agent gateway and evaluation

- [x] Five typed tools, policy gate (allowlist, scope, budget, size, deadline, approval, evidence citation), deterministic fake model
- [x] Opt-in OpenAI Agents SDK runner in `adapters` (lazy import, capped turns); not called by any test
- [x] Policy-block, tool-contract and replay-score evaluation suites: `pnpm test:eval` (golden report snapshot)

## Phase G — Observability, drills, demo

- [ ] Redacted logs, OpenTelemetry spans, correlation trace view
- [ ] Failure drills, Playwright e2e, accessibility and screenshots, docs

## Phase H — AWS CDK (no deploy)

- [ ] Demo stack, synth, cost-guardrail assertions

## CEO Summary — Plain English

- **What this is:** the live checklist for building Shinrai V1. Each box gets ticked only after a real check passes on this machine.
- **What it means:** the core "rules engine" is done and tested. That covers who can buy, at what price, and how paper credits move. Next comes saving everything in a real database and building the screens.
- **Key risk:** the money-like logic (paper credits) going wrong, for example spending the same credits twice or paying out twice. **The fix:** tests deliberately retry and duplicate requests and check that nothing is counted twice.
- **On:** local-only build, fake money, fake AI.
- **Off:** real money, real AI calls, AWS deployment, Polymarket.
- **Your decisions:** none right now. Later you'll decide whether to push the branch and open a pull request.
