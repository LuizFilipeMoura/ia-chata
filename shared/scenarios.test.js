import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, applyCommand, lastRejectionReason } from "./game-state.js";
import { driveBots } from "./bot/index.js";
import { SCENARIO_IDS } from "./scenarios.js";

const build = (id) => {
  const room = createRoom("TRAIN-" + id);
  applyCommand(room, { verb: "scenario", attrs: { id } });
  return room;
};
const act = (room, attrs) => applyCommand(room, { verb: "action", attrs: { name: "Copper", ...attrs } }, { side: "a" });
const kinds = (room) => room.game.resolutions.map((r) => r.kind);

test("every scenario builds a started digital room with fixed positions", () => {
  for (const id of SCENARIO_IDS) {
    const room = build(id);
    assert.equal(room.game.started, true, id);
    assert.equal(room.mode, "digital");
    assert.equal(room.field.terrain.length, 0);
    assert.ok(room.rigs.every((r) => r.pos && typeof r.facing === "number"));
    assert.equal(room.training, id);
  }
});

test("unknown scenario is rejected", () => {
  const room = createRoom("TRAIN-X");
  applyCommand(room, { verb: "scenario", attrs: { id: "nope" } });
  assert.equal(room.game.started, false);
});

test("fire: the dummy is in the front arc and in range", () => {
  const room = build("fire");
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  assert.ok(kinds(room).includes("attack"), lastRejectionReason(room));
});

test("arcs: shooting from the start hits the dummy's front; from behind, its rear", () => {
  const room = build("arcs");
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  assert.match(room.game.resolutions.at(-1).summary, /Dummy/);
  const flank = build("arcs");
  flank.rigs[0].pos = { x: 34, y: 18 }; flank.rigs[0].facing = 180;
  applyCommand(flank, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(flank, { action: "fire", weapon: "longRange", target: "Dummy" });
  const terms = (r) => JSON.stringify(r.game.resolutions.at(-1).breakdown);
  assert.doesNotMatch(terms(room), /rear/i);
  assert.match(terms(flank), /rear/i);
});

test("melee: the dummy is inside claw reach", () => {
  const room = build("melee");
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "fire", weapon: "melee", target: "Dummy" });
  assert.ok(kinds(room).includes("attack"), lastRejectionReason(room));
});

test("dummy bot ends its turn without acting", () => {
  const room = build("move");
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  applyCommand(room, { verb: "endactivation", attrs: { name: "Copper" } }, { side: "a" });
  driveBots(room);
  const dummy = room.rigs.find((r) => r.name === "Dummy");
  assert.deepEqual(dummy.pos, { x: 48, y: 32 });
  assert.ok(!kinds(room).includes("attack"));
});

test("heat: the rig starts hot and no Answer token outside its lesson", () => {
  const room = build("heat");
  assert.equal(room.rigs[0].engine.heat, 5);
  assert.equal(room.game.pendingAnswer, null);
});

test("reactions: enemy goes first and you hold the Answer token", () => {
  const room = build("reactions");
  assert.equal(room.game.turn.side, "b");
  assert.equal(room.game.pendingAnswer?.side, "a");
});
