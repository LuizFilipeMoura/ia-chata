# Rig design — `light-claw-autocannon`

**Weapons:** Autocannon (long-range) · Claw (melee) · **Class:** light
**Focus:** anti-armor specialist — the rig you bring for heavies. The Claw pries armor open, the Autocannon punches through. Everything it does is about cracking tough targets.

Design under the invariants in [AGENTS.md](../../AGENTS.md): weapons globally unique, each rig once on the field, **no mirror matchups**, **no battlefield / spatial mechanics** (SP, heat, actions, engagement, status flags only). Upgrades follow the **Field / Tuned / Prototype** nature system (pick one per weapon, **max one Prototype per rig**).

Relevant weapon stats (from `shared/game-state.js`):
- Autocannon: ROF 4, STR 8, sweet 12″, max 26″ — the reliable mid-range workhorse gun.
- Claw: melee, ROF 2, STR 8, +1 acc — a grabbing, prying claw.
- Light: Hull 6 / Arms 5 / Legs 5 / Engine 4, heat cap 6, 3 actions. Fast, fragile.

## Autocannon (long-range)

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Depleted Core | +2 STR (8 → 10). Reliable punch. | `+2 STR` | ✅ coded (`str: 2`) |
| **Tuned** | AP Shells | Gains Armour Piercing (+D3 per raw 6). Conditional — great vs armor, wasted on soft targets. | `Gains Armour Piercing` | ✅ coded (AP) |
| **Prototype** | Penetrator Rounds | Every **3rd Autocannon attack** loads a penetrator: it **ignores armor entirely** — each hit is a guaranteed **severe (2 SP)** regardless of the location's armor row. **Downside:** cycling the heavy belt **halves the Autocannon's ROF next turn.** | `Every 3rd volley ignores armor outright — but the belt cycles slow after` | ✅ implemented (per-rig belt counter; forced Severe every 3rd volley, ROF halved — floors at 1 — the attack right after) |

## Claw (melee) — ROF 2, STR 8, +1 acc

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Rending Talons | Gains Rend (+D3 per raw 5–6). Reliable extra bite. | `Gains Rend` | ✅ coded (Rend) |
| **Tuned** | Vice Grip | Gains Impale — on a strong hit (D12 ≥ 8) the target is **immobilised**. Conditional grab; holds a mobile target still. | `Impale — immobilise on a strong hit` | ✅ coded (Impale) |
| **Prototype** | Breach Grip | A damaging Claw hit **cracks** the struck location for a 2-round window (the round it lands + the next): while cracked, **all** attacks against that location — from any attacker, any weapon — roll at **+2 impact** (far easier to reach severe/critical). Pry it open, then pour fire in. **Downside:** prying isn't killing — the Claw does less finishing damage while it works, and you must commit in melee (fragile light) to keep cracking. | `Pry a location's armor open (+2 impact from anyone) — but prying costs you the kill tempo` | ✅ implemented (per-location `cracked` map, expiry swept in Recovery) |

## Internal synergy & cap

- All anti-armor: **Vice Grip** immobilises the target → **Breach Grip** cracks a location → **AP Shells / Penetrator Rounds** punch straight through the exposed spot. A machine for dismantling heavies.
- **Cap:** Penetrator Rounds (ignore armor via cadence) *or* Breach Grip (crack a location for everyone) — two anti-armor tools, pick one.

## Decided values (all tunable)

- Penetrator Rounds: every **3rd** Autocannon attack ignores armor (guaranteed severe / 2 SP per hit); downside **ROF halved next turn** (floors at 1, never zeroed).
- Breach Grip: a damaging Claw hit cracks the struck location → **+2 impact** vs it from any attacker, lasts **2 rounds** (the round it lands + the next, gone the round after).
- Vice Grip: Impale immobilise on **D12 ≥ 8** (as coded).

## As built

All six upgrades above are live in the engine (`shared/game-state.js` `WEAPON_UPGRADES`, `shared/combat.js`). Nature badges (Field/Tuned/Prototype) and the max-one-Prototype-per-rig guard are wired in the wizard and server. Neither Penetrator Rounds nor Breach Grip has a spatial component — both are pure SP/heat-tracking mechanics, so there's no player-instruction narration involved for this rig.
