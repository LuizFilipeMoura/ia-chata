// Brass (Steam Cannon / Piston Hammer), Ivory (Flare Launcher / Bayonet) and
// Jade (Tesla Coil / Shock Glove): the pusher, the spotter and the short-range
// controller. Digital rooms measure the spatial parts (shove, flare burst,
// chain); physical rooms get the instruction.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, claimSide, applyCommand, findRig, CHASSIS, WEAPONS, WEAPON_UPGRADES, LOCS,
} from "./game-state.js";
import { computePen, effectiveRof } from "./combat.js";

const HI = { random: () => 0.999 };              // every die rolls its top face
const spOf = (r) => LOCS.reduce((s, l) => s + r[l].sp, 0);

const kit = (id) => { const c = CHASSIS.find((x) => x.id === id); return { chassis: id, class: c.class, longRange: c.longRange, melee: c.melee }; };

function table(atkChassis, atkUps = {}, others = {}) {
  const room = createRoom("NEW01");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Atk", owner: "a", ...kit(atkChassis), ...atkUps } });
  applyCommand(room, { verb: "add", attrs: { name: "Foe", owner: "b", ...kit("medium-sniper-chainsaw") } });
  for (const [name, [owner, chassis]] of Object.entries(others)) applyCommand(room, { verb: "add", attrs: { name, owner, ...kit(chassis) } });
  room.field.terrain = [];
  room.game.phase = "activation";
  const atk = findRig(room, "Atk");
  room.game.turn = { side: "a", activeRigId: atk.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  for (const r of room.rigs) { r.loaded = { longRange: true, melee: true }; r.facing = r.owner === "a" ? 0 : 180; }
  atk.pos = { x: 10, y: 18 };
  findRig(room, "Foe").pos = { x: 16, y: 18 };
  return { room, atk, foe: findRig(room, "Foe") };
}
const fire = (room, weapon, target = "Foe") => applyCommand(room, { verb: "action", attrs: { name: "Atk", action: "fire", weapon, target } }, { side: "a" }, HI);

test("three new mediums, each with two new, globally unique weapons and three upgrades apiece", () => {
  for (const [id, lr, melee] of [["medium-steam-piston", "Steam Cannon", "Piston Hammer"], ["medium-flare-bayonet", "Flare Launcher", "Bayonet"], ["medium-tesla-shockglove", "Tesla Coil", "Shock Glove"]]) {
    const c = CHASSIS.find((x) => x.id === id);
    assert.ok(c, id);
    assert.equal(c.class, "medium");
    assert.equal(c.longRange, lr); assert.equal(c.melee, melee);
    assert.ok(WEAPONS.longRange[lr] && WEAPONS.melee[melee]);
    for (const w of [lr, melee]) assert.deepEqual(WEAPON_UPGRADES[w].map((u) => u.nature).sort(), ["field", "prototype", "tuned"]);
    assert.equal(CHASSIS.filter((x) => x.longRange === lr || x.melee === melee).length, 1, "no other rig carries them");
  }
});

test("Steam Cannon: a hit shoves the target 2\" straight back", () => {
  const { room, foe } = table("medium-steam-piston", { longRangeUpgrade: "flush-them-out" });
  fire(room, "longRange");
  assert.ok(Math.abs(foe.pos.x - 18) < 0.05 && Math.abs(foe.pos.y - 18) < 0.05, JSON.stringify(foe.pos));
});

test("Steam Cannon: a shove into terrain stops short and slams for +1 SP", () => {
  const { room, foe } = table("medium-steam-piston");
  room.field.terrain = [{ kind: "rock", shape: "rect", x: 18.5, y: 18, w: 1, h: 4, rot: 0 }];
  const before = spOf(foe);
  fire(room, "longRange");
  assert.ok(foe.pos.x < 17.2, `stopped at the rock: ${foe.pos.x}`);
  assert.ok(room.game.resolutions.some((r) => r.kind === "shove" && /slam/i.test(r.summary)));
  assert.ok(spOf(foe) < before);
});

test("Steam Cannon upgrades: High-Pressure Valve shoves 3\", Flush Them Out +2 Pen vs cover", () => {
  const { room, foe } = table("medium-steam-piston", { longRangeUpgrade: "high-pressure-valve" });
  fire(room, "longRange");
  assert.ok(Math.abs(foe.pos.x - 19) < 0.05, JSON.stringify(foe.pos));
  const p = { ...WEAPONS.longRange["Steam Cannon"], perks: [], upgradeEffect: { vsCover: 2 } };
  assert.equal(computePen({ weightClass: "medium" }, p, { cover: 1 }) - computePen({ weightClass: "medium" }, p, { cover: 0 }), 2);
});

test("Piston Hammer Pressure Dump: +1 Pen per 2 heat (max 3), vents it, roots the rig", () => {
  const { room, atk, foe } = table("medium-steam-piston", { meleeUpgrade: "pressure-dump" });
  const p = { ...WEAPONS.melee["Piston Hammer"], perks: [], upgradeEffect: { pressureDump: true } };
  assert.equal(computePen({ weightClass: "medium", engine: { heat: 5 } }, p, {}) - computePen({ weightClass: "medium", engine: { heat: 0 } }, p, {}), 2);
  assert.equal(computePen({ weightClass: "medium", engine: { heat: 9 } }, p, {}) - computePen({ weightClass: "medium", engine: { heat: 0 } }, p, {}), 3);
  foe.pos = { x: 12.97, y: 18 };
  atk.engine.heat = 4;
  fire(room, "melee");
  assert.equal(atk.engine.heat, 1, "vented (the strike's own heat stays)");
  applyCommand(room, { verb: "action", attrs: { name: "Atk", action: "move", dest: { x: 9, y: 18 }, facing: 0 } }, { side: "a" });
  assert.deepEqual(atk.pos, { x: 10, y: 18 }, "rooted for the rest of the activation");
});

test("Flare Launcher: a hit marks the target for your side (Wide Burst marks its neighbours too)", () => {
  const { room, atk, foe } = table("medium-flare-bayonet", { longRangeUpgrade: "wide-burst" }, { Near: ["b", "light-claw-autocannon"] });
  foe.pos = { x: 22, y: 18 };
  findRig(room, "Near").pos = { x: 22, y: 20.6 };
  fire(room, "longRange");
  assert.equal(foe.painted?.by, "a");
  assert.equal(foe.painted?.painterId, atk.id);
  assert.equal(findRig(room, "Near").painted?.by, "a", "the burst catches the neighbour");
});

test("Flare Launcher Star Shell: marks everything within 4\", and marks you for the enemy", () => {
  const { room, atk, foe } = table("medium-flare-bayonet", { longRangeUpgrade: "star-shell" }, { Near: ["b", "light-claw-autocannon"] });
  foe.pos = { x: 22, y: 18 };
  findRig(room, "Near").pos = { x: 22, y: 21.5 };
  fire(room, "longRange");
  assert.equal(findRig(room, "Near").painted?.by, "a");
  assert.equal(atk.painted?.by, "b", "lit up yourself");
});

test("Bayonet: Spotter's Thrust +2 Pen vs a marked target", () => {
  const p = { ...WEAPONS.melee["Bayonet"], perks: [], upgradeEffect: { vsPainted: 2 } };
  const me = { weightClass: "medium", owner: "a" };
  assert.equal(computePen(me, p, { target: { painted: { by: "a" } } }) - computePen(me, p, { target: {} }), 2);
});

test("Tesla Coil: a hit arcs to the nearest other rig within 3\" of the target, friend or foe", () => {
  const { room, foe } = table("medium-tesla-shockglove", {}, { Near: ["b", "light-claw-autocannon"], Far: ["b", "light-harpoon-anchor"] });
  foe.pos = { x: 16, y: 18 };
  findRig(room, "Near").pos = { x: 16, y: 21 };
  findRig(room, "Far").pos = { x: 16, y: 26 };
  fire(room, "longRange");
  const chain = room.game.resolutions.filter((r) => r.kind === "chain");
  assert.equal(chain.length, 1);
  assert.equal(chain[0].rigId, findRig(room, "Near").id);
});

test("Tesla Coil Overload: +1 die per 2 heat (max 3), 1 SP to your own boiler per shot", () => {
  const p = { ...WEAPONS.longRange["Tesla Coil"], perks: [], upgradeEffect: { overload: true } };
  assert.equal(effectiveRof({ weightClass: "medium", engine: { heat: 4 } }, p, {}), p.rof + 2);
  assert.equal(effectiveRof({ weightClass: "medium", engine: { heat: 12 } }, p, {}), p.rof + 3);
  const { room, atk } = table("medium-tesla-shockglove", { longRangeUpgrade: "overload" });
  const eng = atk.engine.sp;
  fire(room, "longRange");
  assert.equal(atk.engine.sp, eng - 1);
});

test("Shock Glove: every hit adds heat to the target (Live Wire: +1 more)", () => {
  const { room, atk, foe } = table("medium-tesla-shockglove", { meleeUpgrade: "live-wire" });
  foe.pos = { x: 12.97, y: 18 };
  const h0 = foe.engine.heat;
  fire(room, "melee");
  const hits = room.game.resolutions.filter((r) => r.kind === "attack").at(-1).breakdown.steps.find((s) => s.kind === "hit").dice.filter((d) => d.ok).length;
  assert.equal(foe.engine.heat - h0, hits * 2);
  assert.ok(atk);
});

test("Shock Glove Discharge: a hit moves 2 of your heat onto the target and shorts your arm", () => {
  const { room, atk, foe } = table("medium-tesla-shockglove", { meleeUpgrade: "discharge" });
  foe.pos = { x: 12.97, y: 18 };
  atk.engine.heat = 4;
  const arms = atk.arms.sp, h0 = foe.engine.heat;
  fire(room, "melee");
  assert.ok(foe.engine.heat >= h0 + 2);
  assert.equal(atk.arms.sp, arms - 1);
});

test("physical rooms narrate the shove and the chain", () => {
  const { room } = table("medium-steam-piston", { longRangeUpgrade: "flush-them-out" });
  room.mode = "physical";
  applyCommand(room, { verb: "action", attrs: { name: "Atk", action: "fire", weapon: "longRange", target: "Foe", arc: "front", distance: 6, cover: 0 } }, { side: "a" }, HI);
  assert.ok(room.game.resolutions.some((r) => r.kind === "shove" && /2"/.test(r.summary)));
});
