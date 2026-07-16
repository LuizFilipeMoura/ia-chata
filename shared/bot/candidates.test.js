import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatesFor } from "./candidates.js";
import { createRoom, claimSide, applyCommand, findRig } from "../game-state.js";

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
  // Atk at (10,10) facing east (0); Foe 12in dead ahead — in band, in front, LOS clear.
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
