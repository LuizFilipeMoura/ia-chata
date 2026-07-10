# Rig design — `light-sword-arc`

**Weapons:** Arc Gun (long-range) · Sword (melee) · **Class:** light
**Focus:** heat-warfare duelist (electro-fencer) — a fast light energy-fencer that weaponizes heat: cook the enemy past their misfire threshold and jam their systems with the Arc Gun, then execute the malfunctioning target with a precise blade. Weaponizes its own high heat cap.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Relevant weapon stats (from `shared/game-state.js`):
- Arc Gun: ROF 2, STR 10, sweet 20″, max 32″ — the game's energy weapon; its stock upgrades push enemy heat and jam systems.
- Sword: melee, ROF 2, STR 6, precise — a light finesse blade.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4, **heat cap 6 (highest, tied)**, 3 actions. Fast, fragile, can run hot safely.

## Arc Gun (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Ion Burn | Gains Incendiary — +1 heat on the target per hit. Reliable heat pressure; every shot chips toward their misfire threshold. | `+1 heat to target on hit` | ✅ coded (Incendiary) |
| **Tuned** | Systems Overload | On hit, the target loses 1 action next activation. Big tempo denial — situational, huge vs an active enemy. | `On hit: target loses 1 action` | ✅ coded (`onHit: systems-overload`) |
| **Prototype** | Ion Storm | An overcharged EMP bolt: next activation the target **can't Prepare, can't use equipment actives, loses 1 action**, and takes a 2-heat spike. **Downside:** the discharge overloads *your* capacitors — **+3 heat to yourself, and the Arc Gun refuses its next attempt** (which clears the overload). | `Fry a rig's systems for a turn — but it overloads and locks your own gun` | ✅ implemented (`noActivesNextActivation` / `noPrepNextActivation` on target, `arcLockedNext` on attacker) |

## Sword (melee) — ROF 2, STR 6, precise

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Duelist's Balance | Gains Precision — aimed cuts ignore the −2 penalty. Reliable finesse; pick your location. | `Aimed cuts ignore the aim penalty` | ✅ coded (Precision) |
| **Tuned** | Opportunist | +3 STR vs a target that's **overheated (heat over its class's Heat Capacity) or carrying an action penalty into its next activation** — the sword executes what the Arc Gun broke. Dead vs a healthy target. | `+3 STR vs disrupted / overheated targets` | ✅ implemented (`vsDisrupted` check) |
| **Prototype** | Superconductor Edge | The blade is wired to the Arc capacitors. While you're **over half your class's heat cap**: +2 STR, and **once per attack** (not per hit) **1 heat transfers from you to the target** (vent through the blade). Turns your own overheating into *theirs*. **Downside:** only works while you run hot (sitting near your own misfire threshold), and you must be in melee (fragile light). | `Run hot and dump your heat into them through the blade` | ✅ implemented (`superconductor` heat-transfer check) |

## Internal loop & cap

The rig's whole kit is **heat as a weapon**:
- Ion Burn chips their heat → Systems Overload / Ion Storm cook + jam them → **or** Superconductor Edge dumps *your* heat into them → the overheating, action-starved target → **Opportunist** sword finishes it.
- **Cap:** Ion Storm (burst EMP, self-heat cost) *or* Superconductor Edge (sustained heat-transfer duelist) — both Prototype, pick one.
- **Caveat:** heat warfare is dead vs Tanks / Walkers (no heat); the rig falls back on raw Arc STR 10 + a precise sword.

## Decided values (all tunable)

- Opportunist: **+3 STR** vs a target overheated or carrying an action penalty into its next activation.
- Ion Storm: system lockout (no Prepare / no actives / −1 action) + **2-heat spike** on the target; **self-cost +3 heat and the Arc Gun's next fire attempt is refused** (which clears the overload).
- Superconductor Edge: gated at **over half heat cap**; **+2 STR**, **transfer 1 heat once per attack** (not per hit) from attacker to target.

## As built

All six upgrades above are live in the engine (`shared/game-state.js` `WEAPON_UPGRADES`, `shared/combat.js`). Nature badges and the max-one-Prototype-per-rig guard are wired in the wizard and server. None of this rig's upgrades are spatial.
