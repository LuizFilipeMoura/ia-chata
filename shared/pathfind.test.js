// shared/pathfind.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { CELL, buildGrid, isBlocked, findPath } from "./pathfind.js";

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

const OPEN = { width: 20, height: 20 };

test("findPath returns a straight line across open ground", () => {
  const r = findPath(OPEN, [], [], 0, { x: 2, y: 10 }, { x: 12, y: 10 });
  assert.ok(r, "reachable");
  assert.ok(Math.abs(r.length - 10) < 0.5, `expected ~10in, got ${r.length}`);
  assert.equal(r.path.length, 2, "simplified to start + end");
});

test("findPath routes around a wall and costs more than the straight line", () => {
  const wall = { kind: "building", points: [[9, 0], [11, 0], [11, 14], [9, 14]] };
  const r = findPath(OPEN, [wall], [], 0, { x: 5, y: 5 }, { x: 15, y: 5 });
  assert.ok(r, "reachable — the wall stops short of the far edge");
  assert.ok(r.length > 10, "must detour");
  assert.ok(r.path.length > 2, "has a corner");
  // Never cuts the corner: no waypoint sits inside the wall.
  for (const p of r.path) assert.equal(isBlocked(buildGrid(OPEN, [wall], [], 0), p), false);
});

test("findPath returns null when the destination is walled off", () => {
  const box = { kind: "building", points: [[8, 8], [12, 8], [12, 12], [8, 12]] };
  const r = findPath(OPEN, [box], [], 0, { x: 2, y: 2 }, { x: 10, y: 10 });
  assert.equal(r, null, "inside a solid building is unreachable");
});

test("findPath returns null when the destination is open but sealed off", () => {
  // The two nulls above both short-circuit on a BLOCKED destination. This one
  // has an open destination that simply cannot be reached — the case the
  // reachability check actually exists for.
  const room = [
    { kind: "building", points: [[8, 8], [12, 8], [12, 8.5], [8, 8.5]] },
    { kind: "building", points: [[8, 11.5], [12, 11.5], [12, 12], [8, 12]] },
    { kind: "building", points: [[8, 8], [8.5, 8], [8.5, 12], [8, 12]] },
    { kind: "building", points: [[11.5, 8], [12, 8], [12, 12], [11.5, 12]] },
  ];
  assert.equal(isBlocked(buildGrid(OPEN, room, [], 0), { x: 10, y: 10 }), false, "the floor is open");
  assert.equal(findPath(OPEN, room, [], 0, { x: 2, y: 2 }, { x: 10, y: 10 }), null, "but sealed in");
  // Knock out one wall and the same destination becomes reachable.
  assert.ok(findPath(OPEN, room.slice(1), [], 0, { x: 2, y: 2 }, { x: 10, y: 10 }));
});

test("findPath returns null when the destination is off the table", () => {
  assert.equal(findPath(OPEN, [], [], 1.48, { x: 5, y: 5 }, { x: 19.9, y: 10 }), null);
});

test("findPath still returns a drawable 2-point path for a pivot in place", () => {
  // A 0-inch move is legal. Callers draw path[0] -> last and must not need a
  // special case for it, so even a same-cell request yields both endpoints.
  const r = findPath(OPEN, [], [], 0, { x: 5, y: 5 }, { x: 5, y: 5 });
  assert.ok(r, "a pivot is a legal move, not a failed route");
  assert.equal(r.path.length, 2);
  assert.equal(r.length, 0);
});

test("findPath is deterministic — same inputs, same path", () => {
  const wall = { kind: "building", points: [[9, 0], [11, 0], [11, 14], [9, 14]] };
  const a = findPath(OPEN, [wall], [], 0, { x: 5, y: 5 }, { x: 15, y: 5 });
  const b = findPath(OPEN, [wall], [], 0, { x: 5, y: 5 }, { x: 15, y: 5 });
  assert.deepEqual(a, b);
});
