// Cycling beacons (experiment, behind room.game.beaconRules = "cycle"): round 1
// is dark, then one beacon is lit per round (telegraphed a round ahead), and it
// only scores for a side with a Rig PLANTED on it and no enemy within 2".
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, applyCommand, lastRejectionReason, findRig, setBeaconRules, rotateBeacons, scoreBeacons, CYCLE_BEACON_VP } from "./game-state.js";
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
  setBeaconRules(room, "cycle", mulberry32(7));
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
const light = (room, i) => { room.game.beacons.lit = i; return room.game.objectives[i]; };
const onto = (room, name, m) => Object.assign(findRig(room, name), { pos: { x: m.x, y: m.y } });
const side = (room, id) => room.game.sides.find((s) => s.id === id);

test("round 1 is dark and already telegraphs the next beacon", () => {
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

test("Plant needs a lit beacon within 2 inches and costs one action, no heat", () => {
  const room = table();
  const m = room.game.objectives[0];
  onto(room, "Gold", m);
  const gold = turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  assert.match(lastRejectionReason(), /dark|lit/i);           // round 1: nothing is lit
  light(room, 1);
  act(room, "Gold", { action: "plantflag" });
  assert.match(lastRejectionReason(), /2"/);                   // standing on a dark one
  light(room, 0);
  const heat = gold.engine.heat, used = room.game.turn.actionsUsed;
  act(room, "Gold", { action: "plantflag" });
  assert.equal(gold.plant?.objective, 0, lastRejectionReason());
  assert.equal(room.game.turn.actionsUsed, used + 1);
  assert.equal(gold.engine.heat, heat);
});

test("the lit beacon scores only for a planted Rig, not one merely standing there", () => {
  const room = table();
  const m = light(room, 0);
  onto(room, "Gold", m);
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, 0);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, CYCLE_BEACON_VP);
  assert.equal(side(room, "b").vp, 0);
});

test("an enemy within 2 inches contests a planted beacon", () => {
  const room = table();
  const m = light(room, 0);
  onto(room, "Gold", m);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  Object.assign(findRig(room, "Red"), { pos: { x: m.x + 2, y: m.y } });
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, 0);
  assert.equal(room.game.resolutions.at(-1).contested, true);
});

test("moving off the spot breaks the plant", () => {
  const room = table();
  const m = light(room, 0);
  onto(room, "Gold", m);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  act(room, "Gold", { action: "move", dest: { x: m.x + 1, y: m.y }, facing: 0 });
  assert.equal(findRig(room, "Gold").pos.x, m.x + 1, lastRejectionReason());
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, 0);
});

test("a dark beacon never scores, planted or not", () => {
  const room = table();
  const m = light(room, 0);
  onto(room, "Gold", m);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  room.game.beacons.lit = 1;
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, 0);
});

test("bots play a full cycling-beacon game: they plant, and nothing scores before round 2", async () => {
  const { playMatch } = await import("./sim/match.js");
  const squads = {
    a: [{ chassis: "light-claw-autocannon" }, { chassis: "medium-lance-mortar" }, { chassis: "light-saw-minigun" }],
    b: [{ chassis: "medium-sniper-chainsaw" }, { chassis: "light-missile-flamethrower" }, { chassis: "light-rivet-pressureclaw" }],
  };
  let plants = 0, early = 0, beacon = 0;
  for (const seed of [1, 2, 3]) {
    const r = playMatch({ squads, weights: { a: "normal", b: "normal" }, seed, beaconRules: "cycle", table: { width: 42, height: 28 } });
    plants += r.vpFlow.plants;
    early += r.vpFlow.beaconByRound[1] || 0;
    beacon += r.vpFlow.beacon.a + r.vpFlow.beacon.b;
  }
  assert.equal(early, 0);
  assert.ok(plants > 0);
  assert.ok(beacon > 0);
});

// ── Tuning switches (room.game.beaconTuning) ────────────────────────────────

test("tuning: the lit beacon's value is configurable", () => {
  const room = table();
  room.game.beaconTuning = { vp: CYCLE_BEACON_VP + 2 };
  const m = light(room, 0);
  onto(room, "Gold", m);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, CYCLE_BEACON_VP + 2);
});

test("tuning: early plant stakes the telegraphed beacon, and it counts once lit", () => {
  const room = table();
  room.game.beacons = { lit: 0, next: 1 };
  const m = room.game.objectives[1];
  onto(room, "Gold", m);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  assert.match(lastRejectionReason(), /2"/);                   // off by default
  room.game.beaconTuning = { earlyPlant: true };
  act(room, "Gold", { action: "plantflag" });
  assert.equal(findRig(room, "Gold").plant?.objective, 1, lastRejectionReason());
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, 0);                          // not lit yet
  rotateBeacons(room, mulberry32(1));
  assert.equal(room.game.beacons.lit, 1);
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, CYCLE_BEACON_VP);
});

test("tuning: with planted contest, only a planted enemy blocks the score", () => {
  const room = table();
  room.game.beaconTuning = { plantedContest: true };
  const m = light(room, 0);
  onto(room, "Gold", m);
  turn(room, "Gold");
  act(room, "Gold", { action: "plantflag" });
  Object.assign(findRig(room, "Red"), { pos: { x: m.x + 2, y: m.y } });
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, CYCLE_BEACON_VP);           // Red is only standing there
  turn(room, "Red");
  act(room, "Red", { action: "plantflag" });
  scoreBeacons(room);
  assert.equal(side(room, "a").vp, CYCLE_BEACON_VP);           // now contested: no new score
  assert.equal(side(room, "b").vp, 0);
  assert.equal(room.game.resolutions.at(-1).contested, true);
});
