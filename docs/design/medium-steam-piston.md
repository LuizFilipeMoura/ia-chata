# Rig design, `medium-steam-piston` (Brass)

**Weapons:** Steam Cannon (long-range) · Piston Hammer (melee) · **Class:** medium
**Focus:** push & punish. The Steam Cannon shoves whatever it hits 2" straight back (digital: the engine moves the mini and stops it at terrain; a stop short slams for 1 SP). The Piston Hammer is one heavy blow. Terrain is ammunition: shove rigs into rocks, off objectives, out of cover, out of their friend's melee lock.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Relevant stats (from `shared/game-state.js`):
- Steam Cannon: ROF 2, Pen 8, Dmg 3, sweet band 0–8" (+1), range 0–14", shove 2".
- Piston Hammer: melee, ROF 1, Pen 10, Dmg 4, reach 2".
- Commissioned SP: **Hull 15 / Arms 13 / Legs 12 / Engine 10**, Integrity 33, Speed 4".

## Steam Cannon (long-range)

| Nature | Name | Effect | Engine |
|---|---|---|---|
| **Field** | High-Pressure Valve | Shove 1" further (3"). | ✅ implemented (`shove: 1`) |
| **Tuned** | Flush Them Out | +2 Pen vs a target in any cover. | ✅ implemented (`vsCover: 2`) |
| **Prototype** | Boiler Blast | Shove 2" further (4") and a slam costs 2 SP. Downside: +1 heat a shot. | ✅ implemented (`shove: 2, slam: 1, shotHeat: 1`) |

## Piston Hammer (melee)

| Nature | Name | Effect | Engine |
|---|---|---|---|
| **Field** | Heavy Head | +1 Damage. | ✅ implemented (`dmg: 1`) |
| **Tuned** | Follow-Through | +2 Pen vs a rig this rig shoved this round (clears in Recovery). | ✅ implemented (`vsShoved: 2` + `target.shovedBy`) |
| **Prototype** | Pressure Dump | +1 Pen per 2 heat carried (max +3); the blow vents that heat. Downside: rooted for the rest of the activation. | ✅ implemented (`pressureDump` + `rootedThisActivation`) |

## Synergy

Loop: shove (Steam Cannon) → close → Follow-Through hammer. Pressure Dump turns a hot boiler into one huge swing and cools you, at the price of standing still.

Engine: on-hit riders run in `resolveRiders` (`shared/game-state.js`) after the attack's heat; Penetration / ROF hooks live in `penBreakdown` / `effectiveRof` (`shared/combat.js`). Tests: `shared/new-rigs.test.js`.
