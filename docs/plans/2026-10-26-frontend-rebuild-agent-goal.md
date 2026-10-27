# Shinrai AI frontend rebuild agent goal

## Goal

Rebuild the entire Shinrai AI frontend from zero into the approved light, premium NBA research workspace. Replace the current dark Stealth Signal presentation with the new UI/UX system, while preserving all existing paper-only domain logic, API contracts, safety boundaries, auditability, and backend behavior.

## Context

Project root: `/Users/siddhpatel/Development/shinrai-ai`

Read these before writing code, in this exact order:

1. `design-system/shinrai-ai-research-workspace/MASTER.md`
2. `docs/design/prototypes/shinrai-research-workspace-prototype.html`
3. `docs/design/prototypes/README.md`
4. `docs/design/2026-10-26-light-research-workspace-reset.md`
5. `docs/design/2026-10-26-frontend-implementation-handoff.md`
6. Existing frontend under `apps/web/src/`
7. Existing tests, API clients, types, and backend contracts before changing any interface.

The interactive prototype is the visual and interaction source of truth. The screenshots are visual references. The existing codebase is the source of truth for real data contracts and behavior.

## Constraints

- This is a frontend rebuild, not a backend rewrite.
- Preserve Shinrai as paper-only. Never add wallets, payments, deposits, withdrawals, real-money trading, or exchange execution.
- Preserve audit trails, deterministic policy decisions, evidence visibility, agent/version boundaries, and existing command-path protections.
- Do not expose chain-of-thought. Show concise explanations, sources, evidence, uncertainty, policy outcomes, and activity history.
- Do not silently invent APIs or mutate backend contracts. If a needed frontend contract is missing, document the gap and use a typed, isolated adapter or fixture only where appropriate.
- Do not mix the old dark Stealth Signal visual language into the new design.
- Avoid neon, casino/betting-slip aesthetics, chatbot layouts, robot imagery, node graphs, oversized KPI cards, and heavy gradients.
- Use the approved palette: warm-white canvas, white surfaces, dark navy text, restrained blue actions, and accessible semantic status colors.
- Keep all user-facing copy crisp, professional, and research-oriented.
- Do not add AI/co-author attribution to commits, source headers, comments, pull requests, or documentation.

## Priority

1. Establish the new visual system and app shell.
2. Rebuild the Workspace using real existing data and states.
3. Rebuild Prediction Detail / Dossier with evidence and uncertainty first-class.
4. Implement the Agent Setup flow using confirmed version/policy contracts.
5. Rebuild Experiments with fair, fixed-sample comparisons.
6. Add the read-only Arena experience last.
7. Validate responsiveness, accessibility, security, performance, and quality before considering the work complete.

## Plan

### Phase 1 — Understand and map

- Inspect the current frontend structure, routes, components, styles, tests, API clients, and shared types.
- Create a concise implementation checklist mapping each approved screen to the existing routes/components.
- Identify every existing behavior that must survive the visual rebuild.
- Confirm the current test and build commands before modifying code.

### Phase 2 — Build the foundation

- Replace the global design tokens, typography, spacing, surfaces, navigation, buttons, tables, badges, form controls, loading states, empty states, and error states.
- Rebuild the application shell and navigation around Workspace, Agents, Experiments, Arena, and settings.
- Make the layout responsive at desktop, laptop, tablet, and mobile widths.
- Build reusable primitives instead of page-specific duplicated styles.

### Phase 3 — Build the product surfaces

- Workspace: NBA slate table, filters, agent/version controls, run state, selected prediction panel, and clear status states.
- Prediction Detail: result first, then market probability, agent probability, evidence completeness, sources, uncertainty, policy status, and concise activity.
- Agent Setup: templates, agent purpose, model selection, sport/market scope, permissions, instructions, advanced settings, save, and save-and-test behavior.
- Experiments: compare versions only on the same fixed game set, cutoff, and settled sample; show Brier score first, accuracy second, plus baseline and sample-size context.
- Arena: read-only public records with explicit public/private labels and no exaggerated claims from small samples.

### Phase 4 — Quality outer loop

After each meaningful implementation slice:

1. Run formatting, type-checking, linting, unit tests, and relevant integration tests.
2. Inspect the page in a real browser at 1440 px, 1280 px, 768 px, and 390 px.
3. Check keyboard navigation, visible focus, semantic labels, contrast, tables, modals, forms, loading states, empty states, error states, and no-prediction states.
4. Review every changed file for broken types or unsafe casts, duplicated components or CSS, dead code, missing error handling, insecure client-side assumptions, exposed secrets or credentials, unsafe rendering or injection risks, accessibility regressions, misleading financial or prediction claims, and performance regressions.
5. Fix issues immediately, rerun the relevant checks, and repeat until clean.

Before finalizing, run a dedicated security and dependency review. Flag vulnerabilities, insecure patterns, missing validation, exposed environment variables, and dependency issues. Fix safe, in-scope problems; clearly report anything requiring a product decision.

## Done when

- The old dark UI is fully replaced by the approved light Shinrai AI research workspace.
- Workspace, Prediction Detail, Agent Setup, Experiments, and Arena are implemented or intentionally documented as blocked by a missing backend contract.
- Existing data flows, paper-only constraints, auditability, and policy boundaries remain intact.
- The UI is polished and coherent across desktop, laptop, tablet, and mobile.
- The project passes build, type-check, lint, unit tests, integration tests, and relevant end-to-end tests.
- No high- or critical-severity dependency/security issue is introduced.
- Browser verification and screenshots exist for 1440 px, 1280 px, 768 px, and 390 px.
- No placeholder UI, fake production claims, broken states, or poor-quality generated implementation remain.

## Verify

Run the full project quality suite and report exact results for:

- install/dependency audit
- formatting
- type-check
- lint
- unit tests
- integration tests
- end-to-end tests
- production build
- accessibility checks
- responsive browser checks
- security review

## Output

At completion, provide:

1. A concise summary of the rebuilt experience.
2. Every file changed, with a one-line reason.
3. Test/build/security results with pass/fail status.
4. Screenshots or paths for each required viewport.
5. Any remaining limitations, backend-contract gaps, or follow-up recommendations.
6. Confirmation that no paper-only safety boundary or existing backend contract was weakened.

## Stop rules

- Stop and ask before changing database schemas, public APIs, authentication, authorization, deployment infrastructure, paid services, secrets, or any real-money-related behavior.
- Stop and ask if an existing backend contract conflicts with the approved UI prototype.
- Stop if the same failing test or build issue persists after three genuinely different repair attempts; report the evidence and the smallest next decision needed.
- Do not claim completion until the verification checklist is actually complete.
