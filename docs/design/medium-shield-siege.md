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
| **Tuned** | Breaching Round | On a damaging **Hull** hit, that SP can't be repaired until end of next round. Pays off vs holders / repair-reliant rigs; dead vs a rig that never repairs. | `Hull SP struck can't be repaired` | ✅ coded (`onDamage: "breaching-round"`) |
| **Prototype** | Piledriver Protocol | **Momentum system:** gain **+1 Momentum** for any activation the Rig **advanced** (Moved or Sprinted), capped at 3, persisting between activations. A Maul shot spends **all** stored Momentum: the hit **ignores the target's Brace (no −2) and cover**, and gains **+1 STR per Momentum** spent (Momentum then resets to 0 whether or not the shot connected). When a Momentum-spending smash lands ≥1 damaging hit, the engine also emits a player instruction — *"Piledriver — shove &lt;target&gt; back 3″ (move the mini)."* The **guard-break and STR bonus are simulated**; the **3″ shove is narrated** for the players to resolve. **Downside:** cannot Raise Shield on any activation you're storing Momentum (> 0) — a requested Raise Shield downgrades to Brace (all-in on the charge, no guard). | `Store Momentum by advancing; unload a guard-breaking smash (you move the mini 3″) — but no shield while charging` | ✅ implemented (`momentum` counter + guard-break + STR simulated; the shove is a player instruction) |

## Bulwark Shield (melee / defense)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Tower Shield | Raise Shield also negates the **side** arc, not just front. Pure defensive upside. | `Shield covers front + sides` | ✅ already coded (`shieldArc: "front-side"` / `shieldCoverage`) |
| **Tuned** | Anvil Boss | While Raise Shield is up, the **first** enemy to **land a melee hit** on this Rig each round eats a free automatic counter-hit (**STR 6**, fixed = shield STR, ignores weight class and every other conditional bonus). A whiff (0 hits) doesn't provoke it and doesn't consume the round's riposte; ranged attacks never trigger it. Dead unless shield's up AND someone lands a melee hit on you. Punishes brawlers who pin the anvil. | `Counter the first melee attacker to land a hit each round while braced` | ✅ implemented (`ripostedThisRound` gate, `strOverride: 6`) |
| **Prototype** | Emplacement | The **Emplace** action (1 slot, 0 heat) roots the Rig into a fortress stance. While Emplaced: **Raise Shield is permanent** (auto-raised free at each activation start — no Prepare action, no Answer token — never caught un-braced), front (+sides w/ Tower Shield) negated every enemy turn. Become an objective near-impossible to dislodge; the enemy must approach (into Maul + Anvil Boss) or cede the point. **Downsides:** rooted — can't Move, Sprint, or Jump Jets; action budget **3 → 2** while Emplaced; the **Un-plant** action (1 slot) lifts the stance and **costs +2 heat**; Emplacing is on a **3-round cooldown** measured from when it was entered (re-enter no earlier than round-entered + 3). | `Root into a permanent fortress shield — but immobile, 2 actions, +2 heat to leave, 3-turn cooldown` | ✅ implemented (`emplaced` stance flag, 3-round cooldown, action-budget override, heat-on-exit) |

## Cap interaction

Piledriver Protocol and Emplacement are both **Prototype**, and a rig may run at most one Prototype — so the player picks **one**: the momentum-charging aggressor or the immovable fortress. Two distinct answers to "how does a slow anvil matter," never both.

## Decided values

- Anvil Boss counter STR: **6** (fixed, = shield STR); triggers only on a **landed** melee hit, **once per round**.
- Emplacement un-plant: **+2 heat**.
- Emplacement cooldown: **3 rounds**, measured from entering the stance.
- Piledriver shove: **3″**, narrated (player instruction), not simulated.

## As built

All six upgrades above are live in the engine (`shared/game-state.js` `WEAPON_UPGRADES`, `shared/combat.js`). Nature badges and the max-one-Prototype-per-rig guard are wired in the wizard and server. Piledriver Protocol's shove is a **player instruction** — per [AGENTS.md](../../AGENTS.md) ("the app is a tabletop assistant, not a simulator"), the engine simulates the Momentum/guard-break/STR math and narrates the 3″ shove for the players to carry out on the table.
