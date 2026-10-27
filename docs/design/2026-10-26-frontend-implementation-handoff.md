# Shinrai AI frontend implementation handoff

## Source of truth

Before changing the product UI, read these in order:

1. [Design-system master](../../design-system/shinrai-ai-research-workspace/MASTER.md)
2. [Interactive prototype](prototypes/shinrai-research-workspace-prototype.html)
3. [Light research-workspace reset brief](2026-10-26-light-research-workspace-reset.md)

This is a full visual reset. The existing dark Stealth Signal interface is historical implementation context, not a design direction to blend into the new experience.

## Product journey to preserve

Create an agent version, choose an NBA slate, run paper predictions, inspect evidence and uncertainty, create a comparable version, then evaluate two versions against the same settled sample. Arena is a later, read-only view of public records.

## Page and code map

| Experience | Target implementation area | Preserve from the existing product |
| --- | --- | --- |
| Workspace | Replace the presentation in apps/web/src/app/page.tsx | Market, runs, orders, fills, portfolio, and activity data contracts. |
| Prediction detail | Redesign apps/web/src/app/dossier/page.tsx | Trace, evidence, tool, policy, ledger, and event visibility. |
| Agent setup | Add an agents route or modal under apps/web/src/app/agents | Policy and version configuration must remain explicit. |
| Experiments | Evolve apps/web/src/app/replay/page.tsx or add an experiments route | Evaluation metrics: Brier, log loss, PnL, drawdown, and adherence. |
| Arena | Add a read-only apps/web/src/app/arena route | Public/private distinction and representative sample sizes. |
| Application shell | Update apps/web/src/components/shell/AppShell.tsx and nav.ts | Clear navigation and accessible keyboard behavior. |
| Tokens and shared styles | Replace the dark styling under apps/web/src/styles | Existing responsive and accessibility behavior. |

## Build order

1. Implement the light shell, navigation, tokens, typography, and reusable table/status primitives.
2. Build Workspace against real existing API data; retain helpful empty, loading, error, and no-prediction states.
3. Build the full prediction detail view with result first, followed by evidence, uncertainty, and concise activity.
4. Connect Agent setup only through confirmed version and policy contracts; do not invent a configuration API.
5. Build Experiments so every comparison fixes the game set, cutoff, scoring definition, and settled sample.
6. Add Arena last as a read-only comparison surface.

## Non-negotiables

- Shinrai is paper-only. Never introduce real-money execution, wallets, deposits, or payment flows.
- Keep agent probability, market probability, evidence completeness, and policy status as separate concepts.
- A no-prediction state is valid and must explain what is unavailable or insufficient.
- Never expose model chain-of-thought. Show evidence, inputs, policy decisions, and concise explanations instead.
- State-changing actions continue to use the established command path and its audit trail.
- The prototype uses fictional data only; it is not proof of a live provider integration.
- Avoid neon, casino cues, betting-slip visuals, chatbot layouts, node graphs, heavy gradients, or robot imagery.

## Visual and interaction acceptance checklist

- Light warm-white canvas, crisp white surfaces, dark navy text, and restrained blue action color match the master.
- The main desktop view works at 1440 px and 1280 px wide; the experience remains useful at 768 px and 390 px.
- Every interactive control is keyboard reachable, focused visibly, and named for assistive technology.
- Tables, status badges, probabilities, and evidence states remain legible without color alone.
- Loading, empty, error, no-prediction, research-in-progress, and completed states are designed intentionally.
- Capture review screenshots at 1440 px, 1280 px, 768 px, and 390 px before merging.
