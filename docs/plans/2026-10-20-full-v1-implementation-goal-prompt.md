# Shinrai AI — Full V1 implementation goal prompt

Copy the prompt below into the coding agent working in this repository.

---

## Goal

Build **Shinrai AI** from this documentation-only repository into an interview-ready, locally runnable V1: an **auditable, paper-only NBA game-winner prediction-market sandbox for AI agents**.

The finished product must let an operator run a deterministic NBA fixture through this complete loop:

1. inspect a versioned paper market and its rules;
2. let a constrained research agent use approved typed tools and cite evidence;
3. submit a paper limit order through deterministic policy;
4. match or reject the order without corrupting balances;
5. record balanced, append-only ledger entries and immutable domain events;
6. display the market, decision trace, policy result, portfolio impact and activity in the web dashboard;
7. resolve the fixture once; then replay and evaluate the run deterministically.

This is a systems project, not a sportsbook clone or an AI chatbot. Make the important engineering visible: invariants, idempotency, concurrency handling, durable events, traceability, replay, evaluation, accessibility, and a polished operator-facing UI.

## Context

Read these files before changing application code. They are the approved product and architecture source of truth:

1. `docs/product/00-product-brief.md`
2. `docs/architecture/decision-log.md`
3. `docs/architecture/2026-10-19-final-architecture.md`
4. `docs/plans/2026-10-19-mvp-implementation-plan.md`
5. `docs/research/2026-10-19-feasibility-research.md`
6. `docs/design/2026-10-20-stealth-signal-ui-system.md`
7. `design-system/shinrai-ai/MASTER.md`
8. `docs/design/mockups/README.md` and its local exported PNGs

The product starts with owned, versioned NBA fixtures and paper credits. The first complete scope is one binary NBA game-winner market and one research-to-order workflow. The local development profile is the primary deliverable; AWS is a demonstrable, explicitly bounded deployment profile—not an always-on production environment.

When documents conflict, preserve the hard safety boundaries first, then follow the final architecture, product brief/decision log, MVP plan, and UI system in that order. Do not silently substitute a generic template for the documented design. If a real contradiction blocks correctness, document it in `docs/implementation/decisions.md` and choose the smallest reversible interpretation.

## Constraints

### Hard product and safety boundaries

- **Paper credits only.** Never add real-money wagers, payments, wallet management, deposits, withdrawals, KYC, exchange credentials, signing, or exchange order endpoints.
- Do not provide gambling recommendations or present the UI as a consumer betting product.
- Agents are untrusted requesters. They may only use narrow, typed, approved tools; they never receive direct SQL, shell, arbitrary HTTP, privileged API, database, provider-secret, ledger, or settlement access.
- The matching core—not an LLM—owns orders, fills, reservations, double-entry ledger postings, settlement, and balance correctness.
- V1 must work fully offline/reproducibly with checked-in fixtures and a deterministic fake model. A real model call is opt-in only, isolated to the agent gateway, capped, and never needed for CI or e2e tests.
- Do not make a Polymarket/Kalshi/NBA provider a correctness dependency. A future Polymarket adapter is read-only enrichment only; no trading/account/wallet code of any kind.

### Architectural invariants

- Every state-changing command has an actor, tenant/agent scope, idempotency key, correlation ID, causation ID, timestamp, policy result, and audit record.
- Accepted credit movement is balanced in an append-only double-entry ledger; available paper balance cannot become negative.
- A rejected command changes no order-book, reservation, or ledger state.
- A duplicate idempotency key returns the original result and never recharges, refills, or resettles.
- Market resolution is exactly-once from the business perspective even when a worker is retried.
- PostgreSQL facts are authoritative; dashboard projections are rebuildable and allowed to lag.
- In the transactional match path, use PostgreSQL `SERIALIZABLE` transactions, a transaction-scoped advisory lock for the market, stable account-lock ordering, transactional outbox insertion, database constraints, and defensive application validation.
- Preserve a clean port/adapter boundary: the domain cannot import AWS SDKs, HTTP frameworks, database clients, model SDKs, or UI code.

### Cost and deployment guardrails

- Local Docker Compose/Testcontainers is the normal development and CI environment. No cloud credentials or provider secrets may be required for the suite.
- Build AWS CDK infrastructure and CDK synth/assertion tests, but **do not deploy AWS**, spend money, enable a real model provider, create accounts, or use external credentials unless the user explicitly asks in a later task.
- The AWS profile must prohibit NAT Gateway, EKS, MSK, Multi-AZ RDS, permanently running containers, provisioned concurrency, and always-on ElastiCache.
- Carry the documented cost posture forward: target $0–10 USD/month only when deliberately hosted; $30 is an alarm ceiling, not a target.

### GitHub delivery and authorship

- Set up repository-owned GitHub Actions under `.github/workflows/`. On every pull request and push to the default branch, run a reproducible CI pipeline: dependency install with a lockfile, format check, lint, strict type-check, unit suite, integration/evaluation suite, production web build, Playwright e2e suite, and CDK synth/assertion suite. Cache dependencies safely, upload test/playwright artifacts on failure, and use concurrency cancellation for superseded branch runs.
- Add a separate **non-deploying** delivery/release-validation workflow that builds the web artifact and verifies the infrastructure plan. It may be manually dispatchable, but it must not contain cloud credentials, deploy commands, or automatic production releases. Any future deployment workflow requires explicit user approval and an environment-protection gate.
- Add sensible repository hygiene: a precise `.gitignore`, `.env.example`, GitHub issue/PR templates, Dependabot configuration for the ecosystem in use, and a concise security policy documenting local secret reporting. Include a documented recommended branch-protection policy (required CI checks and review before merge), but do not try to alter remote GitHub settings without explicit permission.
- Keep commits small and passing. Before every commit, inspect `git diff --check`, `git status`, and the staged diff. Never stage secrets, `.env` files, generated credentials, local databases, test recordings containing sensitive data, or unrelated user changes.
- Preserve the repository's existing configured Git author identity. Do not change global Git configuration. Every commit must contain only that human author identity and must contain **no** `Co-authored-by:`, `Assisted-by:`, `Generated-by:`, Codex, Claude, Copilot, or other AI attribution trailers/metadata in commit messages, source comments, pull requests, releases, or generated docs.
- Do not attempt to tamper with, disable, or misrepresent any GitHub-provided audit, security, provenance, or account-level signals. This rule is about keeping repository-authored artifacts clean; platform-controlled records are outside the repository's control.

### Engineering and UI constraints

- Use a strict, current stable TypeScript monorepo and pin versions. Use one package manager/workspace system consistently. Choose practical stable libraries only where they reduce risk; document each material choice in `docs/implementation/decisions.md`.
- Maintain the planned shape: `apps/{web,api,worker}`, `packages/{domain,contracts,adapters,agent-tools,observability}`, `infra/cdk`, `fixtures/nba`, and `tests/{unit,integration,e2e,evaluations}`. Small additions are fine; needless services are not.
- Validate all API commands, events and agent-tool inputs/outputs at boundaries with shared strict schemas. Never duplicate business rules in the web client.
- Build the dashboard from the supplied **Stealth Signal** system: smoke/steel surfaces, `#C7FF3D` only for primary operator intent/active thesis, and distinct text-plus-icon status states. No purple, cream, gradients, rainbow dashboards, sports-betting slip UI, or generic chatbot layout.
- Build responsive and accessible UI. Support keyboard navigation, visible focus, loading/empty/error states, reduced motion, and WCAG AA contrast. Use accessible labels and non-color-only chart/status meanings.
- Keep secrets out of the repo, fixtures, client bundle, logs, traces and screenshots. Supply `.env.example` with safe placeholders.
- Preserve existing docs and local design assets. Do not erase or rewrite prior work merely to simplify implementation.

## Priority

Do the project in this order. Do not jump to AWS, live model calls, external market data, or polish before the deterministic local core is correct.

1. Repository baseline, developer experience, and CI.
2. Pure domain model, matching, reservations, double-entry ledger, idempotency, and settlement—tested before HTTP.
3. PostgreSQL persistence, migrations, locking, transaction boundaries, transactional outbox, and concurrency tests.
4. Event transport, projections, worker retry/dead-letter behavior, and replay rebuilds.
5. HTTP command/query API and the operator dashboard.
6. Restricted agent gateway, deterministic fake model, evidence, policy blocks, agent trace, and evaluation harness.
7. Observability, failure drills, e2e coverage, screenshots/demo seed workflow, and documentation.
8. AWS CDK demo profile and synth/assertion tests only—never deploy.
9. A read-only Polymarket comparison adapter only if all prior stages are green and it can remain optional; it is acceptable to leave it documented but unimplemented rather than weaken V1.

## Plan

Work autonomously in small, verified increments. Before implementing, inspect the existing repository, check `git status`, and create `docs/implementation/progress.md` with a checklist mapped to the phases below. Keep it current as work is verified.

### Phase A — Foundation

1. Establish the TypeScript workspace, package manager, strict compiler/linter/formatter settings, shared test utilities, Docker Compose stack, `.env.example`, and the GitHub Actions CI/delivery workflows described above.
2. Make a fresh clone able to run formatting, lint, type-check, unit tests, and a local dependency stack without cloud/model secrets.
3. Provide local services required for V1: PostgreSQL and NATS JetStream. Keep optional observability components behind a profile/flag so the default developer command remains simple.
4. Add a clear README quickstart, architecture map, test command reference, deterministic demo command, CI badge/status explanation, and GitHub contribution/branch-protection guidance.

### Phase B — Deterministic domain core, test first

1. Define shared contracts and domain types for market lifecycle, outcomes, limit orders, fills, positions, paper-credit reservations, ledger entries, agent policy, evidence, commands and immutable events.
2. Write failing unit tests before each domain behavior, then implement the smallest correct code.
3. Cover price-time priority and deterministic partial fills; use explicit deterministic ordering/tie-breakers.
4. Cover available-balance checks, reservations, balanced double-entry postings, cancellation/release behavior, idempotent repeats, and exactly-once settlement.
5. Ensure every emitted domain event includes event ID, correlation ID, causation ID, actor, timestamp, schema/version metadata and a useful payload.

### Phase C — PostgreSQL source of truth and outbox

1. Add migrations for all tables named in the approved architecture: markets/outcomes/rules/resolutions; orders/fills/positions/idempotency keys; ledger accounts/entries/reservations; agent policies/runs/tool calls/approvals; outbox/event deliveries/audit; projections; fixtures/evidence/evaluation records.
2. Put critical constraints in the database as well as code: FKs, check constraints, unique idempotency scope, resolution uniqueness, and append-only ledger protections.
3. Implement repositories/adapters and one transaction boundary around validated command handling.
4. Use Testcontainers to prove concurrent orders cannot overspend and that serializable retries/idempotency return the original answer safely.
5. Implement a transactional outbox: commit command facts and exactly one outbox event together; publish only committed events.

### Phase D — Eventing, projections and replay

1. Implement a local NATS JetStream `EventBus` adapter plus a consumer idempotency strategy, retry rules and a visible dead-letter path.
2. Build worker-owned read projections for market, portfolio and activity views.
3. Prove projections can be deleted/rebuilt from persisted source facts and that duplicate delivery mutates a projection once.
4. Provide an explicit replay command/API that runs a versioned fixture and yields stable resulting state/report.

### Phase E — API and operator dashboard

1. Implement a typed HTTP API for market list/detail, rules, portfolio, activity trace, paper order submit/cancel, fixture resolution, and replay/evaluation reads. Authorize/scopes requests consistently; never expose a direct database route.
2. Return correlation IDs in success and error responses. Model expected domain rejections as clear typed errors rather than 500s.
3. Build the dashboard against API/read-model data (not hardcoded screen values): Market Command Center, Decision Dossier/trace, and Replay Proof.
4. Use the supplied local Figma exports as visual reference and the semantic tokens from `design-system/shinrai-ai/MASTER.md`; make a good empty/loading/error/blocked state, not only the happy path.
5. Use polling first. Do not add WebSockets unless a measurable feature is blocked without them.

### Phase F — Restricted agent loop and evaluation

1. Implement only these narrow agent tools with strict input/output schemas: `getMarket`, `getRules`, `getPortfolio`, `searchEvidence`, and `requestOrder`.
2. Route every state-changing agent request through the same command path/policy checks as a human request.
3. Enforce tool allowlists, market scope, paper budget, order-size cap, run deadline and approval requirement. Log every tool call and policy decision under the run correlation ID.
4. Add a deterministic fake model/agent scenario for all local and CI tests. Make a real OpenAI Agents SDK adapter opt-in, configuration-gated and capped; do not make a network call by default.
5. Implement deterministic evaluation reports with Brier score, log loss, paper PnL, max drawdown, policy adherence, tool-call success rate and policy-violation count.

### Phase G — Observability, quality and demo proof

1. Add structured logging, redaction and OpenTelemetry-compatible tracing. Make one correlation ID navigate from agent run → tool calls → command → ledger transaction → outbox event → projection → evaluation result.
2. Add scripted failure drills: duplicate request, insufficient credits, policy-blocked agent action, worker failure/retry, projection rebuild and duplicate event delivery.
3. Add test fixtures that make the happy path and one unsafe blocked action visually demoable.
4. Finish developer documentation: architecture-to-code map, local commands, test strategy, threat/safety boundary, reproducible demo walkthrough, AWS cost posture, and what remains deliberately out of scope.

### Phase H — AWS profile, no deploy

1. Implement CDK for the documented short-lived demo topology: static web hosting, HTTP API/Lambda shape, S3 artifacts, EventBridge/SQS, least-privilege per-component roles, tags, and budget-alarm resources/configuration where deployable.
2. Keep RDS optional and disabled by default; do not require AWS to demonstrate local parity.
3. Add CDK synth/assertion tests proving the forbidden cost primitives are absent and that resource tags/cost controls are present.
4. Do not run a deploy command.

## Done When

The implementation is complete only when all of these are true:

- A new developer can clone the repo, follow the README, start local dependencies, seed an NBA fixture, and run the demo without AWS, external provider accounts, or a real model key.
- Two paper agents can submit competing valid limit orders concurrently with no double-spend, deterministic fills, balanced ledger records and traceable events.
- Repeating an accepted command or settlement request is safe and returns/reports the original result without duplicate state changes.
- A policy-blocked or insufficient-credit request leaves no order, reservation, fill or ledger mutation.
- A worker failure/retry and duplicate event delivery do not corrupt projections; projections rebuild from source facts.
- The dashboard demonstrates the market, evidence, proposed action, policy result, trace, order/fill state, ledger impact, settlement and replay/evaluation result using real local API data.
- The agent can only use the five approved tools and all unsafe/malformed/out-of-scope requests are blocked and test-covered.
- The UI faithfully uses the Stealth Signal design system and works on desktop plus narrow mobile layouts with keyboard and reduced-motion support.
- AWS CDK synthesizes and its assertions pass, but no paid service has been deployed.

## Verify

Do not claim completion until you run and report the exact commands and results for all applicable checks:

1. clean-install/bootstrap check from the documented quickstart;
2. formatter, lint and strict type-check;
3. all unit tests;
4. PostgreSQL/NATS integration suite via Testcontainers or the documented local stack;
5. concurrency, outbox, retry, idempotency, replay and settlement tests;
6. deterministic agent-tool, policy-block and evaluation suites;
7. Playwright e2e tests for:
   - happy market lifecycle: fixture → agent/human command → match → settlement → ledger/portfolio/trace;
   - rejected insufficient-credit order with zero state mutation;
   - blocked agent request with a visible policy reason;
   - replay/evaluation result;
8. browser smoke check/screenshots of the three main dashboard views at desktop and a narrow viewport;
9. accessibility checks for critical flows, including keyboard focus and color-independent status;
10. CDK synth and CDK assertion tests;
11. GitHub Actions workflow validation (syntax, trigger coverage and a local workflow linter if available);
12. `git diff --check`, secret scan if available locally, a final `git status` review, and a check that every new commit has only the configured human author and no AI/co-author trailers.

If a test is flaky, do not mask it with retries alone. Find the nondeterministic dependency, control it, and document the fix.

## Output

At the end, provide a concise implementation handoff containing:

1. what is now working, mapped to the MVP phases;
2. every created/modified file grouped by purpose, with a one-line summary each;
3. exact verification commands and pass/fail results;
4. e2e/demo evidence, including the main local URL/command and saved screenshot paths;
5. architecture decisions made during implementation and any deliberately deferred work;
6. current `git status` and commit history/commit IDs created during the work;
7. a candid list of limitations or follow-ups. Never describe unrun, mocked, or local-only behavior as deployed/production-ready.

Use focused commits after coherent, passing milestones. Do not add assistant/co-author attribution to Git metadata, source files, pull requests, releases, or generated docs.

## Stop Rules

- Stop immediately and ask for direction before any real-money/exchange/wallet/payment behavior, AWS deployment, paid API activation, account creation, secret acquisition, or destructive data operation.
- Do not stop for optional live-provider/model credentials: keep the deterministic fixture/fake-model path working and mark the integration optional.
- If a non-destructive technical blocker remains after three materially different attempts, preserve the working state, record the evidence in `docs/implementation/progress.md`, and report the precise blocker plus the smallest decision needed.
- Do not weaken invariants, delete tests, skip e2e coverage, hardcode UI-only success states, or bypass policy/ledger paths just to make a demo look complete.
- Do not start a new unrelated feature before the verification gates for the current phase pass.

---

Use this as a persistent execution loop: inspect → write/adjust a narrowly scoped test → implement → run the relevant test → review the diff → commit only passing milestones → update progress → move to the next priority.
