# Changelog, Of Oil and Iron (Working Edition)

All notable changes to [`rules.md`](rules.md) are recorded here. Newest first.
Versions use the `wr-x.y` scheme (working rules). Bump **y** for tweaks/tuning, **x** for structural rewrites.

---

## wr-0.16, Campaign missions, every equipment fully digital

### Added
- **Campaign missions (§18):** the `mission` command builds a started digital battle from two squads, side modifiers, and a contract type (Beacon Hold, Skirmish, Assassination, Breakthrough, Last Stand, Salvage Run, Boss). Short round limits, commanders and Warlords, the Extract action, reinforcements, salvage crates, perk kits, and bare (upgrade-less) weapons.
- **Digital equipment (§15):** Jump Jets and the Grapnel (yank / reel) move Rigs; the Heat Purge Wave and meltdown burst hit every enemy in reach; Chaff Burst side-steps the Rig and can lose the shot; Nanite Swarm checks its 3" reach. Physical rooms keep the narration.
- Bots spend Cryo, Meltdown charge and Nanites, price the Heat Purge Wave by the enemies in reach, and may reel enemies in with the Grapnel.

---

## wr-0.15, Gritted attacks, the trailing kill bounty, flat beacons

### Added
- **Gritted attack (§5):** a Fire (ranged or melee) or Aimed Shot may spend 1 Grit token: every to-hit die that missed is rerolled once (the reroll stands; a natural 6 still hits). Rejected with no token. The token is spent even if an Evasive/Sidestep dodges the attack. The log shows each rerolled die ("1→5") and "Grit: rerolled N missed dice".
- **Keep Grit for attacks (§5):** at the round-start Answer prompt a side may keep its Grit instead of placing it; the prompt stops asking for Grit that round (Answer tokens still prompt). Kept tokens still go in Recovery.
- **Trailing kill bounty (§11):** a kill scored by the side strictly behind the wreck's owner (before the kill's VP) pays **+2 VP** more. Ties pay nothing; stacks with Priority Elimination; never multiplied.

### Changed
- **Grit cap (§5):** the grant is capped at the trailing side's living Rigs.
- **Beacons pay ×1 every round (§11):** the escalation table ships flat. The mechanism stays as a tuning table.
- Bots keep most Grit for attacks (with 2+ tokens and no Improved prep yet, one goes on an Improved Brace/upgrade), spend it on shots the reroll improves by 1+ expected SP (any shot once they hold a token per Rig still to act), and value kills more when behind.

### Notes
- Sims (Normal vs Normal, 42×28, 100 seeds; ± is the standard error):

  | Variant | Lead changes / game | No-change games | Round-4 leader won | Leader locked in (round) | VP margin | Wrecks | Grit granted / defensive / offensive | Bounty kills |
  |---|---|---|---|---|---|---|---|---|
  | wr-0.14 (HEAD: no Gritted attack, no bounty, no cap, ×1/×2/×3) | 0.32 ± 0.05 | 72 | 68/91 | 3.87 | 27.6 ± 1.5 | 2.09 | 17.3 / 14.0 / 0 | 0 |
  | wr-0.15 rules, ×1/×2/×3 | 0.45 ± 0.06 | 63 | 71/91 | 3.69 | 24.5 ± 1.4 | 2.87 | 11.2 / 3.3 / 5.2 | 1.27 |
  | wr-0.15 rules, ×1/×1/×2 (×2 from round 8) | 0.56 ± 0.08 | 60 | 64/90 | 3.94 | 13.9 ± 0.9 | 3.04 | 9.7 / 2.5 / 4.5 | 1.37 |
  | **wr-0.15 rules, flat ×1 (ships)** | **0.56 ± 0.08** | **59** | **60/90** | **3.97** | **10.7 ± 0.6** | 3.05 | 9.6 / 2.4 / 4.5 | 1.37 |

  Flat and ×1/×1/×2 tie on lead changes (their games only split after round 8), so the gentler table ships; ×1/×2/×3 trails by about one standard error. Against wr-0.14 lead changes rise 0.32 → 0.56, no-change games fall 72 → 59, and Rigs wrecked per game rise 2.1 → 3.0 (Gritted shots finish Rigs; about 45% of wrecks now pay the bounty). Wrecks count every destruction entry, not only the kills the sim credits to an attacker. Runaway leads are rarer, not gone. ⚙ TUNING.

---

## wr-0.14, Escalating beacons, Grit scales with the gap

### Changed
- **Escalating beacons (§4, §11):** objective VP is multiplied by the round's phase: ×1 in rounds 1–3, ×2 in rounds 4–7, ×3 in rounds 8–10 and Sudden Death (centre 2/4/6, corners 1/2/3). Applies to digital scoring (the log reads "+4 VP (2 ×2)") and physical Recovery claims alike. **Kill VP is never multiplied.** The current multiplier is public so clients can show "Beacons ×2".
- **Grit scales with the gap (§5):** the trailing side gains 1 Grit token at 2–4 VP behind, 2 at 5–7, 3 at 8+ (cap 3, one per Rig). The Answer gate keeps prompting until every token is spent or nothing is left to improve.
- Bots price beacons at the current multiplier (and head for a beacon about to escalate), and spend every Grit token: Improved preps on unprepared Rigs first, then upgrades on the most exposed.

### Notes
- Sims (Normal vs Normal, 42×28, 40 seeds), wr-0.13 → wr-0.14: lead changes per game 0.33 → 0.30, games with no lead change 28 → 30, round-4 leader won 23/36 → 28/36, final leader took the lead in round 4.0 → 3.7, VP margin 13.9 → 27.2 (inflated by the multiplier), kills 1.4 → 1.4, Grit granted/spent per game 7.1/7.1 → 17.3/14.2 (tokens beyond the living Rig count can't land). Escalation alone and scaled Grit alone each moved lead changes by less than the seed noise; ×1/×1/×2 escalation read slightly better (0.38 lead changes, 26 no-change games), still within noise. Neither lever breaks runaway leads in bot play: the side ahead on beacons is usually also ahead on Rigs, so it holds the richer late beacons too. ⚙ TUNING.

---

## wr-0.13, Grit tokens

### Added
- **Grit tokens (§4, §5):** at the start of each round, a side **2+ VP behind** gains 1 Grit token (removed in Recovery if unspent). Spent like an Answer token, free and facedown, but the preparation is **Improved**, or it upgrades a preparation a Rig already holds. Improved: Brace −3 Penetration (was −2), Raise Shield side/rear −4 (was −3), Evasive/Sidestep move full Speed and dodge on 3+ in digital, Return Fire/Riposte/Exploit counters +2 Penetration.
- The opponent sees the Grit count, never which facedown preparation is Improved.

### Notes
- Sims (Normal vs Normal, 42×28, 40 seeds): a side held Grit in ~7 of ~9.5 rounds per game, ~2.6 Improved reactions revealed per game. Lead changes per game 0.23 → 0.33, games with no lead change 31 → 28, round-4 leader won 24 → 23 of 40, VP margin 13.0 → 13.9. A small nudge, not a fix for runaway leads: games open up double-digit gaps early, so a 2 VP threshold fires almost every round. ⚙ TUNING: next levers are a bigger payoff per token or scaling tokens with the gap, not a higher threshold.

---

## wr-0.12, Kills score, harsher Aimed Shot, Stagger

### Changed
- **Every kill scores +1 VP (§11)** for the side that doesn't own the wreck, whatever destroyed it (a Catastrophic overheat included). The Priority Elimination bonus stacks on top, so a Priority kill is worth 3.
- **Aimed Shot is −3 Aim (was −2).** Precision still waives it.

### Added
- **Stagger (§7):** an attack that resolves and deals 0 SP rattles its target: +1 heat, and −1 Aim on its next attack. The flag clears on that attack, or at the end of the rig's next activation.
- **Digital rooms:** the server rolls the Evasive/Sidestep D6 (4+ dodges) and picks the cook-off blast victims (within 4"). Round-end beacon payouts are logged.
- **Undo never crosses engine dice:** once the engine rolls, earlier steps are locked in.

### Notes
- Sims (Normal vs Normal, 42×28): kills per game went from 0.8 to 2.75, 0-SP attacks from 31% to 22%, and Fire vs Aimed per game from 7.2/16.5 to 17.2/6.2. The aimed:fire flip is mostly a bot scoring fix. The early leader still usually wins; that's the next lever.

---

## wr-0.11, Ram STR trimmed

### Changed
- **Ram STR lowered by 1 across every weight class (§5):** Light **8 → 7**, Medium **9 → 8**, Heavy **10 → 9**, Colossal **11 → 10**. A ram was reaching critical (3 SP) too easily, e.g. a Medium ram (old STR 9) hit the Engine's crit threshold (12) on a D6 of 3+, a 4-in-6 chance. At STR 8 that now needs a 4+, pulling ram back toward "reliable chip damage" rather than "reliable crit."

### Notes
- Playtest baseline: if rams now feel toothless, restore +1 to Heavy/Colossal first (the heavies are where the ram-as-finisher fantasy lives).

---

## wr-0.10, Melee loses arc bonus; tighter deployment gap

### Changed
- **Side/rear STR bonus is now ranged-only (§7).** Melee attacks gain **no arc bonus**: flanking is a gunnery mechanic (and Raking Fire), while melee simply hits hard from any facing. Stops rear-arc melee from being a one-round execution (seen in the wr-0.9 playtest, where a rear Chainsaw crit helped gut a Rig in a single round).
- **Deployment gap shrunk (§10):** setback **6" → 4"**, front-line gap **12" → 8"**, making a turn-1 melee charge reliable rather than merely possible across the diagonal.

### Notes
- Both are playtest baselines: if melee now feels too weak, give it back a **rear-only** bonus; if the 8" gap makes turn-1 ranged alpha strikes brutal, widen it again.

---

## wr-0.9, Machine Guns named as the flanking category

### Changed
- **Long Range list (§12) split into two labelled roles:** **Machine Guns** (Mini Gun, Double MG) and **Cannons & Artillery** (Autocannon, Arc Gun, Mortar, Sniper Cannon). No stats changed.
- **Machine Guns are now explicitly the flanking specialists**: their existing **Raking Fire** (no front damage, +4 side / +8 rear STR) is called out as the category's defining trait, pairing with the diagonal deployment (§10) and universal melee to make the facing/flank game central.

### Notes
- Labelling only, Autocannon keeps **Full Auto** but stays in Cannons (it damages the front, so it isn't a flanking MG). The low head-on STR of the machine guns is intended: they trade front damage for flank lethality.

### Changed
- **Deployment is now diagonal (§10):** armies set up in opposite corners across a corner-to-corner dividing line, each behind a **6" setback**: a **12" front-line gap** (down from 18"), close enough for a turn-1 melee charge. Built for the flanking/facing game (Raking Fire, melee on every Rig).
- **Deploy order unified with Round 1 initiative (§4, §10):** no initiative roll in Round 1, whoever **deploys first activates second** and gets that round's **Answer tokens**. Round 2+ rolls as normal.
- **Objectives repositioned (§10/§11):** table centre (2 VP) + one toward each **empty corner** (1 VP), all in the contested middle.

### Notes
- Old head-on setup kept as the **Pitched (opposite edges)** optional variant; **Ambush** retained.
- 6" setback / 12" gap is a playtest baseline, widen if turn-1 alpha strikes feel too strong.

---

## wr-0.7, Weight-class STR scaling; perk cleanup

### Changed
- **Weight-class STR modifier (§12):** the listed STR is the **Medium** baseline; a weapon's STR now scales with the chassis carrying it, **Light −2 / Medium +0 / Heavy +2 / Colossal +4** (ROF, ACC, RNG and perks unchanged). Referenced from the Impact Roll step (§7) and the loadout rule (§3). Weapons remain universal, any weapon on any Rig of any faction.
- **The two saws are now distinct**, via two new melee perks: **Circular Saw → Cleave** (a hit carries into one other enemy within 1.5"); **Chainsaw → Rend** (add a D3 for each Impact Roll of **5 or 6**, vs Armour Piercing's 6-only).

### Removed
- **Orphan perks** used by no weapon: **Barrage, Bombardment, Flak, Explosive X, Limited Ammo X**, and **Sustained Fire** (orphaned once both saws were reassigned). Also dropped the dangling "Barrage unified with Bombardment" line in §15.

### Notes
- Every remaining perk (14) is now used by a weapon, or, for **Hull**, by the Colossal slot rule.
- The ±2-per-step STR spread is a playtest baseline; individual weapons may want a wider/narrower curve later.

---

## wr-0.6, Gemma reads rules.md; PDF retired

### Project
- **Rules-master server now loads `rules.md`** (the working ruleset) instead of the Alpha PDF. `server.js` reads the Markdown directly; the `pdf-parse` dependency and `RULEBOOK_PDF` env var are gone (new default: `RULEBOOK_MD=rules.md`). README updated.
- **Deleted** the Alpha PDF from the project, `rules.md` is the single source of truth.

### Changed
- Stripped residual **15 mm** references from the rules (Scale line, §15); distances are simply written for the 60 mm / 75 mm models.
- Header version realigned to the changelog (was still showing wr-0.4).

---

## wr-0.5, Canonical weapon list: 6 Long Range + 6 Melee, one of each per Rig

### Changed
- **Weapon Profiles (§12) rebuilt as one canonical list** of **6 Long Range** (Mini Gun, Double MG, Autocannon, Arc Gun, Mortar, Sniper Cannon) and **6 Melee** (Sword, Circular Saw, Chainsaw, Claw, Lance, Wrecking Ball). The old per-weight-class and per-faction weapon tables are gone.
- **Weapons are now universal:** any weapon may go on any Rig regardless of weight class or faction. Removed weapon weight-class legality (§3, §12) and faction weapon restrictions (§14, factions are now flavour only).
- **Loadout rule (§3):** every Rig carries **exactly one Long Range and one Melee weapon** (was "at least 2 weapons"). Colossal adds a free Hull-mounted third weapon of either type.

### Mapping (stats inherited from the closest old weapon)
- Mini Gun ← Minigun · Double MG ← Twin Medium MG · Autocannon ← Auto Cannon · Arc Gun ← Arc Cannon · Mortar ← Explosive Mortar · Sniper Cannon ← Sniper Cannon.
- Sword ← Arc Sword · Circular Saw ← Saw Blade · Claw ← Vice Claws · Lance ← Arc Spear stats + **Impale** · Chainsaw ← new (heavier Circular Saw) · Wrecking Ball ← new, high-STR **Staggering**.

### Notes
- All other old weapons (Rivet Gun, Flame Thrower, Missile Rack, Magnetic Rifle, Hookshot, Mech Rifle/Mortar, Recoil Cannon, Twin Flamer, Burst Cannon, Anchor, Power Claw, the generic Melee Weapons, the Nox-melee TBD) are **retired**.
- New melee assignments **activate the Staggering perk** (previously listed but unused). **Barrage / Bombardment / Flak** are now used by no weapon, left in the §13 glossary for future use.
- Heavy & Colossal are now playable on their §2 chassis stats. Open question: whether one stat line per weapon reads right from Light to Colossal, or wants per-class scaling later.

---

## wr-0.4, Bigger minis, Sprint, Raking Fire, Answer tokens

### Changed
- **All distances rescaled ×1.5** for larger models (Light 60 mm / Medium 75 mm bases, both exactly 1.5× the originals): Speeds now 9 / 8 / 6 / 5; table **54"×36"**; every weapon range, blast, deployment, objective, melee/ram and push distance scaled to match.
- **Movement no longer taxes heat.** Normal Move = **1 heat** up to full Speed; new optional **Sprint** = up to **1½× Speed for 2 heat**. Fixes the old "every advance is 2 heat" problem.
- Base sizes updated: Light 60 mm, Medium 75 mm (Heavy 90, Colossal 120), a uniform ×1.5 of the originals.

### Added
- **Raking Fire** perk on all machine guns (Light MG, Medium MG, Twin Medium MG, Minigun): **no damage into the front arc**, but **+4 STR side / +8 STR rear** (replacing the standard +2 / +4). Front-useless, flank-lethal.
- **Answer tokens**: the player who activates **second** each round gets **2 free preparations** (no action, no heat).

### Notes
- Distance-scale assumption (blanket ×1.5) and Raking-Fire flank values are playtest baselines.
- Heat Capacity stays 6 / 5 / 4 / 3 (a heat value, not a distance, unaffected by the rescale). The old "mirrors Speed" note is dropped since Speeds changed.

---

## wr-0.3, Victory tuned for small (3-Rig) games

### Changed
- **Salvage objectives reweighted:** centre marker now worth **2 VP**, flanks **1 VP** each, the valuable middle pulls squadrons together instead of camping their own side.
- Added an **annihilation auto-win**: lose all your Rigs and your opponent wins immediately.
- Noted **4 rounds** as an option for a quicker 3-Rig game (5 remains default).

### Fixed / resolved
- **Wrecks do not hold objectives**: was an open question, now settled.

### Notes
- Objective vs Rig count for 3v3 is a watch item for stalemates; weighted centre, annihilation, and optional Ironclad Bounty are the counters.

---

## wr-0.2, Weight-based heat, engine types removed

### Removed
- **Engine types** (Crude Oil / Diesel / Arc). Rigs no longer choose an engine; the Engine remains only as a body component.

### Changed
- **Heat is now generated by exertion.** Moving more than half Speed (**Sprint**) costs **2 heat**; other actions unchanged.
- **Heat tolerance is now by weight class** via **Heat Capacity** (Light 6 · Medium 5 · Heavy 4 · Colossal 3, mirrors Speed). Bigger Rigs overheat sooner.
- **Overheat check** simplified: if end-of-activation heat exceeds Capacity, roll **D12 + 2 × (heat over Capacity)**, capped at +10, on the Heat Threshold Table. Replaces the per-engine heat tracks.
- **Rig Destruction** consolidated to a single explosion (D12 4+ → all Rigs within 8" take D6 + STR 10), since engine-type variants are gone.

### Notes
- Heat Capacity values and the ×2 overheat scaling are playtest baselines, expect tuning.

---

## wr-0.1, Initial standalone rebuild

First self-contained ruleset, rebuilt from *Of Oil and Iron* Alpha V0.1 so it needs no external reference.

### Removed
- **Oil** points currency, **Iron / Iron Cap** weight limits, and all **Equipment**. Squadrons now balance by matching force composition.

### Added
- **Deployment** rules (table size, terrain, zones, side/order roll-offs, Rig placement, facing).
- **Victory, Salvage**: 3 centreline objectives 12" apart, control within 3" uncontested, score each Recovery Phase, most VP after 5 rounds.
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
- **Engine heat tracks** (§6), source cards were incomplete and never defined Arc. Gradient set: Arc coolest → Diesel → Crude Oil hottest.

### Known open items (carried forward)
- Wrecks holding objectives, currently **no**.
- Nox medium 2nd weapon, undefined.
- Burst Cannon ACC/RNG, undefined.
- Heavy & Colossal weapon profiles, not yet written.
- Faction perks, not yet written.
- Whether composition-matching is enough balance, or a lightweight cost system is needed.

---

<!--
Template for the next entry:

## wr-0.2, <short title>

### Changed
- ...

### Added
- ...

### Fixed
- ...
-->
