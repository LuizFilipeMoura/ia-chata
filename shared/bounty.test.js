// Trailing kill bounty (§11, wr-0.15): a wreck scored by the side that is
// strictly BEHIND the wreck's owner (before this kill's VP) pays an extra
// TRAILING_KILL_BOUNTY VP. Never multiplied by beacon escalation.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, claimSide, applyCommand, findRig,
  ANY_KILL_VP, KILL_VP, TRAILING_KILL_BOUNTY,
} from "./game-state.js";
import { scoreParts } from "./bot/score.js";

const W = { lr: "Mini Gun", melee: "Sword" };
const side = (r, id) => r.game.sides.find((s) => s.id === id);
const lastOf = (r, kind) => [...r.game.resolutions].reverse().find((e) => e.kind === kind);

function startedRoom() {
  const r = createRoom("BNTY");
  claimSide(r, { name: "Cyan", side: "a" });
  claimSide(r, { name: "Gold", side: "b" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  r.game.pendingAnswer = null;
  // Nobody is anyone's Priority Target unless a test says so.
  r.game.priorityTargets = { a: null, b: null };
  return r;
}

// Wreck `name` outright (Hull to 0, then one more).
function wreck(r, name) {
  applyCommand(r, { verb: "set", attrs: { name, loc: "hull", sp: "0" } });
  applyCommand(r, { verb: "damage", attrs: { name, loc: "hull", amount: "1" } });
  assert.equal(findRig(r, name).destroyed, true);
}

test("TRAILING_KILL_BOUNTY is 2", () => {
  assert.equal(TRAILING_KILL_BOUNTY, 2);
});

test("a kill by the side that's behind pays the bounty on top", () => {
  const r = startedRoom();
  side(r, "a").vp = 0; side(r, "b").vp = 3;
  wreck(r, "b1");
  assert.equal(side(r, "a").vp, ANY_KILL_VP + TRAILING_KILL_BOUNTY);
  const e = lastOf(r, "destruction");
  assert.deepEqual(e.vp, { side: "a", amount: ANY_KILL_VP + TRAILING_KILL_BOUNTY, bounty: TRAILING_KILL_BOUNTY });
  assert.ok(e.effects.includes("+2 VP, bounty (was behind)"), e.effects.join(" | "));
});

test("tied: no bounty", () => {
  const r = startedRoom();
  side(r, "a").vp = 4; side(r, "b").vp = 4;
  wreck(r, "b1");
  assert.equal(side(r, "a").vp, 4 + ANY_KILL_VP);
  const e = lastOf(r, "destruction");
  assert.deepEqual(e.vp, { side: "a", amount: ANY_KILL_VP });
  assert.ok(!e.effects.some((x) => /bounty/.test(x)));
});

test("ahead: no bounty", () => {
  const r = startedRoom();
  side(r, "a").vp = 5; side(r, "b").vp = 1;
  wreck(r, "b1");
  assert.equal(side(r, "a").vp, 5 + ANY_KILL_VP);
  assert.equal(lastOf(r, "destruction").vp.bounty, undefined);
});

test("1 VP behind is enough (strictly fewer)", () => {
  const r = startedRoom();
  side(r, "a").vp = 2; side(r, "b").vp = 3;
  wreck(r, "b1");
  assert.equal(side(r, "a").vp, 2 + ANY_KILL_VP + TRAILING_KILL_BOUNTY);
});

test("bounty stacks with Priority Elimination", () => {
  const r = startedRoom();
  side(r, "a").vp = 0; side(r, "b").vp = 6;
  r.game.priorityTargets = { a: findRig(r, "b2").id, b: null };
  wreck(r, "b2");
  const total = ANY_KILL_VP + KILL_VP + TRAILING_KILL_BOUNTY;
  assert.equal(side(r, "a").vp, total);
  const e = lastOf(r, "destruction");
  assert.deepEqual(e.vp, { side: "a", amount: total, bounty: TRAILING_KILL_BOUNTY });
  assert.ok(e.effects.some((x) => /Priority Elimination/.test(x)));
  assert.ok(e.effects.includes("+2 VP, bounty (was behind)"));
});

test("the bounty is not multiplied by beacon escalation", () => {
  const r = startedRoom();
  r.game.round = 9;
  side(r, "b").vp = 0; side(r, "a").vp = 10;
  wreck(r, "a3");
  assert.equal(side(r, "b").vp, ANY_KILL_VP + TRAILING_KILL_BOUNTY);
});

test("the gap is read before this kill's VP: two kills in a row, only the first pays while catching up", () => {
  const r = startedRoom();
  side(r, "a").vp = 2; side(r, "b").vp = 4;
  wreck(r, "b1"); // 2 < 4 → 2 + 1 + 2 = 5
  assert.equal(side(r, "a").vp, 5);
  wreck(r, "b2"); // 5 > 4 → plain kill
  assert.equal(side(r, "a").vp, 6);
  assert.equal(lastOf(r, "destruction").vp.bounty, undefined);
});

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

function digitalDuel() {
  const room = createRoom("BNTYD");
  room.mode = "digital";
  claimSide(room, { name: "Cyan", side: "a" });
  claimSide(room, { name: "Gold", side: "b" });
  for (const owner of ["a", "b"]) {
    applyCommand(room, { verb: "add", attrs: { name: `${owner}1`, class: "light", owner, longRange: "Autocannon", melee: "Claw" } });
  }
  room.field.terrain = [];
  room.game.started = true;
  room.game.phase = "activation";
  room.game.priorityTargets = { a: null, b: null };
  const a = findRig(room, "a1"); const b = findRig(room, "b1");
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 18, y: 10 }; b.facing = 180;
  a.loaded = { longRange: true, melee: true };
  room.game.turn = { side: "a", activeRigId: a.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  return { room, a, b };
}

test("bot: a kill is worth more when its side is behind", () => {
  const cand = { action: "fire", weapon: "longRange", target: "b1", arc: "front", distance: 8, cover: "none" };
  const at = (vpA, vpB) => {
    const { room, a } = digitalDuel();
    side(room, "a").vp = vpA; side(room, "b").vp = vpB;
    return scoreParts(room, a, cand).priority;
  };
  const even = at(3, 3);
  const behind = at(0, 3);
  const ahead = at(5, 3);
  assert.ok(even > 0);
  assert.equal(ahead, even);
  assert.ok(Math.abs(behind / even - (ANY_KILL_VP + TRAILING_KILL_BOUNTY) / ANY_KILL_VP) < 1e-9);
});
