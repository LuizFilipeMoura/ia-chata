# V2 Phase H — Battlefield (Field Map + Field Controls)

**Date:** 2026-07-11 · **Status:** Approved · **Depends on:** Phase E (V2 Drawer for the set-field sheet). See overview.

## Goal

Native V2 battlefield: the blueprint **FieldMap** SVG and the owner's **FieldControls** (set field:
dimensions, flip diagonal, re-roll terrain, lock). The mockup has no field design, so this is designed
fresh in the dieselpunk system while matching V1's data + behavior.

## Replaces

`components/FieldMap.tsx` (171 lines), `components/FieldControls.tsx` (115 lines) — for V2.

## Architecture / components

```
client/src/v2/
  battle/FieldMap.tsx        blueprint SVG: 12" grid, registration ticks, dimensions, deployment
                             triangles + quarter-circle deploy sectors ("You deploy"/"Enemy deploys"
                             from viewer perspective), terrain (rect/ellipse/poly: wood/building/crater/
                             ruin/barricade/rock/crate), objective markers (2VP centre bigger, 1VP corners).
  battle/FieldControls.tsx   renders FieldMap; owner-only "Set field" opens a V2 Drawer with width/height
                             inputs (FIELD_MIN/MAX), Flip diagonal, Re-roll terrain, Lock field. Non-owners
                             see "Waiting for the owner to set the field…".
  styles/field.css           .v2-root-scoped blueprint palette (oil/iron ink on dark), terrain fills, markers
```

- Reuse the shared `FieldState`/`TerrainPiece`/`Objective` types and the same field commands V1 sends
  (`field` set/flip/reroll/lock — read the exact verbs/attrs from V1 `FieldControls.tsx`). Behavior +
  geometry source is the V1 `FieldMap.tsx`/`FieldControls.tsx`.
- Deploy-zone perspective flips by `mySide` exactly as V1.
- The set-field sheet uses `useV2Drawer` (Phase E).

## Behavior

- `Squadron` renders `<FieldControls/>` when `started` (replacing the interim V1 import). Pre-lock, the
  owner sees the Set-field control; others see the waiting message. Locking enables Ready (Phase A gate
  already checks `field.locked`).

## Testing

- FieldMap renders the right number of objective markers + terrain pieces from a `FieldState`.
- FieldControls: owner sees "Set field"; non-owner sees the waiting message; Lock sends the lock command;
  Re-roll sends the reroll command; dimension inputs clamp to FIELD_MIN/MAX.

## Done when

`Squadron` imports the V2 `FieldControls`; no V2 code imports V1 `FieldMap`/`FieldControls`.
