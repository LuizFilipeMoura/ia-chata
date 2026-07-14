# Sprint heat floor — Reinforced Servos trades free sprint for reach

**Date:** 2026-07-14
**Status:** Approved, ready for planning

## Problem

Sprint can cost **0 heat**. `Reinforced Servos` (the Field upgrade of Servo
Actuators) sets `sprintHeat: 0`, so a Rig carrying it repositions every
activation for free.

Free repositioning is not a decision. The heat cost is the entire tradeoff that
makes Sprint interesting — spend heat now, carry the overheat risk into the rest
of the activation. At 0 heat there is nothing to weigh: you always Sprint, every
turn, forever. The action degenerates into a strictly-better Move.

**Sprint must never cost 0 heat.**

## Non-goals

- Reworking base Servo Actuators (stays 1 heat).
- Touching the overheat roll, thermal margin, or any Cooling/Power upgrade.
- Changing Sprint's action-slot cost, the 3-action budget, or the Move-hide rule.
- Rebalancing the other two servo-actuators upgrades (Kickstart Pistons,
  Grapnel Launcher).

## Design

### The floor

`equipmentSprintHeat` clamps its result to a minimum of **1**. This is a hard
floor at the single chokepoint every Sprint heat path already flows through
(`performAction` at `game-state.js:2675`, the picker chip via `rigEffects`, and
the Move drawer). No future upgrade can re-introduce a 0-heat Sprint without
deliberately removing the clamp.

### Reinforced Servos' new identity — reach, not discount

Zeroing the heat was the upgrade's whole value, so removing it leaves the Field
slot empty. It cannot simply become "1 heat" — that is identical to base Servo
Actuators, a dead upgrade.

Instead the upgrade sharpens the number it already owns: **Sprint reach**.

| Loadout | Sprint heat | Sprint reach |
|---|---|---|
| No servos | 2 | 1½× Speed |
| Servo Actuators | 1 | 1½× Speed |
| Servo Actuators + Reinforced Servos | **1** (was 0) | **2× Speed** (was 1½×) |

The heat cost stays on every tier, so the positioning decision survives. The
upgrade pays out in distance instead of discount.

This mirrors the established Field-upgrade grammar — `Twin Radiators` reads
"Purge vents −3, not −2". Same "sharpen the number you already have" shape, same
tag phrasing.

**Rejected alternative:** no-overheat Sprint (Sprint costs 1 but never triggers
the overheat D12). It removes a *different* cost, re-creating the same
consequence-free Sprint this spec closes, and it entangles with Blast Furnace
Core, Meltdown Protocol, and Reactor Overdrive.

### Collapsing the `1.5` drift

The 1½× multiplier is currently hardcoded in **three** client sites:

- `client/src/v2/battle/MoveBody.tsx:27`
- `client/src/v2/overlays/RigTerminal.tsx:51`
- `client/src/state/BattleActionsContext.tsx:77` (V1)

Making reach an upgrade-dependent value turns that triplication into a real
drift hazard. Per the `rigEffects` read-model convention, resolution belongs in
one shared helper and the clients render it.

- New atomic helper `equipmentSprintMult(equipmentId, equipmentUpgradeId)` in
  `shared/game-state.js`, alongside `equipmentSprintHeat`. Returns the
  `sprintMult` effect off the catalog entry, else `1.5`.
- Surfaced as `rigEffects(rig).sprintMult`, a pre-resolved final value.
- All three client sites read `rigEffects(rig).sprintMult`. `RigTerminal`
  already calls `rigEffects` one line above its hardcoded `1.5`.

Rounding stays where it is (`Math.round`, whole inches) so table measuring stays
clean: at Speed 8, reinforced Sprint is 16" vs 12".

### Verified non-interactions

- **Move-hide rule** (`battle-view.js:130`) hides Move when
  `sprint.heat <= move.heat` (1). Base Servo Actuators is *already* 1, so Move is
  already hidden for both servo tiers today. The 0→1 floor does not regress it,
  and the reach buff only deepens Move's dominance. **No change.**
- **Cold kinds** (Tank/Walker) are refused Sprint outright before any heat is
  read (`game-state.js:2652`). Unaffected.
- **Kickstart Pistons** arms `chargedIntoContact` off the Sprint path, not off
  its heat. Unaffected.

## Changes

**`shared/rules.js`**
- `reinforced-servos`: effect `{ sprintHeat: 0 }` → `{ sprintMult: 2 }`
- tag: `"Sprint costs 0 heat"` → `"Sprint reaches 2× Speed, not 1½×"`
  (tag is rendered verbatim by many surfaces — replace it, never trim it)

**`shared/game-state.js`**
- `equipmentSprintHeat`: clamp to `Math.max(1, …)`; servos branch returns a flat
  `1`; update the stale comment naming the 0-heat override
- new `equipmentSprintMult(equipmentId, equipmentUpgradeId)`
- `rigEffects`: add `sprintMult`
- update the Sprint comment at `2673-2674`

**Clients**
- `MoveBody.tsx`, `RigTerminal.tsx`, `BattleActionsContext.tsx` — read
  `rigEffects(rig).sprintMult`, drop the hardcoded `1.5`, fix the comments that
  claim Reinforced Servos → 0 heat

**`rules.md`**
- §5:155 (Sprint reach + heat), §6 table:205, equipment ladder:544,
  tuning-notes:655

## Testing

Flip existing:
- `game-state.test.js:2029` — `equipmentSprintHeat("servo-actuators",
  "reinforced-servos")` `0` → `1`; rename the test off "zeroes"
- `game-state.test.js:2732` — the pipeline test asserting a 0-heat Sprint
- `battle-view.test.js:70-74` — chips: bare 2, servo 1, reinforced **1**

Add:
- `equipmentSprintHeat` never returns below 1, including a synthetic
  `sprintHeat: 0` catalog entry (the clamp is the guarantee, prove it)
- `equipmentSprintMult`: `1.5` bare, `1.5` base servos, `2` reinforced
- `rigEffects(rig).sprintMult` matches the helper across all three tiers
- pipeline: a Reinforced Servos Sprint adds exactly 1 heat via `performAction`
- `MoveBody` renders 16" for a Speed-8 reinforced Rig, 12" for base servos

## Risks

- **Stale saves** carry `equipmentUpgrade: "reinforced-servos"` with the old
  effect meaning. No migration needed — effects resolve live from the catalog,
  never off a stamp on the rig (`rigEffects` reads `EQUIPMENT_UPGRADES` each
  call). A pre-existing save silently gains reach and loses the free Sprint,
  which is the intended balance change.
- **Power delta.** 2× Speed at 1 heat is a real buff to reach; the free Sprint it
  replaces was a real buff to heat economy. Net is a playtest question, flagged
  not solved. The floor is the non-negotiable part.
