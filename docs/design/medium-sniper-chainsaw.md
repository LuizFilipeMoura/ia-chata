# Rig design — `medium-sniper-chainsaw`

**Weapons:** Sniper Cannon (long-range) · Chainsaw (melee) · **Class:** medium
**Focus:** precision hunter — alpha-strike a *fresh* target from long range, then the chainsaw executes anything *wounded*, or punishes anything fast enough to close on the sniper. The two weapons feed a kill sequence instead of fighting each other.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

The pairing has built-in tension — the Sniper Cannon (28″, wants distance) and the Chainsaw (melee, wants to be adjacent). The kit resolves it: snipe fresh targets for burst, saw the wounded to finish, and keep the chainsaw as a get-off-me answer for fast rigs that close the gap.

Relevant weapon stats (from `shared/game-state.js`):
- Sniper Cannon: ROF 1, STR 12, sweet 22″, max 28″ — single long-range precision shot.
- Chainsaw: melee, ROF 3, STR 8 — multi-hit close-quarters shredder.
- Medium: Hull 7 / Arms 6 / Legs 6 / Engine 5, heat cap 5, 3 actions.

## Sniper Cannon (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Marksman Optics | Gains Precision — aimed shots ignore the −2 aim penalty. Reliable accuracy, the core sniper pick. | `Aimed shots ignore the aim penalty` | ✅ coded (Precision perk) |
| **Tuned** | Cold Bore | +3 STR (12 → 15) vs a target at **full SP** (undamaged). Rewards opening on fresh targets; nothing once they're hurt. | `+3 STR vs undamaged targets` | 🔧 new — small (check target SP == max) |
| **Prototype** | Enfilade | Every **3rd aimed shot** ricochets, after hitting the primary target, to another rig in **line of sight of that target** (+2 STR on the ricochet). No positioning requirement — the every-3rd cadence is the whole cost. | `Every 3rd aimed shot ricochets to a rig the target can see` | 🔧 new — large (target-relative LoS, chain hit, aimed-shot counter) |

## Chainsaw (melee)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Ripper Teeth | Gains Rend (+D3 per raw 5–6). Reliable extra bite on the multi-hit saw. | `Gains Rend` | ✅ coded (Rend perk) |
| **Tuned** | Bloodletter | +1 ROF (3 → 4, an extra bite) vs a target that's **already damaged** (missing SP anywhere). The finisher half of the loop. | `Extra hit vs damaged targets` | 🔧 new — small (check target SP < max) |
| **Prototype** | Redline Governor | +1 STR **and** +1 hit per point the Rig is **over its heat cap** (max **+3 / +3** at +3 over). Rewards running dangerously hot. **Downside is built in:** you're overheating — misfire risk on ranged shots + all overheat penalties. | `The hotter you run, the harder it bites` | 🔧 new — medium (reads heat-over-cap) |

## Internal synergy & cap

- **Cold Bore + Bloodletter** (both Tuned, both selectable) = the kill loop: snipe the fresh target for burst → chainsaw the wounded to finish.
- **Enfilade and Redline Governor are both Prototype**, and a rig runs at most one — so the player picks the patient ricochet-sniper *or* the reckless overheating berserker. Never both.

## Decided values

- Cold Bore: **+3 STR** vs undamaged (target at full SP).
- Bloodletter: **+1 ROF** vs damaged (target missing SP anywhere).
- Redline Governor: **+1 STR / +1 hit per point over heat cap, capped +3 / +3**.
- Enfilade: **+2 STR** on the ricochet; triggers on every **3rd aimed shot**; ricochet target must be in **line of sight of the primary (struck) target**; no stationary requirement.

## Engine work to build later (when the `nature` system lands)

- Add `nature: "field" | "tuned" | "prototype"` to each `WEAPON_UPGRADES` entry; badge in the wizard; enforce **max one Prototype per rig** (wizard + server).
- ✅ Ready to wire now: Marksman Optics (Precision), Ripper Teeth (Rend).
- 🔧 Cold Bore: conditional STR bonus when the target's every location is at max SP.
- 🔧 Bloodletter: conditional +1 ROF when the target is missing SP anywhere.
- 🔧 Redline Governor: read the attacker's heat-over-cap (`heat - HEAT_CAPACITY[class]`), add that (capped 3) to Chainsaw STR and hit count.
- 🔧 Enfilade: per-Rig aimed-shot counter; on every 3rd, after resolving the primary hit, pick a ricochet target in line of sight of the struck target and resolve a +2 STR hit on it (reuse the Cleave-style chain path).
