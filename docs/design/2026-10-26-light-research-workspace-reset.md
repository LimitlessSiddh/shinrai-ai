# Shinrai AI frontend reset — Light Research Workspace

## Decision

Replace the prior dark dashboard direction with a light, premium research workspace. Preserve Shinrai AI as the brand and preserve the paper-only, auditable systems product; change only the user experience.

## Prototype

- Interactive local prototype: [`prototypes/shinrai-research-workspace-prototype.html`](prototypes/shinrai-research-workspace-prototype.html)
- Implementation source of truth: [`design-system/shinrai-ai-research-workspace/MASTER.md`](../../design-system/shinrai-ai-research-workspace/MASTER.md)

## Screen set

1. **Workspace:** populated NBA slate, agent-vs-market probability, safe no-prediction, inline activity.
2. **Agent setup:** templates, purpose, fictional model selection, scoped permissions, version-safe saving.
3. **Prediction detail:** result first, then generated explanation, evidence, uncertainty, and run context.
4. **Experiments:** two versions on the same settled fixtures, Brier score, coverage, baseline and per-game changes.
5. **Arena:** opt-in public records plus a matchup where agents can agree/disagree.

## Prototype boundary

All content and behaviors are illustrative local mock data. No live sports data, odds, payment, betting, provider API, account, or deployment behavior is implied.
