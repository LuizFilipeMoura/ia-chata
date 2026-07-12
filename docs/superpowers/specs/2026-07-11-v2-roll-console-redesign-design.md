# V2 RollConsole redesign — "Terminal Sibling"

**Date:** 2026-07-11
**Status:** Approved, ready for implementation
**Component:** `client/src/v2/overlays/RollConsole.tsx` + `client/src/v2/styles/overlay.css`

## Problem

The V2 dice-resolution console (`.v2-roll-console`) reads as "weird" against the rest
of the V2 dieselpunk system. Confirmed pain points:

1. **Floats flat / no depth.** `.v2-roll-console` declares a real drop shadow, but
   `animation: v2-glowpulse` rewrites `box-shadow` on every keyframe, so the shadow and
   bottom vignette never paint. The console never seats on the scrim.
2. **Frame fights itself.** An oil top edge (`--v2-oil-deep`), gray rivet side borders
   (`--v2-rivet`), and the animated amber ring are three competing border treatments.
3. **Cramped box-in-box.** The damage breakdown nests a panel inside the console inside
   per-term chip wells, at 400px width — dense and busy.
4. Fonts, spacing, and CSS overall feel off-system relative to calmer panels (Forge,
   Drawer, Rig Terminal).

The header hatch stripe is liked and must be kept.

## Chosen direction

**C1 — Terminal Sibling with labelled zones.** Make the console a literal sibling of the
Rig Control Terminal (`rig-terminal.css` / `RigTerminal.tsx`): same frame idiom, content
split into stacked labelled zones separated by 1px dividers, breakdown flattened to a
single inline equation in one sunken well. The two overlays should read as one family.

## Design

### Frame

- Base classes stay `v2-panel v2-panel--sharp` (composed from primitives, not
  reimplemented).
- Override `border-color: var(--v2-oil-ring)` so the whole outline is one unified amber
  frame — matches the glow, removes the oil-top / gray-side / animated-ring mismatch.
- **Depth fix:** keep a *static* deep drop shadow on `.v2-roll-console`'s `box-shadow`
  (`inset 0 1px 0 …, 0 26px 60px rgba(0,0,0,.75)`). Move the breathing glow to a
  `.v2-roll-console::after` ring overlay that animates **opacity** (`glowbreath`
  keyframes), so the animation never overwrites the seating shadow. New keyframes:
  ```css
  @keyframes v2-roll-glow { 0%,100% { opacity:.45 } 50% { opacity:1 } }
  ```
  The `::after` carries `inset 0 0 0 1px var(--v2-oil-ring)` and `pointer-events:none`.
- Corner rivets move from `::before`/`::after` to two real `<span>` elements
  (`.v2-roll-rivet` with `.l` / `.r`) so the pseudo-element is free for the glow overlay.
  Reuse the existing rivet-dot radial-gradient.
- Header (`.v2-roll-head`) kept verbatim, including the redline hatch background.
- Width `min(480px, 100%)` (up from 400px).

### Layout — stacked labelled zones

A repeating `.v2-roll-zone` block: `padding: 16px 20px`, `border-bottom: 1px solid
var(--v2-line)`; last zone drops the border. Each zone opens with a mono micro-label
`.v2-roll-zone-label` (`.62rem`, `.22em` letter-spacing, uppercase, `--v2-txt-faint`).
The action bar (`.v2-roll-action`) sits on `--v2-iron-950` with its own top border.

Zones per state:

| State                     | Zones (top → bottom)                                    |
|---------------------------|---------------------------------------------------------|
| Resolution + breakdown    | **Dice** · **Damage** · **Effects** · action (OK)       |
| Resolution, no breakdown  | **Dice** · **Result** (summary sentence) · **Effects** · action |
| Reaction reveal           | **Reaction** (flip-token) · **Effects** · action        |
| Manual dice entry         | **Enter dice** (input rows) · action (Confirm)          |
| Rolling (transient)       | **Dice** (flickering dice + "Rolling…"); later zones mount as data settles |

Zone labels are static strings chosen by state, not derived from data.

### Dice zone

Keep the current stamped-iron die tokens and all their behaviour unchanged: the
flicker→settle→land animation, `data-tone` glow rings (crit/ok/cool/miss), the per-die
verdict word (CRIT!/HIT!/FAILED!), and the die label. Dice were not flagged. They live
inside a `.v2-roll-zone` now, under a "Dice" label.

### Damage zone — flatten the box-in-box

Replace the nested `.v2-rx-break` panel + per-term `.v2-rx-term` chips with **one inline
mono equation** inside a single sunken well (`.v2-roll-strip`: `background: var(--v2-well)`,
`border: 1px solid var(--v2-well-line)`, `border-top: 1px solid var(--v2-line)`):

- Head row (`.v2-roll-strip-head`): actor → target on the left, weapon chip on the right,
  mono uppercase.
- Equation row (`.v2-roll-eq`): inline mono terms, e.g. `5 D6  +  3 Crit  +  2 AP  =  10`.
  Value numerals in `--v2-txt`; operators + unit labels in `--v2-txt-faint`; modifier
  terms in `--v2-oil-hi` (via a `mod` class/tone). One flat flex row, wraps if needed —
  no per-term boxes.
- Out row (`.v2-roll-out`): dashed top divider, a tier pill (`.v2-roll-tier`, tone-keyed:
  direct/severe/critical/none) and the SP hero: stencil number (`--v2-oil-hi`, glow) with
  a mono `SP → <location>` label.

The **Result** state (summary, no structured breakdown) reuses `.v2-roll-strip` to hold
the summary sentence, centered, no equation/out rows.

### Effects zone

Keep the ember log lines (`.v2-roll-effect`: mono, ember-hi, left ember border, glow,
staggered `v2-line-in` entrance). Now wrapped in an "Effects" zone.

### Reaction reveal

Keep the flip-token reveal (`.v2-rx-token` flip animation, tone faces brace/evasive/
return) and its label, wrapped in a "Reaction" zone. Followed by the Effects zone and
action bar. No dice, no damage zone.

### Manual dice-entry form

Wrap the form rows in an "Enter dice" zone. Keep sunken `.v2-well` number inputs and the
focus ring. The Confirm button moves into the action bar so every state ends with a
consistent action row.

### Type & spacing

One consistent scale across the console:
- Mono micro-labels: `.62rem`, `.22em`, uppercase, `--v2-txt-faint`.
- Stencil for die numerals, the header kind, and the SP hero number.
- Oswald (`--v2-disp`) for body text.
- Uniform zone padding (`16px 20px`) and internal gaps give the even rhythm that fixes
  the spacing complaint.

### Motion / accessibility

- `prefers-reduced-motion` branch preserved: dice shake/land, glow, line-in, and token
  flip all disabled, static end-states shown. The new `::after` glow overlay is covered
  by the existing `.v2-root *{animation:none!important}` reduced-motion rule in tokens.css
  and the local reduced-motion block.
- Dialog semantics unchanged (`role="dialog"`, `aria-modal`, `aria-label`, close button,
  scrim click-to-dismiss).

## Scope / constraints

- **Two files only:** rewrite the console section of `overlay.css` (lines ~39–347 plus the
  reaction/form/reduced-motion console blocks); rework `RollConsole.tsx` `render()`.
- The **imperative handle and all logic are unchanged**: `playResolution`, `promptDice`,
  `closeRoll`, timers, the flicker/settle RAF loop, the token flip, effect delays, OK
  reveal timing. Only JSX structure/classNames and CSS change. Breakdown JSX switches from
  term-chips to the inline equation.
- Drawer styles, reaction-picker styles, and every other part of `overlay.css` stay
  untouched.
- All rules stay scoped under `.v2-root` (guarded by `isolation.test.ts`).
- No `tokens.css` / `type.css` changes; reuse existing `--v2-*` tokens and `--v2-text-*`
  scale.

## Verification

- Visual: run the app, trigger each state (resolution with/without breakdown, reaction,
  manual entry, rolling) and confirm the console seats with real depth, one amber frame,
  flat single-level breakdown, even zone rhythm, hatch header intact.
- `isolation.test.ts` still passes (no leakage outside `.v2-root`).
- reduced-motion: static end-states render with no animation.

## Non-goals

- Not changing the RigTerminal's own latent glowpulse/box-shadow bug.
- Not altering dice roll timing, resolution data shape, or the provider/portal wiring.
- No new design tokens.
