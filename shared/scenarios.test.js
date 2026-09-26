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

test("arcs: the dummy starts outside your front arc; from behind, you hit its rear", () => {
  const room = build("arcs");
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  assert.ok(!kinds(room).includes("attack"));
  room.rigs[0].facing = 0;
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
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

test("front arc (§7): a target behind the attacker can't be shot; face it and you can", () => {
  const room = build("fire");
  room.rigs[0].facing = 180; // Copper turns its back on the dummy
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  assert.ok(!kinds(room).includes("attack"));
  assert.match(lastRejectionReason(room) || "", /front arc/i);
  act(room, { action: "aimed", weapon: "longRange", target: "Dummy", loc: "hull" });
  assert.ok(!kinds(room).includes("attack"));
  room.rigs[0].facing = 40; // 40 deg off: still inside the 90 deg front arc
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  assert.ok(kinds(room).includes("attack"));
});

test("front arc applies to melee too", () => {
  const room = build("melee");
  room.rigs[0].facing = 90;
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "fire", weapon: "melee", target: "Dummy" });
  assert.ok(!kinds(room).includes("attack"));
});

test("anatomy: the dummy's engine starts on 2 SP; an Aimed Shot can target it; a kill doesn't end the game", () => {
  const room = build("anatomy");
  const dummy = room.rigs.find((r) => r.name === "Dummy");
  assert.equal(dummy.engine.sp, 2);
  dummy.destroyed = true;
  assert.ok(room.rigs.some((r) => r.owner === "b" && !r.destroyed));
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "aimed", weapon: "longRange", target: "Dummy", loc: "engine" });
  assert.ok(kinds(room).includes("attack"), lastRejectionReason(room));
});

test("cover: the barricade gives cover from the start; a clear angle has none; the building blocks sight", async () => {
  const { deriveAttackGeometry } = await import("./game-state.js");
  const room = build("cover");
  const [me, dummy] = room.rigs;
  const start = deriveAttackGeometry(room, me, dummy);
  assert.ok(start.los);
  assert.ok(start.cover > 0, `cover ${start.cover}`);
  me.pos = { x: 14, y: 25 }; me.facing = Math.atan2(18 - 25, 22 - 14) * 180 / Math.PI;
  assert.equal(deriveAttackGeometry(room, me, dummy).cover, 0);
  me.pos = { x: 16, y: 3 }; me.facing = Math.atan2(18 - 3, 22 - 16) * 180 / Math.PI;
  dummy.pos = { x: 16, y: 15 };
  assert.equal(deriveAttackGeometry(room, me, dummy).los, false);
});

test("keywords: Raking Fire can't wound the dummy's front; from its rear it wounds", () => {
  const room = build("keywords");
  assert.equal(room.rigs[0].weaponUpgrades.longRange, "suppressive-fire");
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  const front = room.game.resolutions.at(-1).breakdown;
  assert.equal(front.sp, 0);
  assert.match(front.steps.find((s) => s.kind === "wound").out, /raking|no hits/);
  const rear = build("keywords");
  rear.rigs[0].pos = { x: 31, y: 18 }; rear.rigs[0].facing = 180;
  applyCommand(rear, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(rear, { action: "fire", weapon: "longRange", target: "Dummy" });
  assert.ok(kinds(rear).includes("attack"), lastRejectionReason(rear));
});

test("prototype: the belt starts on 2, so the first volley is a Penetrator shot (every hit wounds)", () => {
  const room = build("prototype");
  assert.equal(room.rigs[0].weaponUpgrades.longRange, "penetrator-rounds");
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  const b = room.game.resolutions.filter((r) => r.kind === "attack").at(-1).breakdown;
  const hits = b.steps.find((s) => s.kind === "hit").dice.filter((d) => d.ok).length;
  const wound = b.steps.find((s) => s.kind === "wound");
  if (hits) assert.equal(wound.dice.filter((d) => d.ok).length, hits, JSON.stringify(wound));
  assert.equal(room.rigs[0].autocannonSlowNext, true);
});

// A lesson that asks you to flank must be doable in ONE activation by a
// beginner: one Move (or Sprint) that ends on the dummy's side, facing it
// within the ±90° a move allows, then a shot that lands on the side arc.
const arcHit = (room) => JSON.stringify(room.game.resolutions.filter((r) => r.kind === "attack").at(-1)?.breakdown || {});
const faceFrom = (from, to) => Math.round(Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI);

test("arcs: a single Move reaches the dummy's side, and the shot lands on the side arc", () => {
  const room = build("arcs");
  const me = room.rigs.find((r) => r.name === "Copper"), dummy = room.rigs.find((r) => r.name === "Dummy");
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  const dest = { x: 22.5, y: 12.5 };
  act(room, { action: "move", dest, facing: faceFrom(dest, dummy.pos) });
  assert.deepEqual(me.pos, dest, lastRejectionReason());
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  assert.match(arcHit(room), /side arc/, lastRejectionReason());
});

test("keywords: after the front shot, one Sprint reaches the side and the Mini Gun rakes it", () => {
  const room = build("keywords");
  const me = room.rigs.find((r) => r.name === "Copper"), dummy = room.rigs.find((r) => r.name === "Dummy");
  applyCommand(room, { verb: "activate", attrs: { name: "Copper" } }, { side: "a" });
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  assert.match(arcHit(room), /front|raking/i);
  act(room, { action: "reload" });
  const dest = { x: 24, y: 24 };
  act(room, { action: "sprint", dest, facing: faceFrom(dest, dummy.pos) });
  assert.deepEqual(me.pos, dest, lastRejectionReason());
  act(room, { action: "fire", weapon: "longRange", target: "Dummy" });
  assert.match(arcHit(room), /side arc/, lastRejectionReason());
});
