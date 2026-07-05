import { test } from "node:test";
import assert from "node:assert/strict";
import {
  halfDiag, OBJ_FRACTION, clampDimensions, computeObjectives,
  emptyCorners, deploymentCorners, scatterTerrain, FIELD_DEFAULT,
} from "./field.js";

// Deterministic RNG for terrain tests (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("OBJ_FRACTION is 18in over the reference half-diagonal", () => {
  assert.ok(Math.abs(OBJ_FRACTION - 18 / halfDiag(54, 36)) < 1e-9);
  assert.ok(Math.abs(OBJ_FRACTION - 0.5547) < 0.001);
});

test("clampDimensions rounds and clamps, falls back on NaN", () => {
  assert.deepEqual(clampDimensions(48.4, 32.6), { width: 48, height: 33 });
  assert.deepEqual(clampDimensions(5, 5), { width: 24, height: 18 });
  assert.deepEqual(clampDimensions(200, 200), { width: 96, height: 72 });
  assert.deepEqual(clampDimensions("x", 30), { width: 54, height: 30 });
});

test("computeObjectives: centre 2VP plus two 1VP markers", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  const objs = computeObjectives(field);
  assert.equal(objs.length, 3);
  assert.deepEqual(objs[0], { x: 27, y: 18, vp: 2 });
  const centre = { x: 27, y: 18 };
  for (const o of objs.slice(1)) {
    assert.equal(o.vp, 1);
    assert.ok(Math.abs(dist(centre, o) - 18) < 1e-6); // exactly 18in on the reference table
  }
});

test("empty and deployment corners swap with the diagonal", () => {
  const f = (d) => ({ width: 54, height: 36, diagonal: d });
  assert.deepEqual(emptyCorners(f("tlbr")), [{ x: 0, y: 0 }, { x: 54, y: 36 }]);
  assert.deepEqual(deploymentCorners(f("tlbr")), [{ x: 54, y: 0 }, { x: 0, y: 36 }]);
  assert.deepEqual(emptyCorners(f("trbl")), [{ x: 54, y: 0 }, { x: 0, y: 36 }]);
});

test("scatterTerrain places 4-6 pieces, deterministic and clear", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  const a = scatterTerrain(field, seeded(1));
  const b = scatterTerrain(field, seeded(1));
  assert.deepEqual(a, b);                       // deterministic under same seed
  assert.ok(a.length >= 4 && a.length <= 6);
  const objs = computeObjectives(field);
  const objClear = 0.12 * halfDiag(54, 36);
  for (const t of a) {
    assert.ok(t.x > 0 && t.x < field.width && t.y > 0 && t.y < field.height);
    assert.ok(["sm", "md"].includes(t.size));
    for (const o of objs) assert.ok(dist(o, t) >= objClear);
  }
});
