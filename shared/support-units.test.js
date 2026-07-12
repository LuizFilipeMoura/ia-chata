import test from "node:test";
import assert from "node:assert/strict";
import { MODULES, MODULE_IDS, normalizeModules } from "./unit-kinds.js";
import { UNIT_WEAPONS, normalizeUnitWeapon } from "./game-state.js";

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
