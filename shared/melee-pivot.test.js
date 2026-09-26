// Free pivot for melee in base contact: a rig touching an enemy may strike it
// with its melee weapon even when it is outside the front arc, turning to face
// it for free. Guns still need the front arc.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, claimSide, applyCommand, findRig, lastRejectionReason } from "./game-state.js";
import { candidatesFor } from "./bot/candidates.js";

function setup(foePos) {
  const room = createRoom("PIV01");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Atk", class: "medium", owner: "a", longRange: "Siege Maul", melee: "Bulwark Shield" } });
  applyCommand(room, { verb: "add", attrs: { name: "Foe", class: "medium", owner: "b", longRange: "Sniper Cannon", melee: "Chainsaw" } });
  const atk = findRig(room, "Atk"), foe = findRig(room, "Foe");
  atk.pos = { x: 20, y: 18 }; atk.facing = 180;          // looking west
  foe.pos = { ...foePos }; foe.facing = 180;
  room.field.terrain = [];
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: atk.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  atk.loaded = { longRange: true, melee: true };
  return { room, atk, foe };
}
const fire = (room, weapon) => applyCommand(room, { verb: "action", attrs: { name: "Atk", action: "fire", weapon, target: "Foe" } }, { side: "a" }, { random: () => 0.5 });

test("melee in base contact pivots for free to strike an enemy outside the front arc", () => {
  const { room, atk } = setup({ x: 22.97, y: 18 });      // touching, dead behind (east)
  fire(room, "melee");
  assert.equal(room.game.turn.actionsUsed, 1, lastRejectionReason());
  assert.ok(Math.abs(((atk.facing % 360) + 360) % 360) < 1, `turned to face it: ${atk.facing}`);
});

test("no free pivot when not in base contact, and never for the gun", () => {
  const near = setup({ x: 24, y: 18 });                  // 1" rim gap, behind
  fire(near.room, "melee");
  assert.equal(near.room.game.turn.actionsUsed, 0, "out of contact: still needs the arc");
  const touching = setup({ x: 22.97, y: 18 });
  fire(touching.room, "longRange");
  assert.equal(touching.room.game.turn.actionsUsed, 0, "the gun still needs the front arc");
});

test("the bot is offered the in-contact melee strike behind it", () => {
  const { room, atk } = setup({ x: 22.97, y: 18 });
  const c = candidatesFor(room, atk).filter((x) => x.action === "fire");
  assert.ok(c.some((x) => x.weapon === "melee" && x.target === "Foe"));
  assert.ok(!c.some((x) => x.weapon === "longRange"));
});
