# Opponent Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic scored engine that plays a side competently — flanks, uses cover, holds objectives, manages heat — with no LLM in the decision path.

**Architecture:** One pure entry point `chooseAction(room, rig, weights)` returns ONE command at a time; a small driver applies it via `applyCommand` and re-asks. The bot never mutates state, so it cannot cheat or desync. Scoring uses the engine's own maths.

**v1 scores HITS, not damage.** The damage calculations are being actively tuned, so `evaluate.js` uses only `ROF × P(hit)` — the half of the formula that is stable. **Task 1 (the `combat.js` refactor) is therefore DEFERRED and must not be implemented**; `shared/combat.js` keeps the zero diff it has held through all of spec 1. Start at Task 2.

**Tech Stack:** Plain ES modules under `shared/bot/`. Tests: `node --test` (NOT Vitest).

**Spec:** `docs/superpowers/specs/2026-07-15-opponent-brain-design.md`

**Baseline:** 739 shared tests passing. Every task must keep them green.

---

## Background the engineer needs

**Read the spec first.** Then:

- `shared/` is dependency-free ES modules imported by BOTH Node and the browser. NEVER import from `client/`.
- Tests use `node:test` + `node:assert/strict`. Run the suite with the **glob form**: `node --test "shared/*.test.js"` — bare `shared/` fails on Node 24. Bot tests live at `shared/bot/*.test.js`, so also run `node --test "shared/bot/*.test.js"`.
- Style: pure functions, comments explain WHY not WHAT. Match `shared/geometry.js` and `shared/field.js`.

### Verified API facts — do not re-derive

```js
import { createRoom, claimSide, applyCommand, checkCommand, findRig } from "./game-state.js";
const room = createRoom("CODE01");                 // NOT makeRoom(); takes NO options
claimSide(room, { name: "A", side: "a" });
applyCommand(room, { verb: "add", attrs: {         // EVERYTHING under `attrs`, never flat
  name: "Atk", class: "medium", owner: "a", longRange: "Mini Gun", melee: "Sword",
} });
```
- `applyCommand(room, cmd, context, options)` returns **`room`**, NOT `{ok, reason}`. Assert rejections with **`checkCommand(room, cmd)`** → `{ ok, reason }`. `options.random` injects the RNG.
- The `action` verb's attrs are **FLAT**: `{ name, action: "fire", weapon, target, arc, dice }` — `dice` is an **object** (`{ toHit, wounds, location }`), not an array.
- Existing helpers in `shared/game-state.test.js`: `digitalRoom(code)`, `digitalRoomWithMirroredRigs()`, `battleWithPreparedDefender`, `seededRandom(seed)`. **Read and reuse them.**
- Mid-activation state is forced directly:
```js
room.game.phase = "activation";
room.game.turn = { side: "a", activeRigId: rig.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
rig.loaded = { longRange: true, melee: true };
```

### What spec 1 already built (all green)

- `shared/geometry.js` — `sightCorridor(a, b, polys)` → `{ obstructed, buildingRays, cover, los }`; `arcOf(a, b)`; `distanceBetween`; `rimGap`; `meleeInReach(a, b, reach=2)`; `controlsObjective(rig, marker)`; `terrainPolygons(field)`; `radiusOf(rig)`. **These take `{ pos, facing, radius }`, NOT a rig** — `game-state.js` has a private `spatial(rig)` adapter; you may need to export it.
- `shared/pathfind.js` — `findPath(field, polys, blockers, radius, from, to)` → `{ path, length } | null`; `findPathOnGrid(grid, from, to)`; `buildGrid`.
- `shared/game-state.js` — `room.mode` ("physical" default), digital rigs carry `pos`/`facing`, `autoDeploy(room, random)`, `moveBudget(rig, act)`, `deriveAttackGeometry(room, attacker, target)`, `SPEED_BY_CLASS`.
- `shared/battle-view.js` — `availableActions(rig, turn, round)` → the legal action menu with `enabled`/`heat`/`cost`. **This is the legality gate, not a candidate list** — it says Fire is legal, not at whom.

### THE FIXTURE TRAP — has already burned real work twice

`normalizeWeaponUpgrade` returns `upgrades[0].id` (the **Field** upgrade) for a null/unknown id, so **`makeRig` cannot build an un-upgraded weapon**. Every legal rig carries its field upgrade. A bare-weapon fixture tests a loadout that cannot be commissioned. This silently made the balance sweep measure Field twice and invalidated two test fixtures plus every worked example in the Overmatch spec.

**Build bot fixtures through `applyCommand({verb:"add"})` or `makeRig` — never hand-assemble a weapon profile.**

### COMMITTING — this repo has bitten us three times

Dirty worktree; **another session commits to this branch concurrently using broad `git add`**. It has already swallowed a subagent's staged files into its own commit.
- **NEVER `git add -A` / `git add .`.** `git commit` commits the WHOLE INDEX, not just what you added.
- Explicit pathspec, **`-m` BEFORE `--`** (everything after `--` parses as a filename):
  `git commit -m "msg" -- shared/bot/score.js shared/bot/score.test.js`
- For a NEW file, `git commit -- <path>` fails ("did not match any file"). `git add <path>` first, then commit with the same pathspec.
- Run `git diff --cached --stat` immediately before committing; confirm ONLY your files.
- **Before touching a shared file: `git diff --stat -- <file>`.** If someone else has uncommitted work there, STOP and report.
- NEVER rewrite history. NEVER stash. NEVER switch branches.

---

## File Structure

**Modify:**
- `shared/game-state.js` — export `spatial`; add `sideBotOf`; `room.game.sides[i].bot`
- ~~`shared/combat.js`~~ — **NOT touched in v1.** Task 1 is deferred; the zero diff holds.

**Create:**
- `shared/bot/evaluate.js` — `expectedHits` (v1's offence metric). Depends on combat.js + game-state.js.
- `shared/bot/candidates.js` — expand the action menu into parameterised candidates.
- `shared/bot/score.js` — score one candidate; `PRESETS`.
- `shared/bot/index.js` — `chooseAction`, `runBotActivation`.
- Matching `*.test.js` for each.

Split this way because `score.js` is where tuning churn lives and `evaluate.js` is where maths lives — they change for different reasons.

---

### Task 1: DEFERRED — extract `effectiveStrAgainst` from `rollWounds`

> **DO NOT IMPLEMENT THIS YET.** The damage calculations are being actively tuned
> (`F2-B — price ROF in heat` is live). v1 scores **hits**, not damage, so this refactor is
> not needed and `shared/combat.js` keeps its zero diff. Kept here in full because the seam
> is already located and the analysis shouldn't be re-done from scratch later.
>
> **Do this when:** the arsenal settles and the bot needs to tell a Wrecking Ball
> (STR 10, ROF 1) from a Rivet Gun (STR 3, ROF 6). Until F2-B lands, preferring the Rivet
> Gun is *correct* (3.65 vs 2.98 SP), so v1's blindness costs nothing real.
>
> When you do: `score.js` consumes ONE number from `evaluate.js` behind the `w.damage`
> weight. Swap `expectedHits` for `expectedDamage` and nothing else in the scorer changes.

**The delicate one.** `shared/combat.js` is the most safety-critical file in the repo and has been at a zero diff through all of spec 1. `combat.test.js` (2178 lines) is the net.

**This is a PURE REFACTOR: no behaviour may change.** The acceptance test is that `combat.test.js` passes **with zero edits**. If you need to touch it, you changed behaviour — stop and report BLOCKED.

**Files:**
- Modify: `shared/combat.js` (`rollWounds`, ~line 435-531)
- Test: `shared/combat.test.js` — **read only, do not edit**

**The seam.** `rollWounds` computes ten defender modifiers inline, then at ~line 531:
```js
const effStr = str + bonus + braced + hardened + reactive + shieldBlunt + cracked + sideRearDock;
```
Everything above that line is pure arithmetic. Everything below is dice. Extract the arithmetic.

Note two things that must survive exactly:
- **`bonus == null` is an EARNED ZERO**, not a missing value — it means Raking Fire firing into a front arc, which auto-fails. Same for `shieldNegates`. `rollWounds` short-circuits on `if (bonus == null || shieldNegates)` BEFORE the roll and emits `noRoll: bonus == null ? "arc" : "shield"`. The extracted function must preserve the distinction between "zero because armour" (a bug this code's comments say a rewrite killed) and "zero because earned" (a mechanic).
- **`woundTerms`** is the ledger's display list and must keep its exact push order and labels.

- [ ] **Step 1: Write the characterisation test**

Add to `shared/bot/evaluate.test.js` (a NEW file — do not touch `combat.test.js`):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveStrAgainst } from "../combat.js";
import { makeRig, effectiveWeaponProfile } from "../game-state.js";

// Rigs MUST be built through makeRig — a hand-assembled weapon is a loadout the
// game cannot commission (normalizeWeaponUpgrade forces the field upgrade).
const rigOf = (over = {}) => makeRig(1, "Atk", "a", { weightClass: "medium", longRange: "Autocannon", melee: "Sword", ...over });

test("effectiveStrAgainst returns the arc bonus in effStr", () => {
  const a = rigOf();
  const b = makeRig(2, "Def", "b", { weightClass: "medium", longRange: "Autocannon", melee: "Sword" });
  const profile = effectiveWeaponProfile("longRange", a.weapons.longRange, a);
  const front = effectiveStrAgainst(a, b, profile, "hull", { arc: "front", round: 1 });
  const rear = effectiveStrAgainst(a, b, profile, "hull", { arc: "rear", round: 1 });
  assert.ok(rear.effStr > front.effStr, "rear arc is worth more STR");
  assert.equal(front.negated, false);
});

test("effectiveStrAgainst reports Brace as a -2 into the front arc", () => {
  const a = rigOf();
  const b = makeRig(2, "Def", "b", { weightClass: "medium", longRange: "Autocannon", melee: "Sword" });
  const profile = effectiveWeaponProfile("longRange", a.weapons.longRange, a);
  const bare = effectiveStrAgainst(a, b, profile, "hull", { arc: "front", round: 1 });
  b.preparation = { type: "brace", source: "action", faceUp: false };
  const braced = effectiveStrAgainst(a, b, profile, "hull", { arc: "front", round: 1 });
  assert.equal(braced.effStr, bare.effStr - 2);
});

test("effectiveStrAgainst flags an EARNED zero — Raking Fire into a front arc", () => {
  const a = rigOf({ longRange: "Mini Gun" });   // Mini Gun has Raking Fire
  const b = makeRig(2, "Def", "b", { weightClass: "medium", longRange: "Autocannon", melee: "Sword" });
  const profile = effectiveWeaponProfile("longRange", a.weapons.longRange, a);
  const r = effectiveStrAgainst(a, b, profile, "hull", { arc: "front", round: 1 });
  assert.equal(r.negated, true, "a rake cannot damage a front arc");
  assert.equal(r.noRoll, "arc");
});

test("effectiveStrAgainst carries toughness and the weapon's D", () => {
  const a = rigOf();
  const b = makeRig(2, "Def", "b", { weightClass: "medium", longRange: "Autocannon", melee: "Sword" });
  const profile = effectiveWeaponProfile("longRange", a.weapons.longRange, a);
  const r = effectiveStrAgainst(a, b, profile, "hull", { arc: "side", round: 1 });
  assert.ok(r.toughness > 0);
  assert.ok(r.d >= 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test "shared/bot/*.test.js"`
Expected: FAIL — `effectiveStrAgainst` is not exported.

- [ ] **Step 3: Extract**

Move everything in `rollWounds` from `const strBd = strBreakdown(...)` down to (and including) the `effStr` sum into a new exported function. Return everything `rollWounds` needs:

```js
// The wound step's deterministic half, split out so the BOT can score a shot
// with the exact arithmetic that resolves it (spec: opponent-brain). rollWounds
// keeps the dice; this keeps the maths. Two callers, one source of truth — a
// second copy of these ten modifiers would drift the moment an upgrade lands.
//
// `negated` is an EARNED zero, never an armour zero: a rake firing into a front
// arc (bonus == null) or a raised shield covering it. Those short-circuit before
// any roll and stay hard zeroes on a natural 10.
export function effectiveStrAgainst(attacker, target, profile, location, opts) {
  // ...the ten modifiers, moved verbatim...
  return {
    effStr: str + bonus + braced + hardened + reactive + shieldBlunt + cracked + sideRearDock,
    toughness,
    d: profile.d || 1,
    negated: bonus == null || shieldNegates,
    noRoll: bonus == null ? "arc" : shieldNegates ? "shield" : null,
    terms: woundTerms,
    // rollWounds' per-wound Evisceration needs the raw pieces; return whatever
    // else it consumed rather than recomputing there.
  };
}
```

Then `rollWounds` calls it and consumes the result. **Read the whole function before cutting** — `bonus`, `shieldNegates`, `woundTerms`, `toughness`, and `profile.d` are all used further down, so the return shape must cover every one of them.

- [ ] **Step 4: Verify the refactor changed nothing**

```bash
node --test "shared/*.test.js"          # 739 baseline, must be 739 + your new bot tests
git diff --stat -- shared/combat.test.js  # MUST BE EMPTY
```
If `combat.test.js` needed an edit, revert and report BLOCKED — the extraction changed behaviour.

- [ ] **Step 5: Commit**

```bash
git add shared/bot/evaluate.test.js
git commit -m "refactor(combat): extract effectiveStrAgainst from rollWounds" -- shared/combat.js shared/bot/evaluate.test.js
```

---

### Task 2: Expected hits (v1's offence metric) — **START HERE**

**Files:**
- Create: `shared/bot/evaluate.js`
- Test: `shared/bot/evaluate.test.js`

The full formula is `expectedDamage = ROF × P(hit) × P(wound) × D`. **v1 uses only the left
half**, because everything right of `P(hit)` is mid-tuning:

```
expectedHits = ROF × P(hit) × arcFactor(profile, arc)
```

`P(hit)` is accuracy/cover/range-band maths — stable, and `computeModifiedAim` is already
exported. **No `combat.js` change is needed for this task.**

**The `arcFactor` is v1's one invented number, and you must understand why it exists.**
Arc modifies **STR**, not accuracy — so `ROF × P(hit)` is *identical* front, side, and rear.
Without an explicit factor the bot has **no reason to flank at all**, which deletes the most
important behaviour in the spec. `arcBonus(profile, arc)` is exported; read it as a
preference:

```js
// arcBonus is the WOUND step's arc modifier. v1 has no wound term, so it reads it
// as a PREFERENCE: null is a hard veto, a bigger bonus is a better angle. This is
// a heuristic bridge, not the real maths — it preserves the ORDERING (rear > side
// > front; rake-into-front = never) while the magnitudes are still being tuned.
// The damage term (Task 1, deferred) deletes this wholesale.
function arcFactor(profile, arc) {
  const bonus = arcBonus(profile, arc);
  if (bonus == null) return 0;   // earned zero: a rake cannot damage a front arc
  return 1 + bonus / 4;          // ordering only; /4 is a knob, not a law
}
```

The `null` veto is exact and always right. The `1 + bonus/4` shaping is a guess.

**Three ROF bonuses are invisible to v1.** `rollToHit` computes an *effective* ROF internally
(`+2` Full Auto, `+Bloodletter` vs a damaged target, `+Redline Governor` from heat over cap).
You cannot call `rollToHit` to read it — it also runs `applyDefensiveReactions`, which
**mutates the target** (Point-Defense spend), and evaluating a candidate must never mutate.
Use `profile.rof`. Document the bias in the module comment; it under-rates three conditional
upgrades and is one-directional.

- [ ] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedHits } from "./evaluate.js";
import { makeRig } from "../game-state.js";

// Rigs MUST be built through makeRig. normalizeWeaponUpgrade forces the field
// upgrade for a null id, so a hand-assembled weapon is a loadout the game cannot
// commission — a fixture built that way tests something that does not exist.
const atk = (over = {}) => makeRig(1, "Atk", "a", { weightClass: "medium", longRange: "Autocannon", melee: "Sword", ...over });
const def = () => makeRig(2, "Def", "b", { weightClass: "medium", longRange: "Autocannon", melee: "Sword" });

test("expectedHits is zero for an earned zero — a rake into a front arc", () => {
  const a = atk({ longRange: "Mini Gun" });   // Mini Gun carries Raking Fire
  assert.equal(expectedHits(a, def(), "longRange", { arc: "front", distance: 7, cover: 0, round: 1 }), 0);
});

test("a rake still scores into the side and rear", () => {
  const a = atk({ longRange: "Mini Gun" });
  const opts = { distance: 7, cover: 0, round: 1 };
  assert.ok(expectedHits(a, def(), "longRange", { ...opts, arc: "side" }) > 0);
  assert.ok(expectedHits(a, def(), "longRange", { ...opts, arc: "rear" }) > 0);
});

test("rear outscores side outscores front — the flanking ordering", () => {
  const a = atk();
  const opts = { distance: 12, cover: 0, round: 1 };
  const front = expectedHits(a, def(), "longRange", { ...opts, arc: "front" });
  const side  = expectedHits(a, def(), "longRange", { ...opts, arc: "side" });
  const rear  = expectedHits(a, def(), "longRange", { ...opts, arc: "rear" });
  assert.ok(rear > side && side > front, `expected rear>side>front, got ${rear}/${side}/${front}`);
});

test("expectedHits falls off away from the weapon's sweet spot", () => {
  const a = atk();   // Autocannon: sweet 12
  const at = (d) => expectedHits(a, def(), "longRange", { arc: "front", distance: d, cover: 0, round: 1 });
  assert.ok(at(12) > at(24), "sweet spot beats long range");
  assert.ok(at(12) > at(2), "sweet spot beats point blank");
});

test("expectedHits drops with cover", () => {
  const a = atk();
  const opts = { arc: "front", distance: 12, round: 1 };
  assert.ok(expectedHits(a, def(), "longRange", { ...opts, cover: 0 })
          > expectedHits(a, def(), "longRange", { ...opts, cover: 2 }));
});

test("a natural 6 always hits — expectedHits never falls below rof/6", () => {
  const a = atk();
  // Absurd penalties: max cover at a terrible range.
  const h = expectedHits(a, def(), "longRange", { arc: "front", distance: 26, cover: 2, round: 1 });
  assert.ok(h > 0, "a natural 6 always hits, so hits can never be zero on a legal shot");
});
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement**

```js
// shared/bot/evaluate.js
// The bot's offence metric. v1 scores HITS, not damage.
//
// The full formula (validated by the balance harness over 32.3M sampled attacks,
// scripts/balance/) is ROF x P(hit) x P(wound) x D. v1 uses only the left half:
// everything right of P(hit) — STR, wound TN, D, Overmatch — is being actively
// tuned (F2-B prices ROF in heat next). P(hit) is not: it is accuracy, cover and
// range-band maths, which the balance work does not touch.
//
// KNOWN BIAS, deliberate: rollToHit computes an EFFECTIVE rof internally (+2 Full
// Auto, +Bloodletter vs a damaged target, +Redline Governor from heat over cap).
// We cannot read it — rollToHit also runs applyDefensiveReactions, which MUTATES
// the target (Point-Defense spend), and evaluating a candidate must never mutate.
// So we use profile.rof and under-rate those three conditional upgrades. The bias
// is small and one-directional.
//
// Also blind to the whole wound step: Brace's -2, Reactive Plating, Harden,
// toughness. See Task 1 (deferred) for when that changes.
import { computeModifiedAim, arcBonus } from "../combat.js";
import { effectiveWeaponProfile } from "../game-state.js";

// A D6 hits on `aim` or better; a natural 6 ALWAYS hits, so the floor is 1/6 no
// matter how bad the modifiers get.
function pHit(aim) {
  return Math.max(1 / 6, Math.min(1, (7 - aim) / 6));
}

// arcBonus is the WOUND step's arc modifier. v1 has no wound term, so it reads it
// as a PREFERENCE instead. Without this, ROF x P(hit) is identical on every arc —
// arc changes STR, not accuracy — and the bot would have no reason to flank at
// all, which is the single most important behaviour we want.
//
// The null veto is exact and always right (a rake genuinely cannot damage a front
// arc). The `1 + bonus/4` shaping is a GUESS: it preserves the ordering
// (rear > side > front) but not the true value. It is the one invented number in
// v1, and the damage term deletes it.
function arcFactor(profile, arc) {
  const bonus = arcBonus(profile, arc);
  if (bonus == null) return 0;
  return 1 + bonus / 4;
}

export function expectedHits(attacker, target, slot, opts) {
  const profile = effectiveWeaponProfile(slot, attacker.weapons?.[slot], attacker);
  if (!profile) return 0;
  const factor = arcFactor(profile, opts.arc);
  if (factor === 0) return 0;                 // earned zero — a rake into a front arc
  // A raised shield covering this arc is the other earned zero. shieldCoverage is
  // exported from rules.js; read it the same way resolveAttack does.
  if (shieldNegatesArc(target, opts.arc)) return 0;
  const aim = computeModifiedAim(attacker, profile, { ...opts, target });
  return (profile.rof || 1) * pHit(aim) * factor;
}
```

**You must write `shieldNegatesArc` by reading how `rollWounds` uses `shieldCoverage(target)`** — it returns `{ negate: [...arcs], blunt: [...arcs] }` and only fires when `target.preparation?.type === "raise-shield"`. Mirror that check exactly; do not invent one.

- [ ] **Step 4: Run.** All 4 tests pass, full suite still green.

- [ ] **Step 5: Commit**

```bash
git add shared/bot/evaluate.js
git commit -m "feat(bot): analytic expected damage" -- shared/bot/evaluate.js shared/bot/evaluate.test.js
```

---

### Task 3: Validate expected hits against the real engine

**The acceptance test for Task 2.** Without it the scorer is asserted, not verified.

**Files:**
- Test: `shared/bot/evaluate.test.js`

`rollToHit(attacker, profile, opts, providedDice, random)` is **exported** and returns
`{ modAim, rof, hits, ... }`. So validating hits needs no stub room and no `ctx` — just call
it in a loop and average `hits`.

**Caveat you must handle:** `rollToHit` runs `applyDefensiveReactions`, which can MUTATE the
target (a Point-Defense reroll changes the counted `hits` and spends the defender's charge).
`structuredClone` the target every trial, exactly as `scripts/balance/weapon-sweep.mjs` does.

- [ ] **Step 1: Write the test**

```js
import { rollToHit, arcBonus } from "../combat.js";
import { effectiveWeaponProfile } from "../game-state.js";

function sampleMeanHits(attacker, target, slot, opts, trials, seed) {
  const rand = seededRandom(seed);
  const profile = effectiveWeaponProfile(slot, attacker.weapons[slot], attacker);
  let total = 0;
  for (let i = 0; i < trials; i++) {
    // Clone: rollToHit runs applyDefensiveReactions, which mutates the target.
    const t = structuredClone(target);
    total += rollToHit(attacker, profile, { ...opts, target: t }, undefined, rand).hits;
  }
  return total / trials;
}

test("analytic expectedHits matches the real engine's sampled mean", () => {
  const cases = [
    { lr: "Autocannon", arc: "side", distance: 12 },
    { lr: "Autocannon", arc: "rear", distance: 24 },
    { lr: "Arc Gun",    arc: "side", distance: 20 },
    { lr: "Mini Gun",   arc: "rear", distance: 7  },
  ];
  for (const c of cases) {
    const a = makeRig(1, "Atk", "a", { weightClass: "medium", longRange: c.lr, melee: "Sword" });
    const b = makeRig(2, "Def", "b", { weightClass: "medium", longRange: "Autocannon", melee: "Sword" });
    const opts = { arc: c.arc, distance: c.distance, cover: 0, round: 1 };
    const profile = effectiveWeaponProfile("longRange", a.weapons.longRange, a);
    // expectedHits carries arcFactor, which the engine does NOT apply to hits —
    // it lives in the wound step. Divide it out to compare like with like.
    const predicted = expectedHits(a, b, "longRange", opts) / (1 + arcBonus(profile, c.arc) / 4);
    const observed = sampleMeanHits(a, b, "longRange", opts, 5000, 42);
    const tol = Math.max(0.08, observed * 0.05);
    assert.ok(Math.abs(predicted - observed) <= tol,
      `${c.lr} ${c.arc}@${c.distance}": analytic ${predicted.toFixed(3)} vs sampled ${observed.toFixed(3)} (tol ${tol.toFixed(3)})`);
  }
});
```

**Note the `arcFactor` division.** It is v1's invented preference multiplier and has no
counterpart in the engine's hit step — comparing without dividing it out would compare two
different quantities. This is exactly the sort of thing that makes a green test meaningless,
so if you find a cleaner way to structure it (e.g. exporting the raw `rof * pHit` separately
as `rawExpectedHits` and validating THAT), do it and say so.

- [ ] **Step 2: Run it. It may FAIL first — that is the point.**

`rollToHit` has terms the analytic model omits: Full Auto (+2 ROF), Bloodletter, Redline
Governor, and a Point-Defense reroll seam. The fixtures above avoid those (no Full Auto in
`opts`, undamaged target, cold attacker, no Point-Defense equipment) — **verify that is
actually true** rather than assuming it.

Your options when it fails, in order of preference:
1. Fold the missing term into `expectedHits` (correct, if deterministic).
2. If a term genuinely cannot be modelled without mutating, document it as a known bias in
   the module comment and narrow the fixture so the test covers what IS modelled. Do NOT
   widen the tolerance to hide a real error.
3. If the gap is structural and large, report DONE_WITH_CONCERNS with the numbers.

**Report the actual predicted-vs-sampled numbers for all four cases regardless of outcome.**
They are the most valuable output of this task.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(bot): validate expected hits against the real engine" -- shared/bot/evaluate.js shared/bot/evaluate.test.js
```

---

### Task 4: Candidate generation — non-move actions

**Files:**
- Create: `shared/bot/candidates.js`, `shared/bot/candidates.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import { candidatesFor } from "./candidates.js";

test("fire candidates are generated per enemy with LOS, in range, in the front arc", () => {
  const room = digitalRoomWithMirroredRigs();
  room.field.terrain = [];
  const [a, b] = room.rigs;
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 22, y: 10 }; b.facing = 180;
  startActivationFor(room, a);
  const cs = candidatesFor(room, a).filter((c) => c.action === "fire");
  assert.ok(cs.some((c) => c.target === b.name && c.weapon === "longRange"));
});

test("no fire candidate for an enemy behind a building", () => {
  // building spanning the corridor -> sightCorridor.los === false
  const cs = candidatesFor(room, a).filter((c) => c.action === "fire");
  assert.equal(cs.length, 0, "cannot shoot what you cannot see");
});

test("no fire candidate for an enemy outside the front 90 arc", () => {
  // b directly behind a
  const cs = candidatesFor(room, a).filter((c) => c.action === "fire" && c.weapon === "longRange");
  assert.equal(cs.length, 0);
});

test("melee candidates need rim gap <= 2in", () => {
  // touching mediums -> melee candidate exists; 10in apart -> none
});

test("aimed candidates cover every location", () => {
  const cs = candidatesFor(room, a).filter((c) => c.action === "aimed");
  assert.deepEqual([...new Set(cs.map((c) => c.location))].sort(), ["arms", "engine", "hull", "legs"]);
});

test("candidates only include actions availableActions says are enabled", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a] = room.rigs;
  startActivationFor(room, a);
  room.game.turn.actionsUsed = room.game.turn.actionsMax;   // no slots left
  const cs = candidatesFor(room, a);
  assert.equal(cs.filter((c) => c.action !== "shutdown").length, 0, "no slots, no actions but Shut Down");
});
```

- [ ] **Step 2-4: Implement, run, commit**

`candidatesFor(room, rig)` starts from `availableActions(rig, room.game.turn, room.game.round)`, keeps `enabled` entries, and expands:

| action | expands to |
|---|---|
| `fire` | × enemy with `los`, inside `[minRange, maxRange]`, `arcOf(target, attacker) === "front"` from the ATTACKER's facing; × `longRange` \| `melee` (melee needs `meleeInReach`) |
| `aimed` | × enemy × location |
| `prepare` | × prep type |
| `repair` | × damaged location |
| `disengage`/`douse`/`shutdown`/`reload` | as-is |

**Move/sprint are Task 5 — return nothing for them here.**

**Careful about arc direction:** the target must be in the ATTACKER's front 90° arc to be shootable (§7), while `arcOf(attacker, target)` reports which of the TARGET's facings you strike. Those are different questions and both are needed. Read `arcOf`'s test cases before using it.

```bash
git add shared/bot/candidates.js shared/bot/candidates.test.js
git commit -m "feat(bot): candidate generation for non-move actions" -- shared/bot/candidates.js shared/bot/candidates.test.js
```

---

### Task 5: Move candidates — anchors, lattice, facings

**Files:** modify `shared/bot/candidates.js` + its test.

Destinations are **continuous** — a Speed 6 rig has infinitely many legal spots. Generate a shortlist, each filtered by `findPath(...).length <= moveBudget(rig, act)`.

**Anchors** (each carries a `reason` string — future narration reads it):
- toward each objective — nearest point that would control it (`controlsObjective`)
- into cover from the biggest threat (a spot where `sightCorridor` from it reads 1–2)
- into each enemy's **rear arc**, at a range its weapon wants (its `sweet`)
- into melee reach of each enemy
- out of LOS entirely (retreat)
- stand still (a **0" Move is legal** and often right — it buys the pivot)

**Lattice:** reachable cells every ~1.5".

**Facings:** NOT 360°. Toward each enemy, toward the objective — each clamped to the **±90° pivot cap**. Typically 3–5 per destination.

- [ ] **Tests to write:**

```js
test("every move candidate is reachable within the rig's move budget", () => {
  // for each: findPath(...).length <= moveBudget(rig, "move") + 1e-6
});
test("every move candidate's facing is within 90 degrees of the current facing", () => {
  // the pivot cap is a rule, not a preference
});
test("a 0-inch move candidate exists — pivot in place is legal", () => {});
test("sprint candidates reach further than move candidates", () => {
  // moveBudget(rig, "sprint") is round(base * rigEffects(rig).sprintMult)
});
test("no move candidate lands inside terrain or on another rig", () => {
  // findPath already guarantees it; assert it anyway — this is the invariant
  // that stops the bot proposing illegal moves
});
test("move candidates are generated toward objectives", () => {
  // at least one candidate's reason mentions the objective
});
```

- [ ] Implement, run, commit:
```bash
git commit -m "feat(bot): move candidates from anchors and a reachable lattice" -- shared/bot/candidates.js shared/bot/candidates.test.js
```

---

### Task 6: Scoring

**Files:** create `shared/bot/score.js`, `shared/bot/score.test.js`.

```
score = w.vp        × objectiveVpDelta
      + w.priority  × priorityTargetProgress
      + w.damage    × offence      // v1: expectedHits(me -> them). later: expectedDamage
      - w.threat    × exposure     // the SAME metric, every enemy's best against me
      - w.heat      × overheatRisk
      - w.fragile   × exposureOfWeakLocation
```

**The 1-ply lookahead is the whole ballgame.** A move candidate scores as `positionValue + bestShotFromThere` — the best `fire`/`aimed` EV available *after* arriving, computed by re-deriving geometry at the candidate spot/facing. Without it the bot never learns why a flank is worth walking to.

**`offence` and `exposure` are the same metric pointed in opposite directions** — both call `evaluate.js`. That is what makes the deferred damage swap safe: upgrade one and both sides upgrade together, so the bot can never value its own shots by one yardstick and the enemy's by another.

**`exposure` assumes STATIC enemies** — each living enemy's best EV against the candidate spot **from where it stands now**. It does NOT model the enemy closing first. Documented blind spot; see the spec.

**Why VP leads:** objectives score every Recovery (2 VP centre, 1 VP each flank). Priority Elimination is the ONLY kill-VP (+2). Everything else you destroy is worth zero VP *directly* — the `damage` term captures its instrumental value.

- [ ] **Tests — these are the ones that prove competence:**

```js
test("a rear-arc shot outscores the same shot into the front", () => {});
test("a machine gun will not shoot a front arc at all — Raking Fire's veto", () => {
  // arcFactor returns 0 for arcBonus === null. This one IS structural and exact.
});
test("standing on an uncontested objective outscores standing next to it", () => {});
test("a contested objective scores below an uncontested one", () => {});
test("killing the Priority Target outscores killing an identical non-priority rig", () => {});
test("a move that enables a good shot outscores a move that doesn't", () => {
  // the 1-ply lookahead, directly — the single most important test here
});
test("a move into cover lowers exposure", () => {});
test("an action that would overheat scores below one that doesn't", () => {});
test("PRESETS.aggressive weights damage above vp; PRESETS.cagey the reverse", () => {});
```

**One test from the original draft is deliberately NOT here.** "A machine gun *prefers* a
flank, falling out of the EV with no flanking rule in `score.js`" is **false in v1** — arc
does not affect `P(hit)`, so hits are identical on every arc, and the preference comes from
`arcFactor`'s invented `1 + bonus/4` shaping in `evaluate.js`. The *veto* (never shoot a
front arc with a rake) is structural and exact and IS tested above. Do not write a test that
claims the preference is emergent; it isn't, until the damage term lands.

- [ ] Implement, run, commit:
```bash
git add shared/bot/score.js shared/bot/score.test.js
git commit -m "feat(bot): candidate scoring with a 1-ply shot lookahead" -- shared/bot/score.js shared/bot/score.test.js
```

---

### Task 7: `chooseAction` and the driver

**Files:** create `shared/bot/index.js`, `shared/bot/index.test.js`; modify `shared/game-state.js` (export `spatial`, add `sideBotOf`, `sides[i].bot`).

```js
export function chooseAction(room, rig, weights) {
  const scored = candidatesFor(room, rig)
    .map((c) => ({ c, s: scoreCandidate(room, rig, c, weights) }))
    .sort((x, y) => y.s - x.s || cmpStable(x.c, y.c));   // deterministic tie-break
  const best = scored[0];
  // Passing is a legitimate move: a rig whose only options would overheat it or
  // walk it into a kill zone stands still. A bot that must act is a bot that
  // hurts itself.
  if (!best || best.s <= 0) return null;
  return toCommand(best.c, rig);
}

export function runBotActivation(room, rig, options) {
  const weights = PRESETS[sideBotOf(room, rig.owner)] ?? PRESETS.balanced;
  const log = [];
  for (let guard = 0; guard < 12; guard++) {   // never trust a loop over live state
    const cmd = chooseAction(room, rig, weights);
    if (!cmd) break;
    applyCommand(room, cmd, {}, options);
    log.push(cmd);
  }
  applyCommand(room, { verb: "endactivation", attrs: { name: rig.name } }, {}, options);
  return log;
}
```

**The tie-break must be deterministic** — `sort` on equal scores is not stable across engines for large arrays. Break ties on a stable key (action name, then target name, then x, then y).

- [ ] **Tests:**

```js
test("chooseAction returns null when every candidate scores <= 0", () => {});
test("chooseAction is deterministic — same room, same weights, same command", () => {
  // run it 10x, assert deepEqual
});
test("runBotActivation always ends the activation", () => {});
test("runBotActivation respects the action budget", () => {});
test("the guard stops a runaway loop", () => {
  // stub chooseAction to always return the same rejected command
});
```

```bash
git add shared/bot/index.js shared/bot/index.test.js
git commit -m "feat(bot): chooseAction and the activation driver" -- shared/bot/index.js shared/bot/index.test.js shared/game-state.js
```

---

### Task 8: The invariant — the bot cannot propose an illegal move

**Files:** `shared/bot/index.test.js`

If the bot can never emit a command `checkCommand` rejects, an entire class of bug is gone.

- [ ] **Test:**

```js
test("the bot never proposes a command the engine rejects", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const room = digitalRoomWithMirroredRigs();
    room.field.terrain = scatterTerrain(room.field, seededRandom(seed), { digital: true });
    autoDeploy(room, seededRandom(seed + 1000));
    for (const rig of room.rigs) {
      startActivationFor(room, rig);
      for (let i = 0; i < 4; i++) {
        const cmd = chooseAction(room, rig, PRESETS.balanced);
        if (!cmd) break;
        const res = checkCommand(room, cmd);
        assert.equal(res.ok, true, `seed ${seed}: ${rig.name} proposed ${JSON.stringify(cmd)} -> ${res.reason}`);
        applyCommand(room, cmd, {}, { random: seededRandom(seed + i) });
      }
    }
  }
});
```

Any failure here is a real bug — fix the bot, never the assertion.

```bash
git commit -m "test(bot): the bot never proposes an illegal command" -- shared/bot/index.test.js
```

---

### Task 9: Bot vs bot

**Files:** create `shared/bot/game.test.js`

The instrument the whole design rests on. No UI needed.

- [ ] **Tests:**

```js
test("two bots play a full game to a terminal state", () => {
  const room = digitalRoomWithMirroredRigs();
  room.game.sides[0].bot = "aggressive";
  room.game.sides[1].bot = "cagey";
  // ready both sides, then drive rounds until room.game.outcome or a round cap
  assert.ok(room.game.outcome != null || room.game.round > 12, "terminates");
});

test("a bot-vs-bot game is reproducible from a seed", () => {
  // same seed -> identical command logs
});

test("VP accrues over a game", () => {
  // somebody scores — if nobody ever does, the bot ignores objectives
});
```

- [ ] **Step: run the tuning sweep** (throwaway script, do NOT commit it):

200 games of `aggressive` vs `cagey`, report the win rate and mean VP. **Report the numbers.**

Expected outcomes and what they mean:
- **~50/50** — the presets are indistinguishable; the weights aren't doing anything.
- **100/0** — one preset is broken, not better.
- **60/40-ish** — plausible; the presets are real strategies.

Also report: mean game length in rounds, and how often a game hits the round cap without an outcome (a bot that never closes is a bot that never wins).

```bash
git commit -m "test(bot): bot-vs-bot games terminate and reproduce from a seed" -- shared/bot/game.test.js
```

---

### Task 10: Wire it to the server

**Files:** `server/routes/game.js` or `server/ws.js` — grep for where activations are driven.

When an activation opens for a side with `bot` set, run `runBotActivation`. Digital rooms only.

- [ ] Read the existing activation flow before designing this. If the wiring is awkward, report rather than force it — the bot is fully usable from tests without it, and the UI (spec 1 Tasks 15-19) isn't built yet anyway.

---

## Self-review notes

**Start at Task 2.** T1 is deferred and must not be implemented.

**Spec coverage:** expected hits → T2, validated T3. Candidates → T4 (non-move), T5 (move). Scoring + presets → T6. chooseAction + driver → T7. Invariant fuzz → T8. Bot-vs-bot + tuning → T9. Wiring → T10. Damage term → T1, deferred until the arsenal settles.

**`shared/combat.js` is NOT modified in v1.** It has been at a zero diff through all of spec 1 and stays there. If a task finds itself wanting to edit it, that task has drifted into T1 — stop and report.

**v1's one invented number is `arcFactor`'s `1 + bonus/4`** (`evaluate.js`, T2). Everything else the bot uses is read from the engine. It exists because arc modifies STR, not accuracy, so a hits-only score is identical on every arc and the bot would never flank. The `null` veto beside it is exact; the shaping is a guess. It is the first thing the damage term deletes.

**T3 may fail first.** That is its job — `rollToHit` has Full Auto, Bloodletter, Redline Governor, and a Point-Defense reroll seam that the analytic model omits. The fixtures are chosen to avoid all four; verify that rather than assume it. **Report the predicted-vs-sampled numbers either way** — they are the most valuable output in this plan.

**Do not tune the weight presets yet.** The balance findings name `F2-B (price ROF in heat)` as the live next step, and v1's offence is `ROF × P(hit)` — ROF *multiplies*. A rivet gun (STR 3, ROF 6) currently out-damages a wrecking ball (STR 10, ROF 1), 3.65 to 2.98, so the bot preferring volume is **currently correct**. F2-B makes it wrong. Presets tuned now would encode a snapshot of a mid-rebalance arsenal. Run T9's harness to see the bot *works*; do not tune the numbers on what it reports.

**Deliberately not in this plan:** Gemma narration (its own spec), search beyond 1 ply, reactions (blocked by spec 1's Task 10b — three reaction paths still take client geometry), deployment choices (`autoDeploy` handles them).
