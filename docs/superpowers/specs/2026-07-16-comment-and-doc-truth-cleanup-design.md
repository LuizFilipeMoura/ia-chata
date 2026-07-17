# Comment & doc truth cleanup — dead test comments (F3-F) and the opponent-brain STR rename (F3-G)

**Date:** 2026-07-16
**Status:** proposed, not implemented. **Self-contained — written for an engineer with no prior context.**
**Scope:** exactly two items lifted out of `2026-07-16-post-rework-cleanup-design.md` (§F3-F, §F3-G).
Everything else in that backlog is handled, dropped, or superseded elsewhere — ignore it; this spec
is the whole job.

---

## Shared context you need for both items

- **Stat vocabulary changed.** The engine renamed its combat stats: `STR` → **Penetration** (`pen`),
  `D` → **Damage** (`dmg`), `ACC` → **Accuracy**. Any surface still saying `STR`/`effStr`/`D` is stale.
- **The current combat model.** Each hit rolls a **D10 wound roll** against the struck location's
  **Toughness (T)**. It wounds on `D10 ≥ woundTarget(pen, T)`, where
  `woundTarget(pen, T) = clamp(2, 10, 6 + T − pen)` (`shared/rules.js`, `export function woundTarget(pen, toughness)`).
  Each landed wound then costs the location the weapon's **Damage** in SP. There is **no** "impact die /
  severity / total" step — that was an older model this engine **replaced** (`rules.js` calls it "the
  impact-total model this replaces").
- **The one discipline this whole area runs on** (learned the hard way across the penetration rework):
  > **Verifying the artifact is not the same as verifying the sentence describing it.** A comment is a
  > *claim*. Prose feels like narration, so it skips the check the code gets. **Execute every number —
  > every Penetration, every worked example — before you write it down.** The tells are universals
  > ("only"/"every"), inferences ("X and Y, *so* Z"), and hand-copied numbers.
- **No value-pinning tests.** Do not add any test asserting a specific Penetration/Damage/armour number
  (the team tunes those constantly). Both items below are comment/prose only — **no assertion changes,
  no code changes.**
- Line numbers in this spec are as-of writing and drift; **locate every edit by its quoted text.**

---

## F3-F — rewrite two dead "impact die" comments in the test files

Two test comments still describe the replaced impact-die/total model as if it were current. Both are
comment-only fixes; the tests around them pass and their assertions must not change.

### 1. `shared/game-state.test.js` — the Sword comment (~line 3950)

Current text (dead model **and** a wrong number):
```
// Sword Penetration 6 vs a medium hull (direct at 11): impact die 6 → total 12 → 1 SP.
```
Two defects: (a) it narrates `impact die 6 → total 12`, a model the engine no longer runs; (b) **Sword
Penetration is 5, not 6** (`WEAPONS.melee["Sword"].pen`). Rewrite it to describe what the test actually
exercises under the **wound-roll** model, with every number verified by running the test — read the
weapon's real `pen`/`dmg`, the location's T, and compute `woundTarget(pen, T)` yourself. Do not copy the
old figures.

### 2. `shared/combat.test.js` — the "Force" dice comment (~line 474)

Current text:
```
// Force: to-hit die 6 (hits), location die 1 (hull), impact die 6.
```
The third die is no longer an "impact die" — it is the **D10 wound die**. Rewrite to name the three dice
the test forces as they exist today (to-hit D6, location D12, wound D10), matching what the test's
`dice: { … }` fixture actually passes.

### Leave these alone (not defects)

- `shared/combat.test.js` ~line 1646 ("Under the **wound model** a charge negates a wound outright rather
  than softening it one severity step — there are no steps left to soften") — this is **correct
  current-model prose** that mentions the old model only to contrast it. Keep it.
- `shared/combat.test.js` ~lines 2156 and 2270 ("the impact-total model had 69 combos that could never
  deal damage…") — intentional **history**: they explain *why* the no-dead-zones invariant tests exist.
  Keep them.

### While you are in these files

Sweep both for any other numeric Penetration claim in a comment. The tell (from the rework) is that the
weapon name and the number often sit on **different lines**, so a same-line grep misses them — read the
comment blocks, don't just grep. Fix any you find the same way: by execution, not by trust. Still
comment-only.

---

## F3-G — rename the opponent-brain design doc off the pre-rename vocabulary

`docs/superpowers/specs/2026-07-15-opponent-brain-design.md` still speaks `STR`/`effStr` in ~9 places.
This doc points **forward** at unbuilt work (a local-Gemma opponent bot), so whoever implements that bot
will read stale signatures and symbol names that do not exist. Prose-only change to one file.

**Do it as its own reviewed change — a partial or blind rename here is worse than none.** `STR` appears
in at least one place where it must **not** be renamed (see the trap below).

### The sites (verify each against the engine before editing)

- `woundTarget(effStr, toughness)` (~line 139) → the real signature is **`woundTarget(pen, toughness)`**
  (`shared/rules.js`). Fix the signature; the value passed is the effective Penetration.
- `strBreakdown` (~lines 151–152) → the engine's function is **`penBreakdown`** (`shared/combat.js:258`,
  exported). Rename; confirm it exists before you do.
- "arc changes **STR**, not [accuracy]" (~line 113), "arc does not affect accuracy — it affects **STR**"
  (~line 280), "cannot use it as **STR**" (~line 287), "every base-**STR** worked example" (~line 363),
  "the **defender's** ten modifiers … attacker's **STR**" (~line 151) → all **Penetration**.
- "rear's **+4 STR**" (~line 275) → this is stale **twice**: `STR` → Penetration, **and** the magnitude.
  The engine's arc bonus is **+2 Penetration side / +3 rear** (`shared/rules.js` / §7 of `rules.md`) —
  the ladder was halved in the rework. Correct it to **+3 Penetration** after confirming the live arc
  bonus in the engine. (Arc bonus is a mechanic constant, not a tuned weapon stat, so stating it is fine.)

### The trap — do NOT rename inside the deleted-code quote

~Line 145 reads:
```
> This bullet used to read *"plus `strOvermatchD(effStr, toughness)`"*. **That function no longer exists.**
```
That `strOvermatchD(effStr, toughness)` is a **verbatim quote of code that was deleted** (Overmatch,
removed by the penetration rework). It is intentionally showing the old, dead signature. **Leave it
exactly as written** — renaming inside a quote of removed code would rewrite history and make the
sentence lie about what used to be there. This is precisely why F3-G is a reviewed pass, not a
find-replace.

### Rule

Rename only where the token means the live Penetration concept or a live symbol. Every renamed symbol
(`penBreakdown`, `woundTarget(pen, …)`) must be confirmed present in the current engine before you write
it. No mechanical global replace.

---

## Out of scope

- Every other item in `2026-07-16-post-rework-cleanup-design.md` (F3-A, F3-B, F3-C, F3-D, F3-E, F3-H) —
  handled, dropped, or superseded outside this spec.
- Any assertion, engine, or catalog change. Both items are comment/prose only.
- Adding any guard or value-pinning test.

## Verification

- `npm test` stays green (nothing executable changed; this is the floor, not the proof).
- **F3-F:** for each rewritten comment, the numbers in it were derived by running the test and reading
  the real `pen`/`dmg`/T — not copied. Grep both test files for `impact die` / `impact-total` and
  confirm the only remaining hits are the two intentional-history lines named above.
- **F3-G:** grep the opponent-brain doc for `\bSTR\b` and `effStr` — the only remaining hit is the
  deleted-code quote at ~line 145. Every renamed symbol/signature resolves against the current engine.
