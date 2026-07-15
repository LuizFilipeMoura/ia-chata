# Stat Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the three weapon stats — `ACC`/`STR`/`D` become **Accuracy**/**Penetration**/**Damage** — across engine, client, scripts, glossary and `rules.md`, moving **no numbers**.

**Architecture:** One task per symbol, not per file. A field rename is atomic — you cannot rename `str` in `game-state.js` without breaking `combat.js` in the same commit — so each task sweeps one symbol across every file at once and ends with the full suite green. Steps within a task are per-file and bite-sized.

**Tech Stack:** Plain ESM JavaScript (`shared/`, `server/`, `scripts/`), React + TypeScript (`client/src/`), `node --test` + Vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-stat-rename-design.md`

---

## Read this before Task 1

**TDD does not apply here in its usual shape, and pretending otherwise would be a lie.** A pure rename adds no behaviour, so there is no failing test to write for most tasks. The discipline that replaces it is a **hard invariant, checked every task**:

> **The test suite must pass with the same counts, and no numeric literal may change anywhere in the diff.**

Test files *will* be edited (there are 191 `STR` sites in `shared/combat.test.js` alone) — but only identifiers and strings, never expected values. Tasks 9–12 *are* real TDD: they add the first tests that have ever covered `rules.md`.

**The baseline, measured on `b0fa3e4` before writing this plan:**

```
Test Files  76 passed (76)
      Tests  293 passed (293)     <- vitest
ℹ tests 811 / ℹ pass 811 / ℹ fail 0   <- node --test
```

**The gate command**, run before every commit in this plan. It compares the multiset of numeric literals leaving the diff against the multiset entering it. Rulebook section references (`§7.5`, `§12`) are stripped first — they are prose, not values, and leaving them in makes the gate cry wolf on every comment edit:

```bash
nums() { git diff --cached -U0 | grep "^$1" | grep -v "^$1$1$1" | sed 's/§[0-9.]*//g' | grep -oE '\b[0-9]+\b' | sort; }
diff <(nums -) <(nums +)
```

**Expected output: nothing.**

**The gate is a tripwire, not a verdict.** If it fires, *inspect the hit* — do not assume it is a real change, and do not assume it is noise. Legitimate causes: a deleted comment that happened to contain a digit, a line-number reference in a comment. Illegitimate cause, the one this exists to catch: **a balance value edited to make a test pass.** If you cannot explain a hit in one sentence, report `BLOCKED` rather than waving it through. Task 1 fired on a `§2` inside a comment the task itself instructed be deleted — that is the shape of an acceptable hit, and it is why the `sed` above now exists.

## Traps — read all seven, each has already cost someone

1. **Do NOT rename `strOvermatchD`, `OVERMATCH_PER_D`, or `OVERMATCH_MAX_D`.** 31 sites. The **penetration rework deletes them wholesale**; renaming them is wasted work and a guaranteed merge conflict. After this plan lands they will sit in a `pen`-flavoured file still saying `str`. **That inconsistency is correct and temporary. Do not tidy it.**
2. **Do NOT use `sed -i` on this repo.** It rewrites CRLF and leaves files dirty with an empty `git diff`. This is a 700-site mechanical rename and `sed -i` is exactly the tool you will reach for. Use your editor's rename, or `node -e` with explicit `\r\n` preservation, or edit by hand.
3. **`grep -r str` is useless** — it matches `String`, `strict`, `construct`, `strip`. Always anchor: `\bstr\b`. (Verified: `strOvermatchD` does *not* match `\bstr\b`, because `O` is a word character. That is load-bearing for trap 1.)
4. **`git add <file>` stages the whole file, and `git add -p` is unavailable here** (this environment is non-interactive). `package.json` and `package-lock.json` carry an **in-progress dependency upgrade belonging to the user** — this rename never touches them, so **never `git add -A`** and they stay clean. An earlier task swept them in and it had to be undone.
   **`client/shared.d.ts` is different:** it carries one uncommitted user line (`+ sprintMult: number;` in `rigEffects`) *and* the rename must edit it. The user has explicitly authorised that line to ride along in the rename's commit. **Say so in that commit message** rather than letting it look like a stray edit.
5. **Search `client/`, never `client/src/`.** `client/shared.d.ts` sits one level *above* `client/src/` and is a real rename target (`rof: number; str: number; d: number;` at `:8` and `:14`, `acc?: number[]` at `:9`, `:15`, `:73`). Every grep in this plan scopes `client/` for exactly this reason. A `client/src/` scope silently misses the file **and the final verification passes anyway** — which is how this plan shipped with the bug until dispatch.
6. **Another agent commits to this branch, and it is live.** It commits with a broad `git add`. HEAD moved twice while the spec was being written. **Re-check `git log --oneline -1` before every commit**, never trust `HEAD~1`, and stage only your own exact paths — a broad `git add` from either side is how a half-finished rename lands in someone else's commit.
7. **`Aim` is not `Accuracy` and must not be renamed.** `Aim` is the **D6 target number** (lower is better); `Accuracy` is the **stat** (higher is better). They invert. `combat.js:42` exists purely to protect that sign convention. `modAim`, `aimBreakdown`, `computeModifiedAim`, `aimTerms`, `"base aim"` and the `Aimed` **action** all stay exactly as they are.

## File Structure

No files are created or deleted except one new test file. Every change is in place.

| file | sites | responsibility in this plan |
|---|---|---|
| `shared/rules.js` | 25 | `WEIGHT_STR_MOD`, `woundTarget` param, `AIM` (untouched) |
| `shared/game-state.js` | 97 | `WEAPONS`/`UNIT_WEAPONS` field defs, `WEAPON_UPGRADES` effects + tags, `BLAST_*` |
| `shared/combat.js` | 68 | `effStr`, aim terms, ledger labels, attack summary |
| `shared/glossary.js` | 11 | the `str` / `acc` glossary entries and their `match` arrays |
| `shared/*.test.js` | 250+ | identifier + string updates only |
| `client/shared.d.ts` | 7 | the shared-module type decls (`str`/`d`/`acc`). **Above `client/src/` — see trap 5.** Carries one authorised user line. |
| `client/src/**` | ~45 | `types.ts`, wizards, `RollConsole`, `loadout`, CSS class names |
| `scripts/balance/*.mjs` | 4 | harness reads of `.str` / `.d` |
| `rules.md` | 86 | **runtime input** — the rules bot's system prompt |
| `shared/rulebook.test.js` | **new** | the first test that has ever covered `rules.md` |

---

### Task 1: `WEIGHT_STR_MOD` → `WEIGHT_PEN_MOD`

**Files:**
- Modify: `shared/rules.js:62-64`
- Modify: every consumer (16 sites total across `shared/`, `client/`, `scripts/`)

- [ ] **Step 1: Find every site**

```bash
grep -rn 'WEIGHT_STR_MOD' shared/ server/ client/ scripts/ rules.md
```

Expected: **16** hits.

- [ ] **Step 2: Rename the declaration**

In `shared/rules.js`, replace lines 62–64:

```js
// Weight-class STR modifier applied to every Wound Roll (§12); Aim target
// number (§2, roll >= to hit).
export const WEIGHT_STR_MOD = { light: -1, medium: 0, heavy: 1, colossal: 2 };
```

with:

```js
// Weight-class Penetration modifier applied to every Wound Roll (§12).
export const WEIGHT_PEN_MOD = { light: -1, medium: 0, heavy: 1, colossal: 2 };
```

Note the stray `; Aim target number (§2, roll >= to hit).` in the old comment belonged to the `AIM` const on the next line, not to this one. Dropping it is a comment fix, not a behaviour change. **Leave `AIM` itself untouched.**

- [ ] **Step 3: Rename every consumer**

Update all remaining hits from Step 1 to `WEIGHT_PEN_MOD`. Identifier-only; no values change.

- [ ] **Step 4: Verify no sites remain**

```bash
grep -rn 'WEIGHT_STR_MOD' shared/ server/ client/ scripts/ rules.md
```

Expected: **no output.**

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: `Tests 293 passed (293)` and `ℹ pass 811 / ℹ fail 0`.

- [ ] **Step 6: Stage, run the numbers gate, commit**

```bash
# Stage ONLY the exact files Step 1 reported. Never a directory: `git add client/`
# would sweep the user's authorised shared.d.ts line into THIS commit, which does
# not touch that file. One task, one file list, derived from its own grep.
git add shared/rules.js shared/rules.test.js shared/combat.js shared/game-state.js
diff <(git diff --cached -U0 | grep '^-' | grep -v '^---' | grep -oE '\b[0-9]+\b' | sort) \
     <(git diff --cached -U0 | grep '^+' | grep -v '^+++' | grep -oE '\b[0-9]+\b' | sort)
```

Expected from the `diff`: **no output**. Then:

```bash
git commit -m "refactor(rules): WEIGHT_STR_MOD -> WEIGHT_PEN_MOD"
```

> Adjust the `git add` list to the files Step 1 actually reported. **Never `git add -A`** (trap 4).

---

### Task 2: `BLAST_STR` → `BLAST_PEN`, `BLAST_D` → `BLAST_DMG`

**Files:**
- Modify: `shared/game-state.js:36-41`
- Modify: consumers (9 + 6 = 15 sites)

- [ ] **Step 1: Find every site**

```bash
grep -rn 'BLAST_STR\|BLAST_D\b' shared/ server/ client/ scripts/
```

Expected: **15** hits.

- [ ] **Step 2: Rename the declarations**

In `shared/game-state.js`, replace:

```js
// §9 — a munition cook-off has no weapon profile, so its shot is these two
// constants. STR 8 was rescaled with the weapon ladder (was 10 on the old 4..13
// scale); D2 is Autocannon/Mortar-grade. vs a medium hull (T5) that is 3+ — a
// cook-off should be nasty, not certain.
export const BLAST_STR = 8;
export const BLAST_D = 2;
```

with:

```js
// §9 — a munition cook-off has no weapon profile, so its shot is these two
// constants. Penetration 8 was rescaled with the weapon ladder (was 10 on the
// old 4..13 scale); Damage 2 is Autocannon/Mortar-grade. vs a medium hull (T5)
// that is 3+ — a cook-off should be nasty, not certain.
export const BLAST_PEN = 8;
export const BLAST_DMG = 2;
```

- [ ] **Step 3: Rename every consumer**

Update all remaining hits from Step 1. Includes `client/src/v2/battle/BlastBody.tsx`.

- [ ] **Step 4: Verify**

```bash
grep -rn 'BLAST_STR\|BLAST_D\b' shared/ server/ client/ scripts/
```

Expected: **no output.**

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: 293 vitest / 811 node, zero failures.

- [ ] **Step 6: Stage, gate, commit**

Stage the files Step 1 reported, run the numbers gate from the header (expect no output), then:

```bash
git commit -m "refactor(rules): BLAST_STR/BLAST_D -> BLAST_PEN/BLAST_DMG"
```

---

### Task 3: `effStr` → `effPen`, and `woundTarget`'s parameter

**Files:**
- Modify: `shared/rules.js:101,114,130-131` (`woundRaw` / `woundTarget` params)
- Modify: `shared/combat.js:532` and every `effStr` reader (19 sites)

- [ ] **Step 1: Find every site**

```bash
grep -rn 'effStr' shared/ server/ client/ scripts/
```

Expected: **19** hits.

- [ ] **Step 2: Rename `woundRaw`'s parameter**

In `shared/rules.js`, replace the signature and body of `woundRaw`:

```js
function woundRaw(str, toughness) {
  const s = Math.floor(Number(str) || 0);
```

with:

```js
function woundRaw(pen, toughness) {
  const s = Math.floor(Number(pen) || 0);
```

Inside the same function, update the comment that reads `STR may coerce — it fails toward TN 10 (10%) — but T must be real.` to `Penetration may coerce …`. **Leave the `typeof toughness` check and its whole comment block alone** — it is load-bearing and unrelated.

- [ ] **Step 3: Rename `woundTarget`'s parameter**

```js
export function woundTarget(pen, toughness) {
  return Math.max(WOUND_TN_FLOOR, Math.min(WOUND_DIE, woundRaw(pen, toughness)));
}
```

Update its doc comment's `A shot's effective STR` → `A shot's effective Penetration`, and `Each point of STR is worth exactly 10%` → `Each point of Penetration is worth exactly 10%`.

- [ ] **Step 4: Leave `strOvermatchD` completely alone**

It still reads `strOvermatchD(str, toughness)` and calls `woundRaw(str, toughness)`. That call still works — the parameter name changed, not the argument. **This is trap 1. Do not touch it.** The rework deletes it.

- [ ] **Step 5: Rename `effStr` in `combat.js`**

At `shared/combat.js:532`:

```js
const effPen = pen + bonus + braced + hardened + reactive + shieldBlunt + cracked + sideRearDock;
```

> `pen` on the right-hand side does not exist yet — it is `str` until Task 4. **Use `str` here for now** and let Task 4 sweep it. This task renames `effStr` only.

So the line for *this* task is:

```js
const effPen = str + bonus + braced + hardened + reactive + shieldBlunt + cracked + sideRearDock;
```

Update the remaining `effStr` readers from Step 1.

- [ ] **Step 6: Verify**

```bash
grep -rn 'effStr' shared/ server/ client/ scripts/
```

Expected: **no output.**

- [ ] **Step 7: Run the full suite**

```bash
npm test
```

Expected: 293 / 811, zero failures.

- [ ] **Step 8: Stage, gate, commit**

```bash
git commit -m "refactor(combat): effStr -> effPen; woundTarget takes pen"
```

---

### Task 4: the weapon field `str` → `pen`

The big one: 190 `\bstr\b` sites. Atomic — every definition and every reader in one commit.

**Files:**
- Modify: `shared/game-state.js` — `WEAPONS`, `UNIT_WEAPONS`, `WEAPON_UPGRADES` `effect.str`, `normalizeWeapon`, `applyWeaponUpgrade`
- Modify: `shared/combat.js` — every `profile.str` / `w.str` read, the attack `summary`
- Modify: `shared/*.test.js`, `client/src/**`, `scripts/balance/*.mjs`

- [ ] **Step 1: Inventory**

```bash
grep -rn '\bstr\b' shared/ server/ client/ scripts/ | grep -v strOvermatch
```

Expected: **190** hits. Read the list before editing — confirm none are `String`/`strict`/`construct` (there are none in `shared/combat.js`; verified).

- [ ] **Step 2: `shared/game-state.js` — weapon tables**

Rename the `str:` key to `pen:` on every entry of `WEAPONS.longRange`, `WEAPONS.melee` and `UNIT_WEAPONS`. Values unchanged. Example — the first two lines become:

```js
    "Mini Gun":       { rof: 8, pen: 3,  d: 1, sweet: 7,  peak: 2, dropoff: 0.35, minRange: 0, maxRange: 18, perks: ["Raking Fire"], machineGun: true },
    "Double MG":      { rof: 8, pen: 5,  d: 1, sweet: 9,  peak: 1, dropoff: 0.25, minRange: 0, maxRange: 20, perks: ["Raking Fire"], machineGun: true },
```

- [ ] **Step 3: `shared/game-state.js` — upgrade effects**

Rename `effect: { str: N }` → `effect: { pen: N }` on all five always-on entries (`honed-talons`, `depleted-core`, `reinforced-head`, `haymaker`, `fluked-head`). **Leave the `tag` strings alone — Task 8 does display.**

- [ ] **Step 4: `shared/game-state.js` — `applyWeaponUpgrade`**

At the profile-build site (`game-state.js:706-707`):

```js
    rof: base.rof + (effect.rof || 0),
    pen: base.pen + (effect.pen || 0),
```

- [ ] **Step 5: `shared/combat.js` — readers and the summary**

Every `profile.str` becomes `profile.pen`. The attack summary's `(STR ${str})` becomes `(Pen ${pen})` — **this is a display string and it is fine to do here**, because the rest of the summary is already being edited for the identifier.

- [ ] **Step 6: `client/src/**` and `scripts/balance/*.mjs`**

Sweep the remaining hits. `client/src/state/types.ts:95-96`:

```ts
  /** Wound step only: the effective Penetration and the struck location's Toughness. */
  pen?: number | null;
```

**`client/shared.d.ts` is a rename target and this plan's greps reach it only because they scope `client/`, not `client/src/` (trap 5).** Rename `str` → `pen` at `:8` and `:14`, and update the §7.5 comment at `:5-6`:

```ts
  // §7.5 wound model: `pen` is compared against the struck location's Toughness
  // via `woundTarget(pen, T)`; each wound then deals `dmg` SP.
  interface WeaponProfile {
    rof: number; pen: number; dmg: number;
    acc?: number[]; rng?: number[];
```

> `d` → `dmg` and `acc` → `accuracy` here belong to Tasks 5 and 6; do only `str` → `pen` now. **The file also carries one uncommitted user line (`+ sprintMult: number;`) which the user has authorised to ride along — name it in the commit message (trap 4).**

- [ ] **Step 7: Verify**

```bash
grep -rn '\bstr\b' shared/ server/ client/ scripts/ | grep -v strOvermatch
```

Expected: **no output.**

- [ ] **Step 8: Run the full suite**

```bash
npm test
```

Expected: 293 / 811, zero failures. **If a test fails here, you renamed a value, not an identifier — do not "fix" the test.** Revert the hunk and find the real edit.

- [ ] **Step 9: Stage, gate, commit**

The numbers gate matters most on this task. Expect no output, then:

```bash
git commit -m "refactor(weapons): the weapon stat str -> pen"
```

---

### Task 4b: the camelCase `Str` compounds — the ~130 sites `\bstr\b` cannot see

**This task exists because the plan was wrong.** Every grep in Tasks 1–4 anchors on `\bstr\b`, which **cannot match `computeStr`, `strBreakdown`, `nextAttackStr`** or any other camelCase compound — the same word-boundary quirk that (deliberately) hides `strOvermatchD`. Task 12's final verification used the same anchor, so **the rename would have reported clean with 130 sites still saying `Str`.** Found only because Task 4's implementer read the meltdown comment and surfaced `nextAttackStr`.

**Files:**
- Modify: `shared/combat.js`, `shared/game-state.js`, `shared/rules.js`, their tests, `client/shared.d.ts`, `client/src/**`

- [ ] **Step 1: Inventory**

```bash
grep -rhoE '\b[A-Za-z]+Str\b|\bstr[A-Z][A-Za-z]*\b' shared/ server/ client/src client/shared.d.ts scripts/ | sort | uniq -c | sort -rn
```

Expected, and the disposition of each:

| identifier | sites | rename to |
|---|---|---|
| `computeStr` | 63 | **`computePen`** |
| `strOvermatchD` | 31 | **LEAVE** — the rework deletes it (trap 1) |
| `strBreakdown` | 17 | **`penBreakdown`** |
| `nextAttackStr` | 12 | **`nextAttackPen`** — see Step 3, this one is persisted |
| `strOverride` | 11 | **`penOverride`** |
| `riposteStr` | 9 | **`ripostePen`** |
| `sideRearStr` | 7 | **`sideRearPen`** |
| `nextStr` | 4 | **`nextPen`** |
| `binaryStr` | 4 | **LEAVE** — a binary string in `client/src/assets/Robot Move standalone.html`, unrelated to this game's stats |
| `strBd` | 3 | **`penBd`** |
| `backdraftStr` | 3 | **`backdraftPen`** |
| `strTerm` | 2 | **`penTerm`** |

- [ ] **Step 2: Rename them**

`computeStr` is the public effective-Penetration entry point (`combat.js:389`) — `computeStr(attacker, profile, opts)` returns `strBreakdown(...).value`. Both rename together.

`riposteStr` is also an **upgrade effect key** (`{ id: "anvil-boss", effect: { riposteStr: 6 } }` in `rules.js`). Internal to the catalog, so renaming it is safe — but rename the key and its reader in the same edit or Anvil Boss silently stops countering.

- [ ] **Step 3: `nextAttackStr` is PERSISTED STATE — read this before renaming it**

`server/store.js` serialises the whole rooms map to disk (`fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(rooms)))`) and reads it back with `JSON.parse`. `rig.equipState.nextAttackStr` is therefore a **saved key**, not a local.

Renaming it means a room saved with a banked Meltdown Protocol charge loads into a server that reads `nextAttackPen` — `undefined` — and the bonus **silently vanishes**. It is transient (set at activation start, consumed in `resolveFire`, cleared in `endActivation`), so the blast radius is one in-flight room on a dev branch. **Accepted deliberately; do not add a migration shim for a transient field.**

- [ ] **Step 4: `mode: "str"` — rename it, and know why it is safe**

`game-state.js` Meltdown Protocol takes two modes: `"str"` (arm +N Penetration on this activation's attacks) and `"burst"` (a 4" AoE). It **crosses the wire** — `client/src/state/types.ts:191` declares `mode: string`.

Rename it to `"pen"` on both sides. This is safe for a reason worth understanding: the server only ever compares `if (a.mode === "burst")`, so **every other string falls to the Penetration branch**. A stale cached client sending `"str"` still gets the right behaviour.

**That same property is a trap.** Because nothing compares `"str"`, a *wrong* value also reaches the Penetration branch — so **a broken rename here passes every test silently.** Task 4's implementer flagged exactly this. Assert it explicitly:

```js
test("Meltdown Protocol's pen mode arms the next attack", () => {
  // `mode` is a wire value and only "burst" is ever compared, so any string
  // reaches this branch — a broken rename here would pass silently. Pin it.
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.equipment = "thermal-lance"; b1.equipmentUpgrade = "meltdown-protocol";
  b1.equipState.meltdownCharge = 3;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "meltdown", mode: "pen", n: 3 } });
  assert.equal(b1.equipState.nextAttackPen, 3, "pen mode must bank the bonus onto the next attack");
});
```

> Check the real equipment/upgrade ids and the verb's attr names against `rules.js` and `game-state.js` before running this — the ids above are the shape, not verified strings. If the verb rejects, read the reject reason and fix the fixture, not the assertion.

- [ ] **Step 5: Verify**

```bash
grep -rhoE '\b[A-Za-z]+Str\b|\bstr[A-Z][A-Za-z]*\b' shared/ server/ client/src client/shared.d.ts scripts/ | sort | uniq -c | sort -rn
```

Expected: **only `strOvermatchD` (31) and `binaryStr` (4).** Nothing else.

- [ ] **Step 6: Full suite**

```bash
npm test
```

Expected: `293 passed`, `ℹ pass 812 / ℹ fail 0` — 811 plus the meltdown pin from Step 4.

- [ ] **Step 7: Stage, gate, commit**

```bash
git commit -m "refactor(combat): the camelCase Str compounds

computeStr, strBreakdown, nextAttackStr and eight others - ~130 sites that
\bstr\b cannot match, the same word-boundary quirk that hides strOvermatchD.
The plan's own final check used that anchor and would have passed with all of
them still saying Str.

nextAttackStr is persisted (server/store.js serialises the rooms map), so a
room saved mid-activation loses a banked Meltdown charge. Transient field,
dev branch, accepted rather than shimmed. Meltdown's wire mode str -> pen is
safe because only \"burst\" is ever compared - which is also why it needed a
test pinning it."
```

---

### Task 5: the weapon field `d` → `dmg`

**Files:**
- Modify: `shared/game-state.js` (`WEAPONS`, `UNIT_WEAPONS`), `shared/combat.js`, tests, client, scripts

- [ ] **Step 1: Inventory**

`d` is a single letter and cannot be grepped safely as a word. Anchor on its syntax instead:

```bash
grep -rn '\bd:\s*[0-9]' shared/ scripts/          # the table definitions
grep -rn 'profile\.d\b\|\.d ||\|first\.d\b\|\bd: profile' shared/combat.js
grep -rn '\bd\b' client/src/state/types.ts client/src/lib/loadout.ts
```

Read every hit before editing. **This is the one task where a blind replace will destroy the file.**

- [ ] **Step 2: `shared/game-state.js` — weapon tables**

Rename `d:` → `dmg:` on every `WEAPONS` / `UNIT_WEAPONS` entry. Example:

```js
    "Mini Gun":       { rof: 8, pen: 3,  dmg: 1, sweet: 7,  peak: 2, dropoff: 0.35, minRange: 0, maxRange: 18, perks: ["Raking Fire"], machineGun: true },
```

- [ ] **Step 3: `shared/combat.js` — the damage sum**

At `combat.js:566`:

```js
      sp = (profile.dmg || 1) + rend + evisc + overmatch;
```

And the fallback rider at `combat.js:527`:

```js
        dmg: profile.dmg || 1, rend: 0, evisc: 0, overmatch: 0,
```

And the rider push at `combat.js:577`:

```js
    out.push({ ...resolved, wounded, dmg: profile.dmg || 1, rend, evisc, overmatch });
```

> `overmatch` stays. The rework removes it (trap 1).

- [ ] **Step 4: `shared/combat.js` — the ledger term**

At `combat.js:894`, the label is display and Task 8 owns it, but the **value** is this task's:

```js
      dmgTerms.push({ label: "weapon D", value: first.dmg });
```

- [ ] **Step 5: Sweep tests, client, scripts**

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: 293 / 811, zero failures.

- [ ] **Step 7: Stage, gate, commit**

```bash
git commit -m "refactor(weapons): the weapon stat d -> dmg"
```

---

### Task 6: the weapon field `acc` → `accuracy`

**Files:**
- Modify: `shared/game-state.js` (melee entries in `WEAPONS.melee`, `UNIT_WEAPONS`), `shared/combat.js:31`, tests, client

- [ ] **Step 1: Inventory — BOTH forms**

```bash
grep -rn '\bacc\b' shared/ server/ client/ scripts/
grep -rhoE '\b[A-Za-z]+Acc\b|\bacc[A-Z][A-Za-z]*\b' shared/ server/ client/src client/shared.d.ts scripts/ | sort | uniq -c | sort -rn
```

Expected: **36** bare hits, plus **45** camelCase compounds `\bacc\b` cannot see — the same anchor bug that hid 130 `Str` compounds until Task 4b:

| identifier | sites | rename to |
|---|---|---|
| `accHere` | 12 | `accuracyHere` |
| `accTier` | 10 | `accuracyTier` |
| `sweetBandAcc` | 8 | `sweetBandAccuracy` |
| `predictiveAcc` | 4 | `predictiveAccuracy` |
| `accTotal` | 4 | `accuracyTotal` |
| `accLabel` | 4 | `accuracyLabel` |
| `weaponAcc` | 3 | `weaponAccuracy` |

`acc` is melee-only as a *weapon field* — ranged weapons derive accuracy from `sweet`/`peak`/`dropoff`. The compounds above are the modifier-space plumbing and span both.

- [ ] **Step 2: Rename the melee entries**

```js
    "Sword":         { rof: 2, pen: 5, dmg: 3, accuracy: [0, 0], rng: [2, 2], melee: true },
```

…and the same for `Circular Saw`, `Chainsaw`, `Claw`, `Lance`, `Wrecking Ball`, `Bulwark Shield`, `Flamethrower`, `Anchor`, `Pressure Claw`, `Talon`, plus `Dozer Blade` and `Ram Spike` in `UNIT_WEAPONS`.

- [ ] **Step 3: `shared/combat.js:31`**

```js
  if (profile.melee) return profile.accuracy?.[0] || 0;
```

- [ ] **Step 4: Sweep tests and client**

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: 293 / 811, zero failures.

- [ ] **Step 6: Stage, gate, commit**

```bash
git commit -m "refactor(weapons): the weapon stat acc -> accuracy"
```

---

### Task 7: display strings — upgrade tags and the glossary

**Files:**
- Modify: `shared/game-state.js` — `WEAPON_UPGRADES` / `EQUIPMENT_UPGRADES` `tag` strings
- Modify: `shared/glossary.js:61-70`
- Modify: `shared/glossary.test.js`

- [ ] **Step 1: Find the tags**

```bash
grep -rn 'tag: ".*STR\|tag: ".*ACC' shared/game-state.js
```

- [ ] **Step 2: Rewrite the tag strings**

`tag` is rendered **verbatim** by the commission wizard, loadout view, rig terminal and passive badges. **Change only the words inside; do not restructure or add metadata.**

```js
    { id: "honed-talons", nature: "field", name: "Honed Talons", tag: "+2 Penetration", effect: { pen: 2 } },
    { id: "depleted-core", nature: "field", name: "Depleted Core", tag: "+2 Penetration", effect: { pen: 2 } },
    { id: "reinforced-head", nature: "field", name: "Reinforced Head", tag: "+2 Penetration", effect: { pen: 2 } },
    { id: "haymaker", nature: "field", name: "Haymaker", tag: "+3 Penetration", effect: { pen: 3 } },
    { id: "fluked-head", nature: "field", name: "Fluked Head", tag: "+3 Penetration", effect: { pen: 3 } },
```

And the conditional ones:

```js
    { id: "steady-aim", nature: "tuned", name: "Steady Aim", tag: "+3 Penetration when firing from the sweet spot (±2\")", effect: { steadyAim: true } },
    { id: "exploit-wound", nature: "tuned", name: "Exploit Wound", tag: "+3 Penetration vs an already-damaged location", effect: { vsWoundedLoc: true } },
    { id: "cold-bore", nature: "tuned", name: "Cold Bore", tag: "+3 Penetration vs undamaged targets", effect: { coldBore: true } },
    { id: "opportunist", nature: "tuned", name: "Opportunist", tag: "+3 Penetration vs disrupted / overheated targets", effect: { vsDisrupted: true } },
    { id: "full-tilt", nature: "tuned", name: "Full Tilt", tag: "Charge in for +3 Penetration", effect: { charge: 3 } },
    { id: "momentum-swing", nature: "tuned", name: "Momentum Swing", tag: "Charge in for +2 Penetration and a knockback (knockback spatial)", effect: { charge: 2 } },
    { id: "taut-cable", nature: "tuned", name: "Taut Cable", tag: "+3 Penetration vs immobilised or engaged targets", effect: { vsPinned: true } },
    { id: "breach-grip", nature: "prototype", name: "Breach Grip", tag: "Pry a location's armor open (+2 Penetration from anyone)", catch: "Leaves you locked in melee while gripping", effect: { breachGrip: true } },
    { id: "hydraulic-vice", nature: "prototype", name: "Hydraulic Vice", tag: "Pry a location's armour open (+2 impact from anyone)", catch: "Leaves you locked in melee while gripping", effect: { breachGrip: true } },
```

> `hydraulic-vice` says "impact", not "STR" — a pre-existing inconsistency with its twin `breach-grip`. **Leave it as "impact".** Aligning it is a copy change, not a rename, and it is not this plan's business.

- [ ] **Step 3: Rewrite the glossary entries**

`shared/glossary.js` — the `match` array is what the click-to-explain surface scans page text for. Rename `term`, `match` **and** `def` together, or the surface silently stops matching.

```js
    id: "accuracy", term: "Accuracy", match: ["Accuracy", "ACC"],
```

```js
    id: "penetration", term: "Penetration", match: ["Penetration"],
```

> `match: ["Accuracy", "ACC"]` keeps `ACC` deliberately: `rules.md` prose and existing battle text may still render the short form in places this plan does not reach. A stale match string is harmless; a missing one silently breaks the gloss.

Then update every `def` that mentions the old names — lines 46, 78, 90, 110, 154, 162, 170, 202, 206:

```js
    def: "A Rig's base D6 target number to hit, modified by weapon Accuracy and cover (§2, §7).",
```
```js
    def: "One D10 per landed hit, needing 6 + the location's Toughness − your effective Penetration (§7.5). Each wound deals the weapon's Damage. A natural 10 always wounds, so no target is ever immune.",
```
```js
    def: "A Fire Weapon action where you choose the hit location instead of rolling for it, at −2 Accuracy (Precision removes the penalty) (§5, §13).",
```
```js
    def: "Weapon perk / optional fire-mode: +2 Penetration, but each attack die that rolls a 1 adds 1 heat (§13).",
```
```js
    def: "Machine-gun perk: deals no damage to a target's front arc, but gains +3 Penetration on the side arc and +6 Penetration on the rear arc, replacing the usual arc bonuses (§13).",
```
```js
    def: "Weapon perk: may make an Aimed Shot without the usual −2 Accuracy penalty (§13).",
```
```js
    def: "A facing zone to a Rig's flank — attacks gain +2 Penetration here (+3 with Raking Fire) (§7, §13).",
```
```js
    def: "The facing zone behind a Rig — attacks gain +3 Penetration here (+6 with Raking Fire). Melee climbs the same ladder as ranged (§7, §13).",
```

> **Leave the `overmatch` entry (line 89-90) alone.** The rework deletes it (trap 1).

- [ ] **Step 4: The ledger labels in `shared/combat.js`**

```js
      dmgTerms.push({ label: "weapon Damage", value: first.dmg });     // was "weapon D"   (:894)
```
```js
      ? `weapon Accuracy at ${opts.distance}"` : "weapon Accuracy",     // was "weapon ACC" (:92)
```

> **`terms.push({ label: "base aim", value: base })` at `:89` stays.** It *is* the target number, not the stat (trap 7).

- [ ] **Step 5: Sweep remaining client display strings**

```bash
grep -rn '\bSTR\b\|\bACC\b' client/src/
```

Includes `CommissionWizard.tsx`, `UnitWizard.tsx`, `AttackWizard.tsx`, `LoadoutView.tsx`, `RollConsole.tsx`, `ReactionPicker.tsx`, `RigItem.tsx`, and CSS class names in `client/src/v2/styles/overlay.css` and `client/src/styles/battle.css`. **Skip `client/src/v2/design-reference/oil-iron-terminal.html`** — it is a frozen design reference, not live code.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: 293 / 811, zero failures. `shared/glossary.test.js` is the one most likely to catch a partial job here.

- [ ] **Step 7: Stage, gate, commit**

```bash
git commit -m "refactor(display): tags, glossary and ledger read Accuracy/Penetration/Damage"
```

---

### Task 8: the guard test — `rules.md` vocabulary (RED)

**Nothing has ever tested `rules.md`.** It is baked verbatim into the rules bot's system prompt as "the single source of truth" (`server/config.js:6` → `server/prompt.js`), and it can drift from the engine silently. It already has. This task writes the first test that binds them.

**Files:**
- Create: `shared/rulebook.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// rules.md is a RUNTIME INPUT, not documentation: server/config.js -> server/prompt.js
// bakes it verbatim into the rules bot's system prompt as "the single source of truth",
// and the bot is instructed to refuse rather than guess. Nothing tested it until now,
// and it silently drifted from the engine (the weight ladder taught the pre-halving
// values for months). These tests are the binding.
const RULEBOOK = readFileSync(new URL("../rules.md", import.meta.url), "utf8");

test("rules.md teaches the current stat vocabulary, not the pre-rename one", () => {
  const legacy = [
    [/\bSTR\b/g, "STR -> Penetration"],
    [/\bACC\b/g, "ACC -> Accuracy"],
  ];
  const found = [];
  for (const [re, msg] of legacy) {
    const hits = RULEBOOK.match(re);
    if (hits) found.push(`${msg} (${hits.length} occurrences)`);
  }
  assert.deepEqual(found, [], `rules.md still teaches renamed stats:\n  ${found.join("\n  ")}`);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test shared/rulebook.test.js
```

Expected: **FAIL**, reporting roughly `STR -> Penetration (86 occurrences)` and `ACC -> Accuracy (~30 occurrences)`. The exact counts do not matter; a non-empty list does.

- [ ] **Step 3: Commit the red test**

```bash
git add shared/rulebook.test.js
git commit -m "test(rules): bind rules.md to the stat vocabulary (red)"
```

> Committing red is deliberate and safe here: `node --test` is only wired to `shared/**/*.test.js` via `npm test`, so this is one failing test in a suite the next task turns green immediately. If your review process forbids a red commit, fold Tasks 8 and 9 into one.

---

### Task 9: `rules.md` — the vocabulary (GREEN)

**Files:**
- Modify: `rules.md` (86 `STR` sites, ~30 `ACC` sites)

- [ ] **Step 1: Sweep the prose**

Replace `STR` → `Penetration` and `ACC` → `Accuracy` throughout, including:
- §2 the Aim definition (`:62`) — *"modified by weapon Accuracy and cover"*
- §5 Aimed Shot (`:134`), §7 cover bands (`:228-230`), the to-hit step (`:230`), the sweet-spot rule (`:232`)
- §7.5 the wound roll (`:245-249`) — *"D10 ≥ 6 + Toughness − effective Penetration"*
- §9 the cook-off (`:282`) — *"a flat Penetration 8 / Damage 2 hit"*
- §12 the weapon tables (`:359`, `:366`, `:386`) — the `| Weapon | ROF | STR | D | …` headers become `| Weapon | ROF | Pen | Dmg | …`
- §13 the upgrade tables (`:408-427`) and the conditional notes (`:433-437`)

**Leave `Aim` and `Aimed Shot` alone** (trap 7). **Leave the Overmatch paragraph at `:253` and its mention at `:254` alone** — the rework deletes them (trap 1).

- [ ] **Step 2: Run the guard test**

```bash
node --test shared/rulebook.test.js
```

Expected: **PASS**.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: `Tests 293 passed (293)`, `ℹ pass 812 / ℹ fail 0`. **Node goes 811 → 812** — the one new guard test.

- [ ] **Step 4: Stage, gate, commit**

```bash
git add rules.md
diff <(git diff --cached -U0 | grep '^-' | grep -v '^---' | grep -oE '\b[0-9]+\b' | sort) \
     <(git diff --cached -U0 | grep '^+' | grep -v '^+++' | grep -oE '\b[0-9]+\b' | sort)
git commit -m "docs(rules): rules.md teaches Accuracy/Penetration/Damage"
```

The gate matters here: `rules.md` is dense with magnitudes and a stray edit is invisible to the test suite.

---

### Task 10: the second guard — `rules.md` agrees with the engine (RED)

**This task fixes a real bug that predates both specs**, found while surveying. It moves no engine number: it aligns `rules.md` to what `rules.js` already does.

- `rules.md:92` teaches `Light −2 / Medium +0 / Heavy +2 / Colossal +4`
- `rules.md:344` teaches `| **STR modifier** | −1 | +0 | +1 | +2 |`
- `rules.js:64` does `{ light: -1, medium: 0, heavy: 1, colossal: 2 }`

Line 92 still teaches the **pre-halving ladder**. The bot has been telling players a rig scales Penetration twice as hard as the engine does. Line 346's worked example (*"a Sniper Cannon reads STR 9 on a Light"*) agrees with `:344` and the engine — so `:92` is the sole outlier.

**Files:**
- Modify: `shared/rulebook.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/rulebook.test.js`:

```js
import { WEIGHT_PEN_MOD } from "./rules.js";

test("rules.md's weight ladder matches WEIGHT_PEN_MOD", () => {
  // The engine is the truth; rules.md must quote it. rules.md:92 taught the
  // pre-halving ±2/±4 ladder long after rules.js halved it to ±1/±2.
  const sign = (n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
  const expected = ["light", "medium", "heavy", "colossal"].map((c) => sign(WEIGHT_PEN_MOD[c]));

  // Every "Light X / Medium Y / Heavy Z / Colossal W" ladder written in prose.
  const prose = [...RULEBOOK.matchAll(
    /Light\s*([+−-]\d)\s*\/\s*Medium\s*([+−-]\d)\s*\/\s*Heavy\s*([+−-]\d)\s*\/\s*Colossal\s*([+−-]\d)/g,
  )];
  assert.ok(prose.length > 0, "no prose weight ladder found in rules.md — did the wording change?");
  for (const m of prose) {
    assert.deepEqual(m.slice(1, 5), expected, `rules.md prose ladder "${m[0]}" disagrees with WEIGHT_PEN_MOD`);
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --test shared/rulebook.test.js
```

Expected: **FAIL** — `rules.md prose ladder "Light −2 / Medium +0 / Heavy +2 / Colossal +4" disagrees with WEIGHT_PEN_MOD`.

That failure *is* the bug. Confirm the test is catching the real thing before fixing it.

- [ ] **Step 3: Commit the red test**

```bash
git add shared/rulebook.test.js
git commit -m "test(rules): bind rules.md's weight ladder to the engine (red)"
```

---

### Task 11: fix the ladder `rules.md` teaches (GREEN)

**Files:**
- Modify: `rules.md:92`

- [ ] **Step 1: Fix the line**

Replace on `rules.md:92`:

```
   - **Any weapon may be fitted to any Rig**, regardless of weight class or faction; its **STR then scales with the chassis** (Light −2 / Medium +0 / Heavy +2 / Colossal +4, §12).
```

with:

```
   - **Any weapon may be fitted to any Rig**, regardless of weight class or faction; its **Penetration then scales with the chassis** (Light −1 / Medium +0 / Heavy +1 / Colossal +2, §12).
```

> If Task 9 already rewrote `STR` → `Penetration` on this line, only the four magnitudes change here. That is intended: **this is the one commit in the plan permitted to move a number in `rules.md`**, because it moves it *toward* the engine.

- [ ] **Step 2: Run the guard test**

```bash
node --test shared/rulebook.test.js
```

Expected: **PASS**.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: `Tests 293 passed (293)`, `ℹ pass 813 / ℹ fail 0`.

- [ ] **Step 4: Commit**

```bash
git add rules.md
git commit -m "fix(rules): rules.md taught the pre-halving weight ladder

rules.md:92 said Light -2 / Medium +0 / Heavy +2 / Colossal +4. rules.js has
done -1 / 0 / +1 / +2 since the ladder was halved, and rules.md:344's own table
and :346's worked example both agree with the engine — :92 was the sole outlier.

rules.md is baked verbatim into the rules bot's system prompt as the single
source of truth, so the bot has been teaching players that a chassis scales
Penetration twice as hard as it does. No engine value changes; this aligns the
prompt to the engine. Now covered by shared/rulebook.test.js."
```

---

### Task 12: final verification

- [ ] **Step 1: No legacy identifiers survive — bare forms**

```bash
grep -rn '\bstr\b\|\bacc\b\|effStr\|WEIGHT_STR_MOD\|BLAST_STR\|BLAST_D\b' \
  shared/ server/ client/ scripts/ | grep -v strOvermatch
```

Expected: **exactly two hits, both correct:**
- `shared/rules.js` — the `str` parameter inside `strOvermatchD`'s **body**. Trap 1 mandates leaving it; the rework deletes the function.
- `shared/rules.js:93` — the comment `// See docs/superpowers/specs/2026-07-15-str-overflow-design.md.` **That is a real file on disk.** Renaming the reference breaks it.

> **This step used to say "no output", which was unreachable by construction** — it contradicted trap 1, since `strOvermatchD`'s body contains `str`. Task 4's implementer caught it. An expectation that cannot be met trains the reader to ignore the check.

- [ ] **Step 1b: No legacy identifiers survive — camelCase forms**

**This is the check that actually matters**, and its absence is why the plan nearly shipped a half-done rename:

```bash
grep -rhoE '\b[A-Za-z]+Str\b|\bstr[A-Z][A-Za-z]*\b|\b[A-Za-z]+Acc\b|\bacc[A-Z][A-Za-z]*\b' \
  shared/ server/ client/src client/shared.d.ts scripts/ | sort | uniq -c | sort -rn
```

Expected: **only `strOvermatchD` (31) and `binaryStr` (4).** Anything else is an unfinished rename that `\bstr\b` cannot see.

- [ ] **Step 2: No legacy vocabulary survives**

```bash
grep -rn '\bSTR\b\|\bACC\b' shared/ server/ client/ scripts/ rules.md \
  | grep -v strOvermatch | grep -v design-reference
```

Expected: **no output.**

- [ ] **Step 3: Overmatch is untouched and intact**

```bash
grep -rc 'strOvermatchD\|OVERMATCH_PER_D\|OVERMATCH_MAX_D' shared/rules.js shared/combat.js shared/glossary.js rules.md
```

Expected: non-zero in each. **If any is zero you deleted Overmatch — that is the rework's job, not this plan's.** Restore it.

- [ ] **Step 4: `Aim` survived**

```bash
grep -rn 'modAim\|aimBreakdown\|computeModifiedAim' shared/combat.js | head -3
grep -n '"base aim"' shared/combat.js
```

Expected: all still present.

- [ ] **Step 5: Full suite**

```bash
npm test
```

Expected: `Tests 293 passed (293)` and `ℹ pass 813 / ℹ fail 0`. **813 = the 811 baseline + 2 new rulebook guards. If any *other* count changed, a test was added or lost and this plan did neither.**

- [ ] **Step 6: The user's work is untouched**

```bash
git status --short
```

Expected: `package.json`, `package-lock.json` still show ` M` (unstaged, the user's dependency upgrade), and nothing of yours is left unstaged.

---

## Self-Review

**Spec coverage** — every section of `2026-07-16-stat-rename-design.md` maps to a task:

| spec requirement | task |
|---|---|
| `str` → `pen` (weapon field) | 4 |
| `effStr` → `effPen` | 3 |
| `WEIGHT_STR_MOD` → `WEIGHT_PEN_MOD` | 1 |
| `BLAST_STR` / `BLAST_D` | 2 |
| `d` → `dmg` | 5 |
| `acc` → `accuracy` | 6 |
| prose/tags/glossary → Penetration/Damage/Accuracy | 7 |
| `rules.md` (the runtime-input surface) | 9 |
| keep `modAim` / `Aim` / `Aimed` | trap 7, verified task 12 step 4 |
| leave Overmatch symbols alone | trap 1, verified task 12 step 3 |
| "no number moves" | the gate command, every task |
| 811 node / 293 vitest green | task 12 step 5 (813 node — +2 new guards, justified) |

**Beyond the spec, deliberately:** Tasks 8/10 add the first tests that have ever covered `rules.md`, and Task 11 fixes the `:92` ladder bug they expose. The spec calls `rules.md` "the single highest-value file in this diff" and it had zero coverage; adding the guard while renaming it is the cheap moment. Task 11 is the only number that moves in this plan, it moves *toward* the engine, and it ships as its own commit with its own reasoning.

**Known gaps, deliberate:** `rules.md` documents Heavy and Colossal rigs at length (`:92`, `:344-346`) — classes `makeRig` cannot build (`SUPPORTED_RIG_CLASSES = ["light","medium"]`). The bot teaches two chassis classes that do not exist. **Out of scope for a rename**; worth its own decision (delete from the rulebook, or build the chassis).
