// Every equipment, fully digital (docs/design/campaign.md): the spatial halves
// the physical table narrates (Jump Jets, Grapnel, Heat Purge Wave, meltdown
// burst, Chaff Burst, Nanite reach) are simulated in a digital room.
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, applyCommand, lastRejectionReason, findRig } from "./game-state.js";

// A bare 42×28 digital table, two rigs a side, placed by hand.
function table(aKit = {}, bKit = {}, place = {}) {
  const room = createRoom("EQ-T");
  applyCommand(room, { verb: "mission", attrs: {
    type: "skirmish", seed: 1, enemyBot: "normal",
    squads: {
      a: [{ name: "Gold", chassis: "light-claw-autocannon", ...aKit }, { name: "Copper", chassis: "medium-lance-mortar" }],
      b: [{ name: "Red", chassis: "medium-sniper-chainsaw", ...bKit }, { name: "Blue", chassis: "light-missile-flamethrower" }],
    },
  } });
  assert.ok(room.game.started, lastRejectionReason());
  room.field.terrain = [];
  const spots = { Gold: [10, 10, 0], Copper: [4, 24, 0], Red: [30, 10, 180], Blue: [38, 24, 180], ...place };
  for (const [name, [x, y, facing]] of Object.entries(spots)) Object.assign(findRig(room, name), { pos: { x, y }, facing });
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
const lastRes = (room) => room.game.resolutions[room.game.resolutions.length - 1];

test("Jump Jets hop to a clear spot within base Speed, over anything", () => {
  const room = table({ equipment: "servo-actuators" });
  room.field.terrain = [{ kind: "rock", x: 12, y: 10, w: 1.5, h: 4, rot: 0 }];
  const gold = turn(room, "Gold");
  act(room, "Gold", { action: "jumpjets" });
  assert.match(lastRejectionReason(), /destination/i);
  act(room, "Gold", { action: "jumpjets", dest: { x: 15, y: 10 }, facing: 0 });
  assert.match(lastRejectionReason(), /reach/i);          // 5" > Speed 4
  act(room, "Gold", { action: "jumpjets", dest: { x: 14, y: 10 }, facing: 45 });
  assert.deepEqual(gold.pos, { x: 14, y: 10 });
  assert.equal(gold.facing, 45);
  const res = lastRes(room);
  assert.equal(res.active, "jumpjets");
  assert.deepEqual(res.from, { x: 10, y: 10 });
  assert.deepEqual(res.to, { x: 14, y: 10 });
});

test("Jump Jets can't land on a rig", () => {
  const room = table({ equipment: "servo-actuators" }, {}, { Copper: [13, 10, 0] });
  turn(room, "Gold");
  act(room, "Gold", { action: "jumpjets", dest: { x: 13.5, y: 10 }, facing: 0 });
  assert.match(lastRejectionReason(), /land/i);
});

test("Grapnel yank: hop 4\" out of a melee lock", () => {
  const room = table({ equipment: "servo-actuators", equipmentUpgrade: "grapnel-launcher" }, {}, { Red: [12.6, 10, 180] });
  const gold = findRig(room, "Gold");
  const red = findRig(room, "Red");
  gold.engagedWith = red.id; red.engagedWith = gold.id;
  turn(room, "Gold");
  act(room, "Gold", { action: "jumpjets", mode: "yank", dest: { x: 10, y: 15 }, facing: 90 });
  assert.match(lastRejectionReason(), /reach/i);          // 5" > 4"
  act(room, "Gold", { action: "jumpjets", mode: "yank", dest: { x: 10, y: 13.5 }, facing: 90 });
  assert.deepEqual(gold.pos, { x: 10, y: 13.5 });
  assert.equal(gold.engagedWith, null);
  assert.equal(red.engagedWith, null);
  assert.equal(lastRes(room).active, "grapnel");
});

test("Grapnel reel: drag an enemy within 8\" into base contact and lock it", () => {
  const room = table({ equipment: "servo-actuators", equipmentUpgrade: "grapnel-launcher" }, {}, { Red: [17, 10, 180] });
  const gold = turn(room, "Gold");
  const red = findRig(room, "Red");
  act(room, "Gold", { action: "jumpjets", mode: "reel", target: "Blue" });
  assert.match(lastRejectionReason(), /8"|range|arc/i);
  act(room, "Gold", { action: "jumpjets", mode: "reel", target: "Red" });
  const gap = Math.hypot(red.pos.x - gold.pos.x, red.pos.y - gold.pos.y) - 1.18 - 1.48;
  assert.ok(gap >= 0 && gap < 0.3, `gap ${gap}`);
  assert.equal(gold.engagedWith, red.id);
  assert.equal(red.engagedWith, gold.id);
  const res = lastRes(room);
  assert.equal(res.active, "grapnel");
  assert.equal(res.victims[0], red.id);
});

test("Heat Purge Wave scalds every enemy within 3\"", () => {
  const room = table({ equipment: "blast-furnace-core" }, {}, { Red: [14, 10, 180] });
  const gold = turn(room, "Gold");
  gold.engine.heat = 7;
  const red = findRig(room, "Red");
  const blue = findRig(room, "Blue");
  act(room, "Gold", { action: "heatpurgewave" });
  assert.equal(gold.engine.heat, 6);
  assert.equal(red.engine.heat, 2);
  assert.equal(blue.engine.heat, 0);
  const res = room.game.resolutions.find((r) => r.active === "heatpurgewave");
  assert.deepEqual(res.victims, [red.id]);
});

test("meltdown burst heats every enemy within 4\"", () => {
  const room = table({ equipment: "blast-furnace-core", equipmentUpgrade: "meltdown-protocol" }, {}, { Red: [15, 10, 180] });
  const gold = turn(room, "Gold");
  gold.equipState.meltdownCharge = 3;
  act(room, "Gold", { action: "meltdown", n: 2, mode: "burst" });
  assert.equal(findRig(room, "Red").engine.heat, 2);
  assert.equal(findRig(room, "Blue").engine.heat, 0);
  assert.equal(gold.equipState.meltdownCharge, 1);
  assert.deepEqual(lastRes(room).victims, [findRig(room, "Red").id]);
});

test("Nanite Swarm reaches only an ally within 3\"", () => {
  const room = table({ equipment: "field-repair-suite", equipmentUpgrade: "nanite-swarm" });
  turn(room, "Gold");
  act(room, "Gold", { action: "nanite", target: "Copper", loc: "hull" });
  assert.match(lastRejectionReason(), /3"|reach/i);
  findRig(room, "Copper").pos = { x: 10, y: 14 };
  act(room, "Gold", { action: "nanite", target: "Copper", loc: "hull" });
  assert.equal(findRig(room, "Copper").equipState.naniteStacks.length, 1);
  assert.equal(lastRes(room).active, "nanite");
});

test("Chaff Burst side-steps a smoked target out of the shot", () => {
  const room = table({}, { equipment: "reactive-plating", equipmentUpgrade: "chaff-burst" }, { Red: [24, 10, 180] });
  // A wall right beside the line of fire: any side-step puts Red behind it.
  room.field.terrain = [{ kind: "building", x: 20, y: 12.2, w: 4, h: 1, rot: 0 }, { kind: "building", x: 20, y: 7.8, w: 4, h: 1, rot: 0 }];
  const red = findRig(room, "Red");
  red.smokeNextActivation = true;
  const before = { ...red.pos };
  turn(room, "Gold");
  act(room, "Gold", { action: "fire", target: "Red", weapon: "longRange" });
  assert.notDeepEqual(red.pos, before);
  const chaff = room.game.resolutions.find((r) => r.chaff);
  assert.ok(chaff, "chaff resolution");
  assert.deepEqual(chaff.chaff.from, before);
});

test("every equipment resolution names its active", () => {
  for (const [equipment, action] of [["ablative-plating", "harden"], ["radiator-array", "purge"], ["overclock-core", "overclock"],
    ["field-repair-suite", "emergencypatch"], ["targeting-computer", "locksight"], ["reactive-plating", "popsmoke"]]) {
    const room = table({ equipment });
    turn(room, "Gold");
    act(room, "Gold", { action, loc: "hull" });
    assert.equal(lastRes(room).active, action, `${equipment}: ${lastRejectionReason()}`);
  }
});

test("Chaff Burst loses the shot when the side-step breaks reach", () => {
  const room = table({}, { equipment: "reactive-plating", equipmentUpgrade: "chaff-burst" }, { Red: [12.8, 10, 180] });
  const red = findRig(room, "Red");
  red.smokeNextActivation = true;
  red.speed = 8; // a 4" step clears the Claw's 2" reach
  const gold = turn(room, "Gold");
  const hp = ["hull", "arms", "legs", "engine"].map((l) => red[l].sp);
  act(room, "Gold", { action: "fire", target: "Red", weapon: "melee" });
  const chaff = room.game.resolutions.find((r) => r.chaff);
  assert.ok(chaff?.chaff.lost, lastRejectionReason());
  assert.deepEqual(["hull", "arms", "legs", "engine"].map((l) => red[l].sp), hp);
  assert.equal(room.game.turn.actionsUsed, 1);
  assert.ok(gold.engine.heat >= 1);
});

test("Point-Defense and Ablative Cascade spends ride on the attack resolution", () => {
  const room = table({}, { equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade" }, { Red: [16, 10, 180] });
  const red = findRig(room, "Red");
  red.equipState.ablativeCharges = 2;
  turn(room, "Gold");
  for (let i = 0; i < 6 && !room.game.resolutions.some((r) => r.defense); i++) {
    room.game.turn.actionsUsed = 0;
    findRig(room, "Gold").loaded.longRange = true;
    red.equipState.ablativeCharges = 2;
    act(room, "Gold", { action: "fire", target: "Red", weapon: "longRange" });
  }
  const res = room.game.resolutions.find((r) => r.defense);
  assert.ok(res, "some volley should draw an ablative charge");
  assert.ok(res.defense.ablative >= 1);
  assert.equal(red._defenseTally, undefined);
});

test("Overclock flags the rig until its activation ends", () => {
  const room = table({ equipment: "overclock-core" });
  const gold = turn(room, "Gold");
  act(room, "Gold", { action: "overclock" });
  assert.equal(gold.overclocked, true);
  applyCommand(room, { verb: "endactivation", attrs: { name: "Gold" } }, { side: "a" });
  assert.equal(gold.overclocked, false);
});
