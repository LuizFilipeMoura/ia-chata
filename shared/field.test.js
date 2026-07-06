import { test } from "node:test";
import assert from "node:assert/strict";
import {
  halfDiag, OBJ_FRACTION, clampDimensions, computeObjectives,
  emptyCorners, deploymentCorners, scatterTerrain, deployRadius, FIELD_DEFAULT,
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

test("deployRadius is 8in on the reference table and scales with size", () => {
  assert.ok(Math.abs(deployRadius({ width: 54, height: 36 }) - 8) < 1e-9);
  assert.ok(deployRadius({ width: 96, height: 72 }) > 8); // bigger table, wider zone
  assert.ok(deployRadius({ width: 24, height: 18 }) < 8);
});

test("empty and deployment corners swap with the diagonal", () => {
  const f = (d) => ({ width: 54, height: 36, diagonal: d });
  assert.deepEqual(emptyCorners(f("tlbr")), [{ x: 0, y: 0 }, { x: 54, y: 36 }]);
  assert.deepEqual(deploymentCorners(f("tlbr")), [{ x: 54, y: 0 }, { x: 0, y: 36 }]);
  assert.deepEqual(emptyCorners(f("trbl")), [{ x: 54, y: 0 }, { x: 0, y: 36 }]);
});

const KINDS = ["wood", "building", "crater", "ruin", "barricade", "rock", "crate"];
const SHAPES = ["rect", "ellipse", "poly"];

test("scatterTerrain places a varied, deterministic, clear scatter", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  const a = scatterTerrain(field, seeded(1));
  const b = scatterTerrain(field, seeded(1));
  assert.deepEqual(a, b);                       // deterministic under same seed
  assert.ok(a.length >= 6, `expected a dense scatter, got ${a.length}`);
  assert.ok(new Set(a.map((t) => t.kind)).size >= 3); // genuinely varied
  const objs = computeObjectives(field);
  const objClear = 0.10 * halfDiag(54, 36) - 0.05; // centres cleared (fp adds more)
  for (const t of a) {
    assert.ok(t.x > 0 && t.x < field.width && t.y > 0 && t.y < field.height);
    assert.ok(KINDS.includes(t.kind), `bad kind ${t.kind}`);
    assert.ok(SHAPES.includes(t.shape), `bad shape ${t.shape}`);
    if (t.shape === "poly") assert.ok(Array.isArray(t.points) && t.points.length >= 3);
    for (const o of objs) assert.ok(dist(o, t) >= objClear);
  }
});

test("scatterTerrain scales piece count with field area", () => {
  const small = scatterTerrain({ width: 24, height: 18, diagonal: "tlbr" }, seeded(2));
  const big = scatterTerrain({ width: 96, height: 72, diagonal: "tlbr" }, seeded(2));
  assert.ok(big.length > small.length);
});
