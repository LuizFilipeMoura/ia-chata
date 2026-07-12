import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createChassisStore } from "./chassis.js";
import { enforceChassis } from "./routes/game.js";
import { CHASSIS } from "../shared/game-state.js";

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chassis-")), name);
}

test("seeds the file from defaults when missing, with empty content fields", () => {
  const fp = tmpFile("seed.json");
  const store = createChassisStore(fp);
  assert.ok(fs.existsSync(fp));
  const all = store.all();
  assert.equal(all.length, CHASSIS.length);
  assert.equal(all[0].description, "");
  assert.equal(all[0].personality, "");
  // Weapons + class mirror the code registry.
  assert.equal(all[0].longRange, CHASSIS[0].longRange);
});

test("merges authored content by id; weapons/class stay code-authoritative", () => {
  const fp = tmpFile("merge.json");
  const id = CHASSIS[0].id;
  fs.writeFileSync(fp, JSON.stringify([
    { id, longRange: "HACKED", class: "colossal", description: "d", personality: "p" },
  ]));
  const store = createChassisStore(fp);
  const entry = store.get(id);
  assert.equal(entry.description, "d");
  assert.equal(entry.personality, "p");
  // Disk cannot override the locked loadout.
  assert.equal(entry.longRange, CHASSIS[0].longRange);
  assert.equal(entry.class, CHASSIS[0].class);
});

test("ignores unknown ids from disk", () => {
  const fp = tmpFile("unknown.json");
  fs.writeFileSync(fp, JSON.stringify([{ id: "not-a-real-rig", description: "x" }]));
  const store = createChassisStore(fp);
  assert.equal(store.get("not-a-real-rig"), null);
  assert.equal(store.all().length, CHASSIS.length);
});

test("every chassis carries a per-rig SP profile", () => {
  for (const p of CHASSIS) {
    for (const loc of ["hull", "arms", "legs", "engine"]) {
      assert.ok(Number.isFinite(p.sp?.[loc]), `${p.id} has sp.${loc}`);
    }
  }
});

test("enforceChassis stamps canonical weapons/class/sp from a chassis id", () => {
  const pb = CHASSIS.find((p) => p.class === "medium");
  const out = enforceChassis({ verb: "add", attrs: { name: "X", kind: "rig", chassis: pb.id, class: "light", lr: "Mini Gun", melee: "Sword" } });
  assert.equal(out.error, undefined);
  assert.equal(out.cmd.attrs.class, pb.class);
  assert.equal(out.cmd.attrs.longRange, pb.longRange);
  assert.equal(out.cmd.attrs.melee, pb.melee);
  assert.deepEqual(out.cmd.attrs.sp, pb.sp);
});

test("enforceChassis resolves by exact weapon+class combo when no id", () => {
  const pb = CHASSIS[0];
  const out = enforceChassis({ verb: "add", attrs: { name: "X", kind: "rig", class: pb.class, lr: pb.longRange, melee: pb.melee } });
  assert.equal(out.error, undefined);
  assert.equal(out.cmd.attrs.chassis, pb.id);
});

test("enforceChassis rejects an off-catalogue rig combo", () => {
  const out = enforceChassis({ verb: "add", attrs: { name: "X", kind: "rig", class: "light", lr: "Autocannon", melee: "Sword" } });
  assert.ok(out.error);
  assert.equal(out.cmd, undefined);
});

test("enforceChassis leaves tanks/walkers and non-add commands untouched", () => {
  const tank = enforceChassis({ verb: "add", attrs: { name: "T", kind: "tank", unit: "Tank Cannon" } });
  assert.equal(tank.error, undefined);
  assert.equal(tank.cmd.attrs.unit, "Tank Cannon");
  const dmg = enforceChassis({ verb: "damage", attrs: { name: "X", loc: "hull", amount: 2 } });
  assert.equal(dmg.error, undefined);
  assert.equal(dmg.cmd.verb, "damage");
});

test("enforceChassis rejects a rig running two Prototype upgrades", () => {
  const out = enforceChassis({ verb: "add", attrs: {
    name: "X", kind: "rig", chassis: "light-claw-autocannon",
    longRangeUpgrade: "penetrator-rounds", meleeUpgrade: "breach-grip",
  } });
  assert.ok(out.error);
  assert.equal(out.cmd, undefined);
});

test("enforceChassis allows one Prototype", () => {
  const out = enforceChassis({ verb: "add", attrs: {
    name: "X", kind: "rig", chassis: "light-claw-autocannon",
    longRangeUpgrade: "penetrator-rounds", meleeUpgrade: "vice-grip",
  } });
  assert.equal(out.error, undefined);
});

test("enforceChassis rejects an upgrade id that isn't valid for the weapon", () => {
  const out = enforceChassis({ verb: "add", attrs: {
    name: "X", kind: "rig", chassis: "light-claw-autocannon",
    longRangeUpgrade: "not-a-real-upgrade", meleeUpgrade: "vice-grip",
  } });
  assert.ok(out.error);
});

test("enforceChassis rejects a weapon Prototype + an equipment Prototype", () => {
  const out = enforceChassis({ verb: "add", attrs: {
    name: "X", kind: "rig", chassis: "light-claw-autocannon",
    longRangeUpgrade: "penetrator-rounds", meleeUpgrade: "vice-grip",
    equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
  } });
  assert.ok(out.error);
});

test("enforceChassis allows a lone equipment Prototype", () => {
  const out = enforceChassis({ verb: "add", attrs: {
    name: "X", kind: "rig", chassis: "light-claw-autocannon",
    longRangeUpgrade: "depleted-core", meleeUpgrade: "vice-grip",
    equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
  } });
  assert.equal(out.error, undefined);
});

test("enforceChassis rejects an unknown equipment upgrade id", () => {
  const out = enforceChassis({ verb: "add", attrs: {
    name: "X", kind: "rig", chassis: "light-claw-autocannon",
    equipment: "ablative-plating", equipmentUpgrade: "not-a-real-upgrade",
  } });
  assert.ok(out.error);
});

test("merges suggestedEquipment from disk", () => {
  const fp = tmpFile("suggest.json");
  const id = CHASSIS[0].id;
  fs.writeFileSync(fp, JSON.stringify([
    { id, suggestedEquipment: [{ id: "radiator-array", reason: "runs hot" }] },
  ]));
  const store = createChassisStore(fp);
  assert.deepEqual(store.get(id).suggestedEquipment, [{ id: "radiator-array", reason: "runs hot" }]);
});

test("defaults suggestedEquipment to an empty array", () => {
  const fp = tmpFile("suggest-default.json");
  const store = createChassisStore(fp);
  assert.deepEqual(store.all()[0].suggestedEquipment, []);
});

test("drops suggestions with unknown equipment ids and caps at 2", () => {
  const fp = tmpFile("suggest-bad.json");
  const id = CHASSIS[0].id;
  fs.writeFileSync(fp, JSON.stringify([
    { id, suggestedEquipment: [
      { id: "not-a-real-eq", reason: "x" },
      { id: "radiator-array", reason: "a" },
      { id: "servo-actuators", reason: "b" },
      { id: "ablative-plating", reason: "c" },
    ] },
  ]));
  const store = createChassisStore(fp);
  const out = store.get(id).suggestedEquipment;
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.id), ["radiator-array", "servo-actuators"]);
});

test("coerces a missing reason to a string and a non-array to []", () => {
  const fp = tmpFile("suggest-coerce.json");
  const id = CHASSIS[0].id;
  const id2 = CHASSIS[1].id;
  fs.writeFileSync(fp, JSON.stringify([
    { id, suggestedEquipment: [{ id: "overclock-core" }] },
    { id: id2, suggestedEquipment: "nope" },
  ]));
  const store = createChassisStore(fp);
  assert.deepEqual(store.get(id).suggestedEquipment, [{ id: "overclock-core", reason: "" }]);
  assert.deepEqual(store.get(id2).suggestedEquipment, []);
});
