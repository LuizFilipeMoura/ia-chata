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
| **Tuned** | Pinning Burst | Land **4+ hits** on a target in one attack → it loses **1 action** next activation. Volume becomes control; sets up the smash. | `4+ hits pins the target (−1 action)` | ✅ implemented (`pinOnHits: 4` → `actionPenaltyNextActivation`) |
| **Prototype** | Kneecapper | The MG rakes exposed appendages from **any arc — legs or arms, even on the front**: every shot is remapped onto a limb location if it isn't already one, and against limbs it bypasses its own Raking Fire front-arc auto-fail at the side-arc value (**+4 STR**); side/rear keep their normal Raking Fire bonuses. **Hull and Engine can never be damaged by it, on any arc — not even the §8 cook-off/cascade spills into them** (it cripples, never kills). A limb it has actually raked (per-limb tagged) to **≤ half max SP** is progressively crippled: a raked Leg keeps re-flagging Speed halved next round for as long as it stays at or below half; a raked Arm halves **that Rig's own ROF, all weapons** (floors at 1 die), until repaired back above half. Only limbs a Kneecapper actually hit ramp — ordinary weapons impose no half-limb debuff — and a raked limb repaired above half is re-armable, so **switching limbs resets the ramp**. | `Rake legs/arms from any arc to cripple them — but never touches hull or engine` | ✅ implemented (per-limb `kneecapped` tag gates the cripple ramp; `noSpill` blocks the cook-off cascade) |

## Wrecking Ball (melee)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Haymaker | +3 STR (12 → 15). Reliable massive swing. | `+3 STR` | ✅ coded (`{ str: 3 }`) |
| **Tuned** | Momentum Swing | If the Rig **advanced this activation** (Moved or Sprinted), +2 STR. When such a charging swing lands ≥1 damaging hit, the engine emits a player instruction — *"Momentum Swing — knock &lt;target&gt; back 3″ (move the mini)."* The 3″ knockback is narrated for the players to resolve on the board, not a simulated position. Rewards the fast charge-in. | `Charge in for +2 STR and a knockback (you move the mini 3″)` | ✅ implemented (+2 STR simulated; knockback is a player instruction) |
| **Prototype** | Tow Chain | On a damaging hit, if the chain is charged (off cooldown), the engine emits a player instruction — *"Tow Chain — fling &lt;target&gt; up to 4″ in a direction you choose (move the mini). You are rooted until end of activation; +2 heat."* The **4″ fling itself is narrated** (players move the mini); the attacker's own **+2 heat** and **rooted-for-the-rest-of-the-activation** cost are simulated. Goes on a **3-round cooldown** after use; while recharging the Wrecking Ball hits normally with no fling. | `Yank a rig 4″ where you want it — but it roots you and runs you hot` | ✅ implemented (+2 heat, root-this-activation, and 3-round cooldown simulated; the 4″ fling is a player instruction) |

## Internal synergy & cap

- **Kneecapper** saws a leg → it stays speed-halved while raked → **Momentum Swing** charges in for a guaranteed +2 STR (and the resolution log tells the players to move the target back 3″ on a landed hit). Or **Pinning Burst** pins (−1 action) to set up the swing.
- **Kneecapper and Tow Chain are both Prototype**, and a rig runs at most one — deny mobility/tempo by crippling limbs *or* deny position by flinging rigs around (as a narrated instruction).

## Decided values (all tunable)

- Pinning Burst: **4+ hits** in one attack → target −1 action next activation.
- Momentum Swing: **+2 STR** (simulated) when the Rig advanced this activation; a landing charge swing also emits a 3″-knockback player instruction.
- Kneecapper: MG hits **limbs only, any arc** (legs/arms incl. front, remapped if needed; never hull/engine, no cook-off spill); front-arc bypass at **+4 STR** (the Raking Fire side value); a Kneecapper-tagged limb at **≤ half max SP** is progressively crippled — leg: Speed halved next round while it stays at/below half; arm: this Rig's own ROF halved (all weapons, floors at 1) until repaired above half; switching limbs resets progress.
- Tow Chain: **4″ fling** (player instruction), **+2 heat**, roots you for the rest of that activation, **3-round cooldown** from use.

## As built

All six upgrades above are live in the engine (`shared/game-state.js` `WEAPON_UPGRADES`, `shared/combat.js`). The Raking Fire rule is wired onto both Double MG and Mini Gun (`WEAPONS.longRange`). Nature badges and the max-one-Prototype-per-rig guard are wired in the wizard and server. Momentum Swing's knockback and Tow Chain's fling are **player instructions** — per [AGENTS.md](../../AGENTS.md) ("the app is a tabletop assistant, not a simulator"), the engine tracks and simulates the SP/heat/cooldown side of each mechanic and narrates the spatial resolution for the players to carry out on the table.
