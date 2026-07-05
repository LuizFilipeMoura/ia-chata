# Configurable Field Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the room owner set the table dimensions in inches and have the app derive and render an on-screen battlefield map (deployment halves, objective markers, scattered terrain) that both players see.

**Architecture:** A dependency-free `shared/field.js` module holds all battlefield geometry (deterministic objectives, re-rollable terrain). `shared/game-state.js` stores a per-room `field` + `ownerSide`, exposes a `field` command (owner-only, pre-start), and gates Ready on a locked field. The React client renders a read-only `FieldMap` SVG for both players and gives the owner a dedicated Field Setup drawer to change dimensions, flip the diagonal, re-roll terrain, and lock.

**Tech Stack:** Node ESM, Express (generic command route — no route changes), `ws` broadcast, React 18 + TypeScript, Vitest (client) + `node:test` (shared/server), Vite with a `/shared` import alias.

---

## File Structure

- **Create** `shared/field.js` — pure geometry: bounds, `halfDiag`, `clampDimensions`, corner helpers, `computeObjectives`, `scatterTerrain`, `setback`.
- **Create** `shared/field.test.js` — `node:test` unit tests for the geometry.
- **Modify** `shared/game-state.js` — seed/backfill `room.ownerSide` + `room.field`; compute objectives; add the `field` command; set `ownerSide` in `claimSide`; gate `ready` on `field.locked`; expose `field` + `ownerSide` in `publicState`.
- **Modify** `shared/game-state.test.js` — tests for owner assignment, the `field` command, and the Ready gate.
- **Modify** `client/shared.d.ts` — type declarations for `/shared/field.js`.
- **Modify** `tsconfig.json` — map `/shared/field.js` to the declaration file.
- **Modify** `client/src/state/types.ts` — `FieldState`, `Objective`, `TerrainPiece`, extend `GameState` + `ServerState`.
- **Create** `client/src/components/FieldMap.tsx` — read-only SVG map (props in, no data fetching).
- **Create** `client/src/components/FieldMap.test.tsx` — render test.
- **Create** `client/src/styles/field-map.css` — map + controls styling.
- **Create** `client/src/components/FieldControls.tsx` — always-visible map + owner "Set field" trigger + the drawer body.
- **Modify** `client/src/components/Stage.tsx` — render `FieldControls` during setup.
- **Modify** `client/src/components/BattleSetup.tsx` — Ready hint/disable when field not locked.

No server route or `ws.js` changes: the existing `/api/game/:room/command` passes `{verb, attrs}` straight to `applyCommand`.

---

## Task 1: `shared/field.js` geometry module

**Files:**
- Create: `shared/field.js`
- Test: `shared/field.test.js`

- [ ] **Step 1: Write the failing test**

Create `shared/field.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/field.test.js`
Expected: FAIL — `Cannot find module './field.js'`.

- [ ] **Step 3: Write the module**

Create `shared/field.js`:

```js
// Pure battlefield geometry. Given a field's dimensions + diagonal, derive the
// deterministic objective markers and a re-rollable terrain scatter. No imports
// from game-state.js so it stays dependency-free and testable on server + client.

export const FIELD_MIN = { width: 24, height: 18 };
export const FIELD_MAX = { width: 96, height: 72 };
export const FIELD_DEFAULT = { width: 54, height: 36 };

// Reference table the rulebook (§10-11) is written for. Objective distance and
// the deployment setback are stored as a fraction of this table's half-diagonal
// so they scale to any size instead of using literal inches.
const REF = { width: 54, height: 36 };
export function halfDiag(w, h) { return Math.hypot(w / 2, h / 2); }
export const REF_HALF_DIAG = halfDiag(REF.width, REF.height);
export const OBJ_FRACTION = 18 / REF_HALF_DIAG; // ~0.5547
const SETBACK_REF = 4;

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function clampDimensions(w, h) {
  return {
    width: clampInt(w, FIELD_MIN.width, FIELD_MAX.width, FIELD_DEFAULT.width),
    height: clampInt(h, FIELD_MIN.height, FIELD_MAX.height, FIELD_DEFAULT.height),
  };
}

function corners(field) {
  const { width: w, height: h } = field;
  return {
    tl: { x: 0, y: 0 }, tr: { x: w, y: 0 },
    br: { x: w, y: h }, bl: { x: 0, y: h },
  };
}

// The no-deploy diagonal's endpoints are the empty corners (objectives sit
// toward them); the other pair are the deployment corners (owner is index 0).
export function emptyCorners(field) {
  const c = corners(field);
  return field.diagonal === "trbl" ? [c.tr, c.bl] : [c.tl, c.br];
}
export function deploymentCorners(field) {
  const c = corners(field);
  return field.diagonal === "trbl" ? [c.tl, c.br] : [c.tr, c.bl];
}

export function fieldCenter(field) {
  return { x: field.width / 2, y: field.height / 2 };
}

export function computeObjectives(field) {
  const c = fieldCenter(field);
  const markers = [{ x: c.x, y: c.y, vp: 2 }];
  for (const corner of emptyCorners(field)) {
    markers.push({
      x: c.x + OBJ_FRACTION * (corner.x - c.x),
      y: c.y + OBJ_FRACTION * (corner.y - c.y),
      vp: 1,
    });
  }
  return markers;
}

export function setback(field) {
  return SETBACK_REF * (halfDiag(field.width, field.height) / REF_HALF_DIAG);
}

const distp = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Scatter 4-6 terrain pieces in the central band, clear of objectives and the
// deployment corners. Deterministic under the injected `random` (matches rollD).
export function scatterTerrain(field, random = Math.random) {
  const rand = typeof random === "function" ? random : Math.random;
  const objectives = computeObjectives(field);
  const dcorners = deploymentCorners(field);
  const hd = halfDiag(field.width, field.height);
  const objClear = 0.12 * hd;
  const cornerClear = 0.22 * hd;
  const minGap = 0.10 * hd;
  const margin = Math.min(field.width, field.height) * 0.08;
  const target = 4 + Math.floor(rand() * 3); // 4, 5, or 6
  const placed = [];
  let attempts = 0;
  while (placed.length < target && attempts < 400) {
    attempts++;
    const x = margin + rand() * (field.width - 2 * margin);
    const y = margin + rand() * (field.height - 2 * margin);
    const p = { x, y };
    if (objectives.some((o) => distp(o, p) < objClear)) continue;
    if (dcorners.some((c) => distp(c, p) < cornerClear)) continue;
    if (placed.some((q) => distp(q, p) < minGap)) continue;
    placed.push({ x, y, size: rand() < 0.5 ? "sm" : "md" });
  }
  return placed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/field.test.js`
Expected: PASS — 5 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add shared/field.js shared/field.test.js
git commit -m "feat: pure battlefield geometry module (objectives, terrain)"
```

---

## Task 2: Wire field + owner into room state

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `shared/game-state.test.js`:

```js
test("createRoom seeds owner=null and a default 54x36 field with objectives", () => {
  const r = createRoom("F1");
  assert.equal(r.ownerSide, null);
  assert.equal(r.field.width, 54);
  assert.equal(r.field.height, 36);
  assert.equal(r.field.diagonal, "tlbr");
  assert.equal(r.field.locked, false);
  assert.deepEqual(r.field.terrain, []);
  assert.equal(r.game.objectives.length, 3);
  assert.deepEqual(r.game.objectives[0], { x: 27, y: 18, vp: 2 });
});

test("claimSide assigns ownerSide to the first claimant only", () => {
  const r = createRoom("F2");
  claimSide(r, { name: "Ana", side: "b" }); // owner can be side b
  assert.equal(r.ownerSide, "b");
  claimSide(r, { name: "Bo", side: "a" });
  assert.equal(r.ownerSide, "b"); // unchanged by later claims
});

test("publicState exposes field and ownerSide", () => {
  const r = createRoom("F3");
  claimSide(r, { name: "Ana", side: "a" });
  const view = publicState(r, "a");
  assert.equal(view.ownerSide, "a");
  assert.equal(view.field.width, 54);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `r.field` is undefined / `view.ownerSide` is undefined.

- [ ] **Step 3: Implement the state wiring**

In `shared/game-state.js`, extend the imports at the top of the file:

```js
import {
  FIELD_DEFAULT, clampDimensions, computeObjectives, scatterTerrain,
} from "./field.js";
```

In `createRoom`, add `ownerSide` + `field` and compute objectives. Replace the
`return { code, version: 0, nextRigId: 1, game: {...}, rigs: [] }` object so it reads:

```js
export function createRoom(code) {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr", terrain: [], locked: false };
  return {
    code,
    version: 0,
    nextRigId: 1,
    ownerSide: null,
    field,
    game: {
      round: 1,
      sides: [
        { id: "a", name: "You",   vp: 0, claimed: false, ready: false },
        { id: "b", name: "Enemy", vp: 0, claimed: false, ready: false },
      ],
      objectives: computeObjectives(field),
      started: false,
      bounties: {},
      autoResolve: true,
      phase: "setup",
      deployOrder: [],
      initiative: null,
      answerTokens: { a: 0, b: 0 },
      turn: null,
      resolutions: [],
      nextResolutionId: 1,
      recoveryVp: {},
      suddenDeath: false,
      outcome: null,
      pendingBlast: null,
    },
    rigs: [],
  };
}
```

In `ensureGameShape`, back-fill room-level fields. Add these lines near the top of
the function (right after `room.game ||= {};`):

```js
  if (room.ownerSide === undefined) room.ownerSide = null;
  if (!room.field || typeof room.field !== "object") {
    room.field = { ...FIELD_DEFAULT, diagonal: "tlbr", terrain: [], locked: false };
  }
  room.field.diagonal = room.field.diagonal === "trbl" ? "trbl" : "tlbr";
  if (!Array.isArray(room.field.terrain)) room.field.terrain = [];
  if (typeof room.field.locked !== "boolean") room.field.locked = false;
```

Still in `ensureGameShape`, replace the existing `room.game.objectives ||= [];` line with:

```js
  if (!Array.isArray(room.game.objectives) || room.game.objectives.length === 0) {
    room.game.objectives = computeObjectives(room.field);
  }
```

In `claimSide`, set the owner on the first successful claim. Add this line right after
`target.claimed = true;`:

```js
    if (room.ownerSide == null) room.ownerSide = target.id;
```

In `publicState`, add `ownerSide` + `field` to the returned object. Insert these two
properties right after `version: room.version,`:

```js
    ownerSide: room.ownerSide ?? null,
    field: room.field
      ? { ...room.field, terrain: room.field.terrain.map((t) => ({ ...t })) }
      : null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS — all existing tests plus the 3 new ones pass.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: room-level field + ownerSide state and serialization"
```

---

## Task 3: `field` command + Ready gate

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `shared/game-state.test.js`:

```js
// Deterministic RNG so terrain is reproducible in command tests.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("field set clamps dims, recomputes objectives, scatters terrain (owner only)", () => {
  const r = createRoom("C1");
  claimSide(r, { name: "Ana", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "set", width: 48, height: 32 } },
    { side: "a" }, { random: seededRandom(7) });
  assert.equal(r.field.width, 48);
  assert.equal(r.field.height, 32);
  assert.equal(r.game.objectives[0].x, 24); // new centre
  assert.ok(r.field.terrain.length >= 4 && r.field.terrain.length <= 6);
});

test("field command is ignored for non-owner and after start", () => {
  const r = createRoom("C2");
  claimSide(r, { name: "Ana", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "set", width: 40, height: 30 } },
    { side: "b" }); // side b is not the owner
  assert.equal(r.field.width, 54);
  r.game.started = true;
  applyCommand(r, { verb: "field", attrs: { action: "set", width: 40, height: 30 } },
    { side: "a" });
  assert.equal(r.field.width, 54);
});

test("field reroll changes terrain but not objectives", () => {
  const r = createRoom("C3");
  claimSide(r, { name: "Ana", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "set", width: 60, height: 40 } },
    { side: "a" }, { random: seededRandom(3) });
  const objs = JSON.stringify(r.game.objectives);
  applyCommand(r, { verb: "field", attrs: { action: "reroll" } },
    { side: "a" }, { random: seededRandom(99) });
  assert.equal(JSON.stringify(r.game.objectives), objs); // unchanged
});

test("Ready is blocked until the owner locks the field", () => {
  const r = createRoom("C4");
  claimSide(r, { name: "Ana", side: "a" });
  const W2 = { lr: "Mini Gun", melee: "Sword", class: "light" };
  for (const name of ["r1", "r2", "r3"]) {
    applyCommand(r, { verb: "add", attrs: { name, owner: "a", ...W2 } }, { side: "a" });
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, { side: "a" });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, false); // field not locked
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, { side: "a" });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `field` verb is unhandled (dims unchanged) and Ready succeeds before lock.

- [ ] **Step 3: Implement the command + gate**

In `shared/game-state.js` `applyCommand`, add a new branch. Place it right after the
`} else if (verb === "setdice") { ... }` block:

```js
  } else if (verb === "field") {
    const sideId = normalizeSide(room, context.side);
    const action = String(a.action || "set").toLowerCase();
    if (sideId && sideId === room.ownerSide && !room.game.started) {
      if (action === "lock") {
        if (!room.field.locked) { room.field.locked = true; changed = true; }
      } else if (!room.field.locked) {
        if (action === "reroll") {
          room.field.terrain = scatterTerrain(room.field, options.random);
          changed = true;
        } else if (action === "set") {
          const dims = clampDimensions(
            a.width != null ? a.width : room.field.width,
            a.height != null ? a.height : room.field.height,
          );
          room.field.width = dims.width;
          room.field.height = dims.height;
          if (a.diagonal === "trbl" || a.diagonal === "tlbr") room.field.diagonal = a.diagonal;
          room.game.objectives = computeObjectives(room.field);
          room.field.terrain = scatterTerrain(room.field, options.random);
          changed = true;
        }
      }
    }
  }
```

In the same function, find the `ready` branch and add the locked-field requirement.
Change its condition from:

```js
    if (side && !room.game.started && sideRigCount(room, side.id) >= 3 && !side.ready) {
```

to:

```js
    if (side && !room.game.started && room.field.locked &&
        sideRigCount(room, side.id) >= 3 && !side.ready) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS — all tests including the 4 new command/gate tests.

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `node --test "shared/**/*.test.js" "server/**/*.test.js"`
Expected: PASS — all files green.

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat: field command (set/reroll/lock) and Ready-on-lock gate"
```

---

## Task 4: Client types + shared module declaration

**Files:**
- Modify: `client/src/state/types.ts`
- Modify: `client/shared.d.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Add TypeScript types**

In `client/src/state/types.ts`, add these interfaces after the `Resolution` interface:

```ts
export type Diagonal = "tlbr" | "trbl";
export interface Objective { x: number; y: number; vp: number; }
export interface TerrainPiece { x: number; y: number; size: "sm" | "md"; }
export interface FieldState {
  width: number;
  height: number;
  diagonal: Diagonal;
  terrain: TerrainPiece[];
  locked: boolean;
}
```

In the same file, add `objectives` to `GameState` (after the `sides: Side[];` line):

```ts
  objectives?: Objective[];
```

And extend `ServerState` (after `game: GameState | null;`):

```ts
  ownerSide?: string | null;
  field?: FieldState | null;
```

- [ ] **Step 2: Declare the shared module**

In `client/shared.d.ts`, add a new module declaration block after the
`/shared/glossary.js` block:

```ts
declare module "/shared/field.js" {
  export interface FieldLike { width: number; height: number; diagonal: "tlbr" | "trbl"; }
  export const FIELD_MIN: { width: number; height: number };
  export const FIELD_MAX: { width: number; height: number };
  export const FIELD_DEFAULT: { width: number; height: number };
  export const OBJ_FRACTION: number;
  export function halfDiag(w: number, h: number): number;
  export function clampDimensions(w: number, h: number): { width: number; height: number };
  export function emptyCorners(field: FieldLike): Array<{ x: number; y: number }>;
  export function deploymentCorners(field: FieldLike): Array<{ x: number; y: number }>;
  export function fieldCenter(field: FieldLike): { x: number; y: number };
  export function computeObjectives(field: FieldLike): Array<{ x: number; y: number; vp: number }>;
  export function setback(field: FieldLike): number;
  export function scatterTerrain(field: FieldLike, random?: () => number): Array<{ x: number; y: number; size: "sm" | "md" }>;
}
```

- [ ] **Step 3: Map the path in tsconfig**

In `tsconfig.json`, add an entry to `compilerOptions.paths` (after the
`"/shared/glossary.js"` line):

```json
      "/shared/field.js": ["./client/shared.d.ts"],
```

- [ ] **Step 4: Verify the client still type-checks / builds**

Run: `npx vitest run client/src/App.test.tsx`
Expected: PASS — existing app test compiles and passes with the new types present.

- [ ] **Step 5: Commit**

```bash
git add client/src/state/types.ts client/shared.d.ts tsconfig.json
git commit -m "feat: client types + shared.d.ts for field map"
```

---

## Task 5: `FieldMap` read-only SVG component

**Files:**
- Create: `client/src/components/FieldMap.tsx`
- Create: `client/src/styles/field-map.css`
- Test: `client/src/components/FieldMap.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/components/FieldMap.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { FieldMap } from "./FieldMap";
import type { FieldState, Objective } from "../state/types";

const field: FieldState = {
  width: 48, height: 32, diagonal: "tlbr",
  terrain: [
    { x: 20, y: 12, size: "sm" },
    { x: 30, y: 20, size: "md" },
    { x: 12, y: 22, size: "sm" },
    { x: 36, y: 10, size: "md" },
  ],
  locked: false,
};
const objectives: Objective[] = [
  { x: 24, y: 16, vp: 2 },
  { x: 14, y: 9, vp: 1 },
  { x: 34, y: 23, vp: 1 },
];

test("renders three objective markers and every terrain piece", () => {
  render(<FieldMap field={field} objectives={objectives} mySide="a" ownerSide="a" />);
  expect(screen.getAllByTestId("objective")).toHaveLength(3);
  expect(screen.getAllByTestId("terrain")).toHaveLength(4);
});

test("labels the viewer's own deployment zone", () => {
  render(<FieldMap field={field} objectives={objectives} mySide="a" ownerSide="a" />);
  expect(screen.getByText("You deploy")).toBeInTheDocument();
  expect(screen.getByText("Enemy deploys")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/components/FieldMap.test.tsx`
Expected: FAIL — `Cannot find module './FieldMap'`.

- [ ] **Step 3: Write the component**

Create `client/src/styles/field-map.css`:

```css
.field-map { width: 100%; display: block; }
.field-map .fm-field { fill: var(--surface-1, #0a0c0f); stroke: #232a34; stroke-width: 1; }
.field-map .fm-half-mine { fill: #1d9e75; fill-opacity: 0.22; }
.field-map .fm-half-foe { fill: #d85a30; fill-opacity: 0.22; }
.field-map .fm-diag { stroke: #6b7280; stroke-width: 1.25; stroke-dasharray: 6 5; }
.field-map .fm-obj { fill: #ef9f27; stroke: #854f0b; }
.field-map .fm-obj-label, .field-map .fm-zone-label {
  fill: #c2c0b6; font-size: 11px; font-family: var(--font-mono, monospace);
}
.field-map .fm-terrain { fill: #5f5e5a; stroke: #2c2c2a; stroke-width: 0.5; }
.field-controls { margin: 0.75rem 0; }
.field-controls .fc-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.field-controls label { font-size: 0.8rem; color: var(--text-secondary, #9c9a92); }
.field-controls input[type="number"] { width: 4.5rem; }
```

Create `client/src/components/FieldMap.tsx`:

```tsx
import { emptyCorners, deploymentCorners } from "/shared/field.js";
import type { FieldState, Objective } from "../state/types";
import "../styles/field-map.css";

interface Props {
  field: FieldState;
  objectives: Objective[];
  mySide: string;
  ownerSide: string | null;
}

const PAD = 18;
const CANVAS_W = 520;

export function FieldMap({ field, objectives, mySide, ownerSide }: Props) {
  const scale = (CANVAS_W - PAD * 2) / field.width;
  const canvasH = field.height * scale + PAD * 2;
  const sx = (xIn: number) => PAD + xIn * scale;
  const sy = (yIn: number) => PAD + yIn * scale;

  const [e0, e1] = emptyCorners(field);
  const [ownerC, enemyC] = deploymentCorners(field);
  const viewerIsOwner = mySide === ownerSide;
  const mineC = viewerIsOwner ? ownerC : enemyC;
  const foeC = viewerIsOwner ? enemyC : ownerC;

  const tri = (c: { x: number; y: number }) =>
    `${sx(e0.x)},${sy(e0.y)} ${sx(c.x)},${sy(c.y)} ${sx(e1.x)},${sy(e1.y)}`;

  return (
    <svg
      className="field-map"
      viewBox={`0 0 ${CANVAS_W} ${canvasH}`}
      role="img"
      aria-label={`Battlefield ${field.width} by ${field.height} inches`}
    >
      <rect
        className="fm-field"
        x={PAD} y={PAD}
        width={field.width * scale} height={field.height * scale}
        rx={8}
      />
      <polygon className="fm-half-mine" points={tri(mineC)} />
      <polygon className="fm-half-foe" points={tri(foeC)} />
      <line className="fm-diag" x1={sx(e0.x)} y1={sy(e0.y)} x2={sx(e1.x)} y2={sy(e1.y)} />

      {field.terrain.map((t, i) => {
        const s = t.size === "md" ? 30 : 20;
        return (
          <rect
            key={i} data-testid="terrain" className="fm-terrain"
            x={sx(t.x) - s / 2} y={sy(t.y) - s / 2} width={s} height={s} rx={4}
          />
        );
      })}

      {objectives.map((o, i) => (
        <g key={i}>
          <circle
            data-testid="objective" className="fm-obj"
            cx={sx(o.x)} cy={sy(o.y)} r={o.vp === 2 ? 13 : 9}
            strokeWidth={o.vp === 2 ? 1.5 : 0.75}
          />
          <text className="fm-obj-label" x={sx(o.x)} y={sy(o.y) + 4} textAnchor="middle">
            {o.vp}
          </text>
        </g>
      ))}

      <text className="fm-zone-label" x={sx(mineC.x)} y={sy(mineC.y)} textAnchor="middle">
        You deploy
      </text>
      <text className="fm-zone-label" x={sx(foeC.x)} y={sy(foeC.y)} textAnchor="middle">
        Enemy deploys
      </text>
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/components/FieldMap.test.tsx`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/FieldMap.tsx client/src/components/FieldMap.test.tsx client/src/styles/field-map.css
git commit -m "feat: read-only FieldMap SVG component"
```

---

## Task 6: Field Setup drawer + Stage/Ready wiring

**Files:**
- Create: `client/src/components/FieldControls.tsx`
- Modify: `client/src/components/Stage.tsx`
- Modify: `client/src/components/BattleSetup.tsx`

- [ ] **Step 1: Write the FieldControls component**

Create `client/src/components/FieldControls.tsx`:

```tsx
import { useState } from "react";
import { FIELD_MIN, FIELD_MAX } from "/shared/field.js";
import { useRoomState } from "../state/RoomStateContext";
import { useCommands } from "../hooks/useCommands";
import { useDrawer } from "../state/DrawerContext";
import { FieldMap } from "./FieldMap";
import type { FieldState, Objective } from "../state/types";

const DEFAULT_FIELD: FieldState = {
  width: 54, height: 36, diagonal: "tlbr", terrain: [], locked: false,
};

// The drawer body: local dims, live server-driven preview, dispatches commands.
function FieldSetupBody({ onLocked }: { onLocked: () => void }) {
  const { game, field, ownerSide, session } = useRoomState();
  const sendCommand = useCommands();
  const f = field ?? DEFAULT_FIELD;
  const [w, setW] = useState(f.width);
  const [h, setH] = useState(f.height);

  const apply = () => sendCommand("field", { action: "set", width: w, height: h });
  const flip = () =>
    sendCommand("field", {
      action: "set", width: w, height: h,
      diagonal: f.diagonal === "tlbr" ? "trbl" : "tlbr",
    });
  const reroll = () => sendCommand("field", { action: "reroll" });
  const lock = async () => { await sendCommand("field", { action: "lock" }); onLocked(); };

  return (
    <div className="field-controls">
      <FieldMap
        field={f}
        objectives={(game?.objectives as Objective[]) ?? []}
        mySide={session?.side ?? "a"}
        ownerSide={ownerSide ?? null}
      />
      <div className="fc-row">
        <label>Width (in)
          <input type="number" min={FIELD_MIN.width} max={FIELD_MAX.width}
            value={w} onChange={(e) => setW(Number(e.target.value))} />
        </label>
        <label>Height (in)
          <input type="number" min={FIELD_MIN.height} max={FIELD_MAX.height}
            value={h} onChange={(e) => setH(Number(e.target.value))} />
        </label>
      </div>
      <div className="fc-row">
        <button type="button" className="dwr-btn" onClick={apply}>Apply size</button>
        <button type="button" className="dwr-btn" onClick={flip}>Flip diagonal</button>
        <button type="button" className="dwr-btn" onClick={reroll}>Re-roll terrain</button>
        <button type="button" className="dwr-btn primary" onClick={lock}>Lock field</button>
      </div>
    </div>
  );
}

export function FieldControls() {
  const { game, field, ownerSide, session } = useRoomState();
  const { openDrawer, closeDrawer } = useDrawer();
  const f = field ?? DEFAULT_FIELD;
  const isOwner = Boolean(session?.side && session.side === ownerSide);
  const started = Boolean(game?.started);

  return (
    <section className="field-controls" aria-label="Battlefield">
      <FieldMap
        field={f}
        objectives={(game?.objectives as Objective[]) ?? []}
        mySide={session?.side ?? "a"}
        ownerSide={ownerSide ?? null}
      />
      {isOwner && !started && !f.locked ? (
        <button
          type="button"
          className="btn btn--primary"
          onClick={() =>
            openDrawer({
              title: "Field setup",
              tone: "oil",
              render: () => <FieldSetupBody onLocked={closeDrawer} />,
            })
          }
        >
          Set field
        </button>
      ) : null}
      {!isOwner && !f.locked ? (
        <p className="fc-wait">Waiting for the owner to set the field…</p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Expose `field` and `ownerSide` in room state**

`roomReducer.ts` currently keeps only `rigs`/`game`/`stateVersion` from the server
payload, so `useRoomState()` never surfaces `field`/`ownerSide`. Thread them through.

In `client/src/state/roomReducer.ts`, change the type import line:

```ts
import type { Rig, GameState, Session, ServerState, FieldState } from "./types";
```

Add the two fields to the `RoomState` interface (after `game: GameState | null;`):

```ts
  field: FieldState | null;
  ownerSide: string | null;
```

Extend `initialRoomState`:

```ts
export const initialRoomState: RoomState = {
  rigs: [], game: null, field: null, ownerSide: null, stateVersion: -1, session: null,
};
```

In the `applyServerState` case, carry them in the returned object (after
`game: s.game ?? null,`):

```ts
        field: s.field ?? null,
        ownerSide: s.ownerSide ?? null,
```

Run: `npx vitest run client/src/state/roomReducer.test.ts`
Expected: PASS — existing reducer tests stay green with the added fields.

- [ ] **Step 3: Render FieldControls in Stage**

In `client/src/components/Stage.tsx`, import and render it above `BattleSetup`.
Add the import:

```tsx
import { FieldControls } from "./FieldControls";
```

And place `<FieldControls />` between `<RigDeck />` and `<BattleSetup />`:

```tsx
      <RigDeck />
      <FieldControls />
      <BattleSetup />
```

- [ ] **Step 4: Gate the Ready button copy in BattleSetup**

In `client/src/components/BattleSetup.tsx`, read `field` from room state and reflect
the lock gate. Change the destructure line:

```tsx
  const { rigs, game, session, field } = useRoomState();
```

In the `else` branch (pre-start), after the existing `readyDisabled` assignment, add
the field gate:

```tsx
    if (!field?.locked) {
      readyDisabled = true;
      bountyText = myCount >= 3
        ? "Owner must lock the field before you can ready up."
        : bountyText;
    }
```

- [ ] **Step 5: Run the full client suite**

Run: `npx vitest run`
Expected: PASS — all client tests green (FieldMap, App, RigWizard, etc.).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/FieldControls.tsx client/src/components/Stage.tsx client/src/components/BattleSetup.tsx client/src/state/roomReducer.ts
git commit -m "feat: field setup drawer, Stage map, Ready lock gate"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS — Vitest (client) and `node --test` (shared + server) both green.

- [ ] **Step 2: Manual smoke test in the preview server**

Start the dev server, open two browsers to the same room, join as A then B.
Verify: owner (A) sees "Set field"; the drawer changes dimensions, flips the
diagonal, re-rolls terrain, and locks; both A and B see the same map; Ready is
disabled until the field is locked; after lock both sides can ready and start.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test: verify configurable field map end-to-end"
```

---

## Notes for the implementer

- **No server route changes.** `/api/game/:room/command` forwards `{verb, attrs}` and
  `{side}` to `applyCommand(room, cmd, { side }, options)`. The `field` verb and the
  owner check (`context.side === room.ownerSide`) live entirely in `game-state.js`.
- **Terrain determinism.** Terrain is generated server-side via the injected
  `options.random` (same pattern as `rollD`) and broadcast, so both clients render an
  identical scatter. Never generate terrain on the client.
- **Objectives are authoritative.** `game.objectives` is computed on `set`; the client
  only reads it. Do not recompute objectives in the client.
- **Cross-package import.** The client imports geometry from `/shared/field.js` via the
  Vite alias; types come from the `client/shared.d.ts` declaration added in Task 4.
- **Setback band descoped for v1.** The spec mentions drawing the deployment setback as an
  inset band along the diagonal. The v1 `FieldMap` conveys deployment zones with the two
  shaded halves + the dashed diagonal and does **not** draw the setback band. `setback()`
  is implemented and exported in `shared/field.js` for a later pass; drawing it would mean
  offsetting the diagonal inward on both sides — a visual refinement, not core to setup.
