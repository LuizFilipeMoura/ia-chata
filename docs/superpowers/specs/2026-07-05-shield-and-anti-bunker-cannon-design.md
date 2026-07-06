# Shield and Anti-Bunker Cannon Design

## Goal

Add two brand-new weapons to the universal weapon list:

1. **Bulwark Shield** — a defensive **Melee** weapon that trades offensive punch for a reactive block.
2. **Siege Maul** — a short-range, high-STR **Long Range** weapon (the "anti-bunker cannon") that out-punches the Sniper Cannon up close.

This expands the list from **6 + 6** to **7 Long Range + 7 Melee**. The core loadout rule is unchanged: every Rig still equips exactly one Long Range and one Melee weapon (§3), and STR remains a Medium baseline that scales by chassis (Light −2 / Medium +0 / Heavy +2 / Colossal +4, §12).

Both weapons are authored in two places that must stay in sync:
- **`rules.md`** — the human-readable single source of truth (§12 profiles, §12 upgrade table, §13 perks).
- **`shared/game-state.js`** — the machine-readable `WEAPONS`, `WEAPON_UPGRADES`, and combat toolkit.

## 1. Bulwark Shield (Melee)

A defensive melee piece. Equipping it means giving up a "real" melee weapon (Chainsaw, Lance…) in exchange for a reactive block. Weak bash, strong protection.

| ROF | STR | ACC | RNG | Perks |
|:--:|:--:|:--:|:--:|---|
| 1 | 6 | – | 1.5 | Melee, **Bulwark** |

STR 6 is the Medium baseline (Light 4 / Heavy 8 / Colossal 10). ROF 1 / STR 6 is deliberately the lowest-damage melee weapon in the game — that is the cost of the defense.

### New perk — Bulwark (§13)

A Rig equipped with a Bulwark Shield gains access to a **fourth preparation, Raise Shield**, following all normal preparation rules (§5):

- Armed with the **Prepare action** (1 action, **1 heat**), placed **facedown**.
- A Rig may hold **only one** preparation at a time (Raise Shield competes with Evasive Manoeuvre / Return Fire / Brace).
- Lasts until this Rig's next activation; revealed when its trigger occurs.

**Trigger:** when this Rig is targeted by an attack while Raise Shield is active, reveal it and resolve by the attacker's arc:

- **Front-arc attack** → **negated**. Every Impact Roll from that attack automatically fails (the attack still "resolves" for any hit-based side effects, but deals no damage).
- **Side- or rear-arc attack** → **every Impact Roll from that attack suffers −4.**

Then discard the token. The block protects **regardless of the attacker's range** — it is a defensive reaction, not the 1.5" bash.

**Answer-token interaction (§5):** an Answer token may place Raise Shield, but **only on a Rig that carries a Bulwark Shield**. (The other three preparations remain placeable on any Rig.)

### Upgrades (choose one at commission)

- **A — Tower Shield:** while Raise Shield is active, **front *and* side** attacks are negated; only **rear** attacks get through (still at −4). A bigger defensive bubble.
- **B — Boss Spike:** the shield bash gains **Staggering** (§13) — turns the weak attack into board control (D6: pivot/push the target) instead of turtling harder.

## 2. Siege Maul (Long Range — anti-bunker cannon)

A short-range demolition gun. It out-punches everything **up close**, but you must get dangerously near to fire it, and it runs Hot.

| ROF | STR | ACC | RNG | Perks |
|:--:|:--:|:--:|:--:|---|
| 1 | 13 | – / −1 | 8 / 16 | Armour Piercing, Hot |

- **STR 13** — the highest raw STR on the board (Sniper is 12). Medium baseline; Light 11 / Heavy 15 / Colossal 17.
- **Armour Piercing** (§13) — each Impact Roll of 6 adds a D3; at this STR, auto-crits become common.
- **RNG 8 / 16** — the shortest range of any ranged weapon (norm is 12–15"). You have to be inside everyone's threat range.
- **Hot** (§13) — firing generates 2 heat instead of 1.

**Anti-bunker fantasy:** it gets no explicit "bonus vs defenders" rule. It simply hits so hard, with AP, that a **Raise Shield −4 (side/rear) or a Brace −2 barely dents it**, and a front-arc block just forces the maul-carrier to flank. It answers turtles by overmatch.

### Upgrades (choose one at commission)

- **A — Breaching Round:** SP this weapon strips from a target's **Hull cannot be restored until the end of the next round** — not by the Repair action, Emergency Patch, or any equipment. A tempo denial (kills the emergency patch right when it's needed) that seals after one round rather than a runaway permanent kill.
- **B — Extended Barrel:** range bands become **12 / 24** (a flat +4 to both bands), trading the gun's brutal-but-suicidal short reach for survivable distance.

## Balance rationale

- **Bulwark Shield** is the weakest melee attacker in the game and spends an action + heat + its single prep slot to arm a block that fully stops only one attack (from the covered arc[s]). It rewards facing the threat and is a hard counter that the Siege Maul is explicitly built to crack.
- **Siege Maul** is a glass-cannon: one shot, must be close, runs Hot, and every downside is positional. High crit potential is bounded by ROF 1 and the exposure of an 8" engagement.
- Watch during playtest: Siege Maul STR on a **Colossal (17 + AP)** at 8", and the Shield's action-economy cost vs. how often Raise Shield actually catches an attack.

## Implementation surface

Design-only doc; the plan will sequence these. Named here so the touch-points are explicit.

### Rules text — `rules.md`
- §12 Melee table: add the **Bulwark Shield** row.
- §12 "Cannons & Artillery" table: add the **Siege Maul** row.
- §12 upgrade table: add the two upgrade pairs (Tower Shield / Boss Spike; Breaching Round / Extended Barrel).
- Count references: change "**six** weapons of each type" → "**seven**" in §12 (profiles intro) and the "6 Long Range + 6 Melee" note in §16 (Design Notes) → "7 + 7".
- §13: add the **Bulwark** perk entry.

### Data model — `shared/game-state.js`
- `WEAPONS.melee` — add `"Bulwark Shield": { rof: 1, str: 6, acc: [0, 0], rng: [1.5, 1.5], perks: ["Melee", "Bulwark"] }`.
- `WEAPONS.longRange` — add `"Siege Maul": { rof: 1, str: 13, acc: [0, -1], rng: [8, 16], perks: ["Armour Piercing", "Hot"] }`.
- `WEAPON_UPGRADES` — add entries:
  - `"Bulwark Shield"`: `tower-shield` (`{ shieldArc: "front-side" }`) and `boss-spike` (`{ perks: ["Staggering"] }`).
  - `"Siege Maul"`: `breaching-round` (`{ onDamage: "breaching-round" }`) and `extended-barrel` (`{ range: 4 }` — reuses the existing `effect.range` path, which shifts both bands to 12/24).
- Extended Barrel needs no new engine code (existing `effect.range` handling in `effectiveWeaponProfile` covers it).

### New combat-engine behavior (flag for the plan — these are not yet supported)
- **Bulwark / Raise Shield reaction.** `PREP_TYPES` is currently `["brace", "evasive", "return"]`. Raise Shield is a **gated** fourth prep (only Bulwark-Shield Rigs can arm it, incl. via Answer token). Its resolution is arc-dependent: negate front (or front+side with Tower Shield), −4 on the remaining non-rear arcs. This touches prep validation, the attack-resolution path, and any UI that lists preparation choices.
- **Breaching Round repair-lock.** Requires per-location repair-lock state on the Hull that expires at the end of the next round, honored by the Repair action and Emergency Patch.
- **Boss Spike / Staggering** already exists as a perk; no new engine work beyond the upgrade wiring.

## Out of scope

- No changes to weapon slots, arcs, impact tables, or the STR-by-chassis modifiers.
- No new equipment, factions, or terrain/"bunker" units — "anti-bunker" here is pure anti-armor overmatch, not a fortification subsystem.
