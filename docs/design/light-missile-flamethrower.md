# Rig design — `light-missile-flamethrower`

**Weapons:** Missile Barrage (long-range) · Flamethrower (melee) · **Class:** light
**Focus:** incendiary saturator — high-volume missiles + flame that set targets **Burning** (escalating damage-over-time) and hammer them with guaranteed armor-piercing volleys. Volume + fire, no geometry.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**, and **spatial effects resolve as narrated player instructions** — the app is a tabletop assistant, not a simulator: the engine runs on SP, heat, actions, engagement, and status flags, and tells the player what to physically do. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Both weapons are ROF-4 volume sprayers. Missile Barrage is min 6″ / max 34″ saturation fire; the Flamethrower washes the close band inside the missiles' 6″ blind spot. The unique throughline is **Burning** — a damage-over-time status no other rig applies.

Relevant weapon stats (from `shared/game-state.js`):
- Missile Barrage: ROF 4, STR 9, sweet 20″, min 6″ / max 34″.
- Flamethrower: melee, ROF 4, STR 7.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4, heat cap 6, 3 actions. Fast, fragile, can run hot.

## Missile Barrage (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Swarm Warheads | +1 ROF (4 → 5). Reliable extra volume. | `+1 ROF` | ✅ coded (`rof: 1`) |
| **Tuned** | Shaped Charges | Gains Armour Piercing (+D3 per raw 6). Conditional — mediocre vs soft targets, brutal vs heavy armor. | `Gains Armour Piercing` | ✅ coded (AP) |
| **Prototype** | Fire Control Lock | The **Lock Target** action (1 slot, 1 heat) paints a target (tracked, no line-of-sight needed). The next Missile Barrage volley aimed at that exact rig, this round or the next, **can't miss and gains Armour Piercing**; the paint is then consumed. **Downside:** the lock turn you don't fire, and an unused lock **goes stale after its expiry round.** | `Paint a target for one unmissable armor-piercing volley — costs a turn to lock` | ✅ implemented (`lockedTarget` id + expiry round) |

## Flamethrower (melee) — ROF 4, STR 7

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Sticky Fuel | Gains Rend (+D3 per raw 5–6). Reliable extra bite on the spray. | `Gains Rend` | ✅ coded (Rend) |
| **Tuned** | Napalm | A landed hit sets the target **Burning** at 1 — it never stacks past 1, so a single **Douse** (1 slot, 0 heat) clears it. It ticks `burning` SP to the target's Hull at the start of each of its activations until doused. Taxes an action or bleeds them. | `Hits set the target burning (1 SP/round until doused)` | ✅ implemented (`burning` counter, non-stacking) |
| **Prototype** | Conflagration | Each landed Flamethrower hit adds **+1 Burning** (stacks with no cap; 3 stacks = 3 SP/activation). Dousing clears only **1 stack per action** — hard to put out once it's raging. **Downside:** stacking means committing to the same target in melee (fragile light), and each hit **adds +1 heat to you.** | `Stack burns for escalating damage-over-time — but you must commit, and it runs you hot` | ✅ implemented (`burning` counter, stacking + attacker self-heat) |

## Internal synergy & cap

- **Napalm / Conflagration** burn the target down over time while **Swarm / Shaped** volume hammers it; **Fire Control Lock** guarantees the AP volley lands on your priority target.
- Napalm (1 stack) and Conflagration (stacking) are the **same mechanic escalating across natures** — like Impale → Skewer.
- **Cap:** Fire Control Lock *or* Conflagration — guaranteed-hit lock-on *or* escalating burn.

## Decided values (all tunable)

- Napalm: Burning capped at **1** (non-stacking); ticks 1 SP to Hull at each of the target's activations until a single Douse clears it.
- Conflagration: **+1 Burning per landed hit** (uncapped stacking); douse clears 1 stack/action; each hit adds **+1 heat** to the attacker.
- Fire Control Lock: Lock Target costs 1 slot + 1 heat; the next Missile Barrage volley vs the locked rig (this round or next) auto-hits + gains AP, then the paint is consumed; an unused lock goes stale after its expiry round.

## As built

All six upgrades above are live in the engine (`shared/game-state.js` `WEAPON_UPGRADES`, `shared/combat.js`, `shared/game-state.js` `douse`/`lock-target` actions). Nature badges and the max-one-Prototype-per-rig guard are wired in the wizard and server. None of this rig's upgrades are spatial — Burning and Fire Control Lock are pure status/tracking mechanics, resolved entirely in state with no player-instruction narration needed.
