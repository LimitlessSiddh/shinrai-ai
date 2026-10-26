# V1 implementation progress

Source: [`docs/plans/2026-10-20-full-v1-implementation-goal-prompt.md`](../plans/2026-10-20-full-v1-implementation-goal-prompt.md). Branch: `v1-implementation` (release candidate; push and PR pending).

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
- [x] Six console views on live API data (Overview, Runs, Dossier, Ledger, Replay and System), with polling and loading/empty/error/blocked states at desktop and mobile widths

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

## Post-V1 — Operator console redesign (2026-10-20)

- [x] App shell (sidebar / mobile tab bar), ⌘K palette, toasts, live pipeline health
- [x] Overview: market strip, edge meter, order book, fills, approval queue, tabbed actions
- [x] New Runs, Ledger and System views; dossier rebuilt as a five-stage pipeline
- [x] Verified: `pnpm test:e2e` covers all six views, including axe, keyboard, reduced-motion and responsive checks; unit + evaluation suites and the production build also pass

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
| E2E + a11y + screenshots | `pnpm test:e2e` | pass (all six console views) |
| Web build | `pnpm build` | pass (static export) |
| CDK | `pnpm cdk:test && pnpm cdk:synth` | 18/18, synth OK (also with `enableRds=true`); nothing deployed |
| Failure drills | `pnpm drill` | 6/6 PASS |
| Workflow lint | `docker run rhysd/actionlint:1.7.7` | 0 findings |
| Secret scan | `gitleaks git` with `.gitleaks.toml` | no leaks in history (idempotency-key false positives allowlisted) |

## Release handoff

### Final local verification — 2026-10-25

| Check | Result |
| --- | --- |
| Format, lint and strict typecheck | pass |
| Unit tests | 32/32 |
| Agent evaluation tests | 27/27 |
| PostgreSQL + NATS integration tests | 35/35 |
| Production web build | pass (7 application routes plus the generated not-found page) |
| Playwright E2E, accessibility and screenshots | 27/27 across all six console views |
| Failure drills | 6/6 PASS |
| CDK assertions and synth | 18/18; synth pass; nothing deployed |
| Secret-history scan and workflow lint | no leaks; clean |
| Manual demo and replay | demo pass; two replay reports matched hash `9e3ae4e5346f640c` |

- The command palette shortcut now always opens (rather than toggles) the palette; its keyboard flow passed ten repeated cold browser runs before the final E2E pass.
- Next: push `v1-implementation` and open a PR to `main`; do not merge until it has been reviewed.
- This release stays local-first and paper-only: deployment, hosted identity, real model calls, live data and Polymarket remain out of scope.

## Intentional exclusions

- [x] `.env.example` now points at port 55432 and no longer ships an agent token with `trade` scope (fixed by Siddh).
- Hosted authentication is not implemented (IMP-021).
- The Polymarket adapter is deferred.

## CEO Summary — Plain English

- **What this is:** the checklist and proof sheet for Shinrai V1. Every box is ticked only after a real command passed on this machine.
- **What it means:** Shinrai now runs end to end on a laptop. An AI "trader" looks at a fake NBA market (pick who wins), cites evidence and asks to place a paper bet. Unsafe requests are blocked and the reason is shown. Every credit moves through a bank-style ledger (each move recorded twice, in and out). The whole game can be replayed and scored identically every time.
- **Key risk and the fix:** the danger with money-like systems is double-spending or paying out twice. Tests fire 20 simultaneous orders, duplicate retries and five simultaneous settlements, and nothing is ever counted twice. The database itself refuses unbalanced or edited ledger rows.
- **ON:** local app, six-view dashboard (works on phones and is keyboard-accessible), fake AI, fake money, GitHub checks, and the AWS blueprint (generated only).
- **OFF:** real money, real AI calls (opt-in switch exists but is off), AWS deployment (nothing is running or costing money), live sports data, and Polymarket.
