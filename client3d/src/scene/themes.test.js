import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { THEMES, THEME_IDS, themeFor, weatherFor, WEATHERS } from "./themes.js";
import { BUILDING_KINDS, BACKDROP_KINDS, buildingVariant, backdrop } from "./props.js";
import { SCENERY_VARIANTS } from "./scenery.js";
import { ESTATES } from "./estates.js";
import { LANDMARK_KINDS } from "./landmarks.js";
import { dressFacade } from "./facades.js";
import { propFits } from "./rig/envelope.js";

const win = new THREE.Texture(); win.glow = new THREE.Texture();
let s = 11;
const ctx = (theme, extra = {}) => ({ theme, win, fx: { particle() {} }, anim() {}, rand: () => ((s = (s * 16807) % 2147483647) / 2147483647), chimney() {}, seed: 1234, ...extra });
const RECTS = [[6, 5], [4, 4], [9, 4]];

test("every theme carries every key the first one has", () => {
  const keys = Object.keys(THEMES[THEME_IDS[0]]).sort();
  for (const id of THEME_IDS) {
    assert.deepEqual(Object.keys(THEMES[id]).sort(), keys, id);
    assert.equal(THEMES[id].id, id);
    assert.equal(THEMES[id].sky.length, 6, `${id} sky stops`);
    assert.equal(typeof THEMES[id].ambience, "string", `${id} ambience`);
    for (const k of ["shadows", "highlights", "sat", "contrast", "lift", "amount"]) assert.equal(typeof THEMES[id].grade[k], "number", `${id} grade.${k}`);
    for (const k of ["posters", "neon", "oilRacks", "layered"]) assert.ok(k in THEMES[id].dress, `${id} dress.${k}`);
  }
});

test("each theme only names building, backdrop and scenery kinds that exist", () => {
  for (const t of Object.values(THEMES)) {
    for (const b of t.buildings) assert.ok(BUILDING_KINDS.includes(b), `${t.id}: building ${b}`);
    for (const b of t.backdrop) assert.ok(BACKDROP_KINDS.includes(b), `${t.id}: backdrop ${b}`);
    for (const [slot, list] of Object.entries(t.scenery || {})) for (const v of list) assert.ok(SCENERY_VARIANTS[slot].includes(v), `${t.id}: ${slot}/${v}`);
  }
});

// Lamps are sodium and whale oil: never a cold teal or cyan.
test("every theme's lamp and searchlight colours are warm", () => {
  const warm = (hex) => { const c = new THREE.Color(hex); return c.r >= c.b; };
  for (const t of Object.values(THEMES)) { assert.ok(warm(t.lamp), `${t.id} lamp`); assert.ok(warm(t.search), `${t.id} search`); }
});

test("the settings theme override and the auto pick reach every theme", () => {
  for (const id of THEME_IDS) assert.equal(themeFor({ width: 54, height: 36, terrain: [] }, id).id, id);
  const seen = new Set();
  for (let k = 0; k < 400; k++) seen.add(themeFor({ width: 54, height: 36, terrain: [], dressSeed: `room-${k}` }).id);
  assert.deepEqual([...seen].sort(), [...THEME_IDS].sort());
  assert.equal(themeFor({ width: 1, height: 1, theme: "rozalski", lockTheme: true }, "foundry").id, "rozalski");
});

test("weather is seeded per battle, and the override wins", () => {
  const t = THEMES.nomansland;
  for (let seed = 0; seed < 50; seed++) assert.equal(weatherFor(t, seed), weatherFor(t, seed));
  const kinds = new Set(Array.from({ length: 200 }, (_, seed) => weatherFor(t, seed * 7919)));
  assert.deepEqual([...kinds].sort(), [...WEATHERS].sort());
  for (let seed = 0; seed < 50; seed++) assert.equal(weatherFor({ weather: 0 }, seed), "clear");
  assert.equal(weatherFor({ weather: 0 }, 3, "rain"), "rain");
  assert.equal(weatherFor({ weather: 1 }, 3, "clear"), "clear");
});

test("the new building kinds fit their rect and are used by a theme", () => {
  for (const kind of Object.keys(ESTATES)) {
    assert.ok(Object.values(THEMES).some((t) => t.buildings.includes(kind)), kind);
    for (const [w, h] of RECTS) {
      const f = propFits(buildingVariant(kind, { w, h, x: 0, y: 0 }, ctx(THEMES.foundry)), "building", w, h);
      assert.ok(f.ok, `${kind} ${w}x${h}: height ${f.height.toFixed(2)}/${f.limit}`);
    }
  }
});

// Some original kinds (the mast's moored blimp) already overhang; dressing
// may never add to that: each dressed box stays inside the slot envelope or
// the undressed building's own box.
test("facade dressing never pushes a building out of its slot, in any theme", () => {
  const box = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
  for (const theme of Object.values(THEMES)) for (const kind of theme.buildings) for (const [w, h] of RECTS) for (const x of [0, 3, 7]) {
    const t = { w, h, x, y: 1 };
    const bare = box(buildingVariant(kind, t, ctx({ ...theme, dress: null }))), f = propFits(buildingVariant(kind, t, ctx(theme, { seed: x * 31 + w })), "building", w, h);
    const lim = { x: w / 2 + 0.5, z: h / 2 + 0.5 }, e = 1e-3;
    const ok = f.box.max.y <= Math.max(bare.max.y, f.limit) + e && ["x", "z"].every((a) => f.box.max[a] <= Math.max(bare.max[a], lim[a]) + e && f.box.min[a] >= Math.min(bare.min[a], -lim[a]) - e);
    assert.ok(ok, `${theme.id}/${kind} ${w}x${h}@${x}: height ${f.height.toFixed(2)}`);
  }
});

test("posters of the side falling behind get defaced", () => {
  const theme = { ...THEMES.foundry, dress: { posters: 1, neon: 0, oilRacks: 0, layered: false } };
  const c = ctx(theme);
  for (let x = 0; x < 12; x++) dressFacade(buildingVariant("factory", { w: 6, h: 5, x, y: 2 }, ctx({ ...theme, dress: null })), { w: 6, h: 5, x, y: 2 }, c);
  assert.ok(c.posters.length > 2, "some posters went up");
  assert.ok(new Set(c.posters.map((p) => p.side)).size === 2, "both sides have posters");
  c.setMorale([6, 1]);
  for (const p of c.posters) assert.equal(!!p.graffiti, p.side === "b", `${p.side} poster`);
  c.setMorale([2, 2]);
  assert.ok(c.posters.every((p) => !p.graffiti));
});

test("every backdrop set piece builds headless", () => {
  for (const kind of LANDMARK_KINDS) {
    const g = backdrop(kind, 0, new THREE.Vector3(27, 0, 18), 125, ctx(THEMES.foundry));
    let meshes = 0; g.traverse((o) => { if (o.isMesh || o.isLine) meshes++; });
    assert.ok(meshes > 0, kind);
  }
});
