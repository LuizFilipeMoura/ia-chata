# Rig design, `medium-tesla-shockglove` (Jade)

**Weapons:** Tesla Coil (long-range) · Shock Glove (melee) · **Class:** medium
**Focus:** heat control. The Tesla Coil's many weak dice arc to the nearest other rig within 3" of the target (friend or foe). The Shock Glove adds +1 heat per landed hit; Hot Contact / Short Circuit then cash in on anything over its Heat Capacity.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Relevant stats (from `shared/game-state.js`):
- Tesla Coil: ROF 3, Pen 5, Dmg 1, sweet band 3–10" (+2), range 0–14", chain 3".
- Shock Glove: melee, ROF 2, Pen 6, Dmg 2, reach 2", +1 heat per hit.
- Commissioned SP: **Hull 13 / Arms 12 / Legs 11 / Engine 11**, Integrity 31, Speed 4".

## Tesla Coil (long-range)

| Nature | Name | Effect | Engine |
|---|---|---|---|
| **Field** | Long Arc | Chain jumps 1" further (4"). | ✅ implemented (`chainRadius: 1`) |
| **Tuned** | Hot Contact | +2 Pen vs a target over its Heat Capacity. | ✅ implemented (`vsHot: 2`) |
| **Prototype** | Overload | +1 die per 2 heat carried (max +3). Downside: 1 SP to own Engine every shot. | ✅ implemented (`overload`) |

## Shock Glove (melee)

| Nature | Name | Effect | Engine |
|---|---|---|---|
| **Field** | Live Wire | +1 more heat per hit (2 total). | ✅ implemented (`heatOnHit: 1`) |
| **Tuned** | Short Circuit | +3 Pen vs a target over its Heat Capacity. | ✅ implemented (`vsHot: 3`) |
| **Prototype** | Discharge | A landed blow moves up to 2 of Jade's heat onto the target. Downside: 1 SP to own Arms each time. | ✅ implemented (`discharge: 2`) |

## Synergy

Loop: glove cooks a rig past cap → Short Circuit / Hot Contact spikes. The chain punishes clumps but will happily arc into your own rig; keep friends 3" clear of the target.

Engine: on-hit riders run in `resolveRiders` (`shared/game-state.js`) after the attack's heat; Penetration / ROF hooks live in `penBreakdown` / `effectiveRof` (`shared/combat.js`). Tests: `shared/new-rigs.test.js`.
