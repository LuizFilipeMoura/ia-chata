# Equipment & Upgrade Audit

Balance and consistency findings across `EQUIPMENT`, `EQUIPMENT_UPGRADES`, and
`WEAPON_UPGRADES` (all in `shared/game-state.js`), plus the movement action costs
in `shared/rules.js`. Dated 2026-07-14. Findings ordered by impact.

## Movement cost baseline

- **Move**: 1 heat, 1 slot, moves 1× Speed (`ACTIONS.move`, `rules.js:11`).
- **Sprint**: 2 heat, 1 slot, moves 2× Speed — "move twice" (`game-state.js:2381`, `rules.js:12`).

Base game keeps Move relevant only because it matches Sprint's heat-per-inch
(1 heat / 1× vs 2 heat / 2×). Any change to Sprint's heat breaks that parity.

## 1. Servo Actuators makes Move obsolete (confirmed)

- Servo Actuators passive: Sprint costs **1** heat instead of 2 (`game-state.js:280`).
  Now Sprint = Move's heat (1) but double the distance. Move is dominated.
- Reinforced Servos (Field upgrade): Sprint costs **0** heat (`game-state.js:336`).
  Sprint is now strictly cheaper *and* farther than Move. Move is fully dead.

Already tracked as Task 8 (hide Move when Sprint dominates). Listed here as the
anchor case for the parity argument above.

## 2. Nature-tier inconsistency (violates the stated definition)

`NATURES` comment (`game-state.js:500-503`): Field = unconditional upside,
Tuned = conditional. But Armour Piercing ships:

- **Field** on Circular Saw (Tempered Teeth), Pressure Claw (Hardened Jaws)
- **Tuned** on Autocannon (AP Shells), Missile Barrage (Shaped Charges)

All four are unconditional perk grants. The two Tuned ones are miscategorized —
they belong at Field by the definition. Same effect at different natures
undermines the risk/reward slider the commission wizard sells. Reclassify the
unconditional AP grants to Field.

## 3. Picking Prototype/Tuned equipment often means picking nothing

Every Tuned and Prototype *equipment* upgrade ships `effect: {}` (TODO(mechanics),
`game-state.js:327-363`). Only the 8 Field rows have live effects today. The
commission wizard still lets a player choose a Prototype equipment upgrade and
receive flavor text with **zero** mechanical effect. Until the mechanics land,
either gate those choices, label them clearly as inert, or ship the effects.

## 4. Read-model mixes staleness semantics (code risk)

`rigEffects` (`game-state.js:416-451`) resolves modifiers two different ways:

- Sprint heat re-derives **live** from the catalog via `equipmentSprintHeat` (line 424).
- `thermalMargin`, `hardenImpact`, `sweetBandAcc`, `sideRearStr` read
  `rig.equipmentUpgradeEffect` **stamped at commission** (lines 429-441).

A post-commission catalog rebalance updates Sprint but freezes the stamped
values. One read-model, two resolution paths. Additionally, `equipmentActiveHeat`
warns (line 377) that any new heat-override tag must add its own branch "or it
drifts silently" — and `sprintHeat` already lives in a *separate* function, so
the two override paths can desync. Pick one resolution strategy (prefer stamped
everywhere, or catalog everywhere) and route all overrides through it.

## Suggested follow-ups

1. Hide/disable Move when Sprint dominates (Task 8) — already planned.
2. Reclassify unconditional Armour Piercing grants from Tuned to Field (finding 2).
3. Gate or label inert Prototype/Tuned equipment upgrades (finding 3).
4. Unify `rigEffects` resolution to a single staleness model (finding 4).
