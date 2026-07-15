# Duel Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 10-round duel harness that carries state across rounds, so the 44 upgrades (52% of the catalog) invisible to the single-shot sweep can finally be measured.

**Architecture:** Drive the real command path. `createRoom` → `seed` a 3v3 roster → loop `applyCommand` for 10 rounds. The sim owns only *which command to issue* (the policy) and *what to record*. Heat, cadence, DoT, chipping, cooling and the overheat table all come from `game-state.js` for free, because it is the real game loop rather than a model of it.

**Tech Stack:** Plain ES modules, `.mjs` scripts under `scripts/balance/`. Tests are `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-15-duel-harness-design.md`

---

## Background you need

The existing sweep (`scripts/balance/weapon-sweep.mjs`) takes a fresh `structuredClone` per trial so cadence state can't leak between samples. That is what makes it clean **and** what makes it blind: nothing accumulates, so nothing needing two rounds exists. Of the 85 upgrades it measures, **44 are worth +0.00 in both conditions** — Penetrator Rounds never reaches its 3rd volley, burn never ticks, Sunder's max-SP chipping never compounds.

This harness fixes exactly that one thing. It does **not** add positioning (arc and distance stay declared inputs) and it does **not** make decisions (no bot — that's step 2).

### The lifecycle, verified against the real engine

Every step below was probed and confirmed. Do not trust it anyway — re-run the probe if something behaves differently.

1. `createRoom(code)` → phase `setup`
2. `seed` with an explicit roster → force-starts, phase `activation`. **Requires ≥3 rigs per side** (`sideRigCount(room,"a") >= 3 && ... "b" >= 3`), which is why this is a 3v3 seed and not a 1v1.
3. Each round the **second player gets exactly 1 Answer token** and `pendingAnswer` blocks `activate` until it is spent. **There is no decline path.** Spending it sets a `preparation` on a rig — and Brace is −2 STR on the front arc, so answering with a duellist would silently corrupt every number. **Spend it on a bystander.**
4. `activate` → `turn.actionsMax` becomes 3
5. `action` / `endactivation`, alternating sides via `handoff`
6. All rigs activated → phase `recovery`, `turn: null`
7. **Both** sides submit `vp` claims → `advanceRound` → phase `initiative`
8. `initiative` → back to `activation`, next round

### Two traps that will bite you

1. **`makeRig` without a `sp` override uses `RIG_DEFAULTS` — a medium hull is 7, not 14.** The existing sweep builds rigs this way, which is fine for a one-shot metric and *fatal* for a duel measuring rounds-to-wreck. The `seed` verb passes `sp: pb.sp` from the chassis, giving the real pools (medium hull 14). **Use `seed`.** Verified: `A1 hull max: 14`.
2. **Field is the floor.** `normalizeWeaponUpgrade` returns `upgrades[0].id` for a null id, so every rig always carries its field upgrade. There is no un-upgraded rig. The `none` tier is synthetic.

## File Structure

| file | responsibility |
|---|---|
| `scripts/balance/policy.mjs` | `greedySafe` — decide one command. **Its own file because it is this harness's largest bias.** |
| `scripts/balance/duel-sim.mjs` | seed a room, drive 10 rounds, sweep the cells, emit JSON |
| `scripts/balance/duel-report.mjs` | format SP@10 + wreck-rate |
| `scripts/balance/policy.test.mjs` | node tests for the policy |
| `package.json` | extend the test glob to cover `scripts/**/*.test.mjs` |

---

### Task 1: Make `scripts/` tests runnable

**Files:**
- Modify: `package.json` (the `test` script)

The suite currently globs `shared/**` and `server/**` only, so a test under `scripts/` would silently never run — and a test that never runs is worse than no test.

- [ ] **Step 1: Read the current script**

Run: `grep '"test"' package.json`
Expected: `"test": "vitest run && node --test \"shared/**/*.test.js\" \"server/**/*.test.js\""`

- [ ] **Step 2: Extend the glob**

Change the `test` script to:

```json
"test": "vitest run && node --test \"shared/**/*.test.js\" \"server/**/*.test.js\" \"scripts/**/*.test.mjs\""
```

- [ ] **Step 3: Verify it still passes and picks up nothing yet**

Run: `npm test`
Expected: PASS. 739 node tests + 293 vitest, unchanged — there are no `scripts/**/*.test.mjs` files yet.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(test): run scripts/**/*.test.mjs

The duel harness's policy is pure and testable, but scripts/ was outside
the glob — a test there would never have run."
```

---

### Task 2: The greedy-safe policy

**Files:**
- Create: `scripts/balance/policy.mjs`
- Test: `scripts/balance/policy.test.mjs`

The policy decides one command at a time. It **asks the engine what things cost** via `availableActions` rather than recomputing them — no second copy of the cost rules, and it dogfoods the same view-model the UI renders.

- [ ] **Step 1: Write the failing tests**

Create `scripts/balance/policy.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { greedySafe } from "./policy.mjs";
import { createRoom, applyCommand, HEAT_CAPACITY } from "../../shared/game-state.js";

// Build a real seeded room at the activation phase with `name` active.
// 3v3 because the seed verb force-starts only at >=3 rigs per side.
function seatedRoom(active = "A1") {
  const room = createRoom("TEST");
  const rnd = () => 0.5;
  const roster = ["A1", "A2", "A3"].map((n) => ({ name: n, owner: "a", chassis: "medium-lance-mortar" }))
    .concat(["B1", "B2", "B3"].map((n) => ({ name: n, owner: "b", chassis: "medium-lance-mortar" })));
  applyCommand(room, { verb: "seed", attrs: { roster, first: "a" } }, {}, { random: rnd });
  // The second player MUST spend an Answer token before anyone can activate.
  // Spend it on a bystander so no duellist carries a preparation.
  const pa = room.game.pendingAnswer;
  if (pa) applyCommand(room, { verb: "answer", attrs: { name: "B3", side: pa.side, prep: "brace" } }, { side: pa.side }, { random: rnd });
  applyCommand(room, { verb: "activate", attrs: { name: active } }, { side: "a" }, { random: rnd });
  return room;
}

test("greedySafe fires when heat allows", () => {
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.verb, "action");
  assert.equal(cmd.attrs.action, "fire");
  assert.equal(cmd.attrs.target, "B1");
});

test("greedySafe shuts down rather than exceed capacity", () => {
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  // Medium capacity is 5. At 5, one more heat is over — so it must vent, not fire.
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass];
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.attrs.action, "shutdown");
});

test("greedySafe never issues an action availableActions reports disabled", () => {
  // The whole point of reading availableActions is that the engine owns legality.
  // Burn the action budget: the fire tile goes disabled, so the policy must not fire.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  room.game.turn.actionsUsed = room.game.turn.actionsMax;
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.notEqual(cmd?.attrs?.action, "fire");
});

test("greedySafe returns null when nothing is worth doing", () => {
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const dead = room.rigs.find((r) => r.name === "B1");
  dead.destroyed = true;
  assert.equal(greedySafe(room, rig, dead), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test scripts/balance/policy.test.mjs`
Expected: FAIL — `Cannot find module './policy.mjs'`.

- [ ] **Step 3: Write the policy**

Create `scripts/balance/policy.mjs`:

```js
// The duel harness's decision function — deliberately its own file.
//
// This is the harness's single largest source of bias, and the existing sweep's
// fatal flaw was a measurement decision (structuredClone per trial) buried where
// nobody thought to question it. Put the bias where it is visible and swappable.
//
// KNOWN BIAS: greedySafe never exceeds Heat Capacity. A real player does, when
// the trade is worth it — so this systematically UNDER-rates high-heat weapons.
// Acceptable because it is consistent across weapons. Judgment is step 2's bot.
//
// It asks the engine what things cost (availableActions) rather than recomputing
// them: one source of truth, and it dogfoods the same view-model the UI renders,
// so a console that lies to a player lies to the harness too.
import { availableActions } from "../../shared/battle-view.js";
import { HEAT_CAPACITY } from "../../shared/game-state.js";

export function greedySafe(room, rig, enemy) {
  if (!rig || !enemy || enemy.destroyed || rig.destroyed) return null;
  const acts = availableActions(rig, room.game.turn, room.game.round);
  const fire = acts.find((x) => x.key === "fire");
  const cap = HEAT_CAPACITY[rig.weightClass] ?? 5;
  const heat = rig.engine?.heat ?? 0;

  // Fire while the KNOWN cost keeps us at or under capacity. Weapon heat is
  // partly random (fireModeHeat — dice showing 1 under Full Auto/Extended Belt),
  // so this budgets against known cost and will sometimes overshoot. That is the
  // gamble a player actually takes; modelling it as certain would be the lie.
  if (fire?.enabled && heat + fire.heat <= cap) {
    return { verb: "action", attrs: {
      name: rig.name, action: "fire", target: enemy.name,
      weapon: "longRange", arc: "front", distance: DUEL_DISTANCE,
    } };
  }

  // Can't fire safely — vent. Shut Down cools min(5, 2 * actionsLeft), far more
  // than Recovery's 1, so it is the correct play rather than merely passing.
  const shutdown = acts.find((x) => x.key === "shutdown");
  if (shutdown?.enabled) {
    return { verb: "action", attrs: { name: rig.name, action: "shutdown" } };
  }
  return null;
}

// Declared distance — physical mode, so arc/distance are inputs, never derived.
// Overwritten per cell by duel-sim.mjs.
export let DUEL_DISTANCE = 16;
export function setDuelDistance(d) { DUEL_DISTANCE = d; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test scripts/balance/policy.test.mjs`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add scripts/balance/policy.mjs scripts/balance/policy.test.mjs
git commit -m "feat(balance): the duel harness's greedy-safe policy

Fire while known heat cost keeps us at or under capacity, else Shut Down
(which vents up to 5 against Recovery's 1). Reads availableActions rather
than recomputing cost, so the engine owns legality and pricing.

Its own file because it is the harness's largest bias, and the current
sweep's fatal flaw was a measurement decision buried where nobody
questioned it."
```

---

### Task 3: Drive one duel

**Files:**
- Create: `scripts/balance/duel-sim.mjs`

- [ ] **Step 1: Write the driver**

Create `scripts/balance/duel-sim.mjs`:

```js
// The duel harness. Drives the REAL command path for 10 rounds (MAX_ROUNDS).
//
// It owns exactly two things it cannot borrow: which command to issue (policy.mjs)
// and what to record. The action budget, heat payment, second-shot surcharge,
// Recovery cooling, overheat table and round advance all live in game-state.js.
// A harness that models those itself is a second copy of the rules that drifts
// from the first — and prints a tidy table about a game nobody is playing.
import { createRoom, applyCommand } from "../../shared/game-state.js";
import { makeGreedySafe } from "./policy.mjs";

export const DUEL_ROUNDS = 10; // MAX_ROUNDS — the real game length

// Deterministic RNG so a seed reproduces a duel exactly.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const totalSp = (rig) => ["hull", "arms", "legs", "engine"].reduce((s, k) => s + (rig[k]?.sp || 0), 0);

// A1 (the weapon under test) vs B1 (the control). A2/A3/B2/B3 exist ONLY because
// the seed verb force-starts at >=3 rigs per side; they never act, and B3 absorbs
// the Answer token so no duellist carries a preparation.
export function runDuel({ chassisA, chassisB, weaponA, upgradeA, distance, seed }) {
  const random = mulberry32(seed);
  // A factory, not a module-level setter: distance is required and throws if
  // missing. An unexplained default would silently become the answer for every
  // cell a caller forgot to configure — the same buried-measurement-decision
  // failure as the sweep's structuredClone.
  const greedySafe = makeGreedySafe({ distance });
  const room = createRoom("DUEL");
  const roster = ["A1", "A2", "A3"].map((n) => ({ name: n, owner: "a", chassis: chassisA }))
    .concat(["B1", "B2", "B3"].map((n) => ({ name: n, owner: "b", chassis: chassisB })));
  const cmd = (verb, attrs, side) =>
    applyCommand(room, { verb, attrs }, side ? { side } : {}, { random });

  cmd("seed", { roster, first: "a" });

  // Swap the weapon under test onto A1. The chassis supplies real SP pools and
  // speed (seed passes sp: pb.sp — makeRig alone would give RIG_DEFAULTS, a hull
  // of 7 instead of 14); the weapon is the variable.
  const a1 = room.rigs.find((r) => r.name === "A1");
  a1.weapons.longRange = weaponA;
  a1.weaponUpgrades.longRange = upgradeA;
  a1.loaded.longRange = true;

  const b1 = room.rigs.find((r) => r.name === "B1");
  const b1StartSp = totalSp(b1);
  const a1StartSp = totalSp(a1);

  let guard = 0;
  while (!room.game.outcome && room.game.round <= DUEL_ROUNDS && guard++ < 2000) {
    const g = room.game;

    if (g.phase === "initiative") { cmd("initiative", { dice: null }); continue; }

    if (g.phase === "recovery") {
      // Resolves only once BOTH sides have submitted. No claims: objectives are
      // out of scope, and a VP claim would change what we are measuring.
      cmd("vp", { side: "a", claims: [] }, "a");
      cmd("vp", { side: "b", claims: [] }, "b");
      continue;
    }

    // The second player gets exactly 1 Answer token per round and there is NO
    // decline path — pendingAnswer blocks activate until it is spent. Spending
    // sets a preparation, and Brace is -2 STR on the front arc, so it goes on a
    // bystander. Answering with a duellist would silently corrupt every number.
    if (g.pendingAnswer) {
      const bystander = g.pendingAnswer.side === "b" ? "B3" : "A3";
      const ok = cmd("answer", { name: bystander, side: g.pendingAnswer.side, prep: "brace" }, g.pendingAnswer.side);
      if (room.game.pendingAnswer) break; // couldn't clear it — bail rather than spin
      continue;
    }

    const t = g.turn;
    if (!t) break;

    if (t.activeRigId == null) {
      const next = room.rigs.find((r) => r.owner === t.side && !r.activated && !r.destroyed);
      if (!next) break;
      cmd("activate", { name: next.name }, t.side);
      continue;
    }

    const rig = room.rigs.find((r) => r.id === t.activeRigId);
    // Only the two duellists fight. The four bystanders pass immediately.
    const isDuellist = rig.name === "A1" || rig.name === "B1";
    const foe = rig.name === "A1" ? b1 : a1;
    const next = isDuellist ? greedySafe(room, rig, foe) : null;
    if (next) cmd(next.verb, next.attrs, rig.owner);
    else cmd("endactivation", { name: rig.name }, rig.owner);
  }

  return {
    spDealt: b1StartSp - totalSp(b1),   // A1's output — the primary signal
    spTaken: a1StartSp - totalSp(a1),   // B1's output — free, and the only way denial shows
    wrecked: !!b1.destroyed,
    rounds: room.game.round,
  };
}
```

- [ ] **Step 2: Smoke-test it by hand**

```bash
node -e "
import('./scripts/balance/duel-sim.mjs').then(async (m) => {
  const r = m.runDuel({ chassisA: 'medium-lance-mortar', chassisB: 'medium-lance-mortar',
    weaponA: 'Autocannon', upgradeA: 'depleted-core', distance: 12, seed: 1 });
  console.log(r);
});"
```

Expected: an object with `spDealt` > 0, `spTaken` > 0, `rounds` at 10 or a wreck earlier. **If `spDealt` is 0, stop and debug** — the loop is not firing, and every downstream number would be fiction.

- [ ] **Step 3: Commit**

```bash
git add scripts/balance/duel-sim.mjs
git commit -m "feat(balance): drive a 10-round duel through the real command path

Seeds a 3v3 (the seed verb force-starts only at >=3 a side), swaps the
weapon under test onto A1, and loops applyCommand for 10 rounds. Heat,
cadence, DoT, chipping and cooling all carry because it is the real loop
rather than a model of it — which is exactly what the single-shot sweep
cannot do.

B3 absorbs the mandatory Answer token so no duellist carries a Brace."
```

---

### Task 4: The calibration test

**Files:**
- Create: `scripts/balance/duel-sim.test.mjs`

**This is the most important task in the plan.** A new instrument that disagrees with a trusted one is fiction. The current sweep never had such a check, which is exactly how it silently measured field twice on its first run and produced a report whose every conclusion was garbage.

> **The two harnesses measure different quantities — this is why the calibration
> is first-shot-only.** `weapon-sweep.mjs:35` stubs `applyDamage` as
> `LEDGER.sp += amount` — it records **intended** damage and never truncates.
> The real `applyDamage` (`game-state.js`) walks SP down a point at a time
> against actual pools, and spills into another location when one hits 0. Against
> a **fresh** target nothing truncates and the two agree. Against a damaged one
> they diverge by construction. So calibrate on the **first shot of round 1**,
> where the target is untouched — comparing 10-round totals to a single-shot mean
> would be comparing two different things and calling the mismatch a bug.

- [ ] **Step 1: Expose the first shot for calibration**

In `scripts/balance/duel-sim.mjs`, capture the first attack's SP. Add before the loop:

```js
  let firstShotSp = null;
```

and immediately after the `cmd(next.verb, next.attrs, rig.owner)` call inside the duellist branch:

```js
    if (next) {
      cmd(next.verb, next.attrs, rig.owner);
      // Calibration hook: the first A1 attack against a FRESH B1 is the only
      // point where this harness and weapon-sweep.mjs measure the same quantity.
      if (firstShotSp == null && rig.name === "A1" && next.attrs.action === "fire") {
        const last = room.game.resolutions.filter((r) => r.kind === "attack").pop();
        firstShotSp = last ? (b1StartSp - totalSp(b1)) : null;
      }
    } else cmd("endactivation", { name: rig.name }, rig.owner);
```

and add `firstShotSp` to the returned object.

- [ ] **Step 2: Write the calibration test**

Create `scripts/balance/duel-sim.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDuel, mulberry32 } from "./duel-sim.mjs";

test("a duel is deterministic for a given seed", () => {
  // Without this, nothing below is reproducible and a regression is unfalsifiable.
  const opts = { chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
    weaponA: "Autocannon", upgradeA: "depleted-core", distance: 12, seed: 7 };
  assert.deepEqual(runDuel(opts), runDuel(opts));
});

test("a duel actually fires — spDealt is non-zero and bounded", () => {
  // Guards the failure that would make every downstream number fiction: a loop
  // that spins, never activates, and reports a tidy 0.
  const r = runDuel({ chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
    weaponA: "Autocannon", upgradeA: "depleted-core", distance: 12, seed: 3 });
  assert.ok(r.spDealt > 0, `expected damage, got ${r.spDealt}`);
  assert.ok(r.rounds > 1, `expected multiple rounds, got ${r.rounds}`);
});

test("both duellists fight — the control returns fire", () => {
  // spTaken is the only way denial effects can ever show up. If B1 never fires,
  // that column is dead and we would not notice.
  const r = runDuel({ chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
    weaponA: "Autocannon", upgradeA: "depleted-core", distance: 12, seed: 5 });
  assert.ok(r.spTaken > 0, `expected the control to return fire, got ${r.spTaken}`);
});

test("CALIBRATION — the first shot matches weapon-sweep.mjs", () => {
  // THE test. A new instrument that disagrees with a trusted one is fiction.
  //
  // Only the FIRST shot is comparable: the sweep records intended damage and
  // never truncates (weapon-sweep.mjs:35), while the real applyDamage walks SP
  // down against actual pools. On a fresh target nothing truncates and the two
  // measure the same thing.
  //
  // The reference is the committed 3000-trial post-Overmatch sweep
  // (scripts/balance/report-2026-07-15-overflow.txt): Autocannon's field tier
  // (Depleted Core) reads 6.06 SP/attack pooled over targets/arcs/classes at its
  // best distance. This duel is one cell of that pool — medium vs medium, front
  // arc, sweet spot — so it will not equal 6.06 exactly. It must land in the same
  // territory. A wide band on purpose: this catches "the harness is broken", not
  // "the harness is 4% off".
  let total = 0;
  const N = 200;
  for (let s = 1; s <= N; s++) {
    total += runDuel({ chassisA: "medium-lance-mortar", chassisB: "medium-lance-mortar",
      weaponA: "Autocannon", upgradeA: "depleted-core", distance: 12, seed: s }).firstShotSp ?? 0;
  }
  const mean = total / N;
  assert.ok(mean > 3 && mean < 9,
    `first-shot SP ${mean.toFixed(2)} is nowhere near the sweep's 6.06 — the harness is wrong, not the sweep`);
});
```

- [ ] **Step 3: Run it**

Run: `node --test scripts/balance/duel-sim.test.mjs`
Expected: PASS, 4/4.

**If the calibration fails, stop.** Do not tune the band to make it pass — that is the instrument telling you it disagrees with 32.3M committed attacks, and the harness is the new thing. Debug the driver. If after debugging you believe the *sweep* is wrong, that is a finding worth more than this plan; raise it rather than editing the assertion.

If "a duel actually fires" fails, the driver is broken. Do not proceed with a harness that reports zeros.

- [ ] **Step 4: Commit**

```bash
git add scripts/balance/duel-sim.test.mjs
git commit -m "test(balance): pin that the duel harness actually runs a duel

Determinism per seed, non-zero damage, and a control that returns fire.
The last one guards the spTaken column, which is the only way denial
effects can ever appear.

A harness that spins and reports a tidy 0 is the failure mode that
matters here — the current sweep silently measured field twice on its
first run and every conclusion from it was garbage."
```

---

### Task 5: Sweep the cells and emit JSON

**Files:**
- Modify: `scripts/balance/duel-sim.mjs` (add a CLI main)

352 cells × 500 trials ≈ 2.6M attacks, about a minute. The axes are cut deliberately: the existing sweep owns arc and distance (F1/F6 answered them), and this one exists to answer what that cannot.

- [ ] **Step 1: Add the sweep main**

Append to `scripts/balance/duel-sim.mjs`:

```js
// ---- CLI ----------------------------------------------------------------
// Axes are deliberately smaller than weapon-sweep.mjs. The full grid at duel
// length would be ~485M attacks (~3 hours); arc and distance are already
// answered by that sweep (F1 revived arc; F6 says range works as designed) and
// neither interacts with cadence. What is left is what only 10 rounds can show.
import { WEAPONS, WEAPON_UPGRADES } from "../../shared/game-state.js";

const TRIALS = Number(process.env.TRIALS || 500);
const CHASSIS_A = "medium-lance-mortar";
const CHASSIS_B = "medium-lance-mortar"; // the CONTROL — a documented constant

function tiersFor(weapon) {
  const ups = WEAPON_UPGRADES[weapon] || [];
  return ups.map((u) => ({ tier: u.nature, id: u.id }));
}

async function main() {
  const rows = [];
  for (const weapon of Object.keys(WEAPONS.longRange)) {
    const prof = WEAPONS.longRange[weapon];
    const distance = prof.sweet ?? 12; // sweet spot only
    for (const { tier, id } of tiersFor(weapon)) {
      let spDealt = 0, spTaken = 0, wrecks = 0, rounds = 0;
      for (let s = 1; s <= TRIALS; s++) {
        const r = runDuel({ chassisA: CHASSIS_A, chassisB: CHASSIS_B, weaponA: weapon, upgradeA: id, distance, seed: s });
        spDealt += r.spDealt; spTaken += r.spTaken; rounds += r.rounds;
        if (r.wrecked) wrecks++;
      }
      rows.push({ weapon, tier, upgrade: id, distance,
        spDealt: spDealt / TRIALS, spTaken: spTaken / TRIALS,
        wreckRate: wrecks / TRIALS, rounds: rounds / TRIALS });
      process.stderr.write(`${weapon} ${tier}\n`);
    }
  }
  process.stdout.write(JSON.stringify({ trials: TRIALS, rounds: DUEL_ROUNDS, chassisA: CHASSIS_A, chassisB: CHASSIS_B, rows }, null, 0));
}

if (process.argv[1] && process.argv[1].endsWith("duel-sim.mjs")) main();
```

- [ ] **Step 2: Run a fast smoke sweep**

```bash
TRIALS=5 node scripts/balance/duel-sim.mjs > /tmp/duel-smoke.json 2>/dev/null
node -e "const d=require('fs').readFileSync('/tmp/duel-smoke.json','utf8');const j=JSON.parse(d);console.log('rows',j.rows.length);console.log(j.rows.slice(0,3));"
```

Expected: ~33 rows (11 longRange weapons × 3 tiers), each with `spDealt > 0`.

- [ ] **Step 3: Commit**

```bash
git add scripts/balance/duel-sim.mjs
git commit -m "feat(balance): sweep the duel harness over weapon x tier

Sweet spot only, front arc only, one control chassis. The full grid at
duel length is ~485M attacks (~3h); arc and distance are already owned by
weapon-sweep.mjs and neither interacts with cadence."
```

---

### Task 6: The report

**Files:**
- Create: `scripts/balance/duel-report.mjs`

- [ ] **Step 1: Write the formatter**

Create `scripts/balance/duel-report.mjs`:

```js
import { readFileSync } from "node:fs";
import { KNOWN_BIASES } from "./policy.mjs";
const j = JSON.parse(readFileSync(process.env.DATA || "duel.json", "utf8"));
const f = (n, p = 2) => (Number.isFinite(n) ? n.toFixed(p) : "  -  ");

console.log(`trials/cell=${j.trials} rounds=${j.rounds} control=${j.chassisB}`);
console.log("");
console.log("CAVEATS — read before tuning:");
// Printed from policy.mjs's exported constant, NOT re-typed. Two copies of a
// caveat drift, and a caveat that drifts is worse than none — the reader trusts
// it. policy.mjs owns its own biases; this prints them.
console.log(KNOWN_BIASES);
console.log("  * The control rig is fixed; its loadout shapes every number.");
console.log("  * Measures cadence, DoT, chipping and heat — NOT decisions.");
console.log("    Fire Control Lock, Enfilade, Barrage and the spatial effects");
console.log("    need a bot. If any of those show a value, this harness is lying.");
console.log("");

const byWeapon = {};
for (const r of j.rows) (byWeapon[r.weapon] ??= []).push(r);

console.log("=== SP@10 BY TIER (A1 dealt, mean over trials) ===");
console.log("weapon            field  tuned  proto | wreck% | taken");
for (const [w, rows] of Object.entries(byWeapon).sort((a, b) =>
  Math.max(...b[1].map((r) => r.spDealt)) - Math.max(...a[1].map((r) => r.spDealt)))) {
  const g = (t) => rows.find((r) => r.tier === t);
  const best = rows.reduce((m, r) => (r.spDealt > m.spDealt ? r : m), rows[0]);
  console.log(
    w.padEnd(17),
    f(g("field")?.spDealt).padStart(5),
    f(g("tuned")?.spDealt).padStart(6),
    f(g("prototype")?.spDealt).padStart(6),
    "|", (best.wreckRate * 100).toFixed(0).padStart(4) + "%",
    "|", f(best.spTaken).padStart(5),
  );
}

console.log("");
console.log("=== UPGRADE UPLIFT vs the weapon's field tier — a tier at ~0 is inert here ===");
const lifts = [];
for (const rows of Object.values(byWeapon)) {
  const base = rows.find((r) => r.tier === "field");
  if (!base) continue;
  for (const r of rows) if (r.tier !== "field") lifts.push({ ...r, uplift: r.spDealt - base.spDealt });
}
for (const r of lifts.sort((a, b) => a.uplift - b.uplift)) {
  console.log(r.weapon.padEnd(17), r.tier.padEnd(10), r.upgrade.padEnd(22), f(r.spDealt).padStart(5), f(r.uplift, 2).padStart(7));
}
```

- [ ] **Step 2: Run it against the smoke data**

```bash
DATA=/tmp/duel-smoke.json node scripts/balance/duel-report.mjs | head -20
```

Expected: the caveat block, then a table with non-zero SP@10.

- [ ] **Step 3: Commit**

```bash
git add scripts/balance/duel-report.mjs
git commit -m "feat(balance): duel report — SP@10, wreck-rate, uplift

Leads with its own caveats because the number most likely to be misused
is the one printed without them: greedySafe under-rates high-heat
weapons, the control is a constant, and this measures cadence not
decisions."
```

---

### Task 7: Run it and record what it found

**Files:**
- Create: `scripts/balance/duel-2026-07-15.txt`
- Modify: `docs/superpowers/specs/2026-07-15-weapon-balance-findings.md`

- [ ] **Step 1: Confirm the tree is green**

Run: `npm test`
Expected: PASS. Do not measure against a broken tree.

- [ ] **Step 2: Run the real sweep**

```bash
TRIALS=500 node scripts/balance/duel-sim.mjs > duel.json 2>duel-progress.txt
DATA=duel.json node scripts/balance/duel-report.mjs > scripts/balance/duel-2026-07-15.txt
cat scripts/balance/duel-2026-07-15.txt
```

- [ ] **Step 3: Check the falsifiable prediction — this is the acceptance bar**

We know *why* the sweep is blind (`structuredClone` per trial), so we predicted exactly which upgrades this fixes. Check each:

This run is **longRange-only** (the main iterates `WEAPONS.longRange`), so melee upgrades won't appear at all. Judge only the longRange rows:

| should now be non-zero | should still be ~0 |
|---|---|
| `penetrator-rounds` — fires on rounds 3, 6, 9 | `fire-control-lock` — needs a paint turn |
| `ion-burn` (Arc Gun) — burn ticks across activations | `enfilade` — needs aimed shots |
| `rivet-lock` (Rivet Gun) — needs repeated hits on one location | `barrage` (Mortar) — needs a zone commit |
| `staple-burst` — if it lands enough hits to deny an action | `harpoon-winch` — spatial |

**If `fire-control-lock` shows a value, the harness is lying** — `greedySafe` never paints, so it cannot legitimately fire. Stop and find out why. The same goes for `enfilade` (the policy never takes an Aimed Shot) and `barrage`.

That right-hand column is not a wishlist; it is the falsifiable half of the prediction. A harness that reports value for an upgrade it provably cannot exercise has a bug, and this is the only place it gets caught.

- [ ] **Step 4: Commit the report**

```bash
rm -f duel.json duel-progress.txt
git add scripts/balance/duel-2026-07-15.txt
git commit -m "chore(balance): first duel-harness run at 500 trials"
```

- [ ] **Step 5: Record the finding**

Update `docs/superpowers/specs/2026-07-15-weapon-balance-findings.md`: mark step 5 as landed, point at `scripts/balance/duel-2026-07-15.txt`, and state **how many of the 44 previously-invisible upgrades now measure non-zero**. That number is this whole project's result — write it down explicitly rather than leaving it implied.

```bash
git add docs/superpowers/specs/2026-07-15-weapon-balance-findings.md
git commit -m "docs(balance): the duel harness lands; N of 44 upgrades now visible"
```

---

## Definition of done

- `npm test` green, and it now runs `scripts/**/*.test.mjs`.
- A duel is deterministic per seed, deals non-zero damage, and the control returns fire.
- `greedySafe` never issues an action `availableActions` reports as disabled.
- `scripts/balance/duel-2026-07-15.txt` is committed, and its header carries the caveats.
- The falsifiable prediction is checked: cadence/DoT/chipping upgrades moved off 0.00, and `fire-control-lock` did **not**.
- The findings doc states how many of the 44 are now visible.

## Out of scope

- **Melee weapons** — the sweep main iterates `WEAPONS.longRange`. Extending to melee needs the policy to pick a slot; a follow-up.
- **Defensive-upgrade valuation** — Tower Shield, Anvil Boss and Emplacement sit on the control, which doesn't vary.
- **Any tuning.** This builds the instrument. It changes no balance numbers.
- **Bot-vs-bot** (step 2) — gated on the opponent brain. Run this first; its results say whether that is worth it.
