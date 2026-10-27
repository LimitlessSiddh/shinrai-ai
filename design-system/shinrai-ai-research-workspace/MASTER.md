# Shinrai AI — Light Research Workspace

> Approved visual reset for new frontend work. It changes the interface direction only, not the paper-only backend/domain model.

## Product posture

Shinrai is a calm sports-research workspace for configuring agents, inspecting predictions, and comparing experiment outcomes—not a consumer sportsbook, chat app, or generic AI dashboard.

## Tokens

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#F7F6F2` | Warm white application background |
| Surface | `#FFFFFF` | Cards, sidebar, focused work areas |
| Ink | `#14263D` | Headings, key values, brand |
| Text | `#243447` | Body text |
| Muted | `#667085` | Supporting text/metadata |
| Border | `#E2E4E8` | Quiet separation |
| Primary | `#2463D4` | One primary action, active nav, interaction |
| Primary soft | `#EAF1FF` | Selected/active backgrounds |
| Positive | `#167A57` | Completed/available state |
| Warning | `#9A5B00` | Missing data/review state |
| Danger | `#B42318` | Regression/error state |

## Layout and experience

- Wide desktop: 220px sidebar, flexible primary workspace, 360–420px detail panel. At laptop widths, stack detail below the table; on mobile, use compact horizontal nav and full-screen detail.
- Use an 8px spacing scale, 8–12px radii, quiet 1px borders, Inter/equivalent sans-serif, and tabular numerals.
- Start on a populated workspace. Core loop: configure version → select slate → run → inspect evidence → compare versions.
- Keep model probability, market baseline, evidence completeness, and policy status visibly separate. A no-prediction is a useful safe result with a reason.
- Activity is concise recorded events; never chain-of-thought.

## Exclusions and accessibility

- No neon, dark trader terminal, purple, gradients, heavy glass, casino/betting-slip language, robot art, oversized KPI tiles, or default chat interface.
- Never use color alone for status. Provide 4.5:1 body contrast, visible keyboard focus, labelled controls, 150–220ms motion, reduced-motion support, and feedback for runs over 300ms.
