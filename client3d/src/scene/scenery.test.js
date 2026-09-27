import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SCENERY_VARIANTS, SCENERY_CAP, sceneryVariant, sceneryProp, outline, inside, edgeDist } from "./scenery.js";
import { dressPick, layoutHash } from "./themes.js";

// Blobs shaped like shared/field.js makes them (same radius ranges).
function blob(seed, rBase, jitter, n) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + (r() - 0.5) * (Math.PI / n) * 0.9; const rr = rBase * (1 - jitter + r() * jitter * 2); return [Math.cos(a) * rr, Math.sin(a) * rr]; });
}
const SHAPES = {
  rock: [1, 1.5, 2].map((r, i) => ({ kind: "rock", shape: "poly", x: 3 + i, y: 7, points: blob(11 + i, r, 0.42, 5) })),
  ruin: [2.4, 3, 3.8].map((r, i) => ({ kind: "ruin", shape: "poly", x: 5 + i, y: 2, points: blob(21 + i, r, 0.5, 6) })),
  wood: [3.4, 4.4, 5.4].map((r, i) => ({ kind: "wood", shape: "poly", x: 9 + i, y: 4, points: blob(31 + i, r, 0.22, 9) })),
  crater: [[2.2, 1.4], [3, 2.6], [3.6, 2.3]].map(([rx, ry], i) => ({ kind: "crater", shape: "ellipse", x: 2 + i, y: 8, rx, ry })),
};
const ctx = () => ({ fx: { particle() {} }, anim() {}, rand: Math.random });

// Every vertex stays on (or a hair outside) the footprint and under the cap.
function check(obj, t, cap) {
  obj.updateMatrixWorld(true);
  const pts = outline(t), v = new THREE.Vector3();
  let top = -Infinity, worst = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      top = Math.max(top, v.y);
      if (!inside(pts, v.x, v.z)) worst = Math.max(worst, edgeDist(pts, v.x, v.z));
    }
  });
  return { ok: top <= cap + 1e-3 && worst <= 0.2, top, worst };
}

test("every scenery variant stays on its footprint and under its original height", () => {
  for (const [slot, variants] of Object.entries(SCENERY_VARIANTS)) for (const v of variants) for (const t of SHAPES[slot]) {
    const f = check(sceneryVariant(slot, v, t, ctx()), t, SCENERY_CAP[slot]);
    assert.ok(f.ok, `${slot}/${v} top ${f.top.toFixed(2)}/${SCENERY_CAP[slot]} overhang ${f.worst.toFixed(2)}`);
  }
});

test("each scenery kind has several dieselpunk variants", () => {
  for (const slot of ["rock", "ruin", "wood", "crater"]) assert.ok(SCENERY_VARIANTS[slot].length >= 4, slot);
});

test("the same layout looks different under different battle seeds, identical under the same one", () => {
  const field = { width: 54, height: 36, terrain: Object.values(SHAPES).flat() };
  const picks = (dressSeed) => {
    const seed = layoutHash({ ...field, dressSeed });
    const c = { ...ctx(), pick: (tag, t, list) => dressPick(seed, tag, t, list) };
    return field.terrain.map((t) => sceneryProp(t, c).userData.variant).join(",");
  };
  assert.equal(picks("room-A"), picks("room-A"));
  assert.notEqual(picks("room-A"), picks("room-B"));
});
