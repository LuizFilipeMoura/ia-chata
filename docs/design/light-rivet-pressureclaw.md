# Rig design — `light-rivet-pressureclaw`

**Weapons:** Rivet Gun (long-range) · Pressure Claw (melee) · **Class:** light
**Focus:** attrition — an industrial light brawler that grinds a target down location by location. The Rivet Gun stitches pins into a rig at spitting range (and can seize a location shut); the Pressure Claw crushes locations open in melee. All effects are state-tracked — no spatial mechanics.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, no mirror matchups. Upgrades follow the Field / Tuned / Prototype nature system (pick one per weapon, max one Prototype per rig).

Relevant weapon stats (from `shared/game-state.js`):
- Rivet Gun: ROF 6, STR 4, sweet 6", max 14" — a rapid, low-STR, very short-range fastener gun (shortest max range in the table). Volume, not punch.
- Pressure Claw: melee, ROF 2, STR 9, ACC [1,1] — a hydraulic crushing claw.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4 base; this chassis 13 / 11 / 10 / 9.

## Rivet Gun (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Rapid Feed | +2 ROF (6 → 8). | `+2 ROF` | ✅ coded (`{ rof: 2 }`) |
| **Tuned** | Staple Burst | Land 4+ hits in one attack → target loses 1 action next activation. | `4+ hits pins the target (−1 action)` | ✅ implemented (`pinOnHits: 4`) |
| **Prototype** | Rivet Lock | Consecutive damaging volleys on the SAME location stack rivets there; switching target or location resets the stack. At 3 rivets the location seizes: its SP can't be repaired and, if it's a weapon-role location (a rig's Arms), that rig's long-range weapon jams for a round. The attacker runs +1 heat every rivet volley while stacking. Fully non-spatial. | `Rivet a location shut — no repairs, jams a weapon there` | ✅ implemented (`rivetLock`; per-location stacks + seize, swept in Recovery) |

## Pressure Claw (melee)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Hardened Jaws | Gains Armour Piercing. | `Gains Armour Piercing` | ✅ coded (`{ perks: ["Armour Piercing"] }`) |
| **Tuned** | Crush Grip | On a damaging hit: −1 max SP to the struck location (permanent grind). | `On damaging hit: −1 max SP to struck location` | ✅ implemented (`onDamage: "sunder"`) |
| **Prototype** | Hydraulic Vice | A damaging hit clamps the struck location's armour open: +2 impact from anyone for a two-round crack window. | `Pry a location's armour open (+2 impact from anyone)` | ✅ implemented (`breachGrip`) |

## Internal synergy & cap

- Rivet Lock seizes a location (no repair) → Crush Grip grinds its max SP down → the location can't be healed back. Focus fire is rewarded.
- Rivet Lock (jam the gun arm) and Hydraulic Vice (crack a location) both punish sitting still in front of this rig.

## Decided values (all tunable)

- Rivet Gun: ROF 6, STR 4, sweet 6", max 14". Pressure Claw: STR 9.
- Rivet Lock: 3 rivets on one location → repair-locked + long-range jammed if the location is Arms; +1 self-heat per volley; two-Recovery expiry.
- Crush Grip: −1 max SP struck location. Hydraulic Vice: +2 impact crack (two rounds).
- SP: Hull 13 / Arms 11 / Legs 10 / Engine 9.

## As built

All six upgrades are live in `shared/game-state.js` and `shared/combat.js`. No spatial mechanics — every effect is tracked state.
