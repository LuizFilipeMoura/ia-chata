# Rig design, `medium-flare-bayonet` (Ivory)

**Weapons:** Flare Launcher (long-range) · Bayonet (melee) · **Class:** medium
**Focus:** mark & enable. Every flare that lands marks the target for Ivory's side until its next activation (the Recon Paint mark: allies ignore cover and get +1 Aim). Weak damage on purpose; it makes everyone else's shots better.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Relevant stats (from `shared/game-state.js`):
- Flare Launcher: ROF 1, Pen 4, Dmg 1, sweet band 10–24" (+2), range 0–30", marks on hit.
- Bayonet: melee, ROF 2, Pen 6, Dmg 2, Acc +1, reach 2".
- Commissioned SP: **Hull 12 / Arms 11 / Legs 11 / Engine 10**, Integrity 29, Speed 4.5".

## Flare Launcher (long-range)

| Nature | Name | Effect | Engine |
|---|---|---|---|
| **Field** | Wide Burst | The flare also marks every enemy within 1.5" of the target. | ✅ implemented (`markRadius: 1.5`) |
| **Tuned** | Stripping Flare | A Braced target the flare marks loses its Brace. | ✅ implemented (`stripBrace`) |
| **Prototype** | Star Shell | Marks every enemy within 4". Downside: Ivory is marked for the enemy until its next activation. | ✅ implemented (`markRadius: 4, selfMark`) |

## Bayonet (melee)

| Nature | Name | Effect | Engine |
|---|---|---|---|
| **Field** | Fixed Bayonet | +1 Pen. | ✅ implemented (`pen: 1`) |
| **Tuned** | Spotter's Thrust | +2 Pen vs a target your side has marked. | ✅ implemented (`vsPainted: 2`) |
| **Prototype** | Flare Bayonet | A landed thrust marks the target. Downside: +1 heat a strike. | ✅ implemented (`bayonetMark, shotHeat: 1`) |

## Synergy

Only one mark per target (latest wins); marks clear when Ivory next activates, so the flare wants to go early in the round and the squad follows up.

Engine: on-hit riders run in `resolveRiders` (`shared/game-state.js`) after the attack's heat; Penetration / ROF hooks live in `penBreakdown` / `effectiveRof` (`shared/combat.js`). Tests: `shared/new-rigs.test.js`.
