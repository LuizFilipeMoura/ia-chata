# Equipment Depth — Nature Upgrades + Expanded Catalog — Design

**Date:** 2026-07-12
**Status:** Approved, pending implementation plan

## Problem

Equipment is the shallowest system in the game. Weapons carry the full
**Field / Tuned / Prototype** nature system (§12): 22 weapons, each with three
authored upgrades, conditional triggers, and systemic tracked Prototypes with
downsides. Equipment, by contrast, is five flat `passive + 1-slot active` pairs
(§15) with no per-piece choice and almost no reach into the rest of the game —
it sits in its own lane, barely touching weapons, heat, or positioning.

Two gaps, confirmed with the designer:

1. **Too shallow vs weapons** — no upgrade choice, no depth.
2. **Doesn't interact enough** — isolated from heat / weapons / positioning.

## Goals

- Give every equipment family a **three-nature upgrade** picked at commission,
  exactly mirroring the weapon upgrade system players already understand.
- **Expand the catalog** from 5 families to 8, the three new families themed on
  the interaction hooks the designer chose: **heat, weapons, positioning**.
- Fold equipment Prototypes into the existing **one-Prototype-per-rig** cap, so
  the cap now spans 2 weapons **+ 1 equipment** — a real cross-system tension.
- Keep the **single equipment slot** (unchanged) and the `passive + 1-slot
  active` shape of each piece.

## Non-goals

- No second equipment slot.
- No objective / Priority-Target hooks (explicitly out of scope this pass).
- No Tank / Walker equipment (those kinds have no equipment slot).
- No rebalance of the existing weapon upgrades.

## Framework

### The three natures (reused verbatim from §12)

- **Field** — unconditional, always-on, reinforces the piece's role. Safe default.
- **Tuned** — conditional trigger (heat level, being hit, target/board state)
  that out-pays Field when set up.
- **Prototype** — systemic, tracked, high-payoff, carries a downside.

At commission the player picks **one** upgrade for the equipment, alongside the
two weapon upgrades.

### Prototype cap — the key interaction

Today the cap is "at most one Prototype across a rig's two weapons"
(`countPrototypes` in `shared/game-state.js`, enforced in
`server/routes/game.js` `enforceChassis`, gated in the wizard UI).

This change makes the cap span **all three pickers** (long-range weapon, melee
weapon, equipment). A Prototype equipment therefore forces **both** weapons to
stay Field/Tuned, and vice versa. Prototypes stay special; the choice defines a
build identity.

## Catalog — 8 families

The existing five keep their `passive` and `active` unchanged; they only gain
the three upgrade rows. The three new families are defined in full below.

### Existing five (passive/active unchanged)

| Family | Piece | Passive | Active |
|---|---|---|---|
| Armor | Ablative Plating | +1 max SP to Hull | Harden (+1 heat) |
| Cooling | Radiator Array | Cools 2 heat in Recovery | Purge (−2 heat) |
| Mobility | Servo Actuators | Sprint costs 1 heat | Jump Jets (+2 heat) |
| Power | Overclock Core | First Engine-0 doesn't skip | Overclock (+3 heat) |
| Utility | Field Repair Suite | Repair restores +1 SP | Emergency Patch (+2 heat) |

### New three

| Family | Piece | Passive | Active |
|---|---|---|---|
| **Thermal** | **Blast Furnace Core** | Safe up to **+1 over Heat Capacity** before the overheat roll triggers | **Heat Purge Wave** (dump banked heat): every enemy within 3" takes heat + a light hit |
| **Fire Control** | **Targeting Computer** | Ignore the **first −ACC penalty** each activation (cover / engaged / falloff — chosen on use) | **Lock Sight** (+1 heat): next shot this activation rerolls all missed to-hit dice |
| **Countermeasures** | **Reactive Plating** | **Side/rear** attacks against it take **−1 STR** | **Pop Smoke** (0 heat): until next activation every attacker is at −2 ACC vs it; also breaks a Missile Lock-Target paint on it |

Identity separation: Thermal is offensive-heat (opposite of Cooling);
Fire Control is self-gun accuracy (no support-unit Paint overlap — self only);
Countermeasures is reactive/arc defense (not Armor's flat SP + Harden).

## Upgrade tables (8 × 3 = 24)

| Family | Field | Tuned | Prototype |
|---|---|---|---|
| **Armor** | **Reinforced Plating** — Harden gives −2 impact, not −1 | **Reactive Armor** — first damaging hit each round hardens *that location* (−2 impact) till next activation | **Ablative Cascade** |
| **Cooling** | **Twin Radiators** — Purge vents −3, not −2 | **Coolant Injection** — if ending activation over Capacity, −2 heat before the overheat roll | **Cryo Reservoir** |
| **Mobility** | **Reinforced Servos** — Sprint costs 0 heat | **Kickstart Pistons** — Sprint/Jump into contact this activation → first melee after +2 STR | **Grapnel Launcher** |
| **Power** | **Redundant Capacitors** — Overclock costs +2 heat, not +3 | **Adrenaline Surge** — while below half total SP, Overclock grants +3 actions (net +2) | **Reactor Overdrive** |
| **Utility** | **Master Toolkit** — Repair heals +2 SP, not +1 | **Battlefield Triage** — Emergency Patch heals 3 SP when target location is at 0 | **Nanite Swarm** |
| **Thermal** | **Insulated Core** — safe up to +2 over Capacity (not +1) | **Backdraft** — Heat Purge Wave +1 STR per 2 heat you're over Capacity | **Meltdown Protocol** |
| **Fire Control** | **Ballistic Processor** — +1 ACC vs a target in your sweet-spot band | **Predictive Tracking** — vs a static/pinned/immobilised target: +2 ACC, ignore cover | **Fire Solution Lock** |
| **Countermeasures** | **Angled Plates** — side/rear attacks −2 STR (not −1) | **Chaff Burst** — while Smoke up, when targeted, free half-Speed side-step before the attack resolves | **Point-Defense System** |

### Prototype mechanics

Each is tracked state + a real cost, and counts against the one-Prototype-per-rig cap.

- **Ablative Cascade** (Armor) — 2 ablative charges/round; each incoming damaging
  hit may spend 1 to soften it one step (Critical→Severe→Direct→negated). Each
  spend runs **+1 heat**. Refresh to 2 in Recovery.
- **Cryo Reservoir** (Cooling) — each Recovery you cool, bank 1 cryo (cap 3). At
  activation start spend N: **−2 heat each** and **+1 STR to your next attack per
  cryo spent**. Downside: while cryo > 0, the Radiator passive drops to cooling 1
  per Recovery (hoarding, not dissipating).
- **Grapnel Launcher** (Mobility) — replaces the Jump Jets active: fire a grapnel
  to either **yank self up to 4"** (ignores engagement — breaks a melee lock you
  are pinned in) **or reel into contact + engage** an enemy. Downside: +2 heat,
  rooted rest of activation, **3-round cooldown**. Spatial → narrated player
  instruction (per AGENTS.md convention), engine tracks cooldown + lock changes.
- **Reactor Overdrive** (Power) — when you Overclock, also **+2 STR to all attacks**
  this activation. Downside: this activation's overheat bonus is **doubled**
  (2×(heat−Cap) → 4×). All-in push.
- **Nanite Swarm** (Utility) — active (1 slot, +1 heat): seed a nanite stack on a
  location (self or ally in reach). Each Recovery every stack heals 1 SP there,
  then decays 1. Cap 3/location. Downside: while any stack rides this Rig, its
  **Heat Capacity −1**.
- **Meltdown Protocol** (Thermal) — heat over Capacity at activation end converts
  to **meltdown charge** (cap 6) instead of rolling overheat. Spend N at
  activation start: **+N STR** split across attacks, or a **4" burst** (N
  heat-damage to enemies in range). Downside: while charge > 0 you can't Shut
  Down or use Cooling actions; an Engine destroyed while charged detonates the
  charge on yourself.
- **Fire Solution Lock** (Fire Control) — each Fire Weapon vs the *same* target
  +1 solution (cap 3, reset on target switch). At 3, next attack **auto-hits all
  dice + Armour Piercing**. Downside: **Moving loses the solution** (must hold
  still); each solution-building shot runs +1 heat.
- **Point-Defense System** (Countermeasures) — 2 interceptor charges/round; when
  hit by a **ranged** attack, spend 1 to force the attacker to reroll all
  successful hit dice. Refresh 2 in Recovery. Downside: +1 heat per charge spent;
  PD is unusable the round after *you* fired your own ranged weapon.

## Data model

Mirror `WEAPON_UPGRADES`. Add a parallel `EQUIPMENT_UPGRADES` map in
`shared/game-state.js`, keyed by equipment id, each value an array of three
`{ id, nature, name, tag, effect }` rows — identical shape to weapon upgrades.
New-mechanic Tuned/Prototype rows ship `effect: {}` with a `TODO(mechanics)`
marker and are wired incrementally, exactly as the weapon upgrades did.

```js
export const EQUIPMENT_UPGRADES = {
  "ablative-plating": [
    { id: "reinforced-plating", nature: "field", name: "Reinforced Plating",
      tag: "Harden gives −2 impact, not −1", effect: { hardenImpact: 2 } },
    { id: "reactive-armor", nature: "tuned", name: "Reactive Armor",
      tag: "First hit each round hardens that location", effect: {} }, // TODO(mechanics)
    { id: "ablative-cascade", nature: "prototype", name: "Ablative Cascade",
      tag: "Soften incoming hits with ablative charges — each costs heat", effect: {} }, // TODO(mechanics)
  ],
  // ...one entry per equipment id, including the 3 new families
};
```

Add the three new families to `EQUIPMENT` (with `family`, `label`, `passive`,
`active { key, label, heat, text }`). `EQUIPMENT_ACTIVE_BY_KEY` picks them up
automatically. New active keys: `heatpurgewave`, `locksight`, `popsmoke`
(the Grapnel Prototype reuses the `jumpjets` slot on Mobility, replacing its
behavior when that upgrade is chosen).

Helpers to add, alongside `upgradeNature` / `countPrototypes`:

- `equipmentUpgradeNature(equipmentId, upgradeId)` — parallel to `upgradeNature`.
- Extend `countPrototypes` to accept the equipment id + its chosen upgrade and
  add it to the tally. Signature grows to
  `countPrototypes(weapons, upgrades, equipment, equipmentUpgrade)` (equipment
  args optional so existing callers keep working during migration).

## Enforcement — Prototype cap across 3 pickers

- **`server/routes/game.js` `enforceChassis`** — read the equipment upgrade off
  the command attrs (e.g. `a.equipmentUpgrade`), validate it against the
  resolved equipment's upgrade list (unknown id → reject, mirroring the weapon
  branch), and include it in the `countPrototypes(...) > 1` check.
- **`CommissionWizard.tsx`** — the Equipment step gains a nature sub-picker
  identical to the weapon step's (Field/Tuned/Prototype nodes, hazard-lit
  Prototype, `⚠ one per rig` warning). The `otherIsPrototype` cross-lock now
  considers **all three** pickers so selecting a Prototype anywhere greys the
  Prototype nodes in the other two.
- **`UnitWizard.tsx`** — Tanks/Walkers have no equipment, so no change beyond
  whatever shared picker component is factored out.

## rules.md

- **§15 Equipment** — rewrite: each family now lists its three-nature upgrade
  options in a table, matching the §12 weapon-upgrade layout. Add the three new
  families (Thermal / Fire Control / Countermeasures) with passive + active.
- **§3 Building a Squadron** — the "at most one Prototype" clause now reads
  "across its two weapons **and its equipment**."
- A "Tuned / Prototype Equipment Mechanics" subsection under §15, mirroring the
  weapon one, detailing the eight Prototypes + the conditional Tuned effects, as
  each ships.

## Suggested-equipment-per-chassis — is it covered?

**Yes — lightly and compatibly. Nothing breaks.** The
[suggested-equipment feature](2026-07-12-suggested-equipment-per-chassis-design.md)
stores `suggestedEquipment: [{ id, reason }]` on each chassis, where `id` must be
a known `EQUIPMENT` key, validated in `server/chassis.js` against the imported
`EQUIPMENT` map.

Impact of this change:

1. **Pool grows 5 → 8 for free.** `server/chassis.js` validates suggestion ids
   against `EQUIPMENT`; adding three keys makes the new families automatically
   valid suggestion targets. No code change in the chassis store.
2. **Existing suggestions stay valid.** All 11 authored chassis suggestions
   reference the original five ids, all still present.
3. **New content opportunity (in scope, optional).** With Thermal / Fire Control
   / Countermeasures available, chassis suggestions can be re-authored to point
   at the new families where they fit (e.g. a hot chassis → Thermal, a
   sweet-spot sniper → Fire Control). This is content editing in
   `content/chassis.json`, no schema change.
4. **Wizard co-location.** The suggested-equipment highlight lives in the
   Equipment step of `CommissionWizard.tsx` — the same step that now gains the
   nature sub-picker. The highlight is on the **family card**; the nature picker
   sits beneath the selected card. They compose cleanly (a card can be
   suggested, selected, and show its nature picker at once). The step's layout
   must accommodate both.
5. **Out of scope:** suggestions do **not** gain a suggested *nature* field this
   pass. A suggestion still nudges the family only; nature stays a free choice.
   (Could be a later `suggestedEquipment[].upgrade` addition.)

## Phasing

Follow the weapon-upgrade precedent: ship the framework + content first with
mechanics stubbed, then wire effects incrementally.

- **Phase 1 — framework & content.** Add the 3 new families to `EQUIPMENT`; add
  `EQUIPMENT_UPGRADES` (all 24 rows, new-mechanic effects stubbed `{}` +
  `TODO(mechanics)`); extend `countPrototypes` + the cap enforcement (server +
  wizard); add the equipment nature sub-picker UI; rewrite rules.md §15/§3. Every
  Field upgrade whose effect is a simple stat tweak (Reinforced Plating, Twin
  Radiators, Reinforced Servos, Redundant Capacitors, Master Toolkit, Insulated
  Core, Angled Plates) ships live in Phase 1 — they are one-line modifiers to
  existing passives/actives.
- **Phase 2+ — mechanics.** Implement the Tuned triggers and the eight
  Prototypes one at a time in `combat.js` / `game-state.js`, each with tests,
  same cadence as the weapon Prototype rollout. Spatial Prototypes (Grapnel,
  Meltdown burst) emit narrated player instructions, engine tracks the state.

## Tests

- `shared/game-state.test.js` — `EQUIPMENT` has 8 families; each has exactly 3
  `EQUIPMENT_UPGRADES` rows, one per nature; `equipmentUpgradeNature` resolves;
  extended `countPrototypes` counts an equipment Prototype.
- `server/routes/game` (or `ws.test.js`) — `enforceChassis` rejects a 2nd
  Prototype when one is on the equipment; rejects an unknown equipment upgrade id.
- `server/chassis.test.js` — a chassis suggestion pointing at a new family id
  (e.g. `blast-furnace-core`) merges and validates.
- Per-mechanic combat tests land with each Phase 2+ effect.

## Files touched

- `shared/game-state.js` (EQUIPMENT +3, EQUIPMENT_UPGRADES, helpers)
- `shared/combat.js`, `shared/game-state.js` (Phase 2+ mechanics)
- `server/routes/game.js` (cap enforcement + upgrade validation)
- `client/src/v2/overlays/CommissionWizard.tsx` (equipment nature sub-picker)
- possibly `client/src/components/wizards/UnitWizard.tsx` (shared picker)
- `client/src/v2/styles/forge.css` (nature picker beside suggestion highlight)
- `rules.md` (§15 rewrite, §3 clause)
- `content/chassis.json` (optional: re-author suggestions toward new families)
- test files above
