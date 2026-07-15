import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, UNIT_KINDS, roleOf, partsByRole, hitPart, toughnessOf, partNamesOf, kindOf,
} from "./unit-kinds.js";

test("ROLES lists the four generalized component roles", () => {
  assert.deepEqual([...ROLES].sort(), ["mobility", "power", "structural", "weapon"]);
});

test("UNIT_KINDS.rig maps every part to a role from ROLES", () => {
  const rig = UNIT_KINDS.rig;
  assert.ok(rig, "rig kind exists");
  assert.equal(rig.parts.length, 4);
  const names = rig.parts.map((p) => p.name);
  assert.deepEqual(names, ["hull", "arms", "legs", "engine"]);
  for (const p of rig.parts) assert.ok(ROLES.includes(p.role), `${p.name} role in ROLES`);
});

test("Rig registry mirrors today's flags", () => {
  const r = UNIT_KINDS.rig;
  assert.equal(r.hasHeat, true);
  assert.equal(r.hasArcs, true);
  assert.equal(r.actionBudget, 3);
  assert.equal(r.weaponMode, "rig-catalog");
  assert.equal(r.reloads, true);
  assert.equal(r.hasEquipment, true);
  assert.equal(r.reactions, true);
  assert.equal(r.destruction, "single-model");
});

test("roleOf resolves a part-name to its role", () => {
  assert.equal(roleOf("rig", "hull"), "structural");
  assert.equal(roleOf("rig", "arms"), "weapon");
  assert.equal(roleOf("rig", "legs"), "mobility");
  assert.equal(roleOf("rig", "engine"), "power");
  assert.equal(roleOf("rig", "missing"), null);
});

test("partsByRole returns every part matching that role", () => {
  assert.deepEqual(partsByRole("rig", "structural"), ["hull"]);
  assert.deepEqual(partsByRole("rig", "weapon"), ["arms"]);
});

test("hitPart returns the D12 → part-name for a kind", () => {
  assert.equal(hitPart("rig", 1), "hull");
  assert.equal(hitPart("rig", 4), "hull");
  assert.equal(hitPart("rig", 5), "arms");
  assert.equal(hitPart("rig", 7), "arms");
  assert.equal(hitPart("rig", 8), "legs");
  assert.equal(hitPart("rig", 10), "legs");
  assert.equal(hitPart("rig", 11), "engine");
  assert.equal(hitPart("rig", 12), "engine");
});

test("toughnessOf — rig reads the weight-class grid", () => {
  assert.equal(toughnessOf("rig", "hull", "medium"), 5);
  assert.equal(toughnessOf("rig", "engine", "light"), 3);
  assert.equal(toughnessOf("rig", "hull", "colossal"), 7);
});

test("toughnessOf — flat kinds ignore weight class", () => {
  assert.equal(toughnessOf("tank", "hull"), 6);
  assert.equal(toughnessOf("tank", "tracks"), 5);
  assert.equal(toughnessOf("walker", "hull"), 5);
  assert.equal(toughnessOf("walker", "mount"), 4);
});

test("toughnessOf — every part of every kind has a value", () => {
  // A missing T would silently become 0 and make the part trivially woundable.
  for (const kind of ["tank", "walker"]) {
    for (const p of partNamesOf(kind)) {
      assert.equal(typeof toughnessOf(kind, p), "number", `${kind}/${p}`);
    }
  }
  for (const wc of ["light", "medium", "heavy", "colossal"]) {
    for (const p of partNamesOf("rig")) {
      assert.equal(typeof toughnessOf("rig", p, wc), "number", `rig/${wc}/${p}`);
    }
  }
});

test("toughnessOf — unknown kind or part yields null, never a silent 0", () => {
  assert.equal(toughnessOf("nope", "hull", "medium"), null);
  assert.equal(toughnessOf("rig", "nope", "medium"), null);
});

test("kindOf(unit) returns the registry id, defaulting to 'rig' on legacy shape", () => {
  assert.equal(kindOf({ kind: "tank" }), "tank");
  assert.equal(kindOf({ weightClass: "medium" }), "rig");
  assert.equal(kindOf(null), "rig");
});

test("Tank entry — parts, roles, flags, strawman toughness", () => {
  const t = UNIT_KINDS.tank;
  assert.ok(t);
  assert.deepEqual(t.parts.map((p) => p.name), ["hull", "tracks", "turret", "engine"]);
  assert.equal(roleOf("tank", "hull"), "structural");
  assert.equal(roleOf("tank", "tracks"), "mobility");
  assert.equal(roleOf("tank", "turret"), "weapon");
  assert.equal(roleOf("tank", "engine"), "power");
  assert.equal(t.hasHeat, false);
  assert.equal(t.hasArcs, true);
  assert.equal(t.actionBudget, 2);
  assert.equal(t.weaponMode, "flat-pick");
  assert.equal(t.reloads, true);
  assert.equal(t.hasEquipment, false);
  assert.equal(t.reactions, false);
  assert.equal(t.destruction, "single-model");
  assert.equal(t.speed, 3);
  assert.equal(hitPart("tank", 3), "hull");
  assert.equal(hitPart("tank", 6), "tracks");
  assert.equal(hitPart("tank", 9), "turret");
  assert.equal(hitPart("tank", 12), "engine");
  assert.equal(toughnessOf("tank", "hull"), 6);
  assert.equal(toughnessOf("tank", "engine"), 4);
});

test("Walker entry — parts, roles, flags, Sentinel strawman", () => {
  const w = UNIT_KINDS.walker;
  assert.ok(w);
  assert.deepEqual(w.parts.map((p) => p.name), ["hull", "legs", "mount", "engine"]);
  assert.equal(roleOf("walker", "mount"), "weapon");
  assert.equal(w.hasHeat, false);
  assert.equal(w.actionBudget, 3);
  assert.equal(w.speed, 4);
  assert.equal(hitPart("walker", 6), "legs");
  assert.equal(hitPart("walker", 9), "mount");
  assert.equal(toughnessOf("walker", "hull"), 5);
  assert.equal(toughnessOf("walker", "engine"), 3);
});
