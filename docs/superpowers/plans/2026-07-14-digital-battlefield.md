# Digital Battlefield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Rigs on a simulated field so distance, arc, and cover are derived from geometry instead of declared by the player — the prerequisite for an AI opponent.

**Architecture:** Two new pure modules (`shared/geometry.js`, `shared/pathfind.js`) with zero room-state or dice dependencies, mirroring how `shared/field.js` is already built. `game-state.js` gains a `room.mode` flag; digital rooms compute `distance`/`arc`/`cover` and pass them into the *unchanged* `resolveAttack` signature. `FieldMap.tsx` grows from a static blueprint into the interactive board.

**Tech Stack:** Plain ES modules (`shared/` is imported by both Node and the browser via the `/shared` static mount). Tests: `node --test` for `shared/`, Vitest for `client/`. Run everything with `npm test`.

**Spec:** `docs/superpowers/specs/2026-07-14-digital-battlefield-design.md`

> **⚠ Committing in this repo.** The worktree is routinely dirty, and other sessions commit
> to this branch concurrently. Two rules, both learned the hard way while writing this plan:
>
> 1. **Never `git add -A` / `git add .`.** `git commit` commits the entire index, not just
>    what you added, so a broad add buries unrelated staged work under your message. Stage
>    explicit paths and run `git diff --cached --stat` before every commit.
> 2. **Never rewrite history** (`reset`, `rebase`, `commit --amend`) without re-reading
>    `git log` first. `HEAD~1` may not be your commit by the time you run it.

---

## Background the engineer needs

**Read the spec first.** Then know these things about this codebase:

- `shared/` is dependency-free ES modules imported by BOTH the Node server and the browser. Never import from `client/` there. `field.js` is the model to copy: pure functions, no state, no imports from `game-state.js`.
- `shared/*.test.js` uses `node:test` + `node:assert/strict`, NOT Vitest. Client tests use Vitest. `npm test` runs both.
- **Determinism matters.** `scatterTerrain(field, random)` takes an injected RNG so tests can seed it. Anything random you add MUST do the same. `shared/field.test.js` has a `seeded()` mulberry32 helper — copy it, don't invent one.
- **`resolveAttack` must not change.** It already accepts `opts.distance`, `opts.arc`, `opts.cover`. Digital rooms fill those in; physical rooms keep taking them from the human. `shared/combat.test.js` (2178 lines) must stay green and untouched.
- `reject(msg)` inside `game-state.js` is how an action refuses. `recompute(rig)` refreshes derived rig stats.
- Inches are the unit everywhere. Field coords have origin at top-left, `x` right, `y` down.

**Terrain shapes** (from `field.js` `TERRAIN_KINDS`): a piece is `{ kind, x, y, shape }` plus per-shape geometry — `poly` has `points: [[dx,dy],...]` relative to `(x,y)`; `rect` has `w`, `h`, `rot` (degrees); `ellipse` has `rx`, `ry`, `rot`. Digital rooms only use `building` (rect), `barricade` (rect), `rock` (poly), `crate` (rect).

### The game-state API — get this right or every fixture fails

The task fixtures below were originally drafted against a guessed API. These are the **real**
signatures, verified against the source. Use them:

```js
import { createRoom, claimSide, applyCommand, checkCommand, findRig } from "./game-state.js";

const room = createRoom("CODE01");                    // NOT makeRoom(); takes no options
claimSide(room, { name: "A", side: "a" });
claimSide(room, { name: "B", side: "b" });

// Commands are { verb, attrs } — EVERYTHING lives under `attrs`, never flat:
applyCommand(room, { verb: "add", attrs: {
  name: "Atk", class: "medium", owner: "a", longRange: "Mini Gun", melee: "Sword",
} });

const rig = findRig(room, "Atk");
```

**`applyCommand(room, cmd, context, options)` returns `room` — NOT `{ ok, reason }`.**
To assert a rejection, use `checkCommand(room, cmd)`, which clones, applies, and reports:

```js
const res = checkCommand(room, { verb: "action", attrs: { name: "Atk", action: "move" } });
assert.equal(res.ok, false);
assert.match(res.reason, /Speed/);
```

`lastRejectionReason()` takes **no argument**. `options.random` is how you inject a seeded RNG.

To put a rig mid-activation, set the turn directly (this is what the existing tests do —
copy `battleWithPreparedDefender` at the top of `shared/game-state.test.js`):

```js
room.game.phase = "activation";
room.game.turn = { side: "a", activeRigId: rig.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
rig.loaded = { longRange: true, melee: true };
```

**Read the existing helpers before writing new ones** — `shared/game-state.test.js` already has
`battleWithPreparedDefender`, `startedRoom`, `readyThreeAndThree`, `activate`, `seededRandom`,
`fireMelee`. Reuse them rather than inventing parallel fixtures.

**Base radii:** light 1.18" (60mm), medium 1.48" (75mm). Digital rooms are Rigs only — no Tanks, no Walkers.

---

## File Structure

**Create:**
- `shared/geometry.js` — pure spatial predicates. Polygon conversion, segment intersection, the 3-ray sight corridor, arc, distance, rim gap, objective control. No room state.
- `shared/geometry.test.js` — node tests.
- `shared/pathfind.js` — occupancy grid + A* + path simplification. Depends on `geometry.js` only.
- `shared/pathfind.test.js` — node tests.

**Modify:**
- `shared/field.js` — digital terrain subset in `scatterTerrain`.
- `shared/game-state.js` — `room.mode`, `pos`/`facing` on rigs, auto-deploy, the derivation seam, move-by-path, melee reach check, objective auto-control.
- `client/src/state/types.ts` — types for the new state.
- `client/src/v2/battle/FieldMap.tsx` — unit tokens, arc cones, path preview, click targets.
- `client/src/v2/battle/MoveBody.tsx` — map interaction, drop the timed hold in digital rooms.
- `client/src/v2/overlays/AttackWizard.tsx` — skip the derived steps in digital rooms.
- `rules.md` — measurement, deploy, engagement.

**Dependency order:** geometry → pathfind → field → game-state → types → UI → rules. Each task is committable on its own.

---

### Task 1: Terrain → absolute polygons

Every digital terrain kind becomes one polygon in absolute field inches. One shape to intersect against instead of three.

**Files:**
- Create: `shared/geometry.js`
- Test: `shared/geometry.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/geometry.test.js`
Expected: FAIL — `Cannot find module './geometry.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// shared/geometry.js
// Pure battlefield spatial predicates for digital rooms. Given positions,
// facings, radii, and terrain, derive the distance / arc / cover that a
// physical-room player would otherwise declare with a tape measure. No imports
// from game-state.js so it stays dependency-free and testable on server +
// client, exactly like field.js.

const DEG = Math.PI / 180;

// Base radii in inches, by weight class. Digital rooms are Rigs only.
export const BASE_RADIUS = { light: 1.18, medium: 1.48 }; // 60mm / 75mm

export function radiusOf(rig) {
  return BASE_RADIUS[rig.weightClass] ?? BASE_RADIUS.medium;
}

// A rect's 4 corners, spun about its own centre, in absolute inches.
function rectCorners(t) {
  const w = t.w ?? 2.6;
  const h = t.h ?? 2.6;
  const r = (t.rot ?? 0) * DEG;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([dx, dy]) => [t.x + dx * cos - dy * sin, t.y + dx * sin + dy * cos]);
}

// Every terrain piece as one absolute-inch polygon. Digital rooms only ship
// rect (building/barricade/crate) and poly (rock), but an ellipse is folded in
// as its bounding rect so a legacy physical field can't throw here.
export function terrainPolygons(field) {
  return (field?.terrain || []).map((t) => {
    if (t.shape === "poly" && Array.isArray(t.points)) {
      return { kind: t.kind, points: t.points.map(([dx, dy]) => [t.x + dx, t.y + dy]) };
    }
    if (t.shape === "ellipse") {
      return { kind: t.kind, points: rectCorners({ ...t, w: (t.rx ?? 2) * 2, h: (t.ry ?? 2) * 2 }) };
    }
    return { kind: t.kind, points: rectCorners(t) };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/geometry.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add shared/geometry.js shared/geometry.test.js
git commit -m "feat(geometry): terrain pieces as absolute polygons"
```

---

### Task 2: Segment × polygon intersection

The primitive every ray test rides on.

**Files:**
- Modify: `shared/geometry.js`
- Test: `shared/geometry.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/geometry.test.js`:

```js
import { segmentHitsPolygon, pointInPolygon } from "./geometry.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/geometry.test.js`
Expected: FAIL — `segmentHitsPolygon is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `shared/geometry.js`:

```js
// Standard orientation test. Returns >0 / <0 / 0 for ccw / cw / collinear.
function cross(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function onSegment(ax, ay, bx, by, px, py) {
  return Math.min(ax, bx) - 1e-9 <= px && px <= Math.max(ax, bx) + 1e-9
    && Math.min(ay, by) - 1e-9 <= py && py <= Math.max(ay, by) + 1e-9;
}

// True when segment a1-a2 crosses segment b1-b2, touching included.
export function segmentsIntersect(a1, a2, b1, b2) {
  const d1 = cross(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
  const d2 = cross(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
  const d3 = cross(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
  const d4 = cross(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  // Collinear-touch cases.
  if (Math.abs(d1) < 1e-9 && onSegment(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y)) return true;
  if (Math.abs(d2) < 1e-9 && onSegment(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y)) return true;
  if (Math.abs(d3) < 1e-9 && onSegment(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y)) return true;
  if (Math.abs(d4) < 1e-9 && onSegment(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y)) return true;
  return false;
}

// Ray-casting parity test.
export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const straddles = (yi > p.y) !== (yj > p.y);
    if (straddles && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// True when the segment crosses any edge of the polygon, OR lies wholly inside
// it (no edge crossed, but both endpoints within — a rig standing in terrain).
export function segmentHitsPolygon(a, b, poly) {
  const pts = poly.points;
  for (let i = 0; i < pts.length; i++) {
    const [cx, cy] = pts[i];
    const [dx, dy] = pts[(i + 1) % pts.length];
    if (segmentsIntersect(a, b, { x: cx, y: cy }, { x: dx, y: dy })) return true;
  }
  return pointInPolygon(a, pts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/geometry.test.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add shared/geometry.js shared/geometry.test.js
git commit -m "feat(geometry): segment/polygon intersection primitives"
```

---

### Task 3: The 3-ray sight corridor

The heart of the spec. Three PARALLEL rays — base top/centre/bottom, offset perpendicular to the centre line by each unit's own radius. Count obstructed rays. `cover = min(2, obstructed)`. Only `buildingRays === 3` denies the shot.

The first three tests are the user's hand-drawn cases, verbatim.

**Files:**
- Modify: `shared/geometry.js`
- Test: `shared/geometry.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/geometry.test.js`:

```js
import { sightCorridor } from "./geometry.js";

// Two mediums (r 1.48) facing off along y = 10, 20 inches apart. The corridor
// they project is 2.96in tall: rays at y = 8.52, 10, 11.48.
const A = { pos: { x: 10, y: 10 }, radius: 1.48 };
const B = { pos: { x: 30, y: 10 }, radius: 1.48 };

// A rect centred at (20, yc) that is `w` wide and 2in tall.
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
  // A 2in-square building dead on the centre line, big enough to eat only it.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/geometry.test.js`
Expected: FAIL — `sightCorridor is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `shared/geometry.js`:

```js
// The 3-ray sight corridor (spec: Geometry). Take the centre line A->B, then
// offset perpendicular to it by each unit's OWN radius to get three parallel
// rays: top->top, centre->centre, bottom->bottom. Offsetting perpendicular to
// the shot (rather than along a fixed map axis) is what makes the read
// rotation-invariant — a flanking shot and a frontal shot are graded alike.
//
// Bases differ in radius, so the outer rays converge or diverge slightly. That
// is correct: a light rig shooting a medium gets a wider corridor at the target
// end.
//
// Every ray is tested against EVERY terrain kind — kind matters in exactly one
// place, the buildingRays check. That is the whole content of "everything is
// solid; only buildings block sight". A 1in rock can never obstruct all three,
// so small scatter naturally reads as cover 1 and a long barricade as cover 2.
// Geometry grades cover; there is no cover-class table.
export function sightCorridor(attacker, target, polys) {
  const dx = target.pos.x - attacker.pos.x;
  const dy = target.pos.y - attacker.pos.y;
  const len = Math.hypot(dx, dy);
  // Coincident bases can't happen (rigs block each other) — degrade, don't throw.
  if (len < 1e-9) return { obstructed: 0, buildingRays: 0, cover: 0, los: true };

  const nx = -dy / len; // unit perpendicular to the shot
  const ny = dx / len;

  let obstructed = 0;
  let buildingRays = 0;
  for (const side of [1, 0, -1]) { // top, centre, bottom
    const a = { x: attacker.pos.x + nx * attacker.radius * side, y: attacker.pos.y + ny * attacker.radius * side };
    const b = { x: target.pos.x + nx * target.radius * side, y: target.pos.y + ny * target.radius * side };
    let hit = false;
    let building = false;
    for (const poly of polys) {
      if (!segmentHitsPolygon(a, b, poly)) continue;
      hit = true;
      if (poly.kind === "building") building = true;
    }
    if (hit) obstructed++;
    if (building) buildingRays++;
  }
  return {
    obstructed,
    buildingRays,
    // Lands exactly on combat.js's existing opts.cover clamp of 0-2.
    cover: Math.min(2, obstructed),
    los: buildingRays < 3,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/geometry.test.js`
Expected: PASS, 16 tests

If the drawing 2/3 tests fail, print the ray y-values and check the bar's span against 8.52 / 10 / 11.48. Do NOT adjust the implementation to fit — adjust the test's `yc`, since the geometry is the spec and the fixture is just a fixture.

- [ ] **Step 5: Commit**

```bash
git add shared/geometry.js shared/geometry.test.js
git commit -m "feat(geometry): 3-ray sight corridor derives cover and LOS"
```

---

### Task 4: Arc, distance, rim gap, objective control

The remaining derived values. Note the split measurement model: distance is centre-to-centre; melee reach and objective control are RIM GAP. That's not an inconsistency — centre-measured melee is unreachable, because two mediums can never close inside 2.95".

**Files:**
- Modify: `shared/geometry.js`
- Test: `shared/geometry.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/geometry.test.js`:

```js
import { arcOf, distanceBetween, rimGap, meleeInReach, controlsObjective, BASE_RADIUS, radiusOf } from "./geometry.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/geometry.test.js`
Expected: FAIL — `arcOf is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `shared/geometry.js`:

```js
// Base radii in inches, by weight class. Digital rooms are Rigs only, so these
// two are the whole table. Lives here because base size is a SPATIAL fact —
// it is what makes rim gap differ from centre distance, and it is why melee and
// objectives measure rim while everything else measures centre.
export const BASE_RADIUS = { light: 1.18, medium: 1.48 }; // 60mm / 75mm

export function radiusOf(rig) {
  return BASE_RADIUS[rig.weightClass] ?? BASE_RADIUS.medium;
}

// Which of the target's facings the attacker strikes (rules.md §7). Front is
// the target's facing +/-45 deg, side out to +/-135, rear beyond.
export function arcOf(attacker, target) {
  const bearing = Math.atan2(attacker.pos.y - target.pos.y, attacker.pos.x - target.pos.x) / DEG;
  // Fold into -180..180 relative to where the target is looking.
  const rel = Math.abs((((bearing - (target.facing ?? 0)) % 360) + 540) % 360 - 180);
  if (rel <= 45) return "front";
  if (rel <= 135) return "side";
  return "rear";
}

// Centre to centre. Drives opts.distance and the sweet-spot falloff (§7).
export function distanceBetween(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
}

// The empty air between two bases. Melee and objectives measure this rather
// than centre distance: a 2in CENTRE reach would be unreachable, since two
// mediums block each other at 2.96in and can never get closer.
export function rimGap(a, b) {
  return distanceBetween(a, b) - a.radius - b.radius;
}

// §7 / §12 — melee carries a fixed ACC at its 2in reach. Lance's Couched Reach
// upgrade passes reach = 4.
export function meleeInReach(a, b, reach = 2) {
  return rimGap(a, b) <= reach + 1e-9;
}

// §11 — a Rig controls a marker if it is within 2in. Markers are points, so
// only the rig's own radius comes off.
export function controlsObjective(rig, marker, reach = 2) {
  const gap = Math.hypot(rig.pos.x - marker.x, rig.pos.y - marker.y) - rig.radius;
  return gap <= reach + 1e-9;
}

// Distance from a point to a polygon: 0 if inside, else the nearest edge.
// Lives here rather than in pathfind.js because BOTH the occupancy grid and
// autoDeploy need "is this spot clear for a base of radius r" — and two copies
// of this would be two chances to disagree about what "clear" means.
export function distToPolygon(p, pts) {
  if (pointInPolygon(p, pts)) return 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / len2));
    best = Math.min(best, Math.hypot(p.x - (ax + t * vx), p.y - (ay + t * vy)));
  }
  return best;
}

// True when a base of `radius` centred at `p` clears every polygon.
export function clearOfTerrain(p, radius, polys) {
  return !polys.some((poly) => distToPolygon(p, poly.points) <= radius);
}
```

Add the matching tests to `shared/geometry.test.js`:

```js
import { distToPolygon, clearOfTerrain } from "./geometry.js";

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/geometry.test.js`
Expected: PASS, 23 tests

- [ ] **Step 5: Commit**

```bash
git add shared/geometry.js shared/geometry.test.js
git commit -m "feat(geometry): arc, distance, rim gap, objective control"
```

---

### Task 5: Digital terrain subset

Digital rooms scatter only `building`, `barricade`, `rock`, `crate`. `wood`, `crater`, and `ruin` are dropped because pure ray-counting lies about them — a wood becomes a wall, a crater is a hole that reads as a wall.

**Files:**
- Modify: `shared/field.js` (`TERRAIN_KINDS` and `scatterTerrain`)
- Test: `shared/field.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/field.test.js`:

```js
import { DIGITAL_TERRAIN_KINDS } from "./field.js";

test("DIGITAL_TERRAIN_KINDS is the 4 kinds pure ray-counting reads correctly", () => {
  assert.deepEqual([...DIGITAL_TERRAIN_KINDS].sort(), ["barricade", "building", "crate", "rock"]);
});

test("scatterTerrain digital mode emits only the 4 digital kinds", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  const pieces = scatterTerrain(field, seeded(7), { digital: true });
  assert.ok(pieces.length > 0, "still dresses the field");
  for (const p of pieces) assert.ok(DIGITAL_TERRAIN_KINDS.has(p.kind), `unexpected kind: ${p.kind}`);
  assert.ok(pieces.some((p) => p.kind === "building"), "at least one LOS blocker");
});

test("scatterTerrain default (physical) still emits the full vocabulary", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  const pieces = scatterTerrain(field, seeded(7));
  assert.ok(pieces.some((p) => !DIGITAL_TERRAIN_KINDS.has(p.kind)), "physical keeps wood/crater/ruin");
});

test("scatterTerrain stays deterministic under a seeded RNG in digital mode", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  assert.deepEqual(scatterTerrain(field, seeded(3), { digital: true }), scatterTerrain(field, seeded(3), { digital: true }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/field.test.js`
Expected: FAIL — `DIGITAL_TERRAIN_KINDS is not defined`

- [ ] **Step 3: Write minimal implementation**

In `shared/field.js`, add above `scatterTerrain`:

```js
// The terrain vocabulary a digital room scatters. wood / crater / ruin are
// excluded: the 3-ray cover model (geometry.js) grades by pure geometry, and
// those three lie about themselves under it — a wood is a 3.4-5.4in blob that
// eats all three rays and reads as a WALL, and a crater is a hole that would do
// the same. Every kind kept here reads correctly with no cover-class table.
// A physical room is unaffected — you adjudicate a wood yourself at the table.
export const DIGITAL_TERRAIN_KINDS = new Set(["building", "barricade", "rock", "crate"]);
```

Then change the signature and the kind loop:

```js
export function scatterTerrain(field, random = Math.random, opts = {}) {
  const rand = typeof random === "function" ? random : Math.random;
  const kinds = opts.digital ? TERRAIN_KINDS.filter((k) => DIGITAL_TERRAIN_KINDS.has(k.kind)) : TERRAIN_KINDS;
```

and in the count loop, iterate `kinds` instead of `TERRAIN_KINDS`:

```js
  for (const spec of kinds) {
```

Everything else in the function is untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/field.test.js`
Expected: PASS — existing field tests still green (the new arg is optional and defaults to physical)

- [ ] **Step 5: Commit**

```bash
git add shared/field.js shared/field.test.js
git commit -m "feat(field): digital rooms scatter a 4-kind terrain subset"
```

---

### Task 5b: Mirrored, rectangles-only, deploy-zone-clear terrain

Three changes to `scatterTerrain`, decided after Task 9's deployment probe found the 4v4
seed roster failing on 0.6% of seeds.

**Files:**
- Modify: `shared/field.js` (`TERRAIN_KINDS`, `scatterTerrain`)
- Test: `shared/field.test.js`

**The three decisions:**

1. **Terrain clears the full deploy zone (physical AND digital).** `cornerClear` is currently
   `0.18 * hd` ≈ 5.84" on the reference table, but `deployRadius(field)` is 8". So terrain
   legally spawns in the outer third of the staging area. Measured: the shipped
   `SEED_ROSTER_4V4` (2 medium + 2 light per side) leaves its 4th rig undeployed on 23 of
   4000 rigs across 500 seeds — always the last one added, because terrain ate the corner.
   Change `cornerClear` to `deployRadius(field)`. This is not digital-only: terrain should
   not spawn in your staging area on a real table either.

2. **Digital terrain is rectangles only.** `rock` is the last `poly` blob; give it a rect
   `make` in digital mode. One shape, one code path.

3. **Digital terrain mirrors 180° about the field centre.** Scatter into the half-plane on
   one side of the empty-corner diagonal, then duplicate every piece rotated half a turn
   about the centre. That maps one deployment corner exactly onto the other, so each side
   sees an identical board from its own corner.

   Geometry notes that matter:
   - The mirror of a piece at `(x, y)` is `(width - x, height - y)`.
   - A **rect is centrally symmetric**, so `rot` is unchanged by a 180° turn — do NOT add 180
     to it. (This is only true because of decision 2. If a poly ever returns, its points must
     be negated.)
   - A piece straddling the diagonal would overlap its own mirror. Require each candidate's
     centre to clear the diagonal by at least its own footprint radius `fp`.
   - Halve the per-kind counts before mirroring, or the board ends up twice as dense.

- [ ] **Step 1: Write the failing tests**

Append to `shared/field.test.js`:

```js
import { DIGITAL_TERRAIN_KINDS, deployRadius, scatterTerrain, FIELD_DEFAULT } from "./field.js";

const mirrorOf = (field, p) => ({ x: field.width - p.x, y: field.height - p.y });
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

test("digital terrain is rectangles only — no poly blobs", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  for (const p of scatterTerrain(field, seeded(4), { digital: true })) {
    assert.equal(p.shape, "rect", `${p.kind} is a ${p.shape}`);
  }
});

test("digital terrain mirrors 180 degrees about the field centre", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  const pieces = scatterTerrain(field, seeded(4), { digital: true });
  assert.ok(pieces.length >= 2 && pieces.length % 2 === 0, `expected pairs, got ${pieces.length}`);
  for (const p of pieces) {
    const m = mirrorOf(field, p);
    const twin = pieces.find((q) => q !== p && q.kind === p.kind && near(q.x, m.x) && near(q.y, m.y));
    assert.ok(twin, `${p.kind} at (${p.x}, ${p.y}) has no twin at (${m.x.toFixed(2)}, ${m.y.toFixed(2)})`);
    assert.ok(near(twin.w, p.w) && near(twin.h, p.h), "a twin must be the same size");
  }
});

test("scatterTerrain keeps every piece clear of both deployment zones", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  const rad = deployRadius(field);
  for (const digital of [true, false]) {
    for (let s = 1; s <= 40; s++) {
      const pieces = scatterTerrain(field, seeded(s), digital ? { digital: true } : undefined);
      for (const p of pieces) {
        for (const c of deploymentCorners(field)) {
          assert.ok(dist(c, p) >= rad, `${digital ? "digital" : "physical"} seed ${s}: ${p.kind} is ${dist(c, p).toFixed(2)}in from a deploy corner, zone is ${rad.toFixed(2)}`);
        }
      }
    }
  }
});

test("physical terrain keeps its full vocabulary and stays unmirrored", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  const pieces = scatterTerrain(field, seeded(4));
  assert.ok(pieces.some((p) => !DIGITAL_TERRAIN_KINDS.has(p.kind)), "physical keeps wood/crater/ruin");
  assert.ok(pieces.some((p) => p.shape === "poly"), "physical keeps organic blobs");
});

test("digital scatter is still deterministic under a seeded RNG", () => {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr" };
  assert.deepEqual(
    scatterTerrain(field, seeded(9), { digital: true }),
    scatterTerrain(field, seeded(9), { digital: true }),
  );
});
```

**Note:** the deploy-clearance test asserts `dist(corner, piece) >= rad` on the piece CENTRE.
Whether it should be centre or footprint-edge is a judgement call — a big building whose
centre is 8.1" out still overhangs the zone. Decide, make the test say what you decided, and
justify it in your report. Centre-based is the cheaper, looser choice; `dist >= rad + p.fp`
is the strict one, but `fp` is stripped from the wire payload, so the test would need to
re-derive it.

- [ ] **Step 2: Run to verify failure**

Run: `node --test shared/field.test.js`
Expected: FAIL — poly rocks present, no mirrored twins, pieces inside the deploy zone.

- [ ] **Step 3: Implement**

In `shared/field.js`:

```js
// Terrain must not spawn in a staging area. This used to be 0.18 * halfDiag
// (~5.84in on the reference table) while the deploy zone reaches 8in, so pieces
// intruded into the outer third of it — measured: the 4v4 seed roster's last rig
// found no legal spot on 0.6% of seeds. Physical rooms get this too; terrain in
// your own corner is wrong on a real table as well.
const cornerClear = deployRadius(field);
```

For rectangles-only, give `rock` a digital rect variant rather than forking `TERRAIN_KINDS`.
Add a `makeDigital` to the `rock` entry and prefer it when `opts.digital`:

```js
{ kind: "rock", min: 2, max: 4,
  make(rand) { /* ...existing poly blob, unchanged for physical... */ },
  // Digital maps are rectangles only: one shape, one code path for the ray
  // tests and the occupancy grid.
  makeDigital(rand) {
    const w = rrange(rand, 1.6, 3.2);
    const h = w * rrange(rand, 0.7, 1.05);
    return { shape: "rect", w: round2(w), h: round2(h), rot: round2(rrange(rand, 0, 180)), fp: Math.hypot(w, h) / 2 };
  } },
```

For the mirror, place into one half-plane then duplicate. The empty-corner diagonal is the
dividing line (`emptyCorners(field)` gives its two endpoints):

```js
// Which side of the empty-corner diagonal a point falls on, and how far.
// Pieces are scattered on ONE side and mirrored to the other, so each player
// sees an identical board from their own corner.
function diagonalSide(field, p) {
  const [e0, e1] = emptyCorners(field);
  return ((e1.x - e0.x) * (p.y - e0.y) - (e1.y - e0.y) * (p.x - e0.x)) / Math.hypot(e1.x - e0.x, e1.y - e0.y);
}
```

Then in the placement loop, when `opts.digital`: reject a candidate unless
`diagonalSide(field, p) > piece.fp` (strictly one side, clear of the diagonal by its own
footprint so it can't overlap its own mirror), and after the loop emit each placed piece
plus its twin:

```js
  // A 180 deg turn about the centre maps one deployment corner onto the other.
  // A rect is centrally symmetric, so `rot` is unchanged by the turn — this is
  // only true because digital terrain is rectangles only.
  const mirrored = placed.flatMap((p) => [p, { ...p, x: round2(field.width - p.x), y: round2(field.height - p.y) }]);
```

Halve the per-kind counts in digital mode so the mirrored board isn't twice as dense.

- [ ] **Step 4: Run**

Run: `node --test "shared/*.test.js"`
Expected: PASS. Existing physical terrain tests must stay green EXCEPT any that assert the
old corner clearance — if one breaks because terrain moved out of the deploy zone, that test
was encoding the bug; update it and say so.

- [ ] **Step 5: Re-probe deployment**

The whole point of change 1. Confirm the 4v4 roster now deploys clean:

```bash
node --test shared/game-state.test.js
```
and report whether the `autoDeploy` tests still pass.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(field): mirrored rect-only digital terrain, clear of deploy zones" -- shared/field.js shared/field.test.js
```

---

### Task 6: Occupancy grid

A* needs a grid. Obstacles are inflated by the mover's radius so the mover is a POINT against fat obstacles — the standard trick, and it makes the swept-corridor check free.

**Files:**
- Create: `shared/pathfind.js`
- Test: `shared/pathfind.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/pathfind.test.js`
Expected: FAIL — `Cannot find module './pathfind.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// shared/pathfind.js
// Movement routing for digital rooms. A grid A* over the field with obstacles
// inflated by the mover's base radius, so the mover is a POINT against fat
// obstacles — the standard trick, and it makes the swept-corridor check free.
//
// Pure and deterministic: same inputs, same path, always. Depends only on
// geometry.js. The client calls this for its hover preview and the server calls
// it again to apply the move, so the two can never disagree — and the server
// never takes a client-supplied path on faith.
import { distToPolygon } from "./geometry.js";

export const CELL = 0.25; // inches per grid cell

// An occupancy grid for ONE mover. `polys` are terrain (geometry.terrainPolygons),
// `blockers` are the other rigs ({ pos, radius }) — the mover itself must not be
// in that list. Objectives are never passed: they are markers, not obstacles.
export function buildGrid(field, polys, blockers, radius) {
  const cols = Math.ceil(field.width / CELL) + 1;
  const rows = Math.ceil(field.height / CELL) + 1;
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { x: c * CELL, y: r * CELL };
      let bad = false;
      // The base must sit wholly on the table.
      if (p.x < radius || p.y < radius || p.x > field.width - radius || p.y > field.height - radius) bad = true;
      if (!bad) for (const poly of polys) {
        if (distToPolygon(p, poly.points) <= radius) { bad = true; break; }
      }
      if (!bad) for (const b of blockers) {
        if (Math.hypot(p.x - b.pos.x, p.y - b.pos.y) <= radius + b.radius) { bad = true; break; }
      }
      if (bad) blocked[r * cols + c] = 1;
    }
  }
  return { cols, rows, blocked, field };
}

export function cellOf(p) {
  return { c: Math.round(p.x / CELL), r: Math.round(p.y / CELL) };
}

export function isBlocked(grid, p) {
  const { c, r } = cellOf(p);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return true;
  return grid.blocked[r * grid.cols + c] === 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/pathfind.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add shared/pathfind.js shared/pathfind.test.js
git commit -m "feat(pathfind): occupancy grid with radius-inflated obstacles"
```

---

### Task 7: A* + path simplification

8-connected A*. Then a string-pulling pass: a raw grid path is jagged and its length would overstate the real travel, which matters because length is checked against Speed.

**Files:**
- Modify: `shared/pathfind.js`
- Test: `shared/pathfind.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/pathfind.test.js`:

```js
import { findPath } from "./pathfind.js";

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

test("findPath returns null when the destination is off the table", () => {
  assert.equal(findPath(OPEN, [], [], 1.48, { x: 5, y: 5 }, { x: 19.9, y: 10 }), null);
});

test("findPath is deterministic — same inputs, same path", () => {
  const wall = { kind: "building", points: [[9, 0], [11, 0], [11, 14], [9, 14]] };
  const a = findPath(OPEN, [wall], [], 0, { x: 5, y: 5 }, { x: 15, y: 5 });
  const b = findPath(OPEN, [wall], [], 0, { x: 5, y: 5 }, { x: 15, y: 5 });
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/pathfind.test.js`
Expected: FAIL — `findPath is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `shared/pathfind.js`:

```js
// True when the straight segment a->b crosses no blocked cell. Used to
// string-pull the jagged grid path back to real straight runs.
function clearLine(grid, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 2));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    if (isBlocked(grid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

// Greedy string-pulling: keep the farthest waypoint still reachable in a
// straight line. A raw 8-connected path zig-zags, and its length would
// OVERSTATE the real travel — which matters, because length is what gets
// checked against Speed.
function simplify(grid, pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clearLine(grid, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function pathLength(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// Route `from` -> `to` for a mover of `radius`. Returns { path, length } in
// inches, or null when the destination is unreachable or off the table.
// Deterministic: the open set is drained in a fixed order, so ties always break
// the same way.
export function findPath(field, polys, blockers, radius, from, to) {
  const grid = buildGrid(field, polys, blockers, radius);
  const start = cellOf(from);
  const goal = cellOf(to);
  const idx = (c, r) => r * grid.cols + c;
  if (isBlocked(grid, to)) return null;

  const startI = idx(start.c, start.r);
  const goalI = idx(goal.c, goal.r);
  if (startI === goalI) return { path: [{ ...from }], length: 0 };

  const g = new Float64Array(grid.cols * grid.rows).fill(Infinity);
  const came = new Int32Array(grid.cols * grid.rows).fill(-1);
  const done = new Uint8Array(grid.cols * grid.rows);
  const h = (c, r) => Math.hypot(c - goal.c, r - goal.r);
  g[startI] = 0;

  // Simple binary heap keyed on f = g + h.
  const heap = [{ i: startI, f: h(start.c, start.r) }];
  const push = (n) => {
    heap.push(n);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p].f <= heap[k].f) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r2 = l + 1;
        let s = k;
        if (l < heap.length && heap[l].f < heap[s].f) s = l;
        if (r2 < heap.length && heap[r2].f < heap[s].f) s = r2;
        if (s === k) break;
        [heap[s], heap[k]] = [heap[k], heap[s]];
        k = s;
      }
    }
    return top;
  };

  while (heap.length) {
    const { i } = pop();
    if (done[i]) continue;
    done[i] = 1;
    if (i === goalI) break;
    const c = i % grid.cols;
    const r = (i - c) / grid.cols;
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const ni = idx(nc, nr);
      if (grid.blocked[ni] || done[ni]) continue;
      // No corner-cutting: a diagonal needs both orthogonal neighbours open.
      if (dc && dr && (grid.blocked[idx(c + dc, r)] || grid.blocked[idx(c, r + dr)])) continue;
      const tentative = g[i] + cost;
      if (tentative >= g[ni]) continue;
      g[ni] = tentative;
      came[ni] = i;
      push({ i: ni, f: tentative + h(nc, nr) });
    }
  }

  if (came[goalI] === -1 && startI !== goalI) return null;

  const cells = [];
  for (let i = goalI; i !== -1; i = came[i]) {
    const c = i % grid.cols;
    cells.push({ x: c * CELL, y: ((i - c) / grid.cols) * CELL });
    if (i === startI) break;
  }
  cells.reverse();
  // Snap the ends to the true request so the preview matches the click exactly.
  cells[0] = { ...from };
  cells[cells.length - 1] = { ...to };
  const path = simplify(grid, cells);
  return { path, length: pathLength(path) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/pathfind.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add shared/pathfind.js shared/pathfind.test.js
git commit -m "feat(pathfind): A* routing with string-pulled path simplification"
```

---

### Task 8: Room mode + rig position state

**Files:**
- Modify: `shared/game-state.js` (room creation ~line 723 and ~line 900; rig defaults ~line 1008; the `hydrate`/normalise block ~line 780-860)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Append to `shared/game-state.test.js`. Add this local helper next to the file's existing ones:

```js
// A claimed 2-side room in digital mode. createRoom takes no options, so the
// mode is stamped on afterwards — the normalise pass (ensureGameShape) is what
// gives rigs their pos/facing, and it runs on the next applyCommand.
function digitalRoom(code = "DIG001") {
  const room = createRoom(code);
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  return room;
}
```

```js
test("a room defaults to physical mode", () => {
  assert.equal(createRoom("PHYS01").mode, "physical");
});

test("a digital room is rigs-only — adding a tank is refused", () => {
  const room = digitalRoom();
  const res = checkCommand(room, { verb: "add", attrs: {
    name: "T1", kind: "tank", owner: "a", unit: "Autocannon",
  } });
  assert.equal(res.ok, false);
  assert.match(res.reason, /Rigs only/i);
});

test("a digital room still accepts a rig", () => {
  const room = digitalRoom();
  applyCommand(room, { verb: "add", attrs: {
    name: "R1", class: "light", owner: "a", longRange: "Autocannon", melee: "Claw",
  } });
  assert.equal(room.rigs.length, 1);
});

test("rigs in a digital room carry pos and facing; physical rigs do not", () => {
  const digital = digitalRoom();
  applyCommand(digital, { verb: "add", attrs: {
    name: "R1", class: "light", owner: "a", longRange: "Autocannon", melee: "Claw",
  } });
  const r = findRig(digital, "R1");
  assert.deepEqual(r.pos, { x: 0, y: 0 }, "seeded at the origin until deployment scatters it");
  assert.equal(r.facing, 0);

  const physical = createRoom("PHYS02");
  claimSide(physical, { name: "A", side: "a" });
  applyCommand(physical, { verb: "add", attrs: {
    name: "R1", class: "light", owner: "a", longRange: "Autocannon", melee: "Claw",
  } });
  assert.equal(findRig(physical, "R1").pos, undefined, "physical rooms have no simulated position");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `room.mode` is undefined

- [ ] **Step 3: Write minimal implementation**

In `shared/game-state.js` room creation (both sites — ~line 723 and the `room.field` repair at ~line 900), add the mode flag:

```js
  // Physical rooms are the tabletop companion: the player declares distance /
  // arc / cover off a real table. Digital rooms simulate the field, so those
  // three are derived from geometry instead (spec: Room modes). Physical is the
  // default — every pre-mode save loads as physical and behaves exactly as before.
  if (room.mode !== "digital") room.mode = "physical";
```

In the rig normalise block (near the other `if (rig.x === undefined)` defaults, ~line 780-860):

```js
  // Simulated position, digital rooms only. Inches, field coords, CENTRE of
  // base. A physical rig never gets these — there is no simulated field to
  // stand on, and an undefined pos is how the derivation seam tells the modes
  // apart.
  if (room.mode === "digital") {
    if (!rig.pos) rig.pos = { x: 0, y: 0 };
    if (typeof rig.facing !== "number") rig.facing = 0;
  }
```

In the `add` verb handler (~line 3047), before the kind is honoured:

```js
    if (room.mode === "digital" && kind !== "rig") {
      reject("Digital battles are Rigs only — no Tanks or Walkers.");
    } else
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS — and every pre-existing game-state test stays green (physical is the default)

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(state): room.mode plus pos/facing on digital rigs"
```

---

### Task 9: Auto-scatter deployment

Engine places both sides legally inside their deploy radius. No deploy phase, no placement UI. Deterministic under an injected RNG, same as `scatterTerrain`.

Note: the deploy zone's 8" is now measured to the base CENTRE, not the nearest edge (spec: Measurement model).

**Files:**
- Modify: `shared/game-state.js` (the `ready` verb, ~line 3125)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { deploymentCorners, deployRadius } from "./field.js";
import { radiusOf } from "./geometry.js";

test("autoDeploy places every rig inside its own deployment radius", () => {
  const room = digitalRoomWithMirroredRigs(); // 2 light rigs per side
  autoDeploy(room, seeded(11));
  const [ownerC, foeC] = deploymentCorners(room.field);
  const rad = deployRadius(room.field);
  for (const rig of room.rigs) {
    const corner = rig.owner === room.game.sides[0].id ? ownerC : foeC;
    const d = Math.hypot(rig.pos.x - corner.x, rig.pos.y - corner.y);
    assert.ok(d <= rad + 1e-6, `${rig.name} is ${d.toFixed(2)}in from its corner, radius is ${rad.toFixed(2)}`);
  }
});

test("autoDeploy never overlaps two rigs", () => {
  const room = digitalRoomWithMirroredRigs();
  autoDeploy(room, seeded(11));
  for (let i = 0; i < room.rigs.length; i++) {
    for (let j = i + 1; j < room.rigs.length; j++) {
      const a = room.rigs[i];
      const b = room.rigs[j];
      const gap = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) - radiusOf(a) - radiusOf(b);
      assert.ok(gap >= -1e-6, `${a.name} and ${b.name} overlap by ${(-gap).toFixed(2)}in`);
    }
  }
});

test("autoDeploy faces every rig toward the field centre", () => {
  const room = digitalRoomWithMirroredRigs();
  autoDeploy(room, seeded(11));
  for (const rig of room.rigs) {
    const want = Math.atan2(room.field.height / 2 - rig.pos.y, room.field.width / 2 - rig.pos.x) * 180 / Math.PI;
    const diff = Math.abs(((rig.facing - want + 540) % 360) - 180);
    assert.ok(diff < 1e-6, `${rig.name} faces ${rig.facing}, wanted ${want}`);
  }
});

test("autoDeploy is deterministic under a seeded RNG", () => {
  const a = digitalRoomWithMirroredRigs();
  const b = digitalRoomWithMirroredRigs();
  autoDeploy(a, seeded(5));
  autoDeploy(b, seeded(5));
  assert.deepEqual(a.rigs.map((r) => r.pos), b.rigs.map((r) => r.pos));
});
```

Write `digitalRoomWithMirroredRigs()` as a local helper in the test file: a `mode: "digital"` room, `field` scattered with `{ digital: true }`, and 2 light rigs added per side via `applyCommand`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `autoDeploy is not defined`

- [ ] **Step 3: Write minimal implementation**

In `shared/game-state.js`, import the new modules at the top (alongside the existing `field.js` import):

```js
import { radiusOf, terrainPolygons } from "./geometry.js";
```

Then add near the other room helpers:

```js
// Auto-scatter deployment (spec: Deployment). The engine drops both squadrons
// legally inside their own corner; there is no deploy phase and no placement
// UI. Deterministic under an injected RNG, exactly like scatterTerrain.
//
// The 8in zone is measured to the base CENTRE, not the nearest edge — the
// measurement rebase (spec) made centre the default everywhere except melee
// reach and objective control.
export function autoDeploy(room, random = Math.random) {
  const rand = typeof random === "function" ? random : Math.random;
  const [ownerC, foeC] = deploymentCorners(room.field);
  const rad = deployRadius(room.field);
  const polys = terrainPolygons(room.field);
  const centre = { x: room.field.width / 2, y: room.field.height / 2 };
  const placed = [];

  for (const rig of room.rigs) {
    if (rig.destroyed) continue;
    const corner = rig.owner === room.game.sides[0].id ? ownerC : foeC;
    const r = radiusOf(rig);
    for (let attempt = 0; attempt < 400; attempt++) {
      // sqrt of the roll spreads points evenly over the disc instead of
      // clumping them at the corner.
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * rad;
      const p = { x: corner.x + Math.cos(a) * d, y: corner.y + Math.sin(a) * d };
      if (p.x < r || p.y < r || p.x > room.field.width - r || p.y > room.field.height - r) continue;
      // The whole base must clear the terrain, not just the centre point — the
      // same "clear for a base of radius r" test the occupancy grid uses, so a
      // rig can never be deployed somewhere it could not have walked to.
      if (!clearOfTerrain(p, r, polys)) continue;
      if (placed.some((q) => Math.hypot(q.pos.x - p.x, q.pos.y - p.y) < r + q.r)) continue;
      rig.pos = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
      // Squadrons start clustered in their corner and advance across the
      // diagonal (§10) — so everyone starts looking at the contested centre.
      rig.facing = Math.atan2(centre.y - rig.pos.y, centre.x - rig.pos.x) * 180 / Math.PI;
      placed.push({ pos: rig.pos, r });
      break;
    }
  }
}
```

Add `clearOfTerrain` to the `geometry.js` import list.

In the `ready` verb, after the parity gate passes and the battle starts, call it for digital rooms:

```js
    if (room.mode === "digital") {
      if (!room.field.terrain.length) room.field.terrain = scatterTerrain(room.field, options.random, { digital: true });
      autoDeploy(room, options.random);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS, 4 new tests

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(state): auto-scatter deployment for digital rooms"
```

---

### Task 10: The derivation seam

**The most important task in the plan.** In a digital room, overwrite `a.distance`, `a.arc`, and `a.cover` from geometry before `resolveFire` reads them, and refuse a shot with no LOS. `resolveAttack`'s signature does not change. `combat.test.js` stays untouched.

**Files:**
- Modify: `shared/game-state.js` (`resolveFire`, ~line 2095)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("digital rooms derive distance/arc/cover and ignore what the client claimed", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a, b] = room.rigs;
  room.field.terrain = []; // clean field — no cover
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 20, y: 10 }; b.facing = 0; // shot lands in b's REAR (b looks away)
  const derived = deriveAttackGeometry(room, a, b);
  assert.ok(Math.abs(derived.distance - 10) < 1e-9, "centre to centre");
  assert.equal(derived.arc, "rear");
  assert.equal(derived.cover, 0);
  assert.equal(derived.los, true);
});

test("digital rooms derive cover from a building in the corridor", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a, b] = room.rigs;
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 30, y: 10 }; b.facing = 180;
  // A wall spanning the whole corridor.
  room.field.terrain = [{ kind: "building", x: 20, y: 10, shape: "rect", w: 2, h: 20 }];
  const derived = deriveAttackGeometry(room, a, b);
  assert.equal(derived.los, false);
});

test("a digital ranged attack with no line of sight is refused", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a, b] = room.rigs;
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 30, y: 10 }; b.facing = 180;
  room.field.terrain = [{ kind: "building", x: 20, y: 10, shape: "rect", w: 2, h: 20 }];
  startActivationFor(room, a); // test helper: put `a` on the clock
  const res = applyCommand(room, {
    verb: "action", name: a.name, action: "fire",
    attack: { weapon: "longRange", target: b.name, arc: "front", cover: 0, distance: 1 },
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /line of sight/i);
});

test("a digital melee attack out of rim reach is refused", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a, b] = room.rigs;
  room.field.terrain = [];
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 20, y: 10 }; b.facing = 180; // ~7.6in of rim gap, way past 2in
  startActivationFor(room, a);
  const res = applyCommand(room, {
    verb: "action", name: a.name, action: "fire",
    attack: { weapon: "melee", target: b.name },
  });
  assert.equal(res.ok, false);
  assert.match(res.reason, /reach/i);
});

test("physical rooms still take the player's declared values verbatim", () => {
  const room = physicalRoomWithMirroredRigs();
  const [a, b] = room.rigs;
  startActivationFor(room, a);
  const res = applyCommand(room, {
    verb: "action", name: a.name, action: "fire",
    attack: { weapon: "longRange", target: b.name, arc: "rear", cover: 2, distance: 14, dice: [6, 6] },
  });
  assert.equal(res.ok, true, "no geometry, no refusal — the human measured it");
});
```

`startActivationFor` and `physicalRoomWithMirroredRigs` are local test helpers — build them from the existing patterns in `shared/game-state.test.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `deriveAttackGeometry is not defined`

- [ ] **Step 3: Write minimal implementation**

Add `sightCorridor`, `arcOf`, `distanceBetween`, `meleeInReach` to the `geometry.js` import in `game-state.js`. Then, above `resolveFire`:

```js
// THE SEAM (spec: Geometry / The seam). In a physical room the player reads
// distance / arc / cover off a real table and declares them. In a digital room
// we derive the same three values from the simulated field and pass them into
// the SAME resolveAttack signature. resolveAttack does not know which mode it
// is in, and combat.test.js never has to change.
//
// A rig carries `radius` nowhere in state — it is derived from weight class, so
// bolt it on here for the geometry helpers, which want { pos, facing, radius }.
function spatial(rig) {
  return { pos: rig.pos, facing: rig.facing, radius: radiusOf(rig) };
}

export function deriveAttackGeometry(room, attacker, target) {
  const a = spatial(attacker);
  const b = spatial(target);
  const corridor = sightCorridor(a, b, terrainPolygons(room.field));
  return {
    distance: distanceBetween(a, b),
    arc: arcOf(a, b),
    cover: corridor.cover,
    los: corridor.los,
    inMeleeReach: meleeInReach(a, b, meleeReachOf(attacker)),
  };
}

// Lance's Couched Reach upgrade (§13) buys +2in of reach; everything else
// swings at the standard 2in (§7).
function meleeReachOf(rig) {
  return effectiveWeaponProfile("melee", rig.weapons?.melee, rig)?.upgradeEffect?.couchedReach ? 4 : 2;
}
```

Inside `resolveFire`, immediately after `const slot = ...`:

```js
  // Digital rooms overwrite whatever the client claimed. The client is never
  // trusted for geometry: it has the same pure modules and can preview with
  // them, but the engine measures for itself.
  if (room.mode === "digital") {
    const geo = deriveAttackGeometry(room, rig, target);
    if (slot === "melee") {
      if (!geo.inMeleeReach) return reject(`${target.name} is out of melee reach.`);
    } else if (!geo.los) {
      return reject(`No line of sight to ${target.name}.`);
    }
    a = { ...a, distance: geo.distance, arc: geo.arc, cover: geo.cover };
  }
```

**Careful:** `a` is a parameter — check whether `resolveFire` declares it `const`/reassigns it, and whether callers rely on mutation. If reassignment is awkward, mutate the three fields in place instead (`a.distance = geo.distance; ...`). Read the function before editing.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js && node --test shared/combat.test.js`
Expected: PASS — and `combat.test.js` must be green with ZERO edits. If you had to touch it, the seam is wrong; revert and reconsider.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(state): derive distance/arc/cover from geometry in digital rooms"
```

---

### Task 10b: The reaction paths bypass the seam (FOLLOW-UP — needs a design decision first)

Found while implementing Task 10. Not a defect in it; a genuinely separate question.

Five reaction paths call `resolveAttack`. Two route through `resolveFire` and inherit the
seam for free — `game-state.js:3707` (evasive) and `:3747` (sidestep). **Three call
`resolveAttack` directly and still read client-declared geometry verbatim** (`a.attack.arc`,
`.range`, `.distance`, `.cover`):

- `game-state.js:3715` — **Return Fire**
- `game-state.js:3762` — **Riposte**
- `game-state.js:3779` — **Exploit**

Also unrouted: `:2401`/`:2431` (brace retaliate, anvil riposte), `:2495` (ground anchor),
`:2511` (skewer).

**Why this was NOT folded into Task 10.** These are the *reactor* shooting back, so the
geometry must be derived in the **reverse direction** (reactor → attacker), and the reactor
may have moved or pivoted as part of the reaction itself. Exploit is explicitly a
pivot-to-face with a **player-supplied arc** — deriving it would either delete that choice
or need the post-pivot facing threaded in. That is a design decision, not a mechanical
repeat of Task 10.

**It is not reachable today**: digital rooms have no `react` verb wired up. So this is a
prerequisite for reactions in digital rooms, not a live bug.

**The decision needed before implementing:** for a reaction, is the arc derived from the
reactor's facing *after* its reaction move/pivot (which means the engine must apply the
pivot first and Exploit loses its player-supplied arc), or does Exploit stay player-declared
because choosing the facing IS the mechanic? Answer that, then this becomes mechanical.

---

### Task 11: Move by path, with pivot

Client sends `{ dest, facing }`. The server pathfinds it itself and applies. Pivot ≤ 90° per Move, either end, 0" travel allowed.

**Files:**
- Modify: `shared/game-state.js` (`performAction`, the `move`/`sprint` branch at ~line 2684; new `SPEED_BY_CLASS` export)
- Modify: `client/src/v2/battle/constants.ts:24` (re-export `SPEED` from shared instead of redeclaring it)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("a digital Move walks the rig to a reachable destination", () => {
  const room = digitalRoomWithMirroredRigs();
  const rig = room.rigs[0];
  room.field.terrain = [];
  rig.pos = { x: 10, y: 10 }; rig.facing = 0;
  startActivationFor(room, rig);
  const res = applyCommand(room, { verb: "action", name: rig.name, action: "move", dest: { x: 14, y: 10 }, facing: 0 });
  assert.equal(res.ok, true);
  assert.ok(Math.abs(rig.pos.x - 14) < 0.3, `landed at ${rig.pos.x}`);
});

test("a digital Move beyond Speed is refused", () => {
  const room = digitalRoomWithMirroredRigs();
  const rig = room.rigs[0];
  room.field.terrain = [];
  rig.pos = { x: 5, y: 10 }; rig.facing = 0;
  rig.speed = 6;
  startActivationFor(room, rig);
  const res = applyCommand(room, { verb: "action", name: rig.name, action: "move", dest: { x: 40, y: 10 }, facing: 0 });
  assert.equal(res.ok, false);
  assert.match(res.reason, /Speed|too far/i);
});

test("a digital Move to an unreachable destination is refused", () => {
  const room = digitalRoomWithMirroredRigs();
  const rig = room.rigs[0];
  rig.pos = { x: 5, y: 5 }; rig.facing = 0; rig.speed = 40;
  room.field.terrain = [{ kind: "building", x: 20, y: 20, shape: "rect", w: 4, h: 4 }];
  startActivationFor(room, rig);
  const res = applyCommand(room, { verb: "action", name: rig.name, action: "move", dest: { x: 20, y: 20 }, facing: 0 });
  assert.equal(res.ok, false);
  assert.match(res.reason, /reach/i);
});

test("a Move may pivot up to 90 degrees and no further", () => {
  const room = digitalRoomWithMirroredRigs();
  const rig = room.rigs[0];
  room.field.terrain = [];
  rig.pos = { x: 10, y: 10 }; rig.facing = 0;
  startActivationFor(room, rig);
  assert.equal(applyCommand(room, { verb: "action", name: rig.name, action: "move", dest: { x: 11, y: 10 }, facing: 90 }).ok, true);
  assert.equal(rig.facing, 90);
  const tooFar = applyCommand(room, { verb: "action", name: rig.name, action: "move", dest: { x: 12, y: 10 }, facing: 220 });
  assert.equal(tooFar.ok, false);
  assert.match(tooFar.reason, /90/);
});

test("a 0-inch Move is legal — pivot in place, still costs the action and heat", () => {
  const room = digitalRoomWithMirroredRigs();
  const rig = room.rigs[0];
  room.field.terrain = [];
  rig.pos = { x: 10, y: 10 }; rig.facing = 0;
  startActivationFor(room, rig);
  const before = { heat: rig.engine.heat, used: room.game.turn.actionsUsed };
  const res = applyCommand(room, { verb: "action", name: rig.name, action: "move", dest: { x: 10, y: 10 }, facing: 45 });
  assert.equal(res.ok, true);
  assert.equal(rig.facing, 45);
  assert.ok(rig.engine.heat > before.heat, "pivoting in place is never free");
  assert.equal(room.game.turn.actionsUsed, before.used + 1);
});

test("Sprint budgets 1.5x Speed and still caps the pivot at 90", () => {
  const room = digitalRoomWithMirroredRigs();
  const rig = room.rigs[0];
  room.field.terrain = [];
  rig.pos = { x: 5, y: 10 }; rig.facing = 0; rig.speed = 6;
  startActivationFor(room, rig);
  // 9in is inside 1.5x6 but outside a plain Move.
  const res = applyCommand(room, { verb: "action", name: rig.name, action: "sprint", dest: { x: 14, y: 10 }, facing: 0 });
  assert.equal(res.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the rig doesn't move; `rig.pos.x` stays 10

- [ ] **Step 3: Write minimal implementation**

Add to the `geometry.js` import: nothing new. Add a `pathfind.js` import:

```js
import { findPath } from "./pathfind.js";
```

**First, move the Speed fallback map into `shared/`.** It currently lives at
`client/src/v2/battle/constants.ts:24` as
`export const SPEED = { light: 5, medium: 4, heavy: 3, colossal: 2 }` — but it is a *rules*
constant, and `shared/` cannot import from `client/`. Duplicating it would let the engine
and the drawer drift on how far a rig moves, which is exactly the bug this task exists to
prevent.

In `shared/game-state.js`, export it beside `CHASSIS`:

```js
// Per-weight-class Speed fallback, in inches. A chassis with its own `speed`
// wins (see the per-chassis speed rework); this catches free-combo rigs and
// pre-speed saves. Lives in shared/ because BOTH the move drawer and the
// engine's budget check read it — a client-side copy would let the number the
// player is shown drift from the number the engine enforces.
export const SPEED_BY_CLASS = { light: 5, medium: 4, heavy: 3, colossal: 2 };
```

Then in `client/src/v2/battle/constants.ts`, re-export instead of redeclaring:

```ts
export { SPEED_BY_CLASS as SPEED } from "/shared/game-state.js";
```

Now add the budget helper near `autoDeploy`:

```js
// The inches a rig may cover with one Move / Sprint. Sprint reach is
// loadout-derived (1.5x Speed, 2x with the Reinforced Servos field upgrade),
// rounded to a whole inch — the same maths MoveBody.tsx already prints, read
// from the same rigEffects source so the drawer and the engine can't drift.
export function moveBudget(rig, act) {
  const base = (rig.speed ?? SPEED_BY_CLASS[rig.weightClass] ?? 8) * (rig.speedHalvedNextRound ? 0.5 : 1);
  return act === "sprint" ? Math.round(base * rigEffects(rig).sprintMult) : base;
}

// The smallest turn from `from` to `to`, in degrees, ignoring direction.
function pivotDelta(from, to) {
  return Math.abs((((to - from) % 360) + 540) % 360 - 180);
}
```

In the `move`/`sprint` branch of `performAction`, after the existing engagement / suppression / emplacement guards pass but BEFORE the heat and action-slot are spent:

```js
    // Digital rooms actually walk the rig. The client sends only { dest, facing }
    // — never a path — and the engine routes it again with the same pure module
    // the client previewed with. Same inputs, same path, so the preview always
    // agrees, and a hostile client can't smuggle in a longer move.
    let digitalMove = null;
    if (room.mode === "digital") {
      const dest = a.dest;
      if (!dest || !Number.isFinite(Number(dest.x)) || !Number.isFinite(Number(dest.y))) {
        return reject("A digital move needs a destination.");
      }
      const facing = Number.isFinite(Number(a.facing)) ? Number(a.facing) : rig.facing;
      // Pivot is part of the Move, up to 90 deg, at either end. A 180 is two
      // Moves and two heat — which is what makes flanking lethal.
      const turn = pivotDelta(rig.facing, facing);
      if (turn > 90 + 1e-9) return reject(`A Move may pivot at most 90° — that's ${Math.round(turn)}°.`);

      const others = room.rigs.filter((x) => x.id !== rig.id && !x.destroyed).map(spatial);
      const routed = findPath(
        room.field, terrainPolygons(room.field), others, radiusOf(rig),
        rig.pos, { x: Number(dest.x), y: Number(dest.y) },
      );
      if (!routed) return reject("Can't reach that spot — no route.");
      const budget = moveBudget(rig, act);
      if (routed.length > budget + 1e-6) {
        return reject(`That's ${routed.length.toFixed(1)}″ — past this unit's ${budget}″ of ${act === "sprint" ? "Sprint" : "Move"}.`);
      }
      // A 0in Move is legal: a cornered rig has to be able to turn without
      // walking into fire. It still spends the slot and the heat below.
      digitalMove = { dest: { x: Number(dest.x), y: Number(dest.y) }, facing };
    }
```

Then, after the existing `bumpHeat` / `t.actionsUsed += 1` lines in that branch:

```js
    if (digitalMove) {
      rig.pos = digitalMove.dest;
      rig.facing = digitalMove.facing;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS, 6 new tests

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js client/src/v2/battle/constants.ts
git commit -m "feat(state): digital Move routes by path with a 90-degree pivot"
```

---

### Task 12: Engagement is melee-only

§5 loses its "Move into base contact and declare" clause. Engagement now only ever happens by making a melee attack, and Task 10 already verifies the reach.

**Files:**
- Modify: `shared/game-state.js` (wherever the `engage` command / `a.engage` flag on a move is handled — grep `setEngagement`, ~line 1617)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("a digital move can no longer declare an engagement", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a, b] = room.rigs;
  room.field.terrain = [];
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 13, y: 10 }; b.facing = 180; // touching-ish
  startActivationFor(room, a);
  applyCommand(room, { verb: "action", name: a.name, action: "move", dest: { x: 12.9, y: 10 }, facing: 0, engage: b.name });
  assert.equal(a.engagedWith, null, "contact alone never locks — only a melee swing does");
});

test("a digital melee attack in reach still locks both rigs", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a, b] = room.rigs;
  room.field.terrain = [];
  a.pos = { x: 10, y: 10 }; a.facing = 0;
  b.pos = { x: 13, y: 10 }; b.facing = 180; // rim gap ~0.04in
  startActivationFor(room, a);
  const res = applyCommand(room, {
    verb: "action", name: a.name, action: "fire",
    attack: { weapon: "melee", target: b.name, dice: [6] },
  });
  assert.equal(res.ok, true);
  assert.equal(a.engagedWith, b.id);
  assert.equal(b.engagedWith, a.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — the move's `engage` flag still sets `engagedWith`

- [ ] **Step 3: Write minimal implementation**

In the `move`/`sprint` branch, guard the existing engage-on-move path:

```js
    // §5 (spec: Engagement) — digital rooms drop the "Move into base contact and
    // declare" path entirely. Contact is now a checkable fact rather than a
    // claim, and letting a move lock would delete the choice to walk PAST an
    // enemy. Only a melee swing engages; resolveFire verifies the 2in rim reach.
    if (room.mode !== "digital" && a.engage) {
      // ...existing physical engage-on-move code, unchanged...
    }
```

Read the current code before editing — the engage-on-move handling may live in `performAction` or in the `action` verb. Wrap whatever exists rather than rewriting it.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS, 2 new tests, all physical engagement tests still green

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(state): digital engagement is melee-only"
```

---

### Task 13: Objective control is derived

§11: a Rig controls a marker if it is within 2" (rim gap) and no enemy Rig is also within 2". Physical rooms keep the `vp` claim-submission flow (both sides submit, conflicts resolve). Digital rooms just measure.

**Files:**
- Modify: `shared/game-state.js` (the `vp` verb, ~line 3404, and the Recovery scoring)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { controlsObjective } from "./geometry.js";

test("digital objective control is derived, uncontested", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a] = room.rigs;
  const obj = room.game.objectives[0];
  a.pos = { x: obj.x + 3, y: obj.y }; // rim gap ~1.5in for a light
  for (const r of room.rigs.slice(1)) r.pos = { x: 1, y: 1 }; // everyone else far away
  const held = objectiveControl(room);
  assert.equal(held[0], a.owner);
});

test("digital objective control is contested when both sides are within 2in", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a, , foe] = room.rigs; // rigs[2] belongs to side b — check the fixture
  const obj = room.game.objectives[0];
  a.pos = { x: obj.x + 3, y: obj.y };
  foe.pos = { x: obj.x - 3, y: obj.y };
  const held = objectiveControl(room);
  assert.equal(held[0], null, "nobody scores a contested marker");
});

test("a destroyed rig holds nothing", () => {
  const room = digitalRoomWithMirroredRigs();
  const [a] = room.rigs;
  const obj = room.game.objectives[0];
  a.pos = { x: obj.x + 3, y: obj.y };
  a.destroyed = true;
  for (const r of room.rigs.slice(1)) r.pos = { x: 1, y: 1 };
  assert.equal(objectiveControl(room)[0], null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `objectiveControl is not defined`

- [ ] **Step 3: Write minimal implementation**

Add `controlsObjective` to the `geometry.js` import. Then:

```js
// §11 control, derived. A Rig controls a marker if it is within 2in (RIM gap —
// you stand ON the marker, so base size counts) and no enemy Rig is also within
// 2in. A wreck holds nothing; digital rooms remove destroyed rigs outright, but
// guard anyway so a mid-resolution call can't score a corpse.
// Returns one entry per marker: the owning side id, or null for
// contested/unheld.
export function objectiveControl(room) {
  return (room.game.objectives || []).map((marker) => {
    const holders = new Set();
    for (const rig of room.rigs) {
      if (rig.destroyed || !rig.pos) continue;
      if (controlsObjective(spatial(rig), marker)) holders.add(rig.owner);
    }
    return holders.size === 1 ? [...holders][0] : null;
  });
}
```

In the Recovery scoring path, branch on mode: a digital room scores straight off `objectiveControl(room)` and never waits on `recoveryClaims`. Read the existing `vp` verb and Recovery code first — the physical claim flow must keep working exactly as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS, 3 new tests

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(state): derive objective control in digital rooms"
```

---

### Task 14: Wrecks vanish

Spec: a destroyed rig leaves the map entirely. §11's wreck clause still holds for physical rooms; it just never fires in digital.

**Files:**
- Modify: `shared/game-state.js` (wherever `rig.destroyed = true` is set — grep it)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

```js
test("a destroyed rig leaves the digital map", () => {
  const room = digitalRoomWithMirroredRigs();
  const rig = room.rigs[0];
  rig.pos = { x: 10, y: 10 };
  destroyRig(room, rig); // whatever the existing destruction helper is called
  assert.equal(rig.pos, null, "the wreck is gone — nothing to path around");
});

test("a destroyed digital rig no longer blocks movement", () => {
  const room = digitalRoomWithMirroredRigs();
  const [mover, victim] = room.rigs;
  room.field.terrain = [];
  mover.pos = { x: 5, y: 10 }; mover.facing = 0; mover.speed = 20;
  victim.pos = { x: 10, y: 10 };
  destroyRig(room, victim);
  startActivationFor(room, mover);
  const res = applyCommand(room, { verb: "action", name: mover.name, action: "move", dest: { x: 15, y: 10 }, facing: 0 });
  assert.equal(res.ok, true, "walks straight through where the wreck was");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `rig.pos` still holds its coordinates

- [ ] **Step 3: Write minimal implementation**

Wherever destruction is finalised:

```js
  // Spec: Wrecks vanish. §11's "a wreck does not hold objectives" clause still
  // governs a physical table, where the model physically stays put — but a
  // digital wreck is simply removed, so there is nothing to path around, target,
  // or score.
  if (room.mode === "digital") rig.pos = null;
```

Everything downstream already skips `!rig.pos` (`autoDeploy`, `objectiveControl`) or `rig.destroyed` (the move blocker list).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/game-state.test.js`
Expected: PASS, 2 new tests

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(state): digital wrecks leave the map"
```

---

### Task 15: Wire the new state through to the client

**Files:**
- Modify: `client/src/state/types.ts` (`TerrainKind` ~line 142, `FieldState` ~line 162, and the `Rig` interface)
- Modify: `shared/game-state.js` (the wire-payload builder, ~line 3716)
- Test: none — types only. `npm test` must typecheck clean.

- [ ] **Step 1: Extend the types**

In `client/src/state/types.ts`:

```ts
export type RoomMode = "physical" | "digital";

/** Inches, field coords, centre of base. Digital rooms only. */
export interface Pos { x: number; y: number; }
```

Add to `FieldState`:

```ts
export interface FieldState {
  width: number;
  height: number;
  diagonal: Diagonal;
  terrain: TerrainPiece[];
  locked: boolean;
}
```

(unchanged — mode lives on the room, not the field)

Add to the `Rig` interface:

```ts
  /** Simulated position, digital rooms only. null once destroyed. */
  pos?: Pos | null;
  /** Degrees; front arc is facing +/-45. Digital rooms only. */
  facing?: number;
```

And on whatever type models the room/game payload:

```ts
  mode?: RoomMode;
```

- [ ] **Step 2: Ship mode and positions on the wire**

In `shared/game-state.js`'s payload builder (~line 3716), add `mode` alongside `field`, and confirm `pos`/`facing` survive the rig serialisation (if rigs are picked field-by-field rather than spread, add them explicitly).

- [ ] **Step 3: Verify it typechecks**

Run: `npm test`
Expected: PASS — Vitest green, no TS errors

- [ ] **Step 4: Commit**

```bash
git add client/src/state/types.ts shared/game-state.js
git commit -m "feat(types): room mode and rig pos/facing on the wire"
```

---

### Task 16: Render units on the map

`FieldMap.tsx` already renders the field, the 12" grid, terrain, objectives, and deploy sectors, and it already has the `scale` / `sx` / `sy` projection. It gains unit tokens.

**Files:**
- Modify: `client/src/v2/battle/FieldMap.tsx`
- Create: `client/src/v2/battle/FieldMap.test.tsx`
- Modify: `client/src/v2/styles/field.css`

- [ ] **Step 1: Write the failing test**

```tsx
// client/src/v2/battle/FieldMap.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FieldMap } from "./FieldMap";

const field = { width: 54, height: 36, diagonal: "tlbr" as const, terrain: [], locked: false };
const rig = (over = {}) => ({
  id: "r1", name: "Vulcan", owner: "a", weightClass: "medium",
  pos: { x: 27, y: 18 }, facing: 0, destroyed: false, ...over,
});

describe("FieldMap units", () => {
  it("renders a token per positioned unit", () => {
    render(<FieldMap field={field} objectives={[]} mySide="a" ownerSide="a" units={[rig(), rig({ id: "r2", name: "Ajax", owner: "b", pos: { x: 10, y: 10 } })]} />);
    expect(screen.getAllByTestId("unit")).toHaveLength(2);
  });

  it("does not render a unit with no position", () => {
    render(<FieldMap field={field} objectives={[]} mySide="a" ownerSide="a" units={[rig({ pos: null })]} />);
    expect(screen.queryByTestId("unit")).toBeNull();
  });

  it("marks friend and foe differently", () => {
    render(<FieldMap field={field} objectives={[]} mySide="a" ownerSide="a" units={[rig(), rig({ id: "r2", owner: "b", pos: { x: 10, y: 10 } })]} />);
    const [mine, foe] = screen.getAllByTestId("unit");
    expect(mine.getAttribute("class")).toContain("--mine");
    expect(foe.getAttribute("class")).toContain("--foe");
  });

  it("draws the facing wedge rotated to the unit's heading", () => {
    render(<FieldMap field={field} objectives={[]} mySide="a" ownerSide="a" units={[rig({ facing: 90 })]} />);
    expect(screen.getByTestId("unit-arc").getAttribute("transform")).toContain("rotate(90");
  });

  it("scales the token to the weight class's base", () => {
    render(<FieldMap field={field} objectives={[]} mySide="a" ownerSide="a" units={[rig({ weightClass: "light" }), rig({ id: "r2", weightClass: "medium", pos: { x: 10, y: 10 } })]} />);
    const [light, medium] = screen.getAllByTestId("unit-base");
    expect(Number(medium.getAttribute("r"))).toBeGreaterThan(Number(light.getAttribute("r")));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/battle/FieldMap.test.tsx`
Expected: FAIL — no `unit` testid; `units` isn't a prop

- [ ] **Step 3: Write minimal implementation**

Add to `FieldMap.tsx`'s `Props`:

```tsx
import { BASE_RADIUS } from "/shared/geometry.js";
import type { Rig } from "../../state/types";

interface Props {
  field: FieldState;
  objectives: Objective[];
  mySide: string;
  ownerSide: string | null;
  /** Digital rooms only. Omitted in a physical room — the map stays a blueprint. */
  units?: Rig[];
}
```

Render after the objectives block, so tokens sit on top:

```tsx
      {(units ?? []).filter((u) => u.pos && !u.destroyed).map((u) => {
        const cx = sx(u.pos!.x);
        const cy = sy(u.pos!.y);
        const r = (BASE_RADIUS[u.weightClass as "light" | "medium"] ?? BASE_RADIUS.medium) * scale;
        const mine = u.owner === mySide;
        // The front arc is facing +/-45 (§7). Drawn as a wedge out to 2 base
        // radii — long enough to read the heading at a glance, short enough not
        // to clutter the board.
        const reach = r * 2;
        const wedge = [
          `M 0 0`,
          `L ${reach * Math.cos(-45 * Math.PI / 180)} ${reach * Math.sin(-45 * Math.PI / 180)}`,
          `A ${reach} ${reach} 0 0 1 ${reach * Math.cos(45 * Math.PI / 180)} ${reach * Math.sin(45 * Math.PI / 180)}`,
          `Z`,
        ].join(" ");
        return (
          <g key={u.id} data-testid="unit" className={`v2-fm-unit v2-fm-unit--${mine ? "mine" : "foe"}`}>
            <path
              data-testid="unit-arc" className="v2-fm-unit-arc" d={wedge}
              transform={`translate(${cx} ${cy}) rotate(${u.facing ?? 0})`}
            />
            <circle data-testid="unit-base" className="v2-fm-unit-base" cx={cx} cy={cy} r={r} />
            <text className="v2-fm-unit-label" x={cx} y={cy + 3} textAnchor="middle">{u.name.slice(0, 2)}</text>
          </g>
        );
      })}
```

Add matching classes to `client/src/v2/styles/field.css`, following the existing `v2-fm-*` conventions. **`no-raw-font-size.test.ts` exists in `client/src/v2/` — obey it: no literal font sizes.**

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/battle/FieldMap.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/FieldMap.tsx client/src/v2/battle/FieldMap.test.tsx client/src/v2/styles/field.css
git commit -m "feat(v2): render unit tokens and facing arcs on the field map"
```

---

### Task 17: Path preview + destination picking

Hover a destination, see the routed path and its length. Green if it fits in Speed, red if it doesn't. Click commits. The preview calls the SAME `findPath` the server will, so they can never disagree.

**Files:**
- Modify: `client/src/v2/battle/FieldMap.tsx`
- Modify: `client/src/v2/battle/FieldMap.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent } from "@testing-library/react";

describe("FieldMap move preview", () => {
  const mover = { id: "r1", name: "Vulcan", owner: "a", weightClass: "medium", pos: { x: 10, y: 10 }, facing: 0, speed: 6, destroyed: false };

  it("previews a reachable path as legal", () => {
    render(<FieldMap field={field} objectives={[]} mySide="a" ownerSide="a" units={[mover]} moving={{ unit: mover, budget: 6 }} onMove={() => {}} />);
    fireEvent.mouseMove(screen.getByTestId("field-surface"), { clientX: 0, clientY: 0 });
    const path = screen.getByTestId("move-preview");
    expect(path.getAttribute("class")).toContain("--legal");
  });

  it("previews an over-budget path as illegal and refuses the click", () => {
    const onMove = vi.fn();
    render(<FieldMap field={field} objectives={[]} mySide="a" ownerSide="a" units={[mover]} moving={{ unit: mover, budget: 1 }} onMove={onMove} />);
    const surface = screen.getByTestId("field-surface");
    fireEvent.mouseMove(surface, { clientX: 400, clientY: 200 });
    expect(screen.getByTestId("move-preview").getAttribute("class")).toContain("--illegal");
    fireEvent.click(surface);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("commits a legal destination on click", () => {
    const onMove = vi.fn();
    render(<FieldMap field={field} objectives={[]} mySide="a" ownerSide="a" units={[mover]} moving={{ unit: mover, budget: 20 }} onMove={onMove} />);
    const surface = screen.getByTestId("field-surface");
    fireEvent.mouseMove(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0]).toHaveProperty("x");
  });

  it("shows no preview when nothing is moving", () => {
    render(<FieldMap field={field} objectives={[]} mySide="a" ownerSide="a" units={[mover]} />);
    expect(screen.queryByTestId("move-preview")).toBeNull();
  });
});
```

**Note:** jsdom gives `getBoundingClientRect` all zeros, so screen→inch conversion can't be tested via real pixel maths. Convert using the SVG `viewBox` scale and the event's `clientX/clientY` minus the rect origin; in jsdom that lands at a deterministic (if arbitrary) inch coordinate, which is enough to assert legal/illegal/committed. Don't fight jsdom for pixel fidelity — that's what the pure `pathfind` tests are for.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/battle/FieldMap.test.tsx`
Expected: FAIL — no `field-surface` testid

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useMemo, useState } from "react";
import { findPath } from "/shared/pathfind.js";
import { terrainPolygons, radiusOf } from "/shared/geometry.js";

// added to Props
  /** Set while a Move/Sprint drawer is open. Omitted otherwise — no preview. */
  moving?: { unit: Rig; budget: number };
  onMove?: (dest: { x: number; y: number }) => void;
```

Inside the component:

```tsx
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // The preview calls the SAME pure findPath the server will call to apply the
  // move. Identical module, identical inputs, so the route the player sees is
  // exactly the route they get — and the client still sends only the
  // destination, never the path.
  const preview = useMemo(() => {
    if (!moving || !hover) return null;
    const others = (units ?? [])
      .filter((u) => u.id !== moving.unit.id && u.pos && !u.destroyed)
      .map((u) => ({ pos: u.pos!, radius: radiusOf(u) }));
    const routed = findPath(field, terrainPolygons(field), others, radiusOf(moving.unit), moving.unit.pos, hover);
    if (!routed) return { legal: false, d: "", length: null };
    return {
      legal: routed.length <= moving.budget,
      d: routed.path.map((p, i) => `${i ? "L" : "M"} ${sx(p.x)} ${sy(p.y)}`).join(" "),
      length: routed.length,
    };
  }, [moving, hover, units, field]);

  const toInches = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * CANVAS_W;
    const py = ((e.clientY - box.top) / box.height) * (fh + PAD * 2);
    return { x: (px - PAD) / scale, y: (py - PAD) / scale };
  };
```

Render a transparent surface UNDER the tokens but over the terrain, and the preview over everything:

```tsx
      <rect
        data-testid="field-surface" className="v2-fm-surface"
        x={PAD} y={PAD} width={fw} height={fh} fill="transparent"
        onMouseMove={(e) => moving && setHover(toInches(e))}
        onMouseLeave={() => setHover(null)}
        onClick={() => { if (preview?.legal && hover && onMove) onMove(hover); }}
      />

      {preview && (
        <g data-testid="move-preview" className={`v2-fm-move v2-fm-move--${preview.legal ? "legal" : "illegal"}`}>
          <path className="v2-fm-move-path" d={preview.d} fill="none" />
          {preview.length !== null && hover && (
            <text className="v2-fm-move-len" x={sx(hover.x)} y={sy(hover.y) - 8} textAnchor="middle">
              {preview.length.toFixed(1)}&#8243;
            </text>
          )}
        </g>
      )}
```

Add the `v2-fm-surface` / `v2-fm-move*` classes to `field.css`.

**Perf note:** `findPath` rebuilds the whole occupancy grid per call, and this runs on every `mousemove`. If the preview stutters on a 96×72 field, memoise the grid on `[field, units, moving.unit.id]` and add a `findPathOnGrid(grid, from, to)` export that skips `buildGrid`. Don't pre-optimise — measure first.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/battle/FieldMap.test.tsx`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/FieldMap.tsx client/src/v2/battle/FieldMap.test.tsx client/src/v2/styles/field.css
git commit -m "feat(v2): live path preview and destination picking on the field map"
```

---

### Task 18: MoveBody drives the map

In a physical room `MoveBody` holds the player on a timed Confirm — long enough to actually push the mini across the table. A digital room has no mini to push, so the hold goes away.

**Files:**
- Modify: `client/src/v2/battle/MoveBody.tsx`
- Modify: `client/src/v2/battle/MoveBody.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `client/src/v2/battle/MoveBody.test.tsx`:

```tsx
it("digital rooms skip the timed hold — Confirm is live immediately", () => {
  render(<MoveBody rig={rig} actionKey="move" enemies={[]} mode="digital" dest={{ x: 12, y: 10 }} onEngageChange={() => {}} onCancel={() => {}} onConfirm={() => {}} />);
  expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
});

it("physical rooms keep the hold locked at first", () => {
  render(<MoveBody rig={rig} actionKey="move" enemies={[]} mode="physical" onEngageChange={() => {}} onCancel={() => {}} onConfirm={() => {}} />);
  expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
});

it("digital rooms disable Confirm until a destination is picked", () => {
  render(<MoveBody rig={rig} actionKey="move" enemies={[]} mode="digital" dest={null} onEngageChange={() => {}} onCancel={() => {}} onConfirm={() => {}} />);
  expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
});
```

Read the existing `MoveBody.test.tsx` and reuse its `rig` fixture rather than making a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/battle/MoveBody.test.tsx`
Expected: FAIL — `mode` isn't a prop; the hold always applies

- [ ] **Step 3: Write minimal implementation**

```tsx
export default function MoveBody({
  rig, actionKey, enemies, mode = "physical", dest = null, onEngageChange, onCancel, onConfirm,
}: {
  rig: Rig;
  actionKey: string;
  enemies: Rig[];
  mode?: RoomMode;
  /** Picked on the map. Digital rooms only. */
  dest?: { x: number; y: number } | null;
  onEngageChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const digital = mode === "digital";
```

Then gate the hold:

```tsx
  // The timed hold exists because a physical Move resolves on the tabletop, not
  // on the device — the console can't see the model shift, so it stalls the
  // player long enough to actually push the mini. A digital room moves the rig
  // itself, so there is nothing to wait for.
  const holdMs = digital ? 0 : holdMsFor(actionKey);
```

and the confirm gate:

```tsx
  const confirmDisabled = digital ? !dest : locked;
```

Hide the engage picker in digital rooms — engagement is melee-only now (Task 12):

```tsx
  {!digital && (/* ...existing engage picker... */)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/battle/MoveBody.test.tsx`
Expected: PASS — existing physical tests still green

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/MoveBody.tsx client/src/v2/battle/MoveBody.test.tsx
git commit -m "feat(v2): MoveBody drives map destinations in digital rooms"
```

---

### Task 19: AttackWizard skips the derived steps

The wizard collects `arc`, `range`, `distance`, and `cover` from the player (`AttackWizard.tsx:398`, `:420`). In a digital room the engine measures all four, so asking is worse than useless — a wrong answer is silently overwritten by Task 10's seam.

**Files:**
- Modify: `client/src/v2/overlays/AttackWizard.tsx`
- Modify: `client/src/v2/overlays/AttackWizard.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

```tsx
it("digital rooms don't ask for arc, distance, or cover", () => {
  render(<AttackWizard rig={rig} enemies={[foe]} mode="digital" {...noopHandlers} />);
  expect(screen.queryByText(/which of the enemy's facings/i)).toBeNull();
  expect(screen.queryByText(/obstruction shielding/i)).toBeNull();
});

it("physical rooms still ask", () => {
  render(<AttackWizard rig={rig} enemies={[foe]} mode="physical" {...noopHandlers} />);
  expect(screen.getByText(/obstruction shielding/i)).toBeInTheDocument();
});

it("a digital attack dispatches without geometry fields", () => {
  const onConfirm = vi.fn();
  render(<AttackWizard rig={rig} enemies={[foe]} mode="digital" onConfirm={onConfirm} {...noopHandlers} />);
  // ...drive the wizard to confirm...
  const payload = onConfirm.mock.calls[0][0];
  expect(payload).not.toHaveProperty("cover");
  expect(payload).not.toHaveProperty("distance");
  expect(payload.target).toBe(foe.name);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: FAIL — the wizard always asks

- [ ] **Step 3: Write minimal implementation**

Add a `mode` prop. Filter the step list:

```tsx
  // Digital rooms measure arc / range / distance / cover off the simulated
  // field (game-state.js deriveAttackGeometry), and the engine OVERWRITES
  // whatever the client sends for those four. Asking would be worse than
  // useless: the player would answer, and be silently ignored.
  const digital = mode === "digital";
  const steps = ALL_STEPS.filter((s) => !(digital && DERIVED_STEPS.has(s.key)));
```

with:

```tsx
const DERIVED_STEPS = new Set(["arc", "range", "cover", "distance"]);
```

and drop the four keys from the dispatch payload when `digital`.

**Read the file first.** The wizard is a step machine with recall state (`skipRangedSeed`, seeded distance) — the step list may not be a plain array. Adapt to what's there; don't restructure it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/overlays/AttackWizard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/overlays/AttackWizard.tsx client/src/v2/overlays/AttackWizard.test.tsx
git commit -m "feat(v2): AttackWizard skips engine-derived steps in digital rooms"
```

---

### Task 20: rules.md

Prose only — no code. Every change gets a `*⚙ TUNING*` marker, matching the file's existing convention.

**Files:**
- Modify: `rules.md`

- [ ] **Step 1: Rewrite the measurement rule**

In §7 (~line 259) and §12 (~line 355), where melee's "2" reach" is defined, add the measurement convention:

> **Measuring.** All distances are measured **centre of base to centre of base** — range, movement, and blast radius alike. The two exceptions are **melee reach** and **objective control**, which measure the **gap between base rims**: you are reaching across the gap, or standing on the marker, and base size is the whole point. *⚙ TUNING: replaced the old nearest-edge / front-rim-to-back-rim conventions with a single centre-based rule.*

- [ ] **Step 2: Retune the ranges**

Centre measurement adds roughly a base diameter (~2.4" light, ~3" medium) to every effective reach that used to be rim-measured. Walk the §12 weapon table and the Speed values and shift them so the *effective* numbers land where they did before. Mark the pass `*⚙ TUNING: rebased for centre-to-centre measurement.*`

**This is a judgement pass, not a mechanical one — surface the proposed numbers for review before committing them.** It changes the balance of a game that has already been played.

- [ ] **Step 3: Fix §10 deployment**

Change *"measured from the corner to the nearest edge of the base"* to:

> Each Rig must be deployed **fully within 8"** of your **deployment corner**, measured **to the centre of the base**. *⚙ TUNING: rebased for centre-to-centre measurement.*

- [ ] **Step 4: Fix §5 engagement**

Replace the **Getting engaged** bullet (~line 189):

> - **Getting engaged.** A Rig becomes **engaged** with an enemy by **making a melee attack** against it (in reach). The lock is **mutual** and **one-to-one** (a Rig already engaged can't be pulled into a second lock; you may still melee an already-engaged enemy, you just don't lock to it). *⚙ TUNING: removed the "move into base contact and declare" path — closing to contact no longer locks you, so you may walk past an enemy at your own risk.*

- [ ] **Step 5: Document digital rooms**

Add a short §14 (or wherever the numbering lands):

> ## Digital battles
>
> A **digital** battle is played entirely in the app — no table, no tape measure, no minis. The engine tracks every Rig's position and facing and measures range, arc, and cover itself.
>
> Digital battles differ from the tabletop game in four ways:
> - **Rigs only.** No Tanks or Walkers.
> - **Four terrain kinds:** buildings, barricades, rocks, and crates. Buildings are the only thing that blocks line of sight; **everything** blocks movement.
> - **Auto-deployment.** The engine places both squadrons in their corners.
> - **Wrecks are removed** from the field when a Rig dies.
>
> Everything else — heat, actions, the Impact Table, preparations, Answer tokens, objectives — is the same game.

- [ ] **Step 6: Commit**

```bash
git add rules.md
git commit -m "docs(rules): centre-based measurement, melee-only engagement, digital battles"
```

---

### Task 21: Full suite + the memory

- [ ] **Step 1: Run everything**

Run: `npm test`
Expected: PASS — Vitest and both node suites. `combat.test.js` must be green with zero edits.

- [ ] **Step 2: Verify the seam held**

Run: `git diff main --stat -- shared/combat.js shared/combat.test.js`
Expected: **empty**. If either file changed, the seam leaked — the whole design rests on `resolveAttack` not knowing which mode it's in.

- [ ] **Step 3: Update the measurement-conventions memory**

The stored memory still says *range = nearest-edge gap, movement = front→back rim, real travel = Speed + base diameter*. That is now wrong in every particular. Rewrite it to the centre-based rule with the melee/objective rim exceptions, and link `[[digital-battlefield]]`.

- [ ] **Step 4: Commit**

**Never `git add -A` in this repo.** The worktree is routinely dirty with unrelated
in-progress work, and `git commit` commits the WHOLE INDEX — not just the paths you
added — so a broad add silently buries someone else's staged changes under your commit
message. Stage explicit paths, and check `git diff --cached --stat` before every commit:

```bash
git diff --cached --stat          # confirm ONLY your files are staged
git commit -- <the exact paths this task touched>
```

`git commit -- <paths>` commits only those paths and leaves everything else staged,
which is the safe form when the index may already hold work that isn't yours.

---

## Self-review notes

**Spec coverage:** Room modes → T8. Measurement → T4, T20. State → T8. Terrain subset → T5. Geometry/rays → T1-3. Arc/distance/rim → T4. The seam → T10. Pathfinding → T6-7. Move/pivot → T11. Engagement → T12. Deployment → T9. Objectives → T13. Wrecks → T14. UI → T15-19. rules.md → T20.

**Two spec items the plan deliberately does NOT implement**, both flagged out-of-scope in the spec itself: Piledriver's shove and Barrage's zone still emit their player instructions. The map makes them simulatable; they're a follow-up.

**Two defects this review caught and fixed inline:**
1. `autoDeploy` originally tested terrain clearance with a degenerate zero-length segment, which only checks the base *centre* — it would have deployed rigs half-inside buildings. Now both it and the occupancy grid share one exported `clearOfTerrain` / `distToPolygon`, so "clear for a base of radius r" has exactly one definition.
2. `moveBudget` referenced `SPEED`, which lives in `client/src/v2/battle/constants.ts` — unimportable from `shared/`. Task 11 now moves it to `shared/` as `SPEED_BY_CLASS` and re-exports it clientside, rather than duplicating the map.

**Known risk — Task 20 Step 2 is the only non-mechanical step in the plan.** Retuning the weapon table for centre measurement is a balance judgement on a game that has already been played. It's flagged for review rather than specified, on purpose. If it stalls, the rest of the plan ships without it and the numbers stay slightly long.

**Task 10 is the load-bearing one.** If `combat.test.js` needs edits, stop and reconsider rather than editing it.
