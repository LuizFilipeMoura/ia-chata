import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, claimSide, applyCommand, CHASSIS } from "../game-state.js";
import { chooseAction } from "./index.js";
import { PRESETS, TIERS } from "./score.js";
import { META } from "./meta.js";
import { playMatch, mulberry32 } from "../sim/match.js";
import { tierSquad } from "../sim/tiers.js";

// Human commissions one medium + one light, flags side B as a bot of `tier`, readies.
function vsBot(tier) {
  const room = createRoom("TIER");
  claimSide(room, { name: "A", side: "a" });
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: tier } }, { side: "a" });
  for (const id of ["medium-lance-mortar", "light-claw-autocannon"]) {
    const ch = CHASSIS.find((c) => c.id === id);
    applyCommand(room, { verb: "add", attrs: { name: ch.name, kind: "rig", owner: "a", chassis: id, class: ch.class, longRange: ch.longRange, melee: ch.melee, sp: ch.sp } }, { side: "a" });
  }
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "a" }, { random: mulberry32(3) });
  return room;
}

test("difficulty tiers are real bot presets and start a digital game", () => {
  for (const tier of ["easy", "normal", "hard"]) {
    const room = vsBot(tier);
    assert.equal(room.mode, "digital");
    assert.equal(room.game.started, true, `${tier} game started`);
    const bots = room.rigs.filter((r) => r.owner === "b");
    assert.equal(bots.length, 2);
    assert.deepEqual(bots.map((r) => r.weightClass).sort(), ["light", "medium"], "bot mirrors weight classes");
  }
});

test("an Easy bot fields bare rigs; a Hard bot fields the GA meta's builds", () => {
  const easy = vsBot("easy").rigs.filter((r) => r.owner === "b");
  assert.ok(easy.every((r) => r.equipment == null), "easy has no equipment");
  const saved = structuredClone(META);
  try {
    const medium = CHASSIS.find((c) => c.class === "medium" && c.id !== "medium-lance-mortar");
    const light = CHASSIS.find((c) => c.class === "light" && c.id !== "light-claw-autocannon");
    META.chassisRank = [medium.id, light.id];
    META.builds = { [medium.id]: { equipment: "radiator-array", equipmentUpgrade: null } };
    const hard = vsBot("hard").rigs.filter((r) => r.owner === "b");
    const hm = hard.find((r) => r.weightClass === "medium");
    assert.equal(hm.chassis, medium.id, "hard takes the top-ranked chassis");
    assert.equal(hm.equipment, "radiator-array", "with its meta build");
    assert.equal(hard.find((r) => r.weightClass === "light").chassis, light.id);
  } finally {
    Object.keys(META).forEach((k) => delete META[k]);
    Object.assign(META, saved);
  }
});

test("blunder noise is seeded: same seed, same (sometimes non-argmax) choices", () => {
  const squads = { a: tierSquad("easy", [], mulberry32(1)), b: null };
  squads.b = tierSquad("normal", squads.a.map((u) => u.chassis), mulberry32(2));
  const r1 = playMatch({ squads, weights: { a: "easy", b: "normal" }, seed: 9 });
  const r2 = playMatch({ squads, weights: { a: "easy", b: "normal" }, seed: 9 });
  assert.deepEqual([r1.winner, r1.vp], [r2.winner, r2.vp]);
  assert.ok(TIERS.easy.blunder > TIERS.normal.blunder && TIERS.hard.blunder === 0);
});

test("chooseAction returns null for a rig that isn't holding the floor", () => {
  const room = vsBot("normal");
  const rig = room.rigs.find((r) => r.owner === "a");
  room.game.turn = { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 3 };
  assert.equal(chooseAction(room, rig, PRESETS.normal), null);
});
