# Rig design — `light-harpoon-anchor`

**Weapons:** Harpoon (long-range) · Anchor (melee) · **Class:** light
**Focus:** control — a light tether rig that wins by pinning one target and refusing to let it leave. The Harpoon spears at range (Impale to lock legs; Taut Cable punishes anything already pinned); the Anchor chains a rig into the melee lock and denies the Disengage. The anti-runner: catch, hold, grind.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, no mirror matchups. Upgrades follow the Field / Tuned / Prototype nature system (pick one per weapon, max one Prototype per rig).

Relevant weapon stats (from `shared/game-state.js`):
- Harpoon: ROF 1, STR 12, sweet 14", max 22" — one heavy line-thrower; punchy close-to-mid, falls off past the sweet spot.
- Anchor: melee, ROF 1, STR 12 — one heavy hooking blow.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4 base; this chassis 12 / 11 / 11 / 8. Heat cap 6 (highest), 3 actions.

## Harpoon (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Barbed Head | Gains Impale (D12 ≥ 8 immobilises the target). | `Gains Impale` | ✅ coded (`{ perks: ["Impale"] }`) |
| **Tuned** | Taut Cable | +3 STR against a target already pinned down — immobilised or held in a melee lock (engaged). | `+3 STR vs immobilised/engaged targets` | ✅ implemented (`vsPinned` in `computeStr`) |
| **Prototype** | Harpoon Winch | On a damaging hit, if charged (`round ≥ harpoonWinchCooldownUntil`), emits a player instruction — *"Harpoon Winch — reel <target> up to 4" toward you (move the mini). You are rooted until end of activation; +2 heat."* The 4" reel is narrated; the +2 heat and root-this-activation are simulated. 3-round cooldown; while recharging the harpoon fires normally with no reel. | `Spear and reel a rig 4" toward you — roots you, runs hot` | ✅ implemented (heat/root/cooldown simulated; reel is a player instruction) |

## Anchor (melee)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Fluked Head | +3 STR (12 → 15). | `+3 STR` | ✅ coded (`{ str: 3 }`) |
| **Tuned** | Dead Weight | A damaging Anchor blow pins the struck target under the anchor: it cannot Disengage on its next activation. The pin is scoped to that one activation. | `Struck target can't Disengage next activation` | ✅ implemented (`noDisengageNextActivation`, gates Disengage, cleared at activation end) |
| **Prototype** | Ground Anchor | A damaging Anchor blow that leaves the target locked to the anchorer drives the anchor in (`anchoredBy`). The target can still Disengage, but tearing off the anchor first eats one free Anchor strike (the Anchor's natural STR) as the lock breaks. Clears with the engagement. | `Anchor a rig in the lock; leaving you costs it a free Anchor hit` | ✅ implemented (mirrors Skewer; free strike at natural STR) |

## Internal synergy & cap

- Barbed Head Impales a leg → the target is immobilised → Taut Cable turns every following Harpoon shot into +3 STR. Or Anchor it (engaged) for the same bonus.
- Dead Weight (Tuned) and Ground Anchor (Prototype) are both on the Anchor — pick one: deny the Disengage outright for a turn, or tax every escape with a free hit.
- Harpoon Winch reels a fleeing rig back into Anchor range — but roots you, so it's a commitment, not a repositioning tool.

## Decided values (all tunable)

- Harpoon: ROF 1, STR 12, sweet 14", max 22". Anchor: STR 12.
- Taut Cable: +3 STR vs immobilised or engaged.
- Harpoon Winch: 4" reel (instruction), +2 heat, root rest of activation, 3-round cooldown.
- Dead Weight: struck target can't Disengage its next activation.
- Ground Anchor: free Anchor strike (natural STR) when the pinned target Disengages.
- SP: Hull 12 / Arms 11 / Legs 11 / Engine 8.

## As built

All six upgrades are live in `shared/game-state.js` (`WEAPONS`, `WEAPON_UPGRADES`, `CHASSIS`) and `shared/combat.js`. Harpoon Winch's reel is a player instruction per [AGENTS.md](../../AGENTS.md) (tabletop assistant, not a simulator); the engine simulates the heat/root/cooldown and narrates the spatial reel.
