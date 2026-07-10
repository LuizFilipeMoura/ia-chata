# Rig design — `light-saw-minigun`

**Weapons:** Mini Gun (long-range) · Circular Saw (melee) · **Class:** light
**Focus:** attrition grinder — doesn't burst-kill; it permanently wears rigs down until they're crippled husks. The Mini Gun grinds **tempo** (suppress → pin); the Circular Saw grinds **durability** (Sunder → permanent max-SP loss that never heals). Weak in a quick trade, brutal over a full 10-round match.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**, and **spatial effects resolve as narrated player instructions** (the app is a tabletop assistant, not a simulator — the engine tracks SP, heat, actions, engagement, and status flags, and tells the player what to do on the table). Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Relevant weapon stats (from `shared/game-state.js`):
- Mini Gun: ROF 8, STR 4, sweet 7″, max 18″. **Machine gun → Raking Fire:** side +4, rear +8, **front arc auto-fails** ([combat.js:87](../../shared/combat.js)) — wired onto the base weapon (`perks: ["Raking Fire"]` in `WEAPONS.longRange`). A short-range volume flanker.
- Circular Saw: melee, ROF 3, STR 6.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4, heat cap 6, 3 actions. Fast, fragile.

## Mini Gun (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Suppressive Fire | Gains Shock — every hit halves the target's speed next round. Reliable, always-on suppression. | `Gains Shock (speed halved)` | ✅ coded (Shock) |
| **Tuned** | Extended Belt | +2 ROF (8 → 10), but dice showing a 1 add heat. More dakka, managed hot. | `+2 ROF; 1s add heat` | ✅ coded (`rof`, `heatOnOnes`) |
| **Prototype** | Suppression Lock | Each **consecutive** turn you fire the Mini Gun at the **same target**, add a Suppression stack (tracked, caps at 3): **1** = speed halved next round; **2** = also −1 action next activation; **3** = also pins the target in place (can't Move, Sprint, or Jump Jets) and blocks its next Prepare entirely. This is a **scoped, self-clearing pin** (`suppressImmobile`) — it clears every Recovery and must be re-applied by continued fire, *not* the permanent leg-destruction immobilise. Switching targets resets the count to 1. **Downside:** sustained fire runs hot (**+1 heat every attack** while locked) and you can't spread fire — all-in on one victim. | `Grind one target down turn by turn until it's pinned and can't act` | ✅ implemented (per-target `suppressStacks` ramp) |

## Circular Saw (melee) — ROF 3, STR 6

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Tempered Teeth | Gains Armour Piercing. Reliable bite through armor. | `Gains Armour Piercing` | ✅ coded (AP) |
| **Tuned** | Sunder | On a damaging hit, **−1 max SP** to the struck location — permanent, never repaired back. Grinds durability over a long fight; does nothing in a quick trade. | `Permanently strips max SP from what it hits` | ✅ coded (`onDamage: sunder`) |
| **Prototype** | Dismember | The escalation of Sunder: a damaging Saw hit strips **−1 max SP** from the struck location **and** checks for a cripple. Once that location's max SP is ground to **≤ half its commissioned original**, it is **permanently crippled** (once) — legs → immobilised for good, arm → a weapon destroyed, hull/engine → that location **can never be repaired again** (`noRepair`). **Downside:** pure grind — you must keep sawing the same location in melee (fragile light), and it does nothing fast. | `Saw a location in half to cripple it for good — a slow, committed grind` | ✅ implemented (per-location `origMax` yardstick + `crippled`/`noRepair` maps) |

## Internal synergy & cap

- **Two attrition axes:** the Mini Gun grinds **tempo** (suppress → pin so they can't escape the saw); the Circular Saw grinds **durability** (Sunder → Dismember, permanent max-SP loss). Victims can't act *and* can't recover — they decay across the match.
- **Cap:** Suppression Lock (grind tempo to a pin) *or* Dismember (grind durability to a cripple).

## Decided values (all tunable)

- Suppression Lock: ramp **1 = speed halved next round / 2 = also −1 action next activation / 3 = also a scoped self-clearing pin (`suppressImmobile`) + no Prepare**; resets on target switch; +1 heat every attack while locked; stack 3's pin clears each Recovery, not permanent.
- Dismember: location crippled (once) when its **max SP is ground to ≤ half its commissioned original** by the saw's own Sunder-style chip.
- Sunder: **−1 max SP** per damaging hit (as coded).

## As built

All six upgrades above are live in the engine (`shared/game-state.js` `WEAPON_UPGRADES`, `shared/combat.js`), and the Raking Fire rule is wired onto both Mini Gun and Double MG (`WEAPONS.longRange`). Nature badges and the max-one-Prototype-per-rig guard are wired in the wizard and server.
