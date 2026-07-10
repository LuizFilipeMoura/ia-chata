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
| **Prototype** | Barrage | Spend an action to designate a point **within Mortar range (6″–34″)** → it becomes a **shelled 3″ zone for 2 rounds**; any rig starting or ending its activation there takes **1 SP** each round. Area denial / objective lockdown. **Downside:** the Mortar is **locked** to the barrage (can't fire elsewhere) while it's up, and it costs heat each round you sustain it. | `Shell a zone for 2 rounds — but your mortar is locked to it and runs hot` | 🔧 new — large (persistent zone + per-round upkeep, obeys 6″–34″ envelope) |

## Lance (melee) — ROF 1, STR 11, +1 acc, reach 2″

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Couched Reach | **+2″ reach** — doubles the Lance's 2″ to **4″**. Strike well outside normal melee; hit chargers before they reach you. | `Doubles melee reach to 4″` | ✅ coded as `range: 1`; bump to **+2** |
| **Tuned** | Full Tilt | If the Rig **advanced ≥ half Speed** this activation, +3 STR (11 → 14). The couched charge; nothing if you stand still. | `Charge in for +3 STR` | 🔧 new — small (moved-flag + STR) |
| **Prototype** | Skewer | On a damaging Lance hit, the melee **engagement** becomes an impaling pin: while Skewered, the target **can't Disengage without taking a free Lance strike (STR 11)** as it tears free. It's stuck bleeding on your lance until it pays in armor to leave — or you finish it. **Downside:** you're engaged too (can't reposition without Disengaging yourself), lance committed — a third rig can punish the rooted duel. | `Impale a rig in the melee lock — leaving you costs it a free lance hit` | 🔧 new — medium (skewered flag on the `engagedWith` link + free-strike reaction on the target's Disengage) |

## Internal synergy & cap

- **Full Tilt** charges in for the big thrust; **Couched Reach** lets you land it (or the first blow of a Skewer) from 4″. **Airburst** flushes an entrenched target out into the open where the Lance can reach.
- **Barrage and Skewer are both Prototype**, so a rig runs at most one — and the range rule reinforces it: you *can't* Barrage a Skewered target anyway (pinned in melee, inside the 6″ dead zone). Pick artillery zone-denial **or** the single-target pin.

## Decided values (all tunable)

- Couched Reach: **+2″** (reach 2″ → 4″).
- Full Tilt: **+3 STR** when the Rig advanced ≥ half Speed this activation.
- Barrage: point within **6″–34″**; **3″ radius**, **2 rounds**, **1 SP/round** to rigs starting/ending activation inside; Mortar locked + heat/round upkeep.
- Skewer: on a damaging Lance hit, the engagement is Skewered; the target's Disengage provokes a **free STR-11 Lance strike**.

## Engine work to build later (when the `nature` system lands)

- Add `nature: "field" | "tuned" | "prototype"` to each `WEAPON_UPGRADES` entry; badge in the wizard; enforce **max one Prototype per rig** (wizard + server).
- ✅ Ready to wire now: Cluster Shells (`onHit`), Airburst Fuze (`ignoreCover`); Couched Reach (change its `range` effect from 1 to **2**).
- 🔧 Full Tilt: if attacker advanced ≥ half Speed this activation, +3 Lance STR.
- 🔧 Barrage: designate a target point (validate 6″–34″ from firer); persistent 3″ zone with a 2-round timer; each round deal 1 SP to rigs inside on activation start/end; lock the Mortar and add heat upkeep while active.
- 🔧 Skewer: add a `skewered` flag to the `engagedWith` link on a damaging Lance hit; when the pinned target runs the `disengage` action, first resolve a free STR-11 Lance strike from the skewerer (reuse the `return`/counter-attack resolution path).
