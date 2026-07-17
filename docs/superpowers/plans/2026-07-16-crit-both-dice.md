# Mark Every Decisive Die CRIT — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When one volley both tears a location open and kills the unit, promote *both* the tear-open die and the kill die to `tone: "crit"`, instead of last-write-wins keeping only the kill die.

**Architecture:** In `shared/combat.js` `resolveAttack`, replace the single `let critWound` with a `const critWounds = []` list that both the kill branch and the tear-open branch push to, then promote every die in the list after the damage loop. No client change — `RollConsole` already keys CRIT per-die. One test file changes (`shared/game-state.test.js`), driving the real `applyDamage` through `applyCommand`.

**Tech Stack:** Node built-in test runner (`node:test` + `node:assert`), plain JS. Run tests with `npm test` (or the file directly with `node --test`).

**Spec:** `docs/superpowers/specs/2026-07-16-crit-both-dice-design.md`

---

## File Structure

- `shared/combat.js` — `resolveAttack`. The only production change. Three tiny edits (declaration, two push sites, one promotion loop) plus two comment rewrites.
- `shared/game-state.test.js` — one new `test(...)` block with two cases. Drives `applyCommand` so the real `game-state.js` `applyDamage` (destroy + catastrophic logic) runs; `combat.test.js` cannot host this because its `makeCtx` stubs `applyDamage` (no-op or plain SP-subtract that never sets `target.destroyed`).

No new files. No client files touched.

---

## Background an implementer needs

**Why last-write-wins loses a die.** `resolveAttack` promotes a wound die to CRIT on two tiers:
- **gutted / kill** — `wasAlive && target.destroyed` (~line 817), assigns `critWound = h`, then `continue`.
- **torn open** — `wasFull && after === 0` (~line 823), assigns `critWound = h`.

A single read after the loop (~line 844) promotes exactly one die. When wound 1 tears the location
open (`critWound = h1`) and wound 2 kills (`critWound = h2`), the final read promotes h2 only; h1
stays `tone: "ok"` even though its own `effects` line (`… torn open in one blow`) already fired.

**Bounded at ≤ 2 CRIT dice.** All impacts in a volley hit the same `location`, so once torn open
`wasFull` is false and once destroyed `wasAlive` is false: at most one tear-open + one kill. A
single wound that both zeroes-from-full and kills enters the kill branch, whose `continue` skips
the tear-open branch — so one wound is counted once, not twice.

**How the test controls the outcome deterministically:**
- Weapon damage: Claw (Damage 3) + `rending-talons` (grants Rend, `+1` Damage) → each *wounding*
  hit spends `sp = dmg + rend = 4` (`shared/combat.js:559`, `:554`). The wound die only needs to
  land (`sp > 0`); force it with a max face.
- Location: fire with `action: "aimed"` and `loc: "engine"`. The aimed flag is `act === "aimed"`
  (`shared/game-state.js:2330`), so it applies to melee too, forces `location = "engine"`, and
  rolls **no** d12 (so no location die appears in `rolls`).
- Kill mechanics: the engine is a `power` part. Reaching 0 SP fires `catastrophicOnZero` (heat,
  spill) but does **not** destroy; spending a point *past* 0 fires `catastrophicAdditional`, which
  sets `engine.destroyed = true` for a power part (`shared/game-state.js:1724`), and a destroyed
  engine destroys the rig (`:1623`).
- The target's engine pool is set explicitly in the fixture so the plan does not depend on chassis
  defaults.

**Resolution shape the test reads:** `resolveAttack` pushes `{ kind: "attack", …, rolls, effects }`
(`shared/combat.js:982`). `rolls` holds one entry per die with `{ label, tone }`; wound dice are
labelled `wound 1`, `wound 2`, …. `effects` holds the drama lines.

---

## Task 1: Promote every decisive die to CRIT

**Files:**
- Modify: `shared/combat.js` (`resolveAttack`: declaration ~line 730, kill push ~line 820, tear-open push ~line 825, promotion ~line 844, comments ~lines 725-728 and ~835-843)
- Test: `shared/game-state.test.js` (one new `test(...)` block)

- [ ] **Step 1: Write the failing test**

Add this at the end of `shared/game-state.test.js` (it uses the same helpers as the existing
attack tests in that file: `startedRoom`, `clearPendingAnswer`, `findRig`, `applyCommand`).

```js
test("F3-E: a volley that tears a location open AND kills marks BOTH dice CRIT", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Claw";                 // ROF 2, Damage 3
  b1.weaponUpgrades.melee = "rending-talons"; // grants Rend (+1 Damage) → sp 4 per wounding hit
  const a1 = findRig(r, "a1");
  // A small full engine pool: wound 1 (sp 4) zeroes it from full (tear-open),
  // wound 2 (sp 4) spends past 0 and kills (engine is a power part).
  a1.engine = { sp: 4, max: 4, destroyed: false, heat: 0 };
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "aimed", weapon: "melee", target: "a1",
    loc: "engine", arc: "front", range: "near",
    dice: { toHit: [6, 6], wounds: [10, 10] }, // both hit, both wound
  } });

  const attack = r.game.resolutions.filter((x) => x.kind === "attack").at(-1);
  // Sanity: both tiers actually fired (guards against a fixture that drifted so
  // that, say, wound 1 no longer zeroed the engine from full).
  assert.ok(attack.effects.some((e) => /torn open/.test(e)), "tear-open effect fired");
  assert.ok(attack.effects.some((e) => /gutted/.test(e)), "kill effect fired");

  const woundRolls = attack.rolls.filter((roll) => /^wound /.test(roll.label));
  assert.equal(woundRolls.length, 2, "two wound dice on a ROF-2 volley");
  const crits = woundRolls.filter((roll) => roll.tone === "crit");
  assert.equal(crits.length, 2, "BOTH the tear-open die and the kill die read CRIT");
});
```

- [ ] **Step 2: Run the test — verify it FAILS on the CRIT count**

Run: `node --test shared/game-state.test.js` (or `npm test`).

Expected: the new test FAILS at `assert.equal(crits.length, 2, ...)` with `crits.length === 1` —
the current last-write-wins code marks only the kill die. The two `effects` sanity asserts must
PASS (if either fails, the fixture drifted — the engine pool no longer produces a tear-open-then-
kill volley; fix the fixture before proceeding, do not weaken the asserts).

- [ ] **Step 3: Change the declaration**

In `shared/combat.js`, replace the `critWound` declaration and its comment.

Find (~lines 725-730):

```js
  // Drama (§7 spill / §8 kill tier) — player-facing lines for the resolution's
  // `effects`. `critWound` records the wound that tore a location open or killed
  // the rig, so that once the damage loop below has run, that die's tone can be
  // promoted to `crit`.
  const drama = [];
  let critWound = null;
```

Replace with:

```js
  // Drama (§7 spill / §8 kill tier) — player-facing lines for the resolution's
  // `effects`. `critWounds` collects EVERY wound that tore a location open or
  // killed the rig, so that once the damage loop below has run, each of those
  // dice can be promoted to `crit`. A volley can do both (tear a location open,
  // then kill on a later wound); both dice earn CRIT, one per `effects` line.
  const drama = [];
  const critWounds = [];
```

- [ ] **Step 4: Change the kill-branch assignment to a push**

Find (~lines 817-822):

```js
        if (wasAlive && target.destroyed) {
          // A wreck doesn't also report its parts.
          drama.push(`${weaponName} — ${target.name} gutted in a single blow`);
          critWound = h;
          continue;
        }
```

Replace `critWound = h;` with `critWounds.push(h);` (keep the comment and the `continue`):

```js
        if (wasAlive && target.destroyed) {
          // A wreck doesn't also report its parts.
          drama.push(`${weaponName} — ${target.name} gutted in a single blow`);
          critWounds.push(h);
          continue;
        }
```

- [ ] **Step 5: Change the tear-open assignment to a push**

Find (~lines 823-826):

```js
        if (wasFull && after === 0) {
          drama.push(`${weaponName} — ${location} torn open in one blow`);
          critWound = h;
        }
```

Replace with:

```js
        if (wasFull && after === 0) {
          drama.push(`${weaponName} — ${location} torn open in one blow`);
          critWounds.push(h);
        }
```

- [ ] **Step 6: Change the promotion to loop over the list, and rewrite its comment**

Find (~lines 835-844):

```js
      // The die that tore a location open — or killed the rig outright — earns
      // CRIT. The wound rolls were pushed above, before applyDamage ran, so they
      // could not know then; hence the promotion here.
      // This must stay OUTSIDE the damage loop, for two reasons:
      //  - the kill branch `continue`s past the loop tail, so promoting next to
      //    the tear-open assignment would never fire on a kill; and
      //  - `critWound` is last-write-wins, so one read here promotes exactly one
      //    die, where promoting at each assignment would leave TWO dice reading
      //    CRIT on a volley that tears a location open and then kills.
      if (critWound) woundRolls[impacts.indexOf(critWound)].tone = "crit";
```

Replace with:

```js
      // Every die that tore a location open — or killed the rig outright — earns
      // CRIT. The wound rolls were pushed above, before applyDamage ran, so they
      // could not know then; hence the promotion here.
      // This must stay OUTSIDE the damage loop: the kill branch `continue`s past
      // the loop tail, so promoting inline would never fire on a kill. Promoting
      // the whole list here also means a volley that tears a location open on one
      // wound and kills on a later one lights up BOTH dice — one per `effects`
      // line — instead of last-write-wins keeping only the kill die. The list
      // holds at most two entries (one tear-open + one kill; the kill branch's
      // `continue` keeps a single wound that does both from being counted twice).
      for (const h of critWounds) woundRolls[impacts.indexOf(h)].tone = "crit";
```

- [ ] **Step 7: Run the test — verify it PASSES**

Run: `node --test shared/game-state.test.js`

Expected: the F3-E test PASSES — `crits.length === 2`.

- [ ] **Step 8: Add the single-wound guard case**

Append a second test (guards that a single wound doing both tiers is counted once, not twice — the
`continue` path). Add after the test from Step 1.

```js
test("F3-E: one wound that both zeroes-from-full and kills marks exactly ONE die CRIT", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Claw";
  b1.weaponUpgrades.melee = "rending-talons"; // sp 4 per wounding hit
  const a1 = findRig(r, "a1");
  // Engine max 3: a single sp-4 wound zeroes it from full (tear-open) AND spends
  // one point past 0 (kill). The kill branch `continue`s past the tear-open push,
  // so the die is collected once.
  a1.engine = { sp: 3, max: 3, destroyed: false, heat: 0 };
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "aimed", weapon: "melee", target: "a1",
    loc: "engine", arc: "front", range: "near",
    dice: { toHit: [6, 1], wounds: [10] }, // one lands, one misses → a single wound
  } });

  const attack = r.game.resolutions.filter((x) => x.kind === "attack").at(-1);
  assert.ok(attack.effects.some((e) => /gutted/.test(e)), "kill effect fired");
  const woundRolls = attack.rolls.filter((roll) => /^wound /.test(roll.label));
  assert.equal(woundRolls.length, 1, "one landing wound");
  const crits = woundRolls.filter((roll) => roll.tone === "crit");
  assert.equal(crits.length, 1, "exactly one CRIT die — not double-counted");
});
```

- [ ] **Step 9: Run the test file — verify BOTH cases pass**

Run: `node --test shared/game-state.test.js`

Expected: both F3-E tests PASS. If the second test's `gutted` sanity assert fails, the single-wound
fixture did not reach the kill tier (engine max wrong for the Rend total) — fix the fixture, not the
assert.

- [ ] **Step 10: Run the full suite**

Run: `npm test`

Expected: the whole suite is green (the change only adds CRIT tone to a die that was `ok`; no
existing assertion depends on the tear-open die being un-CRIT). If any pre-existing test asserted a
wound die's `tone` on a tear-open-then-kill volley, reconcile it — but none is expected.

- [ ] **Step 11: Commit**

```bash
git add shared/combat.js shared/game-state.test.js
git commit -m "fix(combat): mark every decisive die CRIT, not just the last

A volley that tears a location open on one wound and kills on a later
one now promotes BOTH dice to tone crit, matching the two effects lines.
Was last-write-wins, keeping only the kill die. critWound -> critWounds
list; both branches push; promote all after the loop. Bounded at 2 per
volley. No client change (RollConsole keys CRIT per-die). Tests in
game-state.test.js drive the real applyDamage.

Closes F3-E of the post-rework cleanup backlog.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** the change (list + two pushes + loop), the comment rewrites, the no-client-
  change note, and the two test cases (tear-open-then-kill → 2 CRIT; single-wound-both → 1 CRIT)
  each map to a step. Out-of-scope items in the spec stay untouched.
- **Placeholder scan:** none — every edit shows exact find/replace text and every test shows full code.
- **Type consistency:** `critWounds` (array) is declared in Step 3, pushed in Steps 4-5, and read in
  Step 6 with `for (const h of critWounds)`; `impacts.indexOf(h)` matches the existing index-into-
  `woundRolls` shape. Test reads `attack.rolls` / `attack.effects`, which match the resolution object
  at `shared/combat.js:982`.

## Notes on line numbers

All `~line` references are against HEAD at plan time; the catalog and file may have shifted. Locate
each edit by its quoted text, not its number — the find/replace blocks are the source of truth.
