# Digital Battle Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give digital rooms a map-primary battle screen where the player sees every unit, clicks a rig to activate it, and issues Moves directly on the map — unblocking the human's digital Move (deferred item 1c).

**Architecture:** A new interactive `BattleMap` SVG surface renders unit tokens from `rig.pos`/`rig.facing`. A `BattleScreen` composes it with a docked active-rig action bar and mounts in place of the roster `Squadron` when `mode === "digital" && game.started`. Move/Sprint are intercepted for digital rooms and resolved on the map: the client computes reach/path/facing with the **same shared geometry the engine validates with** (`findPath`/`moveBudget`/`terrainPolygons`/`radiusOf`/`spatial`), then sends `action {dest, facing}`. The engine is unchanged; the server re-validates on submit.

**Tech Stack:** React + TypeScript (`client/src/v2/`), Vitest + Testing Library. Isomorphic geometry from `shared/` (`pathfind.js`, `geometry.js`, `game-state.js`).

**Design:** `docs/superpowers/specs/2026-07-16-digital-battle-map-design.md`

**Scope:** Digital rooms only. Physical rooms keep the roster + timed-drawer flow — do not touch `MoveBody`'s existing behavior. No engine edits.

---

## File Structure

- `client/src/v2/battle/fieldProjection.ts` — **create.** Pure inches↔px projection extracted from `FieldMap` (`PAD`, `CANVAS_W`, `scale`, `sx`/`sy`, plus an inverse `toInches`). One source of truth for both the pre-battle `FieldMap` and the battle `BattleMap`.
- `client/src/v2/battle/FieldMap.tsx` — **modify.** Use `fieldProjection` instead of inline constants (no behavior change).
- `client/src/state/types.ts` — **modify.** Add `pos?` / `facing?` to `Rig`.
- `client/src/v2/battle/BattleMap.tsx` — **create.** Read-only render of the field + a token per living rig (L1), and the move-target overlay (L3).
- `client/src/v2/battle/movePreview.ts` — **create.** Pure `computeMovePreview(...)` over shared geometry — reach/path/facing/pivot for a proposed destination.
- `client/src/v2/battle/BattleScreen.tsx` — **create.** Composes `BattleMap` + a docked active-rig bar (reuses the existing `ActionConsole`); owns selection + activation (L2).
- `client/src/v2/V2Terminal.tsx` — **modify.** Render `BattleScreen` for started digital rooms; keep `Squadron` otherwise.
- `client/src/v2/state/V2BattleActionsContext.tsx` — **modify.** Make `openMove` digital-aware: set on-map move-target state instead of opening the physical `MoveBody` drawer.
- Test files colocated: `fieldProjection.test.ts`, `BattleMap.test.tsx`, `movePreview.test.ts`, `BattleScreen.test.tsx`.

---

## Task 1: Field projection helper + Rig pos/facing type

**Files:**
- Create: `client/src/v2/battle/fieldProjection.ts`
- Create: `client/src/v2/battle/fieldProjection.test.ts`
- Modify: `client/src/v2/battle/FieldMap.tsx`
- Modify: `client/src/state/types.ts`

- [ ] **Step 1: Write the failing test**

`client/src/v2/battle/fieldProjection.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { makeProjection } from "./fieldProjection";

const field = { width: 54, height: 36, terrain: [] } as unknown as Parameters<typeof makeProjection>[0];

test("sx/sy map field inches into the padded canvas", () => {
  const p = makeProjection(field);
  expect(p.sx(0)).toBeCloseTo(p.pad);
  expect(p.sy(0)).toBeCloseTo(p.pad);
  expect(p.sx(field.width)).toBeCloseTo(p.pad + field.width * p.scale);
});

test("toInches is the inverse of sx/sy", () => {
  const p = makeProjection(field);
  const inches = p.toInches(p.sx(12.5), p.sy(20.25));
  expect(inches.x).toBeCloseTo(12.5);
  expect(inches.y).toBeCloseTo(20.25);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/v2/battle/fieldProjection.test.ts`
Expected: FAIL — module `./fieldProjection` does not exist.

- [ ] **Step 3: Create the projection helper**

`client/src/v2/battle/fieldProjection.ts`:

```ts
import type { FieldState } from "../../state/types";

// One source of truth for inches↔px on the battlefield SVG. Both the pre-battle
// FieldMap and the battle BattleMap render through this so their coordinates
// can never drift. Extracted verbatim from FieldMap's original constants.
export const PAD = 26;
export const CANVAS_W = 520;

export interface FieldProjection {
  pad: number;
  scale: number;
  canvasW: number;
  canvasH: number;
  fw: number;
  fh: number;
  sx: (xIn: number) => number;
  sy: (yIn: number) => number;
  toInches: (px: number, py: number) => { x: number; y: number };
}

export function makeProjection(field: FieldState): FieldProjection {
  const scale = (CANVAS_W - PAD * 2) / field.width;
  const fw = field.width * scale;
  const fh = field.height * scale;
  return {
    pad: PAD,
    scale,
    canvasW: CANVAS_W,
    canvasH: fh + PAD * 2,
    fw,
    fh,
    sx: (xIn: number) => PAD + xIn * scale,
    sy: (yIn: number) => PAD + yIn * scale,
    toInches: (px: number, py: number) => ({ x: (px - PAD) / scale, y: (py - PAD) / scale }),
  };
}
```

- [ ] **Step 4: Refactor FieldMap to use the helper**

In `client/src/v2/battle/FieldMap.tsx`, replace the inline `const PAD = 26; const CANVAS_W = 520;` and the `scale`/`fw`/`fh`/`canvasH`/`sx`/`sy` derivations (lines ~12–22) with:

```tsx
import { makeProjection } from "./fieldProjection";
// ...inside the component, after destructuring props:
  const proj = makeProjection(field);
  const { pad: PAD, scale, fw, fh, canvasH, sx, sy } = proj;
  const CANVAS_W = proj.canvasW;
```

Leave the rest of FieldMap unchanged. This is a pure refactor — the existing `FieldControls.test.tsx` (which renders FieldMap) must still pass.

- [ ] **Step 5: Add pos/facing to the Rig type**

In `client/src/state/types.ts`, inside `interface Rig` (after `engagedWith?`), add:

```ts
  /** Simulated position in field inches (centre of the rig); digital rooms only. */
  pos?: { x: number; y: number } | null;
  /** Heading in degrees; digital rooms only. */
  facing?: number;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run client/src/v2/battle/fieldProjection.test.ts client/src/v2/battle/FieldControls.test.tsx`
Expected: PASS (new projection tests + the untouched FieldMap render test). Then `npx tsc -p tsconfig.json --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/battle/fieldProjection.ts client/src/v2/battle/fieldProjection.test.ts client/src/v2/battle/FieldMap.tsx client/src/state/types.ts
git commit -m "refactor(map): extract fieldProjection; add Rig pos/facing types"
```

---

## Task 2: BattleMap read-only render (L1)

**Files:**
- Create: `client/src/v2/battle/BattleMap.tsx`
- Create: `client/src/v2/battle/BattleMap.test.tsx`

- [ ] **Step 1: Write the failing test**

`client/src/v2/battle/BattleMap.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { BattleMap } from "./BattleMap";
import type { FieldState, Rig } from "../../state/types";

const field = { width: 54, height: 36, diagonal: "tlbr", terrain: [], locked: true } as unknown as FieldState;

const rig = (over: Partial<Rig>): Rig => ({
  id: 1, name: "RED", owner: "a", weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, pos: { x: 10, y: 10 }, facing: 0, ...over,
} as Rig);

test("renders a token per living rig at its projected position", () => {
  const rigs = [rig({ id: 1, name: "RED", owner: "a", pos: { x: 10, y: 10 } }),
                rig({ id: 2, name: "GREY", owner: "b", pos: { x: 40, y: 25 } })];
  const { getAllByTestId } = render(
    <svg><BattleMapLayers field={field} rigs={rigs} mySide="a" ownerSide="a" priorityTargetId={null}
      selectedId={null} onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  expect(getAllByTestId("rig-token")).toHaveLength(2);
});

test("omits destroyed rigs and dims already-activated ones", () => {
  const rigs = [rig({ id: 1, activated: true }), rig({ id: 2, destroyed: true, pos: { x: 5, y: 5 } })];
  const { getAllByTestId } = render(
    <svg><BattleMapLayers field={field} rigs={rigs} mySide="a" ownerSide="a" priorityTargetId={null}
      selectedId={null} onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  const tokens = getAllByTestId("rig-token");
  expect(tokens).toHaveLength(1);
  expect(tokens[0].getAttribute("data-activated")).toBe("true");
});

test("marks the priority-target enemy", () => {
  const rigs = [rig({ id: 2, owner: "b", pos: { x: 40, y: 25 } })];
  const { getByTestId } = render(
    <svg><BattleMapLayers field={field} rigs={rigs} mySide="a" ownerSide="a" priorityTargetId={2}
      selectedId={null} onSelect={() => {}} onActivate={() => {}} activatable={() => false} /></svg>,
  );
  expect(getByTestId("priority-ring")).toBeTruthy();
});
```

Note: the test imports a named `BattleMapLayers` — the presentational inner layer (pure `<g>` content) so it can be mounted inside a test `<svg>`. Export both `BattleMap` (the full `<svg>` wrapper used by the app) and `BattleMapLayers` (the inner content) from the module.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/v2/battle/BattleMap.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement BattleMap (render layer)**

`client/src/v2/battle/BattleMap.tsx`. This layer renders the field frame + tokens. Keep the field/terrain/objective drawing minimal here (reuse `FieldMap` conventions); the essential contract the tests pin is the token set and its state attributes.

```tsx
import type { FieldState, Rig } from "../../state/types";
import { makeProjection } from "./fieldProjection";
import "../styles/field.css";

export interface BattleMapProps {
  field: FieldState;
  rigs: Rig[];
  mySide: string;
  ownerSide: string | null;
  priorityTargetId: number | null;
  selectedId: number | null;
  onSelect: (rig: Rig) => void;
  onActivate: (rig: Rig) => void;
  activatable: (rig: Rig) => boolean;
  /** L3 overlay slot — the move-target layer renders here when arming a move. */
  overlay?: React.ReactNode;
}

// Inner presentational layer: renders inside a parent <svg> so it can be unit
// tested without a wrapping SVG element. Consumers use <BattleMap> (below).
export function BattleMapLayers(props: BattleMapProps) {
  const { field, rigs, mySide, priorityTargetId, selectedId, onSelect, onActivate, activatable } = props;
  const proj = makeProjection(field);
  const living = rigs.filter((r) => !r.destroyed && r.pos);

  return (
    <>
      {/* field frame */}
      <rect x={proj.pad} y={proj.pad} width={proj.fw} height={proj.fh} rx={8} className="v2-fm-field" />

      {living.map((r) => {
        const cx = proj.sx(r.pos!.x);
        const cy = proj.sy(r.pos!.y);
        const mine = (r.owner || "a") === mySide;
        const rad = 100 - (r.facing ?? 0); // placeholder for arrow angle math below
        const facing = (r.facing ?? 0) * (Math.PI / 180);
        const ax = cx + Math.cos(facing) * 12;
        const ay = cy + Math.sin(facing) * 12;
        return (
          <g
            key={r.id}
            data-testid="rig-token"
            data-activated={r.activated ? "true" : "false"}
            data-mine={mine ? "true" : "false"}
            data-selected={selectedId === r.id ? "true" : "false"}
            className={
              "v2-bm-token" +
              (mine ? " is-mine" : " is-foe") +
              (r.activated ? " is-spent" : "") +
              (selectedId === r.id ? " is-selected" : "")
            }
            onClick={() => {
              if (activatable(r)) onActivate(r);
              else onSelect(r);
            }}
          >
            {priorityTargetId === r.id && (
              <circle data-testid="priority-ring" cx={cx} cy={cy} r={16} className="v2-bm-priority" fill="none" />
            )}
            <circle cx={cx} cy={cy} r={12} className="v2-bm-dot" />
            <line x1={cx} y1={cy} x2={ax} y2={ay} className="v2-bm-facing" />
            <text x={cx} y={cy + 3} textAnchor="middle" className="v2-bm-label">{r.name[0]}</text>
          </g>
        );
      })}
      {props.overlay}
    </>
  );
}

export function BattleMap(props: BattleMapProps) {
  const proj = makeProjection(props.field);
  return (
    <svg className="v2-bm" viewBox={`0 0 ${proj.canvasW} ${proj.canvasH}`} role="img" aria-label="Battlefield">
      <BattleMapLayers {...props} />
    </svg>
  );
}
```

(Remove the unused `rad` line if your linter flags it — it is not needed; the facing arrow uses `facing`.)

- [ ] **Step 4: Add minimal token styles**

Append to `client/src/v2/styles/field.css` (reuse existing `--v2-*` tokens; grep the file to confirm names):

```css
.v2-bm-token { cursor: pointer; }
.v2-bm-dot { fill: var(--v2-line, #555); }
.v2-bm-token.is-mine .v2-bm-dot { fill: var(--v2-oil, #e8792a); }
.v2-bm-token.is-foe  .v2-bm-dot { fill: #e23b3b; }
.v2-bm-token.is-spent { opacity: 0.5; }
.v2-bm-token.is-selected .v2-bm-dot { stroke: #fff; stroke-width: 2; }
.v2-bm-facing { stroke: #1a1712; stroke-width: 3; }
.v2-bm-label { fill: #1a1712; font: 700 9px var(--v2-mono, monospace); }
.v2-bm-priority { stroke: #e23b3b; stroke-dasharray: 2 3; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run client/src/v2/battle/BattleMap.test.tsx`
Expected: PASS (three tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/battle/BattleMap.tsx client/src/v2/battle/BattleMap.test.tsx client/src/v2/styles/field.css
git commit -m "feat(map): BattleMap read-only unit render (L1)"
```

---

## Task 3: BattleScreen mount + selection + activation (L2)

**Files:**
- Create: `client/src/v2/battle/BattleScreen.tsx`
- Create: `client/src/v2/battle/BattleScreen.test.tsx`
- Modify: `client/src/v2/V2Terminal.tsx`

- [ ] **Step 1: Write the failing test**

`client/src/v2/battle/BattleScreen.test.tsx`. Drives selection/activation via clicking tokens. Mocks `useCommands` with a shared spy (mirror `Squadron.test.tsx`'s pattern).

```tsx
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { BattleScreen } from "./BattleScreen";

const sendSpy = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendSpy }));
beforeEach(() => sendSpy.mockClear());

function Seed({ state }: { state: ServerState }) {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON-42", side: "a", name: "K" } });
    dispatch({ type: "applyServerState", state });
  }, [dispatch, state]);
  return null;
}

const baseRig = (id: number, owner: "a" | "b", over = {}) => ({
  id, name: id === 1 ? "RED" : "GREY", owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, pos: { x: 10 * id, y: 10 }, facing: 0, ...over,
});

function digitalState(turnActive: number | null): ServerState {
  return {
    version: 1, ownerSide: "a",
    field: { width: 54, height: 36, diagonal: "tlbr", terrain: [], locked: true } as unknown as ServerState["field"],
    rigs: [baseRig(1, "a"), baseRig(2, "b")] as unknown as ServerState["rigs"],
    game: { round: 1, phase: "activation", started: true, mode: "digital",
      turn: { side: "a", activeRigId: turnActive, actionsUsed: 0, actionsMax: 3 },
      sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }],
      priorityTargets: {} } as unknown as ServerState["game"],
  };
}

test("clicking your own idle rig on your turn activates it", async () => {
  render(<V2Providers><Seed state={digitalState(null)} /><BattleScreen /></V2Providers>);
  const tokens = await screen.findAllByTestId("rig-token");
  const mine = tokens.find((t) => t.getAttribute("data-mine") === "true")!;
  mine.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(sendSpy).toHaveBeenCalledWith("activate", { name: "RED" });
});

test("clicking an enemy rig does not activate", async () => {
  render(<V2Providers><Seed state={digitalState(null)} /><BattleScreen /></V2Providers>);
  const tokens = await screen.findAllByTestId("rig-token");
  const foe = tokens.find((t) => t.getAttribute("data-mine") === "false")!;
  foe.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(sendSpy).not.toHaveBeenCalledWith("activate", expect.anything());
});

test("does not activate when a rig is already active", async () => {
  render(<V2Providers><Seed state={digitalState(1)} /><BattleScreen /></V2Providers>);
  const tokens = await screen.findAllByTestId("rig-token");
  const mine = tokens.find((t) => t.getAttribute("data-mine") === "true")!;
  mine.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(sendSpy).not.toHaveBeenCalledWith("activate", { name: "RED" });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/v2/battle/BattleScreen.test.tsx`
Expected: FAIL — `BattleScreen` module does not exist.

- [ ] **Step 3: Implement BattleScreen**

`client/src/v2/battle/BattleScreen.tsx`. Owns selection state, derives the `activatable`/active rig from room state (mirror `V2Terminal`'s `canActivate` gate), renders `BattleMap` + a docked bar. The docked bar reuses the existing `ActionConsole` for the active rig's action grid, plus a compact vitals line.

```tsx
import { useMemo, useState } from "react";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import type { Rig } from "../../state/types";
import { BattleMap } from "./BattleMap";
import { ActionConsole } from "./ActionConsole";
import "../styles/field.css";

export function BattleScreen() {
  const { rigs, game, field } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const t = game?.turn;
  const pendingGate = Boolean(game?.pendingAnswer || game?.pendingReaction || game?.pendingBlast);
  const myTurn = game?.phase === "activation" && t?.side === mySide;
  const activeRig = rigs.find((r) => r.id === t?.activeRigId) || null;
  const priorityTargetId = mySide ? (game?.priorityTargets?.[mySide] ?? null) : null;

  // Same gate V2Terminal uses for RigTerminal activation, applied per rig.
  const activatable = (r: Rig) =>
    !!myTurn && (r.owner || "a") === mySide && t?.activeRigId == null &&
    !pendingGate && !r.activated && !r.destroyed;

  const selected = useMemo(
    () => rigs.find((r) => r.id === (activeRig?.id ?? selectedId)) || null,
    [rigs, activeRig, selectedId],
  );

  if (!field) return null;

  return (
    <section className="v2-battle">
      <BattleMap
        field={field}
        rigs={rigs}
        mySide={mySide ?? "a"}
        ownerSide={game?.sides?.[0]?.id ?? "a"}
        priorityTargetId={priorityTargetId}
        selectedId={selected?.id ?? null}
        onSelect={(r) => setSelectedId(r.id)}
        onActivate={(r) => sendCommand("activate", { name: r.name })}
        activatable={activatable}
      />
      <div className="v2-battle-dock">
        {selected && (
          <div className="v2-battle-vitals">
            <span className="v2-battle-name">{selected.name}</span>
            <span className="v2-battle-hull">HULL {selected.hull.sp}/{selected.hull.max}</span>
            {t && activeRig?.id === selected.id && (
              <span className="v2-battle-actions">{t.actionsMax - t.actionsUsed} actions left</span>
            )}
          </div>
        )}
        {activeRig && <ActionConsole rig={activeRig} />}
      </div>
    </section>
  );
}
```

Note: `ownerSide` here is passed as the first side id for the deploy-zone drawing — acceptable for token rendering. If `BattleMap` doesn't draw deploy zones during battle, this prop is unused for tokens; keep the signature but it need not be exact.

- [ ] **Step 4: Mount BattleScreen in V2Terminal for started digital rooms**

In `client/src/v2/V2Terminal.tsx`: import `BattleScreen`, read the room mode, and render `BattleScreen` instead of `Squadron` when the game is a started digital room. Locate the `<Squadron ... />` line (~54) and wrap the choice:

```tsx
import { BattleScreen } from "./battle/BattleScreen";
// ...inside the component, after existing derivations:
  const digitalBattle = started && (game as { mode?: string })?.mode === "digital";
// ...in the JSX, replace the single <Squadron .../> with:
  {digitalBattle
    ? <BattleScreen />
    : <Squadron onOpenRig={setOpenRigId} onCommission={() => setCommissionOpen(true)} />}
```

Leave `RigTerminal`, overlays, chat, and everything else in `V2Terminal` as-is (they still render alongside).

If `ServerState["game"]` has no `mode` field, add `mode?: "physical" | "digital";` to the game type in `client/src/state/types.ts` (grep for the game/`ServerState` type; add the optional field). The server already sends `room.game` spread which does NOT include `room.mode` — **verify**: `mode` lives on `room`, not `room.game`. `publicState` returns `game: { ...room.game }` and does not currently surface `room.mode`. So this needs a one-line server change OR read it from elsewhere.

- [ ] **Step 4b: Ensure the client can see digital mode**

Check `shared/game-state.js` `publicState` (~line 4062): the returned object does not include `room.mode`. Add it to the returned top-level object so the client can branch:

```js
  return {
    code: room.code,
    version: room.version,
    mode: room.mode ?? "physical",
    seeded: room.seeded ?? false,
    // ...rest unchanged
```

Then in `BattleScreen`/`V2Terminal`, read `mode` from room state top-level (where `publicState` fields land — the same place `ownerSide`/`seeded` are read; grep the reducer/`applyServerState` and `RoomStateContext` for how `ownerSide` is exposed, and expose `mode` the same way). Add `mode?: "physical" | "digital";` to the `ServerState` type. Prefer this top-level `mode` over `game.mode`. Update the Task-3 test's `digitalState` to set top-level `mode: "digital"` accordingly (and drop `game.mode`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run client/src/v2/battle/BattleScreen.test.tsx` then `npx tsc -p tsconfig.json --noEmit`.
Expected: PASS + exit 0. Adjust the test's mode placement (top-level vs game) to match the wiring you landed in Step 4b, keeping the assertions identical.

- [ ] **Step 6: Verify the whole client suite didn't regress**

Run: `npx vitest run`
Expected: PASS. (A started digital room now renders `BattleScreen`; confirm no existing test assumed `Squadron` renders during a started digital game — if one does, it was exercising the old flow; investigate before changing it.)

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/battle/BattleScreen.tsx client/src/v2/battle/BattleScreen.test.tsx client/src/v2/V2Terminal.tsx client/src/state/types.ts shared/game-state.js
git commit -m "feat(map): BattleScreen mount + click-to-activate; publish room mode"
```

---

## Task 4: On-map Move/Sprint targeting (L3)

**Files:**
- Create: `client/src/v2/battle/movePreview.ts`
- Create: `client/src/v2/battle/movePreview.test.ts`
- Modify: `client/src/v2/battle/BattleMap.tsx` (move-target overlay)
- Modify: `client/src/v2/battle/BattleScreen.tsx` (arming state + confirm dispatch)
- Modify: `client/src/v2/state/V2BattleActionsContext.tsx` (`openMove` digital branch)

### 4a — Pure move-preview helper

- [ ] **Step 1: Write the failing test**

`client/src/v2/battle/movePreview.test.ts`. Asserts the reach/pivot *relationships* via the shared helpers — never a hardcoded inch count ([[no-value-pinning-tests]]).

```ts
import { expect, test } from "vitest";
import { computeMovePreview } from "./movePreview";
import { moveBudget } from "/shared/game-state.js";
import type { FieldState, Rig } from "../../state/types";

const field = { width: 54, height: 36, terrain: [] } as unknown as FieldState;
const rig = (over: Partial<Rig> = {}): Rig => ({
  id: 1, name: "RED", owner: "a", weightClass: "light", speed: 5,
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, pos: { x: 10, y: 10 }, facing: 0, ...over,
} as Rig);

test("a destination within moveBudget is reachable; the path length is reported", () => {
  const r = rig();
  const budget = moveBudget(r as never, "move");
  const dest = { x: 10 + budget * 0.5, y: 10 }; // half a budget straight ahead
  const p = computeMovePreview(field, [r], r, "move", dest);
  expect(p.reachable).toBe(true);
  expect(p.length).toBeGreaterThan(0);
  expect(p.length).toBeLessThanOrEqual(budget + 1e-6);
});

test("a destination beyond moveBudget is unreachable", () => {
  const r = rig();
  const budget = moveBudget(r as never, "move");
  const dest = { x: 10 + budget * 3, y: 10 };
  const p = computeMovePreview(field, [r], r, "move", dest);
  expect(p.reachable).toBe(false);
});

test("facing defaults to the movement heading and reports the pivot from current", () => {
  const r = rig({ facing: 0 });
  const dest = { x: 12, y: 10 }; // due east → heading 0°
  const p = computeMovePreview(field, [r], r, "move", dest);
  expect(Math.abs(p.facing)).toBeLessThan(1);   // ~0°
  expect(p.pivot).toBeLessThan(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run client/src/v2/battle/movePreview.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the pure helper**

`client/src/v2/battle/movePreview.ts`:

```ts
import { moveBudget, spatial } from "/shared/game-state.js";
import { findPath } from "/shared/pathfind.js";
import { terrainPolygons, radiusOf } from "/shared/geometry.js";
import type { FieldState, Rig } from "../../state/types";

export interface MovePreview {
  reachable: boolean;
  path: Array<{ x: number; y: number }>;
  length: number;
  /** Heading in degrees toward the destination (or current facing for a ~0 move). */
  facing: number;
  /** Absolute pivot in degrees from the rig's current facing to `facing`. */
  pivot: number;
}

// Compute a move preview using the SAME geometry the engine validates with, so
// the on-map affordance can never disagree with the server's ruling. `dest` is
// in field inches. Facing defaults to the heading toward dest; callers may
// override and clamp to ±90° before dispatch.
export function computeMovePreview(
  field: FieldState,
  allRigs: Rig[],
  mover: Rig,
  action: "move" | "sprint",
  dest: { x: number; y: number },
): MovePreview {
  const from = mover.pos ?? { x: 0, y: 0 };
  const polys = terrainPolygons(field as never);
  const blockers = allRigs
    .filter((r) => r.id !== mover.id && !r.destroyed && r.pos)
    .map((r) => spatial(r as never));
  const budget = moveBudget(mover as never, action);
  const route = findPath(field as never, polys, blockers, radiusOf(mover as never), from, dest) as
    | { path: Array<{ x: number; y: number }>; length: number }
    | null;

  const dx = dest.x - from.x;
  const dy = dest.y - from.y;
  const moved = Math.hypot(dx, dy);
  const heading = moved < 1e-6 ? (mover.facing ?? 0) : (Math.atan2(dy, dx) * 180) / Math.PI;
  const cur = mover.facing ?? 0;
  const pivot = Math.abs(((heading - cur + 540) % 360) - 180);

  if (!route || route.length > budget + 1e-6) {
    return { reachable: false, path: route?.path ?? [from, dest], length: route?.length ?? Infinity, facing: heading, pivot };
  }
  return { reachable: true, path: route.path, length: route.length, facing: heading, pivot };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run client/src/v2/battle/movePreview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/battle/movePreview.ts client/src/v2/battle/movePreview.test.ts
git commit -m "feat(map): pure move-preview over shared geometry (L3a)"
```

### 4b — Arm Move → on-map target → confirm

- [ ] **Step 6: Make openMove digital-aware**

In `client/src/v2/state/V2BattleActionsContext.tsx`: add move-target state to the context and branch `openMove` on room mode. Add to the context value a `moveTarget: { rigId: number; action: string } | null` and setters `beginMoveTarget`/`clearMoveTarget`.

- Add state near the other `useState`s in the provider:

```tsx
  const [moveTarget, setMoveTarget] = useState<{ rigId: number; action: string } | null>(null);
```

- In `openMove` (currently ~line 129), after the `guardAction` preflight and `playAction(key)`, branch:

```tsx
      const { mode } = roomStateRef.current ?? {}; // however room mode is exposed; see note
      if (mode === "digital") {
        setMoveTarget({ rigId: rig.id, action: key });
        return;               // the BattleMap handles targeting; no drawer
      }
      // ...existing physical MoveBody drawer code stays below, unchanged...
```

- Expose `moveTarget`, `beginMoveTarget: (rigId, action) => setMoveTarget({ rigId, action })`, and `clearMoveTarget: () => setMoveTarget(null)` in the context `value`, and add them to the context type.

Note on reading room mode inside the context: read it from the same room-state source the provider already uses (grep the provider for `useRoomState`; if it isn't imported, import it and read `mode`). If wiring mode into this context proves awkward, an acceptable alternative is to have `BattleScreen` pass an `onMove` callback into `ActionConsole` — but prefer the context branch so `ActionConsole` stays untouched.

- [ ] **Step 7: Write the failing test for the confirm dispatch**

Add to `client/src/v2/battle/BattleScreen.test.tsx` a test that arms a move and confirms it dispatches `action` with `dest`+`facing`. Because computing a tap→inches conversion needs element geometry (absent in jsdom), drive the flow through the move-target overlay's confirm handler with an injected destination: render `BattleScreen` with an active rig, begin a move target, simulate a field tap by mocking the SVG's `getBoundingClientRect`, then click Confirm.

```tsx
test("arming a move, placing a reachable destination, and confirming dispatches action with dest+facing", async () => {
  const state = digitalState(1); // rig 1 is the active rig
  render(<V2Providers><Seed state={state} /><BattleScreen /></V2Providers>);

  // Arm move: the docked ActionConsole's Move chip (digital → begins targeting).
  const moveBtn = await screen.findByRole("button", { name: /move/i });
  moveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  // Simulate a reachable field tap. Mock the map's bounding rect so a client
  // point maps to a known viewBox coordinate, then to inches near the rig.
  const surface = await screen.findByTestId("field-surface");
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 520, height: 320, right: 520, bottom: 320, x: 0, y: 0, toJSON() {} });
  // A point a couple inches east of rig 1 (pos ~ {10,10}) — comfortably reachable.
  surface.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 40, clientY: 40 }));

  const confirm = await screen.findByRole("button", { name: /confirm/i });
  confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const call = sendSpy.mock.calls.find((c) => c[0] === "action" && c[1]?.action);
  expect(call).toBeTruthy();
  expect(call![1]).toMatchObject({ name: "RED", action: "move" });
  expect(typeof call![1].dest.x).toBe("number");
  expect(typeof call![1].facing).toBe("number");
});
```

Note: the exact `clientX/clientY`→inches mapping depends on your overlay's conversion (viewBox 0..canvasW mapped across the mocked rect width, then `toInches`). Choose a client point you have verified lands within `moveBudget` of the active rig given `digitalState`'s positions; adjust the rig position in `digitalState` if needed so the arithmetic is clean. The assertion pins the *contract* (an `action` command with numeric `dest` + `facing`), not a specific inch value.

- [ ] **Step 8: Implement the move-target overlay + confirm**

In `BattleScreen`, read `moveTarget`/`clearMoveTarget` from the battle-actions context. When `moveTarget` is set and refers to the active rig, pass an overlay into `BattleMap` (its `overlay` prop) that:

- renders a full-field transparent `<rect data-testid="field-surface">` capturing clicks;
- on click, converts the DOM point to inches via the SVG rect + `makeProjection(field).toInches`, calls `computeMovePreview`; if `reachable`, stores the dest + preview in local state (ghost token, path, readout); if not, ignores (optionally a brief "out of reach" flash);
- draws the reach ring (radius `moveBudget` around the rig via the projection), the ghost token at the dest, the routed `path`, and a facing handle; a drag on the handle updates facing, clamped to ±90° of the rig's current facing;
- renders a readout (`move {length}″ · pivot {pivot}° · +{heat}🔥`) and Cancel / Confirm buttons.

On **Confirm**: `sendCommand("action", { name: activeRig.name, action: moveTarget.action, dest, facing })` then `clearMoveTarget()` and reset local dest state. On **Cancel**: `clearMoveTarget()` + reset.

Representative overlay component (place in `BattleMap.tsx` or a small `MoveTargetLayer.tsx`; keep it a pure child that takes the projection, rig, and callbacks):

```tsx
// props: proj, rig, allRigs, field, action, onCancel, onConfirm(dest, facing)
// Local state: dest (inches | null), facing (deg | null).
// Renders: <rect data-testid="field-surface"> covering the field for taps;
//   reach ring; ghost + path + facing handle when dest set; readout; buttons.
// Tap handler: const r = svgRect(e.currentTarget); const px = (e.clientX - r.left)
//   / r.width * proj.canvasW; const py = (e.clientY - r.top) / r.height * proj.canvasH;
//   const inches = proj.toInches(px, py); const preview = computeMovePreview(...);
//   if (preview.reachable) { setDest(inches); setFacing(preview.facing); }
// Facing drag: clamp to ±90° of rig.facing before setState.
```

Keep the visual styling light; the tests pin behavior (`field-surface` exists, a reachable tap arms a dest, Confirm dispatches `action` with `dest`+`facing`), not pixels.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run client/src/v2/battle/BattleScreen.test.tsx client/src/v2/battle/movePreview.test.ts`
Expected: PASS (activation tests from Task 3 + the new confirm-dispatch test + preview tests).

- [ ] **Step 10: Full client suite + typecheck**

Run: `npx vitest run` then `npx tsc -p tsconfig.json --noEmit`
Expected: PASS + exit 0.

- [ ] **Step 11: Commit**

```bash
git add client/src/v2/battle/BattleMap.tsx client/src/v2/battle/BattleScreen.tsx client/src/v2/state/V2BattleActionsContext.tsx
git commit -m "feat(map): on-map Move/Sprint targeting sends dest+facing (L3)"
```

---

## Task 5: Full suite + live smoke

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: PASS — Vitest (client) + `node --test` (shared/server/scripts) all green. Then `npm run build` → built (bundle resolves the new `/shared/*` imports in `movePreview.ts`).

- [ ] **Step 2: Live smoke via the preview**

Start the dev servers (preview_start `vite-client` on 5173 and `oil-iron-server` on 8000, or `npm run dev`). Get a digital room to a started state (seed a digital battle or start a human-vs-bot digital match), open the V2 battle screen, and confirm: every unit renders on the map at a plausible position; clicking your rig on your turn activates it (reach ring appears); tapping Move → tapping a reachable cell shows a ghost + facing handle + readout; Confirm applies the move and the token snaps to the new position; an out-of-reach tap is refused. Capture a screenshot as proof.

- [ ] **Step 3: Commit any smoke-fix (only if needed)**

```bash
git add <specific files you fixed>
git commit -m "fix(map): <describe the smoke-test fix>"
```

(Never `git add -A` — concurrent committer; stage only files you touched.)

---

## Self-Review

**Spec coverage:**
- Design L1 (read-only render) → Task 2. ✓
- Design L2 (select + activate) → Task 3. ✓
- Design L3 (armed on-map Move/Sprint, shared-geometry preview, `dest`+`facing`) → Task 4 (4a pure preview, 4b overlay + confirm). ✓
- Mount for started digital rooms; physical/pre-battle keep `Squadron` → Task 3 Step 4/4b. ✓
- Reuse shared geometry (`findPath`/`moveBudget`/`terrainPolygons`/`radiusOf`/`spatial`) → `movePreview.ts` (Task 4a). ✓
- Facing auto + ±90° clamp → `computeMovePreview` default + overlay clamp (Task 4). ✓
- Projection shared with FieldMap → Task 1. ✓
- Rig `pos`/`facing` types + publish `room.mode` → Tasks 1 + 3. ✓
- Testing via shared helpers, no value-pinning → all test steps assert relationships (`moveBudget` comparisons), never hardcoded inches. ✓
- Out of scope (physical rooms, Fire-on-map, fog, animation) → not built. ✓

**Placeholder scan:** No TBD/TODO. The two areas that depend on local wiring (how room `mode` is exposed to the client, and the exact `clientX→inches` value in the confirm test) are flagged with explicit resolution steps and a stated invariant to preserve, not left vague. The overlay component is specified by behavior + a representative skeleton because its pixel/drag details are presentational; its contract is pinned by tests.

**Type/name consistency:** `computeMovePreview(field, allRigs, mover, action, dest)` and its `MovePreview` shape are defined in Task 4a and consumed in Task 4b. `BattleMap`/`BattleMapLayers`, `BattleScreen`, `makeProjection`/`FieldProjection`, `moveTarget`/`beginMoveTarget`/`clearMoveTarget`, and the `activate {name}` / `action {name, action, dest, facing}` command shapes are consistent across tasks and match the engine contract in the spec.
