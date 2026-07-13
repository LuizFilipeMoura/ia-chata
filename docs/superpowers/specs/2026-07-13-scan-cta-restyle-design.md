# Scan CTA Restyle — Design

**Date:** 2026-07-13
**Branch:** frontend/v2-redesign
**Scope:** CSS-only restyle of the pre-battle Scan launcher. No markup, JS, or token changes.

## Problem

The pre-battle Scan button (`.v2-scan-fab`) is a floating iron-gradient **pill** anchored `right:16px; bottom:16px`. It:

1. Overlaps the CMD DOCK's **Leave** button in the bottom-right corner.
2. Reads as a minor utility control, not the primary pre-battle action (Scan a chassis QR to commission a rig).
3. Uses round pill borders inconsistent with the rest of the metal UI.

## Decisions

- **Placement:** keep it floating/detached, but lift it clear of the dock (bottom-right, higher).
- **Prominence:** rectangular CTA with a pulse/glow to pull the eye pre-battle.
- **Color:** **oil (amber)**, NOT ember. In this design system ember (red) is the danger color — used by Leave and "Erase and leave", which sit in the same corner. A red Scan CTA beside a red destructive button reads as another danger control. Oil is the system's accent/CTA color and ships a ready-made token, `--v2-grad-oil-cta`.

## Component

- **Element:** `.v2-scan-fab`, rendered in `client/src/v2/V2Terminal.tsx:66` (pre-battle only, `!started`). No markup change.
- **Styles:** `client/src/v2/styles/forge.css:296` (`.v2-scan-fab` + `:hover`). Add a `@keyframes` for the pulse.

## Spec

### Position
- `right: 16px` (unchanged), `bottom: 84px` (was `16px`) — clears the dock bar and the Leave button.
- `z-index: 55` unchanged.

### Shape + fill
- `border-radius: 8px` (was `999px`).
- `background: var(--v2-grad-oil-cta)`.
- `border: 1px solid var(--v2-oil-edge)`; `border-bottom: 2px solid var(--v2-oil-deep)` (pressed-metal edge, matches dock buttons).
- `color: #1a0d0a` (dark ink on amber — matches the danger button's dark-on-fill contrast pattern).
- Keep stencil font. `font-weight: 700`, `letter-spacing: .12em`.

### Pulse / glow
- Idle amber glow via `box-shadow` using `--v2-oil-glow`.
- `@keyframes v2-scan-pulse` animating the glow ring between `--v2-oil-glow` and `--v2-oil-ring` (~2s ease-in-out infinite).
- Reduced-motion: no extra work — the global rule `@media (prefers-reduced-motion:reduce){.v2-root *{animation:none!important}}` at `tokens.css:67` already disables it.

### Hover
- `filter: brightness(1.06)`, slightly lifted shadow.

## Out of scope
- No markup / JS / token changes.
- No change to when the button shows (`!started` gate stays).
- No change to the Scan overlay itself (`ScanCommission`).

## Verification
- Pre-battle: Scan CTA sits above the dock, no overlap with Leave; amber, rectangular, pulsing.
- `started` state: button absent (unchanged behavior).
- Reduced-motion: pulse disabled, static glow.
