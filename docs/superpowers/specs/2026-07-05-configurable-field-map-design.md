# Configurable Field Map — Design Spec

**Date:** 2026-07-05
**Author:** Luiz (with Claude)
**Status:** Draft — awaiting review

## Purpose

Today the battlefield is fixed at the rulebook's 54″×36″ table (`rules.md` §10–11) and
the app doesn't model it at all: `game.objectives` is an empty array that is never
populated, and there is no terrain or spatial data anywhere.

This feature makes the field **configurable per room**. The first player to join a room
(the **owner**) sets the table dimensions in inches; the app then derives a battlefield
map — deployment halves, objective markers, and scattered terrain — and renders it
on-screen for both players. Both players see one canonical, server-authoritative map.

## Vision (agreed with user)

- Field size is a **room-level setting** the owner sets on joining.
- The app **places the environment (terrain) and the points (objectives)** from the
  dimensions; the owner only supplies the size (plus a re-roll and a diagonal flip).
- The map is **rendered on screen** so the owner (and enemy) can see it and mirror it on
  their physical table.
- Objectives are **deterministic**; terrain **auto-scatters** and the owner can
  **re-roll** it until happy, then **lock** the field.

## Decisions

1. **Owner = first player to claim the room.** `JoinGate` lets a player pick side A *or*
   B, so ownership is *not* tied to a side — it is whoever claims first.
2. **Ready is gated on a locked field.** Neither side can mark Ready until the owner locks
   the field. This enforces the "ask the first player" setup flow.
3. **Proportional placement.** Objective distance and the deployment setback scale with
   table size rather than using literal rulebook inches, so small tables aren't cramped
   and objectives never fall inside a deployment zone.
4. **Server-authoritative terrain.** Terrain is scattered on the server with the existing
   injectable RNG, so both players receive identical positions.
5. **Reuse `game.objectives`.** The existing (empty, already-serialized) array holds the
   computed objective markers.

## Out of scope

- Placing **Rigs** on the map — the app tracks Rig state, not board position. The map is a
  static terrain/objective reference, not a virtual tabletop.
- Deployment variants (Pitched / Ambush, `rules.md` §10) — the map models the default
  diagonal deployment only. Variants noted for a future iteration.
- Editing objectives directly (they are deterministic). Owner controls are limited to
  dimensions, diagonal flip, terrain re-roll, and lock.
- Non-inch units (cm). Inches only, matching the rulebook and the user's request.

---

## Placement math

All coordinates are in **inches**, origin `(0,0)` at the top-left corner of the field,
`x` increasing right, `y` increasing down. `W` = width, `H` = height.

### Diagonal & corners

The **no-deploy diagonal** connects two opposite corners; its endpoints are the two
**empty corners** (no one deploys there — objectives sit toward them). The other two
corners are the **deployment corners**.

- `diagonal: "tlbr"` → empty corners = TL `(0,0)` and BR `(W,H)`; deployment corners =
  TR `(W,0)` and BL `(0,H)`.
- `diagonal: "trbl"` → empty corners = TR `(W,0)` and BL `(0,H)`; deployment corners =
  TL `(0,0)` and BR `(W,H)`.

The owner's half is the triangle containing **their** deployment corner; the enemy's half
is the opposite triangle. Which deployment corner belongs to the owner is fixed by
convention (owner = the corner nearest the top-right of their two options); the *flip
diagonal* toggle swaps `diagonal` between the two values, which is the meaningful choice
the rulebook grants the terrain-roll-off winner (§10.2).

### Objectives (deterministic)

Centre marker: `{ x: W/2, y: H/2, vp: 2 }`.

Reference fraction from the rulebook's 54×36 table, where 1-VP markers sit 18″ from
centre:

```
REF_FRACTION = 18 / halfDiag(54, 36)
             = 18 / sqrt(27² + 18²)
             = 18 / 32.4499…
             ≈ 0.5547
```

For the two empty corners `C`, each 1-VP marker is:

```
marker = center + REF_FRACTION · (C − center)
```

i.e. `{ x: cx + f·(Cx − cx), y: cy + f·(Cy − cy), vp: 1 }` with `f = REF_FRACTION`,
`center = (W/2, H/2)`. This keeps objectives at the same *relative* spot (~55% of the way
from centre to the empty corners) on any table size.

### Deployment setback

Each player deploys within their triangular half, no closer than a **setback** band to the
diagonal. The rulebook uses 4″ on the 54×36 table; scale it proportionally:

```
setback = 4 · (halfDiag(W, H) / halfDiag(54, 36))
```

The map shades each half and draws the setback as an inset band along the diagonal. (The
setback is a visual/reference guide; the app does not enforce Rig positions.)

### Terrain scatter (server-authoritative, re-rollable)

- **Count:** random integer in `[4, 6]` (rulebook §10.1).
- **Region:** the central band of the field — reject candidates within
  `objClearance = 0.12·halfDiag(W,H)` of any objective, and within a deployment-corner
  keep-out radius so terrain doesn't smother a start zone.
- **Placement:** rejection-sample points uniformly inside the field, discarding those that
  violate the clearances above or land within `minTerrainGap` of an already-placed piece;
  cap attempts and accept fewer pieces if the field is too small to fit the target count
  (log/return the count actually placed — never silently claim 6 when 4 fit).
- **Size:** each piece gets a `size` of `"sm" | "md"` (random), for display only.
- **RNG:** use the existing injectable `random` (as `rollD` does) so tests are
  deterministic and both clients receive the same server-generated array.

Re-roll regenerates **terrain only**; objectives are untouched.

### Bounds & validation

- `width`: integer, clamped to `[24, 96]`. `height`: integer, clamped to `[18, 72]`.
  (min table `24×18`, max `96×72`.) Either orientation allowed within those ranges.
- Invalid / out-of-range dimensions are clamped, not rejected.

---

## Data model

Additions to the room (`shared/game-state.js`):

```js
room.ownerSide: "a" | "b" | null      // first side to claim the room
room.field: {
  width: number,                       // inches
  height: number,                      // inches
  diagonal: "tlbr" | "trbl",
  terrain: [{ x, y, size }],           // inches; size "sm" | "md"; re-rollable
  locked: boolean,
}
```

Objectives reuse the existing array, populated on `set`:

```js
room.game.objectives: [{ x, y, vp }]   // inches
```

- `createRoom` seeds `ownerSide: null` and a default `field` (54×36, `diagonal: "tlbr"`,
  `terrain: []`, `locked: false`) with objectives computed for 54×36 (so an
  unconfigured room still renders something sensible).
- `ensureGameShape` back-fills `ownerSide` and `field` for older rooms.
- `publicState` already serializes `game.objectives`; extend it to include `field` and
  `ownerSide`.

## Command

New `field` verb in `applyCommand`, alongside `setdice` / `ready`. **Owner-only**
(`normalizeSide(context.side) === room.ownerSide`) and **pre-start only**
(`!room.game.started`); otherwise a no-op.

`attrs.action`:

- `"set"` — read `width`, `height`, optional `diagonal`; clamp; recompute
  `game.objectives` **and** re-scatter `field.terrain`. Ignored if `field.locked`.
- `"reroll"` — re-scatter `field.terrain` only. Ignored if `field.locked`.
- `"lock"` — set `field.locked = true`. (A future `"unlock"` could clear it; not in v1.)

Setting `ownerSide`: in `claimSide`, when the claim succeeds and `room.ownerSide` is null,
set `room.ownerSide` to the claimed side.

Ready gate: in the `ready` verb, additionally require `room.field.locked === true`.

## Rendering

- **New `client/src/components/FieldMap.tsx`** — SVG top-down map: field rectangle scaled
  to `width`×`height`, the two shaded deployment halves split by the dashed no-deploy
  diagonal, the setback band, three objective markers (centre = 2 VP emphasized), and the
  terrain pieces. Inch→pixel scaling from `field.width/height`. Dark-mode safe, matches the
  terminal design tokens.
- **Owner controls** (owner + not started): width/height number inputs, *flip diagonal*,
  *re-roll terrain*, *Lock field* — each dispatches the `field` command.
- **Enemy / post-lock view:** read-only map; before the owner has locked, a
  "waiting for the owner to set the field" state.
- **Placement in the shell:** render in `Stage` during setup (near `BattleSetup`). After
  lock/start it remains viewable as a read-only reference.
- **`BattleSetup`:** reflect the gate — when `!field.locked`, the Ready button shows a
  hint ("Owner must lock the field first") and stays disabled.

## Shared placement module

New pure `shared/field.js` (no imports from `game-state.js`), unit-tested:

- `halfDiag(w, h)`
- `computeObjectives(field)` → `[{x,y,vp}]`
- `scatterTerrain(field, random)` → `[{x,y,size}]`
- `emptyCorners(field)` / `deploymentCorners(field)` helpers
- `clampDimensions(w, h)` → `{ width, height }`

`game-state.js` imports these; `FieldMap.tsx` imports the pure geometry helpers it needs
(corners, scaling) so the client and server agree on layout.

## Testing

- **Unit (`shared/field.test.js`):** objective fractions (centre exact; 1-VP markers at
  `REF_FRACTION` toward each empty corner for several table sizes); terrain count in
  `[4,6]`, every piece inside the field and clear of objectives/corners, deterministic
  under a seeded RNG; `clampDimensions` bounds; diagonal flip swaps corner sets.
- **Unit (`shared/game-state.test.js`):** `field` command is owner-only and pre-start;
  `set` recomputes objectives + terrain; `reroll` changes only terrain; `lock` enables
  Ready; a non-owner or post-start `field` command is a no-op; `claimSide` sets
  `ownerSide` once.
- **Component:** `FieldMap.test.tsx` renders three objective markers and 4–6 terrain nodes
  for a given field; owner sees controls, enemy does not.
- **Regression:** existing `npm test` (Vitest + `node --test`) stays green.
- **Visual:** verify the rendered map against the mock in the preview server.

## Open decisions for review

1. **Owner controls placement** — inline in `Stage` under `BattleSetup` (this spec), or a
   dedicated setup overlay/drawer? Inline is simpler and keeps the map always visible.
2. **Default field for an unconfigured room** — render the 54×36 default immediately
   (this spec), or show an empty "not set yet" state until the owner sets it?
3. **Diagonal flip** — keep as an owner toggle (this spec), or drop it for v1 and always
   use `"tlbr"`?
