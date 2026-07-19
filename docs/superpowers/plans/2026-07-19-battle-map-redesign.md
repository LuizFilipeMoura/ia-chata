# Battle Map Redesign — Declutter + Drag-to-Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declutter the V2 digital battle map (rectangles only, half the terrain) and replace tap-to-place movement with a grab-and-drag mechanic using nested move/sprint reach rings.

**Architecture:** Terrain density is halved at the scatter source (`shared/field.js`) so the engine and render agree. The battle map renders terrain rect-only via a `FieldFurniture` prop. Movement logic is extracted into a pure, unit-tested `dragMove.ts`; `MoveTargetLayer` becomes a thin SVG binding that grabs the active rig, drags a clamped ghost, auto-picks move vs sprint by ring, then re-aims and confirms. Wire contract to the server is unchanged.

**Tech Stack:** TypeScript, React, Vitest + @testing-library/react, SVG, pointer events. Shared game logic in plain ESM JS under `shared/`.

**Concurrent-committer note:** Another session commits to this branch with broad `git add`. NEVER `git add -A` / `git add .`. Stage only the exact files each step lists.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `shared/field.js` | Adds `thinDigital` and halves the digital scatter before mirroring. Only shared-side change. |
| `client/src/v2/battle/FieldFurniture.tsx` | Gains `rectOnly` prop; draws any terrain shape as its bounding-box rect when set. |
| `client/src/v2/battle/BattleMap.tsx` | Passes `rectOnly` to `FieldFurniture` (battle map only). |
| `client/src/v2/battle/dragMove.ts` | NEW. Pure move helpers: `clampToPivot`, `actionForDistance`, `placeDrag`, `Placed` type. |
| `client/src/v2/battle/dragMove.test.ts` | NEW. Unit tests for the pure helpers. |
| `client/src/v2/battle/MoveTargetLayer.tsx` | Reworked: two reach rings, grab-and-drag session, clamp, post-release aim handle. Re-exports `Placed` from `dragMove`. |
| `client/src/v2/battle/BattleScreen.tsx` | Derives `sprintAllowed`, passes it to the overlay, dispatches `placed.action`. |
| `client/src/v2/battle/ActionConsole.tsx` | Drops the separate Sprint tile from the Move group (Move now solos to arm the drag). |
| `client/src/v2/styles/field.css` | Nested-ring, grab, ghost styling. |
| `client/src/v2/battle/BattleScreen.test.tsx` | Updated for the solo-Move arm + drag flow. |

---

## Task 1: Halve digital terrain at the source

**Files:**
- Modify: `shared/field.js` (the digital branch of `scatterTerrain`, ~lines 163-221)
- Test: `shared/field.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/field.test.js`:

```javascript
import { thinDigital } from "./field.js"; // add to the existing import list at top

test("thinDigital keeps every other piece (biggest-first order preserved)", () => {
  assert.deepEqual(thinDigital(["a", "b", "c", "d"]), ["a", "c"]);
  assert.deepEqual(thinDigital(["only"]), ["only"]);
  assert.deepEqual(thinDigital([]), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/field.test.js`
Expected: FAIL — `thinDigital` is not exported / not a function.

- [ ] **Step 3: Add `thinDigital` and use it before the mirror**

In `shared/field.js`, add the export near the other helpers (e.g. just above `scatterTerrain`):

```javascript
// Halve a digital scatter: keep every other piece in the biggest-first order so
// the largest anchor always survives. Applied before the 180° mirror, so the
// board reads about half as dense while staying symmetric and deterministic.
export const thinDigital = (pieces) => pieces.filter((_, i) => i % 2 === 0);
```

Then, in `scatterTerrain`, change the mirror block. Replace:

```javascript
  const out = opts.digital
    ? placed.flatMap((p) => [p, { ...p, x: round2(field.width - p.x), y: round2(field.height - p.y) }])
    : placed;
```

with:

```javascript
  const base = opts.digital ? thinDigital(placed) : placed;
  const out = opts.digital
    ? base.flatMap((p) => [p, { ...p, x: round2(field.width - p.x), y: round2(field.height - p.y) }])
    : base;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/field.test.js`
Expected: PASS — the new `thinDigital` test plus all existing digital-scatter tests (kinds, clearance, determinism, mirror symmetry) stay green. Thinning only removes pieces, so clearance/kind/determinism invariants still hold.

- [ ] **Step 5: Commit**

```bash
git add shared/field.js shared/field.test.js
git commit -m "feat(field): halve digital terrain density before mirror"
```

---

## Task 2: `FieldFurniture` rect-only render

**Files:**
- Modify: `client/src/v2/battle/FieldFurniture.tsx`
- Test: `client/src/v2/battle/FieldFurniture.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/battle/FieldFurniture.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { FieldFurniture } from "./FieldFurniture";
import { makeProjection } from "./fieldProjection";
import type { FieldState } from "../../state/types";

const field = { width: 54, height: 36, diagonal: "tlbr", locked: true, terrain: [] } as unknown as FieldState;
const proj = makeProjection(field);

test("rectOnly draws a poly piece as a rect, not a polygon", () => {
  const f = { ...field, terrain: [{ x: 20, y: 18, kind: "wood", shape: "poly", points: [[-2, -2], [2, -2], [2, 2], [-2, 2]] }] } as unknown as FieldState;
  const { container } = render(<svg><FieldFurniture field={f} objectives={[]} proj={proj} rectOnly /></svg>);
  expect(container.querySelector("polygon")).toBeNull();
  expect(container.querySelector('rect[data-testid="terrain"]')).toBeTruthy();
});

test("rectOnly draws an ellipse piece as a rect", () => {
  const f = { ...field, terrain: [{ x: 20, y: 18, kind: "crater", shape: "ellipse", rx: 3, ry: 2 }] } as unknown as FieldState;
  const { container } = render(<svg><FieldFurniture field={f} objectives={[]} proj={proj} rectOnly /></svg>);
  expect(container.querySelector("ellipse")).toBeNull();
  expect(container.querySelector('rect[data-testid="terrain"]')).toBeTruthy();
});

test("without rectOnly, a poly still renders as a polygon", () => {
  const f = { ...field, terrain: [{ x: 20, y: 18, kind: "wood", shape: "poly", points: [[-2, -2], [2, -2], [2, 2]] }] } as unknown as FieldState;
  const { container } = render(<svg><FieldFurniture field={f} objectives={[]} proj={proj} /></svg>);
  expect(container.querySelector("polygon")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/v2/battle/FieldFurniture.test.tsx`
Expected: FAIL — `rectOnly` prop not supported; poly still renders as `<polygon>`.

- [ ] **Step 3: Add `rectOnly` to `FieldFurniture`**

In `client/src/v2/battle/FieldFurniture.tsx`, extend `Props` and short-circuit non-rect shapes to a bounding-box rect. Replace the `interface Props` block:

```tsx
interface Props {
  field: FieldState;
  objectives: Objective[];
  proj: FieldProjection;
  /** Battle map passes this: draw every terrain piece as its bounding-box rect. */
  rectOnly?: boolean;
}
```

Change the signature line `export function FieldFurniture({ field, objectives, proj }: Props) {` to:

```tsx
export function FieldFurniture({ field, objectives, proj, rectOnly = false }: Props) {
```

Inside the `field.terrain.map((t, i) => { ... })` body, immediately after `const spin = ...`, insert a rect-only branch that computes the bounding box for poly/ellipse:

```tsx
        if (rectOnly && t.shape !== "rect") {
          let bw: number, bh: number;
          if (t.shape === "poly" && t.points) {
            const xs = t.points.map(([dx]) => dx);
            const ys = t.points.map(([, dy]) => dy);
            bw = (Math.max(...xs) - Math.min(...xs)) * scale;
            bh = (Math.max(...ys) - Math.min(...ys)) * scale;
          } else {
            // ellipse: bounding box is the full 2·rx × 2·ry
            bw = (t.rx ?? 2) * 2 * scale;
            bh = (t.ry ?? 2) * 2 * scale;
          }
          return (
            <rect
              key={i} data-testid="terrain" className={cls}
              x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh}
              rx={Math.min(3, bw * 0.15)} transform={spin}
            />
          );
        }
```

Leave the existing poly / ellipse / rect branches below it untouched — they now only run when `rectOnly` is false (or the piece is already a rect).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/v2/battle/FieldFurniture.test.tsx`
Expected: PASS — all three tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/FieldFurniture.tsx client/src/v2/battle/FieldFurniture.test.tsx
git commit -m "feat(v2): FieldFurniture rectOnly bounding-box render"
```

---

## Task 3: Wire `rectOnly` through the battle map

**Files:**
- Modify: `client/src/v2/battle/BattleMap.tsx:32`
- Test: `client/src/v2/battle/BattleMap.test.tsx` (existing "draws the field furniture" test)

- [ ] **Step 1: Update the existing furniture test to assert rect-only**

In `client/src/v2/battle/BattleMap.test.tsx`, replace the `draws the field furniture` test body's terrain piece and assertion so it proves the battle map squares an ellipse. Change the `terrain` array to a poly and assert no `<polygon>`/`<ellipse>`:

```tsx
test("draws the field furniture as rectangles — grid, terrain and objectives", () => {
  const terrainField = {
    width: 54, height: 36, diagonal: "tlbr", locked: true,
    terrain: [{ x: 20, y: 18, kind: "wood", shape: "poly", points: [[-2, -2], [2, -2], [2, 2], [-2, 2]] }],
  } as unknown as FieldState;
  const objectives = [{ x: 27, y: 18, vp: 2 }, { x: 10, y: 10, vp: 1 }] as unknown as never[];
  const { getAllByTestId, container } = render(
    <svg><BattleMapLayers field={terrainField} objectives={objectives} rigs={[rig({})]} mySide="a"
      ownerSide="a" priorityTargetId={null} selectedId={null}
      onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  expect(getAllByTestId("terrain")).toHaveLength(1);
  expect(container.querySelector("polygon")).toBeNull();
  expect(getAllByTestId("objective")).toHaveLength(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/v2/battle/BattleMap.test.tsx`
Expected: FAIL — `BattleMapLayers` renders a `<polygon>` (rectOnly not passed yet).

- [ ] **Step 3: Pass `rectOnly` from `BattleMapLayers`**

In `client/src/v2/battle/BattleMap.tsx`, change line 32 from:

```tsx
      <FieldFurniture field={field} objectives={objectives} proj={proj} />
```

to:

```tsx
      <FieldFurniture field={field} objectives={objectives} proj={proj} rectOnly />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/v2/battle/BattleMap.test.tsx`
Expected: PASS — all BattleMap tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/BattleMap.tsx client/src/v2/battle/BattleMap.test.tsx
git commit -m "feat(v2): battle map renders terrain rect-only"
```

---

## Task 4: Pure drag helpers (`dragMove.ts`)

**Files:**
- Create: `client/src/v2/battle/dragMove.ts`
- Test: `client/src/v2/battle/dragMove.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/battle/dragMove.test.ts`:

```ts
import { expect, test } from "vitest";
import { actionForDistance, clampToPivot, placeDrag } from "./dragMove";
import type { FieldState, Rig } from "../../state/types";

const field = { width: 54, height: 36, diagonal: "tlbr", locked: true, terrain: [] } as unknown as FieldState;
const mover = (over: Partial<Rig> = {}): Rig => ({
  id: 1, name: "RED", owner: "a", weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, pos: { x: 27, y: 18 }, facing: 0, ...over,
} as Rig);

test("clampToPivot limits a turn to ±90° and reports the magnitude", () => {
  expect(clampToPivot(200, 0).pivot).toBe(90);
  expect(clampToPivot(45, 0)).toEqual({ facing: 45, pivot: 45 });
});

test("actionForDistance picks sprint only past the move ring and only when allowed", () => {
  expect(actionForDistance(3, 5, true)).toBe("move");
  expect(actionForDistance(8, 5, true)).toBe("sprint");
  expect(actionForDistance(8, 5, false)).toBe("move");
});

test("placeDrag clamps an out-of-reach point back inside budget", () => {
  const rig = mover();
  const p = placeDrag(field, [rig], rig, { x: 60, y: 18 }, false); // far east, off-field
  const dist = Math.hypot(p.dest.x - 27, p.dest.y - 18);
  expect(p.action).toBe("move");
  expect(p.length).toBeLessThanOrEqual(p.length + 1e-6); // sanity: finite
  expect(dist).toBeLessThan(60 - 27); // pulled in from the raw point
});

test("placeDrag keeps a nearby reachable point as-is and faces toward it", () => {
  const rig = mover();
  const p = placeDrag(field, [rig], rig, { x: 30, y: 18 }, false); // 3\" east, reachable
  expect(p.dest.x).toBeCloseTo(30, 1);
  expect(p.dest.y).toBeCloseTo(18, 1);
  expect(p.facing).toBeCloseTo(0, 0); // heading due east
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/v2/battle/dragMove.test.ts`
Expected: FAIL — `./dragMove` does not exist.

- [ ] **Step 3: Create `dragMove.ts`**

Create `client/src/v2/battle/dragMove.ts`:

```ts
import { moveBudget } from "/shared/game-state.js";
import { computeMovePreview } from "./movePreview";
import type { FieldState, Rig } from "../../state/types";

export interface Placed {
  dest: { x: number; y: number };
  facing: number;
  pivot: number;
  length: number;
  path: Array<{ x: number; y: number }>;
  action: "move" | "sprint";
}

type Pt = { x: number; y: number };

// Clamp a desired heading to the engine's ±90° pivot budget from `cur`, and
// report the resulting pivot magnitude. The digital-move handler rejects a
// facing that pivots more than 90°, so the affordance never offers one.
export function clampToPivot(target: number, cur: number): { facing: number; pivot: number } {
  const delta = ((target - cur + 540) % 360) - 180;
  const clamped = Math.max(-90, Math.min(90, delta));
  return { facing: cur + clamped, pivot: Math.abs(clamped) };
}

// Which action a drop distance selects: sprint only once past the move ring, and
// only when the engine actually allows sprinting this activation.
export function actionForDistance(dist: number, moveB: number, sprintAllowed: boolean): "move" | "sprint" {
  return sprintAllowed && dist > moveB ? "sprint" : "move";
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// Walk inward from `dest` toward `origin` for the farthest point whose routed
// path is within budget — terrain can push the route past the ring even when the
// straight line fits. Bounded binary search; origin is always reachable (0").
function farthestReachable(field: FieldState, rigs: Rig[], rig: Rig, action: "move" | "sprint", origin: Pt, dest: Pt) {
  let lo = 0, hi = 1;
  let best = { dest: origin, preview: computeMovePreview(field, rigs, rig, action, origin) };
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const p = lerp(origin, dest, mid);
    const pv = computeMovePreview(field, rigs, rig, action, p);
    if (pv.reachable) { best = { dest: p, preview: pv }; lo = mid; } else hi = mid;
  }
  return best;
}

// Turn a raw cursor point (field inches) into a legal placed move: pick move vs
// sprint by ring, clamp to that action's reach radius, then clamp again to a
// terrain-routable point. Facing tracks the drag heading, pivot-clamped.
export function placeDrag(
  field: FieldState, rigs: Rig[], rig: Rig, rawDest: Pt, sprintAllowed: boolean,
): Placed {
  const origin: Pt = rig.pos ?? { x: 0, y: 0 };
  const moveB = moveBudget(rig as never, "move");
  const dx = rawDest.x - origin.x, dy = rawDest.y - origin.y;
  const dist = Math.hypot(dx, dy);
  const action = actionForDistance(dist, moveB, sprintAllowed);
  const maxR = moveBudget(rig as never, action);
  const ringDest = dist > maxR && dist > 1e-6
    ? { x: origin.x + (dx / dist) * maxR, y: origin.y + (dy / dist) * maxR }
    : rawDest;
  let dest = ringDest;
  let preview = computeMovePreview(field, rigs, rig, action, dest);
  if (!preview.reachable) {
    const best = farthestReachable(field, rigs, rig, action, origin, ringDest);
    dest = best.dest; preview = best.preview;
  }
  const { facing, pivot } = clampToPivot(preview.facing, rig.facing ?? 0);
  return { dest, facing, pivot, length: preview.length, path: preview.path, action };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd client && npx vitest run src/v2/battle/dragMove.test.ts`
Expected: PASS — all four tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/dragMove.ts client/src/v2/battle/dragMove.test.ts
git commit -m "feat(v2): pure drag-move helpers (ring pick + reach clamp)"
```

---

## Task 5: Rework `MoveTargetLayer` — rings + grab-and-drag

**Files:**
- Modify (full rewrite): `client/src/v2/battle/MoveTargetLayer.tsx`

This task has no unit test of its own (DOM drag is covered by the integration test in Task 8). Verify by typecheck + the app preview.

- [ ] **Step 1: Rewrite `MoveTargetLayer.tsx`**

Replace the entire file with:

```tsx
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { moveBudget, rigEffects } from "/shared/game-state.js";
import type { FieldState, Rig } from "../../state/types";
import type { FieldProjection } from "./fieldProjection";
import { clampToPivot, placeDrag, type Placed } from "./dragMove";

// Re-export so existing importers (BattleScreen) keep their `Placed` source.
export type { Placed };

// Convert a DOM pointer position into field inches against the surface <rect>,
// which spans the field region EXACTLY — so the fraction across it is the
// fraction across the field. Ratio-based, so it's CSS-scale invariant.
function pointToInches(clientX: number, clientY: number, rect: DOMRect, field: FieldState) {
  const fx = rect.width ? (clientX - rect.left) / rect.width : 0;
  const fy = rect.height ? (clientY - rect.top) / rect.height : 0;
  return { x: fx * field.width, y: fy * field.height };
}

interface OverlayProps {
  proj: FieldProjection;
  field: FieldState;
  rigs: Rig[];
  rig: Rig;
  sprintAllowed: boolean;
  placed: Placed | null;
  onPlaced: (p: Placed | null) => void;
}

// SVG overlay rendered inside BattleMap's <svg>: two reach rings (inner move,
// outer sprint), a grab handle on the active rig that drags a clamped ghost to a
// destination, and — once placed — the routed path and a facing handle to re-aim.
export function MoveTargetOverlay({ proj, field, rigs, rig, sprintAllowed, placed, onPlaced }: OverlayProps) {
  const [dragging, setDragging] = useState(false);
  const [aiming, setAiming] = useState(false);
  const surfaceRef = useRef<SVGRectElement>(null);
  if (!rig.pos) return null;

  const cx = proj.sx(rig.pos.x);
  const cy = proj.sy(rig.pos.y);
  const moveR = moveBudget(rig as never, "move") * proj.scale;
  const sprintR = moveBudget(rig as never, "sprint") * proj.scale;

  const surfaceRect = () => surfaceRef.current!.getBoundingClientRect();

  // --- Drag the rig to a destination -------------------------------------
  const updateFromPointer = (clientX: number, clientY: number) => {
    const raw = pointToInches(clientX, clientY, surfaceRect(), field);
    onPlaced(placeDrag(field, rigs, rig, raw, sprintAllowed));
  };
  const startDrag = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };
  const onDragMove = (e: ReactPointerEvent<SVGCircleElement>) => {
    if (dragging) updateFromPointer(e.clientX, e.clientY);
  };
  const endDrag = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };

  // --- Re-aim after release ----------------------------------------------
  const startAim = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setAiming(true);
  };
  const onAimMove = (e: ReactPointerEvent<SVGCircleElement>) => {
    if (!aiming || !placed) return;
    const p = pointToInches(e.clientX, e.clientY, surfaceRect(), field);
    const ang = (Math.atan2(p.y - placed.dest.y, p.x - placed.dest.x) * 180) / Math.PI;
    const { facing, pivot } = clampToPivot(ang, rig.facing ?? 0);
    onPlaced({ ...placed, facing, pivot });
  };
  const endAim = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setAiming(false);
  };

  const gcx = placed ? proj.sx(placed.dest.x) : cx;
  const gcy = placed ? proj.sy(placed.dest.y) : cy;
  const fr = ((placed?.facing ?? rig.facing ?? 0) * Math.PI) / 180;
  const hx = gcx + Math.cos(fr) * 22;
  const hy = gcy + Math.sin(fr) * 22;

  return (
    <g className="v2-mt">
      {sprintAllowed && (
        <circle cx={cx} cy={cy} r={sprintR} className="v2-mt-ring is-sprint" fill="none" data-testid="sprint-ring" />
      )}
      <circle cx={cx} cy={cy} r={moveR} className="v2-mt-ring" fill="none" data-testid="reach-ring" />

      {/* Coordinate reference only; never intercepts pointers. */}
      <rect
        ref={surfaceRef}
        data-testid="field-surface"
        x={proj.pad}
        y={proj.pad}
        width={proj.fw}
        height={proj.fh}
        fill="transparent"
        style={{ pointerEvents: "none" }}
      />

      {placed && (
        <>
          <polyline
            className="v2-mt-path"
            points={placed.path.map((pt) => `${proj.sx(pt.x)},${proj.sy(pt.y)}`).join(" ")}
            fill="none"
          />
          <circle cx={gcx} cy={gcy} r={12} className="v2-mt-ghost" />
        </>
      )}

      {/* Grab the active rig and drag it. Rendered above the surface so a
          pointer-down on the token starts the drag session. */}
      <circle
        cx={cx}
        cy={cy}
        r={14}
        className="v2-mt-grab"
        data-testid="drag-handle"
        fill="transparent"
        style={{ cursor: "grab", touchAction: "none" }}
        onPointerDown={startDrag}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
      />

      {placed && (
        <>
          <line x1={gcx} y1={gcy} x2={hx} y2={hy} className="v2-mt-facing" />
          <circle
            cx={hx}
            cy={hy}
            r={6}
            className="v2-mt-handle"
            data-testid="facing-handle"
            style={{ cursor: "grab", touchAction: "none" }}
            onPointerDown={startAim}
            onPointerMove={onAimMove}
            onPointerUp={endAim}
          />
        </>
      )}
    </g>
  );
}

interface ControlsProps {
  rig: Rig;
  action: "move" | "sprint";
  placed: Placed | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// HTML controls docked below the map: a live readout of the placed move and the
// Cancel / Confirm actions. Confirm stays disabled until a destination is placed.
export function MoveTargetControls({ rig, action, placed, onConfirm, onCancel }: ControlsProps) {
  const act = placed?.action ?? action;
  const heat = act === "sprint" ? (rigEffects(rig as never).actionHeat?.sprint ?? 2) : 1;
  return (
    <div className="v2-mt-controls">
      <div className="v2-mt-readout">
        {placed
          ? `${act} ${placed.length.toFixed(1)}″ · pivot ${Math.round(placed.pivot)}° · +${heat}🔥`
          : `Drag ${rig.name} to a destination`}
      </div>
      <div className="v2-mt-buttons">
        <button type="button" className="v2-mt-btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="v2-mt-btn primary" disabled={!placed} onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: PASS (BattleScreen will still typecheck-fail until Task 6; if so, proceed to Task 6 and re-run there). If the only errors are in `BattleScreen.tsx`, that is expected.

- [ ] **Step 3: Commit**

```bash
git add client/src/v2/battle/MoveTargetLayer.tsx
git commit -m "feat(v2): grab-and-drag move overlay with nested reach rings"
```

---

## Task 6: `BattleScreen` — sprint gating + ring-derived dispatch

**Files:**
- Modify: `client/src/v2/battle/BattleScreen.tsx`

- [ ] **Step 1: Add the `availableActions` import**

At the top of `client/src/v2/battle/BattleScreen.tsx`, add:

```tsx
import { availableActions } from "/shared/battle-view.js";
```

- [ ] **Step 2: Derive `sprintAllowed` and drop the old `moveAction`**

Replace:

```tsx
  const proj = makeProjection(field);
  const moveAction = (moving?.action === "sprint" ? "sprint" : "move") as "move" | "sprint";
```

with:

```tsx
  const proj = makeProjection(field);
  // The outer sprint ring is only offered when the engine allows sprinting now.
  const sprintAllowed =
    !!activeRig && !!t &&
    (availableActions(activeRig, t, game?.round) as { key: string; enabled: boolean }[])
      .some((a) => a.key === "sprint" && a.enabled);
```

- [ ] **Step 3: Update the overlay props**

Replace the `overlay` block:

```tsx
  const overlay =
    moving && activeRig ? (
      <MoveTargetOverlay
        proj={proj}
        field={field}
        rigs={rigs}
        rig={activeRig}
        action={moveAction}
        placed={placed}
        onPlaced={setPlaced}
      />
    ) : null;
```

with:

```tsx
  const overlay =
    moving && activeRig ? (
      <MoveTargetOverlay
        proj={proj}
        field={field}
        rigs={rigs}
        rig={activeRig}
        sprintAllowed={sprintAllowed}
        placed={placed}
        onPlaced={setPlaced}
      />
    ) : null;
```

- [ ] **Step 4: Dispatch the ring-derived action on confirm**

Replace `confirmMove`:

```tsx
  const confirmMove = () => {
    if (!moving || !activeRig || !placed) return;
    sendCommand("action", {
      name: activeRig.name,
      action: moveAction,
      dest: placed.dest,
      facing: placed.facing,
    });
    clearMoveTarget();
    setPlaced(null);
  };
```

with:

```tsx
  const confirmMove = () => {
    if (!moving || !activeRig || !placed) return;
    sendCommand("action", {
      name: activeRig.name,
      action: placed.action,
      dest: placed.dest,
      facing: placed.facing,
    });
    clearMoveTarget();
    setPlaced(null);
  };
```

- [ ] **Step 5: Update the docked controls prop**

Replace:

```tsx
          <MoveTargetControls
            rig={activeRig}
            action={moveAction}
            placed={placed}
            onConfirm={confirmMove}
            onCancel={() => clearMoveTarget()}
          />
```

with:

```tsx
          <MoveTargetControls
            rig={activeRig}
            action={placed?.action ?? "move"}
            placed={placed}
            onConfirm={confirmMove}
            onCancel={() => clearMoveTarget()}
          />
```

- [ ] **Step 6: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: PASS — no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/battle/BattleScreen.tsx
git commit -m "feat(v2): battle screen derives sprint ring + dispatches placed action"
```

---

## Task 7: `ActionConsole` — Move solos to arm the drag

**Files:**
- Modify: `client/src/v2/battle/ActionConsole.tsx` (the `childrenFor` helper, ~line 205)

- [ ] **Step 1: Drop Sprint from the Move group**

In `client/src/v2/battle/ActionConsole.tsx`, in `childrenFor`, change the final branch. Replace:

```tsx
        : actions.filter((a) => g.keys.includes(a.key))
```

with:

```tsx
        // Sprint is no longer a separate tile: the drag overlay's outer ring
        // reaches sprint range. The Move tile arms the drag session; sprint stays
        // in the group's `keys` (claimed) so it never leaks into Support.
        : actions.filter((a) => g.keys.includes(a.key) && a.key !== "sprint")
```

- [ ] **Step 2: Run the ActionConsole tests**

Run: `cd client && npx vitest run src/v2/battle/ActionConsole.test.tsx`
Expected: PASS — these tests don't assert the Move popover, so they stay green. The Move group now collapses to a single live action (Move) and fires straight through.

- [ ] **Step 3: Commit**

```bash
git add client/src/v2/battle/ActionConsole.tsx
git commit -m "feat(v2): Move tile arms drag session, drop separate Sprint tile"
```

---

## Task 8: Update the BattleScreen integration test + styles + verify

**Files:**
- Modify: `client/src/v2/battle/BattleScreen.test.tsx` (the arm/place/confirm test)
- Modify: `client/src/v2/styles/field.css`

- [ ] **Step 1: Rewrite the move integration test for the drag flow**

In `client/src/v2/battle/BattleScreen.test.tsx`, replace the `arming a move, placing...` test with:

```tsx
test("arming a move, dragging a reachable destination, and confirming dispatches action with dest+facing", async () => {
  render(<V2Providers><Seed state={digitalState(1)} /><BattleScreen /></V2Providers>);

  // Sprint is gone from the console; Move solos and arms the drag straight through.
  const moveBtn = await screen.findByRole("button", { name: /move/i });
  moveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const surface = await screen.findByTestId("field-surface");
  // The surface rect spans the field region exactly (≈ fw×fh = 468×312 for 54×36),
  // so a pointer fraction across it maps straight to field inches.
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 468, height: 312, right: 468, bottom: 312, x: 0, y: 0, toJSON() {} }) as DOMRect;

  // Grab the rig and drag ~2" east of its {10,10} start (inside the move ring).
  // clientX = 12/54*468 ≈ 104, clientY = 10/36*312 ≈ 87 → dest ≈ {12,10}.
  const handle = await screen.findByTestId("drag-handle");
  handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 104, clientY: 87 }));
  handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 104, clientY: 87 }));

  const confirm = await screen.findByRole("button", { name: /confirm/i });
  confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const call = sendSpy.mock.calls.find((c) => c[0] === "action" && (c[1] as { action?: string })?.action);
  expect(call).toBeTruthy();
  expect(call![1]).toMatchObject({ name: "RED", action: "move" });
  const attrs = call![1] as { dest: { x: number; y: number }; facing: number };
  expect(attrs.dest.x).toBeCloseTo(12, 0);
  expect(attrs.dest.y).toBeCloseTo(10, 0);
  expect(typeof attrs.facing).toBe("number");
});
```

- [ ] **Step 2: Run the BattleScreen tests**

Run: `cd client && npx vitest run src/v2/battle/BattleScreen.test.tsx`
Expected: PASS — all four tests (three unchanged activation tests + the reworked drag test).

Note: React binds native listeners by event name, so dispatching a `MouseEvent` typed `"pointerdown"` / `"pointerup"` (which carries `clientX`/`clientY`) fires the `onPointerDown` / `onPointerUp` handlers. `setPointerCapture` is optional-chained, so its absence in jsdom is harmless.

- [ ] **Step 3: Add ring/grab/ghost styles**

In `client/src/v2/styles/field.css`, in the move-target overlay block (after the existing `.v2-mt-ring` rule at ~line 156), add:

```css
/* Nested reach rings: solid inner (move), fainter dashed outer (sprint). */
.v2-root .v2-mt-ring.is-sprint { stroke: var(--v2-oil, #e8792a); stroke-width: 1; stroke-dasharray: 2 6; opacity: .3; }
.v2-root .v2-mt-grab { fill: transparent; }
.v2-root .v2-mt-grab:active { cursor: grabbing; }
```

- [ ] **Step 4: Run the full client suite**

Run: `cd client && npx vitest run`
Expected: PASS — no regressions across the client tests.

- [ ] **Step 5: Verify in the running app**

Start the dev server and drive the battle map:
- Enter a digital room vs the bot, reach the activation phase, activate one of your rigs.
- Tap **Move** — confirm two rings appear (inner move, outer sprint) and the terrain is rectangles only.
- Grab the rig, drag past the outer ring — confirm the ghost clamps to the edge and never enters terrain.
- Drag into the outer band — confirm the readout flips to `sprint` with `+2🔥`; inside the inner ring shows `move` `+1🔥`.
- Release, drag the facing handle to re-aim, then Confirm — confirm the rig moves + faces as shown.

Capture a screenshot of the decluttered map with both rings for the PR.

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/battle/BattleScreen.test.tsx client/src/v2/styles/field.css
git commit -m "test(v2): drag-move integration flow + ring styles"
```

---

## Self-Review Notes

- **Spec coverage:** rect-only render (Tasks 2-3), halve terrain (Task 1), drag & aim (Tasks 4-6), nested rings (Tasks 5-6), clamp to edge (Task 4 `placeDrag`/`farthestReachable`). All spec sections map to a task.
- **Type consistency:** `Placed` is defined once in `dragMove.ts` and re-exported from `MoveTargetLayer`; it now carries `action`. `placeDrag`, `actionForDistance`, `clampToPivot`, `computeMovePreview`, `moveBudget`, `availableActions` signatures match their definitions.
- **No engine/wire change:** Confirm still dispatches `action { name, action, dest, facing }`; only the `action` value's *source* changed (ring, not console).
- **Out of scope (YAGNI):** move animation, dragging non-active rigs, undo after Confirm, touch-vs-mouse special casing.
```
