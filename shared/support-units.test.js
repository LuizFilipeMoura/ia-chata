import test from "node:test";
import assert from "node:assert/strict";
import { MODULES, MODULE_IDS, normalizeModules } from "./unit-kinds.js";
import { UNIT_WEAPONS, normalizeUnitWeapon, makeUnit } from "./game-state.js";

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
  assert.equal(s.str, 4);
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
