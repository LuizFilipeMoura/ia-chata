import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BUILDING_KINDS, buildingVariant, SMALL_VARIANTS, smallVariant, barricadeProp, crateProp, rubbleProp } from "./props.js";
import { NEW_BUILDINGS as DRESSING_BUILDINGS } from "./dressing.js";
import { WORKS } from "./works.js";
const NEW_BUILDINGS = [...DRESSING_BUILDINGS, ...Object.keys(WORKS)];
import { THEMES } from "./themes.js";
import { propFits } from "./rig/envelope.js";

const win = new THREE.Texture(); win.glow = new THREE.Texture();
let seed = 7;
const ctx = (theme = THEMES.foundry) => ({ theme, win, fx: { particle() {} }, anim() {}, rand: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), chimney() {} });
const RECTS = { building: [[6, 5], [4, 4], [9, 4]], barricade: [[7, 0.9], [3, 0.6]], crate: [[2.2, 2.2], [1.5, 1.2]], rubble: [[2.5, 2], [1.5, 1.5]] };
const show = (f) => `height ${f.height.toFixed(2)}/${f.limit.toFixed(2)} box x ${f.box.min.x.toFixed(2)}..${f.box.max.x.toFixed(2)} z ${f.box.min.z.toFixed(2)}..${f.box.max.z.toFixed(2)}`;

test("new building kinds fit their rect and the original height range", () => {
  for (const kind of NEW_BUILDINGS) {
    assert.ok(BUILDING_KINDS.includes(kind), `${kind} registered`);
    for (const [w, h] of RECTS.building) {
      const f = propFits(buildingVariant(kind, { w, h, x: 0, y: 0 }, ctx()), "building", w, h);
      assert.ok(f.ok, `${kind} ${w}x${h}: ${show(f)}`);
    }
  }
});

test("every new building kind is used by at least one theme", () => {
  for (const kind of NEW_BUILDINGS) assert.ok(Object.values(THEMES).some((t) => t.buildings.includes(kind)), kind);
});

test("every small-terrain variant fits its slot", () => {
  for (const [slot, variants] of Object.entries(SMALL_VARIANTS)) for (const v of variants.filter((x) => x !== "classic")) for (const [w, h] of RECTS[slot]) {
    const f = propFits(smallVariant(slot, v, { w, h, x: 0, y: 0 }, ctx()), slot, w, h);
    assert.ok(f.ok, `${slot}/${v} ${w}x${h}: ${show(f)}`);
  }
});

test("small terrain picks its variant from the position, and every variant turns up", () => {
  for (const [slot, fn] of [["barricade", barricadeProp], ["crate", crateProp], ["rubble", rubbleProp]]) {
    const seen = new Set();
    for (let x = 0; x < 30; x++) for (let y = 0; y < 6; y++) {
      const a = fn({ w: 2, h: 1, x, y }, ctx()), b = fn({ w: 2, h: 1, x, y }, ctx());
      assert.equal(a.userData.variant, b.userData.variant);
      seen.add(a.userData.variant);
    }
    assert.deepEqual([...seen].sort(), [...SMALL_VARIANTS[slot]].sort(), slot);
  }
});
