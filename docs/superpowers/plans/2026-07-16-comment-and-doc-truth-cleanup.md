# Comment & Doc Truth Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite two dead "impact-die" test comments (F3-F) and rename the pre-rework `STR`/`effStr` vocabulary in the opponent-brain design doc (F3-G) so every surviving claim matches the current wound-roll engine.

**Architecture:** Comment/prose only. **Zero code, zero assertion, zero catalog changes.** Every number written down is derived by reading the engine or running the test — never copied from the old text. Each edit is located by its quoted text (line numbers drift).

**Tech Stack:** Node built-in test runner (`npm test`), plain JS, Markdown.

**Spec:** `docs/superpowers/specs/2026-07-16-comment-and-doc-truth-cleanup-design.md`

**The discipline (non-negotiable):** A comment is a *claim*, not narration. Verify the artifact, not the sentence describing it. Execute every number before writing it. Tells of a bad claim: universals ("only"/"every"), inferences ("X and Y, *so* Z"), hand-copied numbers.

**Ground truth already confirmed against the live engine (re-confirm, don't trust this list):**
- `woundTarget(pen, toughness)` — `shared/rules.js:121`. Wounds on `D10 ≥ clamp(2,10, 6 + T − pen)`.
- `WOUND_DIE = 10` (the wound die is a **D10**) — `shared/rules.js:88`.
- Location die is a **D12** — `hitLocation(kindId, d12)`, `shared/rules.js:83`.
- To-hit die is a **D6** — §7.4, `shared/combat.js:38`.
- `penBreakdown` exists and is exported — `shared/combat.js:258`.
- `Sword`: `pen: 5, dmg: 3` — `shared/game-state.js:63`.
- Arc Penetration bonus (no Raking Fire): **side +2, rear +3** — `shared/combat.js:407-408`.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `shared/game-state.test.js` | rewrite 1 comment (~line 3950) + sweep | F3-F item 1 |
| `shared/combat.test.js` | rewrite 1 comment (~line 474) + sweep | F3-F item 2 |
| `docs/superpowers/specs/2026-07-15-opponent-brain-design.md` | rename STR/effStr prose | F3-G |

No files created. No test files gain or lose assertions.

---

## Task 1: F3-F item 1 — the Sword comment in `game-state.test.js`

**Files:**
- Modify: `shared/game-state.test.js` (locate by quoted text, ~line 3950)

- [ ] **Step 1: Establish the baseline is green**

Run: `npm test`
Expected: PASS (whole suite). This is the floor — nothing executable changes, so it must stay green start to finish.

- [ ] **Step 2: Locate the dead comment by its text**

Search `shared/game-state.test.js` for:
```
// Sword Penetration 6 vs a medium hull (direct at 11): impact die 6 → total 12 → 1 SP.
```
It sits inside `test("react resolves a Riposte as a free melee counter and clears the prep", …)`, just above the `react` command whose fixture is:
```js
dice: { toHit: [6, 6], location: 1, wounds: [10, 10] }
```
Two defects: (a) it narrates `impact die → total`, a model the engine replaced; (b) Sword Penetration is **5, not 6**.

- [ ] **Step 3: Derive the real numbers by execution (do NOT copy the old ones)**

Read, don't assume:
- `WEAPONS.melee["Sword"]` in `shared/game-state.js` → `pen: 5, dmg: 3`.
- The fixture: `toHit: [6, 6]` = two forced hits; `location: 1` = the D12 lands on **hull**; `wounds: [10, 10]` = two D10 wound dice, each a natural 10.
- `woundTarget(5, T_hull)` for the defender `a`'s hull: a natural 10 always clears the TN (the clamp ceiling is `WOUND_DIE`), so **both** wound dice wound. Each wound spends the Sword's Damage (3) into the hull.
- Confirm `a`'s weight class from the `battleWithPreparedDefender` fixture (the old comment said "medium" — verify it, keep the word only if true).

- [ ] **Step 4: Replace the comment (keep the existing second line)**

The line below it — `// Two guaranteed to-hit 6s so the counter lands regardless of the random rolls.` — is correct; leave it. Replace only the dead line with (adjust "medium" per Step 3):
```js
  // Sword (Penetration 5, Damage 3) counter into the attacker's medium hull: the
  // location die (1) routes both hits to the hull and two natural-10 wound dice
  // both wound (a 10 always clears the TN), so the hull takes real SP.
```
No `impact die`, no `total`, no `→`. Assertion (`assert.ok(a.hull.sp < before, …)`) is untouched.

- [ ] **Step 5: Re-run the test to confirm still green**

Run: `npm test`
Expected: PASS. (Comment-only change — a red here means you edited code by accident; revert and redo.)

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.test.js
git commit -m "test(game-state): rewrite dead Sword impact-die comment for the wound model"
```

---

## Task 2: F3-F item 2 — the "Force" dice comment in `combat.test.js`

**Files:**
- Modify: `shared/combat.test.js` (locate by quoted text, ~line 474)

- [ ] **Step 1: Locate the dead comment by its text**

Search `shared/combat.test.js` for:
```
// Force: to-hit die 6 (hits), location die 1 (hull), impact die 6.
```
It sits inside `test("Siege Maul with Breaching Round locks the target Hull on a Hull hit", …)`, above:
```js
dice: { toHit: [6], location: 1, wounds: [10], ap: [1] }
```
Defect: the third die is called an "impact die"; that model is gone — the wound die is a **D10**.

- [ ] **Step 2: Verify every forced die against the roll code (do NOT trust the fixture keys blindly)**

- `toHit: [6]` → to-hit **D6** = 6 (hits).
- `location: 1` → location **D12** = 1 (hull).
- `wounds: [10]` → wound **D10** = 10 (wounds).
- `ap: [1]` → read `shared/combat.js` around `providedDice?.ap?.[i]` (~line 539). Confirm whether this test's path (Breaching Round, `resolveAttack`) actually **consumes** the ap die. If it is consumed, name it (it is Breaching Round's armour-pen reroll die, a D10). If it is NOT consumed on this path, omit it from the comment.

- [ ] **Step 3: Replace the comment with the verified dice**

If the ap die IS consumed:
```js
  // Force every die: to-hit D6 = 6 (hits), location D12 = 1 (hull), wound D10 = 10
  // (wounds), ap D10 = 1 (Breaching Round's armour reroll).
```
If the ap die is NOT consumed here:
```js
  // Force: to-hit D6 = 6 (hits), location D12 = 1 (hull), wound D10 = 10 (wounds).
```
No `impact die`. Assertions untouched.

- [ ] **Step 4: Commit** (combined with Task 3's sweep of this same file — do Task 3 first, then one commit. If you prefer to commit now, that is fine too.)

---

## Task 3: F3-F sweep — hunt other numeric Penetration claims in both test files

**Files:**
- Read/Modify: `shared/game-state.test.js`, `shared/combat.test.js`

- [ ] **Step 1: Read the comment blocks (grep alone misses these)**

The rework tell: the weapon **name** and its **number** often sit on **different lines**, so a same-line grep misses them. Read comment blocks in both files. Also run these greps as a backstop:
```bash
grep -nE "impact die|impact-total" shared/game-state.test.js shared/combat.test.js
grep -niE "penetration [0-9]|pen [0-9]|damage [0-9]" shared/game-state.test.js shared/combat.test.js
```

- [ ] **Step 2: Fix any stale numeric claim by execution**

For each numeric Penetration/Damage claim in a **comment**, confirm it against the live `WEAPONS` entry / `woundTarget`. Rewrite any that are stale the same way as Tasks 1–2 (execute, don't trust). Comment-only.

- [ ] **Step 3: Confirm the only surviving `impact` hits are the three intentional-history lines**

After Task 1 and Task 2, the grep `grep -nE "impact die|impact-total" shared/game-state.test.js shared/combat.test.js` must return **only**:
- `shared/combat.test.js:~2156` — `// The impact-total model had 69 combos…`
- `shared/combat.test.js:~2270` — `// The combo that proved the impact-total model broken…`

These, plus the `~1646` wound-model contrast line, are **correct history** — leave them. If any *other* `impact die` line survives, it was missed; fix it.

- [ ] **Step 4: Re-run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/combat.test.js shared/game-state.test.js
git commit -m "test(combat): retire the last impact-die comment; sweep pen claims"
```

---

## Task 4: F3-G — rename the opponent-brain doc off the pre-rename vocabulary

**Files:**
- Modify: `docs/superpowers/specs/2026-07-15-opponent-brain-design.md`

This doc points **forward** at unbuilt work (the local-Gemma bot). Stale `STR`/`effStr` will send that implementer looking for symbols that do not exist. **Reviewed pass, not a global replace** — one site must NOT be renamed.

- [ ] **Step 1: Confirm every renamed symbol resolves against the current engine**

Before editing, re-confirm:
- `woundTarget(pen, toughness)` — `shared/rules.js:121`.
- `penBreakdown` (replacing `strBreakdown`) — exported, `shared/combat.js:258`.
- Arc bonus rear = **+3 Penetration** — `shared/combat.js:408`.

- [ ] **Step 2: THE TRAP — leave the deleted-code quote untouched (~line 145)**

```
> *"plus `strOvermatchD(effStr, toughness)`"*. **That function no longer exists.**
```
`strOvermatchD(effStr, toughness)` is a **verbatim quote of code that was deleted** (Overmatch). Renaming inside it would rewrite history and make the sentence lie. **Do not touch this line.**

- [ ] **Step 3: Apply the renames, each located by quoted text**

- ~L113 `arc changes STR, not accuracy` → `arc changes Penetration, not accuracy`
- ~L139 `woundTarget(effStr, toughness)` → `woundTarget(pen, toughness)`
- ~L151 `strBreakdown is exported but covers only` → `penBreakdown is exported but covers only`
- ~L151-152 `the *attacker's* STR` → `the *attacker's* Penetration`
- ~L152 `The **defender's** ten modifiers` — the STR referent here → `Penetration` wording; keep it reading as the defender's wound-step modifiers vs the attacker's Penetration
- ~L275 `rear's +4 STR` → `rear's +3 Penetration` (**two** fixes: `STR`→Penetration **and** magnitude `+4`→`+3`; confirmed `shared/combat.js:408`)
- ~L280 `arc does not affect accuracy — it affects STR` → `…it affects Penetration`
- ~L287 `v1 cannot use it as STR (no wound term)` → `…as Penetration (no wound term)`
- ~L363 `every base-STR worked example in the Overmatch spec` → `every base-Penetration worked example…`

- [ ] **Step 4: The extra site the spec's grep does NOT catch — `effectiveStrAgainst` (~L276)**

```
so an EV built on `effectiveStrAgainst` values them automatically.
```
`effectiveStrAgainst` is **not** a live engine symbol — it is an illustrative EV-function name for the same live Penetration concept. The spec's acceptance grep (`\bSTR\b` / `effStr`) does not match this camelCase token, so the spec did not list it, but leaving it is inconsistent with the rename's whole purpose. **Recommended:** rename to `effectivePenAgainst` for vocabulary consistency. This is a judgment call beyond the spec's literal list — see the User-decision note at the end of this plan; do not silently drop it.

- [ ] **Step 5: Verify — the only surviving STR/effStr is the deleted-code quote**

Run:
```bash
grep -nE "\bSTR\b|effStr" docs/superpowers/specs/2026-07-15-opponent-brain-design.md
```
Expected: exactly **one** hit — the `strOvermatchD(effStr, …)` quote at ~L145.
Also sanity-grep camelCase leftovers:
```bash
grep -nE "effectiveStr|strBreakdown" docs/superpowers/specs/2026-07-15-opponent-brain-design.md
```
Expected: no hits (given Step 4 applied); if you deferred Step 4, `effectiveStrAgainst` remains — flag it.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-07-15-opponent-brain-design.md
git commit -m "docs(spec): rename opponent-brain doc off pre-rework STR vocabulary"
```

---

## Task 5: Final verification

- [ ] **Step 1: Full suite green**

Run: `npm test`
Expected: PASS. This is the floor, not the proof — nothing executable changed.

- [ ] **Step 2: F3-F proof**

```bash
grep -nE "impact die|impact-total" shared/game-state.test.js shared/combat.test.js
```
Only the two intentional-history lines in `combat.test.js` (~2156, ~2270) remain. Each rewritten comment's numbers were derived by reading `pen`/`dmg`/`T` and computing `woundTarget` — not copied.

- [ ] **Step 3: F3-G proof**

```bash
grep -nE "\bSTR\b|effStr" docs/superpowers/specs/2026-07-15-opponent-brain-design.md
```
Only the deleted-code quote (~L145) remains. Every renamed symbol/signature resolves against the current engine.

---

## Notes for the implementer

- **Concurrent committer:** another session commits to this branch with broad `git add`. Stage **only** the files each task names — never `git add -A`, never trust `HEAD~1`.
- **Value-pinning ban applies to assertions, not comments.** Stating a current `pen`/`dmg` in a *comment* is required here; adding a *test* that asserts a specific number is forbidden.

## User decision to confirm before/at Task 4 Step 4

The spec lists exactly the STR/effStr sites its grep catches. This plan adds one site the spec's grep misses — `effectiveStrAgainst` (~L276). **Recommended:** rename it too (`effectivePenAgainst`) for consistency. Confirm whether to include it or stay strictly within the spec's listed sites.
