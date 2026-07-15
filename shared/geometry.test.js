// shared/geometry.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainPolygons } from "./geometry.js";

test("terrainPolygons translates a poly's points to absolute inches", () => {
  const field = { terrain: [{ kind: "rock", x: 10, y: 20, shape: "poly", points: [[1, 0], [0, 1], [-1, 0]] }] };
  const [p] = terrainPolygons(field);
  assert.equal(p.kind, "rock");
  assert.deepEqual(p.points, [[11, 20], [10, 21], [9, 20]]);
});

test("terrainPolygons turns an unrotated rect into its 4 corners", () => {
  const field = { terrain: [{ kind: "crate", x: 5, y: 5, shape: "rect", w: 2, h: 4 }] };
  const [p] = terrainPolygons(field);
  assert.deepEqual(p.points, [[4, 3], [6, 3], [6, 7], [4, 7]]);
});

test("terrainPolygons rotates a rect about its centre", () => {
  const field = { terrain: [{ kind: "building", x: 0, y: 0, shape: "rect", w: 2, h: 2, rot: 90 }] };
  const [p] = terrainPolygons(field);
  // A 90 deg spin of a square maps each corner onto the next one.
  for (const [x, y] of p.points) {
    assert.ok(Math.abs(Math.abs(x) - 1) < 1e-9);
    assert.ok(Math.abs(Math.abs(y) - 1) < 1e-9);
  }
});

test("terrainPolygons handles an empty or missing terrain list", () => {
  assert.deepEqual(terrainPolygons({ terrain: [] }), []);
  assert.deepEqual(terrainPolygons({}), []);
});
