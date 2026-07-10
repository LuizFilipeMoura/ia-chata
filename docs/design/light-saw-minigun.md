# Rig design — `light-saw-minigun`

**Weapons:** Mini Gun (long-range) · Circular Saw (melee) · **Class:** light
**Focus:** attrition grinder — doesn't burst-kill; it permanently wears rigs down until they're crippled husks. The Mini Gun grinds **tempo** (suppress → pin); the Circular Saw grinds **durability** (Sunder → permanent max-SP loss that never heals). Weak in a quick trade, brutal over 5 rounds.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**, **no battlefield / spatial mechanics** (SP, heat, actions, engagement, status flags only). Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Relevant weapon stats (from `shared/game-state.js`):
- Mini Gun: ROF 8, STR 4, sweet 7″, max 18″. **Machine gun → Raking Fire:** side +4, rear +8, **front arc auto-fails** ([combat.js:87](../../shared/combat.js)). A short-range volume flanker. (⚠️ Raking Fire is coded + tested but **not yet wired onto the base weapon** — see engine notes; it must be attached to Mini Gun + Double MG.)
- Circular Saw: melee, ROF 3, STR 6.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4, heat cap 6, 3 actions. Fast, fragile.

## Mini Gun (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Suppressive Fire | Gains Shock — every hit halves the target's speed next round. Reliable, always-on suppression. | `Gains Shock (speed halved)` | ✅ coded (Shock) |
| **Tuned** | Extended Belt | +2 ROF (8 → 10), but dice showing a 1 add heat. More dakka, managed hot. | `+2 ROF; 1s add heat` | ✅ coded (`rof`, `heatOnOnes`) |
| **Prototype** | Suppression Lock | Each **consecutive** turn you fire the Mini Gun at the **same target**, add a Suppression stack (tracked): **1** = speed halved; **2** = −1 action; **3** = immobilised + can't Prepare. Switching targets resets. **Downside:** sustained fire runs hot (**+1 heat/turn** while locked) and you can't spread fire — all-in on one victim. | `Grind one target down turn by turn until it's pinned and can't act` | 🔧 new — medium (per-target suppression ramp) |

## Circular Saw (melee) — ROF 3, STR 6

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Tempered Teeth | Gains Armour Piercing. Reliable bite through armor. | `Gains Armour Piercing` | ✅ coded (AP) |
| **Tuned** | Sunder | On a damaging hit, **−1 max SP** to the struck location — permanent, never repaired back. Grinds durability over a long fight; does nothing in a quick trade. | `Permanently strips max SP from what it hits` | ✅ coded (`onDamage: sunder`) |
| **Prototype** | Dismember | Track total max SP your Sunder-grinding strips from each location. When a location's **max SP is ground to half**, that location is **crippled** even with SP left — legs → immobilised, arm → its weapon dead, hull/engine → the rig **can't repair at all**. **Downside:** pure grind — you must keep sawing the same location in melee (fragile light), and it does nothing fast. | `Saw a location in half to cripple it for good — a slow, committed grind` | 🔧 new — large (per-location cumulative max-SP tracking → cripple) |

## Internal synergy & cap

- **Two attrition axes:** the Mini Gun grinds **tempo** (suppress → pin so they can't escape the saw); the Circular Saw grinds **durability** (Sunder → Dismember, permanent max-SP loss). Victims can't act *and* can't recover — they decay across the match.
- **Cap:** Suppression Lock (grind tempo to a pin) *or* Dismember (grind durability to a cripple).

## Decided values (all tunable)

- Suppression Lock: ramp **1 = speed halved / 2 = −1 action / 3 = immobilised + no Prepare**; resets on target switch; +1 heat/turn while locked.
- Dismember: location crippled when its **max SP is ground to half** by Sunder.
- Sunder: **−1 max SP** per damaging hit (as coded).

## Engine work to build later (when the `nature` system lands)

- **⚠️ Wire the Raking Fire rule (do this at implementation — the user flagged it):** add `perks: ["Raking Fire"]` to the base **Mini Gun** and **Double MG** in `WEAPONS.longRange` so `arcBonus` actually applies (side +4 / rear +8 / front auto-fail). It's coded + tested ([combat.js:87](../../shared/combat.js), [combat.test.js](../../shared/combat.test.js)) but not attached to the weapons. Update `rules.md` to match, and check the MG-firing tests (combat.test / battle-view.test) don't assume front-arc hits.
- Add `nature: "field" | "tuned" | "prototype"` to each `WEAPON_UPGRADES` entry; badge in the wizard; enforce **max one Prototype per rig** (wizard + server).
- ✅ Ready to wire now: Suppressive Fire (Shock), Extended Belt (`rof` + `heatOnOnes`), Tempered Teeth (AP), Sunder (`onDamage`).
- 🔧 Suppression Lock: per-(target) consecutive-fire counter on the Mini Gun; apply speed/action/immobilise by stack; +1 attacker heat/turn; reset on target switch.
- 🔧 Dismember: per-location cumulative Sunder tracking; at half original max SP, set a `crippled` flag with the location-appropriate effect (legs immobilise / arm weapon-dead / hull-engine no-repair).
