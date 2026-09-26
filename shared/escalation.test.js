// Escalating beacons (§11): objective VP is multiplied by the round's phase,
// read from the BEACON_ESCALATION table. wr-0.14 shipped ×1/×2/×3 (rounds
// 1/4/8); wr-0.15 ships the flat table (×1 every round) after the sims, so the
// mechanism tests below run under an explicit ×1/×2/×3 table. Kill VP is never
// multiplied.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, claimSide, applyCommand, findRig, publicState, __test,
  beaconMultiplier, BEACON_ESCALATION, ANY_KILL_VP, KILL_VP,
} from "./game-state.js";
import { scoreParts } from "./bot/score.js";

const W = { lr: "Mini Gun", melee: "Sword" };
const side = (r, id) => r.game.sides.find((s) => s.id === id);

function startedRoom() {
  const r = createRoom("ESC");
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
  return r;
}

function digitalRoom(round) {
  const room = createRoom("ESCD");
  room.mode = "digital";
  claimSide(room, { name: "Cyan", side: "a" });
  claimSide(room, { name: "Gold", side: "b" });
  for (const owner of ["a", "b"]) {
    applyCommand(room, { verb: "add", attrs: { name: `${owner}1`, class: "light", owner, longRange: "Autocannon", melee: "Claw" } });
  }
  room.field.terrain = [];
  room.game.started = true;
  room.game.phase = "activation";
  room.game.round = round;
  const a = findRig(room, "a1"); const b = findRig(room, "b1");
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 40, y: 25 }; b.facing = 180;
  room.game.turn = { side: "b", activeRigId: b.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  return { room, a, b };
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

test("the shipped table is flat: beacons pay ×1 every round, Sudden Death too", () => {
  assert.deepEqual(BEACON_ESCALATION, [{ from: 1, mult: 1 }]);
  assert.deepEqual([1, 4, 8, 10, 11].map((r) => beaconMultiplier(r)), [1, 1, 1, 1, 1]);
  assert.equal(beaconMultiplier(11, true), 1);
});

const ESCALATED = [{ from: 1, mult: 1 }, { from: 4, mult: 2 }, { from: 8, mult: 3 }];
const SHIPPED = BEACON_ESCALATION.map((x) => ({ ...x }));

describe("with an escalation table (×1 / ×2 / ×3 from rounds 1 / 4 / 8)", () => {
before(() => { BEACON_ESCALATION.splice(0, BEACON_ESCALATION.length, ...ESCALATED.map((x) => ({ ...x }))); });
after(() => { BEACON_ESCALATION.splice(0, BEACON_ESCALATION.length, ...SHIPPED); });

test("beaconMultiplier: ×1 rounds 1-3, ×2 rounds 4-7, ×3 rounds 8-10", () => {
  const got = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => beaconMultiplier(r));
  assert.deepEqual(got, [1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
});

test("beaconMultiplier: Sudden Death pays the last step", () => {
  assert.equal(beaconMultiplier(11), 3);
  assert.equal(beaconMultiplier(11, true), 3);
  assert.equal(beaconMultiplier(2, true), 3, "the flag alone is enough");
});

test("publicState exposes the current beacon multiplier", () => {
  const r = startedRoom();
  assert.equal(publicState(r, "a").game.beaconMultiplier, 1);
  r.game.round = 4;
  assert.equal(publicState(r, "b").game.beaconMultiplier, 2);
  r.game.round = 11; r.game.suddenDeath = true;
  assert.equal(publicState(r, "a").game.beaconMultiplier, 3);
});

// ---------------------------------------------------------------------------
// Digital round-end scoring
// ---------------------------------------------------------------------------

test("digital scoring at round 1: vp = base, mult 1, plain summary", () => {
  const { room } = digitalRoom(1);
  room.game.objectives = [{ x: 40, y: 25, vp: 1 }];
  const n = room.game.nextResolutionId;
  __test.runRecovery(room);
  const s = room.game.resolutions.find((e) => e.kind === "score" && e.id >= n);
  assert.deepEqual([s.vp, s.base, s.mult], [1, 1, 1]);
  assert.equal(s.summary, "Gold holds the beacon: +1 VP");
  assert.equal(side(room, "b").vp, 1);
});

test("digital scoring at round 5: the centre pays 2 ×2 = 4", () => {
  const { room, b } = digitalRoom(5);
  b.pos = { x: 30, y: 20 };
  room.game.objectives = [{ x: 30, y: 20, vp: 2 }];
  const n = room.game.nextResolutionId;
  __test.runRecovery(room);
  const s = room.game.resolutions.find((e) => e.kind === "score" && e.id >= n);
  assert.deepEqual([s.side, s.vp, s.base, s.mult], ["b", 4, 2, 2]);
  assert.equal(s.summary, "Gold holds the beacon: +4 VP (2 ×2)");
  assert.equal(side(room, "b").vp, 4);
});

test("digital scoring at round 9: a corner pays 1 ×3 = 3; a contested marker still pays nobody", () => {
  const { room, a } = digitalRoom(9);
  room.game.objectives = [{ x: 40, y: 25, vp: 1 }, { x: 10, y: 10, vp: 2 }];
  const b2 = (applyCommand(room, { verb: "add", attrs: { name: "b2", class: "light", owner: "b", longRange: "Mini Gun", melee: "Sword" } }), findRig(room, "b2"));
  b2.pos = { x: 11, y: 10 }; b2.facing = 180;
  a.pos = { x: 10, y: 10 };
  const n = room.game.nextResolutionId;
  __test.runRecovery(room);
  const scores = room.game.resolutions.filter((e) => e.kind === "score" && e.id >= n);
  const held = scores.find((e) => e.objective === 0);
  assert.deepEqual([held.vp, held.base, held.mult], [3, 1, 3]);
  const contested = scores.find((e) => e.objective === 1);
  assert.equal(contested.contested, true);
  assert.equal(contested.vp, 0);
  assert.equal(side(room, "b").vp, 3);
  assert.equal(side(room, "a").vp, 0);
});

// ---------------------------------------------------------------------------
// Physical Recovery claims
// ---------------------------------------------------------------------------

function inRecovery(round) {
  const r = startedRoom();
  r.game.round = round;
  r.game.phase = "recovery";
  r.game.recoveryClaims = {};
  r.game.turn = null;
  return r;
}

test("physical claims at round 3 pay face value", () => {
  const r = inRecovery(3);
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [0] } });
  applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [1] } });
  assert.equal(side(r, "a").vp, 2);
  assert.equal(side(r, "b").vp, 1);
  assert.equal(r.game.round, 4);
});

test("physical claims at round 4 are doubled", () => {
  const r = inRecovery(4);
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [0] } });
  applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [1, 2] } });
  assert.equal(side(r, "a").vp, 4);
  assert.equal(side(r, "b").vp, 4);
});

test("physical claims at round 10 are tripled", () => {
  const r = inRecovery(10);
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [1] } });
  applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [] } });
  assert.equal(side(r, "a").vp, 3);
  assert.deepEqual(r.game.outcome, { winner: "a", reason: "points" });
});

// ---------------------------------------------------------------------------
// Kill VP is flat
// ---------------------------------------------------------------------------

test("kill VP is not multiplied, even in round 9", () => {
  const r = startedRoom();
  r.game.round = 9;
  r.game.pendingAnswer = null;
  const b1 = findRig(r, "b1");
  const priority = r.game.priorityTargets.a === b1.id;
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "integrity", sp: "1" } });
  applyCommand(r, { verb: "damage", attrs: { name: "b1", loc: "hull", amount: "1" } });
  assert.equal(b1.destroyed, true);
  assert.equal(side(r, "a").vp, ANY_KILL_VP + (priority ? KILL_VP : 0));
});

// ---------------------------------------------------------------------------
// Bots price beacons by the multiplier
// ---------------------------------------------------------------------------

test("bot values holding a beacon at the round's multiplier", () => {
  const at = (round) => {
    const { room, b } = digitalRoom(round);
    b.pos = { x: 30, y: 20 };
    room.game.objectives = [{ x: 30, y: 20, vp: 2 }];
    return scoreParts(room, b, { action: "prepare" }).vp;
  };
  assert.equal(at(1), 2);
  assert.equal(at(5), 4);
  assert.equal(at(9), 6);
});

test("bot's pull toward a far beacon reads the upcoming multiplier at a phase boundary", () => {
  const pull = (round) => {
    const { room, b } = digitalRoom(round);
    b.pos = { x: 40, y: 25 };
    room.game.objectives = [{ x: 10, y: 25, vp: 2 }];
    return scoreParts(room, b, { action: "prepare" }).vp;
  };
  // Round 3 is ×1 now, but a rig that far off only arrives for round 4's ×2.
  assert.ok(Math.abs(pull(3) - pull(4)) < 1e-9);
  assert.ok(Math.abs(pull(3) - 2 * pull(1)) < 1e-9);
});
});
