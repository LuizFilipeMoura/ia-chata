# Rig design — `light-missile-flamethrower`

**Weapons:** Missile Barrage (long-range) · Flamethrower (melee) · **Class:** light
**Focus:** incendiary saturator — high-volume missiles + flame that set targets **Burning** (escalating damage-over-time) and hammer them with guaranteed armor-piercing volleys. Volume + fire, no geometry.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**, and (this rig onward) **no battlefield / spatial mechanics** — everything here runs on SP, heat, actions, engagement, and status flags, not positions. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Both weapons are ROF-4 volume sprayers. Missile Barrage is min 6″ / max 34″ saturation fire; the Flamethrower washes the close band inside the missiles' 6″ blind spot. The unique throughline is **Burning** — a damage-over-time status no other rig applies.

Relevant weapon stats (from `shared/game-state.js`):
- Missile Barrage: ROF 4, STR 9, sweet 20″, min 6″ / max 34″.
- Flamethrower: melee, ROF 4, STR 7.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4, heat cap 6, 3 actions. Fast, fragile, can run hot.

## Missile Barrage (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Swarm Warheads | +2 ROF (4 → 6). Reliable extra volume. | `+2 ROF` | ✅ coded (`rof: 2`) |
| **Tuned** | Shaped Charges | Gains Armour Piercing (+D3 per raw 6). Conditional — mediocre vs soft targets, brutal vs heavy armor. | `Gains Armour Piercing` | ✅ coded (AP) |
| **Prototype** | Fire Control Lock | Spend an action to **Lock** a target (tracked, no line-of-sight needed). Your next activation's volley vs the Locked target **can't miss and gains Armour Piercing**. **Downside:** the lock turn you don't fire, and the lock **expires if not cashed next activation.** | `Paint a target for one unmissable armor-piercing volley — costs a turn to lock` | 🔧 new — medium (tracked target lock, non-spatial) |

## Flamethrower (melee) — ROF 4, STR 7

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Sticky Fuel | Gains Rend (+D3 per raw 5–6). Reliable extra bite on the spray. | `Gains Rend` | ✅ coded (Rend) |
| **Tuned** | Napalm | Hits set the target **Burning** — 1 SP at the start of its next activation unless it spends an action to douse. Taxes an action or bleeds them. | `Hits set the target burning (1 SP/round until doused)` | 🔧 new — small-med (Burning status flag) |
| **Prototype** | Conflagration | Each Flamethrower hit adds a **Burn stack**; every stack ticks **1 SP** at the start of the target's activation (3 stacks = 3 SP/round). Dousing clears only **1 stack per action** — hard to put out once it's raging. **Downside:** stacking means committing to the same target in melee (fragile light), and each sustained burn **adds heat to you.** | `Stack burns for escalating damage-over-time — but you must commit, and it runs you hot` | 🔧 new — medium (stacked Burning counter) |

## Internal synergy & cap

- **Napalm / Conflagration** burn the target down over time while **Swarm / Shaped** volume hammers it; **Fire Control Lock** guarantees the AP volley lands on your priority target.
- Napalm (1 stack) and Conflagration (stacking) are the **same mechanic escalating across natures** — like Impale → Skewer.
- **Cap:** Fire Control Lock *or* Conflagration — guaranteed-hit lock-on *or* escalating burn.

## Decided values (all tunable)

- Napalm: **1 SP/round** Burning until doused (douse = 1 action).
- Conflagration: **+1 SP/round per stack**; douse clears 1 stack/action; sustained burn adds heat to the attacker.
- Fire Control Lock: Lock costs an action; next-activation volley vs the Locked target auto-hits + gains AP; expires if unused.

## Engine work to build later (when the `nature` system lands)

- Add `nature: "field" | "tuned" | "prototype"` to each `WEAPON_UPGRADES` entry; badge in the wizard; enforce **max one Prototype per rig** (wizard + server).
- ✅ Ready to wire now: Swarm Warheads (`rof`), Shaped Charges (AP), Sticky Fuel (Rend).
- 🔧 Burning status (shared by Napalm + Conflagration): a `burning` counter on the rig; tick SP at activation start; a `douse` action clears it (1 stack for Conflagration, all for Napalm).
- 🔧 Napalm: on hit set `burning = max(burning, 1)`.
- 🔧 Conflagration: on hit `burning += 1` (per attack); add attacker heat while sustaining; douse clears 1/action.
- 🔧 Fire Control Lock: a `lockedTarget` id set by a lock action; next activation, the missile attack vs that id auto-hits + gains AP; clear the lock after firing or if unused a full round.
