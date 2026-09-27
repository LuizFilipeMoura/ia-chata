# Cycling Beacons and Plant Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cycling beacons (dark round 1, one lit beacon per round with a telegraphed Next, Plant Flag to score, 4 VP) the default rule for every held-marker room, in the engine, rules text, V2 client and 3D client.

**Architecture:** The rule already exists in `shared/game-state.js` behind `room.game.beaconRules === "cycle"` (commit b473f27). Flip it to default-on (`"classic"` opts out), finish the physical-table path, expose Plant Flag through the shared action list, then surface lit/next/planted state in both clients. The bot already plays it; its Hard playbook is re-evolved last.

**Tech Stack:** Node ESM (shared engine, `node --test`), React + TypeScript + Vitest (V2, `client/src/v2`), Three.js (3D, `client3d/src`).

**Spec:** `docs/superpowers/specs/2026-09-27-cycling-beacons-design.md`

## Global Constraints

- Lit beacon value: **4 VP**, flat, no beacon multiplier. Lives only in `CYCLE_BEACON_VP` (`shared/game-state.js`).
- Early plant is **on** by default. Planted-only contest is **removed**. Any enemy Rig within 2" (rim) of the lit beacon contests.
- `room.game.beaconRules === "classic"` keeps today's per-marker scoring. Used by training scenarios and the A/B scripts' `legacy` arm only.
- No backwards-compat shims or save migrations (AGENTS.md).
- Tests never pin VP, pen or damage numbers; use `CYCLE_BEACON_VP` / `beaconTuning(room).vp` (memory: no value-pinning tests).
- Every rule added to `shared/rules.js` is reflected in `rules.md` in the same task.
- UI copy says **"Plant Flag"**, never bare "plant" (the Bulwark's "Un-plant" already exists).
- ALL client UI in V2 (`client/src/v2/**`) or the 3D client; never V1 (`client/src/components/**`). Keep `no-v1-imports.test.ts` green.
- V2 text uses the `--v2-text-*` / `.v2-text-*` scale; minimum 12px; no raw `font-size` (`no-raw-font-size.test.ts`).
- No em dashes or en-dash separators anywhere (code comments, copy, commits).
- Work on `main`, no branches/worktrees/stash. One commit per task below. Never `git add -A`; add the task's files by name (another session commits here too).
- Gates per task: `node --test "shared/**/*.test.js" "server/**/*.test.js" "client3d/**/*.test.js"`; tasks touching V2 also `npx vitest run` and `npx tsc --noEmit`.

---

### Task 1: Engine default flip, physical claims, single marker

**Files:**
- Modify: `shared/game-state.js` (beacon block ~1676-1736; `startGameSeeded` ~1842; `buildMission` skirmish objectives ~4376 and its `startGameSeeded` call ~4398; `seed` verb call ~4894; `scenario` verb ~4933-4937; `vp` verb ~5097-5133)
- Modify: `shared/bot/score.js` (`cycleVpAt`, drop `plantedContest`), `shared/bot/candidates.js` (early plant read)
- Modify: `shared/campaign/catalog.js:149` (skirmish blurb)
- Test: `shared/beacon-cycle.test.js` (rewrite), plus classic opt-in in existing tests listed in Step 7

**Interfaces:**
- Produces: `CYCLE_BEACON_VP` (4), `beaconTuning(room) -> { vp: number, earlyPlant: boolean }`, `cycleOn` semantics (true unless `"classic"`), `isPlanted(rig, index) -> boolean`, `rotateBeacons(room, random)`, `scoreBeacons(room)`, `setBeaconRules(room, mode, random)`, `room.game.beacons = { lit: number|null, next: number|null }`, `rig.plant = { objective: number, at: {x,y}|null } | null`.

- [ ] **Step 1: Rewrite the engine tests for the default rule**

Replace the whole of `shared/beacon-cycle.test.js` with:

```js
// Cycling beacons (§11), the default for every held-marker room: round 1 is
// dark, then one beacon is lit per round (telegraphed a round ahead as Next),
// and it scores only for a side with a Rig that planted a flag on it and no
// enemy within 2". room.game.beaconRules = "classic" opts out.
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, applyCommand, lastRejectionReason, findRig, setBeaconRules, rotateBeacons, scoreBeacons, beaconTuning, isPlanted } from "./game-state.js";
import { mulberry32 } from "./sim/match.js";

function table() {
  const room = createRoom("BC-T");
  applyCommand(room, { verb: "mission", attrs: {
    type: "beacons", seed: 1, enemyBot: "normal",
    squads: {
      a: [{ name: "Gold", chassis: "light-claw-autocannon" }, { name: "Copper", chassis: "medium-lance-mortar" }],
      b: [{ name: "Red", chassis: "medium-sniper-chainsaw" }, { name: "Blue", chassis: "light-missile-flamethrower" }],
    },
  } });
  assert.ok(room.game.started, lastRejectionReason());
  assert.equal(room.game.objectives.length, 3);
  room.field.terrain = [];
  const spots = { Gold: [4, 4], Copper: [4, 24], Red: [38, 4], Blue: [38, 24] };
  for (const [name, [x, y]] of Object.entries(spots)) Object.assign(findRig(room, name), { pos: { x, y }, facing: 0 });
  return room;
}
function turn(room, name) {
  const rig = findRig(room, name);
  room.game.phase = "activation";
  room.game.pendingAnswer = null;
  room.game.turn = { side: rig.owner, activeRigId: null, actionsUsed: 0, actionsMax: 0 };
  applyCommand(room, { verb: "activate", attrs: { name } }, { side: rig.owner });
  assert.equal(room.game.turn.activeRigId, rig.id, lastRejectionReason());
  return rig;
}
const act = (room, name, attrs) => applyCommand(room, { verb: "action", attrs: { name, ...attrs } }, { side: findRig(room, name).owner });
const beacons = (room, lit, next) => { room.game.beacons = { lit, next }; };
const onto = (room, name, i) => { const m = room.game.objectives[i]; Object.assign(findRig(room, name), { pos: { x: m.x, y: m.y } }); return m; };
const side = (room, id) => room.game.sides.find((s) => s.id === id);
const VP = (room) => beaconTuning(room).vp;

test("a started room is cycling by default: round 1 dark, a Next already announced", () => {
  const room = table();
  assert.equal(room.game.beacons.lit, null);
  assert.ok(Number.isInteger(room.game.beacons.next));
  assert.ok(room.game.beacons.next >= 0 && room.game.beacons.next < room.game.objectives.length);
});

test("each round lights the telegraphed beacon and picks a different one next", () => {
  const room = table();
  const rand = mulberry32(3);
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const was = room.game.beacons.next;
    rotateBeacons(room, rand);
    assert.equal(room.game.beacons.lit, was);
    assert.notEqual(room.game.beacons.next, room.game.beacons.lit);
    seen.add(room.game.beacons.lit);
  }
  assert.equal(seen.size, room.game.objectives.length);
});

test("a single marker is lit every round from round 2", () => {
  const room = table();
  room.game.objectives = [{ x: 21, y: 14, vp: 2, relay: true }];
  setBeaconRules(room, "cycle", mulberry32(1));
  assert.deepEqual(room.game.beacons, { lit: null, next: 0 });
  rotateBeacons(room, mulberry32(2));
  assert.deepEqual(room.game.beacons, { lit: 0, next: 0 });
  rotateBeacons(room, mulberry32(3));
  assert.deepEqual(room.game.beacons, { lit: 0, next: 0 });
});

test("Plant Flag needs the lit or next beacon within 2 inches and costs one action, no heat", () => {
  const room = table();
  beacons(room, 1, 2);
  onto(room, "Gold", 0);
  const gold = turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  assert.match(lastRejectionReason(), /2"/);                   // marker 0 is neither lit nor next
  beacons(room, 0, 2);
  const heat = gold.engine.heat, used = room.game.turn.actionsUsed;
  act(room, "Gold", { action: "plantflag" });
  assert.equal(gold.plant?.objective, 0, lastRejectionReason());
  assert.equal(room.game.turn.actionsUsed, used + 1);
  assert.equal(gold.engine.heat, heat);
});

test("the lit beacon scores only for a planted Rig, not one merely standing there", () => {
  const room = table();
  beacons(room, 0, 1);
  onto(room, "Gold", 0);
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, 0);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, VP(room));
  assert.equal(side(room, "b").vp, 0);
});

test("any enemy within 2 inches contests, planted or not", () => {
  const room = table();
  beacons(room, 0, 1);
  const m = onto(room, "Gold", 0);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  Object.assign(findRig(room, "Red"), { pos: { x: m.x + 2, y: m.y } });
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, 0);
  assert.equal(room.game.resolutions.at(-1).contested, true);
});

test("moving off the spot breaks the plant", () => {
  const room = table();
  beacons(room, 0, 1);
  const m = onto(room, "Gold", 0);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  act(room, "Gold", { action: "move", dest: { x: m.x + 1, y: m.y }, facing: 0 });
  assert.equal(findRig(room, "Gold").pos.x, m.x + 1, lastRejectionReason());
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, 0);
});

test("early plant: a flag on Next counts once that beacon lights", () => {
  const room = table();
  beacons(room, 0, 1);
  onto(room, "Gold", 1);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  assert.equal(findRig(room, "Gold").plant?.objective, 1, lastRejectionReason());
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, 0);                          // not lit yet
  rotateBeacons(room, mulberry32(1));
  assert.equal(room.game.beacons.lit, 1);
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, VP(room));
});

test("early plant can be switched off", () => {
  const room = table();
  room.game.beaconTuning = { earlyPlant: false };
  beacons(room, 0, 1);
  onto(room, "Gold", 1);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  assert.match(lastRejectionReason(), /2"/);
});

test("rotation clears flags on beacons that are neither lit nor next", () => {
  const room = table();
  beacons(room, 0, 1);
  onto(room, "Gold", 0);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  rotateBeacons(room, mulberry32(4));                            // lit 1, next is 0 or 2
  const gold = findRig(room, "Gold");
  if (room.game.beacons.next === 0) assert.equal(gold.plant?.objective, 0);
  else assert.equal(gold.plant, null);
});

test("the lit beacon's value is tunable", () => {
  const room = table();
  room.game.beaconTuning = { vp: VP(room) + 2 };
  beacons(room, 0, 1);
  onto(room, "Gold", 0);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, VP(room));
});

test("physical Recovery: claims count only the lit beacon, and only with a planted Rig", () => {
  const room = createRoom("BC-P");
  applyCommand(room, { verb: "seed", attrs: { first: "a" } });
  assert.ok(room.game.started, lastRejectionReason());
  assert.equal(room.mode, "physical");
  room.game.phase = "recovery";
  room.game.recoveryClaims = {};
  beacons(room, 0, 1);
  const vp = VP(room);
  // Side a claims everything but planted nothing: nothing scores.
  applyCommand(room, { verb: "vp", attrs: { claims: [0, 1, 2] } }, { side: "a" });
  applyCommand(room, { verb: "vp", attrs: { claims: [] } }, { side: "b" });
  assert.equal(side(room, "a").vp, 0);
  // Next Recovery: a planted Rig on the lit beacon, claims trimmed to it.
  room.game.phase = "recovery";
  room.game.recoveryClaims = {};
  beacons(room, 0, 1);
  const ra = room.rigs.find((r) => r.owner === "a");
  ra.plant = { objective: 0, at: null };
  applyCommand(room, { verb: "vp", attrs: { claims: [0, 1, 2] } }, { side: "a" });
  applyCommand(room, { verb: "vp", attrs: { claims: [] } }, { side: "b" });
  assert.equal(side(room, "a").vp, vp);
});

test("classic rooms keep per-marker scoring and never announce beacons", () => {
  const room = createRoom("BC-C");
  room.game.beaconRules = "classic";
  applyCommand(room, { verb: "seed", attrs: { first: "a" } });
  assert.ok(room.game.started, lastRejectionReason());
  assert.ok(!room.game.beacons);
});

test("the campaign Skirmish contract fights over the three standard beacons", () => {
  const room = createRoom("BC-S");
  applyCommand(room, { verb: "mission", attrs: {
    type: "skirmish", seed: 1, enemyBot: "normal",
    squads: { a: [{ name: "Gold", chassis: "light-claw-autocannon" }], b: [{ name: "Blue", chassis: "light-missile-flamethrower" }] },
  } });
  assert.equal(room.game.objectives.length, 3);
  assert.ok(Number.isInteger(room.game.beacons.next));
});

test("bots play a full cycling game: they plant, and nothing scores before round 2", async () => {
  const { playMatch } = await import("./sim/match.js");
  const squads = {
    a: [{ chassis: "light-claw-autocannon" }, { chassis: "medium-lance-mortar" }, { chassis: "light-saw-minigun" }],
    b: [{ chassis: "medium-sniper-chainsaw" }, { chassis: "light-missile-flamethrower" }, { chassis: "light-rivet-pressureclaw" }],
  };
  let plants = 0, early = 0, beacon = 0;
  for (const seed of [1, 2, 3]) {
    const r = playMatch({ squads, weights: { a: "normal", b: "normal" }, seed, table: { width: 42, height: 28 } });
    plants += r.vpFlow.plants;
    early += r.vpFlow.beaconByRound[1] || 0;
    beacon += r.vpFlow.beacon.a + r.vpFlow.beacon.b;
  }
  assert.equal(early, 0);
  assert.ok(plants > 0);
  assert.ok(beacon > 0);
});
```

Note: `isPlanted` is imported for the implementer's convenience in later assertions; remove it if the linter flags it unused.

- [ ] **Step 2: Run them, confirm the expected failures**

Run: `node --test shared/beacon-cycle.test.js`
Expected: FAIL on "a started room is cycling by default" (`room.game.beacons` is null: the flag is off), "a single marker", "physical Recovery", "classic rooms", "campaign Skirmish" (1 objective), "early plant" (off by default), "rotation clears flags".

- [ ] **Step 3: Flip the engine block to default-on**

In `shared/game-state.js`, replace the beacon block from the `// Cycling beacons (EXPERIMENT` comment through the end of `scoreBeacons` with:

```js
// Cycling beacons (§11), the rule for every held-marker room: round 1 is dark;
// from round 2 exactly ONE beacon is lit, the one announced as Next during the
// previous round, and a different one becomes Next (a single marker is lit
// every round). The lit beacon pays a flat CYCLE_BEACON_VP at Recovery to the
// side with a Rig that planted a flag on it (Plant Flag) and no enemy Rig within
// 2". room.game.beaconRules = "classic" keeps the old per-marker scoring
// (training lessons, A/B baselines). ⚙ TUNING: 4 VP won the 3/4/5 sweep.
export const CYCLE_BEACON_VP = 4;
const cycleOn = (room) => room.game.beaconRules !== "classic";
// Tuning (room.game.beaconTuning): `vp` overrides the lit beacon's value;
// `earlyPlant: false` stops Rigs planting the telegraphed Next beacon.
export function beaconTuning(room) {
  const t = room.game.beaconTuning || {};
  return { vp: Number.isFinite(t.vp) ? t.vp : CYCLE_BEACON_VP, earlyPlant: t.earlyPlant !== false };
}
function ensureBeacons(room, random = Math.random) {
  const markers = (room.game.objectives || []).map((m, i) => (m.crate ? null : i)).filter((i) => i != null);
  if (!room.game.beacons && markers.length) room.game.beacons = { lit: null, next: randomPick(markers, random) };
  return room.game.beacons;
}
export function setBeaconRules(room, mode, random = Math.random) {
  room.game.beaconRules = mode || null;
  room.game.beacons = null;
  if (cycleOn(room) && room.game.started) ensureBeacons(room, random);
}
// The round turns: last round's Next lights, a different one is Next. Flags on
// a beacon that is neither lit nor Next any more are pulled up.
export function rotateBeacons(room, random = Math.random) {
  const b = ensureBeacons(room, random);
  if (!b) return;
  b.lit = b.next;
  const others = (room.game.objectives || []).map((m, i) => (m.crate || i === b.lit ? null : i)).filter((i) => i != null);
  b.next = others.length ? randomPick(others, random) : b.lit;
  for (const r of room.rigs) if (r.plant && r.plant.objective !== b.lit && r.plant.objective !== b.next) r.plant = null;
}
// Planted on marker `index`, and still standing where it planted (any Move,
// Sprint, jump, shove or pull breaks it). A physical room has no positions, so
// the movement actions clear the plant there instead.
export function isPlanted(rig, index) {
  const p = rig.plant;
  if (!p || p.objective !== index || rig.destroyed) return false;
  return !rig.pos || !p.at || (Math.abs(rig.pos.x - p.at.x) < 1e-6 && Math.abs(rig.pos.y - p.at.y) < 1e-6);
}
export function scoreBeacons(room) {
  const b = room.game.beacons;
  if (!b || b.lit == null) return;
  const marker = room.game.objectives?.[b.lit];
  if (!marker) return;
  const { vp } = beaconTuning(room);
  const near = (sid) => room.rigs.some((r) => (r.owner || "a") === sid && !r.destroyed && r.pos && controlsObjective(spatial(r), marker));
  const planted = (sid) => room.rigs.some((r) => (r.owner || "a") === sid && isPlanted(r, b.lit)
    && (!r.pos || controlsObjective(spatial(r), marker)));
  const at = { objective: b.lit, x: marker.x, y: marker.y };
  const [sa, sb] = room.game.sides;
  const holder = [sa, sb].find((s) => planted(s.id));
  if (near(sa.id) && near(sb.id)) {
    pushResolution(room, { kind: "score", contested: true, vp: 0, base: vp, mult: 1, ...at, rolls: [], summary: "Beacon contested: nobody scores", effects: [] });
  } else if (holder) {
    holder.vp += vp;
    pushResolution(room, { kind: "score", actor: holder.id, side: holder.id, vp, base: vp, mult: 1, ...at, rolls: [], summary: `${holder.name} holds the lit beacon: +${vp} VP`, effects: [] });
  }
}
```

- [ ] **Step 4: Announce Next in every start path; Skirmish gets three beacons; lessons stay classic**

In `startGameSeeded(room, first)`, change the signature to `function startGameSeeded(room, first, random = Math.random)` and directly after its `room.game.round = 1;` line add:

```js
  if (cycleOn(room)) { room.game.beacons = null; ensureBeacons(room, random); }
```

In `buildMission` change the skirmish objectives line:

```js
    : type === "skirmish" ? computeObjectives(room.field)
```

and its start call to `startGameSeeded(room, a.first === "b" ? "b" : "a", rand);` (the mission's seeded RNG is named `rand` in that function; confirm the name where `scatterTerrain(room.field, rand, ...)` is called).

In the `seed` verb change `startGameSeeded(room, first);` to `startGameSeeded(room, first, options.random);`.

In the `scenario` verb, directly before `startGameSeeded(room, sc.first || "a");` add:

```js
      room.game.beaconRules = "classic"; // the "Claim a beacon" lesson predates Plant Flag
```

In `shared/campaign/catalog.js` replace the skirmish blurb with:

```js
  skirmish: { name: "Skirmish", icon: "crossed-swords", blurb: "One beacon is lit each round and it moves: plant on it, trade kills, out-score them by the round limit or annihilate them." },
```

- [ ] **Step 5: Physical claims: only the lit beacon, only with a planted Rig**

In the `vp` verb, replace the `const claims = Array.isArray(a.claims) ... : [];` block and the payout loop so the verb reads:

```js
        let claims = Array.isArray(a.claims)
          ? [...new Set(
              a.claims
                .map((i) => Math.floor(Number(i)))
                .filter((i) => Number.isInteger(i) && i >= 0 && i < objs.length),
            )]
          : [];
        // Cycling beacons (§11): only the lit beacon can be claimed, and only by
        // a side the app knows planted a flag on it (Plant Flag; moving clears it).
        if (cycleOn(room)) {
          const lit = room.game.beacons?.lit;
          const planted = lit != null && room.rigs.some((r) => (r.owner || "a") === sideId && isPlanted(r, lit));
          claims = planted && claims.includes(lit) ? [lit] : [];
        }
```

and in the no-conflict branch:

```js
            room.game.recoveryConflict = null;
            const mult = beaconMultiplier(room.game.round, room.game.suddenDeath);
            const pay = (i) => (cycleOn(room) ? beaconTuning(room).vp : mult * (objs[i]?.vp || 0));
            for (const s of room.game.sides) {
              s.vp += room.game.recoveryClaims[s.id].reduce((sum, i) => sum + pay(i), 0);
            }
            advanceRound(room, options.random);
```

- [ ] **Step 6: Bot follows the new defaults**

In `shared/bot/score.js` `cycleVpAt`, change the destructure to `const { vp: VP, earlyPlant } = beaconTuning(room);` and the enemy check to:

```js
      const enemyOn = livingEnemies(room, rig).some((e) => controlsObjective(spatial(e), lit));
```

In `shared/bot/candidates.js` import `beaconTuning` from `../game-state.js` and replace `room.game.beaconTuning?.earlyPlant` with `beaconTuning(room).earlyPlant`. Also replace the gate `room.game.beaconRules === "cycle" ? room.game.beacons : null` with `room.game.beaconRules !== "classic" ? room.game.beacons : null`, and in `score.js` `scoreParts` replace `room.game.beaconRules === "cycle"` with `room.game.beaconRules !== "classic"`.

- [ ] **Step 7: Run the engine suite and route classic-path tests to classic**

Run: `node --test shared/beacon-cycle.test.js` then `node --test "shared/**/*.test.js" "server/**/*.test.js"`
Expected: beacon-cycle all PASS. Some pre-existing tests fail because they test per-marker scoring on purpose. For each failing test in `shared/game-state.test.js` (VP claim tests near lines 1560, 1573, 1594, 1603; digital scoring near 6581, 6592, 6611, 6621), `shared/escalation.test.js`, `shared/tempo-rules.test.js` (~193-208, ~331), `shared/bounty.test.js` (~93), `shared/bot/*.test.js`, `shared/grit.test.js` (~487), `shared/grit-attack.test.js` (~329): add `room.game.beaconRules = "classic";` immediately after that test's `createRoom(...)` call (or in its shared helper, if the helper is only used by classic-scoring tests). Update `shared/mission.test.js` ~56 to expect 3 skirmish objectives. Re-run until green. Do not change any expected number.

- [ ] **Step 8: Commit**

```bash
git add shared/game-state.js shared/bot/score.js shared/bot/candidates.js shared/campaign/catalog.js shared/beacon-cycle.test.js shared/game-state.test.js shared/escalation.test.js shared/tempo-rules.test.js shared/bounty.test.js shared/mission.test.js shared/grit.test.js shared/grit-attack.test.js shared/bot/
git commit -m "Cycling beacons are the default rule: dark round 1, one lit beacon, Plant Flag, 4 VP"
```
(Only add the test files you actually changed.)

---

### Task 2: Plant Flag in the action list, rules text, glossary, prompt

**Files:**
- Modify: `shared/rules.js:10-36` (ACTIONS)
- Modify: `shared/field.js` (new `markerName`)
- Modify: `shared/battle-view.js` (`availableActions` ctx arg; `rigModifiers` Planted tag)
- Modify: `shared/game-state.js` `formatBattleState` (~5486-5490)
- Modify: `shared/glossary.js` (~218-232)
- Modify: `rules.md` (§1, §4 Recovery, §5 actions + heat table, §11, §18 table)
- Modify: `server/prompt.js:125-136`
- Test: `shared/field.test.js`, `shared/battle-view.test.js`, `server/prompt.test.js` (update phrases only if they fail)

**Interfaces:**
- Consumes: `isPlanted`, `room.game.beacons` (Task 1).
- Produces: `ACTIONS.plantflag = { label: "Plant Flag", heat: 0, slot: 1 }`; `markerName(objectives, i) -> string` ("Centre", "NW corner", "Relay", "Beacon"); `availableActions(rig, turn, round, ctx?)` where `ctx = { beacons, objectives, digital }`; rig modifier `{ key: "planted", tag: "Planted", tone: "prep", gloss: "plant-flag" }`; glossary ids `plant-flag`, `lit-beacon`.

- [ ] **Step 1: Failing tests**

Append to `shared/field.test.js`:

```js
import { markerName, computeObjectives } from "./field.js";
test("markerName names the centre, corners, a relay and a lone beacon", () => {
  const objs = computeObjectives({ width: 54, height: 36 });
  const names = objs.map((_, i) => markerName(objs, i));
  assert.equal(names[0], "Centre");
  assert.ok(names.slice(1).every((n) => /^[NS][EW] corner$/.test(n)));
  assert.notEqual(names[1], names[2]);
  assert.equal(markerName([{ x: 1, y: 1, vp: 2, relay: true }], 0), "Relay");
  assert.equal(markerName([{ x: 1, y: 1, vp: 2 }], 0), "Beacon");
});
```

(If `field.test.js` already imports from `./field.js`, merge `markerName` into that import instead of adding a second one.)

Append to `shared/battle-view.test.js` (reuse its existing imports of `availableActions`/`rigModifiers`; add them if absent):

```js
test("Plant Flag is offered only with beacon context, enabled on the lit or next beacon", () => {
  const rig = { id: 1, name: "Gold", kind: "rig", weightClass: "light", owner: "a", pos: { x: 10, y: 10 }, engine: { heat: 0 }, loaded: {}, hull: { sp: 5, max: 5 }, arms: { sp: 5, max: 5 }, legs: { sp: 5, max: 5 }, weapons: {} };
  const turn = { actionsUsed: 0, actionsMax: 3 };
  const objectives = [{ x: 10, y: 10, vp: 2 }, { x: 40, y: 10, vp: 1 }, { x: 10, y: 30, vp: 1 }];
  assert.ok(!availableActions(rig, turn, 2).some((a) => a.key === "plantflag"));
  const on = availableActions(rig, turn, 2, { beacons: { lit: 0, next: 1 }, objectives, digital: true }).find((a) => a.key === "plantflag");
  assert.equal(on?.enabled, true);
  const off = availableActions(rig, turn, 2, { beacons: { lit: 1, next: 2 }, objectives, digital: true }).find((a) => a.key === "plantflag");
  assert.equal(off?.enabled, false);
  const planted = { ...rig, plant: { objective: 0, at: { x: 10, y: 10 } } };
  assert.ok(rigModifiers(planted).some((m) => m.key === "planted"));
});
```

If the fixture rig is missing a field `availableActions` reads, copy the rig fixture already used elsewhere in `battle-view.test.js` instead and set `pos` / `plant` on it.

Run: `node --test shared/field.test.js shared/battle-view.test.js`
Expected: FAIL (`markerName` not exported; no `plantflag` entry).

- [ ] **Step 2: `markerName` in `shared/field.js`**

```js
// A player-facing name for objective marker `i`: "Centre", a compass-tagged
// corner ("NW corner"), "Relay" for Last Stand, "Beacon" for a lone marker.
export function markerName(objectives, i) {
  const o = objectives?.[i];
  if (!o) return "";
  if (o.relay) return "Relay";
  if (objectives.length === 1) return "Beacon";
  const c = objectives.find((x) => x.vp >= 2) ?? objectives[0];
  if (o === c) return "Centre";
  return `${o.y < c.y ? "N" : "S"}${o.x < c.x ? "W" : "E"} corner`;
}
```

- [ ] **Step 3: `ACTIONS.plantflag` in `shared/rules.js`**

After the `paint` entry:

```js
  // Plant Flag (§11): stake the lit beacon, or the telegraphed Next one, from
  // within 2". Holds until the rig is moved; scores the lit beacon at Recovery.
  plantflag:{ label: "Plant Flag", heat: 0, slot: 1 },
```

- [ ] **Step 4: `availableActions` context + Planted tag in `shared/battle-view.js`**

Imports: add `isPlanted` to the `./game-state.js` import and `controlsObjective` to the `./geometry.js` import.

Signature: `export function availableActions(rig, turn, round, ctx = null) {`

After the support-module block (before the Servo Actuators `sprintAct` block) add:

```js
  // Plant Flag (§11), only when the caller passes the room's beacon context.
  // Digital rooms check the 2" reach; a physical table trusts the player.
  const bz = ctx?.beacons;
  if (bz && Array.isArray(ctx.objectives) && (bz.lit != null || bz.next != null)) {
    const can = (i) => i != null && ctx.objectives[i] && !isPlanted(rig, i)
      && (!ctx.digital || !rig.pos || controlsObjective({ pos: rig.pos, radius: radiusOf(rig) }, ctx.objectives[i]));
    list.push({ key: "plantflag", label: ACTIONS.plantflag.label, heat: ACTIONS.plantflag.heat,
      enabled: left > 0 && (can(bz.lit) || can(bz.next)), cost: ACTIONS.plantflag.slot, note: "" });
  }
```

In `rigModifiers`, after the `emplaced` line:

```js
  if (rig.plant && isPlanted(rig, rig.plant.objective)) mods.push({ key: "planted", tag: "Planted", tone: "prep", gloss: "plant-flag" });
```

- [ ] **Step 5: Glossary (`shared/glossary.js`)**

Replace the `vp` and `beacon-escalation` entries and add two new ones after `vp`:

```js
  {
    id: "vp", term: "Victory Points", match: ["Victory Points", "VP"],
    def: "Scored at each Recovery by the side with a flag planted on the lit beacon and no enemy within 2\", +1 for every enemy Rig wrecked (+2 more for your Priority Target, +2 more when you were behind); most VP after 10 rounds wins (§11).",
  },
  {
    id: "plant-flag", term: "Plant Flag", match: ["Plant Flag", "Planted"],
    def: "1 action, no heat (§5, §11): stake the lit beacon, or the Next one, from within 2\". The flag holds until the Rig is moved by anything. At Recovery the lit beacon pays its VP to the side with a planted Rig and no enemy within 2\".",
  },
  {
    id: "lit-beacon", term: "lit beacon", match: ["lit beacon", "Lit beacon", "Next beacon"],
    def: "Only one beacon scores each round (§11). Round 1 is dark; from round 2 the beacon announced as Next lights and a different one becomes Next.",
  },
  {
    id: "beacon-escalation", term: "beacon multiplier", match: ["beacon multiplier", "Escalating beacons", "escalating beacons"],
    def: "A per-round multiplier on objective VP in classic scoring (§11). Cycling beacons always pay their flat value. Kill VP is never multiplied.",
  },
```

- [ ] **Step 6: `formatBattleState` lists the lit and Next beacon**

In `shared/game-state.js` import `markerName` from `./field.js` (extend the existing `./field.js` import) and right after the `lines.push(\`Round ${g.round}...` line add:

```js
  if (g.beacons) {
    const name = (i) => (i == null ? "none (dark)" : markerName(g.objectives, i));
    lines.push(`Lit beacon: ${name(g.beacons.lit)} · Next: ${name(g.beacons.next)}`);
    const planted = room.rigs.filter((r) => r.plant && isPlanted(r, r.plant.objective));
    if (planted.length) lines.push(`Flags planted: ${planted.map((r) => `${r.name} on ${markerName(g.objectives, r.plant.objective)}`).join(", ")}`);
  }
```

- [ ] **Step 7: `rules.md`**

§1: leave as is.

§4 Recovery step 3 becomes:

```md
3. **Score the lit beacon** (§11). Round 1 has none: every beacon is dark.
```

§5 Actions: add this bullet after the Disengage bullet:

```md
- **Plant Flag [0]**: stake a beacon (§11). The Rig must be within **2"** (rim) of the **lit** beacon or the **Next** beacon. The flag holds until the Rig is moved by anything (Move, Sprint, Jump Jets, grapnel, a shove or a pull). A flag on Next counts once that beacon lights. Costs 1 action, no heat.
```

§5 heat table: add the row `| Plant Flag | 0 |` after `| Disengage | 1 |`.

§11: replace the `### Objectives`, `### Control` sections and the first bullet plus the **Beacon multiplier** bullet of `### Scoring & winning` with:

```md
### Objectives
- **3 markers**, placed during deployment (§10): the **table centre** and one toward each **empty corner**.
- **One beacon is lit each round.** Round 1 is **dark**: nothing scores. During every round the app announces the **Next** beacon; at the start of the following round it lights, and a different beacon becomes Next. With a single marker (Last Stand's relay) that marker is lit every round from round 2.

### Control
- **Plant Flag** (§5): a Rig within **2"** of the lit or Next beacon spends an action to plant its side's flag. The flag holds until the Rig is moved by anything.
- The lit beacon is **held** by a side with a planted Rig on it, if **no enemy Rig** is within 2" of it. Any enemy Rig within 2", planted or not, **contests** it: nobody scores.
- A destroyed Rig's flag falls with it.

### Scoring & winning
- During each **Recovery Phase** the lit beacon pays **4 VP** to the side holding it. *(Digital: the engine scores it and logs "&lt;side&gt; holds the lit beacon: +4 VP", or "Beacon contested: nobody scores".)* *⚙ TUNING: bot sweeps of 3, 4 and 5 VP with early planting on: 4 kept beacons near their old share of the game (about 58% of VP), halved draws against 3, and kept the first activator at 53%.*
```

Keep the **Annihilation** and **On points** bullets and everything below them unchanged.

§16 notes: replace the **Beacon multiplier** and **Victory, Salvage** bullets with:

```md
- **Cycling beacons** (§11), round 1 dark, one lit beacon per round telegraphed a round ahead, Plant Flag to hold it, flat 4 VP; replaced "every held marker pays every round", which let a fast Rig score on turn one and rewarded parking. Bot sweeps chose early planting and 4 VP.
- **Victory, Salvage** (§11), cycling beacons, annihilation auto-win, +1 VP per kill (+2 more for the Priority Target, +2 more when behind).
```

§18 table rows become:

```md
| **Skirmish** | more VP at the round limit (the standard cycling beacons; kills score) | the reverse |
| **Last Stand** | have any Rig standing at the round limit (a relay beacon sits in front of your corner: dark in round 1, lit every round after; the attackers come for it) | annihilation |
```

- [ ] **Step 8: `server/prompt.js` guide**

Replace the three lines from `"After deployment, explain the goal briefly: score objectives during Recovery",` through `"+2 more on the Priority Target, +2 more if the killer's side was behind), or win immediately by",` with:

```js
  "After deployment, explain the goal briefly: score objectives during Recovery",
  "over 10 rounds (round 1 is dark; from round 2 one beacon is lit and the next one",
  "is announced; a Rig within 2 inches spends an action to Plant Flag, and the lit",
  "beacon pays 4 VP to a side with a planted Rig and no enemy within 2 inches; every",
  "kill scores +1 VP, +2 more on the Priority Target, +2 more if the killer's side",
  "was behind), or win immediately by",
```

- [ ] **Step 9: Run and commit**

Run: `node --test "shared/**/*.test.js" "server/**/*.test.js" "client3d/**/*.test.js"`
Expected: PASS. If `server/prompt.test.js` or `shared/glossary.test.js` fails on a phrase, update the test's expected phrase to the new text (never the rule).

```bash
git add shared/rules.js shared/field.js shared/field.test.js shared/battle-view.js shared/battle-view.test.js shared/game-state.js shared/glossary.js rules.md server/prompt.js
git commit -m "Plant Flag action, lit/next beacon in state text, rules.md and glossary for cycling beacons"
```

---

### Task 3: Sim frames and experiment scripts on the new default

**Files:**
- Modify: `shared/sim/match.js` (`frameOf` ~77)
- Modify: `scripts/beacon-arms.mjs`
- Test: `shared/sim/sim.test.js`

**Interfaces:**
- Produces: frames carry `beacons: { lit, next } | null`; `ARM_RULES.legacy = { beaconRules: "classic" }`, `ARM_RULES.ship = {}`.

- [ ] **Step 1: Failing test** (append to `shared/sim/sim.test.js`, reusing its imports)

```js
test("recorded frames carry the lit and next beacon", async () => {
  const { playMatch } = await import("./match.js");
  const squads = { a: [{ chassis: "light-claw-autocannon" }], b: [{ chassis: "light-missile-flamethrower" }] };
  const r = playMatch({ squads, weights: { a: "normal", b: "normal" }, seed: 1, record: true, table: { width: 42, height: 28 } });
  assert.ok(r.frames.every((f) => "beacons" in f));
  assert.ok(r.frames.some((f) => f.beacons?.lit != null));
});
```

Run: `node --test shared/sim/sim.test.js` Expected: FAIL.

- [ ] **Step 2: `frameOf`**

In the object `frameOf` returns, after `vp: g.sides.map(...)`, add:

```js
    beacons: g.beacons ? { lit: g.beacons.lit, next: g.beacons.next } : null,
```

- [ ] **Step 3: Arms reflect the shipped default**

Replace `ARM_RULES` in `scripts/beacon-arms.mjs` with:

```js
export const ARM_RULES = {
  legacy: { beaconRules: "classic" },
  ship: {},                                                     // the default: early plant, CYCLE_BEACON_VP
  cycle: { beaconTuning: { earlyPlant: false, vp: 3 } },
  early: { beaconTuning: { vp: 3 } },
  "early-vp5": { beaconTuning: { vp: 5 } },
  vp5: { beaconTuning: { earlyPlant: false, vp: 5 } },
};
```

and change both scripts' default arms from `"legacy,cycle"` to `"legacy,ship"`.

- [ ] **Step 4: Run and commit**

Run: `node --test shared/sim/sim.test.js && node scripts/beacon-ab.mjs --games 1 --tiers normal`
Expected: tests PASS; the A/B table prints `legacy` and `ship` rows with `R1 bcn VP` 0 for `ship`.

```bash
git add shared/sim/match.js shared/sim/sim.test.js scripts/beacon-arms.mjs scripts/beacon-ab.mjs scripts/beacon-ga.mjs
git commit -m "Sim frames record the lit beacon; beacon scripts compare against classic"
```

---

### Task 4: V2 client (lit/next on the map and HUD, Plant Flag tile, physical scoring)

Invoke the `handle-ui` skill before the visual steps (map markers, HUD chip). Keep the existing V2 look.

**Files:**
- Modify: `client/src/state/types.ts` (Objective, GameState, Rig)
- Modify: `client/src/v2/battle/BattleMap.tsx`, `client/src/v2/battle/BattleScreen.tsx:83`, `client/src/v2/styles/field.css`
- Modify: `client/src/v2/components/BattleHud.tsx:58-59`
- Modify: `client/src/v2/battle/ActionConsole.tsx` (glyph, ctx), `client/src/v2/audio/actionAudio.ts:32-41`
- Modify: `client/src/v2/overlays/VpWizard.tsx`, `client/src/lib/computeFocus.ts:81-96`
- Test: `client/src/v2/battle/BattleMap.test.tsx` (create if absent), `client/src/v2/components/BattleHud.test.tsx`, `client/src/v2/overlays/VpWizard.test.tsx`, `client/src/lib/computeFocus.test.ts`

**Interfaces:**
- Consumes: `markerName` (`/shared/field.js`), `availableActions(..., ctx)`, `game.beacons`, `rig.plant`.

- [ ] **Step 1: Types**

In `client/src/state/types.ts`:

```ts
export interface Objective { x: number; y: number; vp: number; relay?: boolean; crate?: boolean; }
export interface Beacons { lit: number | null; next: number | null; }
```

Add to `GameState`: `beacons?: Beacons | null;` and `beaconRules?: string | null;`. Add to `Rig`: `plant?: { objective: number; at: { x: number; y: number } | null } | null;`.

- [ ] **Step 2: Failing tests**

`client/src/v2/battle/BattleMap.test.tsx` (new; mirror the render helper style of the nearest existing V2 battle test):

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BattleMapLayers } from "./BattleMap";

const field = { width: 42, height: 28, diagonal: "tlbr" as const, terrain: [], locked: true };
const objectives = [{ x: 21, y: 14, vp: 2 }, { x: 10, y: 7, vp: 1 }, { x: 32, y: 21, vp: 1 }];

describe("BattleMap beacons", () => {
  it("marks the lit, next and dark beacons", () => {
    const { container } = render(
      <svg><BattleMapLayers field={field} rigs={[]} mySide="a" ownerSide={null} priorityTargetId={null} selectedId={null}
        onSelect={() => {}} onActivate={() => {}} activatable={() => false}
        objectives={objectives} beacons={{ lit: 0, next: 2 }} /></svg>,
    );
    const states = [...container.querySelectorAll("[data-testid=beacon]")].map((n) => n.getAttribute("data-state"));
    expect(states).toEqual(["lit", "dark", "next"]);
  });
});
```

In `BattleHud.test.tsx` add a case: a game with `beacons: { lit: 0, next: 1 }` and the three objectives above renders text matching `/Lit: Centre/` and `/Next: [NS][EW] corner/`; with `beacons: { lit: null, next: 0 }` it renders `/Lit: dark/`.

In `VpWizard.test.tsx` add: with `beacons: { lit: 0, next: 1 }` only one marker row renders (`Centre`); with `beacons: { lit: null, next: 1 }` the dialog shows `/dark/i` and its confirm button sends `vp` with `claims: []`.

In `computeFocus.test.ts` add: recovery with `beacons: { lit: null, next: 1 }` and no claim yields primary `"Beacons are dark this round"` with cta kind `"score"`.

Run: `npx vitest run client/src/v2 client/src/lib` Expected: the new cases FAIL.

- [ ] **Step 3: BattleMap renders beacons**

Add to `BattleMapProps`:

```ts
  objectives?: Objective[];
  beacons?: Beacons | null;
```

(import `Objective`, `Beacons` from `../../state/types`). In `BattleMapLayers`, after the field `<rect>`:

```tsx
      {(props.objectives ?? []).map((o, i) => {
        if (o.crate) return null;
        const b = props.beacons;
        const state = !b ? "classic" : b.lit === i ? "lit" : b.next === i ? "next" : "dark";
        const holder = rigs.find((r) => !r.destroyed && r.plant?.objective === i);
        const side = holder ? ((holder.owner || "a") === mySide ? " is-mine" : " is-foe") : "";
        return (
          <g key={`obj-${i}`} data-testid="beacon" data-state={state} className={`v2-bm-beacon is-${state}${side}`}>
            <circle cx={proj.sx(o.x)} cy={proj.sy(o.y)} r={proj.sx(o.x + 2) - proj.sx(o.x)} className="v2-bm-beacon-zone" />
            <circle cx={proj.sx(o.x)} cy={proj.sy(o.y)} r={6} className="v2-bm-beacon-core" />
          </g>
        );
      })}
```

In `BattleScreen.tsx` pass `objectives={game.objectives ?? []} beacons={game.beacons ?? null}` to `<BattleMap` (use the component's existing `game` variable).

Append to `client/src/v2/styles/field.css`:

```css
.v2-root .v2-bm-beacon-zone { fill: none; stroke: var(--v2-line, #555); stroke-dasharray: 3 4; }
.v2-root .v2-bm-beacon-core { fill: var(--v2-line, #555); }
.v2-root .v2-bm-beacon.is-lit .v2-bm-beacon-core { fill: #ffd35a; }
.v2-root .v2-bm-beacon.is-lit .v2-bm-beacon-zone { stroke: #ffd35a; stroke-dasharray: none; }
.v2-root .v2-bm-beacon.is-next .v2-bm-beacon-zone { stroke: #ffd35a; animation: v2-bm-next 1.6s ease-in-out infinite; }
.v2-root .v2-bm-beacon.is-dark { opacity: 0.45; }
.v2-root .v2-bm-beacon.is-mine .v2-bm-beacon-core { fill: var(--v2-oil, #e8792a); }
.v2-root .v2-bm-beacon.is-foe .v2-bm-beacon-core { fill: #e23b3b; }
@keyframes v2-bm-next { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .v2-root .v2-bm-beacon.is-next .v2-bm-beacon-zone { animation: none; } }
```

- [ ] **Step 4: HUD chip**

In `BattleHud.tsx` import `markerName` from `/shared/field.js` and replace the `beaconMultiplier` chip with:

```tsx
        {game.beacons ? (
          <span className="v2-bh-round" title="Only the lit beacon scores this round; Next lights at the start of the next round">
            Lit: {game.beacons.lit == null ? "dark" : markerName(game.objectives ?? [], game.beacons.lit)} · Next: {markerName(game.objectives ?? [], game.beacons.next ?? -1) || "none"}
          </span>
        ) : (game.beaconMultiplier || 1) > 1 && (
          <span className="v2-bh-round" title="Beacon VP is multiplied this round">Beacons ×{game.beaconMultiplier}</span>
        )}
```

- [ ] **Step 5: ActionConsole tile + audio**

In `ActionConsole.tsx`: `const { game, mode } = useRoomState();` (use the field name `RoomState` exposes for the room mode; it mirrors `ServerState.mode`). Change the call to:

```tsx
  const actions = availableActions(rig, t, game?.round,
    game?.beacons ? { beacons: game.beacons, objectives: game.objectives ?? [], digital: mode === "digital" } : null) as Action[];
```

Add `plantflag: "⚑",` to `ACTION_GLYPH`. `plantflag` falls through to `sendCommand("action", { name, action: key })` and lands in the Support group; no other change.

In `actionAudio.ts` `ACTION_AUDIO` add `plantflag: { voices: [], sfx: BEEP_SFX },` next to `prepare`.

- [ ] **Step 6: VpWizard and the Recovery banner**

In `VpWizard.tsx`, delete the local `markerLabel` and import `markerName` from `/shared/field.js`. Where the marker list is built, when `game?.beacons` is set, show only `game.beacons.lit` (if non-null) with the line `Claim it if you have a Rig with a planted flag on it and no enemy within 2″.`; when `game.beacons.lit == null`, render the text `Every beacon is dark this round: nothing scores.` and a single confirm button that sends `sendCommand("vp", { claims: [] })`. Classic rooms (no `beacons`) keep today's list, labelled with `markerName`.

In `computeFocus.ts`, before the final `return` of the recovery branch:

```ts
    if (g.beacons && g.beacons.lit == null) {
      return {
        tone: "act", icon: "⟡", primary: "Beacons are dark this round",
        secondary: "Nothing scores in round 1. Continue to the next round.",
        cta: { label: "Continue", kind: "score" },
      };
    }
```

(add `beacons` to the local game type used there if it narrows the shape.)

- [ ] **Step 7: Run, look, commit**

Run: `npx vitest run` then `npx tsc --noEmit` then `node --test "shared/**/*.test.js"`
Expected: PASS.

Live check: seed a digital battle (Join screen "Seed Test Battle ▸" then the lobby Digital toggle, or `setbot` a side), open the battle in the browser pane, confirm three beacons on the map with the Next one pulsing, the HUD reads `Lit: dark · Next: …` in round 1, Plant Flag appears in Support when a rig stands within 2" of Next, and after planting the marker takes the side colour. Screenshot.

```bash
git add client/src/state/types.ts client/src/v2/battle/BattleMap.tsx client/src/v2/battle/BattleMap.test.tsx client/src/v2/battle/BattleScreen.tsx client/src/v2/styles/field.css client/src/v2/components/BattleHud.tsx client/src/v2/components/BattleHud.test.tsx client/src/v2/battle/ActionConsole.tsx client/src/v2/audio/actionAudio.ts client/src/v2/overlays/VpWizard.tsx client/src/v2/overlays/VpWizard.test.tsx client/src/lib/computeFocus.ts client/src/lib/computeFocus.test.ts
git commit -m "V2: lit and next beacons on the map and HUD, Plant Flag tile, cycling Recovery"
```

---

### Task 5: 3D client (beacon states, banner, Plant Flag button, effects, copy)

Invoke the `handle-ui` skill before the visual steps.

**Files:**
- Modify: `client3d/src/scene/world.js` (~658-676 `setObjectiveControl`, per-frame loop ~862), `client3d/src/scene/objectives.js:1-6` (stale comment)
- Modify: `client3d/src/game/live.js` (ICON ~36, HELP ~38-60, banner ~373-378, control tint ~388-393, `availableActions` call ~452)
- Modify: `client3d/src/game/director.js` (~678-690 resolution handling)
- Modify: `client3d/src/ui/combatlog.js:17`, `client3d/src/ui/minimap.js`, `client3d/src/game/replay.js`
- Modify copy: `client3d/src/ui/tips.js`, `client3d/src/ui/glossary.js:56`, `client3d/src/main.js:404`, `client3d/src/ui/mission.js:69-72`, `client3d/src/ui/campaign.js:753-757`
- Test: `client3d/src/scene/beacon-state.test.js` (new)

**Interfaces:**
- Consumes: `markerName`, `isPlanted`, `availableActions(..., ctx)`, frame `beacons` (Task 3).
- Produces: `beaconStates(objectives, beacons, rigs) -> Array<{ state: "classic"|"lit"|"next"|"dark", holder: "a"|"b"|"contested"|null }>` in new `client3d/src/scene/beacon-state.js`.

- [ ] **Step 1: Failing test** `client3d/src/scene/beacon-state.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { beaconStates } from "./beacon-state.js";

const objs = [{ x: 10, y: 10, vp: 2 }, { x: 30, y: 10, vp: 1 }, { x: 10, y: 30, vp: 1 }];
const rig = (owner, x, y, plant = null) => ({ owner, pos: { x, y }, radius: 1, kind: "rig", weightClass: "light", plant });

test("lit, next and dark states, holder from a planted rig", () => {
  const s = beaconStates(objs, { lit: 0, next: 2 }, [rig("a", 10, 10, { objective: 0, at: { x: 10, y: 10 } })]);
  assert.deepEqual(s.map((x) => x.state), ["lit", "dark", "next"]);
  assert.equal(s[0].holder, "a");
});

test("an enemy within 2 inches makes the lit beacon contested", () => {
  const s = beaconStates(objs, { lit: 0, next: 2 }, [rig("a", 10, 10, { objective: 0, at: { x: 10, y: 10 } }), rig("b", 12, 10)]);
  assert.equal(s[0].holder, "contested");
});

test("classic rooms keep raw control", () => {
  const s = beaconStates(objs, null, [rig("b", 30, 10)]);
  assert.equal(s[1].state, "classic");
  assert.equal(s[1].holder, "b");
});
```

Run: `node --test client3d/src/scene/beacon-state.test.js` Expected: FAIL (module missing).

- [ ] **Step 2: `client3d/src/scene/beacon-state.js`**

```js
// What each objective marker should look like: its cycling state (lit / next /
// dark, or "classic" in rooms without cycling beacons) and who holds it. Pure,
// so the scene and the tests read the same answer.
import { controlsObjective } from "../../../shared/geometry.js";
import { isPlanted } from "../../../shared/game-state.js";

const within = (r, m) => !r.destroyed && r.pos && controlsObjective({ pos: r.pos, radius: r.radius ?? 1 }, m);

export function beaconStates(objectives = [], beacons = null, rigs = []) {
  return objectives.map((m, i) => {
    const near = new Set(rigs.filter((r) => within(r, m)).map((r) => r.owner || "a"));
    if (!beacons) return { state: "classic", holder: near.size === 2 ? "contested" : near.size ? [...near][0] : null };
    const state = beacons.lit === i ? "lit" : beacons.next === i ? "next" : "dark";
    const planted = new Set(rigs.filter((r) => isPlanted(r, i) && within(r, m)).map((r) => r.owner || "a"));
    const holder = near.size === 2 ? "contested" : planted.size ? [...planted][0] : null;
    return { state, holder };
  });
}
```

Check the relative import style other `client3d/src/scene/*.js` files use for `shared/` (Vite alias vs relative path) and match it. If rigs in the client lack `radius`, use the `spatial(r)` helper that `live.js` already imports for `controlsObjective`.

- [ ] **Step 3: World renders the states**

In `world.js` replace `setObjectiveControl(list)` with:

```js
  // Tint and light each objective from beaconStates(): holder colour on a lit
  // or next beacon, dark beacons dimmed with the lamp nearly off, Next pulsing.
  setObjectiveControl(list) {
    const col = { a: 0x5fd3c0, b: 0xe0533d, contested: 0xffffff };
    this.objectiveMeshes.forEach((m, i) => {
      const s = list[i] || { state: "classic", holder: null };
      const c = col[s.holder] ?? (m.kind === "relay" ? 0x5fd3c0 : 0xffd35a);
      m.ringMat.color.setHex(c); m.pylonMat.emissive.setHex(c); m.light.color.setHex(c);
      m.state = s.state;
    });
  }
```

In the per-frame `objectiveMeshes.forEach` loop, after `m.anim?.(dt, now);` add:

```js
      if (!m.pulse && m.state && m.state !== "classic") {
        const base = 6 + ((m.mult || 1) - 1) * 5;
        m.light.intensity = m.state === "lit" ? base : m.state === "next" ? base * (0.35 + 0.3 * Math.sin(now * 4)) : base * 0.08;
        m.pylonMat.emissiveIntensity = m.state === "dark" ? 0.15 : m.state === "next" ? 0.6 + 0.4 * Math.sin(now * 4) : 1.2;
      }
```

In `scene/objectives.js` header comment replace `world.setObjectiveColors` with `world.setObjectiveControl`.

- [ ] **Step 4: live.js wiring**

- Import `beaconStates` from `../scene/beacon-state.js` and `markerName` from the shared field module (match the file's existing shared import path).
- Replace the `ctrl` computation and `setObjectiveControl(ctrl)` with `this.world.setObjectiveControl(beaconStates(g.objectives || [], g.beacons || null, this.state.rigs.map((r) => ({ ...r, radius: spatial(r).radius }))));`
- Replace the multiplier banner block with a lit-beacon announcement:

```js
    // Cycling beacons: announce the lit and Next beacon when a round turns.
    const bz = g.beacons;
    const key = bz ? `${g.round}:${bz.lit}:${bz.next}` : null;
    if (bz && key !== this.lastBeaconKey) {
      if (this.lastBeaconKey != null) this.hud.banner(bz.lit == null ? `BEACONS DARK · NEXT: ${markerName(g.objectives, bz.next).toUpperCase()}` : `BEACON LIT: ${markerName(g.objectives, bz.lit).toUpperCase()} · NEXT: ${markerName(g.objectives, bz.next).toUpperCase()}`, "grit");
      this.lastBeaconKey = key;
    }
```

  Keep the old `mult` block below it for classic rooms (it only fires when the multiplier changes).
- `availableActions(rig, turn, g.round)` becomes `availableActions(rig, turn, g.round, g.beacons ? { beacons: g.beacons, objectives: g.objectives || [], digital: true } : null)`.
- `ICON`: add `plantflag: "beacon"`. `HELP`: add `plantflag: "Plant Flag: stake the lit beacon, or the Next one, from within 2\". 1 action, no heat. The flag holds until this rig is moved; at round end the lit beacon pays its VP to your side if no enemy is within 2\".",`

- [ ] **Step 5: director, combat log, minimap, replay**

In `director.js` resolution handling, next to `else if (l.kind === "score")`, add:

```js
    } else if (l.kind === "plant") {
      // Plant Flag: the beacon flares in the planter's colour and the pilot calls it.
      const col = l.actor === "a" ? 0x5fd3c0 : 0xe0533d;
      this.world.pulseObjective(l.objective, col);
      fx.text(new THREE.Vector3(l.x ?? 0, 4.2, l.y ?? 0), "FLAG PLANTED", l.actor === "a" ? "#5fd3c0" : "#e0533d");
      this.sound(() => sfx.clank());
      await wait(450 / this.speed);
```

(Match the surrounding `if/else if` structure exactly; `l.rigId` is the planter if a bark is wanted: `const m = this.mechs.get(l.rigId); if (m) this.bark(m, "move");`.)

`combatlog.js` ICON map: add `plant: "beacon"`. `minimap.js`: where objectives are drawn, accept an optional `beacons` argument and draw the lit marker filled gold, Next as a gold ring, dark markers at 40% alpha; pass `g.beacons` from the `this.minimap.set(...)` call in `live.js` (add it as the last argument). `replay.js`: when building the per-frame state, copy `frame.beacons` onto `game.beacons` so the replay renders lit/next.

- [ ] **Step 6: Copy**

- `client3d/src/ui/glossary.js:56` beacon entry: `"Only one beacon scores each round. Round 1 is dark; after that the beacon marked Next lights. Plant Flag on it (1 action, within 2\") and hold it with no enemy within 2\" at round end to score."`
- `client3d/src/ui/tips.js`: reword the contested tip to "An enemy within 2\" of the lit beacon: nobody scores it this round." Add two tips using the file's existing tip shape: when the local side has a rig within 2" of the Next beacon and no plant, "The Next beacon lights next round: Plant Flag now and it counts once it lights." When a local rig stands on the lit beacon unplanted, "You're on the lit beacon but haven't planted: it won't score."
- `client3d/src/main.js:404` scoring help: `"Scoring: one beacon is lit each round (round 1 is dark). Plant Flag on it and hold it with no enemy within 2\" at round end: 4 VP. Every kill scores too."`
- `client3d/src/ui/mission.js`: skirmish and beacons objective lines become `` `One beacon is lit each round: plant on it and hold it. More VP after round ${R} wins${c.type === "skirmish" ? ", or wipe them out" : ""}.` ``
- `client3d/src/ui/campaign.js:753-754`: beacons `` `Plant on the lit beacon each round. More VP after round ${R} wins; kills score too.` ``, skirmish `` `One lit beacon that moves every round, and kills score. More VP after round ${R} wins, or wipe them out.` ``

- [ ] **Step 7: Run, look, commit**

Run: `node --test "client3d/**/*.test.js" "shared/**/*.test.js"`
Expected: PASS.

Live check: `npm run dev:tactics` is usually already running (3D on :5174). Open `http://localhost:5174` in the browser pane, start "Skirmish vs Bot", confirm round 1 shows the "BEACONS DARK · NEXT: …" state (the Next beacon pulsing, others dim), the Plant Flag button appears (disabled with its tooltip when out of reach), planting flares the beacon, and round 2 announces the lit beacon. Check the console for errors. Screenshot.

```bash
git add client3d/src/scene/beacon-state.js client3d/src/scene/beacon-state.test.js client3d/src/scene/world.js client3d/src/scene/objectives.js client3d/src/game/live.js client3d/src/game/director.js client3d/src/ui/combatlog.js client3d/src/ui/minimap.js client3d/src/game/replay.js client3d/src/ui/tips.js client3d/src/ui/glossary.js client3d/src/main.js client3d/src/ui/mission.js client3d/src/ui/campaign.js
git commit -m "3D: dark, next and lit beacons, Plant Flag button and effects, cycling-beacon copy"
```

---

### Task 6: Re-evolve the Hard bot and confirm the numbers

**Files:**
- Modify (generated): `shared/bot/meta.js`
- Modify: `docs/superpowers/specs/2026-09-27-cycling-beacons-design.md` (append a "Shipped" section)

- [ ] **Step 1: Evolve**

Run (background, ~30 min): `node scripts/evolve-meta.mjs --skirmish`
Expected: it prints per-generation lines, a gauntlet, "wrote shared/bot/meta.js", then tier calibration. The rules hash changed, so the gene pool starts a fresh lineage for these rules.

- [ ] **Step 2: Confirm the shipped rule**

Run (background, ~25 min): `node scripts/beacon-ab.mjs --games 100 --arms legacy,ship`
Expected: `ship` rows show `R1 bcn VP` 0 in every cell. Record margins, beacon share, first-activator and side-A win rates.

- [ ] **Step 3: Full gates**

Run: `node --test "shared/**/*.test.js" "server/**/*.test.js" "scripts/**/*.test.mjs" "client3d/**/*.test.js"`, `npx vitest run`, `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Record and commit**

Append to the spec a `## Shipped` section with the calibration lines from Step 1 (tier win rates) and the Step 2 table, and one sentence on whether Hard-on-Skirmish first-activator skew is still above 55%.

```bash
git add shared/bot/meta.js docs/superpowers/specs/2026-09-27-cycling-beacons-design.md
git commit -m "Hard bot re-evolved for cycling beacons; shipped-rule sim numbers"
```
