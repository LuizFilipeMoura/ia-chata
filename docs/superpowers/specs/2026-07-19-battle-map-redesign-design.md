# Battle Map Redesign — Declutter + Drag-to-Move

**Date:** 2026-07-19
**Surface:** V2 digital battle map (`aria-label="Battlefield"`)
**Scope:** Client rendering + interaction, plus one shared-side terrain-density tweak. No engine, bot, or combat changes.

## Problem

The in-battle map reads as noise: too many terrain pieces, and movement is a tap-to-place-then-aim flow that doesn't feel like a real game. Goal: fewer, cleaner objects and a direct drag-to-move interaction.

## Decisions (from brainstorming)

1. **Rectangles only** — terrain only. Objectives and rig tokens keep their circles.
2. **Half the terrain** — reduce density at the scatter source so the engine agrees with what's drawn.
3. **Drag & aim** — grab the token, drag it; facing tracks the drag heading; then a handle re-aims after release; Confirm commits.
4. **Nested rings** — inner ring = move, outer band = sprint; drop distance auto-picks the action.
5. **Clamp to edge** — the ghost never overshoots reach or enters blocking terrain.

## Design

### 1. Declutter

**Rect-only render.** The battle map draws every terrain piece as a plain rectangle. Digital fields already scatter rects (`game-state.js:1671` calls `scatterTerrain(..., { digital: true })`), so this is primarily defensive: any non-rect shape (poly/ellipse, which only reach the map from the physical set-field path) is drawn as its axis-aligned bounding-box rect instead of a blob.

- `FieldFurniture` gains a `rectOnly?: boolean` prop.
- When `rectOnly` is set, a `poly` piece renders as the rect enclosing its points (min/max of `points` × scale, centered on `cx,cy`), an `ellipse` as the rect `2·rx × 2·ry`. Existing `rect` pieces are unchanged.
- The battle `BattleMap` passes `rectOnly`. The pre-battle physical `FieldMap` preview does **not** — real-table planning keeps organic blobs.

**Halve the count — at the source.** In `scatterTerrain`'s digital branch (`shared/field.js`), reduce the per-kind rolled count by roughly half again before the 180° mirror. Rationale: the engine's 3-ray cover model and pathfinding read the same `field.terrain`; halving only at render would show the player fewer pieces than the engine adjudicates. Reducing at the source keeps render and engine honest. The mirror and determinism are preserved (a rect is centrally symmetric; the halved scatter is still mirrored and seed-deterministic). Physical (non-digital) scatter is untouched.

Objectives and rig tokens remain circles.

### 2. Drag-to-move interaction

Replaces tap-to-place in `MoveTargetLayer`. Only the **active rig** on the current player's turn is draggable; all other tokens remain click-to-select / click-to-activate.

**Rings.** On grab, draw two concentric reach rings from the rig's current position:
- inner radius = `moveBudget(rig, "move") · scale`
- outer radius = `moveBudget(rig, "sprint") · scale`
The band between them is the sprint zone.

**Drag.** Pointer-down on the active rig token starts a drag session; a ghost token follows the cursor. Live while dragging:
- Routed path via existing `computeMovePreview(field, rigs, rig, action, dest)` (reroutes around terrain).
- Readout: distance (″), pivot (°), heat (`+1🔥` move / `+2🔥` sprint), all live.
- Ghost facing auto-tracks the drag heading, clamped to ±90° pivot from the rig's start facing (`clampToPivot`).

**Action selection.** The `action` used for the preview/dispatch is derived from the ghost's current distance from origin:
- inside the inner (move) ring → `"move"`
- in the outer band → `"sprint"`
This is recomputed live as the ghost moves, so the ring the ghost sits in determines heat and budget.

**Clamp to edge.** The ghost never crosses the max reach for the active action, nor enters blocking terrain. If the raw cursor point is unreachable, the ghost is placed at the farthest reachable point along the origin→cursor line (binary search / walk against `computeMovePreview.reachable`). Result: every drop is a legal destination.

**Release → aim → confirm.** On pointer-up the ghost holds its clamped position. The existing facing handle appears; dragging it re-aims within the same ±90° budget, independent of the drag heading. The docked `MoveTargetControls` shows the live readout and Cancel / Confirm. Confirm dispatches the existing command:
```
action { name, action: <ring-derived move|sprint>, dest: placed.dest, facing: placed.facing }
```
No engine or wire change.

### 3. Components & data flow

| File | Change |
|------|--------|
| `shared/field.js` | Digital scatter density ÷2 (only shared-side change). |
| `client/src/v2/battle/FieldFurniture.tsx` | Add `rectOnly` prop; render any terrain shape as its bounding-box rect when set. |
| `client/src/v2/battle/MoveTargetLayer.tsx` | Token-drag session (grab/move/release) replacing tap-to-place; two nested rings; live clamp; auto move/sprint by ring; aim handle retained for post-release re-aim. |
| `client/src/v2/battle/BattleMap.tsx` | Active rig token starts the drag session on pointer-down; passes `rectOnly` to `FieldFurniture`. |
| `client/src/v2/battle/BattleScreen.tsx` | Action derived from drop ring instead of a pre-armed console choice; controls readout updated. |
| `client/src/v2/styles/field.css` | Nested-ring, ghost, and drag-state styles. |

Drag is pure client state (`placed`). The wire contract is unchanged; engine, bot, and combat are untouched.

### 4. Testing

- **field.js** — keep existing digital-scatter tests green (kinds, clearance, determinism, mirror). Add a relative assertion that the new density is lower than the prior roll for a fixed seed. No pinned counts (per the project's no-value-pinning rule).
- **FieldFurniture** — with `rectOnly`, a `poly` input renders a `<rect>` (not a `<polygon>`); an `ellipse` input renders a `<rect>`.
- **MoveTargetLayer** — dragging past the outer ring clamps to a reachable dest; a drop inside the inner ring selects `move`, in the outer band selects `sprint`; the aim handle re-aims within ±90°.
- **BattleScreen** — Confirm dispatches the ring-derived action with the placed dest + facing.

## Out of scope (YAGNI)

Movement animation/tweening, dragging non-active rigs, undo after Confirm, and touch-vs-mouse special casing (pointer events cover both).

## Risks

- **Density change touches shared code** on a branch with a concurrent committer — keep the `field.js` edit small and self-contained; never `git add -A`.
- **Clamp cost** — the reachable-point walk runs on pointermove; keep it a bounded binary search so drag stays smooth.
