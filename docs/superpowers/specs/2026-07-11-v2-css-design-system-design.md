# V2 CSS Design System — Design Spec

**Date:** 2026-07-11
**Scope:** `client/src/v2/styles/*` and v2 component `.tsx` files only. V1 styles (`client/src/styles/*`) untouched.

## Problem

v2 CSS is ~3339 lines across 12 files with ~32% (~1060 lines) boilerplate mapping onto ~16 repeated patterns. Same visual concepts (panel surface, scrim, mono eyebrow label, CTA button, sunken well, selected-option field, lamp dot) are re-implemented per file with divergent hardcoded values. No token layer exists for radius, spacing/duration, shadow, bevel, glow-alpha, well/edge surfaces, or CTA gradients — that gap drives the duplication.

## Goals

1. Single source of truth for every repeated pattern (tokens + shared classes).
2. No duplicated CSS across v2.
3. All colors/shadows/durations/radii reference `--v2-*` tokens, never raw literals in component files.
4. Resolve inconsistencies by picking one canonical value per pattern (consistency prioritized over preserving exact current pixels).
5. Cut v2 CSS ~30–35% (~3339 → ~2100–2300 lines).

## Decisions (locked)

- **Refactor reach:** full — introduce shared classes AND apply them in TSX, dropping per-component duplicates.
- **Visual drift:** unify freely — one canonical value per pattern; minor visual shifts are acceptable and desired.
- **Scope:** v2 only. V1 keeps its separate token system.
- **File org:** layered — `tokens.css` (expanded) → `primitives.css` (new shared classes) → component files (unique structure only).

## Architecture

Three layers, imported in order:

```
tokens.css      expanded design tokens (--v2-*)
primitives.css  shared, reusable classes built on tokens
<component>.css  ONLY structure unique to that component
```

Component `.tsx` files apply primitive classes in JSX and keep unique structural classes for component-specific layout.

### Layer 1 — tokens.css (expand existing)

Existing palette kept. Add:

**Surfaces / lines / edges**
- `--v2-well:#0a0d11`
- `--v2-well-deep:#07090c`
- `--v2-well-line:#000`
- `--v2-edge-dark:#05070a`
- Replace literal `#12161d` occurrences with `var(--v2-iron-850)`.

**Gradients (single source of truth)**
- `--v2-surface: linear-gradient(180deg,var(--v2-iron-850),var(--v2-iron-900))` — canonical panel surface. Retires the `iron-800→900` variant.
- `--v2-grad-oil-cta: linear-gradient(180deg,#f0a94a,#c47a26)`
- `--v2-grad-ember-cta: linear-gradient(180deg,#f0663f,#b8351f)`
- `--v2-grad-ember-well: linear-gradient(180deg,#26170f,#160c07)`
- `--v2-grad-green-well: linear-gradient(180deg,#1c2a1c,#0d160d)`
- `--v2-grad-oil-sel: linear-gradient(180deg,#241a0d,#1a1207)` — canonical selected-amber (retires `#160f06` variant).
- `--v2-grad-badge: conic-gradient(from 20deg,#2a1c0c,#5a3c14,#2a1c0c)`
- `--v2-rivet-dot: radial-gradient(circle at 40% 35%,#69727f,#20252e 60%,rgba(0,0,0,.7))`

**Accents**
- `--v2-oil-lite:#ffcf82`
- `--v2-oil-edge:#7c4d14`
- `--v2-ember-lite:#ff8a6a`
- `--v2-on-oil:#1a1206` (text color on oil buttons)
- `--v2-verdigris:#2f5c33`

**Canonical alphas** (replace ad-hoc per-use values)
- `--v2-oil-wash: rgba(231,154,61,.1)`
- `--v2-oil-ring: rgba(231,154,61,.4)`
- `--v2-oil-glow: rgba(231,154,61,.3)`
- `--v2-ember-wash: rgba(229,83,58,.12)`
- `--v2-ember-glow: rgba(229,83,58,.3)`
- `--v2-ok-wash: rgba(108,196,127,.12)`
- `--v2-ok-glow: rgba(108,196,127,.3)`
- `--v2-bevel-top: inset 0 1px 0 rgba(255,255,255,.05)` — unifies .03/.04/.05/.08 top-highlights.

**Scrim / motion / shape**
- `--v2-scrim: rgba(5,7,10,.72)` — one dark wash for all dimming.
- `--v2-scrim-oil: radial-gradient(80% 60% at 50% 18%,var(--v2-oil-wash),transparent 70%), var(--v2-scrim)`
- `--v2-scrim-ember: radial-gradient(80% 60% at 50% 18%,var(--v2-ember-wash),transparent 70%), var(--v2-scrim)`
- `--v2-dur-fast:.14s`, `--v2-dur-slow:.25s` — unify 26 ad-hoc transitions.
- `--v2-r-sm:8px`, `--v2-r-card:14px`, `--v2-r-pill:999px`, `--v2-r-round:50%`
- `--v2-ls-eyebrow:.2em`, `--v2-ls-title:.1em`

### Layer 2 — primitives.css (new)

Shared classes, all built on tokens. Each replaces a duplicated pattern.

| Class | Modifiers | Purpose |
|---|---|---|
| `.v2-panel` | `--sharp`, `--round` | surface gradient + rivet border + `--v2-bevel-top` + drop shadow |
| `.v2-scrim` | `--oil`, `--ember` | fixed inset, grid place-items:center, scrim bg + `backdrop-filter:blur(2px)`; modifiers swap bloom |
| `.v2-eyebrow` | — | mono, uppercase, `--v2-ls-eyebrow`, `--v2-txt-faint`; font-size via local override where needed |
| `.v2-title` | — | stencil, weight 700, `--v2-ls-title`, drop text-shadow |
| `.v2-cta` | `--ember`, `:disabled` | oil CTA (gradient + oil-lite border + oil-edge bottom + on-oil text + oil-glow); ember variant; shared disabled |
| `.v2-well` | — | well-deep bg + well-line border + inset shadow |
| `.v2-field` | — | segmented option field wrapper (label + seg row) |
| `.v2-opt` | `.is-sel` | option tile + canonical oil selected state |
| `.v2-lamp` | `--v2-lamp-speed` var | pulsing dot (`v2-lampfast`), duration via var |
| `.v2-rivet` | — | corner rivet dot (`--v2-rivet-dot`) |
| `.v2-badge` | — | conic medallion (`--v2-grad-badge`) |
| `.v2-hazard` | `--red`, `--oil` | diagonal repeating stripe, colors/size via vars |
| `.v2-close` | — | canonical dialog close button (square, ember hover) |
| `.is-sel` | — | canonical oil selected card state (oil border + oil-wash bg + oil-ring inset + oil-glow) |
| `.v2-stack` | — | `display:flex;flex-direction:column;gap:var(--gap,.5rem)` |
| `.v2-row` | — | `display:flex;align-items:center;gap:var(--gap,.5rem)` |
| `.v2-center` | — | `display:grid;place-items:center` |
| `.v2-grid-2` / `.v2-grid-3` | — | `grid-template-columns:repeat(2|3,1fr)` |

### Layer 3 — component files

Each `<component>.css` retains ONLY structure with no equivalent elsewhere. Documented unique cores to keep:
- `field.css` — blueprint SVG map (`.v2-fm*`), legend
- `wizards.css` — range slider/band, dice preview, vpw list
- `chat.css` — message bubbles, markdown, think block, input/mic
- `forge.css` — step rail, chassis dossier, upgrade tree
- `squadron.css` — rigrow anatomy, heat bars, yard bands
- `rig-terminal.css` — comp-bar hatch, hit/heal anims, heat gauge
- `overlay.css` — dice tokens+anims, rx-break equation, flip coin
- `battle.css` — action-console deck, popover pointer, pips

Shared surface/scrim/label/button/well/bevel/lamp/rivet rules are deleted and replaced by primitive classes applied in the matching `.tsx`.

## Regression rules (enforce during and after)

1. No raw hex or rgba in component CSS — tokens only.
2. No new panel/scrim/button/label/well/lamp definitions — use a primitive or extend it.
3. Bevel, glow, scrim, duration, radius, letter-spacing = token, never inline literal.
4. `primitives.css` is the only place shared classes live.

## Migration plan (order = lowest → highest risk)

Verify in browser preview after each step; unify inconsistencies as encountered.

1. **Expand tokens.css.** No intended visual change except where inconsistencies collapse to canonical values.
2. **Create primitives.css**, import after tokens. No component uses it yet.
3. **Migrate small files:** shell, glossary, field, wizards, join — swap duplicated rules for primitives in CSS + TSX.
4. **Migrate mid files:** chat, forge, squadron.
5. **Migrate large files:** rig-terminal, overlay, battle.
6. **Sweep:** delete dead CSS; grep v2 for stray hex/rgba and ad-hoc transition/radius literals; confirm none remain outside tokens.css.

## Success criteria

- v2 CSS total ~2100–2300 lines (30–35% reduction).
- `grep` finds no raw hex/rgba in v2 component CSS (only in tokens.css).
- Every scrim, panel, CTA, eyebrow, well, lamp, selected-state renders from one shared definition.
- Browser preview: all v2 screens (join, forge, squadron, battle, rig terminal, overlays, wizards, chat, glossary) render without regression; unified values applied consistently.
