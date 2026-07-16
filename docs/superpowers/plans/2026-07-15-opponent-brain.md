# Opponent Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic scored engine that plays a side competently — flanks, uses cover, holds objectives, manages heat — with no LLM in the decision path.

**Architecture:** One pure entry point `chooseAction(room, rig, weights)` returns ONE command at a time; a small driver applies it via `applyCommand` and re-asks. The bot never mutates state, so it cannot cheat or desync. Scoring uses the engine's own maths.

**v1 scores HITS, not damage.** The damage calculations are being actively tuned, so `evaluate.js` uses only `ROF × P(hit)` — the half of the formula that is stable through every rebalance. The full damage term is **deferred** (see the last section), and its `combat.js` refactor is not implemented in v1.

**Tech Stack:** Plain ES modules. `shared/game-state.js` gains the engine seams (Phase E); the bot lives under `shared/bot/`. Tests: `node --test` (NOT Vitest).

**Spec:** `docs/superpowers/specs/2026-07-15-opponent-brain-design.md`

**Baseline:** run `node --test "shared/*.test.js"` first and record the green count. Every task must keep it green.

---

## Why this plan was restructured (2026-07-16)

The first draft assumed spec 1 (digital battlefield) had finished the gameplay seams and that
combat was mid-Overmatch. Both moved:

- **Combat rework (A).** Overmatch shipped then was **deleted**; the Penetration band was
  compressed to **3–7**; CRIT-every-decisive-die and catastrophic spill landed. **v1 is
  insulated**: it scores `ROF × P(hit)`, and the rework did not touch `P(hit)`. A only
  rewrites the **deferred** damage seam — old Task 1's `effectiveStrAgainst`/Overmatch becomes
  `effectivePenAgainst` (Penetration buys `P(wound)` only). That task is rewritten at the end
  and **still not implemented in v1**.
- **Spec 1 is not finished (B).** Spec 1 shipped the pure geometry (`geometry.js`,
  `pathfind.js`, `autoDeploy`, the `resolveFire` derivation seam) but **not** the gameplay
  seams the bot rides on. Verified against the source on 2026-07-16:
  - The `move`/`sprint` action spends a slot and heat and **never repositions the rig** —
    `rig.pos`/`rig.facing` are only ever written by `autoDeploy`. There is no digital move.
  - **`moveBudget` does not exist** in code — it appears only in these plan docs.
  - Objectives score by **manual player claim** (`verb: "vp"`), not geometry; a bot has no VP
    signal.

  Those three are folded into this plan as **Phase E**, which lands before the bot needs them.

**Result: one merged plan.** Phase E (engine seams) → Phases 1–5 (the bot) → deferred damage.
Start at **E1**.

---

## Background the engineer needs

**Read the spec first.** Then:

- `shared/` is dependency-free ES modules imported by BOTH Node and the browser. NEVER import from `client/`.
- Tests use `node:test` + `node:assert/strict`. Run the suite with the **glob form**: `node --test "shared/*.test.js"` — bare `shared/` fails on Node 24. Bot tests live at `shared/bot/*.test.js`, so also run `node --test "shared/bot/*.test.js"`.
- Style: pure functions, comments explain WHY not WHAT. Match `shared/geometry.js` and `shared/field.js`.
- **Claims are not narration.** Every implementer on the last rework shipped a diff whose numbers were correct and whose *comment* was false. Write no comment you have not just re-verified against the code beside it.

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
- The `action` verb's attrs are **FLAT**: `{ name, action: "fire", weapon, target, arc, dice }` — `dice` is an **object** (`{ toHit, wounds, location }`), not an array. A `move` adds `dest`/`facing` (Phase E1).
- Existing helpers in `shared/game-state.test.js`: `digitalRoom(code)`, `digitalRoomWithMirroredRigs()`, `battleWithPreparedDefender`, `seededRandom(seed)`. **Read and reuse them.**
- Mid-activation state is forced directly:
```js
room.game.phase = "activation";
room.game.turn = { side: "a", activeRigId: rig.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
rig.loaded = { longRange: true, melee: true };
```

### What spec 1 already built (all green) — and what it did NOT

**Built** (`geometry.js`): `sightCorridor(a, b, polys)` → `{ obstructed, buildingRays, cover, los }`; `arcOf(a, b)`; `distanceBetween`; `rimGap`; `meleeInReach(a, b, reach)`; `controlsObjective(rig, marker, reach)`; `terrainPolygons(field)`; `radiusOf(rig)`. **These take `{ pos, facing, radius }`, NOT a rig** — `game-state.js` has a private `spatial(rig)` adapter (line ~2223) that E1 exports.

**Built** (`pathfind.js`): `findPath(field, polys, blockers, radius, from, to)` → `{ path, length } | null`; `buildGrid`.

**Built** (`game-state.js`): `room.mode` ("physical" default), digital rigs carry `pos`/`facing`, `autoDeploy(room, random)`, `deriveAttackGeometry(room, attacker, target)`, `resolveFire` (fully derives shot geometry in digital rooms), `meleeReachOf(rig)`, `rig.speed` (per-chassis Move reach), `rigEffects(rig)` → `{ sprintMult, ... }`.

**Built** (`battle-view.js`): `availableActions(rig, turn, round)` → the legal action menu with `enabled`/`heat`/`cost`. **This is the legality gate, not a candidate list** — it says Fire is legal, not at whom.

**Built** (`combat.js`): `computeModifiedAim`, `rollToHit`, `arcBonus`, `penBreakdown`. **`shieldCoverage`** lives in `rules.js`. All still exported and unchanged by the rework.

**NOT built — this is Phase E:**
- Digital **move application** (E1). The `move`/`sprint` branch in the action handler (~line 2872) never writes `rig.pos`/`rig.facing`.
- **`moveBudget(rig, act)`** (E1). Does not exist.
- Digital **objective scoring** (E2). `runRecovery` (line ~2034) resets claims; VP is awarded only by the manual `vp` verb (~line 3596).

### THE FIXTURE TRAP — has already burned real work twice

`normalizeWeaponUpgrade` returns `upgrades[0].id` (the **Field** upgrade) for a null/unknown id, so **`makeRig` cannot build an un-upgraded weapon**. Every legal rig carries its field upgrade. A bare-weapon fixture tests a loadout that cannot be commissioned.

**Build fixtures through `applyCommand({verb:"add"})` or `makeRig` — never hand-assemble a weapon profile.**

### COMMITTING — this repo has bitten us three times

Dirty worktree; **another session commits to this branch concurrently using broad `git add`**. It has already swallowed a subagent's staged files into its own commit.
- **NEVER `git add -A` / `git add .`.** `git commit` commits the WHOLE INDEX, not just what you added.
- Explicit pathspec, **`-m` BEFORE `--`** (everything after `--` parses as a filename):
  `git commit -m "msg" -- shared/bot/score.js shared/bot/score.test.js`
- For a NEW file, `git commit -- <path>` fails ("did not match any file"). `git add <path>` first, then commit with the same pathspec.
- Run `git diff --cached --stat` immediately before committing; confirm ONLY your files.
- **Before touching a shared file: `git diff --stat -- <file>`.** If someone else has uncommitted work there, STOP and report.
- NEVER rewrite history. NEVER stash. NEVER switch branches.
- **`shared/combat.js` is not touched anywhere in v1.** It has held a zero diff through spec 1 and stays there. Any task that finds itself wanting to edit it has drifted into the deferred damage term — stop and report.

---

## File Structure

**Modify:**
- `shared/game-state.js` — E1 (digital move application, export `moveBudget` + `spatial`), E2 (digital objective scoring in/after `runRecovery`), and Phase 4 (`sideBotOf`, `room.game.sides[i].bot`).

**Create:**
- `shared/bot/evaluate.js` — `expectedHits` (v1's offence metric). Depends on combat.js + game-state.js.
- `shared/bot/candidates.js` — expand the action menu into parameterised candidates (non-move + move).
- `shared/bot/score.js` — score one candidate; `PRESETS`.
- `shared/bot/index.js` — `chooseAction`, `runBotActivation`.
- Matching `*.test.js` for each.

Split this way because `score.js` is where tuning churn lives and `evaluate.js` is where maths lives — they change for different reasons.

---

# Phase E — engine seams the bot rides on

Pure `game-state.js` work. Every existing combat/game-state test must stay green.

---

### Task E1: Digital rooms apply a move — `moveBudget`, `spatial`, path-validated reposition

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

Today the `move`/`sprint` branch (~line 2872) spends a slot and heat, then returns without
touching position. In a **digital** room the command must carry a destination and facing, be
validated against a real path within the rig's reach, and reposition the rig. **Physical rooms
are untouched** — no `dest`, no path check.

**The reach helper (new, exported):**
```js
// Move reach in inches. A Move covers the chassis Speed; a Sprint covers
// Speed × sprintMult (Reinforced Servos' 2× lives in rigEffects). This is the
// number a candidate destination's path length is checked against.
export function moveBudget(rig, act) {
  const base = Number.isFinite(rig.speed) ? rig.speed : 0;
  return act === "sprint" ? base * (rigEffects(rig).sprintMult ?? 1.5) : base;
}
```

**Export `spatial`** (currently private at ~line 2223) — the bot feeds it to the geometry
module.

**In the `move`/`sprint` branch, digital only**, after the existing engagement/pin/emplace
guards and before spending the slot:
```js
if (room.mode === "digital") {
  if (!a.dest || typeof a.dest.x !== "number" || typeof a.dest.y !== "number") {
    return reject("A digital move needs a destination.");
  }
  // The pivot cap: a Move may turn at most ±90° from the current facing.
  const facing = typeof a.facing === "number" ? a.facing : rig.facing;
  const turn = Math.abs(((facing - rig.facing + 540) % 360) - 180);
  if (turn > 90 + 1e-6) return reject("A move can pivot at most 90°.");
  // The engine re-routes; the client path is never trusted (mirrors resolveFire).
  const polys = terrainPolygons(room.field);
  const blockers = room.rigs
    .filter((r) => r !== rig && !r.destroyed && r.pos)
    .map(spatial);
  const route = findPath(room.field, polys, blockers, radiusOf(rig), rig.pos, a.dest);
  if (!route) return reject("No path to that destination.");
  if (route.length > moveBudget(rig, act) + 1e-6) return reject("That destination is out of reach.");
  // Success is applied AFTER the slot/heat spend below, so a later guard can't
  // leave the rig moved but unbilled. Stash and write at the end of the branch.
  rig._pendingMove = { pos: { ...a.dest }, facing };
}
```
…then at the end of the branch, just before `return true`:
```js
if (rig._pendingMove) { rig.pos = rig._pendingMove.pos; rig.facing = rig._pendingMove.facing; delete rig._pendingMove; }
```

Read the existing branch first and place these so the heat/slot accounting is unchanged for
physical rooms and for the "can't move while engaged/pinned/emplaced" rejections.

- [ ] **Step 1: Failing tests** (append to `shared/game-state.test.js`, reuse `digitalRoom`/helpers):
```js
test("a digital move repositions the rig along a valid path", () => {
  // build a digital room, put rig mid-activation, move to a reachable dest ->
  // rig.pos equals dest, a slot spent, heat bumped.
});
test("a digital move beyond the rig's Speed is rejected", () => {
  // dest whose findPath length > moveBudget(rig, "move") -> checkCommand ok:false
});
test("a sprint reaches farther than a move", () => {
  // a dest reachable under sprint budget but not move budget: move rejected, sprint ok
});
test("a digital move pivoting more than 90° is rejected", () => {});
test("a digital move into terrain / off the table is rejected (no path)", () => {});
test("a physical-room move still needs no dest and does not touch pos", () => {
  // regression: the old behaviour is intact when room.mode !== "digital"
});
test("moveBudget is Speed for a move and Speed×sprintMult for a sprint", () => {});
```

- [ ] **Step 2: Run to verify failure.** `node --test shared/game-state.test.js`

- [ ] **Step 3: Implement** (the helper, the export, the branch edits).

- [ ] **Step 4: Full suite green.** `node --test "shared/*.test.js"` — baseline + your new tests, nothing red.

- [ ] **Step 5: Commit**
```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(game-state): digital rooms apply a path-validated move" -- shared/game-state.js shared/game-state.test.js
```

---

### Task E2: Digital objectives score by geometry, not by claim

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

Recovery VP is claim-based (the `vp` verb, ~line 3596): each side submits marker indices, a
marker both claim is a **conflict** that scores nobody. A digital room can measure control
directly and must, so the bot has a VP signal.

**In `runRecovery` (line ~2034), digital only**, after the per-rig cooldown loop and after
`room.game.phase = "recovery"` is set: derive each side's controlled markers from
`controlsObjective`, award, and advance — bypassing the manual claim path.
```js
if (room.mode === "digital") {
  const objs = room.game.objectives || [];
  // Which sides control each marker, from geometry. A marker controlled by
  // exactly one side scores it; a marker both sides control is CONTESTED and
  // scores nobody — the faithful digital image of the physical §11 conflict.
  for (let i = 0; i < objs.length; i++) {
    const holders = room.game.sides.filter((s) =>
      room.rigs.some((r) => (r.owner || "a") === s.id && !r.destroyed
        && r.pos && controlsObjective(spatial(r), objs[i])));
    if (holders.length === 1) holders[0].vp += (objs[i].vp || 0);
  }
  advanceRound(room);
  return;
}
```
Confirm `advanceRound` is the right follow-on by reading how the `vp` verb resolves a
clean (non-conflict) claim today (~line 3626 calls `advanceRound(room)`). Mirror that exactly;
do not invent a second round-advance path.

**`controlsObjective` takes a `{ pos, radius }`, not a rig** — feed it `spatial(r)`, the E1
export.

- [ ] **Step 1: Failing tests:**
```js
test("a digital side scores a marker it alone controls", () => {
  // one rig within controlsObjective range of a centre marker, enemy far away ->
  // that side's vp rises by the marker's vp on recovery
});
test("a marker both sides control is contested and scores nobody", () => {
  // one rig from each side in range of the same marker -> neither side's vp changes
});
test("a destroyed rig controls nothing", () => {});
test("digital recovery advances the round without a manual vp claim", () => {});
test("physical recovery still waits for the manual vp claim", () => {
  // regression: room.mode !== "digital" leaves the claim flow intact
});
```
**No value-pinning:** assert *deltas and ordering* (this side scored, that one didn't), never a
specific VP total — objective values are tuned.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Full suite green.**

- [ ] **Step 5: Commit**
```bash
git commit -m "feat(game-state): digital objectives score from geometry at recovery" -- shared/game-state.js shared/game-state.test.js
```

---

### Task E3: Verify the headless digital game loop closes

**Files:** `shared/bot/game.test.js` is written in Phase 4; this task is a **read + spot-check**,
no new mechanic unless a gap is found.

Bot-vs-bot drives a whole game by command with no UI. Confirm the loop closes headlessly:
ready both sides → `autoDeploy` → round → activations (`action` + `endactivation`) →
`runRecovery` → `advanceRound`, up to `MAX_ROUNDS`, ending in `room.game.outcome`.

- [ ] Read the round/initiative/activation plumbing (`handoff`, `runRecovery`, `advanceRound`,
  the readiness gate). Write a throwaway script that drives two sides with scripted trivial
  actions (end activation immediately) for a few rounds.
- [ ] If it closes to an outcome or the round cap: **DONE, no code.** Record what you drove.
- [ ] If a seam is missing (e.g. digital readiness, or recovery never fires without a claim),
  report it as a small blocking task with the exact line — do **not** force a fix into E2.

---

# Phase 1 — the offence metric

---

### Task 1.1: Expected hits (v1's offence metric)

**Files:**
- Create: `shared/bot/evaluate.js`, `shared/bot/evaluate.test.js`

The full formula is `expectedDamage = ROF × P(hit) × P(wound) × D`. **v1 uses only the left
half**, because everything right of `P(hit)` is mid-tuning and everything left of it is stable:

```
expectedHits = ROF × P(hit) × arcFactor(profile, arc)
```

`P(hit)` is accuracy/cover/range-band maths — `computeModifiedAim` is exported and untouched by
the rework. **No `combat.js` change is needed.**

**`arcFactor` is v1's one invented number, and you must understand why it exists.** Arc modifies
**Penetration**, not accuracy — so `ROF × P(hit)` is *identical* front, side, and rear. Without
an explicit factor the bot has **no reason to flank at all**, which deletes the most important
behaviour in the spec. `arcBonus(profile, arc)` is exported; read it as a preference:

```js
// arcBonus is the WOUND step's arc modifier. v1 has no wound term, so it reads it
// as a PREFERENCE: null is a hard veto, a bigger bonus is a better angle. This is
// a heuristic bridge, not the real maths — it preserves the ORDERING (rear > side
// > front; rake-into-front = never) while the magnitudes are still being tuned.
// The deferred damage term deletes this wholesale.
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
**mutates the target** (Point-Defense spend), and evaluating a candidate must never mutate. Use
`profile.rof`. Document the bias in the module comment; it under-rates three conditional
upgrades and is one-directional.

**Shield veto.** A raised shield covering the arc is the other earned zero. Read
`shieldCoverage(target)` from `rules.js` **exactly as `rollWounds` uses it** — it returns
`{ negate: [...arcs], blunt: [...arcs] }` and only fires when
`target.preparation?.type === "raise-shield"`. Mirror that check; do not invent one.

- [ ] **Step 1: Failing tests:**
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { expectedHits } from "./evaluate.js";
import { makeRig } from "../game-state.js";

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
  const a = atk();
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
test("a natural 6 always hits — expectedHits never falls to zero on a legal shot", () => {
  const a = atk();
  const h = expectedHits(a, def(), "longRange", { arc: "front", distance: 26, cover: 2, round: 1 });
  assert.ok(h > 0);
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement `shared/bot/evaluate.js`.** `pHit(aim) = max(1/6, min(1, (7-aim)/6))`
  (a natural 6 always hits → 1/6 floor). Module comment records the three documented biases
  (effective-ROF blindness, whole wound step, arc shaping). Import `computeModifiedAim`,
  `arcBonus` from `../combat.js`, `effectiveWeaponProfile` from `../game-state.js`, and
  `shieldCoverage` from `../rules.js`.

- [ ] **Step 4: Run.** All tests pass, full suite green.

- [ ] **Step 5: Commit**
```bash
git add shared/bot/evaluate.js shared/bot/evaluate.test.js
git commit -m "feat(bot): analytic expected hits (v1 offence metric)" -- shared/bot/evaluate.js shared/bot/evaluate.test.js
```

---

### Task 1.2: Validate expected hits against the real engine

**The acceptance test for 1.1.** Without it the scorer is asserted, not verified.

**Files:** `shared/bot/evaluate.test.js`

`rollToHit(attacker, profile, opts, providedDice, random)` is **exported** and returns
`{ modAim, rof, hits, ... }`. Validate hits by sampling it in a loop and averaging `hits`.

**Caveat you must handle:** `rollToHit` runs `applyDefensiveReactions`, which can MUTATE the
target. `structuredClone` the target every trial, exactly as `scripts/balance/weapon-sweep.mjs`
does.

- [ ] **Step 1: Write the test** — sample ~5000 attacks with a seeded RNG across four fixtures
  (`Autocannon side@12`, `Autocannon rear@24`, `Arc Gun side@20`, `Mini Gun rear@7`), and assert
  the analytic prediction matches the sampled mean within `max(0.08, observed*0.05)`.

  **Divide `arcFactor` out before comparing.** `expectedHits` carries `arcFactor`, which the
  engine does NOT apply to hits (it lives in the wound step). Compare
  `expectedHits(...) / (1 + arcBonus(profile, arc)/4)` against the sampled mean — or, cleaner,
  export a raw `rof * pHit` as `rawExpectedHits` and validate THAT. If you take the cleaner
  route, say so.

- [ ] **Step 2: Run it. It may FAIL first — that is the point.** `rollToHit` has Full Auto,
  Bloodletter, Redline Governor, and a Point-Defense seam the analytic model omits. The
  fixtures avoid all four (no Full Auto, undamaged target, cold attacker, no Point-Defense) —
  **verify that is actually true** rather than assuming.

  On failure, in order of preference: (1) fold the missing deterministic term into
  `expectedHits`; (2) document it as a known bias and narrow the fixture — do NOT widen the
  tolerance to hide a real error; (3) report DONE_WITH_CONCERNS with the numbers.

- [ ] **Report the actual predicted-vs-sampled numbers for all four cases regardless of
  outcome.** They are the most valuable output of this task.

- [ ] **Step 3: Commit**
```bash
git commit -m "test(bot): validate expected hits against the real engine" -- shared/bot/evaluate.js shared/bot/evaluate.test.js
```

---

# Phase 2 — candidate generation

---

### Task 2.1: Candidates — non-move actions

**Files:** create `shared/bot/candidates.js`, `shared/bot/candidates.test.js`

`candidatesFor(room, rig)` starts from `availableActions(rig, room.game.turn, room.game.round)`,
keeps `enabled` entries, and expands:

| action | expands to |
|---|---|
| `fire` | × enemy with `los`, inside `[minRange, maxRange]`, in the ATTACKER's front 90° arc; × `longRange` \| `melee` (melee needs `meleeInReach`) |
| `aimed` | × enemy × location |
| `prepare` | × prep type |
| `repair` | × damaged location |
| `disengage`/`douse`/`shutdown`/`reload` | as-is |

**Move/sprint are Task 2.2 — return nothing for them here.**

**Careful about arc direction:** the target must be in the ATTACKER's front 90° arc to be
shootable (§7), while `arcOf(attacker, target)` reports which of the TARGET's facings you
strike. Different questions, both needed. Read `arcOf`'s tests before using it.

- [ ] **Step 1: Failing tests:**
```js
test("fire candidates are generated per enemy with LOS, in range, in the front arc", () => {});
test("no fire candidate for an enemy behind a building", () => {});
test("no fire candidate for an enemy outside the front 90 arc", () => {});
test("melee candidates need rim gap within reach", () => {});
test("aimed candidates cover every location", () => {
  // deepEqual sorted unique locations === ["arms","engine","hull","legs"]
});
test("candidates only include actions availableActions says are enabled", () => {
  // actionsUsed === actionsMax -> nothing but Shut Down
});
```

- [ ] **Step 2-4: Implement, run, commit**
```bash
git add shared/bot/candidates.js shared/bot/candidates.test.js
git commit -m "feat(bot): candidate generation for non-move actions" -- shared/bot/candidates.js shared/bot/candidates.test.js
```

---

### Task 2.2: Move candidates — anchors, lattice, facings

**Files:** modify `shared/bot/candidates.js` + its test.

Destinations are **continuous**. Generate a shortlist, each filtered by
`findPath(...).length ≤ moveBudget(rig, act)` (both now real, from E1). Each candidate emits
`{ action: "move"|"sprint", dest: {x,y}, facing, reason }`.

**Anchors** (each carries a `reason` string — future narration reads it):
- toward each objective — nearest point that would control it (`controlsObjective`)
- into cover from the biggest threat (a spot where `sightCorridor` from it reads 1–2)
- into each enemy's **rear arc**, at a range its weapon wants (its `sweet`)
- into melee reach of each enemy
- out of LOS entirely (retreat)
- stand still (a **0" Move is legal** and often right — it buys the pivot)

**Lattice:** reachable cells every ~1.5".

**Facings:** NOT 360°. Toward each enemy, toward the objective — each clamped to the **±90°
pivot cap** (the same cap E1 enforces). Typically 3–5 per destination.

- [ ] **Tests:**
```js
test("every move candidate is reachable within the rig's move budget", () => {});
test("every move candidate's facing is within 90° of the current facing", () => {});
test("a 0-inch move candidate exists — pivot in place is legal", () => {});
test("sprint candidates reach further than move candidates", () => {});
test("no move candidate lands inside terrain or on another rig", () => {});
test("move candidates are generated toward objectives", () => {
  // at least one candidate's reason mentions the objective
});
test("every emitted move candidate is accepted by the engine", () => {
  // checkCommand(room, toCommand(c)) is ok for each move candidate — E1's own
  // validator is the oracle; if the bot proposes it, the engine must accept it
});
```
That last test is the seam between E1 and the bot: the candidate generator and E1's validator
must agree on reach and pivot, or the invariant fuzz (Task 4.2) fails downstream.

- [ ] Implement, run, commit:
```bash
git commit -m "feat(bot): move candidates from anchors and a reachable lattice" -- shared/bot/candidates.js shared/bot/candidates.test.js
```

---

# Phase 3 — scoring

---

### Task 3.1: Scoring and presets

**Files:** create `shared/bot/score.js`, `shared/bot/score.test.js`.

```
score = w.vp        × objectiveVpDelta   // E2's geometry control: take / hold / contest
      + w.priority  × priorityTargetProgress
      + w.damage    × offence            // v1: expectedHits(me -> them). later: expectedDamage
      - w.threat    × exposure           // the SAME metric, every enemy's best against me
      - w.heat      × overheatRisk
      - w.fragile   × exposureOfWeakLocation
```

**The 1-ply lookahead is the whole ballgame.** A move candidate scores as
`positionValue + bestShotFromThere` — the best `fire`/`aimed` EV available *after* arriving,
computed by re-deriving geometry at the candidate spot/facing. Without it the bot never learns
why a flank is worth walking to.

**`offence` and `exposure` are the same metric pointed in opposite directions** — both call
`evaluate.js`. That is what makes the deferred damage swap safe.

**`exposure` assumes STATIC enemies** — each living enemy's best EV against the candidate spot
**from where it stands now**. Documented blind spot; see the spec.

**Why VP leads:** objectives score every Recovery (2 VP centre, 1 VP each flank, via E2).
Priority Elimination is the ONLY kill-VP (+2). Everything else you destroy is worth zero VP
*directly* — the `damage` term captures its instrumental value.

- [ ] **Tests — these prove competence:**
```js
test("a rear-arc shot outscores the same shot into the front", () => {});
test("a machine gun will not shoot a front arc at all — Raking Fire's veto", () => {
  // arcFactor returns 0 for arcBonus === null. Structural and exact.
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

**Not here, deliberately:** a test claiming the flank *preference* is emergent. In v1 it is
NOT — arc doesn't affect `P(hit)`, so the preference comes entirely from `arcFactor`'s invented
shaping. The *veto* (never shoot a front arc with a rake) IS structural and exact and IS tested.
Do not assert emergent preference until the damage term lands.

- [ ] Implement, run, commit:
```bash
git add shared/bot/score.js shared/bot/score.test.js
git commit -m "feat(bot): candidate scoring with a 1-ply shot lookahead" -- shared/bot/score.js shared/bot/score.test.js
```

---

# Phase 4 — the driver, the invariant, and bot-vs-bot

---

### Task 4.1: `chooseAction` and the driver

**Files:** create `shared/bot/index.js`, `shared/bot/index.test.js`; modify `shared/game-state.js`
(add `sideBotOf`, `room.game.sides[i].bot`).

```js
export function chooseAction(room, rig, weights) {
  const scored = candidatesFor(room, rig)
    .map((c) => ({ c, s: scoreCandidate(room, rig, c, weights) }))
    .sort((x, y) => y.s - x.s || cmpStable(x.c, y.c));   // deterministic tie-break
  const best = scored[0];
  // Passing is a legitimate move: a rig whose only options would overheat it or
  // walk it into a kill zone stands still.
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

**The tie-break must be deterministic** — break ties on a stable key (action name, then target
name, then x, then y).

- [ ] **Tests:**
```js
test("chooseAction returns null when every candidate scores <= 0", () => {});
test("chooseAction is deterministic — same room, same weights, same command", () => {});
test("runBotActivation always ends the activation", () => {});
test("runBotActivation respects the action budget", () => {});
test("the guard stops a runaway loop", () => {});
```

```bash
git add shared/bot/index.js shared/bot/index.test.js
git commit -m "feat(bot): chooseAction and the activation driver" -- shared/bot/index.js shared/bot/index.test.js shared/game-state.js
```

---

### Task 4.2: The invariant — the bot cannot propose an illegal command

**Files:** `shared/bot/index.test.js`

If the bot can never emit a command `checkCommand` rejects, an entire class of bug is gone —
**including the E1 move validation**: every move the bot proposes must pass E1's own path/pivot
check.

- [ ] **Test:** fuzz over 200 seeded boards (`digitalRoomWithMirroredRigs` + scattered terrain +
  `autoDeploy`), drive each rig up to 4 actions, and assert `checkCommand(room, cmd).ok === true`
  for every command `chooseAction` emits before applying it. Any failure is a real bug — fix the
  bot, never the assertion.

```bash
git commit -m "test(bot): the bot never proposes an illegal command" -- shared/bot/index.test.js
```

---

### Task 4.3: Bot vs bot

**Files:** create `shared/bot/game.test.js` (this is also where E3's spot-check lives).

The instrument the whole design rests on. No UI.

- [ ] **Tests:**
```js
test("two bots play a full game to a terminal state", () => {
  // sides[0].bot = "aggressive", sides[1].bot = "cagey"; ready, deploy, drive
  // rounds until room.game.outcome or a round cap
});
test("a bot-vs-bot game is reproducible from a seed", () => {
  // same seed -> identical command logs
});
test("VP accrues over a game", () => {
  // somebody scores — if nobody ever does, the bot ignores objectives (or E2 is wrong)
});
```

- [ ] **Tuning sweep** (throwaway script, do NOT commit): 200 games `aggressive` vs `cagey`.
  **Report** win rate, mean VP, mean game length in rounds, and how often a game hits the round
  cap with no outcome. ~50/50 = weights do nothing; 100/0 = a preset is broken; 60/40-ish =
  real strategies.

```bash
git commit -m "test(bot): bot-vs-bot games terminate and reproduce from a seed" -- shared/bot/game.test.js
```

---

# Phase 5 — wiring

---

### Task 5.1: Wire the bot to the server

**Files:** `server/routes/game.js` or `server/ws.js` — grep for where activations are driven.

When an activation opens for a side with `bot` set, run `runBotActivation`. Digital rooms only.

- [ ] Read the existing activation flow first. If the wiring is awkward, report rather than
  force it — the bot is fully usable from tests without it, and the V2 UI isn't built yet.

---

## Deferred: the damage term (do NOT implement in v1)

> **Do this when** the arsenal settles and the bot must tell a Wrecking Ball (Penetration 6,
> Damage 8, ROF 1) from a Rivet Gun (Penetration 3, Damage 1, ROF 6). Until then, preferring
> the Rivet Gun is *correct* (3.64 vs 3.24 SP at the field floor, `report-2026-07-16-penetration.txt`),
> so v1's blindness costs nothing real. **`F2-B (price ROF in heat)` is shelved, not pending —
> do not wait for it** (`2026-07-15-rof-heat-design.md`: the tax made weapon spread worse,
> 3.0× → 3.9×). Nothing scheduled will settle the arsenal on its account; this stays deferred
> until a human calls it.

**Completing the formula** (`expectedDamage = ROF × P(hit) × P(wound) × D`):
- `woundTarget(pen, toughness)` gives the wound TN on a D10 → `P(wound) = (11 − TN)/10`.
- `D` is the weapon's `dmg` **plus its per-wound riders: Rend** (+1, §13) **and Evisceration**
  (+1 vs an already-damaged location, §13). `rollWounds` computes `sp = dmg + rend + evisc`.
- **There is NO Penetration term in Damage. Do not add one.** The old draft read *"plus
  `strOvermatchD(effStr, toughness)`"*. **That function was deleted** by the penetration rework
  (SHIPPED 2026-07-16) precisely because feeding Penetration into Damage rewards high-ROF
  weapons. Penetration now buys `P(wound)` only; the clamp wastes the excess by design, and the
  band was compressed to 3–7 so the waste is rare.

**The blocker.** `effPen` is not obtainable today. `penBreakdown` is exported but covers only
the *attacker's* Penetration. The **defender's** ten modifiers are computed inline inside
`rollWounds`, interleaved with the dice: `arcBonus` · Kneecapper's limb exception · **Brace**
(−2 front) · **Harden** (−1/−2) · **Reactive Armor** (−2 on a re-hardened location) · **Reactive
Plating** (−1/−2 side/rear) · **Raise Shield** (negate, or −3) · **Breach Grip** crack (+2) ·
`toughnessOf` · Piledriver's guard-break.

**The refactor.** Extract a pure
`effectivePenAgainst(attacker, target, profile, location, opts)` out of `rollWounds`, returning
everything `rollWounds` consumes below the seam (`effPen`, `toughness`, `d`, the `negated`/
`noRoll` earned-zero distinction, and the `woundTerms` ledger in its exact push order). Both
`rollWounds` and the bot then call it — one source of truth, no drift.

- **This is a PURE REFACTOR: `combat.test.js` (2178 lines) must pass with ZERO edits.** If you
  need to touch it, you changed behaviour — stop and report BLOCKED.
- **`bonus == null` is an EARNED ZERO** (Raking Fire into a front arc), not a missing value.
  `rollWounds` short-circuits `if (bonus == null || shieldNegates)` before the roll and emits
  `noRoll`. The extracted function must preserve that distinction — "zero because armour" is a
  bug the comments say a past rewrite caused; "zero because earned" is a mechanic.

**Why not sample instead.** `resolveAttack` can be driven with a stub room + a `ctx` that taps
SP (`weapon-sweep.mjs` does this at ~45k attacks/sec), but it is **noisy**: at 20 trials the
±0.22 SP error exceeds the gap between candidates, so the argmax flips on noise and breaks the
`seed + preset ⇒ identical log` guarantee. Sampling becomes the **acceptance test** instead:
assert the analytic `expectedDamage` matches a ~5000-sample empirical mean within the sweep's
noise band.

**The seam holds either way.** `score.js` consumes ONE number behind `w.damage`; swap
`expectedHits` for `expectedDamage` and nothing else in the scorer changes.

---

## Self-review notes

**Start at E1.** Phase E (E1 move application, E2 objective scoring, E3 loop check) lands the
engine seams the bot rides on before the bot needs them. Then the bot: offence (1.1, validated
1.2) → candidates (2.1 non-move, 2.2 move) → scoring (3.1) → driver + invariant + bot-vs-bot
(4.1–4.3) → wiring (5.1).

**`shared/combat.js` is NOT modified anywhere in v1.** The only task that touches it is the
deferred damage term, and it is deferred. Any v1 task wanting to edit it has drifted.

**v1's one invented number is `arcFactor`'s `1 + bonus/4`** (`evaluate.js`, 1.1). Everything
else the bot uses is read from the engine. The `null` veto beside it is exact; the shaping is a
guess; the damage term deletes it.

**1.2 may fail first.** That is its job. Report the predicted-vs-sampled numbers either way.

**Do not tune the weight presets.** ROF *multiplies* v1's offence, and a rivet gun currently
out-damages a wrecking ball — the bot preferring volume is *correct* until the ROF economy is
solved some other way (F2-B, which would have fixed it, is shelved). Presets tuned now encode a
snapshot of a mid-rebalance arsenal. Run 4.3's harness to see the bot *works*; do not tune on
what it reports.

**Deliberately not in this plan:** Gemma narration (its own spec), search beyond 1 ply,
reactions (blocked by spec 1's Task 10b — three reaction paths still take client geometry),
deployment choices (`autoDeploy` handles them), the damage term (deferred above).
