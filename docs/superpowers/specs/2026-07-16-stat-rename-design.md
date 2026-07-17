# Stat rename — Accuracy, Penetration, Damage

**Date:** 2026-07-16
**Status:** approved, not implemented. **Handoff spec — written for an engineer with no prior context.**
**Blocks:** `2026-07-16-penetration-rework-design.md`, which is written in this vocabulary.

---

## What this is, and what it is emphatically not

A rig attack resolves in four steps. Three of them are governed by a weapon stat.
Those three stats are getting their real names:

| step | stat today | stat after |
|---|---|---|
| to-hit | `acc` / "ACC" | **Accuracy** |
| wound (= penetration) | `str` / "STR" | **Penetration** |
| damage | `d` / "D" | **Damage** |

**No number moves. Not one.** Every test must pass with its existing expected
values, only the identifiers and the words changing. If a balance number changes
in this diff, the diff is wrong.

That constraint is the entire point. The balance rework that follows this spec
must be measured against committed baselines, and a rename cannot be allowed to
contaminate that measurement. Land the words first, prove nothing moved, then
change the numbers in a diff that contains only numbers.

---

## Why bother

Three reasons, in descending order of how much they will bite you.

**1. The to-hit axis has three names and two of them are different things.**

- **Aim** — the D6 target number. `modAim`, base 4. **Lower is better.**
- **ACC** — the modifier space that moves it. **Higher is better.**
- **Aimed** — the *action* (an aimed shot, at −2).

`combat.js:38` states it outright:

```js
// §7.4 — modified Aim (the D6 target number). Higher ACC lowers the number.
```

and `combat.js:42` exists purely to warn the next reader:

```js
// Terms read in ACC SPACE, not in target-number space: a bonus is positive, a
// ...
// So cover, which subtracts 2 from ACC, emits `{ label: "cover", value: -2 }`.
```

A comment that exists to protect a sign convention is a naming bug with a
bandage on it.

**2. `STR` is a fantasy-wargame name bolted onto an anti-armour rating.** The
wound step is a penetration roll — `shared/rules.js` computes
`clamp(2, 10, 6 + T − effStr)` and the balance docs already argue about it in
World of Tanks vocabulary (pen vs alpha) while the code says STR vs D. The docs
and the code disagree about what the game *is*.

**3. `d` is a one-letter field name for one of the four numbers that define a
weapon.** It is not a die — `combat.js:566` spends it as a flat integer:

```js
sp = (profile.d || 1) + rend + evisc + overmatch;
```

Every reader has to learn that `d` is not a d-something.

---

## The decision

### Rename these

| today | after | notes |
|---|---|---|
| `str` (weapon field) | `pen` | on `WEAPONS`, `UNIT_WEAPONS` |
| `effStr` | `effPen` | `combat.js:532` — the sum of ~15 contributions |
| `WEIGHT_STR_MOD` | `WEIGHT_PEN_MOD` | `rules.js:64` |
| `BLAST_STR` | `BLAST_PEN` | `game-state.js` §9 cook-off |
| `strOvermatchD` | — | **deleted** by the rework spec; see "Sequencing" |
| `d` (weapon field) | `dmg` | on `WEAPONS`, `UNIT_WEAPONS` |
| `BLAST_D` | `BLAST_DMG` | |
| `acc` (weapon field) | `accuracy` | melee-only scalar pair; `combat.js:31` |
| `"STR"` in prose/tags/glossary | `"Penetration"` | |
| `"D"` / `"weapon D"` in prose/ledger | `"Damage"` | |
| `"ACC"` in prose/comments | `"Accuracy"` | |

### Do NOT rename these

| keep | why |
|---|---|
| **`modAim` / "Aim"** | It is the **target number**, not the stat. It inverts: Accuracy goes up, Aim goes down. Collapsing them into one word destroys the distinction `combat.js:42` exists to protect. **Accuracy is the stat; Aim is the number you need.** |
| **`Aimed`** (the action) | A third, unrelated thing. Leave it alone. |
| `aimBreakdown`, `computeModifiedAim`, `aimTerms` | They compute the target number. Correctly named already. |

> **The one-line rule for a reviewer:** if it is a *stat on a weapon*, it gets a
> real name. If it is a *number you roll against*, it stays Aim.

---

## What to touch

`str`/`STR` appears across `shared/`, `server/`, `client/src/` and `scripts/`.
Do not trust a bare `grep -r str` — it matches `String`, `strict`, `construct`
and hundreds of unrelated identifiers. Anchor your search:

```bash
grep -rn '\bstr\b\|\bSTR\b\|effStr\|WEIGHT_STR_MOD\|BLAST_STR' shared/ server/ client/src/ scripts/ rules.md
grep -rn '\bd:\s*[0-9]\|\bBLAST_D\b\|weapon D' shared/ server/ client/src/ scripts/ rules.md
grep -rn '\bacc\b\|\bACC\b' shared/ server/ client/src/ rules.md
```

### The surfaces that will bite

**`rules.md` is a runtime input, not documentation.** `server/config.js` →
`server/prompt.js` bakes it verbatim into the in-game rules bot's system prompt
as "the single source of truth", and the bot is instructed to refuse rather than
guess. Rename the stats in the engine and leave `rules.md` alone and **the bot
will teach players a vocabulary the game no longer uses.** It is the single
highest-value file in this diff.

**Upgrade `tag` strings are shared display.** `WEAPON_UPGRADES` and
`EQUIPMENT_UPGRADES` entries carry a `tag` that many surfaces render **verbatim**
— the commission wizard, the loadout view, the rig terminal, passive badges.
Roughly fifteen of them read `"+2 STR"`, `"+3 STR vs …"`. They must all become
`"+2 Penetration"` etc. **Do not add metadata to `tag` or restructure it** — it
is a display string with many consumers. Change the words inside it, nothing else.

**`shared/glossary.js`** has entries keyed on match strings (`match: ["Rend"]`,
`["Armour Piercing"]`, …). Any glossary entry matching `"STR"`, `"ACC"` or `"D"`
needs its `term`, `match` and `def` updated together, or the click-to-explain
surface silently stops matching. `glossary.test.js` will catch a partial job.

**The resolution ledger** emits player-visible labels:
- `combat.js:894` — `dmgTerms.push({ label: "weapon D", value: first.d })` → `"weapon Damage"`
- `combat.js:89` — `terms.push({ label: "base aim", value: base })` → stays (it *is* the target number)
- `combat.js:92` — `` `weapon ACC at ${opts.distance}"` `` → `"weapon Accuracy at …"`
- the attack `summary` string interpolates `(STR ${str})` → `(Pen ${pen})`

**`client/shared.d.ts`** mirrors the shared types and **is currently dirty in the
working tree** with an unrelated in-progress change. See Traps.

---

## Sequencing

This spec lands **before** `2026-07-16-penetration-rework-design.md`.

`strOvermatchD` / `OVERMATCH_PER_D` / `OVERMATCH_MAX_D` are **deleted by the
rework**, not renamed here. Renaming a symbol this spec's successor deletes is
wasted work and a merge conflict. **Leave every Overmatch symbol exactly as it
is.** The rework will remove them wholesale.

Consequence worth stating: after this spec lands and before the rework lands,
`strOvermatchD` sits in a file that otherwise says `pen` everywhere. That
inconsistency is correct and temporary. Do not tidy it.

---

## What success looks like

| question | instrument | bar |
|---|---|---|
| nothing moved | `npm test` | **811 node / 293 vitest, all green, zero expected-value edits.** A test whose expected number changed means you broke something. |
| the bot still teaches the real game | `grep -n 'STR\|\bACC\b\|weapon D' rules.md` | **zero hits** |
| no half-rename | the three greps above | zero hits outside Overmatch symbols |
| Aim survived | `grep -n modAim shared/combat.js` | still there, still named Aim |

**The sharpest test is that the test suite does not change.** If you find
yourself editing an expected value, stop — you have made a balance change inside
a rename, which is the one thing this spec exists to prevent.

---

## Traps

1. **Do not use `sed -i` on this repo.** It rewrites CRLF and leaves files dirty
   with an empty `git diff`. This is a large mechanical rename and `sed -i` is
   exactly the tool you will reach for. Do not.
2. **`git add <file>` stages the whole file.** `package.json`, `package-lock.json`
   and `client/shared.d.ts` carry an in-progress dependency upgrade **belonging to
   the user**. `client/shared.d.ts` is also a file this rename must touch. Stage
   your hunks deliberately; do not sweep theirs in. An earlier task did, and it
   had to be undone.
3. **Another agent commits to this branch.** Never `git add -A`; never trust
   `HEAD~1`. HEAD moved twice during the authoring of this spec.
4. **`grep -r str` is useless.** It matches `String`. Use the anchored patterns
   above. A previous investigation in this area produced a bogus per-file count
   this way.
5. **Field is the floor.** `normalizeWeaponUpgrade` returns `upgrades[0].id` for a
   null id, so **`makeRig` cannot build an un-upgraded rig**. Irrelevant to this
   rename's correctness, but it means any fixture you *add* while touching these
   files must carry an upgrade. It has already invalidated two fixtures.

## Out of scope

- **Every number.** Penetration values, Damage values, the clamp, the wound roll.
  That is the rework spec's job, and it is deliberately a separate diff.
- **Overmatch symbols.** Deleted by the rework. Leave them.
- **`Aim` and `Aimed`.** Correctly named already.
