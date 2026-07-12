# Support Units — Design

**Date:** 2026-07-11
**Status:** Approved, ready for planning
**Depends on:** the unit-system framework + Tank/Walker kinds (`rules.md` §17, `2026-07-06-unit-system-design.md`)

## Goal

Add a small roster of **support units** — machines whose value is partly or wholly in helping the rest of the force, not just trading blows. Every support unit does two jobs, built from a set of four roles, on the existing Tank/Walker chassis. Introduces the game's first **cross-unit (ally-targeting) effects**.

## Core idea: role modules

There are four **roles**: **Damage, Repair, Coolant, Recon**. A support unit carries **two distinct** roles as **modules**. The four shipped units are just four pre-picked pairings; the module system allows any of the six pairs.

Support units reuse the **Tank** or **Walker** chassis (`rules.md` §17) unchanged for all body stats: component set, SP, armour rows, D12 hit table, arcs, facing-movement, **cold** (no heat / no overheat / no Shut Down), action budget, and speed. The *only* change to the chassis is the weapon fit:

- Base Tank/Walker carry **one flat-profile weapon**.
- A **support chassis** carries a fixed **light sidearm** + **2 module slots**.

### Sidearm (always on, fixed profile)

Every support unit has a built-in weak gun so even a double-utility loadout can chip damage.

| Weapon | Type | ROF | STR | ACC (near/far) | RNG (near/far) |
|---|---|:--:|:--:|:--:|:--:|
| Sidearm | ranged | 2 | 4 | 0 / 0 | 6" / 12" |

Flat STR, no weight-class scaling (like all unit weapons). No melee. The sidearm is active whenever the unit does **not** take a Damage module; a Damage module replaces it.

### The four role modules

Pick **2 distinct** modules per support unit.

| Module | Effect |
|---|---|
| **Damage** | Replaces the sidearm with a real weapon from the §17 shared unit-weapon list (Tank Cannon, Autocannon Mount, Coaxial MG, Rocket Pod, Dozer Blade, Ram Spike). Flat STR. The only way to get real punch or a melee attack. |
| **Repair** | **Field Weld** action [1 slot]: target one unit (self or ally) in base contact or within 2". Roll 1 D12 — **7+** repair 1 SP, **10+** repair 2 SP — to a location the target's controller chooses. Follows `rules.md` §5 Repair (restoring a location above 0 lifts its 0-SP penalty; permanent effects such as immobilise or permanent-cripple stay). Cold — no heat. |
| **Coolant** | **Vent** action [1 slot]: target a friendly **Rig** in base contact or within 2"; reduce that rig's heat by **2** (an ally-targeted Purge, §15). Only Rigs carry heat — targeting a cold unit is illegal / wasted. |
| **Recon** | **Paint** action [1 slot]: mark one enemy in line of sight within **18"**. The mark lasts until the start of this unit's next activation. While marked, **allied ranged attacks** against that target ignore cover/obscured ACC penalties (§7) and gain **+1 ACC**. A Recon unit holds **one** mark at a time; a new Paint replaces the old. |

### Module rules

- **Two distinct modules** — so a support unit fields at most **one** weapon (a Damage gun *or* the sidearm, never two).
- **No Damage module → sidearm only.** A pure double-utility unit still fights weakly.
- **Module actions run off the unit's Hull/systems, not the weapon mount.** Destroying the Turret/Mount (weapon-role component at 0 SP) kills only the gun — Field Weld / Vent / Paint keep working. ⚙ Keeps a support unit useful after its gun dies.
- Each module action costs **1 action slot**. No heat (cold units). No charges/cooldowns — the action budget is the only limiter, matching the equipment-active pattern (§15).

### Action economy

Inherited from the chassis, unchanged:

- **Tank support unit** — 2 actions, Speed 3".
- **Walker support unit** — 3 actions, Speed 4".

Example — Radiator Walker (3 actions): Move + Vent an allied rig + fire Coaxial MG. Marksman Tank (2 actions): Paint a target, then fire the Tank Cannon.

## The four shipped units

All numeric values are strawman ⚙, subject to playtest. Chassis stats (SP, armour, hit table) inherited verbatim from `rules.md` §17.

| Unit | Chassis | Module 1 | Module 2 | Weapon | Role summary |
|---|---|---|---|---|---|
| **Marksman Tank** | Tank (2 act, 3") | Damage — Tank Cannon (STR 12) | Recon | Tank Cannon | Gun-line anchor that paints priority targets for the force |
| **Radiator Walker** | Walker (3 act, 4") | Damage — Coaxial MG | Coolant | Coaxial MG | Fast flanker that vents heat off friendly rigs |
| **Field Welder** | Walker (3 act, 4") | Repair | Recon | Sidearm | Nimble medic-spotter; welds allies, marks enemies, chips with sidearm |
| **Depot Tank** | Tank (2 act, 3") | Repair | Coolant | Sidearm | Tough pure-logistics; keeps rigs patched and cool |

**Coverage:** both chassis appear twice; each of the four roles appears on exactly two units; four of the six possible role-pairs are shipped. The remaining pairs (Damage+Repair, Recon+Coolant) are legal to build but not shipped as named exemplars.

## What's new vs. the existing framework

1. **Cross-unit targeting** — first effects in the game that read/write another unit's state (ally SP, ally rig heat) or tag an enemy for allied benefit. Field Weld, Vent, and Paint all take a *target unit* argument.
2. **Sidearm + module slots** — a chassis weapon-fit variant: replace the single-weapon registry entry with `{ sidearm, modules: 2 }`. Base Tank/Walker are unchanged (single weapon).
3. **Paint / marked-target status** — a per-unit enemy mark with a one-activation lifetime that modifies *other units'* attack resolution. Expires at the marking unit's next activation start; replaced by re-Painting.

## Balance / tuning notes (⚙)

- Sidearm profile (ROF 2 / STR 4 / 6"–12") is deliberately weak — a plinker, not a threat. Approved as-is.
- Field Weld reuses §5 Repair odds (7+/10+); watch whether ally-repair plus self-repair makes attrition games drag.
- Vent −2 heat mirrors the Purge equipment active; only matters against rig-heavy enemies, dead weight against all-cold forces — an intended matchup tradeoff.
- Paint +1 ACC + ignore-cover: modest force-multiplier; watch stacking with the gun line's own accuracy.
- Module actions surviving Turret/Mount loss is a deliberate durability choice for the support role.
- Balance stays **matched-composition only** (§3) — a support unit is one slot / one count / one activation like any other.

## Out of scope

- Infantry / multi-mini squads (still deferred — see the infantry design).
- Faction perks, points economy (both remain dropped/TBD, §16).
- New cross-unit effects beyond the three modules above.
