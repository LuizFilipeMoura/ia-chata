# Restore High Penetration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revert the penetration rework's rig-weapon value changes so excess Penetration is wasted (not refunded as Damage), remove the `rules.md` value-diff guards, and strip tunable Pen/Damage/armour numbers from `rules.md`.

**Architecture:** Three independent edits. (1) Remove the four §12/§13 value-diff guard tests in `rulebook.test.js` — done first so the catalog change doesn't red them. (2) Restore ten weapons' Pen/Damage in `WEAPONS`, then repair any *mechanic* test that read a changed weapon from the catalog by giving it a synthetic fixed profile. (3) Strip the Pen/Damage/armour numbers out of `rules.md`. No new value assertions anywhere (repo rule: values are tuned constantly; never pin them).

**Tech Stack:** Node built-in test runner (`node:test`), plain JS. Run: `npm test`, or a single file with `node --test shared/<file>.test.js`.

**Spec:** `docs/superpowers/specs/2026-07-16-restore-high-pen-design.md`

---

## Background an implementer needs

- The penetration rework compressed rig-weapon Pen to 3–7 and raised Damage to compensate. The user wants the compensation gone: restore pre-rework Pen **and** Damage; the extra Pen is simply wasted above each location's saturation point (`woundTarget = clamp(2, 10, 6 + T − Pen)` floors at 2, so Pen past that buys nothing). This is a deliberate re-opening of shipped work, at the user's direction.
- **Overmatch is already deleted** — there is no live Pen→Damage mechanic to remove.
- `rules.md` is baked into the rules bot's prompt as its source of truth. Because values are tuned constantly and the guard is being removed, the numbers must come *out* of `rules.md` so the bot never serves a stale stat.
- Do NOT add any test asserting a specific Pen/Damage/armour number (memory `no-value-pinning-tests`).
- Branch has a concurrent committer: stage only the named files, never `git add -A`/`-u`/`.`.

---

## Task 1: Remove the four §12/§13 value-diff guards

**Files:**
- Modify: `shared/rulebook.test.js`

These four tests diff `rules.md`'s printed numbers against the catalog; they red on every value tune. Tests 14 (`teaches the current stat vocabulary`), 34 (`weight ladder matches WEIGHT_PEN_MOD`), and 236 (`names WEAPON_UPGRADES' upgrades in Field/Tuned/Prototype order`) are NOT value-diff guards and must stay.

- [ ] **Step 1: Delete the four guard tests**

Delete these complete `test("…", () => { … })` blocks by name (locate by the exact title string, not line number):
1. `"rules.md §12's weight-ladder example quotes the Sniper Cannon's real Penetration"`
2. `"rules.md §12 teaches WEAPONS' base long-range stats"`
3. `"rules.md §12 teaches WEAPONS' base melee stats"`
4. `"rules.md §13's parentheticals state WEAPON_UPGRADES' actual effects"`

- [ ] **Step 2: Remove the helpers those tests left unused**

After Step 1, these module-level helpers are referenced only by the deleted tests — remove them:
- `const statRow = …`
- `const cellNum = …`
- `const upgradeClaims = …`
- `const CLAIM_KINDS = …`

KEEP `rulebookRows` and `upgradeRow` — test 236 (`… Field/Tuned/Prototype order`) still uses `upgradeRow`, which reads `rulebookRows`.

- [ ] **Step 3: Confirm no dangling references**

Run: `grep -nE 'statRow|cellNum|upgradeClaims|CLAIM_KINDS' shared/rulebook.test.js`
Expected: no output. If any line prints, a keeper test still uses it — restore that helper and re-check.

- [ ] **Step 4: Run the file — still green**

Run: `node --test shared/rulebook.test.js`
Expected: PASS. Removing passing guards leaves the suite green; tests 14/34/236 and any others still pass because `rules.md` still matches the (unchanged, this task) catalog.

- [ ] **Step 5: Commit**

```bash
git add shared/rulebook.test.js
git commit -m "test(rulebook): drop the four rules.md value-diff guards

They pinned rules.md's weapon Pen/Damage numbers to the catalog and red
on every balance tune. Structural guards (vocab, weight ladder, upgrade
order) stay. Removes the now-unused statRow/cellNum/upgradeClaims/
CLAIM_KINDS helpers; keeps rulebookRows/upgradeRow (used by the order guard).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Restore the ten weapons' Penetration and Damage

**Files:**
- Modify: `shared/game-state.js` (`WEAPONS`, ~lines 52–72)
- Possibly modify: `shared/combat.test.js` and others — only value-fragile *mechanic* tests, converted to synthetic inputs (Step 3)

- [ ] **Step 1: Edit the ten weapon lines**

In `shared/game-state.js`, apply these exact replacements (only `pen:` changes on all ten; `dmg:` also changes on the six heavies). Values are the pre-rework originals from git `9bab818^`.

Long Range (`WEAPONS.longRange`):
```
"Autocannon":     pen: 6 → 7      (dmg 2 unchanged)
"Arc Gun":        pen: 7 → 8      (dmg 3 unchanged)
"Sniper Cannon":  pen: 6 → 10,  dmg: 8 → 4
"Siege Maul":     pen: 7 → 11,  dmg: 6 → 5
"Harpoon":        pen: 7 → 10,  dmg: 6 → 3
"Crossbow":       pen: 7 → 8      (dmg 4 unchanged)
```
Melee (`WEAPONS.melee`):
```
"Lance":          pen: 6 → 9,   dmg: 7 → 4
"Wrecking Ball":  pen: 6 → 10,  dmg: 7 → 5
"Anchor":         pen: 7 → 10,  dmg: 6 → 4
"Talon":          pen: 5 → 6      (dmg 3 unchanged)
```

Edit only the `pen:` / `dmg:` numbers; leave rof, sweet, peak, dropoff, ranges, accuracy, rng, perks, `flatPick` exactly as they are. Do not touch any other weapon. For reference, the current lines read e.g. `"Sniper Cannon":  { rof: 1, pen: 6,  dmg: 8, sweet: 22, ... }` → make it `pen: 10,  dmg: 4`.

- [ ] **Step 2: Run the full suite and read the failures**

Run: `npm test`
Expected: mostly green. The removed guards (Task 1) don't fire. Some *mechanic* tests that read a changed weapon from the catalog and assert a Pen-derived outcome (a `computePen` / `woundTarget` / damage-SP result) may red. The invariant tests `combat.test.js:2200–2249` (no-dead-zones / raw-TN-in-band) MUST stay green — raising strong weapons' Pen only lowers their raw TN and adds no hopeless matchup; if one of those reds, stop and investigate rather than editing it.

- [ ] **Step 3: Convert each value-fragile mechanic red to a synthetic input**

For every failing mechanic test whose expectation moved *because a changed weapon's base Pen/Damage changed*, replace its catalog read with a synthetic fixed profile so the test verifies the mechanic without pinning a tunable value. Pattern:

```js
// BEFORE — fragile: expectation moves when the catalog is tuned
const prof = { ...WEAPONS.longRange["Sniper Cannon"] };
assert.equal(computePen(rig, prof, { distance: 20 }), /* number tied to Sniper's base */);

// AFTER — value-immune: the mechanic (e.g. +3 in-band bonus) is what's asserted
const prof = { pen: 6, dmg: 3, sweet: 20, peak: 2, dropoff: 0.15, perks: [], upgradeEffect: { steadyAim: true } };
assert.equal(computePen(rig, prof, { distance: 20 }), 6 + 3);
```

Rules for this step:
- Keep the mechanic assertion; change only the *source* of the weapon's numbers to an inline literal chosen to exercise the mechanic.
- Do NOT re-assert the weapon's new catalog value. If a test's only purpose was "this weapon's Pen is N", it is a value test — delete it (none are expected outside the guards already removed in Task 1).
- If a failing test is a pure value-guard that survived Task 1, delete it and note it in the commit.

- [ ] **Step 4: Re-run until green**

Run: `npm test`
Expected: green. Re-run Step 3 for any remaining value-fragile red.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js   # add any test file you converted in Step 3, by name
git commit -m "balance(weapons): restore pre-rework Penetration, waste the excess

Ten rig weapons return to their pre-rework Pen (and the six heavies to
their pre-rework Damage). Excess Penetration is wasted above the wound
floor rather than refunded as alpha — reverses the rework's pay-back.
Value-fragile mechanic tests reworked onto synthetic inputs; no value
is re-pinned.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Strip tunable Pen/Damage/armour numbers from `rules.md`

**Files:**
- Modify: `rules.md`

Remove the per-unit stat numbers the user tunes; keep every section's name, structure, and rules-mechanic constants (arc bonuses, blast, catastrophic table, the −1/+0 weight ladder). Scope confirmed at spec review: strip the stat tables, keep the mechanics.

- [ ] **Step 1: §12 — drop the Pen and Dmg columns from both weapon tables**

The Long Range tables have header `| Weapon | ROF | Pen | Dmg | Sweet | Peak | Falloff/in | Range |`; the Melee table `| Weapon | ROF | Pen | Dmg | Acc | RNG |`. Remove the `Pen` and `Dmg` columns from the header row, the `|---|` separator row, and **every** data row of all three tables (Machine Guns, Cannons & Artillery, Melee Weapons). Example (Cannons header + one row):

```
BEFORE: | Weapon | ROF | Pen | Dmg | Sweet | Peak | Falloff/in | Range |
        | Autocannon | 4 | 6 | 2 | 12" | +1 | −0.22 | 0–26" |
AFTER:  | Weapon | ROF | Sweet | Peak | Falloff/in | Range |
        | Autocannon | 4 | 12" | +1 | −0.22 | 0–26" |
```

- [ ] **Step 2: §12 — reword the Sniper Cannon weight-ladder example to drop its numbers**

Find the sentence (~"*Example: a Sniper Cannon (Penetration 6) reads Penetration 5 on a Light Rig and 6 on a Medium.*") and reword it to teach the mechanic without a specific value, e.g.:
`*Example: a weapon reads its listed Penetration on a Medium Rig and one point lower on a Light Rig.*`
Keep the surrounding TUNING note and the `−1 / +0` ladder table (that is a mechanic; test 34 still checks it).

- [ ] **Step 3: §2 — strip the SP and Toughness figures**

In §2 Rig Statistics, remove the numeric SP table (`Hull SP 6/7`, `Arms SP 5/6`, …) and the specific Toughness example figures (the "Hull **T5** … Engine only **T3**" numbers). Keep the prose that SP and Toughness exist, are per-location, and vary by chassis — just without the tunable numbers.

- [ ] **Step 4: §13 and §17 — strip Pen/Damage figures**

- §13 upgrades: for any parenthetical stating a Pen/Damage number (e.g. `+2 Penetration`, `+1 Damage`), drop the figure — reword to name the effect qualitatively (`grants Penetration` / `grants Damage`) or remove the parenthetical. Leave non-numeric perk names intact.
- §17 unit weapons: remove the Pen/Damage numbers from its table (keep names/structure). The table is already stale; this supersedes it.

- [ ] **Step 5: Verify no weapon stat number survives, and mechanics are intact**

Run these greps and read the output:
```bash
# Weapon/chassis stat numbers should be GONE. Any hit here is a missed cell — fix it.
grep -nE '\| *[0-9]+ *\| *[0-9]+ *\|' rules.md          # residual numeric stat-table rows in §12/§17
grep -niE 'Penetration [0-9]|Damage [0-9]|T[0-9]\b|SP [0-9]' rules.md
```
The second grep will legitimately still match the **kept mechanic constants** — §5 melee counter Penetration, §7 arc `+2/+3 Penetration`, §9 blast `Penetration 8 / D2`. Confirm every remaining hit is one of those mechanics, not a weapon/chassis stat. If a weapon or component stat number remains, remove it.

- [ ] **Step 6: Run the suite — still green**

Run: `npm test`
Expected: green. Tests 14 (vocab), 34 (weight ladder), 236 (upgrade order) still pass — none of them read a stat number that was stripped. If test 34 reds, the `−1/+0` ladder table was removed by mistake in Step 2 — restore it.

- [ ] **Step 7: Commit**

```bash
git add rules.md
git commit -m "docs(rules): strip tunable weapon/chassis stat numbers from rules.md

The bot's source of truth no longer prints Pen/Damage/SP/Toughness
values, which are tuned constantly and no longer guarded. Weapon names,
structure, and rules-mechanic constants (arc bonuses, blast, weight
ladder, catastrophic table) stay.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** §1 catalog → Task 2; §2 remove guards → Task 1; §3 strip rules.md → Task 3; §4 value-immune mechanic fixes → Task 2 Step 3; §5 no new value tests → stated in every task. Out-of-scope items (upgrades, UNIT_WEAPONS, armour catalog, Overmatch, clamp) are touched by no task. ✓
- **Placeholder scan:** the ten value edits are exact; the guard removals are named; the rules.md strip shows the column pattern + a verification grep as the completeness backstop. Task 2 Step 3 shows the synthetic-input conversion pattern in full; the *set* of tests to convert is discovered by running, which is correct — the failing set depends on the value change and a hand-listed set would rot.
- **Consistency:** Task order (guards → values → doc) means no step reds a guard the next step would remove. `rulebookRows`/`upgradeRow` kept for test 236; `statRow`/`cellNum`/`upgradeClaims`/`CLAIM_KINDS` removed. Weapon values match the git `9bab818^` diff.

## Notes on line numbers

All line references are as-of plan time; locate every edit by quoted text (weapon name, test title, table header), not by number.
