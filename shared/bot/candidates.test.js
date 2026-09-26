import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatesFor } from "./candidates.js";
import { createRoom, claimSide, applyCommand, checkCommand, findRig, moveBlockers, moveBudget } from "../game-state.js";
import { scoreParts } from "./score.js";
import { radiusOf, terrainPolygons, clearOfTerrain } from "../geometry.js";
import { findPath, pathDistance } from "../pathfind.js";
import { computeObjectives } from "../field.js";

// A digital room with one medium rig per side, terrain cleared, the a-side rig
// ("Atk") placed at a known spot and facing, and mid-activation. The enemy
// ("Foe") position/facing is set by the caller. Returns { room, atk, foe }.
function fireSetup(atkPos, atkFacing, foePos, foeFacing = 180) {
  const room = createRoom("CAND01");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Atk", class: "medium", owner: "a", longRange: "Autocannon", melee: "Sword" } });
  applyCommand(room, { verb: "add", attrs: { name: "Foe", class: "medium", owner: "b", longRange: "Autocannon", melee: "Sword" } });
  const atk = findRig(room, "Atk");
  const foe = findRig(room, "Foe");
  atk.pos = { ...atkPos }; atk.facing = atkFacing;
  foe.pos = { ...foePos }; foe.facing = foeFacing;
  room.field.terrain = [];
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: atk.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  atk.loaded = { longRange: true, melee: true };
  return { room, atk, foe };
}

test("a long-range fire candidate is generated per enemy with LOS, in range, in the front arc", () => {
  // Atk at (10,10) facing east (0); Foe 12in dead ahead, in band, in front, LOS clear.
  const { room } = fireSetup({ x: 10, y: 10 }, 0, { x: 22, y: 10 });
  const fires = candidatesFor(room, findRig(room, "Atk"))
    .filter((c) => c.action === "fire" && c.weapon === "longRange");
  assert.ok(fires.some((c) => c.target === "Foe"), "shoots the enemy it can see");
});

test("no long-range fire candidate for an enemy behind a building", () => {
  const { room } = fireSetup({ x: 10, y: 10 }, 0, { x: 22, y: 10 });
  // A tall wall across the corridor blocks all three sight rays -> los false.
  room.field.terrain = [{ kind: "building", x: 16, y: 10, shape: "rect", w: 2, h: 20 }];
  const fires = candidatesFor(room, findRig(room, "Atk"))
    .filter((c) => c.action === "fire" && c.weapon === "longRange");
  assert.equal(fires.length, 0, "cannot shoot what you cannot see");
});

test("no long-range fire candidate for an enemy outside the front 90 arc", () => {
  // Foe directly BEHIND Atk (west), Atk still facing east.
  const { room } = fireSetup({ x: 20, y: 10 }, 0, { x: 8, y: 10 });
  const fires = candidatesFor(room, findRig(room, "Atk"))
    .filter((c) => c.action === "fire" && c.weapon === "longRange");
  assert.equal(fires.length, 0, "can't bear on a target behind you");
});

test("melee candidates need the rim gap within reach", () => {
  // Touching mediums (centres 2.96in apart) -> rim gap 0, in reach and in front.
  const near = fireSetup({ x: 10, y: 10 }, 0, { x: 12.96, y: 10 });
  const nearMelee = candidatesFor(near.room, findRig(near.room, "Atk"))
    .filter((c) => c.action === "fire" && c.weapon === "melee");
  assert.ok(nearMelee.some((c) => c.target === "Foe"), "touching enemy is meleeable");

  // 15in apart -> rim gap ~12in, out of reach.
  const far = fireSetup({ x: 10, y: 10 }, 0, { x: 25, y: 10 });
  const farMelee = candidatesFor(far.room, findRig(far.room, "Atk"))
    .filter((c) => c.action === "fire" && c.weapon === "melee");
  assert.equal(farMelee.length, 0, "an enemy out of reach cannot be struck");
});

test("aimed candidates cover every location", () => {
  const { room } = fireSetup({ x: 10, y: 10 }, 0, { x: 22, y: 10 });
  const aimed = candidatesFor(room, findRig(room, "Atk")).filter((c) => c.action === "aimed");
  assert.deepEqual([...new Set(aimed.map((c) => c.location))].sort(), ["arms", "engine", "hull", "legs"]);
});

test("candidates only include actions availableActions says are enabled", () => {
  const { room, atk } = fireSetup({ x: 10, y: 10 }, 0, { x: 22, y: 10 });
  room.game.turn.actionsUsed = room.game.turn.actionsMax;   // no slots left
  const cs = candidatesFor(room, atk);
  assert.equal(cs.filter((c) => c.action !== "shutdown").length, 0, "no slots, no actions but Shut Down");
});

// --- Move candidates (Task 2.2) ---------------------------------------------

// A digital room with a mover ("Atk") and an enemy ("Foe") deployed on an open
// field with the real objective markers, Atk mid-activation. `terrain` lets a
// test drop obstacles in. Returns { room, atk, foe }.
function moveSetup(terrain = []) {
  const room = createRoom("MOVE01");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Atk", class: "medium", owner: "a", longRange: "Autocannon", melee: "Sword" } });
  applyCommand(room, { verb: "add", attrs: { name: "Foe", class: "medium", owner: "b", longRange: "Autocannon", melee: "Sword" } });
  const atk = findRig(room, "Atk");
  const foe = findRig(room, "Foe");
  atk.pos = { x: 12, y: 18 }; atk.facing = 0;
  foe.pos = { x: 42, y: 18 }; foe.facing = 180;
  room.field.terrain = terrain;
  room.game.objectives = computeObjectives(room.field);
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: atk.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  atk.loaded = { longRange: true, melee: true };
  return { room, atk, foe };
}

const movesOf = (room, rig) => candidatesFor(room, rig).filter((c) => c.action === "move" || c.action === "sprint");
const pivot = (from, to) => Math.abs((((to - from) % 360) + 540) % 360 - 180);

test("every move candidate is reachable within the rig's move budget", () => {
  const { room, atk } = moveSetup();
  const polys = terrainPolygons(room.field);
  const blockers = moveBlockers(room.rigs, atk);
  for (const c of movesOf(room, atk)) {
    const route = findPath(room.field, polys, blockers, radiusOf(atk), atk.pos, c.dest);
    assert.ok(route, `unreachable dest ${JSON.stringify(c.dest)}`);
    assert.ok(route.length <= moveBudget(atk, c.action) + 1e-6,
      `${c.action} length ${route.length.toFixed(2)} > budget ${moveBudget(atk, c.action)}`);
  }
});

test("every move candidate's facing is within 90° of the current facing", () => {
  const { room, atk } = moveSetup();
  for (const c of movesOf(room, atk)) {
    assert.ok(pivot(atk.facing, c.facing) <= 90 + 1e-6, `pivot ${pivot(atk.facing, c.facing)} for facing ${c.facing}`);
  }
});

test("a 0-inch move candidate exists, pivot in place is legal", () => {
  const { room, atk } = moveSetup();
  const holds = movesOf(room, atk).filter((c) => Math.hypot(c.dest.x - atk.pos.x, c.dest.y - atk.pos.y) < 1e-6);
  assert.ok(holds.length > 0, "standing still and pivoting is a legal move");
});

test("sprint candidates reach further than move candidates", () => {
  const { room, atk } = moveSetup();
  const moves = movesOf(room, atk);
  const maxDist = (act) => Math.max(...moves.filter((c) => c.action === act)
    .map((c) => Math.hypot(c.dest.x - atk.pos.x, c.dest.y - atk.pos.y)));
  assert.ok(maxDist("sprint") > maxDist("move"), "a Sprint opens spots a Move can't reach");
});

test("no move candidate lands inside terrain or on another rig", () => {
  const { room, atk } = moveSetup([{ kind: "building", x: 26, y: 18, shape: "rect", w: 4, h: 8 }]);
  const polys = terrainPolygons(room.field);
  for (const c of movesOf(room, atk)) {
    assert.ok(clearOfTerrain(c.dest, radiusOf(atk), polys), `dest ${JSON.stringify(c.dest)} intrudes terrain`);
    for (const r of room.rigs) {
      if (r === atk || !r.pos) continue;
      const gap = Math.hypot(c.dest.x - r.pos.x, c.dest.y - r.pos.y) - radiusOf(atk) - radiusOf(r);
      assert.ok(gap >= -1e-6, `dest overlaps ${r.name}`);
    }
  }
});

test("move candidates are generated toward objectives", () => {
  const { room, atk } = moveSetup();
  assert.ok(movesOf(room, atk).some((c) => /objective/.test(c.reason || "")), "at least one step toward a marker");
});

test("every emitted move candidate is accepted by the engine (E1 agreement)", () => {
  const { room, atk } = moveSetup([{ kind: "building", x: 26, y: 22, shape: "rect", w: 4, h: 6 }]);
  for (const c of movesOf(room, atk)) {
    const res = checkCommand(room, { verb: "action", attrs: { name: "Atk", action: c.action, dest: c.dest, facing: c.facing } });
    assert.equal(res.ok, true, `engine rejected ${c.action} ${JSON.stringify(c.dest)} @${c.facing}: ${res.reason}`);
  }
});

test("a rig behind a wall steps AROUND it toward its goal, not into it", () => {
  // A long wall right in front of Atk, open only at the bottom edge; the only
  // objective sits beyond it. A straight-line step would park Atk on the wall.
  const wall = { kind: "building", x: 16, y: 14, shape: "rect", w: 2, h: 28 };
  const { room, atk } = moveSetup([wall]);
  room.game.objectives = [{ x: 24, y: 18, vp: 2 }];
  const travel = pathDistance(room.field, terrainPolygons(room.field), radiusOf(atk), room.game.objectives[0]);
  const before = travel(atk.pos);
  const best = Math.min(...movesOf(room, atk).filter((c) => c.action === "move").map((c) => travel(c.dest)));
  const budget = moveBudget(atk, "move");
  assert.ok(before - best > budget * 0.8, `only gained ${(before - best).toFixed(2)} of ${budget} on the real route`);
  // And the scorer prefers that step: the approach pull reads travel distance.
  const vpOf = (c) => scoreParts(room, atk, c).vp;
  const moves = movesOf(room, atk).filter((c) => c.action === "move");
  const top = moves.reduce((a, b) => (vpOf(b) > vpOf(a) ? b : a));
  assert.ok(before - travel(top.dest) > budget * 0.8, "the approach pull rewards the route, not the wall");
});

test("a friendly base is walked through, an enemy's is not", () => {
  const { room } = moveSetup();
  applyCommand(room, { verb: "add", attrs: { name: "Pal", class: "medium", owner: "a", longRange: "Autocannon", melee: "Sword" } });
  const pal = findRig(room, "Pal");
  pal.pos = { x: 15, y: 18 }; pal.facing = 0;       // touching Atk (12,18), dead ahead
  const sprint = (x) => checkCommand(room, { verb: "action", attrs: { name: "Atk", action: "sprint", dest: { x, y: 18 }, facing: 0 } });
  const through = sprint(18);                       // 6", straight through Pal
  assert.equal(through.ok, true, through.reason);
  assert.equal(sprint(15.5).ok, false, "can't end on the friend");
  pal.owner = "b";                                  // same base, now an enemy
  assert.equal(sprint(18).ok, false, "an enemy base forces a detour past the budget");
});
