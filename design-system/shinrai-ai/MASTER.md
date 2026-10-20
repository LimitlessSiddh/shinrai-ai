# Shinrai AI — Design System Master

> The build source of truth for Shinrai AI. Page-specific rules may refine these tokens, never replace their semantic meaning.

## Stealth Signal

Shinrai is an auditable agent-operations console, not a sportsbook. Its visual language is quiet infrastructure: smoke and steel establish trust; a single neon signal tells the operator where intent or a decision is active.

### Color tokens

| Semantic role | Hex | CSS token | Use |
| --- | --- | --- | --- |
| Canvas | `#0A0D0C` | `--color-canvas` | App background |
| Smoke | `#111513` | `--color-surface` | Navigation, low-elevation surfaces |
| Raised | `#191E1B` | `--color-surface-raised` | Cards and work areas |
| Strong | `#252B27` | `--color-surface-strong` | Selected or dense containers |
| Subtle border | `#2E3732` | `--color-border-subtle` | Default dividers |
| Strong border | `#46534B` | `--color-border-strong` | Focused or selected outline |
| Primary text | `#F3F6F1` | `--color-text-primary` | Headings and important values |
| Secondary text | `#A7B0A9` | `--color-text-secondary` | Supporting copy |
| Tertiary text | `#737D75` | `--color-text-tertiary` | Metadata only; never essential content alone |
| Steel | `#8D9990` | `--color-steel` | Neutral data series and inactive states |
| Signal | `#C7FF3D` | `--color-signal` | Primary intent, active thesis, selected action |
| Accepted | `#53E1A5` | `--color-success` | Policy-approved / healthy state |
| Watch | `#F4B942` | `--color-warning` | Degraded or review-needed state |
| Blocked | `#FF6B5C` | `--color-danger` | Rejected, policy-blocked, or failed state |

```css
:root {
  --color-canvas: #0A0D0C;
  --color-surface: #111513;
  --color-surface-raised: #191E1B;
  --color-surface-strong: #252B27;
  --color-border-subtle: #2E3732;
  --color-border-strong: #46534B;
  --color-text-primary: #F3F6F1;
  --color-text-secondary: #A7B0A9;
  --color-text-tertiary: #737D75;
  --color-steel: #8D9990;
  --color-signal: #C7FF3D;
  --color-success: #53E1A5;
  --color-warning: #F4B942;
  --color-danger: #FF6B5C;
}
```

### Color rules

- Signal green means **operator intent or an active decision**. It is not a general decorative color and is not the same as success.
- Success, warning, and danger describe an observed system state. Pair every status color with an icon and text.
- Do not use gradients, purple, warm cream, or neon-green full-page backgrounds in the product UI.
- Use `--color-text-tertiary` only for nonessential metadata. Body copy must meet WCAG AA contrast on its surface.

## Type and spacing

- **Font:** Inter; use a compact monospace face only for IDs, event times, prices, and trace hashes.
- **Display:** 48–72px, 700 weight, tight tracking. Reserve for one decision or market framing statement.
- **Section heading:** 20–28px, 650–700 weight.
- **Body:** 14–16px, 400–500 weight.
- **Metadata:** 11–12px uppercase/monospace, generous letter spacing.
- **Spacing grid:** 4, 8, 12, 16, 24, 32, 48, 64px. Prefer a calm, roomy composition over dashboard density.

## Component contracts

### Buttons

- One primary action per view: signal fill with `#0A0D0C` text.
- Secondary action: smoke/raised surface, subtle border, primary text.
- Destructive action: outline or confirmation step; never an unguarded danger-filled default CTA.
- Keyboard focus: 2px signal outline with a 3px canvas separation ring.

### Cards and data panels

- Base card: raised surface, 1px subtle border, 16px radius, no drop shadow.
- Selected/active card: strong surface plus strong border—not a large glow.
- Numeric values are primary text; labels are secondary/tertiary; status is expressed by text, icon, then color.

### Charts and traces

- Signal: current decision or selected series.
- Steel: comparison/reference series.
- Accepted/warning/blocked: operational state only.
- Supply values, labels, and a non-color way to distinguish every series. Never render a chart without an accessible text summary or data-table path.

## Motion and accessibility

- 150–220ms opacity/color transitions; no ornamental ambient animation.
- Respect `prefers-reduced-motion` and never animate a value in a way that hides the final number.
- 4.5:1 minimum body-text contrast; all action targets have visible focus and at least 44px target height on touch.
- Support 375px, 768px, 1024px, and 1440px. The operator’s current decision should survive every breakpoint.

## Forbidden patterns

- Generic sportsbook visual language: odds tiles, betting-slip metaphors, confetti, aggressive red/green P&L treatment.
- Rainbow charts, glows used as hierarchy, decorative gradients, emojis as product icons.
- Color-only status, hidden focus, motion that does not communicate state, or unlabelled graphs.
