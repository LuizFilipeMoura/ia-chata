// Cycling beacons (§11), the default for every held-marker room: round 1 is
// dark, then one beacon is lit per round (telegraphed a round ahead as Next),
// and it scores only for a side with a Rig that planted a flag on it and no
// enemy within 2". room.game.beaconRules = "classic" opts out.
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, applyCommand, lastRejectionReason, findRig, setBeaconRules, rotateBeacons, scoreBeacons, beaconTuning } from "./game-state.js";
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
