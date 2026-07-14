# Rig Effects Descriptor — one source of truth for equipment/upgrade modifiers

**Date:** 2026-07-14
**Branch:** frontend/v2-redesign
**Status:** Design approved, ready for planning

## Problem

The engine (`shared/game-state.js`) resolves every equipment/upgrade effect correctly
at action time through three helpers — `equipmentSprintHeat()`, `equipmentActiveHeat()`,
`equipmentRepairBonus()`. These are the real source of truth.

But the **preview layer** — everything a player sees *before* committing an action, plus
the loadout card — recomputes costs from *static* definitions and never calls those
helpers. So the UI shows one number and the engine charges another.

Observed trigger: Servo Actuators' passive reads "Sprint costs 1 heat instead of 2", yet
the MOVE action picker shows "Sprint +2 heat".

### Drift inventory (5 surfaces)

| # | Surface | Shows | Engine actually does |
|---|---------|-------|----------------------|
| 1 | Action picker — sprint chip (`battle-view.js:34`) | +2 always | Servo→1, Reinforced Servos→0 |
| 2 | MoveBody drawer (`MoveBody.tsx:27`) | Servo→1, ignores upgrade | Reinforced Servos→0 |
| 3 | Action picker — active chip (`battle-view.js:71`) | static `active.heat` | Purge+Twin Radiators −3; Overclock+Redundant Capacitors +2 |
| 4 | RepairBody drawer copy (`RepairBody.tsx`) | "restores 2 SP" flat | Field Repair Suite +1 / Master Toolkit +2 |
| 5 | Equipment card (`loadout.ts:81`) | static active heat + static passive string; no upgrade line | upgrade-aware heat/text |

Root cause: `availableActions()` in `shared/battle-view.js` and the client drawers/loadout
builder each carry their own copy of effect math instead of asking the engine. Every new
effect risks a new drift point.

A second class of effect — passives baked into a stat at commission (Ablative +1 max Hull
SP, Blast Furnace thermal margin) — has **correct** numbers already, because the value lives
on the rig object. But those modifiers are invisible in the UI: no badge connects the stat
to the equipment granting it.

## Goal

1. Introduce one engine-side read-model, `rigEffects(rig)`, that pre-resolves every
   equipment/upgrade modifier to final values.
2. Reroute all 5 preview surfaces through it — they render, never compute.
3. Surface the baked passives with inline badges sourced from the same descriptor.
4. Pin the preview to the resolution engine with a guard test so drift can't return.

**Non-goal:** no change to how the resolution engine *charges* anything. This is purely a
new read-model plus consumers. All existing resolution tests must stay green untouched.

## Design

### 1. `rigEffects(rig)` — the descriptor

New pure function in `shared/game-state.js`. Given a rig, returns one object of
pre-resolved final values:

```js
{
  actionHeat: {          // final effective heat, keyed by action key
    sprint: 1,           // base 2 → Servo 1 → Reinforced Servos 0
    jumpjets: 2,
    purge: -3,           // base -2 → Twin Radiators -3
    overclock: 2,        // base 3 → Redundant Capacitors 2
    // ...one entry per action whose cost this rig's kit changes
  },
  repair:  { bonusSp: 1 },   // extra SP a Repair/Patch restores (0 if no suite)
  thermalMargin: 1,          // safe-over-capacity before the overheat roll
  hullMaxBonus: 1,           // Ablative baked bonus, echoed for display parity
  recoveryCool: 2,           // Radiator Array recovery vent (base 1)
  combat: {                  // carried for follow-on combat previews
    hardenImpact: 1,         // Harden impact penalty magnitude
    sweetBandAcc: 0,         // Ballistic Processor sweet-band accuracy
    sideRearStr: -1,         // Reactive Plating side/rear STR delta
  },
  modifiers: [               // display-only, ordered list of what's in force
    { source: "servo-actuators", kind: "actionHeat",
      label: "Sprint costs 1 heat", detail: "Mobility" },
    // ...
  ],
}
```

**Design rules:**
- **Pre-resolved final values.** Consumers read; they never apply an upgrade delta
  themselves. `actionHeat.sprint` is already `0` for a Reinforced Servos rig.
- **Built on the existing helpers.** `rigEffects` *calls* `equipmentSprintHeat` /
  `equipmentActiveHeat` / `equipmentRepairBonus` and reads the passive effect fields. It
  adds no new resolution logic, so the atomic helpers and their tests are unchanged.
- **`modifiers[]` is the generic display list.** Every equipment/upgrade contribution the
  rig actually carries appears here with a stable `source`, a human `label`, and a `kind`
  tag. New badges render from this list with no new plumbing.

### 2. Engine — helpers stay atomic, resolution unchanged

The three helpers remain the atomic truth used at resolution:
- `equipmentActiveHeat` → active resolution (`game-state.js:2211`)
- `equipmentSprintHeat` → sprint resolution (`:2351`)
- `equipmentRepairBonus` → repair resolution (`:2531`)

`rigEffects` sits *above* them as an aggregator. No resolution path changes. This keeps the
change safe: the diff to `game-state.js` is one new pure function plus its exports.

### 3. Consumers stop computing

All five surfaces read the descriptor:

1. **`availableActions()` (`shared/battle-view.js`)** — call `rigEffects(rig)` once at the
   top; for every action, override the heat chip from `actionHeat[key]` when present, else
   fall back to `ACTIONS[key].heat`. Fixes drift #1 and #3. This is the single most
   important reroute — the shared view-model becomes the preview authority.

2. **`MoveBody.tsx`** — delete the `rig.equipment === "servo-actuators" ? 1 : 2` hardcode
   (`MoveBody.tsx:27`). The picker already holds the correct `Action.heat`; thread it into
   `openMove` so the drawer renders the value it was opened with. Fixes drift #2.

3. **`RepairBody.tsx`** — receive `repair.bonusSp` (via the drawer-open call, same pattern
   as Move). Copy becomes engine-true: with a +1 suite, "Rolls a D12: 10+ restores 3 SP,
   7–9 restores 2 SP" and Emergency Patch "restores a guaranteed 3 SP". Fixes drift #4.

4. **`loadout.ts` builder** — replace static `activeHeat: eqDef.active.heat` and
   `passive: eqDef.passive` with descriptor-sourced values so the equipment card is
   upgrade-aware (Twin Radiators shows Purge −3; Reinforced Servos shows the 0-heat sprint).
   Fixes drift #5.

5. **Equipment card (`LoadoutView.tsx`)** — add an equipment-upgrade line mirroring the
   weapon-upgrade block (`upName` / `upNature` / `upTag`). Today weapons show their upgrade
   and equipment does not; this closes the gap.

### 4. Badges for baked passives

Sourced from `modifiers[]`, reusing the existing green `v2-rt-delta` "+N" mark that weapon
stats already render — no new visual language.

- **Ablative +1 Hull SP** → inline `+1` delta on the Hull location in the SP readout.
- **Thermal margin +1 / +2** → a capacity+margin marker on `HeatGauge` (the safe-overheat
  band), so the raised overheat threshold is visible on the gauge.
- **Radiator recovery, Targeting Computer, Reactive Plating passives** → the equipment card
  is their home; now upgrade-aware via §3.4, and the new upgrade line (§3.5) shows the
  active Field/Tuned/Prototype tag.

Placement detail (exact components/props) is finalized in the implementation plan; the
descriptor is the data contract for all of them.

### 5. Testing

- **`rigEffects` unit tests** — every equipment × upgrade combo asserted against expected
  final values, mirroring the existing `equipmentSprintHeat` test style.
- **Drift guard test** — for each action a rig can take, assert the `availableActions` heat
  chip equals what the resolution engine actually charges (drive the action, read the heat
  delta). This pins preview to resolution so the two can never diverge again.
- **Consumer tests** — MoveBody shows 0 for a Reinforced Servos rig; RepairBody copy shows
  the bonused SP; LoadoutView renders the upgrade line and upgrade-aware active heat.

## Out of scope

- Wiring the `combat` deltas (side/rear −STR, sweet-band +acc) into the AttackWizard
  preview. The descriptor *carries* them; rendering them in the attack flow is a follow-on.
- Any change to resolution charging.
- Tuned/Prototype upgrades that ship inert (`effect: {}`) — they contribute nothing to the
  descriptor until their mechanics land.

## Files touched

- `shared/game-state.js` — add `rigEffects`; export it.
- `shared/battle-view.js` — `availableActions` reads the descriptor.
- `client/src/lib/loadout.ts` — descriptor-sourced equipment fields + upgrade line data.
- `client/src/v2/battle/MoveBody.tsx` — drop hardcode, render passed heat.
- `client/src/v2/battle/RepairBody.tsx` — render bonused SP copy.
- `client/src/v2/battle/ActionConsole.tsx` — thread `Action.heat`/effects into openMove/openRepair.
- `client/src/v2/state/V2BattleActionsContext.tsx` — carry heat/bonus through the drawer-open API.
- `client/src/v2/components/LoadoutView.tsx` — equipment-upgrade line.
- `client/src/v2/components/HeatGauge.tsx` — thermal-margin marker.
- `client/src/v2/components/CompRow.tsx` — Hull `+1` badge beside `sp/max` (the Hull
  `max` already bakes Ablative's +1 at commission, so the badge is explanatory).
- Tests alongside each.
