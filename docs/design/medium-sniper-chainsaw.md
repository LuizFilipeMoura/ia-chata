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
| **Tuned** | Cold Bore | +3 STR (12 → 15) vs a target whose **every location** (Hull/Arms/Legs/Engine) is at max SP (undamaged). Rewards opening on fresh targets; nothing once they're hurt. | `+3 STR vs undamaged targets` | ✅ implemented (`coldBore` all-locations-max-SP check) |
| **Prototype** | Enfilade | Only **aimed** Sniper Cannon shots feed a per-rig counter; on every **3rd** aimed shot, the engine emits a player instruction — *"Enfilade — ricochet! Resolve a +2 STR hit on the next rig in line of sight behind &lt;target&gt; (player's choice)."* The player picks the rig behind the target (they know line of sight) and applies the +2 STR hit via the normal attack/damage controls. Only the aimed-shot cadence is tracked in state — the ricochet itself is narrated, not auto-resolved. No positioning requirement — the every-3rd cadence is the whole cost. | `Every 3rd aimed shot ricochets to a rig the target can see (you resolve the hit)` | ✅ implemented (`enfiladeShots` cadence counter; the ricochet is a player instruction) |

## Chainsaw (melee)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Ripper Teeth | Gains Rend (+D3 per raw 5–6). Reliable extra bite on the multi-hit saw. | `Gains Rend` | ✅ coded (Rend perk) |
| **Tuned** | Bloodletter | +1 ROF (3 → 4, an extra bite) vs a target that's **already damaged** (missing SP anywhere). The finisher half of the loop. | `Extra hit vs damaged targets` | ✅ implemented (`vsDamaged: { rof: 1 }`) |
| **Prototype** | Redline Governor | +1 STR **and** +1 to-hit die per point the attacker's own heat is **over its class's Heat Capacity** (max **+3 / +3** at +3 over). Rewards running dangerously hot. **Downside is built in:** you're overheating — misfire risk on ranged shots + all overheat penalties. | `The hotter you run, the harder it bites` | ✅ implemented (`redline` heat-over-cap check) |

## Internal synergy & cap

- **Cold Bore + Bloodletter** (both Tuned, both selectable) = the kill loop: snipe the fresh target for burst → chainsaw the wounded to finish.
- **Enfilade and Redline Governor are both Prototype**, and a rig runs at most one — so the player picks the patient ricochet-sniper *or* the reckless overheating berserker. Never both.

## Decided values

- Cold Bore: **+3 STR** vs undamaged (target at full SP).
- Bloodletter: **+1 ROF** vs damaged (target missing SP anywhere).
- Redline Governor: **+1 STR / +1 hit per point over heat cap, capped +3 / +3**.
- Enfilade: **+2 STR** on the ricochet (player-resolved); triggers on every **3rd aimed shot** (non-aimed shots don't advance the counter); the player picks the rig in **line of sight behind the primary target**; no stationary requirement.

## As built

All six upgrades above are live in the engine (`shared/game-state.js` `WEAPON_UPGRADES`, `shared/combat.js`). Nature badges and the max-one-Prototype-per-rig guard are wired in the wizard and server. Enfilade's ricochet is a **player instruction** — per [AGENTS.md](../../AGENTS.md) ("the app is a tabletop assistant, not a simulator"), the engine only tracks the aimed-shot cadence and narrates the ricochet for the players to resolve via the normal attack controls.
