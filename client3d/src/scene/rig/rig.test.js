import { test } from "node:test";
import assert from "node:assert/strict";
import { Mech } from "../mechs.js";
import { CHASSIS } from "../../../../shared/game-state.js";
import { BASE_RADIUS } from "../../../../shared/geometry.js";

const rig = (c, extra = {}) => new Mech({ id: `t-${c.id}`, name: c.name, owner: "a", chassis: c.id, weightClass: c.class, longRange: c.longRange, melee: c.melee, radius: BASE_RADIUS[c.class], ...extra });

test("a rig Mech builds headless (no DOM)", () => {
  const m = rig(CHASSIS[0]);
  assert.ok(m.root.children.length > 0);
});

import { fits } from "./envelope.js";

test("every chassis fits its class envelope", () => {
  for (const c of CHASSIS) {
    const f = fits(rig(c));
    assert.ok(f.ok, `${c.name} (${c.class}) height ${f.height.toFixed(3)}/${f.limit.height} radius ${f.radius.toFixed(3)}/${f.limit.radius}`);
  }
});

import { RECIPES } from "./recipes.js";

const SOCKETS = ["back", "chestFront", "shoulderL", "shoulderR", "hip", "head", "shin"];

test("every chassis body exposes the animation contract and all sockets", () => {
  for (const c of CHASSIS) {
    const m = rig(c);
    assert.equal(m.legs.length, 2, c.name);
    for (const l of m.legs) for (const k of ["hip", "knee"]) assert.ok(l[k]?.isObject3D, `${c.name} leg.${k}`);
    for (const k of ["pelvis", "torso", "chest", "armR", "armL"]) assert.ok(m[k]?.isObject3D, `${c.name}.${k}`);
    assert.ok(m.stacks.length >= 1, `${c.name} has a heat stack`);
    assert.ok(m.stacks.every((s) => s.material === m.ventMat), `${c.name} stacks glow with heat`);
    assert.ok(m.cockpitMat, `${c.name} cockpit`);
    let glass = 0; m.body.traverse((o) => { if (o.material === m.cockpitMat) glass++; });
    assert.ok(glass > 0, `${c.name} shows its cockpit glass somewhere`);
    for (const s of SOCKETS) assert.ok(m.sockets[s]?.isObject3D, `${c.name} socket ${s}`);
  }
});

test("every chassis has a recipe", () => {
  for (const c of CHASSIS) assert.ok(RECIPES[c.name], `recipe for ${c.name}`);
});

test("within a class, no two chassis share a torso, head, backpack or leg+foot combo", () => {
  for (const cls of ["light", "medium"]) {
    const rs = CHASSIS.filter((c) => c.class === cls).map((c) => RECIPES[c.name]);
    for (const key of ["torso", "head", "backpack"]) {
      const vals = rs.map((r) => r[key]);
      assert.equal(new Set(vals).size, vals.length, `${cls} ${key}s repeat: ${vals.join(", ")}`);
    }
    const combos = rs.map((r) => `${r.legs}+${r.feet}`);
    assert.equal(new Set(combos).size, combos.length, `${cls} leg+foot combos repeat: ${combos.join(", ")}`);
  }
});

test("each signature belongs to exactly one chassis", () => {
  const sigs = CHASSIS.map((c) => RECIPES[c.name].signature);
  assert.ok(sigs.every(Boolean));
  assert.equal(new Set(sigs).size, sigs.length);
});

import { SKIN_IDS, skinFor } from "./skins.js";

test("every chassis in every skin builds and fits its envelope", () => {
  for (const c of CHASSIS) for (const skin of SKIN_IDS) {
    const m = rig(c, { skin });
    const f = fits(m);
    assert.ok(f.ok, `${c.name}/${skin} height ${f.height.toFixed(3)}/${f.limit.height} radius ${f.radius.toFixed(3)}/${f.limit.radius}`);
    assert.ok(m.stacks.length >= 1);
  }
});

test("seeded add-ons differ between two rigs in the same skin", () => {
  const c = CHASSIS[0];
  const layout = (id) => { const m = new Mech({ id, name: c.name, owner: "a", chassis: c.id, weightClass: c.class, longRange: c.longRange, melee: c.melee, radius: 1.18, skin: "worn" }); m.root.updateMatrixWorld(true); const out = []; m.sockets.chestFront.traverse((o) => { if (o.isMesh) out.push(o.position.toArray().map((v) => v.toFixed(3)).join(",")); }); return out.join("|"); };
  assert.notEqual(layout("rig-1"), layout("rig-2"));
  assert.equal(layout("rig-1"), layout("rig-1"));
});

test("skinFor resolves every mode", () => {
  assert.equal(skinFor({ mode: "side", side: "a" }), "factory");
  assert.equal(skinFor({ mode: "side", side: "b" }), "refit");
  assert.equal(skinFor({ mode: "fixed", fixed: "rust" }), "rust");
  assert.equal(skinFor({ mode: "fixed", fixed: "nope" }), "factory");
  assert.equal(skinFor({ mode: "chassis", map: { Gold: "ace" }, codename: "Gold" }), "ace");
  assert.equal(skinFor({ mode: "chassis", map: {}, codename: "Gold" }), "factory");
  const r = skinFor({ mode: "random", seed: "room-1", codename: "Gold", side: "a" });
  assert.ok(SKIN_IDS.includes(r));
  assert.equal(r, skinFor({ mode: "random", seed: "room-1", codename: "Gold", side: "a" }));
});

import { SUPPORT_TEMPLATES, DRONE_TYPES } from "../../../../shared/game-state.js";
import { SUPPORT_RECIPES } from "./support.js";

const walkers = SUPPORT_TEMPLATES.filter((t) => t.kind === "walker");
const walker = (t, skin) => new Mech({ id: `w-${t.id}`, name: t.name, owner: "a", kind: "walker", weightClass: "walker", unit: t.unit, modules: t.modules, template: t.id, radius: BASE_RADIUS.walker, skin });
const drone = (d, skin) => new Mech({ id: `d-${d.id}`, name: d.label, owner: "b", kind: "drone", weightClass: "drone", unit: d.unit, modules: d.modules, drone: d.id, radius: BASE_RADIUS.drone, skin });

test("every walker template and drone type has its own body", () => {
  for (const t of walkers) assert.ok(SUPPORT_RECIPES.walker[t.id], `walker recipe ${t.id}`);
  for (const d of Object.values(DRONE_TYPES)) assert.ok(SUPPORT_RECIPES.drone[d.id], `drone recipe ${d.id}`);
  const torsos = [...Object.values(SUPPORT_RECIPES.walker), ...Object.values(SUPPORT_RECIPES.drone)].map((r) => r.torso);
  assert.equal(new Set(torsos).size, torsos.length, "support bodies repeat");
});

test("walkers and drones in every skin keep the contract and fit their envelope", () => {
  const units = [...walkers.map((t) => (skin) => walker(t, skin)), ...Object.values(DRONE_TYPES).map((d) => (skin) => drone(d, skin))];
  for (const make of units) for (const skin of SKIN_IDS) {
    const m = make(skin);
    const f = fits(m);
    assert.ok(f.ok, `${m.kind} ${m.template || m.drone}/${skin} height ${f.height.toFixed(3)}/${f.limit.height} radius ${f.radius.toFixed(3)}/${f.limit.radius}`);
    assert.ok(m.stacks.length >= 1 && m.legs.length === 2 && m.armR && m.armL && m.lr && m.me);
    for (const s of SOCKETS) assert.ok(m.sockets[s], `${m.kind} socket ${s}`);
  }
});
