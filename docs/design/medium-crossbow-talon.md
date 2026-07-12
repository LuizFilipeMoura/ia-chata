# Rig design — `medium-crossbow-talon`

**Weapons:** Crossbow (long-range) · Talon (melee) · **Class:** medium
**Focus:** pin-and-dismantle — hold the mid band, crack open a single **location** with an aimed bolt, then walk the talon into that same location and gut it. Every upgrade keys off one location's SP, not the target's overall freshness; a guaranteed pin keeps the prey from leaving before the talon arrives.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**. Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

This kit is deliberately **not** `medium-sniper-chainsaw`. That kit is an alpha-strike burst + a multi-hit flurry keyed to the *target's* overall freshness — snipe a fresh rig for a big opening volley (Cold Bore), then let the chainsaw's extra bites (Bloodletter) execute anything wounded *anywhere*. The Shrike inverts that: it doesn't care whether the target is fresh overall, it cares about **one location's** SP. The Crossbow aims a location down, the Talon then reads *that struck location's* SP and dismantles it — Exploit Wound pays for hitting a location already below max, and Evisceration forces any hit on a location at/below half SP to Critical. And where the sniper has **no** way to stop a target from walking off, the Shrike's Pinning Bolt is a **guaranteed, no-roll** immobilise that holds the prey in place until the firer's next activation — a lock the sniper kit simply does not have.

Relevant weapon stats (from `shared/game-state.js`):
- Crossbow: ROF 1, STR 10, sweet 18″, peak +3, dropoff −0.25, range 0–24″ — single long-range precision bolt.
- Talon: melee, ROF 2, STR 7, ACC +1, reach 2″ — a two-hit close-quarters claw.
- Medium: Hull 7 / Arms 6 / Legs 6 / Engine 5, heat cap 5, 3 actions.
- Commissioned SP for this chassis: **Hull 12 / Arms 11 / Legs 12 / Engine 9**.

## Crossbow (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Fletched Bolts | Gains Precision — aimed shots ignore the −2 aim penalty. Reliable accuracy, the core hold-the-band pick. | `Aimed shots ignore the aim penalty` | ✅ coded (Precision perk) |
| **Tuned** | Steady Aim | +3 STR (10 → 13) when the measured firing distance is within 2″ of the Crossbow's sweet spot (the **16–20″** band). Rewards holding the optimal range instead of chasing. | `+3 STR when firing from the sweet spot (±2")` | ✅ implemented (`steadyAim` distance-to-sweet check) |
| **Prototype** | Pinning Bolt | A damaging bolt (≥1 hit dealing SP) **immobilises** the target until the firer's next activation — guaranteed, **no roll** (it may still pivot). Downside: the firer runs **+2 heat** per attack. The pin that lets the talon catch up. | `Pin a rig in place until your next turn — runs +2 heat` | ✅ implemented (`pinningBolt` guaranteed immobilise + self-heat) |

## Talon (melee)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Honed Talons | +2 STR (7 → 9). Unconditional bite for the low-STR claw. | `+2 STR` | ✅ implemented (`str: 2`) |
| **Tuned** | Exploit Wound | +3 STR against a **struck location already below its max SP** — reads the location the bolt cracked, not the target overall. The dismantle half of the loop. | `+3 STR vs an already-damaged location` | ✅ implemented (`vsWoundedLoc` struck-location check) |
| **Prototype** | Evisceration | A hit on a location **at or below half its max SP** is forced to **Critical (−3 SP)**, every hit. **Downside:** −1 STR against a **fully-undamaged** struck location (the talon needs a wound to grip). | `Gut a half-dead location — every hit is Critical (but weak on fresh armour)` | ✅ implemented (`eviscerate` half-SP-forces-Critical + fresh-location penalty) |

## Internal synergy & cap

- **Recommended showcase build:** Steady Aim + Evisceration, plus **Servo Actuators** equipment for the Jump Jets pounce. Hold the 18″ band and land Steady-Aim bolts (STR 13) to crack a location down; once that location is at/below half SP, Jump Jets in and let Evisceration force every talon hit on it to Critical.
- **Pinning Bolt and Evisceration are BOTH Prototype**, and a rig runs at most one — so the showcase build (Evisceration) forgoes the pin, and vice versa. Never both on the same rig.
- **Alt build:** Pinning Bolt + Exploit Wound — the guaranteed lock keeps the target on the spot while the talon farms +3 STR against the location the bolt already opened.
- **The hunt loop:** hold the 18″ sweet band → an aimed bolt cracks a location → Jump Jets in and engage → the talon guts the cracked location, and once it's at/below half SP Evisceration forces Critical.

## Equipment note

Prebuilt chassis ship **equipment-less**. The `CHASSIS` registry entry for `medium-crossbow-talon` carries only `id` / `label` / `class` / `longRange` / `melee` / `sp` — no equipment field. **Servo Actuators** (Mobility family: Sprint costs 1 heat instead of 2, and grants the **Jump Jets** active) is a **recommended pilot pick** to enable the pounce, not part of the chassis registry; the commissioning player selects it at build time.

## Decided values

- Crossbow: ROF **1**, STR **10**, sweet **18″**, peak **+3**, dropoff **−0.25/in**, range **0–24″**.
- Talon: melee, ROF **2**, STR **7**, ACC **+1**, reach **2″**.
- Chassis commissioned SP: Hull **12** / Arms **11** / Legs **12** / Engine **9** (Medium base Hull 7 / Arms 6 / Legs 6 / Engine 5, heat cap 5, 3 actions).
- Fletched Bolts: **Precision** (aimed shots ignore the −2 aim penalty).
- Steady Aim: **+3 STR** when firing distance is within **2″** of the sweet spot (16–20″ band).
- Pinning Bolt: **guaranteed, no-roll immobilise** until the firer's next activation (may still pivot); **+2 self-heat** per attack.
- Honed Talons: **+2 STR**.
- Exploit Wound: **+3 STR** vs a struck location already below its max SP.
- Evisceration: a hit on a location **at/below half max SP** is forced to **Critical (−3 SP)**; downside **−1 STR** vs a fully-undamaged struck location.
