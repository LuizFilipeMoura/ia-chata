# Equipment Mechanics Rollout — Design

**Date:** 2026-07-14
**Status:** Approved, pending implementation plans

## Problem

Two findings from the [equipment & upgrade audit](../../design/equipment-upgrade-audit.md):

1. **Inert upgrades (audit finding 3).** Every Tuned and Prototype *equipment*
   upgrade ships `effect: {}` with a `TODO(mechanics)` marker
   (`shared/game-state.js:327-363`). Only the 8 Field rows do anything. The
   commission wizard lets a player pick a Prototype equipment upgrade and receive
   flavor text with zero mechanical effect. This is the deferred **Phase 2+** of
   the [equipment-depth design](2026-07-12-equipment-depth-nature-upgrades-design.md).
2. **Read-model mixes staleness semantics (audit finding 4).** `rigEffects`
   resolves some modifiers live from the catalog (`equipmentSprintHeat`) and
   others from a value stamped at commission (`rig.equipmentUpgradeEffect`). One
   read-model, two resolution paths that can desync.

## Decisions (locked)

- **Ship all 16 mechanics** (8 Tuned + 8 Prototype). The behavior of each is
  already approved in the 2026-07-12 equipment-depth design (Prototypes at
  lines 105-137, Tuned in the upgrade table). This spec does **not** re-derive
  those rules — it owns implementation order, shared plumbing, per-mechanic
  engine hook + state field + test, and the read-model refactor.
- **Catalog-everywhere** for finding 4, via **relocating the catalog** (Option
  A). `EQUIPMENT_UPGRADES` and a pure `equipmentUpgradeEffectOf` lookup move into
  `rules.js` — the leaf module both `game-state.js` and `combat.js` already
  import. All equipment modifiers re-derive live from the catalog by id; the
  stamped `equipmentUpgradeEffect` is removed. A catalog rebalance then applies
  to live rigs with no recommission; the catalog is the single source of truth.

  **Why relocate.** `combat.js` deliberately imports *only* from `rules.js` to
  stay import-cycle-free (its header, lines 2-3). It cannot reach a catalog that
  lives in `game-state.js` — which is the whole reason the effect is stamped onto
  the rig today. Moving the catalog to the shared leaf lets both modules read it
  directly, so the stamp is no longer needed. `rules.js` stays a leaf:
  `EQUIPMENT_UPGRADES` is pure data + a tiny lookup, matching what already lives
  there.
- **One spec, four implementation plans.** The 16 mechanics do not fit one plan.
  This spec designs all four groups; each becomes its own TDD plan.

## Non-goals

- No new mechanic rules beyond what the 2026-07-12 design already approved.
- No changes to the 8 live Field upgrades (they already ship correct effects).
- No weapon-upgrade changes; no new equipment families or slots.
- No AP nature reclassification (audit finding 2 — out of scope this pass).

## Part 1 — Read-model refactor (catalog-everywhere)

Do this **first**, before any mechanic. The 16 new mechanics all read effect
tags; a single resolution path prevents desync, and the removed stamp keeps rig
snapshots smaller.

### Current state

- **Stamped at build:** `makeRig` writes `equipmentUpgradeEffect` from the
  catalog row (`game-state.js:955, 972`); `makeUnit` writes `{}`
  (`game-state.js:1139`); `makeRig`'s field init defaults `{}`
  (`game-state.js:787`).
- **Read from the stamp:** `rigEffects` (`game-state.js:429, 437, 439, 441`),
  `heatModel` thermalMargin (`game-state.js:1199`), and `combat.js`
  `computeModifiedAim` / impact resolution (`combat.js:66, 283, 292`).

### Target state

Move the catalog data and one lookup into `rules.js`:

```js
// rules.js — EQUIPMENT_UPGRADES relocated here (pure data) so both game-state.js
// and combat.js can import it without the game-state import cycle combat.js
// forbids. Behavior of the 24 rows is unchanged by the move.
export const EQUIPMENT_UPGRADES = { /* …the existing 24 rows, moved verbatim… */ };

// The single source for every equipment-upgrade effect tag. Resolves the chosen
// upgrade's `effect` object live from the catalog by id — the one path all
// consumers (rigEffects, heatModel, combat) read, so a rebalance of
// EQUIPMENT_UPGRADES applies to live rigs with no recommission.
export function equipmentUpgradeEffectOf(equipmentId, upgradeId) {
  if (!equipmentId || !upgradeId) return {};
  const row = (EQUIPMENT_UPGRADES[equipmentId] || []).find((u) => u.id === upgradeId);
  return row?.effect || {};
}
```

- **`game-state.js`** — re-export the relocated symbols for existing callers,
  exactly as it already does for `shieldCoverage`
  (`export { EQUIPMENT_UPGRADES, equipmentUpgradeEffectOf } from "./rules.js";`).
  The nature/heat helpers (`equipmentUpgradeNature`, `equipmentActiveHeat`,
  `equipmentSprintHeat`, `equipmentRepairBonus`, `firstEquipmentUpgradeId`,
  `normalizeEquipmentUpgrade`) stay in `game-state.js` and read the imported data.
- **`rigEffects`** — resolve `const eff = equipmentUpgradeEffectOf(equip, upId)`
  once, then read `eff.thermalMargin`, `eff.hardenImpact`, `eff.sweetBandAcc`,
  `eff.sideRearStr` from it. Keep the existing `equip === "…"` family guards and
  the same defaults, so behavior is identical for the 8 Field rows.
- **`heatModel`** — replace the `rig?.equipmentUpgradeEffect?.thermalMargin`
  read with `equipmentUpgradeEffectOf(rig?.equipment, rig?.equipmentUpgrade)?.thermalMargin`.
- **`combat.js`** — import `equipmentUpgradeEffectOf` from `rules.js`. In
  `computeModifiedAim` (line 66) and impact resolution (lines 283, 292), swap the
  three `x.equipmentUpgradeEffect?.…` reads for
  `equipmentUpgradeEffectOf(x.equipment, x.equipmentUpgrade)?.…`.
- **Remove the stamp** — delete the `equipmentUpgradeEffect` assignment in
  `makeRig` (955, 972), the `{}` in `makeUnit` (1139), and the field init at
  `game-state.js:787`. Drop the field from `client/src/state/types.ts`.

### Refactor tests

- `game-state.test.js` — retarget the tests that pass an inline
  `equipmentUpgradeEffect` (lines 135-144, 4781-4793) to drive off
  `{ equipment, equipmentUpgrade }` ids instead. Add a direct
  `equipmentUpgradeEffectOf` unit test (known id → effect; unknown/empty → `{}`).
- `combat.test.js` — the fixtures at 122, 137, 400-411 already carry the ids;
  drop their inline `equipmentUpgradeEffect` and confirm the derived path gives
  the same modifiers.
- `HeatGauge.test.tsx` — update the client fixture to the id-derived model.

This is Plan 0 — the prerequisite.

## Part 2 — Mechanics, four groups

Each group is one implementation plan (TDD), built in order. Rules for each
mechanic are the 2026-07-12 design; this section fixes the engine hook, the
state field, and the test surface.

### Shared plumbing (defined once, consumed by Groups 2-4)

- **Per-round tracked-state block.** A namespaced object on the rig for
  charge/counter mechanics (e.g. `rig.equipState = { ablativeCharges, cryo,
  solution, interceptors, meltdownCharge, naniteStacks: [] }`), initialized in
  `makeRig` and reset/refreshed in Recovery. One block keeps the new fields out
  of the rig's top-level namespace.
- **Recovery-refresh hook.** Extend `runRecovery` to refill per-round charges
  (Ablative Cascade → 2, Point-Defense → 2), tick banks and stacks (Cryo,
  Nanite, Meltdown), and clear per-round Tuned flags (Reactive Armor).
- **Reactive on-incoming-hit hook.** A single seam, `applyDefensiveReactions(target, hit, ctx)`,
  where a defender may alter an incoming attack. It runs at **two** pipeline
  stages, discriminated by `hit.kind` — so **Group 2 installs both call sites**
  when it creates the seam (even though its own consumers use only the impact
  one); later groups add branches, never new call sites.

  - `hit.kind === "tohit"` — called in `rollToHit` after successful dice are
    counted, before impacts. Consumer: **Point-Defense System** (sets
    `hit.rerollHits = true`). Only ranged hits carry `hit.ranged === true`.
  - `hit.kind === "impact"` — called in `rollImpacts` after `impactSeverity`.
    Consumers: **Reactive Armor**, **Ablative Cascade** (soften one severity step).

  `ctx` shape is `{ location, row, spendHeat }`. `spendHeat(n)` is an **injected
  mutator**: `combat.js` stays pure (its header forbids mutating outside `ctx`),
  so `game-state.js` passes a callback that calls `bumpHeat`. Ablative Cascade and
  Point-Defense call `ctx.spendHeat(1)` per charge; Reactive Armor ignores it.
  Both call sites must construct the full `ctx` (the impact site adds `location`/
  `row`, the to-hit site passes them `null`).

### Group 1 — Simple conditional Tuned (no new tracked state)

Combat modifiers or active-resolution tweaks; each reads a target/heat/flag
already present.

| Upgrade | Family | Hook | Notes |
|---|---|---|---|
| Predictive Tracking | Fire Control | `computeModifiedAim` | vs static/pinned/immobilised target: +2 ACC, ignore cover |
| Kickstart Pistons | Mobility | melee STR calc | reads `movedThisActivation` → first melee this activation +2 STR |
| Backdraft | Thermal | Heat Purge Wave active | +1 STR per 2 heat over Capacity |
| Battlefield Triage | Utility | Emergency Patch active | heals 3 SP when the target location is at 0 |
| Coolant Injection | Cooling | activation-end / overheat | −2 heat before the overheat roll when over Capacity |

### Group 2 — Reactive / per-round Tuned (new tracked state)

| Upgrade | Family | Hook | State |
|---|---|---|---|
| Reactive Armor | Armor | reactive on-incoming-hit seam | per-round "first damaging hit hardened that location" flag |
| Chaff Burst | Countermeasures | targeted-while-smoke seam | free half-Speed side-step; **spatial → narrated player instruction** |

### Group 3 — Charge / bank Prototypes

Each carries tracked state, a spend action or reactive spend, and a downside.

| Prototype | Family | State | Downside |
|---|---|---|---|
| Ablative Cascade | Armor | 2 charges/round | +1 heat per spend |
| Cryo Reservoir | Cooling | bank cold (cap 3) | Radiator passive → cool 1 while banked |
| Nanite Swarm | Utility | stacks/location (cap 3) | Heat Capacity −1 while any stack rides |
| Point-Defense System | Countermeasures | 2 interceptors/round | +1 heat/spend; off the round after you fired ranged |
| Meltdown Protocol | Thermal | meltdown charge (cap 6) | no Shut Down / Cooling while charged; engine-kill detonates |
| Fire Solution Lock | Fire Control | solution counter (cap 3) | moving loses it; +1 heat per building shot |

### Group 4 — Systemic / spatial Prototypes

| Prototype | Family | Hook | Notes |
|---|---|---|---|
| Grapnel Launcher | Mobility | **replaces** the `jumpjets` active when chosen | yank self 4" / reel + engage; +2 heat, rooted, 3-round cooldown; **spatial → narrated** |
| Reactor Overdrive | Power | Overclock active | +2 STR to all attacks this activation; this activation's overheat bonus doubled |

## Tests

- **Plan 0:** the refactor tests above.
- **Per mechanic:** one combat/engine test asserting the effect fires when its
  condition holds and is absent otherwise; for tracked mechanics, a test that
  the state refreshes/decays in Recovery and that the downside applies.
- **Prototype cap:** already enforced by `countPrototypes`; a regression test
  that a wired equipment Prototype still counts against the one-per-rig cap.
- Spatial mechanics (Chaff Burst side-step, Grapnel move) assert the **narrated
  instruction** is emitted and the tracked state (cooldown, lock) is set, per the
  AGENTS.md spatial convention.

## rules.md

Fill in the "Tuned / Prototype Equipment Mechanics" subsection under §15
(scaffolded by the 2026-07-12 change) as each group ships — same cadence as the
weapon-Prototype rollout.

## Files touched

- `shared/game-state.js` — `equipmentUpgradeEffectOf` helper; remove the stamp;
  `equipState` block + Recovery refresh; Tuned/Prototype resolution.
- `shared/combat.js` — id-derived effect reads; reactive on-incoming-hit seam;
  Group 1/2 combat modifiers.
- `client/src/state/types.ts` — drop `equipmentUpgradeEffect`.
- `client/src/v2/components/HeatGauge.test.tsx` — id-derived fixture.
- `shared/game-state.test.js`, `shared/combat.test.js` — refactor + per-mechanic.
- `rules.md` — §15 mechanics subsection, filled per group.

## Plan sequence

0. Read-model refactor (catalog-everywhere) — prerequisite.
1. Group 1 — simple conditional Tuned.
2. Group 2 — reactive / per-round Tuned + shared reactive-hit seam.
3. Group 3 — charge / bank Prototypes + shared tracked-state block & Recovery refresh.
4. Group 4 — systemic / spatial Prototypes.
