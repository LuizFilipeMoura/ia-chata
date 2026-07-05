# Round-Loop & Activation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the rulebook round structure (§4) — Initiative → Activation → Recovery over 5 rounds — with alternating one-Rig-at-a-time activation, an action menu that spends an action budget and auto-adds heat (§5), automatic overheat resolution at End Activation (§6), and an auto/manual dice model, all server-authoritative and unit-tested.

**Architecture:** All logic lives in the existing pure module `shared/game-state.js` plus a new static-data module `shared/rules.js`. Mutations continue to flow through `applyCommand(room, cmd, context, options)`, which already bumps `room.version` only on change and accepts an injectable `options.random`. Every dice roll uses caller-supplied values when present (manual mode) and falls back to `random` otherwise (auto mode), so `autoResolve` is only a client hint and the server stays branch-free and testable. Each dice event appends a capped entry to a shared `game.resolutions` log that the client will later animate. This plan is server + logic only; the UI is Plan 3.

**Tech Stack:** Node ES modules, `node:test` + `node:assert/strict` (run with `npm test`), no new dependencies.

---

## File Structure

- **Create** `shared/rules.js` — static rulebook data + tiny pure lookups this plan needs: the action catalogue (`ACTIONS`) and the Heat Threshold Table (`HEAT_THRESHOLDS` + `heatThreshold`). Combat tables (impact/location/weapons) are added by Plan 2.
- **Modify** `shared/game-state.js` — new `game`/`rig` state fields in `makeRig`/`ensureGameShape`; a shared roll + resolution-log helper; the round-loop helpers (initiative, activation, actions, overheat, recovery, VP, answer tokens, annihilation); new verbs in `applyCommand`; updates to `publicState` and `formatBattleState`.
- **Modify** `shared/game-state.test.js` — tests for every task.

All existing tests must keep passing; run `npm test` after each task.

---

### Task 1: Rulebook data module — actions & heat threshold table

**Files:**
- Create: `shared/rules.js`
- Test: `shared/rules.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `shared/rules.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, HEAT_THRESHOLDS, heatThreshold } from "./rules.js";

test("ACTIONS carry the rulebook heat and slot costs (§5)", () => {
  assert.equal(ACTIONS.move.heat, 1);
  assert.equal(ACTIONS.sprint.heat, 2);
  assert.equal(ACTIONS.fire.heat, 1);
  assert.equal(ACTIONS.aimed.heat, 1);
  assert.equal(ACTIONS.ram.heat, 1);
  assert.equal(ACTIONS.prepare.heat, 1);
  assert.equal(ACTIONS.reload.heat, 0);
  assert.equal(ACTIONS.repair.heat, 0);
  assert.equal(ACTIONS.shutdown.heat, 0);
});

test("heatThreshold maps a D12+bonus total to the right band (§6)", () => {
  assert.equal(heatThreshold(1).key, "safe");
  assert.equal(heatThreshold(5).key, "safe");
  assert.equal(heatThreshold(6).key, "stall");
  assert.equal(heatThreshold(7).key, "stall");
  assert.equal(heatThreshold(8).key, "detonation");
  assert.equal(heatThreshold(9).key, "detonation");
  assert.equal(heatThreshold(10).key, "blowout");
  assert.equal(heatThreshold(11).key, "blowout");
  assert.equal(heatThreshold(12).key, "buckling");
  assert.equal(heatThreshold(13).key, "buckling");
  assert.equal(heatThreshold(14).key, "engine-failure");
  assert.equal(heatThreshold(16).key, "engine-failure");
  assert.equal(heatThreshold(17).key, "catastrophic");
  assert.equal(heatThreshold(99).key, "catastrophic");
  assert.equal(HEAT_THRESHOLDS.length, 7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/rules.test.js`
Expected: FAIL — cannot find module `./rules.js`.

- [ ] **Step 3: Write minimal implementation**

Create `shared/rules.js`:

```js
// Static rulebook data shared by the resolution engine (server) and the
// battle UI (client). Pure data + tiny lookups — no state, no randomness.

// Action catalogue (§5). `heat` is the base heat generated; `slot` is the
// action-budget cost. Shut Down is special-cased by the engine (declared before
// any other action; forfeits the activation and cools to the heat floor).
export const ACTIONS = {
  move:     { label: "Move",        heat: 1, slot: 1 },
  sprint:   { label: "Sprint",      heat: 2, slot: 1 },
  fire:     { label: "Fire Weapon", heat: 1, slot: 1 },
  aimed:    { label: "Aimed Shot",  heat: 1, slot: 1 },
  ram:      { label: "Ram",         heat: 1, slot: 1 },
  reload:   { label: "Reload",      heat: 0, slot: 1 },
  repair:   { label: "Repair",      heat: 0, slot: 1 },
  shutdown: { label: "Shut Down",   heat: 0, slot: 0 },
  prepare:  { label: "Prepare",     heat: 1, slot: 1 },
};

// Heat Threshold Table (§6), consulted with a D12 + overheat bonus total.
// Ordered high→low so the first row whose `min` is met wins.
export const HEAT_THRESHOLDS = [
  { min: 17, key: "catastrophic",   label: "Catastrophic Failure",
    text: "Catastrophic damage to all components; heat can no longer decrease." },
  { min: 14, key: "engine-failure", label: "Engine Failure",
    text: "2 damage to the Engine; heat can no longer decrease." },
  { min: 12, key: "buckling",       label: "Structural Buckling",
    text: "1 damage to each of Hull, Engine, Arms and Legs." },
  { min: 10, key: "blowout",        label: "Hydraulic Blowout",
    text: "2 damage to the Legs; Speed halved next turn." },
  { min: 8,  key: "detonation",     label: "Ammunition Detonation",
    text: "2 damage to the Arms." },
  { min: 6,  key: "stall",          label: "System Stall",
    text: "1 damage to the Engine." },
  { min: 1,  key: "safe",           label: "Nothing happens",
    text: "The engine holds." },
];

export function heatThreshold(total) {
  const n = Math.floor(Number(total) || 0);
  return HEAT_THRESHOLDS.find((row) => n >= row.min) || HEAT_THRESHOLDS.at(-1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/rules.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/rules.js shared/rules.test.js
git commit -m "feat: add rulebook action + heat-threshold data module"
```

---

### Task 2: New state fields on rigs and the game

**Files:**
- Modify: `shared/game-state.js` (`makeRig`, `ensureGameShape`, add `ensureRigShape`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/game-state.test.js`:

```js
import { createRoom as _cr } from "./game-state.js"; // ensure import present (no-op if already imported)

test("new rigs carry activation/heat-effect defaults", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "S", class: "light", ...W } });
  const rig = findRig(r, "S");
  assert.equal(rig.activated, false);
  assert.equal(rig.skipNextActivation, false);
  assert.equal(rig.noCool, false);
  assert.equal(rig.speedHalvedNextRound, false);
  assert.deepEqual(rig.loaded, { longRange: true, melee: true });
  assert.equal(rig.preparation, null);
  assert.deepEqual(rig.weaponsDestroyed, []);
  assert.equal(rig.immobilised, false);
});

test("createRoom game carries round-loop defaults", () => {
  const r = createRoom("X");
  assert.equal(r.game.autoResolve, true);
  assert.equal(r.game.phase, "setup");
  assert.deepEqual(r.game.deployOrder, []);
  assert.equal(r.game.initiative, null);
  assert.deepEqual(r.game.answerTokens, { a: 0, b: 0 });
  assert.equal(r.game.turn, null);
  assert.deepEqual(r.game.resolutions, []);
  assert.equal(r.game.outcome, null);
});

test("ensureGameShape backfills fields on a legacy room", () => {
  const legacy = { code: "L", version: 0, nextRigId: 2, game: { round: 1, started: false },
    rigs: [{ id: 1, name: "Old", weightClass: "light", owner: "a",
      hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
      legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
      weapons:{longRange:"Mini Gun",melee:"Sword"}, destroyed:false }] };
  // Any command triggers ensureGameShape.
  applyCommand(legacy, { verb: "nonsense", attrs: {} });
  assert.equal(legacy.game.autoResolve, true);
  assert.equal(legacy.game.phase, "setup");
  assert.equal(legacy.rigs[0].activated, false);
  assert.deepEqual(legacy.rigs[0].loaded, { longRange: true, melee: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `autoResolve` undefined etc.

- [ ] **Step 3: Write minimal implementation**

In `shared/game-state.js`, extend `createRoom`'s `game` literal to include the new fields:

```js
    game: {
      round: 1,
      sides: [
        { id: "a", name: "You",   vp: 0, claimed: false, ready: false },
        { id: "b", name: "Enemy", vp: 0, claimed: false, ready: false },
      ],
      objectives: [],
      started: false,
      bounties: {},
      autoResolve: true,
      phase: "setup",
      deployOrder: [],
      initiative: null,
      answerTokens: { a: 0, b: 0 },
      turn: null,
      resolutions: [],
      nextResolutionId: 1,
      recoveryVp: {},
      suddenDeath: false,
      outcome: null,
    },
```

Add an `ensureRigShape` helper and call it from `ensureGameShape`; extend `makeRig` to set the same defaults. Add near `ensureGameShape`:

```js
function ensureRigShape(rig) {
  if (typeof rig.activated !== "boolean") rig.activated = false;
  if (typeof rig.skipNextActivation !== "boolean") rig.skipNextActivation = false;
  if (typeof rig.noCool !== "boolean") rig.noCool = false;
  if (typeof rig.speedHalvedNextRound !== "boolean") rig.speedHalvedNextRound = false;
  if (!rig.loaded || typeof rig.loaded !== "object") rig.loaded = { longRange: true, melee: true };
  if (rig.preparation === undefined) rig.preparation = null;
  if (!Array.isArray(rig.weaponsDestroyed)) rig.weaponsDestroyed = [];
  if (typeof rig.immobilised !== "boolean") rig.immobilised = false;
  return rig;
}
```

In `ensureGameShape`, after `room.rigs ||= [];` add:

```js
  if (typeof room.game.autoResolve !== "boolean") room.game.autoResolve = true;
  room.game.phase ||= "setup";
  room.game.deployOrder ||= [];
  if (room.game.initiative === undefined) room.game.initiative = null;
  room.game.answerTokens ||= { a: 0, b: 0 };
  if (room.game.turn === undefined) room.game.turn = null;
  room.game.resolutions ||= [];
  room.game.nextResolutionId ||= 1;
  room.game.recoveryVp ||= {};
  if (typeof room.game.suddenDeath !== "boolean") room.game.suddenDeath = false;
  if (room.game.outcome === undefined) room.game.outcome = null;
  for (const rig of room.rigs) ensureRigShape(rig);
```

In `makeRig`, add the fields to the returned object (after `prepare: 0,`):

```js
    activated: false,
    skipNextActivation: false,
    noCool: false,
    speedHalvedNextRound: false,
    loaded: { longRange: true, melee: true },
    preparation: null,
    weaponsDestroyed: [],
    immobilised: false,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all prior + 3 new).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: add round-loop state fields to rig and game"
```

---

### Task 3: `setdice` verb + capture deploy order + start transitions to activation

**Files:**
- Modify: `shared/game-state.js` (`resetReadyBeforeStart`, `ready` branch, `maybeStartGame`, add `applyInitiative`/`deploymentOrder`/`pushResolution`/`rollD`, new `setdice` verb)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
// Helper: stand up a started 3v3 battle. Side "a" readies first (deploys first),
// so "a" activates SECOND in round 1 and "b" activates first.
function startedRoom() {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  return r;
}

test("setdice toggles autoResolve only before the game starts", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "setdice", attrs: { value: "manual" } });
  assert.equal(r.game.autoResolve, false);
  applyCommand(r, { verb: "setdice", attrs: { value: "auto" } });
  assert.equal(r.game.autoResolve, true);
});

test("setdice is a no-op once started", () => {
  const r = startedRoom();
  const v = r.version;
  applyCommand(r, { verb: "setdice", attrs: { value: "manual" } });
  assert.equal(r.game.autoResolve, true);
  assert.equal(r.version, v);
});

test("starting the game seeds round 1 initiative from deploy order", () => {
  const r = startedRoom();
  assert.equal(r.game.phase, "activation");
  assert.equal(r.game.round, 1);
  // "a" deployed first -> activates second -> "b" goes first.
  assert.deepEqual(r.game.initiative.order, ["b", "a"]);
  assert.equal(r.game.initiative.second, "a");
  assert.equal(r.game.answerTokens.a, 2); // second activator gets Answer tokens
  assert.equal(r.game.answerTokens.b, 0);
  assert.equal(r.game.turn.side, "b");
  assert.equal(r.game.turn.activeRigId, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `setdice` unhandled; `phase` stays `"setup"`.

- [ ] **Step 3: Write minimal implementation**

In `shared/game-state.js`:

Add helpers near the other private functions (above `applyCommand`):

```js
// Roll an N-sided die. A valid caller-supplied value (manual dice entry) is used
// as-is; otherwise roll with the injectable random (auto mode / tests).
function rollD(sides, provided, random = Math.random) {
  if (provided != null) {
    const v = Math.floor(Number(provided));
    if (Number.isFinite(v) && v >= 1 && v <= sides) return v;
  }
  return Math.floor((random || Math.random)() * sides) + 1;
}

// Append a dice/effect entry to the capped shared log the client animates.
function pushResolution(room, entry) {
  entry.id = room.game.nextResolutionId++;
  room.game.resolutions.push(entry);
  while (room.game.resolutions.length > 12) room.game.resolutions.shift();
}

// Round-1 initiative comes from deployment, not dice: the first side to Ready
// (deployOrder[0]) is the first-deployer and therefore activates SECOND (§10.5).
function deploymentOrder(room) {
  const second = room.game.deployOrder[0] || "a";
  const first = second === "a" ? "b" : "a";
  return [first, second];
}

// Record an initiative result: set activation order, grant the second activator
// 2 Answer tokens, open the turn, and enter the activation phase.
function applyInitiative(room, order, rolls) {
  const [first, second] = order;
  room.game.initiative = { rolls: rolls || null, order: [first, second], second };
  room.game.answerTokens = { a: 0, b: 0 };
  room.game.answerTokens[second] = 2;
  room.game.turn = { side: first, activeRigId: null, actionsUsed: 0, actionsMax: 0 };
  room.game.phase = "activation";
}
```

Update `resetReadyBeforeStart` to also clear deploy order:

```js
function resetReadyBeforeStart(room) {
  if (room.game.started) return;
  for (const side of room.game.sides) side.ready = false;
  room.game.bounties = {};
  room.game.deployOrder = [];
}
```

In the `ready` branch of `applyCommand`, record deploy order before `maybeStartGame`:

```js
    if (side && !room.game.started && sideRigCount(room, side.id) >= 3 && !side.ready) {
      side.ready = true;
      if (!room.game.deployOrder.includes(side.id)) room.game.deployOrder.push(side.id);
      maybeStartGame(room, options.random);
      changed = true;
    }
```

In `maybeStartGame`, after `room.game.started = true;` add:

```js
  room.game.phase = "initiative";
  room.game.round = 1;
  applyInitiative(room, deploymentOrder(room), null);
  pushResolution(room, {
    kind: "initiative", actor: room.game.turn.side, rigId: null, rolls: [],
    summary: `Round 1 — ${room.game.initiative.order[0]} activates first`, effects: [],
  });
```

Add the `setdice` verb. In `applyCommand`, add a branch (place it alongside `ready`):

```js
  } else if (verb === "setdice") {
    if (!room.game.started) {
      const want = String(a.value || "").toLowerCase() !== "manual";
      if (room.game.autoResolve !== want) { room.game.autoResolve = want; changed = true; }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: seed round-1 initiative on start and add dice-mode toggle"
```

---

### Task 4: `initiative` verb for rounds 2+

**Files:**
- Modify: `shared/game-state.js` (new `initiative` verb)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("initiative verb rolls D12 for both sides and higher goes first", () => {
  const r = startedRoom();
  // Force into an initiative phase for round 2.
  r.game.phase = "initiative";
  r.game.round = 2;
  r.game.initiative = null;
  applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
  assert.deepEqual(r.game.initiative.order, ["a", "b"]);
  assert.equal(r.game.initiative.second, "b");
  assert.equal(r.game.answerTokens.b, 2);
  assert.equal(r.game.phase, "activation");
  assert.equal(r.game.turn.side, "a");
});

test("initiative rerolls ties when rolling automatically", () => {
  const r = startedRoom();
  r.game.phase = "initiative"; r.game.round = 2; r.game.initiative = null;
  // random() sequence: a=6,b=6 (tie) -> reroll a=1,b=12 -> b first.
  const seq = [5 / 12, 5 / 12, 0 / 12, 11 / 12];
  applyCommand(r, { verb: "initiative", attrs: {} }, {}, { random: () => seq.shift() });
  assert.deepEqual(r.game.initiative.order, ["b", "a"]);
});

test("initiative verb only runs during the initiative phase", () => {
  const r = startedRoom(); // phase is "activation"
  const v = r.version;
  applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
  assert.equal(r.version, v);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `initiative` unhandled.

- [ ] **Step 3: Write minimal implementation**

Add the `initiative` verb branch to `applyCommand`:

```js
  } else if (verb === "initiative") {
    if (room.game.phase === "initiative") {
      const auto = a.dice == null;
      let ra = rollD(12, a.dice?.a, options.random);
      let rb = rollD(12, a.dice?.b, options.random);
      if (auto) { while (ra === rb) { ra = rollD(12, null, options.random); rb = rollD(12, null, options.random); } }
      if (ra !== rb) {
        const order = ra > rb ? ["a", "b"] : ["b", "a"];
        applyInitiative(room, order, { a: ra, b: rb });
        pushResolution(room, {
          kind: "initiative", actor: order[0], rigId: null,
          rolls: [{ sides: 12, value: ra, label: "Side A" }, { sides: 12, value: rb, label: "Side B" }],
          summary: `Round ${room.game.round} initiative — ${order[0]} first (${ra} vs ${rb})`,
          effects: [],
        });
        changed = true;
      }
    }
```

Note: a manual tie (`ra === rb` with supplied dice) is intentionally a no-op — the client re-submits new dice.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: roll initiative for rounds 2+"
```

---

### Task 5: `activate` verb — open an activation, action budget, engine-0 skip

**Files:**
- Modify: `shared/game-state.js` (`damageRig`/`setRigSp` set skip on engine-0; `handoff`/`eligible` helpers; `activate` verb)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("activate opens the acting rig with a 5-action budget", () => {
  const r = startedRoom(); // turn.side === "b"
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.activeRigId, findRig(r, "b1").id);
  assert.equal(r.game.turn.actionsUsed, 0);
  assert.equal(r.game.turn.actionsMax, 5);
});

test("activate rejects the wrong side, a second rig mid-activation, and destroyed rigs", () => {
  const r = startedRoom(); // b's turn
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });   // not b's rig
  assert.equal(r.game.turn.activeRigId, null);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const first = r.game.turn.activeRigId;
  applyCommand(r, { verb: "activate", attrs: { name: "b2" } });   // one at a time
  assert.equal(r.game.turn.activeRigId, first);
});

test("Hull at 0 SP drops the action budget by 2", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "hull", sp: "0" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.actionsMax, 3);
});

test("engine reaching 0 SP flags the next activation as skipped", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "engine", sp: "0" } });
  assert.equal(findRig(r, "b1").skipNextActivation, true);
});

test("activating a skip-flagged rig burns the activation and hands off", () => {
  const r = startedRoom(); // b's turn
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "engine", sp: "0" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  assert.equal(b1.activated, true);
  assert.equal(b1.skipNextActivation, false);
  assert.equal(r.game.turn.activeRigId, null);
  assert.equal(r.game.turn.side, "a"); // handed off
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `activate` unhandled; skip not set.

- [ ] **Step 3: Write minimal implementation**

In `damageRig`, after the engine heat line, set the skip flag:

```js
  if (loc === "engine" && c.sp === 0) { c.heat = Math.max(c.heat, 3); rig.skipNextActivation = true; }
```

In `setRigSp`, after `recompute(rig);` guard the same transition:

```js
  if (loc === "engine" && c.sp === 0) rig.skipNextActivation = true;
```

Add eligibility + handoff helpers near the round-loop helpers (handoff calls `runRecovery`, defined in Task 7 — declare it now; JS hoists function declarations so ordering is fine):

```js
function sideHasActivatable(room, sideId) {
  return room.rigs.some((r) => (r.owner || "a") === sideId && !r.destroyed && !r.activated);
}

// After a rig finishes, pass to the other side if it can still act; otherwise
// the same side continues back-to-back; if neither can act, run Recovery (§4).
function handoff(room) {
  if (room.game.outcome) return;
  const cur = room.game.turn.side;
  const other = cur === "a" ? "b" : "a";
  if (sideHasActivatable(room, other)) room.game.turn.side = other;
  else if (sideHasActivatable(room, cur)) room.game.turn.side = cur;
  else runRecovery(room);
}
```

Add the `activate` verb branch:

```js
  } else if (verb === "activate") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && room.game.phase === "activation" && t.activeRigId == null &&
        (rig.owner || "a") === t.side && !rig.destroyed && !rig.activated) {
      if (rig.skipNextActivation) {
        rig.skipNextActivation = false;
        rig.activated = true;
        pushResolution(room, { kind: "skip", actor: rig.owner, rigId: rig.id, rolls: [],
          summary: `${rig.name} loses this activation (engine offline).`, effects: [] });
        handoff(room);
      } else {
        t.activeRigId = rig.id;
        t.actionsUsed = 0;
        t.actionsMax = 5 - (rig.hull.sp === 0 ? 2 : 0);
        rig.loaded = { longRange: true, melee: true };
      }
      changed = true;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `runRecovery is not defined`. This is expected; Task 7 defines it. To keep this task green in isolation, add a temporary stub above `handoff` now and replace it in Task 7:

```js
function runRecovery(room) { room.game.phase = "recovery"; }
```

Re-run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: open activations with action budget and engine-0 skip"
```

---

### Task 6: `action` verb — heat-generating actions, reload, repair, shut down

**Files:**
- Modify: `shared/game-state.js` (import `ACTIONS` from `./rules.js`; `bumpHeat`, `performAction`, `endActivation`; `action` verb)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("actions add their heat and spend the budget", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } });
  const b1 = findRig(r, "b1");
  assert.equal(b1.engine.heat, 3);            // 1 + 2
  assert.equal(r.game.turn.actionsUsed, 2);
});

test("actions beyond the budget are rejected", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  for (let i = 0; i < 6; i++) applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(r.game.turn.actionsUsed, 5);   // capped at actionsMax
});

test("reload reloads all weapons; repair rolls a D12 and heals", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.loaded.longRange = false;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "reload" } });
  assert.equal(b1.loaded.longRange, true);
  applyCommand(r, { verb: "damage", attrs: { name: "b1", loc: "arms", amount: "3" } }); // 5 -> 2
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "repair", loc: "arms", dice: { repair: 10 } } });
  assert.equal(b1.arms.sp, 4);                // 10+ repairs 2
  assert.equal(r.game.resolutions.at(-1).kind, "repair");
});

test("shut down before any action cools to the floor and ends the activation", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.engine.heat = 5;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "shutdown" } });
  assert.equal(b1.engine.heat, 0);
  assert.equal(b1.activated, true);
  assert.equal(r.game.turn.activeRigId, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `action` unhandled.

- [ ] **Step 3: Write minimal implementation**

At the top of `shared/game-state.js`, add the import:

```js
import { ACTIONS, heatThreshold } from "./rules.js";
```

Add heat + activation helpers near the round-loop helpers:

```js
function bumpHeat(rig, n) {
  rig.engine.heat = Math.max(engineHeatFloor(rig), rig.engine.heat + n);
  recompute(rig);
}

// End the acting rig's activation: run the overheat check (§6), mark it done,
// close the turn, then hand off (which may trigger Recovery).
function endActivation(room, rig, dice, random) {
  const m = heatMeter(rig);
  if (m.over > 0) {
    const roll = rollD(12, dice?.overheat, random);
    const total = roll + m.bonus;
    const row = applyOverheat(rig, total);
    pushResolution(room, {
      kind: "overheat", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name}: ${row.label} (D12 ${roll}+${m.bonus}=${total})`,
      effects: [row.text],
    });
    checkAnnihilation(room);
  }
  rig.activated = true;
  room.game.turn.activeRigId = null;
  handoff(room);
}

// One action during an activation. Returns whether anything changed.
function performAction(room, rig, act, a, random) {
  const t = room.game.turn;
  if (act === "shutdown") {
    if (t.actionsUsed !== 0) return false;
    rig.engine.heat = engineHeatFloor(rig);
    recompute(rig);
    endActivation(room, rig, null, random);
    return true;
  }
  const def = ACTIONS[act];
  if (!def || t.actionsUsed >= t.actionsMax) return false;
  if (act === "reload") {
    rig.loaded = { longRange: true, melee: true };
  } else if (act === "repair") {
    const roll = rollD(12, a.dice?.repair, random);
    const amt = roll >= 10 ? 2 : roll >= 7 ? 1 : 0;
    const loc = LOCS.includes(String(a.loc || "").toLowerCase()) ? a.loc.toLowerCase() : "hull";
    if (amt > 0) repairRig(rig, loc, amt);
    pushResolution(room, {
      kind: "repair", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} repair — rolled ${roll} → ${amt} SP to ${loc}`, effects: [],
    });
  } else if (act === "prepare") {
    rig.preparation = { type: String(a.prep || "brace"), source: "action" };
  }
  bumpHeat(rig, def.heat);
  t.actionsUsed += 1;
  return true;
}
```

Add `applyOverheat` (used by `endActivation`):

```js
// Apply one Heat Threshold Table row's effect to a rig (§6). Returns the row.
function applyOverheat(rig, total) {
  const row = heatThreshold(total);
  if (row.key === "stall") damageRig(rig, "engine", 1);
  else if (row.key === "detonation") damageRig(rig, "arms", 2);
  else if (row.key === "blowout") { damageRig(rig, "legs", 2); rig.speedHalvedNextRound = true; }
  else if (row.key === "buckling") for (const l of LOCS) damageRig(rig, l, 1);
  else if (row.key === "engine-failure") { damageRig(rig, "engine", 2); rig.noCool = true; }
  else if (row.key === "catastrophic") { for (const l of LOCS) setRigSp(rig, l, 0); rig.noCool = true; }
  return row;
}
```

Add the `action` verb branch:

```js
  } else if (verb === "action") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && room.game.phase === "activation" && t.activeRigId === rig.id) {
      changed = performAction(room, rig, String(a.action || "").toLowerCase(), a, options.random);
    }
```

`checkAnnihilation` is defined in Task 8; add a temporary stub now and replace it there:

```js
function checkAnnihilation(room) { /* replaced in Task 8 */ }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: resolve activation actions, reload, repair, shut down"
```

---

### Task 7: `endactivation` verb — overheat resolution & handoff; real `runRecovery`

**Files:**
- Modify: `shared/game-state.js` (replace the `runRecovery` stub; add `endactivation` verb)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("end activation with safe heat just hands off", () => {
  const r = startedRoom(); // b first
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(findRig(r, "b1").activated, true);
  assert.equal(r.game.turn.side, "a");        // alternated
  assert.equal(r.game.turn.activeRigId, null);
});

test("overheating at end of activation resolves the Heat Threshold Table", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");               // Light, capacity 6
  b1.engine.heat = 8;                         // 2 over -> bonus +4
  // D12 roll 6 -> total 10 -> Hydraulic Blowout: legs -2, speed halved.
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1", dice: { overheat: 6 } } });
  assert.equal(b1.legs.sp, 3);                // 5 - 2
  assert.equal(b1.speedHalvedNextRound, true);
  assert.equal(r.game.resolutions.at(-1).kind, "overheat");
});

test("a full round of activations triggers Recovery cooldown and reset", () => {
  const r = startedRoom();
  // Activate all six rigs, alternating as the engine dictates, each with 1 heat.
  const order = ["b1", "a1", "b2", "a2", "b3", "a3"];
  for (const name of order) {
    applyCommand(r, { verb: "activate", attrs: { name } });
    applyCommand(r, { verb: "action", attrs: { name, action: "move" } }); // +1 heat
    applyCommand(r, { verb: "endactivation", attrs: { name } });
  }
  assert.equal(r.game.phase, "recovery");
  // Heat cooled by 2 (1 -> floor 0), activation flags cleared.
  assert.equal(findRig(r, "b1").engine.heat, 0);
  assert.equal(findRig(r, "b1").activated, false);
  assert.deepEqual(r.game.answerTokens, { a: 0, b: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `endactivation` unhandled; Recovery is still the stub (no cooldown/reset).

- [ ] **Step 3: Write minimal implementation**

Replace the `runRecovery` stub with the full version:

```js
function runRecovery(room) {
  for (const rig of room.rigs) {
    if (!rig.noCool) {
      const floor = engineHeatFloor(rig);
      rig.engine.heat = Math.max(floor, rig.engine.heat - 2);
    }
    rig.activated = false;
    rig.speedHalvedNextRound = false;
    rig.preparation = null;
    recompute(rig);
  }
  room.game.answerTokens = { a: 0, b: 0 };
  room.game.turn = null;
  room.game.phase = "recovery";
  room.game.recoveryVp = {};
}
```

Add the `endactivation` verb branch:

```js
  } else if (verb === "endactivation") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && room.game.phase === "activation" && t.activeRigId === rig.id) {
      endActivation(room, rig, a.dice, options.random);
      changed = true;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: end activation with overheat resolution and recovery"
```

---

### Task 8: Recovery VP scoring, round advance, sudden death; real annihilation check

**Files:**
- Modify: `shared/game-state.js` (replace `checkAnnihilation` stub; add `advanceRound`; add `vp` verb; call `checkAnnihilation` after manual `damage`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
function runFullRound(r, healBeforeEnd = true) {
  const order = ["b1", "a1", "b2", "a2", "b3", "a3"];
  for (const name of order) {
    applyCommand(r, { verb: "activate", attrs: { name } });
    applyCommand(r, { verb: "endactivation", attrs: { name } }); // no heat -> no overheat
  }
}

test("both sides scoring VP advances to the next round's initiative", () => {
  const r = startedRoom();
  runFullRound(r);
  assert.equal(r.game.phase, "recovery");
  applyCommand(r, { verb: "vp", attrs: { side: "a", points: "2" } });
  assert.equal(r.game.phase, "recovery");         // still waiting on b
  applyCommand(r, { verb: "vp", attrs: { side: "b", points: "1" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2);
  assert.equal(r.game.sides.find((s) => s.id === "b").vp, 1);
  assert.equal(r.game.round, 2);
  assert.equal(r.game.phase, "initiative");
});

test("after round 5 the higher VP wins", () => {
  const r = startedRoom();
  for (let round = 1; round <= 5; round++) {
    if (round >= 2) applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
    runFullRound(r);
    applyCommand(r, { verb: "vp", attrs: { side: "a", points: round === 1 ? "3" : "0" } });
    applyCommand(r, { verb: "vp", attrs: { side: "b", points: "0" } });
  }
  assert.equal(r.game.phase, "finished");
  assert.deepEqual(r.game.outcome, { winner: "a", reason: "points" });
});

test("annihilation ends the game immediately", () => {
  const r = startedRoom();
  for (const name of ["b1", "b2", "b3"]) {
    for (const loc of ["hull", "engine"]) {
      applyCommand(r, { verb: "set", attrs: { name, loc, sp: "0" } });
      applyCommand(r, { verb: "damage", attrs: { name, loc, amount: "1" } }); // destroy
    }
  }
  assert.equal(r.game.outcome.winner, "a");
  assert.equal(r.game.outcome.reason, "annihilation");
  assert.equal(r.game.phase, "finished");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `vp` unhandled; annihilation stub does nothing.

- [ ] **Step 3: Write minimal implementation**

Replace the `checkAnnihilation` stub:

```js
function checkAnnihilation(room) {
  if (!room.game.started || room.game.outcome) return;
  for (const side of room.game.sides) {
    const owns = room.rigs.some((r) => (r.owner || "a") === side.id);
    const alive = room.rigs.some((r) => (r.owner || "a") === side.id && !r.destroyed);
    if (owns && !alive) {
      room.game.outcome = { winner: side.id === "a" ? "b" : "a", reason: "annihilation" };
      room.game.phase = "finished";
      return;
    }
  }
}
```

Add `advanceRound`:

```js
function advanceRound(room) {
  const [sa, sb] = room.game.sides;
  const lastRound = room.game.suddenDeath || room.game.round >= 5;
  if (lastRound) {
    if (sa.vp !== sb.vp) {
      room.game.outcome = { winner: sa.vp > sb.vp ? sa.id : sb.id, reason: "points" };
      room.game.phase = "finished";
    } else if (!room.game.suddenDeath) {
      room.game.suddenDeath = true;
      room.game.round += 1;
      room.game.phase = "initiative";
      room.game.initiative = null;
    } else {
      room.game.outcome = { winner: null, reason: "draw" };
      room.game.phase = "finished";
    }
  } else {
    room.game.round += 1;
    room.game.phase = "initiative";
    room.game.initiative = null;
  }
}
```

Add the `vp` verb branch:

```js
  } else if (verb === "vp") {
    if (room.game.phase === "recovery") {
      const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
      if (sideId && !room.game.recoveryVp[sideId]) {
        const side = room.game.sides.find((s) => s.id === sideId);
        side.vp += Math.max(0, Math.floor(Number(a.points) || 0));
        room.game.recoveryVp[sideId] = true;
        if (room.game.sides.every((s) => room.game.recoveryVp[s.id])) advanceRound(room);
        changed = true;
      }
    }
```

Call `checkAnnihilation` after manual damage. In the fallback verb group, change the `damage` line:

```js
      if (verb === "damage") { damageRig(rig, (a.loc || "").toLowerCase(), a.amount); checkAnnihilation(room); changed = true; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: score recovery VP, advance rounds, resolve victory"
```

---

### Task 9: `answer` verb — spend Answer tokens on free preparations

**Files:**
- Modify: `shared/game-state.js` (new `answer` verb)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("answer token places a free preparation and decrements the pool", () => {
  const r = startedRoom(); // side a holds 2 Answer tokens
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  const a1 = findRig(r, "a1");
  assert.deepEqual(a1.preparation, { type: "brace", source: "answer" });
  assert.equal(r.game.answerTokens.a, 1);
});

test("answer token is rejected without tokens, off-side, or when already prepared", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } }); // b has 0
  assert.equal(findRig(r, "b1").preparation, null);
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  const v = r.version;
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a" } }); // already prepared
  assert.equal(r.version, v);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `answer` unhandled.

- [ ] **Step 3: Write minimal implementation**

Add the `answer` verb branch:

```js
  } else if (verb === "answer") {
    const rig = findRig(room, a.name);
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    if (rig && sideId && (rig.owner || "a") === sideId &&
        room.game.answerTokens[sideId] > 0 && rig.preparation == null) {
      rig.preparation = { type: String(a.prep || "brace"), source: "answer" };
      room.game.answerTokens[sideId] -= 1;
      changed = true;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: spend answer tokens on free preparations"
```

---

### Task 10: Surface round-loop state to clients and to Gemma

**Files:**
- Modify: `shared/game-state.js` (`formatBattleState`)
- Test: `shared/game-state.test.js`

`publicState` already spreads `room.game`, so the new fields (`phase`, `turn`, `initiative`, `answerTokens`, `resolutions`, `autoResolve`, `outcome`) reach the client automatically; only `formatBattleState` needs new lines for the chat prompt.

- [ ] **Step 1: Write the failing test**

```js
test("publicState carries the new round-loop fields", () => {
  const r = startedRoom();
  const view = publicState(r, "a");
  assert.equal(view.game.phase, "activation");
  assert.equal(view.game.turn.side, "b");
  assert.equal(view.game.autoResolve, true);
  assert.ok(Array.isArray(view.game.resolutions));
});

test("formatBattleState reports phase and whose turn it is", () => {
  const r = startedRoom();
  const out = formatBattleState(r, "a");
  assert.match(out, /Phase: activation/i);
  assert.match(out, /Turn: b/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — no "Phase:" line.

- [ ] **Step 3: Write minimal implementation**

In `formatBattleState`, after the `Battle started:` line add:

```js
  lines.push(`Phase: ${g.phase}${g.outcome ? ` (winner: ${g.outcome.winner || "draw"})` : ""}`);
  if (g.turn) {
    const active = g.turn.activeRigId ? room.rigs.find((x) => x.id === g.turn.activeRigId) : null;
    const acting = active ? ` — ${active.name} (${g.turn.actionsUsed}/${g.turn.actionsMax} actions)` : "";
    lines.push(`Turn: ${g.turn.side}${acting}`);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS. Then run the whole suite: `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: surface phase and turn in battle state"
```

---

## Self-Review

**Spec coverage (round-loop scope):**
- Auto/manual dice → Task 1 model + Task 3 `setdice` + caller-supplied dice throughout. ✓
- Initiative (Round 1 deploy order, Rounds 2+ D12, Answer tokens) → Tasks 3, 4. ✓
- Activation alternation, budget, engine-0 skip, Hull-0 budget → Task 5. ✓
- Action menu heat + reload/repair/shutdown → Task 6. ✓
- End Activation + overheat auto-resolution (all 7 bands, `noCool`/`speedHalvedNextRound`) → Tasks 6–7. ✓
- Recovery cooldown/reset + VP prompt + round advance + sudden death → Tasks 7, 8. ✓
- Annihilation → Task 8. ✓
- Answer tokens/preparations → Task 9. ✓
- State surfaced to client + Gemma → Task 10. ✓
- **Deferred to Plan 2:** full §7 attack resolution, §8 catastrophic cascades beyond the two hooks used here (Hull-0 budget, engine-0 skip), §9 destruction explosion. **Deferred to Plan 3:** all UI, dice animation, modifier chips, attack wizard, recovery/VP prompt UI.

**Placeholder scan:** The `runRecovery` and `checkAnnihilation` stubs in Tasks 5/6 are intentional forward-declarations, each replaced in a named later task (7 and 8) with a test that fails until replaced. No other placeholders.

**Type consistency:** `game.turn = { side, activeRigId, actionsUsed, actionsMax }`, `game.initiative = { rolls, order, second }`, `rig.loaded = { longRange, melee }`, `rig.preparation = { type, source }`, resolution entries `{ id, kind, actor, rigId, rolls[], summary, effects[] }`, and `game.outcome = { winner, reason }` are used identically across every task. Verbs added: `setdice`, `initiative`, `activate`, `action`, `endactivation`, `vp`, `answer`. `heatThreshold` and `ACTIONS` imported once in Task 6.
