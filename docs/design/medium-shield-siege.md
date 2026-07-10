# Rig design — `medium-shield-siege`

**Weapons:** Siege Maul (long-range) · Bulwark Shield (melee) · **Class:** medium
**Focus:** siege anvil — slow, tanky objective-holder that closes and delivers crushing single blows. Doesn't chase; arrives, plants, refuses to move.

Design under the invariants in [AGENTS.md](../../AGENTS.md): every weapon is globally unique, each rig appears at most once on the field, **no mirror matchups** — so nothing here assumes the enemy has a shield. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Relevant weapon stats (from `shared/game-state.js`):
- Siege Maul: ROF 1, STR 13 (top of catalog), sweet 8″, max 16″ — a short-reaching "long range" single hammer-shot.
- Bulwark Shield: melee, unlocks the Raise Shield preparation (defensive reaction on the enemy turn).
- Medium: Hull 7 / Arms 6 / Legs 6 / Engine 5, heat cap 5, 3 actions.

Engine reality that shaped this: Raise Shield is a **preparation** — it only matters when the enemy attacks you on *their* turn. There is **no overwatch**, and a 3-action medium can already move-to-close *and* Prepare in one activation, so "advance under cover" buys nothing. Shield upgrades therefore amplify the enemy-turn survival / objective-lock loop, not in-move protection.

## Siege Maul (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Reinforced Head | +2 STR (13 → 15). Always-on crush. | `+2 STR` | ✅ `{ str: 2 }` — trivial |
| **Tuned** | Breaching Rounds | On a damaging **Hull** hit, that SP can't be repaired until end of next round. Pays off vs holders / repair-reliant rigs; dead vs a rig that never repairs. | `Hull SP struck can't be repaired` | ✅ already coded (`onDamage: "breaching-round"`) |
| **Prototype** | Piledriver Protocol | **Momentum system:** gain 1 Momentum each turn the Rig advances (cap 3). A Maul shot spends all Momentum → ignores the target's Brace + cover, +1 STR per Momentum, shoves target 3″. **Downside:** cannot Raise Shield on any turn you're storing Momentum (all-in on the charge, no guard). | `Store Momentum by advancing; unload a guard-breaking smash — but no shield while charging` | 🔧 new — tracked counter + shield-lock |

## Bulwark Shield (melee / defense)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Tower Shield | Raise Shield also negates the **side** arc, not just front. Pure defensive upside. | `Shield covers front + sides` | ✅ already coded (`shieldArc: "front-side"` / `shieldCoverage`) |
| **Tuned** | Anvil Boss | While your shield is raised, the **first** enemy to melee you each round eats an automatic counter-hit (**STR 6**, fixed = shield STR). Dead unless shield's up AND someone engages you. Punishes brawlers who pin the anvil. | `Counter the first melee attacker each round while braced` | 🔧 new — riposte hook, medium |
| **Prototype** | Emplacement | Enter a rooted fortress stance. While Emplaced: **Raise Shield is permanent** (auto-refreshes every round, no Prepare action, no Answer token — never caught un-braced), front (+sides w/ Tower Shield) negated every enemy turn. Become an objective near-impossible to dislodge; the enemy must approach (into Maul + Anvil Boss) or cede the point. **Downsides:** rooted (cannot move); action budget **3 → 2** while Emplaced; **un-planting costs +2 heat**; **usable only once every 3 turns** (cooldown measured from when you enter). | `Root into a permanent fortress shield — but immobile, 2 actions, +2 heat to leave, 3-turn cooldown` | 🔧 new — heavy: stance flag, 3-turn cooldown counter, action-budget override, heat-on-exit |

## Cap interaction

Piledriver Protocol and Emplacement are both **Prototype**, and a rig may run at most one Prototype — so the player picks **one**: the momentum-charging aggressor or the immovable fortress. Two distinct answers to "how does a slow anvil matter," never both.

## Decided values

- Anvil Boss counter STR: **6** (fixed, = shield STR).
- Emplacement un-plant: **+2 heat**.
- Emplacement cooldown: **3 turns**, measured from entering the stance.

## Engine work to build later (when the `nature` system lands)

- Add `nature: "field" | "tuned" | "prototype"` to each `WEAPON_UPGRADES` entry; badge in the wizard; enforce **max one Prototype per rig** (wizard + server).
- ✅ Ready to wire now: Reinforced Head (`str`), Breaching Rounds, Tower Shield.
- 🔧 Piledriver Protocol: per-Rig Momentum counter (+1 on advance, cap 3), spend-on-shot (guard-break + STR + shove), block Raise Shield while Momentum > 0.
- 🔧 Anvil Boss: on being meleed while `preparation.type === "raise-shield"`, apply a once-per-round auto counter-hit at STR 6.
- 🔧 Emplacement: stance flag on the Rig; permanent auto Raise Shield refresh; action budget → 2; rooted (block move); +2 heat on exit; 3-turn cooldown counter from entry.
