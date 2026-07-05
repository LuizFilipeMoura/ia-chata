# Changelog — Of Oil and Iron (Working Edition)

All notable changes to [`rules.md`](rules.md) are recorded here. Newest first.
Versions use the `wr-x.y` scheme (working rules). Bump **y** for tweaks/tuning, **x** for structural rewrites.

---

## wr-0.10 — Melee loses arc bonus; tighter deployment gap

### Changed
- **Side/rear STR bonus is now ranged-only (§7).** Melee attacks gain **no arc bonus** — flanking is a gunnery mechanic (and Raking Fire), while melee simply hits hard from any facing. Stops rear-arc melee from being a one-round execution (seen in the wr-0.9 playtest, where a rear Chainsaw crit helped gut a Rig in a single round).
- **Deployment gap shrunk (§10):** setback **6" → 4"**, front-line gap **12" → 8"**, making a turn-1 melee charge reliable rather than merely possible across the diagonal.

### Notes
- Both are playtest baselines: if melee now feels too weak, give it back a **rear-only** bonus; if the 8" gap makes turn-1 ranged alpha strikes brutal, widen it again.

---

## wr-0.9 — Machine Guns named as the flanking category

### Changed
- **Long Range list (§12) split into two labelled roles:** **Machine Guns** (Mini Gun, Double MG) and **Cannons & Artillery** (Autocannon, Arc Gun, Mortar, Sniper Cannon). No stats changed.
- **Machine Guns are now explicitly the flanking specialists** — their existing **Raking Fire** (no front damage, +4 side / +8 rear STR) is called out as the category's defining trait, pairing with the diagonal deployment (§10) and universal melee to make the facing/flank game central.

### Notes
- Labelling only — Autocannon keeps **Full Auto** but stays in Cannons (it damages the front, so it isn't a flanking MG). The low head-on STR of the machine guns is intended: they trade front damage for flank lethality.

### Changed
- **Deployment is now diagonal (§10):** armies set up in opposite corners across a corner-to-corner dividing line, each behind a **6" setback** — a **12" front-line gap** (down from 18"), close enough for a turn-1 melee charge. Built for the flanking/facing game (Raking Fire, melee on every Rig).
- **Deploy order unified with Round 1 initiative (§4, §10):** no initiative roll in Round 1 — whoever **deploys first activates second** and gets that round's **Answer tokens**. Round 2+ rolls as normal.
- **Objectives repositioned (§10/§11):** table centre (2 VP) + one toward each **empty corner** (1 VP), all in the contested middle.

### Notes
- Old head-on setup kept as the **Pitched (opposite edges)** optional variant; **Ambush** retained.
- 6" setback / 12" gap is a playtest baseline — widen if turn-1 alpha strikes feel too strong.

---

## wr-0.7 — Weight-class STR scaling; perk cleanup

### Changed
- **Weight-class STR modifier (§12):** the listed STR is the **Medium** baseline; a weapon's STR now scales with the chassis carrying it — **Light −2 / Medium +0 / Heavy +2 / Colossal +4** (ROF, ACC, RNG and perks unchanged). Referenced from the Impact Roll step (§7) and the loadout rule (§3). Weapons remain universal — any weapon on any Rig of any faction.
- **The two saws are now distinct**, via two new melee perks: **Circular Saw → Cleave** (a hit carries into one other enemy within 1.5"); **Chainsaw → Rend** (add a D3 for each Impact Roll of **5 or 6**, vs Armour Piercing's 6-only).

### Removed
- **Orphan perks** used by no weapon: **Barrage, Bombardment, Flak, Explosive X, Limited Ammo X**, and **Sustained Fire** (orphaned once both saws were reassigned). Also dropped the dangling "Barrage unified with Bombardment" line in §15.

### Notes
- Every remaining perk (14) is now used by a weapon — or, for **Hull**, by the Colossal slot rule.
- The ±2-per-step STR spread is a playtest baseline; individual weapons may want a wider/narrower curve later.

---

## wr-0.6 — Gemma reads rules.md; PDF retired

### Project
- **Rules-master server now loads `rules.md`** (the working ruleset) instead of the Alpha PDF. `server.js` reads the Markdown directly; the `pdf-parse` dependency and `RULEBOOK_PDF` env var are gone (new default: `RULEBOOK_MD=rules.md`). README updated.
- **Deleted** the Alpha PDF from the project — `rules.md` is the single source of truth.

### Changed
- Stripped residual **15 mm** references from the rules (Scale line, §15); distances are simply written for the 60 mm / 75 mm models.
- Header version realigned to the changelog (was still showing wr-0.4).

---

## wr-0.5 — Canonical weapon list: 6 Long Range + 6 Melee, one of each per Rig

### Changed
- **Weapon Profiles (§12) rebuilt as one canonical list** of **6 Long Range** (Mini Gun, Double MG, Autocannon, Arc Gun, Mortar, Sniper Cannon) and **6 Melee** (Sword, Circular Saw, Chainsaw, Claw, Lance, Wrecking Ball). The old per-weight-class and per-faction weapon tables are gone.
- **Weapons are now universal:** any weapon may go on any Rig regardless of weight class or faction. Removed weapon weight-class legality (§3, §12) and faction weapon restrictions (§14 — factions are now flavour only).
- **Loadout rule (§3):** every Rig carries **exactly one Long Range and one Melee weapon** (was "at least 2 weapons"). Colossal adds a free Hull-mounted third weapon of either type.

### Mapping (stats inherited from the closest old weapon)
- Mini Gun ← Minigun · Double MG ← Twin Medium MG · Autocannon ← Auto Cannon · Arc Gun ← Arc Cannon · Mortar ← Explosive Mortar · Sniper Cannon ← Sniper Cannon.
- Sword ← Arc Sword · Circular Saw ← Saw Blade · Claw ← Vice Claws · Lance ← Arc Spear stats + **Impale** · Chainsaw ← new (heavier Circular Saw) · Wrecking Ball ← new, high-STR **Staggering**.

### Notes
- All other old weapons (Rivet Gun, Flame Thrower, Missile Rack, Magnetic Rifle, Hookshot, Mech Rifle/Mortar, Recoil Cannon, Twin Flamer, Burst Cannon, Anchor, Power Claw, the generic Melee Weapons, the Nox-melee TBD) are **retired**.
- New melee assignments **activate the Staggering perk** (previously listed but unused). **Barrage / Bombardment / Flak** are now used by no weapon — left in the §13 glossary for future use.
- Heavy & Colossal are now playable on their §2 chassis stats. Open question: whether one stat line per weapon reads right from Light to Colossal, or wants per-class scaling later.

---

## wr-0.4 — Bigger minis, Sprint, Raking Fire, Answer tokens

### Changed
- **All distances rescaled ×1.5** for larger models (Light 60 mm / Medium 75 mm bases — both exactly 1.5× the originals): Speeds now 9 / 8 / 6 / 5; table **54"×36"**; every weapon range, blast, deployment, objective, melee/ram and push distance scaled to match.
- **Movement no longer taxes heat.** Normal Move = **1 heat** up to full Speed; new optional **Sprint** = up to **1½× Speed for 2 heat**. Fixes the old "every advance is 2 heat" problem.
- Base sizes updated: Light 60 mm, Medium 75 mm (Heavy 90, Colossal 120) — a uniform ×1.5 of the originals.

### Added
- **Raking Fire** perk on all machine guns (Light MG, Medium MG, Twin Medium MG, Minigun): **no damage into the front arc**, but **+4 STR side / +8 STR rear** (replacing the standard +2 / +4). Front-useless, flank-lethal.
- **Answer tokens** — the player who activates **second** each round gets **2 free preparations** (no action, no heat).

### Notes
- Distance-scale assumption (blanket ×1.5) and Raking-Fire flank values are playtest baselines.
- Heat Capacity stays 6 / 5 / 4 / 3 (a heat value, not a distance — unaffected by the rescale). The old "mirrors Speed" note is dropped since Speeds changed.

---

## wr-0.3 — Victory tuned for small (3-Rig) games

### Changed
- **Salvage objectives reweighted:** centre marker now worth **2 VP**, flanks **1 VP** each — the valuable middle pulls squadrons together instead of camping their own side.
- Added an **annihilation auto-win**: lose all your Rigs and your opponent wins immediately.
- Noted **4 rounds** as an option for a quicker 3-Rig game (5 remains default).

### Fixed / resolved
- **Wrecks do not hold objectives** — was an open question, now settled.

### Notes
- Objective vs Rig count for 3v3 is a watch item for stalemates; weighted centre, annihilation, and optional Ironclad Bounty are the counters.

---

## wr-0.2 — Weight-based heat, engine types removed

### Removed
- **Engine types** (Crude Oil / Diesel / Arc). Rigs no longer choose an engine; the Engine remains only as a body component.

### Changed
- **Heat is now generated by exertion.** Moving more than half Speed (**Sprint**) costs **2 heat**; other actions unchanged.
- **Heat tolerance is now by weight class** via **Heat Capacity** (Light 6 · Medium 5 · Heavy 4 · Colossal 3 — mirrors Speed). Bigger Rigs overheat sooner.
- **Overheat check** simplified: if end-of-activation heat exceeds Capacity, roll **D12 + 2 × (heat over Capacity)**, capped at +10, on the Heat Threshold Table. Replaces the per-engine heat tracks.
- **Rig Destruction** consolidated to a single explosion (D12 4+ → all Rigs within 8" take D6 + STR 10), since engine-type variants are gone.

### Notes
- Heat Capacity values and the ×2 overheat scaling are playtest baselines — expect tuning.

---

## wr-0.1 — Initial standalone rebuild

First self-contained ruleset, rebuilt from *Of Oil and Iron* Alpha V0.1 so it needs no external reference.

### Removed
- **Oil** points currency, **Iron / Iron Cap** weight limits, and all **Equipment**. Squadrons now balance by matching force composition.

### Added
- **Deployment** rules (table size, terrain, zones, side/order roll-offs, Rig placement, facing).
- **Victory — Salvage**: 3 centreline objectives 12" apart, control within 3" uncontested, score each Recovery Phase, most VP after 5 rounds.
- Optional deployment variants (Wedge/Diagonal, Ambush) and optional **Ironclad Bounty** victory add-on.

### Contradictions resolved (canonical values chosen)
- Recovery Phase heat cooldown → **2** (source gave both 2 and 3).
- Repair → **7+ / 10+** (source main text vs quick-ref disagreed).
- Brace for Incoming Fire → **−2 to Impact Rolls** on front-arc attacks (unified from "+2 armour").
- Initiative → **roll every round** (dropped the contradictory "alternate" clause).
- Heavy Legs Impact Table → **14–15 / 16 / 17+** (removed value overlap at 15).
- Ram → one Impact Roll each of **D6 + ram STR** (clarified ambiguous "D6 STR X hits").
- Perk **Barrage** unified with **Bombardment**.

### Invented baselines (need playtesting)
- **Engine heat tracks** (§6) — source cards were incomplete and never defined Arc. Gradient set: Arc coolest → Diesel → Crude Oil hottest.

### Known open items (carried forward)
- Wrecks holding objectives — currently **no**.
- Nox medium 2nd weapon — undefined.
- Burst Cannon ACC/RNG — undefined.
- Heavy & Colossal weapon profiles — not yet written.
- Faction perks — not yet written.
- Whether composition-matching is enough balance, or a lightweight cost system is needed.

---

<!--
Template for the next entry:

## wr-0.2 — <short title>

### Changed
- ...

### Added
- ...

### Fixed
- ...
-->
