# Shinrai AI UI system — Stealth Signal

**Status:** Approved build direction  
**Figma source:** [editable premium mockups](https://www.figma.com/design/yKUP7eyOfsg4Gzs9x44TPZ)  
**Audience:** Operators evaluating an NBA paper-market agent; this is not a consumer betting interface.

## The design idea

Shinrai should feel like quiet, trustworthy infrastructure. The screen remains smoke/stealth grey so the operator can read evidence and trace an agent’s decision without visual noise. Neon green is deliberately scarce: it means a human or agent has an active intent to inspect, run, or select. It never means generic “good.”

## Palette

| What | Token | Hex | Rule |
| --- | --- | --- | --- |
| App canvas | `canvas` | `#0A0D0C` | Default page background |
| Navigation / base surface | `surface` | `#111513` | Calm structural layer |
| Cards / workspaces | `surface-raised` | `#191E1B` | Evidence, market and replay panels |
| Selected dense regions | `surface-strong` | `#252B27` | Selected or high-attention container |
| Main copy | `text-primary` | `#F3F6F1` | Values and headings |
| Supporting copy | `text-secondary` | `#A7B0A9` | Explanations and body text |
| Inactive data | `steel` | `#8D9990` | Reference series / inactive control |
| Intent | `signal` | `#C7FF3D` | Primary action, active thesis, selected state |
| Accepted | `success` | `#53E1A5` | Healthy or policy-approved state |
| Needs attention | `warning` | `#F4B942` | Review-required state |
| Blocked | `danger` | `#FF6B5C` | Rejected, policy-blocked or failure state |

### Non-negotiable use rules

1. Use one signal-green primary action per screen.
2. Pair status color with an icon and explicit label such as `Policy approved`; color alone is never meaning.
3. Keep purple, warm paper/cream, gradients, and sportsbook-style odds cards out of the product.
4. Use the bright green on a dark surface; do not turn the whole app neon.

## Screen map

| Screen | Purpose | The moment that matters |
| --- | --- | --- |
| The Market | Live paper market overview | An operator sees the agent’s thesis, evidence count and proposed action at a glance. |
| The Dossier | Decision explanation | An operator can trace evidence → proposal → policy check → paper order without trusting a black box. |
| Replay Proof | Post-resolution evaluation | An operator sees whether a run was useful, calibrated and reproducible. |

The editable Figma file contains all three screens plus `00 — Stealth Signal / Color System`, the visual palette board. See [mockup handoff](mockups/README.md) for direct frame links and build notes.

## Build decisions

- **Desktop first:** command-center layout at 1440px. On smaller screens, preserve current market and decision status first; move secondary trace detail below the fold.
- **Typography:** Inter for interface and narrative; a monospace face only for trace IDs, prices, fixture IDs and event time.
- **Shape:** 16px cards, 999px pills only for compact statuses/filters, 1px low-contrast borders, no elevation shadows.
- **Charts:** signal green only marks the selected thesis/current decision; steel is reference. Every chart needs labels and a text alternative/data-table path.
- **Motion:** 150–220ms state transitions only. Respect reduced motion.

## Acceptance check before implementation

- [ ] A new user can identify the current NBA fixture, the agent’s thesis and whether policy accepted it in under 10 seconds.
- [ ] A reviewer can reach original evidence and the policy trace from every paper order.
- [ ] Signal green appears only for primary intent, selection or the currently active thesis.
- [ ] All essential copy and actions meet WCAG AA contrast; status has text and icon support.
- [ ] No UI metaphor suggests real-money betting or financial advice.
