// Walkers in the digital (3D) game: the player's support walker (Weld / Vent /
// Paint within reach) and the enemy's drone waves (Hunter / Sapper / Spotter).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, claimSide, applyCommand, findRig, CHASSIS, DRONE_TYPES, makeUnit, lastRejectionReason,
  templateById, SUPPORT_REACH,
} from "./game-state.js";
import { radiusOf, BASE_RADIUS } from "./geometry.js";

const HI = { random: () => 0.999 };
const kit = (id) => { const c = CHASSIS.find((x) => x.id === id); return { kind: "rig", chassis: id, class: c.class, longRange: c.longRange, melee: c.melee }; };

function table() {
  const room = createRoom("WLK01");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Ally", owner: "a", ...kit("medium-sniper-chainsaw") } });
  applyCommand(room, { verb: "add", attrs: { name: "Foe", owner: "b", ...kit("light-claw-autocannon") } });
  room.field.terrain = [];
  room.game.phase = "activation";
  room.game.started = true;
  for (const r of room.rigs) { r.loaded = { longRange: true, melee: true }; r.facing = r.owner === "a" ? 0 : 180; }
  findRig(room, "Ally").pos = { x: 10, y: 18 };
  findRig(room, "Foe").pos = { x: 24, y: 18 };
  return room;
}
const activate = (room, name) => {
  const r = findRig(room, name);
  room.game.turn = { side: r.owner, activeRigId: r.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  return r;
};
const act = (room, name, attrs, opts = HI) => applyCommand(room, { verb: "action", attrs: { name, ...attrs } }, { side: findRig(room, name).owner }, opts);

test("digital battles field walkers and drones, never tanks", () => {
  const room = table();
  applyCommand(room, { verb: "add", attrs: { name: "Medic", owner: "a", kind: "walker", modules: ["repair", "recon"], template: "medic-walker" } });
  assert.equal(findRig(room, "Medic")?.kind, "walker");
  assert.equal(findRig(room, "Medic").template, "medic-walker");
  applyCommand(room, { verb: "add", attrs: { name: "Hunter", owner: "b", kind: "drone", drone: "hunter" } });
  assert.equal(findRig(room, "Hunter")?.weapons.unit, "Drone Carbine");
  applyCommand(room, { verb: "add", attrs: { name: "Tanky", owner: "b", kind: "tank", unit: "Tank Cannon" } });
  assert.equal(findRig(room, "Tanky"), null);
  assert.match(lastRejectionReason(), /Tank/);
});

test("drones: three types, small bases, 2 actions, a small Integrity pool", () => {
  for (const id of Object.keys(DRONE_TYPES)) {
    const d = makeUnit("drone", 1, "D", "b", { drone: id });
    assert.ok(d, id);
    assert.equal(d.drone, id);
    assert.equal(d.weapons.unit, DRONE_TYPES[id].unit);
    assert.ok(radiusOf(d) < BASE_RADIUS.light);
    assert.ok(d.integrityMax <= 8, `${id} integrity ${d.integrityMax}`);
  }
  assert.deepEqual(makeUnit("drone", 1, "S", "b", { drone: "spotter" }).modules, ["recon"]);
  assert.equal(makeUnit("drone", 1, "X", "b", { drone: "nope" }), null);
});

test("a walker's gun fires through the normal Fire action in a digital room", () => {
  const room = table();
  applyCommand(room, { verb: "add", attrs: { name: "Gunner", owner: "a", kind: "walker", unit: "Autocannon Mount", modules: ["damage", "coolant"] } });
  const g = findRig(room, "Gunner");
  g.pos = { x: 14, y: 18 }; g.facing = 0; g.loaded = { unit: true };
  activate(room, "Gunner");
  act(room, "Gunner", { action: "fire", weapon: "longRange", target: "Foe" });
  assert.ok(room.game.resolutions.some((r) => r.kind === "attack" && /Autocannon Mount/.test(r.summary)), lastRejectionReason());
});

test("Sapper: the Demo Charge blasts everything within 2.5\" and takes the drone with it, no VP for anyone", () => {
  const room = table();
  applyCommand(room, { verb: "add", attrs: { name: "Sapper", owner: "b", kind: "drone", drone: "sapper" } });
  const sap = findRig(room, "Sapper"), ally = findRig(room, "Ally");
  sap.pos = { x: 12.4, y: 18 }; sap.facing = 180;
  applyCommand(room, { verb: "add", attrs: { name: "Buddy", owner: "a", kind: "walker", modules: ["repair", "recon"] } });
  const buddy = findRig(room, "Buddy");
  buddy.pos = { x: 12.4, y: 20.4 };
  const vp = room.game.sides.map((s) => s.vp);
  const b0 = buddy.integrity;
  activate(room, "Sapper");
  act(room, "Sapper", { action: "fire", target: "Ally" });
  assert.equal(sap.destroyed, true, lastRejectionReason());
  assert.ok(room.game.resolutions.some((r) => r.kind === "detonate"));
  assert.ok(buddy.integrity < b0, "the blast catches the walker next door");
  assert.deepEqual(room.game.sides.map((s) => s.vp), vp, "a drone going up scores nothing");
  assert.ok(ally);
});

test("drones don't keep a side alive: the last rig falls, the drones don't matter", () => {
  const room = table();
  applyCommand(room, { verb: "add", attrs: { name: "Hunter", owner: "b", kind: "drone", drone: "hunter" } });
  findRig(room, "Hunter").pos = { x: 30, y: 10 };
  applyCommand(room, { verb: "set", attrs: { name: "Foe", loc: "integrity", sp: "1" } });
  applyCommand(room, { verb: "damage", attrs: { name: "Foe", loc: "hull", amount: "1" } });
  assert.equal(findRig(room, "Foe").destroyed, true);
  assert.equal(room.game.outcome?.winner, "a");
});

test("Weld / Vent need the walker within 3\" in a digital room; Paint needs sight", () => {
  const room = table();
  applyCommand(room, { verb: "add", attrs: { name: "Medic", owner: "a", kind: "walker", modules: ["repair", "coolant"] } });
  const m = findRig(room, "Medic"), ally = findRig(room, "Ally");
  ally.hull.sp -= 4; ally.engine.heat = 4;
  m.pos = { x: 10, y: 26 }; // 8" away
  activate(room, "Medic");
  act(room, "Medic", { action: "fieldweld", target: "Ally", loc: "hull" });
  assert.match(lastRejectionReason() || "", /reach/);
  m.pos = { x: 10, y: 18 + radiusOf(ally) + radiusOf(m) + SUPPORT_REACH - 0.2 };
  act(room, "Medic", { action: "fieldweld", target: "Ally", loc: "hull" });
  assert.ok(room.game.resolutions.some((r) => r.kind === "fieldweld"));
  act(room, "Medic", { action: "vent", target: "Ally" });
  assert.equal(ally.engine.heat, 2);
});

test("campaign missions: a support walker rides with the squad, drone waves land on their round", () => {
  const room = createRoom("WLK02");
  const u = (id) => ({ chassis: id });
  applyCommand(room, { verb: "mission", attrs: {
    type: "skirmish", seed: 7, width: 42, height: 28,
    squads: { a: [u("medium-lance-mortar"), u("light-claw-autocannon")], b: [u("medium-sniper-chainsaw"), u("light-sword-arc")] },
    support: [{ template: "medic-walker" }],
    drones: [{ round: 1, type: "hunter", count: 1 }, { round: 2, type: "sapper", count: 2 }],
  } }, { side: "a" }, { random: () => 0.3 });
  assert.equal(lastRejectionReason(), null);
  const walker = room.rigs.find((r) => r.kind === "walker");
  assert.ok(walker?.pos && walker.owner === "a" && walker.template === "medic-walker");
  assert.equal(room.rigs.filter((r) => r.kind === "drone").length, 1, "round-1 drones start on the table");
  assert.equal(room.campaign.reinforcements.filter((x) => x.drone).length, 2);
  assert.ok(templateById("medic-walker"));
});

test("campaign run: the Warlord brings drone waves, a picked walker rides into every mission", async () => {
  const { newRun, offersFor, missionAttrs } = await import("./campaign/run.js");
  const { newProfile } = await import("./campaign/meta.js");
  const { BOSS_STEP } = await import("./campaign/catalog.js");
  const chassis = ["light-claw-autocannon", "light-harpoon-anchor", "medium-lance-mortar"];
  assert.equal(newRun(newProfile(), { chassis, walker: "gun-walker" }, 1).error, "locked-walker");
  const { run } = newRun(newProfile(), { chassis, walker: "medic-walker" }, 1);
  const boss = offersFor({ ...run, step: BOSS_STEP - 1 })[0];
  assert.ok(boss.drones.length >= 3);
  const attrs = missionAttrs(run, boss);
  assert.deepEqual(attrs.support, [{ template: "medic-walker" }]);
  assert.deepEqual(attrs.drones, boss.drones);
  const room = createRoom("WLK03");
  applyCommand(room, { verb: "mission", attrs }, { side: "a" }, { random: () => 0.4 });
  assert.equal(lastRejectionReason(), null);
  assert.ok(room.rigs.some((r) => r.kind === "walker" && r.owner === "a"));
});
