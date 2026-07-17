import test from "node:test";
import assert from "node:assert/strict";
import { MODULES, MODULE_IDS, normalizeModules } from "./unit-kinds.js";
import { UNIT_WEAPONS, normalizeUnitWeapon, makeUnit, createRoom, applyCommand, makeRig, SUPPORT_UNITS } from "./game-state.js";

test("MODULES lists the four roles, one action verb each (Damage has none)", () => {
  assert.deepEqual([...MODULE_IDS].sort(), ["coolant", "damage", "recon", "repair"]);
  assert.equal(MODULES.damage.action, null);
  assert.equal(MODULES.repair.action, "fieldweld");
  assert.equal(MODULES.coolant.action, "vent");
  assert.equal(MODULES.recon.action, "paint");
});

test("normalizeModules keeps valid distinct ids, drops junk/dupes, lowercases", () => {
  assert.deepEqual(normalizeModules(["Repair", "recon"]), ["repair", "recon"]);
  assert.deepEqual(normalizeModules(["repair", "repair"]), ["repair"]);
  assert.deepEqual(normalizeModules(["repair", "bogus"]), ["repair"]);
  assert.deepEqual(normalizeModules(["constructor", "__proto__", "repair"]), ["repair"]);
  assert.deepEqual(normalizeModules(["hasOwnProperty"]), []);
  assert.deepEqual(normalizeModules("repair"), []);
  assert.deepEqual(normalizeModules(undefined), []);
});

test("Sidearm is a weak flat-pick ranged weapon in the unit list", () => {
  assert.equal(normalizeUnitWeapon("sidearm"), "Sidearm");
  const s = UNIT_WEAPONS["Sidearm"];
  assert.equal(s.rof, 2);
  assert.equal(s.pen, 3);
  assert.equal(s.flatPick, true);
  assert.equal(s.maxRange, 12);
});

test("Damage module keeps the chosen gun; modules stored canonically", () => {
  const u = makeUnit("tank", 1, "Marksman", "a", { unit: "Tank Cannon", modules: ["damage", "recon"] });
  assert.ok(u);
  assert.equal(u.kind, "tank");
  assert.deepEqual(u.modules, ["damage", "recon"]);
  assert.equal(u.weapons.unit, "Tank Cannon");
  assert.equal(u.painted, null);
});

test("No Damage module falls back to the Sidearm (opts.unit ignored)", () => {
  const u = makeUnit("walker", 2, "Welder", "a", { modules: ["repair", "recon"], unit: "Tank Cannon" });
  assert.ok(u);
  assert.equal(u.weapons.unit, "Sidearm");
  assert.deepEqual(u.modules, ["repair", "recon"]);
});

test("A Damage module can fit a melee unit-weapon (Dozer Blade)", () => {
  const u = makeUnit("tank", 1, "Rammer", "a", { unit: "Dozer Blade", modules: ["damage", "coolant"] });
  assert.ok(u);
  assert.equal(u.weapons.unit, "Dozer Blade");
  assert.deepEqual(u.modules, ["damage", "coolant"]);
});

test("A plain tank (no modules) is unchanged: single flat-pick weapon, empty modules", () => {
  const u = makeUnit("tank", 3, "Line Tank", "b", { unit: "Autocannon Mount" });
  assert.ok(u);
  assert.equal(u.weapons.unit, "Autocannon Mount");
  assert.deepEqual(u.modules, []);
});

test("Support units must carry exactly two distinct modules or fail to build", () => {
  assert.equal(makeUnit("tank", 4, "X", "a", { unit: "Tank Cannon", modules: ["damage"] }), null);
  assert.equal(makeUnit("tank", 5, "X", "a", { unit: "Tank Cannon", modules: ["damage", "repair", "recon"] }), null);
  // A damage-less support unit with a bogus opts.unit still builds — it uses the Sidearm.
  assert.ok(makeUnit("walker", 6, "X", "a", { modules: ["repair", "coolant"], unit: "nonsense" }));
  // A damage support unit with an invalid gun fails (no weapon to fit).
  assert.equal(makeUnit("tank", 7, "X", "a", { modules: ["damage", "recon"], unit: "nonsense" }), null);
});

// Minimal harness: a room with two allied units, one activated, ready to act.
function twoAllyRoom() {
  const room = createRoom("t");
  room.rigs = [
    makeUnit("walker", 1, "Welder", "a", { modules: ["repair", "recon"] }),
    makeUnit("tank", 2, "Ally", "a", { unit: "Tank Cannon" }),
  ];
  room.nextRigId = 3;
  room.game.started = true;
  room.game.phase = "activation";
  room.game.round = 1;
  room.game.turn = { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 0, longRangeShots: 0 };
  return room;
}

test("Field Weld heals an allied unit's chosen location (D6 3-4 = 2 SP)", () => {
  const room = twoAllyRoom();
  const ally = room.rigs[1];
  ally.hull.sp = 3; // below max 8
  applyCommand(room, { verb: "activate", attrs: { name: "Welder" } }, {});
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "fieldweld",
    target: "Ally", loc: "hull", dice: { weld: 4 } } }, {});
  assert.equal(ally.hull.sp, 5); // +2
  assert.equal(room.game.turn.actionsUsed, 1);
});

test("Field Weld requires the repair module and an ALLIED target", () => {
  const room = twoAllyRoom();
  room.rigs[0].modules = ["coolant", "recon"]; // no repair module
  applyCommand(room, { verb: "activate", attrs: { name: "Welder" } }, {});
  const before = room.rigs[1].hull.sp;
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "fieldweld",
    target: "Ally", loc: "hull", dice: { weld: 4 } } }, {});
  assert.equal(room.rigs[1].hull.sp, before); // no heal — module missing
  assert.equal(room.game.turn.actionsUsed, 0); // rejected — no budget spent
  // Enemy target rejected even with the module:
  room.rigs[0].modules = ["repair", "recon"];
  room.rigs[1].owner = "b";
  room.rigs[1].hull.sp = 3;
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "fieldweld",
    target: "Ally", loc: "hull", dice: { weld: 4 } } }, {});
  assert.equal(room.rigs[1].hull.sp, 3); // enemy not healed
  assert.equal(room.game.turn.actionsUsed, 0); // rejected — no budget spent
});

test("Field Weld can't resurrect a destroyed ally", () => {
  const room = twoAllyRoom();
  const ally = room.rigs[1];
  ally.destroyed = true;
  for (const loc of ["hull", "tracks", "turret", "engine"]) ally[loc].sp = 0;
  applyCommand(room, { verb: "activate", attrs: { name: "Welder" } }, {});
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "fieldweld",
    target: "Ally", loc: "hull", dice: { weld: 4 } } }, {});
  assert.equal(ally.destroyed, true); // still dead — not revived
  assert.equal(ally.hull.sp, 0); // no SP welded on
  assert.equal(room.game.turn.actionsUsed, 0); // rejected — no budget spent
});

test("Vent drops 2 heat off an allied rig; refuses cold targets", () => {
  const room = twoAllyRoom();
  room.rigs[0].modules = ["coolant", "recon"];
  const rig = makeRig(3, "HotRig", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  rig.engine.heat = 5;
  room.rigs.push(rig);
  applyCommand(room, { verb: "activate", attrs: { name: "Welder" } }, {});
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "vent", target: "HotRig" } }, {});
  assert.equal(rig.engine.heat, 3); // −2
  // Venting the cold tank ally is a no-op (no heat), budget not spent:
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "vent", target: "Ally" } }, {});
  assert.equal(room.game.turn.actionsUsed, 1); // second vent rejected
});

test("Vent needs the coolant module and refuses a destroyed target", () => {
  const room = twoAllyRoom();
  room.rigs[0].modules = ["repair", "recon"]; // no coolant
  const rig = makeRig(3, "HotRig", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  rig.engine.heat = 5;
  room.rigs.push(rig);
  applyCommand(room, { verb: "activate", attrs: { name: "Welder" } }, {});
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "vent", target: "HotRig" } }, {});
  assert.equal(rig.engine.heat, 5); // no module → no vent
  assert.equal(room.game.turn.actionsUsed, 0);
});

test("Paint marks an enemy; mark records painter and clears on the painter's next activation", () => {
  const room = twoAllyRoom();
  const enemy = makeUnit("tank", 3, "Foe", "b", { unit: "Tank Cannon" });
  room.rigs.push(enemy);
  applyCommand(room, { verb: "activate", attrs: { name: "Welder" } }, {});
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "paint", target: "Foe" } }, {});
  assert.deepEqual(enemy.painted, { by: "a", painterId: 1 });
  assert.equal(room.game.turn.actionsUsed, 1);

  // End Welder's activation, reset the turn, re-activate it — the mark clears.
  room.rigs[0].activated = false;
  room.game.turn = { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 0, longRangeShots: 0 };
  applyCommand(room, { verb: "activate", attrs: { name: "Welder" } }, {});
  assert.equal(enemy.painted, null);
});

test("Paint requires the recon module and refuses friendly targets", () => {
  const room = twoAllyRoom();
  room.rigs[0].modules = ["repair", "coolant"]; // no recon
  applyCommand(room, { verb: "activate", attrs: { name: "Welder" } }, {});
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "paint", target: "Ally" } }, {});
  assert.equal(room.rigs[1].painted ?? null, null); // no module → no mark
  assert.equal(room.game.turn.actionsUsed, 0);

  // With the recon module, a friendly target is still refused (enemies only).
  const friendly = twoAllyRoom();
  applyCommand(friendly, { verb: "activate", attrs: { name: "Welder" } }, {});
  applyCommand(friendly, { verb: "action", attrs: { name: "Welder", action: "paint", target: "Ally" } }, {});
  assert.equal(friendly.rigs[1].painted ?? null, null); // ally not marked
  assert.equal(friendly.game.turn.actionsUsed, 0); // rejected — no budget spent
});

test("A Recon unit holds one mark — a new Paint replaces the painter's old mark", () => {
  const room = twoAllyRoom();
  const foe1 = makeUnit("tank", 3, "Foe1", "b", { unit: "Tank Cannon" });
  const foe2 = makeUnit("tank", 4, "Foe2", "b", { unit: "Tank Cannon" });
  room.rigs.push(foe1, foe2);
  applyCommand(room, { verb: "activate", attrs: { name: "Welder" } }, {});
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "paint", target: "Foe1" } }, {});
  assert.deepEqual(foe1.painted, { by: "a", painterId: 1 });
  // Same activation, paint a second enemy — the first mark is dropped.
  applyCommand(room, { verb: "action", attrs: { name: "Welder", action: "paint", target: "Foe2" } }, {});
  assert.equal(foe1.painted, null);
  assert.deepEqual(foe2.painted, { by: "a", painterId: 1 });
});

test("a destroyed painter's mark stops helping allied guns", () => {
  // Threshold shot: Tank Cannon peak Accuracy 2, attacker BASE_AIM 4, cover 2, one to-hit
  // die of 2. Unpainted modAim = 4 (die 2 misses); a live paint cancels cover
  // and adds +1 Aim -> modAim 1 (die 2 lands). So the same die hits iff the
  // paint is honoured — which it must NOT be once the painter (id 1) is dead.
  function firePaintedFoe(painterDestroyed) {
    const room = twoAllyRoom(); // rigs[0]=Welder(id 1), rigs[1]=Ally(id 2), both owner "a"
    const foe = makeUnit("tank", 3, "Foe", "b", { unit: "Tank Cannon" });
    room.rigs.push(foe);
    foe.painted = { by: "a", painterId: 1 }; // marked by the Welder
    room.rigs[0].destroyed = painterDestroyed;
    applyCommand(room, { verb: "activate", attrs: { name: "Ally" } }, {});
    applyCommand(room, { verb: "action", attrs: {
      name: "Ally", action: "fire", weapon: "unit", target: "Foe", arc: "front", range: "near", cover: 2,
      dice: { toHit: [2], location: 1, impacts: [6] },
    } }, {});
    return room.game.resolutions.filter((x) => x.kind === "attack").at(-1);
  }
  assert.match(firePaintedFoe(false).summary, /1 hit\(s\)/); // painter alive -> paint helps, shot lands
  assert.match(firePaintedFoe(true).summary, /0 hit\(s\)/);  // painter dead -> mark ignored, shot misses
});

test("SUPPORT_UNITS defines the four shipped exemplars", () => {
  const byName = Object.fromEntries(SUPPORT_UNITS.map((u) => [u.name, u]));
  assert.deepEqual(byName["Marksman Tank"].modules, ["damage", "recon"]);
  assert.equal(byName["Marksman Tank"].kind, "tank");
  assert.equal(byName["Marksman Tank"].unit, "Tank Cannon");
  assert.deepEqual(byName["Field Welder"].modules, ["repair", "recon"]);
  assert.equal(byName["Field Welder"].unit, undefined); // sidearm-only
});

test("seed builds support units from a custom roster with kind + modules", () => {
  const room = createRoom("seedtest");
  applyCommand(room, { verb: "seed", attrs: { first: "a", roster: [
    { name: "Marksman Tank", owner: "a", kind: "tank", unit: "Tank Cannon", modules: ["damage", "recon"] },
    { name: "Depot Tank", owner: "b", kind: "tank", modules: ["repair", "coolant"] },
  ] } }, {});
  const marks = room.rigs.find((r) => r.name === "Marksman Tank");
  const depot = room.rigs.find((r) => r.name === "Depot Tank");
  assert.equal(marks.weapons.unit, "Tank Cannon");
  assert.deepEqual(marks.modules, ["damage", "recon"]);
  assert.equal(depot.weapons.unit, "Sidearm");
});

test("the add verb commissions a support unit from a comma module string", () => {
  const room = createRoom("addtest");
  applyCommand(room, { verb: "add", attrs: { name: "Spotter", kind: "walker", owner: "a", modules: "repair,recon" } }, {});
  const u = room.rigs.find((r) => r.name === "Spotter");
  assert.ok(u);
  assert.deepEqual(u.modules, ["repair", "recon"]);
  assert.equal(u.weapons.unit, "Sidearm"); // no damage module
  assert.equal(u.kind, "walker");
});

test("the add verb still builds a plain tank (no modules) unchanged", () => {
  const room = createRoom("addtest2");
  applyCommand(room, { verb: "add", attrs: { name: "LineTank", kind: "tank", owner: "a", unit: "Autocannon Mount" } }, {});
  const u = room.rigs.find((r) => r.name === "LineTank");
  assert.ok(u);
  assert.deepEqual(u.modules, []);
  assert.equal(u.weapons.unit, "Autocannon Mount");
});
