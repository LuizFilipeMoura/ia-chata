// shared/geometry.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  terrainPolygons, segmentHitsPolygon, pointInPolygon, sightCorridor,
  arcOf, distanceBetween, rimGap, meleeInReach, controlsObjective, BASE_RADIUS,
  radiusOf, distToPolygon, clearOfTerrain,
} from "./geometry.js";

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

const SQUARE = { kind: "building", points: [[4, 4], [6, 4], [6, 6], [4, 6]] };

test("pointInPolygon is true inside, false outside", () => {
  assert.equal(pointInPolygon({ x: 5, y: 5 }, SQUARE.points), true);
  assert.equal(pointInPolygon({ x: 0, y: 0 }, SQUARE.points), false);
});

test("segmentHitsPolygon is true for a segment crossing clean through", () => {
  assert.equal(segmentHitsPolygon({ x: 0, y: 5 }, { x: 10, y: 5 }, SQUARE), true);
});

test("segmentHitsPolygon is false for a segment passing clear of it", () => {
  assert.equal(segmentHitsPolygon({ x: 0, y: 0 }, { x: 10, y: 0 }, SQUARE), false);
});

test("segmentHitsPolygon is true when a segment ends inside the polygon", () => {
  assert.equal(segmentHitsPolygon({ x: 0, y: 5 }, { x: 5, y: 5 }, SQUARE), true);
});

test("segmentHitsPolygon is true when a segment lies wholly inside", () => {
  assert.equal(segmentHitsPolygon({ x: 4.5, y: 5 }, { x: 5.5, y: 5 }, SQUARE), true);
});

// Two mediums (r 1.48) facing off along y = 10, 20 inches apart. The corridor
// they project is 2.96in tall: rays at y = 8.52, 10, 11.48.
const A = { pos: { x: 10, y: 10 }, radius: 1.48 };
const B = { pos: { x: 30, y: 10 }, radius: 1.48 };

// A rect centred at (20, yc) that is 2in wide and 2in tall.
const bar = (kind, yc) => ({ kind, points: [[19, yc - 1], [21, yc - 1], [21, yc + 1], [19, yc + 1]] });

test("drawing 1: a blob clear of the corridor gives cover 0", () => {
  const r = sightCorridor(A, B, [bar("building", 16)]); // well below the bottom ray
  assert.equal(r.obstructed, 0);
  assert.equal(r.cover, 0);
  assert.equal(r.los, true);
});

test("drawing 2: a piece over the bottom ray only gives cover 1", () => {
  const r = sightCorridor(A, B, [bar("building", 12.4)]); // spans y 11.4-13.4, catches 11.48 only
  assert.equal(r.obstructed, 1);
  assert.equal(r.cover, 1);
  assert.equal(r.los, true);
});

test("drawing 3: a piece over the centre and bottom rays gives cover 2", () => {
  const r = sightCorridor(A, B, [bar("building", 10.9)]); // spans y 9.9-11.9, catches 10 and 11.48
  assert.equal(r.obstructed, 2);
  assert.equal(r.cover, 2);
  assert.equal(r.los, true);
});

test("a building blocking all 3 rays denies line of sight", () => {
  const wall = { kind: "building", points: [[19, 0], [21, 0], [21, 20], [19, 20]] };
  const r = sightCorridor(A, B, [wall]);
  assert.equal(r.buildingRays, 3);
  assert.equal(r.los, false);
});

test("a BARRICADE blocking all 3 rays is cover 2 and the shot is still legal", () => {
  const wall = { kind: "barricade", points: [[19, 0], [21, 0], [21, 20], [19, 20]] };
  const r = sightCorridor(A, B, [wall]);
  assert.equal(r.obstructed, 3);
  assert.equal(r.buildingRays, 0);
  assert.equal(r.cover, 2, "cover clamps at 2 — only buildings deny the shot");
  assert.equal(r.los, true);
});

test("the corridor is rotation-invariant — a diagonal shot reads the same", () => {
  const a = { pos: { x: 0, y: 0 }, radius: 1.48 };
  const b = { pos: { x: 14.142, y: 14.142 }, radius: 1.48 }; // 20in away, 45 deg
  // A small building dead on the centre line, sized to eat only the centre ray.
  const mid = { kind: "building", points: [[6.6, 7.5], [7.6, 8.5], [8.5, 7.6], [7.5, 6.6]] };
  const r = sightCorridor(a, b, [mid]);
  assert.equal(r.obstructed, 1);
  assert.equal(r.cover, 1);
});

test("two rigs on the same spot degrade safely instead of dividing by zero", () => {
  const r = sightCorridor(A, { pos: { x: 10, y: 10 }, radius: 1.48 }, []);
  assert.equal(r.cover, 0);
  assert.equal(r.los, true);
});

test("BASE_RADIUS is half of each weight class's base diameter", () => {
  assert.equal(BASE_RADIUS.light, 1.18);   // 60mm
  assert.equal(BASE_RADIUS.medium, 1.48);  // 75mm
});

test("radiusOf reads the rig's weight class and defaults to medium", () => {
  assert.equal(radiusOf({ weightClass: "light" }), 1.18);
  assert.equal(radiusOf({ weightClass: "medium" }), 1.48);
  assert.equal(radiusOf({}), 1.48, "unknown class falls back to medium");
});

// A target at the origin facing 0 deg (east, +x). Front arc is facing +/-45.
const T = { pos: { x: 0, y: 0 }, facing: 0 };
const at = (x, y) => ({ pos: { x, y } });

test("arcOf reads front / side / rear off the target's facing", () => {
  assert.equal(arcOf(at(10, 0), T), "front");   // dead ahead
  assert.equal(arcOf(at(10, 9), T), "front");   // 42 deg — inside the 45 cone
  assert.equal(arcOf(at(0, 10), T), "side");    // 90 deg
  assert.equal(arcOf(at(0, -10), T), "side");   // -90 deg
  assert.equal(arcOf(at(-10, 0), T), "rear");   // behind
});

test("arcOf follows the target's facing, not the map", () => {
  const spun = { pos: { x: 0, y: 0 }, facing: 180 };
  assert.equal(arcOf(at(10, 0), spun), "rear");
  assert.equal(arcOf(at(-10, 0), spun), "front");
});

test("distanceBetween is centre to centre", () => {
  assert.equal(distanceBetween(at(0, 0), at(3, 4)), 5);
});

test("rimGap subtracts both radii", () => {
  const a = { pos: { x: 0, y: 0 }, radius: 1.48 };
  const b = { pos: { x: 10, y: 0 }, radius: 1.48 };
  assert.ok(Math.abs(rimGap(a, b) - 7.04) < 1e-9);
});

test("two touching mediums have a 0in rim gap at 2.96in centre distance", () => {
  const a = { pos: { x: 0, y: 0 }, radius: 1.48 };
  const b = { pos: { x: 2.96, y: 0 }, radius: 1.48 };
  assert.ok(Math.abs(rimGap(a, b)) < 1e-9);
  assert.equal(meleeInReach(a, b), true);
});

test("melee reach is 2in of rim gap, 4in with Couched Reach", () => {
  const a = { pos: { x: 0, y: 0 }, radius: 1.48 };
  const near = { pos: { x: 4.9, y: 0 }, radius: 1.48 };  // rim gap 1.94
  const far = { pos: { x: 6, y: 0 }, radius: 1.48 };     // rim gap 3.04
  assert.equal(meleeInReach(a, near), true);
  assert.equal(meleeInReach(a, far), false);
  assert.equal(meleeInReach(a, far, 4), true, "Couched Reach extends to 4in");
});

test("controlsObjective is rim gap within 2in of the marker", () => {
  const rig = { pos: { x: 0, y: 0 }, radius: 1.48 };
  assert.equal(controlsObjective(rig, { x: 3, y: 0 }), true);   // gap 1.52
  assert.equal(controlsObjective(rig, { x: 4, y: 0 }), false);  // gap 2.52
});

test("distToPolygon is 0 inside and the edge distance outside", () => {
  const sq = [[4, 4], [6, 4], [6, 6], [4, 6]];
  assert.equal(distToPolygon({ x: 5, y: 5 }, sq), 0);
  assert.ok(Math.abs(distToPolygon({ x: 2, y: 5 }, sq) - 2) < 1e-9);
});

test("clearOfTerrain accounts for the base radius", () => {
  const wall = { kind: "building", points: [[4, 4], [6, 4], [6, 6], [4, 6]] };
  assert.equal(clearOfTerrain({ x: 2, y: 5 }, 1.48, [wall]), true);   // 2in away
  assert.equal(clearOfTerrain({ x: 3, y: 5 }, 1.48, [wall]), false);  // 1in away
});
