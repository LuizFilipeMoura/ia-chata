// Natural area weapons: Mortar, Missile Barrage and Flamethrower carry a
// `splash` on their base profile. Every shot also catches every OTHER rig
// (friend or foe) whose base lies within the splash radius of the target.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, claimSide, applyCommand, findRig, WEAPONS, LOCS } from "./game-state.js";

const hi = () => 0.999;   // every die rolls its top face

function setup(longRange, melee = "Sword", mode = "digital") {
  const room = createRoom("SPL01");
  room.mode = mode;
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  const add = (name, owner, lr = "Autocannon", m = "Claw") =>
    applyCommand(room, { verb: "add", attrs: { name, class: "medium", owner, longRange: lr, melee: m } });
  add("Gun", "a", longRange, melee);
  add("Pal", "a", "Rivet Gun", "Chainsaw");
  add("Foe", "b", "Sniper Cannon", "Talon");
  add("Near", "b", "Crossbow", "Anchor");
  add("Far", "b", "Harpoon", "Wrecking Ball");
  const at = (n, x, y, f) => Object.assign(findRig(room, n), { pos: { x, y }, facing: f });
  at("Gun", 10, 18, 0); at("Foe", 26, 18, 180); at("Near", 26, 21, 180); at("Pal", 26, 15, 180); at("Far", 26, 28, 180);
  room.field.terrain = [];
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: findRig(room, "Gun").id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  for (const r of room.rigs) r.loaded = { longRange: true, melee: true };
  return room;
}
const spOf = (r) => LOCS.reduce((s, l) => s + r[l].sp, 0);

test("the three area weapons carry a splash", () => {
  assert.ok(WEAPONS.longRange["Mortar"].splash?.radius > 0);
  assert.ok(WEAPONS.longRange["Missile Barrage"].splash?.radius > 0);
  assert.ok(WEAPONS.melee["Flamethrower"].splash?.radius > 0);
  assert.equal(WEAPONS.longRange["Autocannon"].splash, undefined);
});

test("a Mortar shell splashes every other rig by the target, friend or foe, and not the far one", () => {
  const room = setup("Mortar", "Lance");
  const before = Object.fromEntries(room.rigs.map((r) => [r.name, spOf(r)]));
  applyCommand(room, { verb: "action", attrs: { name: "Gun", action: "fire", weapon: "longRange", target: "Foe" } }, { side: "a" }, { random: hi });
  const splashed = room.game.resolutions.filter((r) => r.kind === "splash").map((r) => room.rigs.find((x) => x.id === r.rigId).name);
  assert.deepEqual(splashed.sort(), ["Near", "Pal"]);
  assert.ok(spOf(findRig(room, "Near")) < before.Near, "the enemy bystander is hurt");
  assert.ok(spOf(findRig(room, "Pal")) < before.Pal, "friendly fire is real");
  assert.equal(spOf(findRig(room, "Far")), before.Far);
  assert.equal(spOf(findRig(room, "Gun")), before.Gun);
});

test("a Flamethrower wash heats the rigs around its target instead of wounding them", () => {
  const room = setup("Autocannon", "Flamethrower");
  const gun = findRig(room, "Gun");
  gun.pos = { x: 23, y: 18 };                                // touching Foe
  const near = findRig(room, "Near"), heat0 = near.engine.heat;
  applyCommand(room, { verb: "action", attrs: { name: "Gun", action: "fire", weapon: "melee", target: "Foe" } }, { side: "a" }, { random: hi });
  assert.ok(near.engine.heat > heat0, "the flames wash over the bystander");
  assert.equal(gun.engine.heat >= 1, true);
  assert.ok(!room.game.resolutions.some((r) => r.kind === "splash" && r.rigId === gun.id), "never the wielder");
});

test("physical rooms narrate the splash for the players to resolve", () => {
  const room = setup("Mortar", "Lance", "physical");
  applyCommand(room, { verb: "action", attrs: { name: "Gun", action: "fire", weapon: "longRange", target: "Foe", arc: "front", distance: 16, cover: 0 } }, { side: "a" }, { random: hi });
  const line = room.game.resolutions.find((r) => r.kind === "splash");
  assert.ok(line && /within 2"/.test(line.summary), line?.summary);
});

test("the bot prices splash: enemies by the target raise a shot's worth, friends lower it", async () => {
  const { scoreParts } = await import("./bot/score.js");
  const room = setup("Mortar", "Lance");
  const gun = findRig(room, "Gun");
  const cand = { action: "fire", weapon: "longRange", target: "Foe", arc: "front", distance: 16, cover: 0 };
  const both = scoreParts(room, gun, cand).damage;           // Near (enemy) + Pal (friend)
  findRig(room, "Pal").pos = { x: 40, y: 5 };
  const enemyOnly = scoreParts(room, gun, cand).damage;
  findRig(room, "Near").pos = { x: 40, y: 30 };
  const alone = scoreParts(room, gun, cand).damage;
  assert.ok(enemyOnly > alone, "a second enemy in the blast is worth more");
  assert.ok(both < enemyOnly, "a friend in the blast costs");
});
