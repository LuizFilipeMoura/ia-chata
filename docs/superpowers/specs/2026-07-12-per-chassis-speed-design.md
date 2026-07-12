# Per-Chassis Speed

**Date:** 2026-07-12
**Status:** Approved, pending implementation plan
**Branch:** frontend/v2-redesign

## Problem

Speed is currently derived solely from weight class via a lookup map
(`SPEED = { light: 5, medium: 4, heavy: 3, colossal: 2 }`) duplicated in
`client/src/v2/battle/constants.ts` and `client/src/state/BattleActionsContext.tsx`.
Every light rig moves 5", every medium 4", regardless of the chassis's gameplay
focus. A short-range brawler and a long-range artillery piece of the same weight
move identically, even though their roles demand different tempo.

Speed should be a per-chassis stat, tuned so each chassis's mobility reinforces
its intended role — while preserving the weight ladder (light faster than medium).

## Measurement context (why the numbers land where they do)

All table measurement is **edge-to-edge (nearest gap between base rims)**:

- **Range** = nearest-edge gap = `C - r_shooter - r_target` (C = center distance).
  The engine works entirely in this gap frame: players feed the measured gap as
  `opts.distance`, compared against the weapon's `minRange`/`maxRange`. Internally
  consistent — no code change needed for range.
- **Movement** = front rim (start) to back rim (finish) of the moving base.
  Geometry: `measured = travel - diameter`, so **actual center travel = S + D**
  (D = base diameter). A move over-covers the printed Speed by one base diameter.

Base sizes (physical, fixed): **light = 60mm (2.36")**, **medium = 75mm (2.95")**.

Consequence: real per-move center travel = `S + D`. Bigger bases refund more
movement, so the raw Speed ladder compresses at the table. The chosen numbers
below account for this — the real-travel column keeps the ladder intact.

## Decision: reinforce weight

Speed reinforces the weight ladder as a **hard rule**: light strictly faster than
medium. Bands do not overlap. Within a band, role tunes the value — brawlers /
short-range take the top of the band (they must close), long-range / static
chassis take the floor (they hold and shoot).

- Light band: **5–6**
- Medium band: **3–4**

Medium ceiling (4) < light floor (5), so "light > medium" can never break.

Speeds are whole inches (house rule: clean tabletop measuring).

## Speed table

| Chassis | Class | Gun (max) | Role | Speed | Real travel (S+D) | Sprint (round 1.5×) |
|---|---|---|---|---|---|---|
| Rivet · Pressure Claw | light | 14 | ultra-brawler | 6 | 8.36" | 9" |
| Saw · Mini Gun | light | 18 | close dakka | 6 | 8.36" | 9" |
| Wrecking Ball · Double MG | light | 20 | suppress brawler | 6 | 8.36" | 9" |
| Claw · Autocannon | light | 26 | mid skirmisher | 5 | 7.36" | 8" |
| Harpoon · Anchor | light | 22 | grappler | 5 | 7.36" | 8" |
| Sword · Arc Gun | light | 32 | glass sniper | 5 | 7.36" | 8" |
| Missile · Flamethrower | light | 34 | bombardier | 5 | 7.36" | 8" |
| Crossbow · Talon | medium | 24 | mobile hunter | 4 | 6.95" | 6" |
| Sniper · Chainsaw | medium | 28 | marksman | 4 | 6.95" | 6" |
| Lance · Mortar | medium | 34 | artillery | 3 | 5.95" | 5" |
| Bulwark · Siege | medium | 16 | anvil wall | 3 | 5.95" | 5" |

### Rationale per assignment

- **Short-gun chassis move faster** to pay for their reach deficit; the big guns
  stay planted. Speed and range trade off within the weight-ladder constraint.
- **Close-in lights → 6** (Rivet, Saw, Wrecking Ball): must hug the target.
- **Mid/long lights → 5** (Claw, Harpoon, Sword, Missile): cannot drop to 4 — the
  floor guards the weight ladder. Their reach or tools (grapple, long gun) carry
  them; legs stay baseline.
- **Skirmish mediums → 4** (Crossbow mobile hunter, Sniper repositioning marksman):
  top of the medium band, keep their maneuver identity.
- **Static mediums → 3** (Mortar artillery, Siege anvil): both want to hold ground
  and shoot / wall; low legs match. Siege's high SP + shield make the anvil; Mortar
  is indirect artillery.

### Ladder check (real travel)

`8.36" (light-6) > 7.36" (light-5) > 6.95" (medium-4) > 5.95" (medium-3)`.

Even after the base-size movement refund, every step is monotonic and the light
tier stays strictly above the medium tier.

## Implementation touch-points

1. **`shared/game-state.js`**
   - Add a `speed` field to each of the 11 `CHASSIS` entries (values from table).
   - In `makeRig`, set `rig.speed` from the resolved chassis speed (same path the
     per-chassis `sp` override already uses). Server-authoritative.

2. **`client/src/state/types.ts`**
   - Add `speed?: number` to the `Rig` type.

3. **`client/src/v2/battle/constants.ts`** and **`client/src/v2/battle/MoveBody.tsx`**
   - Read `rig.speed ?? SPEED[rig.weightClass]`. Keep the `SPEED` map as fallback.

4. **`client/src/state/BattleActionsContext.tsx`** (v1 MoveBody duplicate)
   - Same `rig.speed ?? SPEED[...]` change.

5. **`shared/game-state.test.js`**
   - Assert every chassis has a numeric `speed`.
   - Assert bands non-overlapping (max medium < min light).
   - Assert `makeRig` propagates `speed` to `rig.speed`.

## Non-goals / notes

- **Range math unchanged.** The engine already works in the edge-gap frame; this
  change touches movement Speed only.
- **Movement convention unchanged.** We are not altering how movement is measured
  (still front-rim → back-rim, i.e. real travel = S + D). The Speed values are
  tuned with that convention in mind.
- **Heavy / colossal** remain in the fallback `SPEED` map only — no such chassis
  exist yet.
- **Support units** (tank/walker) keep their own `speed` on `unit-kinds.js`
  (tank 3, walker 4); this change does not touch that path.
- The `SPEED`-by-class map is intentionally retained as a fallback rather than
  deleted, so any rig lacking `speed` (old save, unforeseen path) still moves.
