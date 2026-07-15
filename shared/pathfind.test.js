// shared/pathfind.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL, buildGrid, isBlocked } from "./pathfind.js";

const FIELD = { width: 20, height: 20 };
const WALL = { kind: "building", points: [[9, 0], [11, 0], [11, 12], [9, 12]] };

test("CELL is a quarter inch", () => {
  assert.equal(CELL, 0.25);
});

test("buildGrid marks cells inside a polygon blocked", () => {
  const g = buildGrid(FIELD, [WALL], [], 0);
  assert.equal(isBlocked(g, { x: 10, y: 5 }), true, "inside the wall");
  assert.equal(isBlocked(g, { x: 3, y: 5 }), false, "well clear of it");
});

test("buildGrid inflates polygons by the mover's radius", () => {
  const bare = buildGrid(FIELD, [WALL], [], 0);
  const fat = buildGrid(FIELD, [WALL], [], 1.48);
  // A point 1in from the wall's edge: clear for a point, blocked for a medium.
  assert.equal(isBlocked(bare, { x: 8, y: 5 }), false);
  assert.equal(isBlocked(fat, { x: 8, y: 5 }), true);
});

test("buildGrid blocks other rigs, inflated by both radii", () => {
  const foe = { pos: { x: 10, y: 10 }, radius: 1.48 };
  const g = buildGrid(FIELD, [], [foe], 1.48);
  assert.equal(isBlocked(g, { x: 10, y: 10 }), true, "on top of it");
  assert.equal(isBlocked(g, { x: 12.5, y: 10 }), true, "2.5in away — inside 2.96 combined");
  assert.equal(isBlocked(g, { x: 14, y: 10 }), false, "4in away — clear");
});

test("buildGrid blocks the field margin so a base can't hang off the table", () => {
  const g = buildGrid(FIELD, [], [], 1.48);
  assert.equal(isBlocked(g, { x: 0.5, y: 10 }), true);
  assert.equal(isBlocked(g, { x: 5, y: 10 }), false);
});

test("buildGrid does NOT block objectives — they are markers, not obstacles", () => {
  // Objectives are simply never passed in as polys or blockers. Guard the
  // contract: an empty obstacle set leaves the interior fully open.
  const g = buildGrid(FIELD, [], [], 0);
  assert.equal(isBlocked(g, { x: 10, y: 10 }), false);
});
