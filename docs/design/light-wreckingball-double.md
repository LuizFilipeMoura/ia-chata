# Rig design — `light-wreckingball-double`

**Weapons:** Double MG (long-range) · Wrecking Ball (melee) · **Class:** light
**Focus:** hunter — a fast, fragile light chassis built to run rigs down and dismantle them. The Double MG is a flanker's weapon (Raking Fire: brutal from side/rear, useless head-on), so the whole rig exists to reach exposed arcs; the Wrecking Ball knocks rigs around to help set them up. The anti-anvil: mobility, flanking, and crippling rather than holding ground.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Relevant weapon stats (from `shared/game-state.js`):
- Double MG: ROF 8, STR 6, sweet 9″, max 20″ — a mid-range bullet-hose (volume, not punch). **Raking Fire** perk: side +4, rear +8, **front arc auto-fails** ([combat.js:87](../../shared/combat.js)) — a flanker's gun.
- Wrecking Ball: melee, ROF 1, STR 12 — one devastating swing.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4, **heat cap 6 (highest)**, 3 actions. Fast and fragile; can run hot.

## Double MG (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Gyro Mount | Reroll one missed to-hit die. Reliable accuracy on the volume gun. | `Reroll one missed to-hit die` | ✅ coded (`rerollMisses: 1`) |
| **Tuned** | Suppressive Fire | Land **4+ hits** on a target in one attack → it loses **1 action** next activation. Volume becomes control; sets up the smash. | `4+ hits pins the target (−1 action)` | 🔧 new — small (count hits → action penalty) |
| **Prototype** | Kneecapper | The MG rakes exposed appendages from **any arc — legs or arms, even on the front** (the frontal hull is the armored face it bounces off; limbs stick out). Sustained fire dismantles a limb progressively: focus one limb and track cumulative rake damage; at **half SP** it's *functionally crippled* (legs → Speed halved, no Sprint; arm → that weapon can't aim / half ROF); at **0** it's destroyed (legs → immobilised; arm → weapon dead). **Downside:** Kneecapper fire **only ever hits limbs — never hull or engine.** You can cripple, never kill — hand the finish to the Wrecking Ball or an ally. Switching limbs resets the ramp. | `Rake legs/arms from any arc to cripple then destroy them — but never touches hull or engine` | 🔧 new — large (limbs-only targeting incl. front arc, per-limb cripple ramp: half = debuff / 0 = destroy) |

## Wrecking Ball (melee)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Haymaker | +3 STR (12 → 15). Reliable massive swing. | `+3 STR` | ✅ coded (`{ str: 3 }`) |
| **Tuned** | Momentum Swing | If the Rig **advanced this activation**, +2 STR and knock the target back 3″. Rewards the fast charge-in. | `Charge in for +2 STR and a knockback` | 🔧 new — small (moved-flag + push) |
| **Prototype** | Tow Chain | On a damaging hit (usable every **3 turns**), **fling the target up to 4″** in a direction you choose — off an objective, into terrain, into your killzone. **Downside:** +2 heat and you **can't move** the turn you heave. | `Yank a rig 4″ where you want it — but it roots you and runs you hot` | 🔧 new — large (chosen forced movement) |

## Internal synergy & cap

- **Kneecapper** saws the legs → target immobilised → **Momentum Swing** charges in for a guaranteed +2 STR knockback. Or **Suppressive Fire** pins (−1 action) to set up the swing.
- **Kneecapper and Tow Chain are both Prototype**, and a rig runs at most one — deny mobility by crippling legs *or* deny position by flinging rigs around.

## Decided values (all tunable)

- Suppressive Fire: **4+ hits** in one attack → target −1 action next activation.
- Momentum Swing: **+2 STR + 3″ knockback** when the Rig advanced this activation.
- Kneecapper: MG hits **limbs only, any arc** (legs/arms incl. front; never hull/engine); per-limb cripple ramp — **half SP → functional cripple** (legs: Speed halved / no Sprint; arm: no aimed shots / half ROF), **0 → destroyed**; switching limbs resets progress.
- Tow Chain: **4″ fling**, **+2 heat**, roots you that turn, usable **every 3 turns**.

## Engine work to build later (when the `nature` system lands)

- **⚠️ Wire the Raking Fire rule (implementation pass):** add `perks: ["Raking Fire"]` to the base **Double MG** (and Mini Gun) in `WEAPONS.longRange` so front-arc auto-fail actually applies — Kneecapper's whole premise. Coded + tested but not attached ([combat.js:87](../../shared/combat.js)). Update `rules.md`; recheck MG-firing tests.
- Add `nature: "field" | "tuned" | "prototype"` to each `WEAPON_UPGRADES` entry; badge in the wizard; enforce **max one Prototype per rig** (wizard + server).
- ✅ Ready to wire now: Gyro Mount (`rerollMisses`), Haymaker (`str`).
- 🔧 Suppressive Fire: count landed hits in the attack; if ≥ 4, set target `actionPenaltyNextActivation`.
- 🔧 Momentum Swing: if attacker advanced this activation, +2 Chainsaw... (Wrecking Ball) STR and push target 3″ (reuse Staggering-style positional push).
- 🔧 Kneecapper: restrict the MG to limb locations (legs/arms) on every arc, bypassing the `arcBonus` Raking-Fire front auto-fail (combat.js:87) for limbs while hull/engine stay untouchable; per-limb cripple ramp — at half SP apply a functional debuff (legs → speed/immobilise state, partly present; arm → suppress that arm's aimed shots / ROF via part role), at 0 destroy the limb.
- 🔧 Tow Chain: on a damaging Wrecking Ball hit, a player-chosen forced move of up to 4″; +2 heat; root the attacker that turn; 3-turn cooldown.
