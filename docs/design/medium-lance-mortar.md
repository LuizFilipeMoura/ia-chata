# Rig design — `medium-lance-mortar`

**Weapons:** Mortar (long-range, indirect) · Lance (melee) · **Class:** medium
**Focus:** artillery dragoon — an indirect gun that zones the field from range and a pinning lance that answers anything closing inside the mortar's blind spot. Bombard, then skewer.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

The pairing has a built-in range story: the Mortar is **indirect** — min **6″**, max **34″** (longest reach in the game, arcs over cover, but can't fire inside 6″). The Lance is a STR-11 charge weapon that wants melee. The dead zone of one is the sweet spot of the other — the kit self-covers, and the Lance is specifically the answer to rigs that rush the artillery.

Relevant weapon stats (from `shared/game-state.js`):
- Mortar: ROF 3, STR 9, sweet 18″, **min 6″ / max 34″**, indirect.
- Lance: melee, ROF 1, STR 11, +1 acc, reach 2″.
- Medium: Hull 7 / Arms 6 / Legs 6 / Engine 5, heat cap 5, 3 actions.

## Mortar (long-range, indirect)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Cluster Shells | On hit, +1 SP to a second random location. Reliable spread on the arcing shell. | `On hit: 1 SP to a second location` | ✅ coded (`onHit: cluster-shells`) |
| **Tuned** | Airburst Fuze | Ignores cover. Dead vs a target in the open; brutal vs anyone entrenched — flushes cover-huggers. | `Ignores cover` | ✅ coded (`ignoreCover`) |
| **Prototype** | Barrage | The **Barrage** action (1 slot) commits the Mortar to a shelled zone: the engine emits a player instruction — *"Barrage — place a shelled-zone marker within 6–34″ of this Rig; it shells a 3″ zone for 2 rounds. Each round, apply 1 SP to every rig in the zone (players adjudicate who's inside)."* Placement and who's-in-the-zone are narrated for the players; the **2-round countdown, Mortar lock, and heat upkeep are simulated**. Area denial / objective lockdown. **Downside:** the Mortar is **locked** (can't fire a direct shot; melee unaffected) while it's up, and each **Recovery** adds **+1 heat** upkeep until the 2 rounds elapse. | `Shell a zone for 2 rounds — but your mortar is locked to it and runs hot` | ✅ implemented (`barrageRoundsLeft` countdown + Mortar lock + heat upkeep; the zone/placement is a player instruction) |

## Lance (melee) — ROF 1, STR 11, +1 acc, reach 2″

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Couched Reach | **+2″ reach** — doubles the Lance's 2″ to **4″**. Strike well outside normal melee; hit chargers before they reach you. | `Doubles melee reach to 4″` | ✅ coded (`range: 2`) |
| **Tuned** | Full Tilt | If the Rig **moved (Move or Sprint) at any point this activation** before striking, +3 STR (11 → 14). The couched charge; nothing if you stand still. | `Charge in for +3 STR` | ✅ implemented (`movedThisActivation` flag + `charge: 3`) |
| **Prototype** | Skewer | A damaging Lance hit that leaves the target locked to the skewerer impales it. While impaled, if the target **Disengages** it first eats a free **STR-11** Lance strike as it tears free, then the lock breaks as normal. The impale clears with the lock (a destroyed skewerer strikes nothing). **Downside:** you're engaged too (can't reposition without Disengaging yourself), lance committed — a third rig can punish the rooted duel. | `Impale a rig in the melee lock — leaving you costs it a free lance hit` | ✅ implemented (`skeweredBy` on the target + free-strike reaction on Disengage) |

## Internal synergy & cap

- **Full Tilt** charges in for the big thrust; **Couched Reach** lets you land it (or the first blow of a Skewer) from 4″. **Airburst** flushes an entrenched target out into the open where the Lance can reach.
- **Barrage and Skewer are both Prototype**, so a rig runs at most one — and the range rule reinforces it: you *can't* Barrage a Skewered target anyway (pinned in melee, inside the 6″ dead zone). Pick artillery zone-denial **or** the single-target pin.

## Decided values (all tunable)

- Couched Reach: **+2″** (reach 2″ → 4″).
- Full Tilt: **+3 STR** when the Rig moved (Move or Sprint) at any point this activation.
- Barrage: shelled zone placed **within 6″–34″** of the firer (narrated); **3″ radius**, **2 rounds**, **1 SP/round** to rigs in the zone (players adjudicate who's inside); Mortar locked + **1 heat/Recovery** upkeep — simulated.
- Skewer: on a damaging Lance hit that leaves the target locked to the skewerer, it's impaled; its Disengage provokes a **free STR-11 Lance strike** before the lock breaks.

## As built

All six upgrades above are live in the engine (`shared/game-state.js` `WEAPON_UPGRADES`, `shared/combat.js`). Nature badges and the max-one-Prototype-per-rig guard are wired in the wizard and server. Barrage's zone placement and occupancy are **player instructions** — per [AGENTS.md](../../AGENTS.md) ("the app is a tabletop assistant, not a simulator"), the engine simulates the countdown/lock/heat and narrates the spatial resolution for the players to carry out on the table.
