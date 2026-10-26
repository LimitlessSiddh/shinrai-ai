# Shinrai AI mockup handoff

The editable mockups live in [Figma](https://www.figma.com/design/yKUP7eyOfsg4Gzs9x44TPZ). They are the visual reference for the first frontend build; this repository keeps the implementation rules so the design does not disappear behind a link.

## Local exports

The current 1440px PNG references are intentionally checked into this repository:

- [Color system](exports/00-stealth-signal-color-system.png)
- [The Market](exports/01-the-market-stealth-signal.png)
- [The Dossier](exports/02-the-dossier-stealth-signal.png)
- [Replay Proof](exports/03-replay-proof-stealth-signal.png)

## Frames

- [00 — Stealth Signal / Color System](https://www.figma.com/design/yKUP7eyOfsg4Gzs9x44TPZ?node-id=5-2): approved colors and their meanings.
- [01 — The Market / Premium](https://www.figma.com/design/yKUP7eyOfsg4Gzs9x44TPZ?node-id=3-2): operator’s market command center.
- [02 — The Dossier / Premium](https://www.figma.com/design/yKUP7eyOfsg4Gzs9x44TPZ?node-id=3-53): evidence and policy decision trail.
- [03 — Replay Proof / Premium](https://www.figma.com/design/yKUP7eyOfsg4Gzs9x44TPZ?node-id=3-96): resolved-run and replay evaluation.

## Engineering handoff

1. Use the semantic variables in [`design-system/shinrai-ai/MASTER.md`](../../../design-system/shinrai-ai/MASTER.md), not raw color literals in components.
2. Make the dashboard data-driven: cards, trace steps, market pulse and evaluation values all come from fixture/run records, never hardcoded layout-specific data.
3. Treat the mockups as the desktop visual north star, not an excuse to hide mobile behavior. Collapse secondary panels below a clear primary decision summary.
4. Before a pull request, compare the implemented screen with this Figma source at desktop width and test keyboard focus, reduced motion and empty/error states.
