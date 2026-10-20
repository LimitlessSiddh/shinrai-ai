# V1 implementation progress

Source: [`docs/plans/2026-10-20-full-v1-implementation-goal-prompt.md`](../plans/2026-10-20-full-v1-implementation-goal-prompt.md). Branch: `v1-implementation` (local, not pushed).

Legend: `[x]` verified by a command run locally · `[ ]` not done yet.

## Phase A — Foundation

- [x] pnpm workspace, strict TypeScript, ESLint (domain purity rule), Prettier, Vitest projects
- [x] Docker Compose: PostgreSQL 17 + NATS JetStream; optional `otel` profile (Jaeger)
- [x] `.env.example`, `.gitignore`, `SECURITY.md`, issue/PR templates, Dependabot
- [x] `ci.yml` (quality, integration, e2e, infra, workflow lint) and non-deploying `release-validation.yml`; actionlint clean
- [x] README quickstart verified from a fresh `git clone` (install, gates, integration, build, CDK, e2e all green)

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

- [x] Typed Fastify API: scoped bearer principals (agents clamped to read-only), correlation id on every response/header, typed 4xx domain errors, no DB route (`tests/integration/api.test.ts`)
- [x] Market, Dossier and Replay Proof views on live API data (polling), loading/empty/error/blocked states, 1440 + 375 layouts

## Phase F — Agent gateway and evaluation

- [x] Five typed tools, policy gate (allowlist, scope, budget, size, deadline, approval, evidence citation), deterministic fake model
- [x] Opt-in OpenAI Agents SDK runner in `adapters` (lazy import, capped turns); not called by any test
- [x] Policy-block, tool-contract and replay-score evaluation suites: `pnpm test:eval` (golden report snapshot)

## Phase G — Observability, drills, demo

- [x] Redacted logs, OpenTelemetry spans, correlation trace view (`GET /trace/:id`, Dossier)
- [x] Failure drills (`pnpm drill`, 6/6 PASS), Playwright e2e incl. axe + keyboard + reduced motion (16/16), screenshots in `docs/demo/screenshots/`
- [x] Developer docs: README quickstart, architecture map, testing/drills, safety/threat/cost, demo walkthrough

## Phase H — AWS CDK (no deploy)

- [x] Demo stack (S3+CloudFront, HTTP API + 4 Lambdas, EventBridge→SQS+DLQ, artifacts bucket, budgets, optional single-AZ RDS)
- [x] `pnpm cdk:test` (18 assertions incl. forbidden primitives, tags, budgets, per-function roles) and `pnpm cdk:synth` with real bundling; **nothing deployed**

## Phase I — Polymarket (optional)

- [ ] Read-only comparison adapter: deliberately deferred (IMP-016). V1 does not depend on it.

## Final verification (2026-10-20, fresh clone of `v1-implementation`)

| Check | Command | Result |
| --- | --- | --- |
| Bootstrap | `corepack pnpm install --frozen-lockfile` | pass |
| Format / lint / types | `pnpm format:check && pnpm lint && pnpm typecheck` | pass |
| Unit | `pnpm test:unit` | 32/32 |
| Evaluations | `pnpm test:eval` | 27/27 (incl. golden replay snapshot) |
| Integration (Testcontainers) | `pnpm test:integration` | 34/34 |
| E2E + a11y + screenshots | `pnpm test:e2e` | 16/16 |
| Web build | `pnpm build` | pass (static export, 3 routes) |
| CDK | `pnpm cdk:test && pnpm cdk:synth` | 18/18, synth OK (also with `enableRds=true`); nothing deployed |
| Failure drills | `pnpm drill` | 6/6 PASS |
| Workflow lint | `docker run rhysd/actionlint:1.7.7` | 0 findings |
| Secret scan | `gitleaks git` with `.gitleaks.toml` | no leaks in history (idempotency-key false positives allowlisted) |

## Open follow-ups for Siddh

- [x] `.env.example` now points at port 55432 and no longer ships an agent token with `trade` scope (fixed by Siddh).
- Hosted authentication is not implemented (IMP-021).
- The Polymarket adapter is deferred.
- The branch has not been pushed.

## CEO Summary — Plain English

- **What this is:** the checklist and proof sheet for Shinrai V1. Every box is ticked only after a real command passed on this machine.
- **What it means:** Shinrai now runs end to end on a laptop. An AI "trader" looks at a fake NBA market (pick who wins), cites evidence and asks to place a paper bet. Unsafe requests are blocked and the reason is shown. Every credit moves through a bank-style ledger (each move recorded twice, in and out). The whole game can be replayed and scored identically every time.
- **Key risk and the fix:** the danger with money-like systems is double-spending or paying out twice. Tests fire 20 simultaneous orders, duplicate retries and five simultaneous settlements, and nothing is ever counted twice. The database itself refuses unbalanced or edited ledger rows.
- **ON:** local app, dashboard (3 screens, works on phones, keyboard-accessible), fake AI, fake money, GitHub checks, and the AWS blueprint (generated only).
- **OFF:** real money, real AI calls (opt-in switch exists but is off), AWS deployment (nothing is running or costing money), live sports data, and Polymarket.
- **Your decisions:**
  1. ~~Fix two values in `.env.example`~~ done.
  2. Push the branch and open a pull request?
  3. Ever deploy a short AWS demo? That needs your explicit go-ahead.
  4. Ever enable a real AI model with a spending cap?
