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
| **Prototype** | Penetrator Rounds | Every **3rd Autocannon attack** loads a penetrator: it **ignores armor entirely** — each hit is a guaranteed **severe (2 SP)** regardless of the location's armor row. **Downside:** cycling the heavy belt **halves the Autocannon's ROF next turn.** | `Every 3rd volley ignores armor outright — but the belt cycles slow after` | 🔧 new — medium (cadence counter + armor-bypass) |

## Claw (melee) — ROF 2, STR 8, +1 acc

| Nature | Name | Effect | Player tag | Engine |
|---|---|---|---|---|
| **Field** | Rending Talons | Gains Rend (+D3 per raw 5–6). Reliable extra bite. | `Gains Rend` | ✅ coded (Rend) |
| **Tuned** | Vice Grip | Gains Impale — on a strong hit (D12 ≥ 8) the target is **immobilised**. Conditional grab; holds a mobile target still. | `Impale — immobilise on a strong hit` | ✅ coded (Impale) |
| **Prototype** | Breach Grip | A Claw hit **cracks** the struck location (tracked, ~2 rounds): while cracked, **all** attacks against that location roll at **+2 impact** (far easier to reach severe/critical). Pry it open, then pour fire in. **Downside:** prying isn't killing — the Claw does less finishing damage while it works, and you must commit in melee (fragile light) to keep cracking. | `Pry a location's armor open (+2 impact from anyone) — but prying costs you the kill tempo` | 🔧 new — medium (per-location armor-crack debuff) |

## Internal synergy & cap

- All anti-armor: **Vice Grip** immobilises the target → **Breach Grip** cracks a location → **AP Shells / Penetrator Rounds** punch straight through the exposed spot. A machine for dismantling heavies.
- **Cap:** Penetrator Rounds (ignore armor via cadence) *or* Breach Grip (crack a location for everyone) — two anti-armor tools, pick one.

## Decided values (all tunable)

- Penetrator Rounds: every **3rd** Autocannon attack ignores armor (guaranteed severe / 2 SP per hit); downside **ROF halved next turn**.
- Breach Grip: Claw hit cracks the struck location → **+2 impact** vs it from any attacker, lasts ~**2 rounds**.
- Vice Grip: Impale immobilise on **D12 ≥ 8** (as coded).

## Engine work to build later (when the `nature` system lands)

- Add `nature: "field" | "tuned" | "prototype"` to each `WEAPON_UPGRADES` entry; badge in the wizard; enforce **max one Prototype per rig** (wizard + server).
- ✅ Ready to wire now: Depleted Core (`str`), AP Shells (AP), Rending Talons (Rend), Vice Grip (Impale).
- 🔧 Penetrator Rounds: per-Rig Autocannon attack counter; every 3rd attack, bypass the armour row (force `severe` / 2 SP per hit); halve the Autocannon's ROF on its next activation.
- 🔧 Breach Grip: on a damaging Claw hit, flag the struck location `cracked` with a round timer; in `rollImpacts`, +2 to the impact total against a cracked location (any attacker); expire after ~2 rounds.
