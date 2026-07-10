import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPrebuiltStore } from "./prebuilts.js";
import { enforcePrebuilt } from "./routes/game.js";
import { PREBUILT_RIGS } from "../shared/game-state.js";

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "prebuilts-")), name);
}

test("seeds the file from defaults when missing, with empty content fields", () => {
  const fp = tmpFile("seed.json");
  const store = createPrebuiltStore(fp);
  assert.ok(fs.existsSync(fp));
  const all = store.all();
  assert.equal(all.length, PREBUILT_RIGS.length);
  assert.equal(all[0].description, "");
  assert.equal(all[0].personality, "");
  // Weapons + class mirror the code registry.
  assert.equal(all[0].longRange, PREBUILT_RIGS[0].longRange);
});

test("merges authored content by id; weapons/class stay code-authoritative", () => {
  const fp = tmpFile("merge.json");
  const id = PREBUILT_RIGS[0].id;
  fs.writeFileSync(fp, JSON.stringify([
    { id, longRange: "HACKED", class: "colossal", description: "d", personality: "p" },
  ]));
  const store = createPrebuiltStore(fp);
  const entry = store.get(id);
  assert.equal(entry.description, "d");
  assert.equal(entry.personality, "p");
  // Disk cannot override the locked loadout.
  assert.equal(entry.longRange, PREBUILT_RIGS[0].longRange);
  assert.equal(entry.class, PREBUILT_RIGS[0].class);
});

test("ignores unknown ids from disk", () => {
  const fp = tmpFile("unknown.json");
  fs.writeFileSync(fp, JSON.stringify([{ id: "not-a-real-rig", description: "x" }]));
  const store = createPrebuiltStore(fp);
  assert.equal(store.get("not-a-real-rig"), null);
  assert.equal(store.all().length, PREBUILT_RIGS.length);
});

test("every prebuilt carries a per-rig SP profile", () => {
  for (const p of PREBUILT_RIGS) {
    for (const loc of ["hull", "arms", "legs", "engine"]) {
      assert.ok(Number.isFinite(p.sp?.[loc]), `${p.id} has sp.${loc}`);
    }
  }
});

test("enforcePrebuilt stamps canonical weapons/class/sp from a prebuilt id", () => {
  const pb = PREBUILT_RIGS.find((p) => p.class === "medium");
  const out = enforcePrebuilt({ verb: "add", attrs: { name: "X", kind: "rig", prebuilt: pb.id, class: "light", lr: "Mini Gun", melee: "Sword" } });
  assert.equal(out.error, undefined);
  assert.equal(out.cmd.attrs.class, pb.class);
  assert.equal(out.cmd.attrs.longRange, pb.longRange);
  assert.equal(out.cmd.attrs.melee, pb.melee);
  assert.deepEqual(out.cmd.attrs.sp, pb.sp);
});

test("enforcePrebuilt resolves by exact weapon+class combo when no id", () => {
  const pb = PREBUILT_RIGS[0];
  const out = enforcePrebuilt({ verb: "add", attrs: { name: "X", kind: "rig", class: pb.class, lr: pb.longRange, melee: pb.melee } });
  assert.equal(out.error, undefined);
  assert.equal(out.cmd.attrs.prebuilt, pb.id);
});

test("enforcePrebuilt rejects an off-catalogue rig combo", () => {
  const out = enforcePrebuilt({ verb: "add", attrs: { name: "X", kind: "rig", class: "light", lr: "Autocannon", melee: "Sword" } });
  assert.ok(out.error);
  assert.equal(out.cmd, undefined);
});

test("enforcePrebuilt leaves tanks/walkers and non-add commands untouched", () => {
  const tank = enforcePrebuilt({ verb: "add", attrs: { name: "T", kind: "tank", unit: "Tank Cannon" } });
  assert.equal(tank.error, undefined);
  assert.equal(tank.cmd.attrs.unit, "Tank Cannon");
  const dmg = enforcePrebuilt({ verb: "damage", attrs: { name: "X", loc: "hull", amount: 2 } });
  assert.equal(dmg.error, undefined);
  assert.equal(dmg.cmd.verb, "damage");
});
