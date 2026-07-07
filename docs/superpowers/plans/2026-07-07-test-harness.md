# Test Harness (`/test`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dev-only `/test` screen that auto-seeds a full two-side match, shows both sides' consoles at once (split view), and rerolls any rig's loadout on demand — so one person can walk every battle flow solo.

**Architecture:** Server-authoritative reroll via a new `randomize` verb in the shared reducer. Split view via a `ViewSideContext` override that a new `useMySide()` hook reads, replacing ~9 scattered `session.side` reads. `TestHarness` seeds a real room by posting commands as both sides, then renders two `Stage`s each pinned to a side.

**Tech Stack:** React 18 + Context/useReducer (client, Vitest), plain-JS shared reducer (`shared/game-state.js`, node:test), Express + WS server (untouched).

**Spec:** `docs/superpowers/specs/2026-07-07-test-harness-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `shared/game-state.js` | **modify** — export `randomRigWeapons`/`randomEquipment`; add `randomize` verb |
| `shared/game-state.test.js` | **modify** — tests for the above |
| `client/src/state/ViewSideContext.tsx` | **new** — React context holding an optional side override |
| `client/src/hooks/useMySide.ts` | **new** — returns override else `session.side` else `"a"` |
| `client/src/hooks/useMySide.test.tsx` | **new** |
| `client/src/lib/loadout.ts` | **modify** — add `randomAddAttrs()` |
| `client/src/lib/loadout.test.ts` | **modify** |
| `client/src/hooks/useCommands.ts` | **modify** — stamp `useMySide()` not `session.side` |
| 9 components (see Task 4) | **modify** — swap `session.side` derivation → `useMySide()` |
| `client/src/components/test/seed.ts` | **new** — pure `buildSeedCommands()` |
| `client/src/components/test/seed.test.ts` | **new** |
| `client/src/components/test/TestHarness.tsx` | **new** — split view + seed effect |
| `client/src/components/test/DevToolbar.tsx` | **new** — control buttons |
| `client/src/App.tsx` | **modify** — dev-only `/test` branch |

**Reference facts (verified):**
- `applyCommand(room, { verb, attrs }, context = {}, options = {})`. `context.side` is the acting side; `options.random` is the RNG.
- `makeRig(id, name, cls, owner, weapons, equipment)` — `weapons` = `{ longRange, melee, longRangeUpgrade, meleeUpgrade }`. Returns `null` unless class ∈ `["light","medium"]` and both weapons present.
- Exported from `shared/game-state.js`: `WEAPONS` (`{longRange:{...}, melee:{...}}`), `EQUIPMENT` (`{key:{...}}`), `WEAPON_UPGRADES` (`{weaponName: [{id,...}]}`), `upgradeForWeapon`, `findRig`, `kindOf`, `makeRig`.
- Command body shape (POST `/api/game/:room/command`): `{ cmd: { verb, attrs }, side }`.
- Field lock: `{ verb:"field", attrs:{ action:"lock" } }` — only works when posted by `room.ownerSide` (the first side to join) and game not started.
- Ready gate: a side needs ≥3 rigs + field locked, then `{ verb:"ready", attrs:{ side } }`; both ready → game starts, phase `activation`.

---

## Task 1: `randomize` verb + random-loadout helpers (shared)

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write failing tests**

Append to `shared/game-state.test.js`:

```js
import {
  randomRigWeapons, randomEquipment,
} from "./game-state.js"; // add these names to the existing import block at top

test("randomRigWeapons returns a valid lr+melee pair with upgrade ids", () => {
  const seq = [0, 0, 0, 0]; let i = 0;
  const rng = () => seq[i++ % seq.length];
  const w = randomRigWeapons(rng);
  assert.ok(Object.keys(WEAPONS.longRange).includes(w.longRange));
  assert.ok(Object.keys(WEAPONS.melee).includes(w.melee));
  // upgrade id (when present) must belong to that weapon
  if (w.longRangeUpgrade) {
    assert.ok((WEAPON_UPGRADES[w.longRange] || []).some((u) => u.id === w.longRangeUpgrade));
  }
});

test("randomEquipment returns a valid EQUIPMENT key", () => {
  const eq = randomEquipment(() => 0);
  assert.ok(Object.keys(EQUIPMENT).includes(eq));
});

test("randomize verb rebuilds a rig in place, preserving id/name/owner", () => {
  const r = createRoom("RND1");
  applyCommand(r, { verb: "add", attrs: { name: "Alpha", class: "medium", owner: "a", lr: "Mini Gun", melee: "Sword" } });
  const before = findRig(r, "Alpha");
  const beforeId = before.id;
  applyCommand(r, { verb: "randomize", attrs: { name: "Alpha" } }, {}, { random: () => 0.99 });
  const after = findRig(r, "Alpha");
  assert.equal(after.id, beforeId);
  assert.equal(after.name, "Alpha");
  assert.equal(after.owner, "a");
  assert.equal(after.kind, "rig");
  assert.ok(after.weapons.longRange && after.weapons.melee); // still fully armed
  assert.equal(after.hull.sp, after.hull.max); // rebuilt fresh
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `randomRigWeapons is not a function` / `randomEquipment is not a function`.

- [ ] **Step 3: Add helpers**

In `shared/game-state.js`, after the `upgradeForWeapon` function (~line 196), add:

```js
function pickKey(obj, rng) {
  const keys = Object.keys(obj);
  const r = typeof rng === "function" ? rng() : Math.random();
  return keys[Math.min(keys.length - 1, Math.floor(r * keys.length))];
}

// A random full Rig loadout: one long-range + one melee weapon, each with a
// random signature upgrade. Shape matches makeRig's `weapons` argument.
export function randomRigWeapons(rng) {
  const longRange = pickKey(WEAPONS.longRange, rng);
  const melee = pickKey(WEAPONS.melee, rng);
  const lrUps = WEAPON_UPGRADES[longRange] || [];
  const meleeUps = WEAPON_UPGRADES[melee] || [];
  const pick = (arr) => {
    if (!arr.length) return undefined;
    const r = typeof rng === "function" ? rng() : Math.random();
    return arr[Math.min(arr.length - 1, Math.floor(r * arr.length))].id;
  };
  return { longRange, melee, longRangeUpgrade: pick(lrUps), meleeUpgrade: pick(meleeUps) };
}

export function randomEquipment(rng) {
  return pickKey(EQUIPMENT, rng);
}
```

- [ ] **Step 4: Add the `randomize` verb branch**

In `applyCommand`, immediately before the final `} else {` that handles `damage`/`repair`/`set`/`heat` (~line 1357), insert:

```js
  } else if (verb === "randomize") {
    const rig = findRig(room, a.name);
    if (rig && kindOf(rig) === "rig") {
      const idx = room.rigs.indexOf(rig);
      const fresh = makeRig(
        rig.id, rig.name, rig.weightClass, rig.owner,
        randomRigWeapons(options.random), randomEquipment(options.random),
      );
      if (fresh && idx >= 0) { room.rigs[idx] = fresh; changed = true; }
    }
```

(Note: this adds a new `else if` link; the existing `} else {` debug block that follows is unchanged.)

- [ ] **Step 5: Run — verify PASS**

Run: `node --test shared/game-state.test.js`
Expected: PASS (all tests, including pre-existing).

- [ ] **Step 6: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(shared): randomize verb + random-loadout helpers"
```

---

## Task 2: `ViewSideContext` + `useMySide` hook (client)

**Files:**
- Create: `client/src/state/ViewSideContext.tsx`
- Create: `client/src/hooks/useMySide.ts`
- Test: `client/src/hooks/useMySide.test.tsx`

- [ ] **Step 1: Write failing test**

Create `client/src/hooks/useMySide.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewSideContext } from "../state/ViewSideContext";
import { useMySide } from "./useMySide";
import { RoomStateProvider } from "../state/RoomStateContext";

function Probe() { return <span data-testid="side">{useMySide()}</span>; }

describe("useMySide", () => {
  it("falls back to 'a' when no session and no override", () => {
    render(<RoomStateProvider><Probe /></RoomStateProvider>);
    expect(screen.getByTestId("side").textContent).toBe("a");
  });

  it("prefers the ViewSideContext override", () => {
    render(
      <RoomStateProvider>
        <ViewSideContext.Provider value="b"><Probe /></ViewSideContext.Provider>
      </RoomStateProvider>,
    );
    expect(screen.getByTestId("side").textContent).toBe("b");
  });
});
```

> Before writing, confirm the provider export name in `client/src/state/RoomStateContext.tsx` (it exposes `useRoomState`). If the provider is named differently than `RoomStateProvider`, use the actual exported provider component in the test wrapper.

- [ ] **Step 2: Run — verify FAIL**

Run: `cd client && npx vitest run src/hooks/useMySide.test.tsx`
Expected: FAIL — cannot resolve `../state/ViewSideContext` / `./useMySide`.

- [ ] **Step 3: Create the context**

Create `client/src/state/ViewSideContext.tsx`:

```tsx
import { createContext } from "react";

/** When set, overrides the session's side for the subtree — used by the /test
 *  split view to render one side's perspective per column. Undefined in the
 *  normal app, so consumers fall back to session.side. */
export const ViewSideContext = createContext<string | undefined>(undefined);
```

- [ ] **Step 4: Create the hook**

Create `client/src/hooks/useMySide.ts`:

```ts
import { useContext } from "react";
import { ViewSideContext } from "../state/ViewSideContext";
import { useRoomState } from "../state/RoomStateContext";

/** The side "I" am acting as: an explicit ViewSideContext override wins,
 *  else the joined session's side, else "a". */
export function useMySide(): string {
  const override = useContext(ViewSideContext);
  const { session } = useRoomState();
  return override ?? session?.side ?? "a";
}
```

- [ ] **Step 5: Run — verify PASS**

Run: `cd client && npx vitest run src/hooks/useMySide.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add client/src/state/ViewSideContext.tsx client/src/hooks/useMySide.ts client/src/hooks/useMySide.test.tsx
git commit -m "feat(client): ViewSideContext + useMySide hook"
```

---

## Task 3: Route commands through `useMySide` (client)

**Files:**
- Modify: `client/src/hooks/useCommands.ts`

- [ ] **Step 1: Edit `useCommands.ts`**

Replace the body so the posted `side` comes from `useMySide()`:

```ts
import { useCallback } from "react";
import { useRoomState, useRoomDispatch } from "../state/RoomStateContext";
import { useMySide } from "./useMySide";

export function useCommands() {
  const { session } = useRoomState();
  const dispatch = useRoomDispatch();
  const side = useMySide();

  return useCallback(
    async (verb: string, attrs: Record<string, unknown> = {}) => {
      if (!session?.room) return;
      try {
        const resp = await fetch(`/api/game/${encodeURIComponent(session.room)}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cmd: { verb, attrs }, side }),
        });
        if (!resp.ok) return;
        const { state } = await resp.json();
        dispatch({ type: "applyServerState", state });
      } catch { /* the socket will deliver the eventual state */ }
    },
    [session?.room, side, dispatch],
  );
}
```

- [ ] **Step 2: Run the full client suite — verify still green**

Run: `cd client && npx vitest run`
Expected: PASS. In the normal app there is no `ViewSideContext` provider, so `side` === `session.side` — behavior unchanged.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useCommands.ts
git commit -m "refactor(client): useCommands stamps useMySide()"
```

---

## Task 4: Swap scattered `session.side` reads → `useMySide()`

Nine components derive `mySide` (or an owner) directly from `session.side`. Point each at `useMySide()` so a `ViewSideContext` override reaches them. Each edit is: (a) add `import { useMySide } from "<rel>/hooks/useMySide";`, (b) replace the derivation line. Keep the existing `session` usage for anything else (e.g. `session.room`).

**Files + exact replacement (verified line numbers):**

| File | Line | Replace | With |
|------|------|---------|------|
| `client/src/components/BattleSetup.tsx` | 8 | `const mySide = session?.side \|\| "a";` | `const mySide = useMySide();` |
| `client/src/components/BattleHud.tsx` | 6 | `const mySide = session?.side \|\| "a";` | `const mySide = useMySide();` |
| `client/src/components/RigDeck.tsx` | 13 | `const mySide = session?.side \|\| "a";` | `const mySide = useMySide();` |
| `client/src/components/RigAddScreen.tsx` | 12 | `const owner = session?.side \|\| "a";` | `const owner = useMySide();` |
| `client/src/components/TurnBanner.tsx` | 13 | `const mySide = session?.side \|\| "a";` | `const mySide = useMySide();` |
| `client/src/components/wizards/VpWizard.tsx` | 21 | `const mySide = session?.side \|\| "a";` | `const mySide = useMySide();` |
| `client/src/components/wizards/UnitWizard.tsx` | 39 | `const mySide = session?.side \|\| "a";` | `const mySide = useMySide();` |
| `client/src/components/FieldControls.tsx` | 35, 89 | `mySide={session?.side ?? "a"}` | `mySide={mySide}` (add `const mySide = useMySide();` near top) |
| `client/src/state/BattleActionsContext.tsx` | 146 | `const mySide = useCallback(() => sessionRef.current?.side \|\| "a", []);` | `const viewSide = useMySide();`<br>`const mySide = useCallback(() => viewSide, [viewSide]);` |

Import path note: from `components/` use `"../hooks/useMySide"`; from `components/wizards/` use `"../../hooks/useMySide"`; from `state/` use `"../hooks/useMySide"`.

- [ ] **Step 1: Apply all nine edits** (add import + swap derivation per the table).

- [ ] **Step 2: Typecheck + full suite — verify green**

Run: `cd client && npx tsc --noEmit && npx vitest run`
Expected: PASS. No `ViewSideContext` provider exists in these components' normal render tree, so `useMySide()` returns `session.side` exactly as before.

> If any of these files no longer references `session` after the swap, remove the now-unused `session` destructure to satisfy `tsc`/lint. Check each before committing.

- [ ] **Step 3: Commit**

```bash
git add client/src/components client/src/state/BattleActionsContext.tsx
git commit -m "refactor(client): read acting side via useMySide()"
```

---

## Task 5: `randomAddAttrs()` client helper

**Files:**
- Modify: `client/src/lib/loadout.ts`
- Test: `client/src/lib/loadout.test.ts`

- [ ] **Step 1: Write failing test**

Append to `client/src/lib/loadout.test.ts`:

```ts
import { randomAddAttrs } from "./loadout";

it("randomAddAttrs produces valid medium-rig add attrs", () => {
  const a = randomAddAttrs();
  expect(a.class).toBe("medium");
  expect(typeof a.longRange).toBe("string");
  expect(typeof a.melee).toBe("string");
  expect(typeof a.equipment).toBe("string");
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd client && npx vitest run src/lib/loadout.test.ts`
Expected: FAIL — `randomAddAttrs` not exported.

- [ ] **Step 3: Implement**

At the top of `client/src/lib/loadout.ts`, extend the shared import and add the helper:

```ts
import { EQUIPMENT, WEAPON_UPGRADES, randomRigWeapons, randomEquipment } from "/shared/game-state.js";
```

Append:

```ts
/** Attrs for an `add` command that commissions a full-capacity medium Rig
 *  with a random weapons/upgrades/equipment loadout. */
export function randomAddAttrs(): Record<string, unknown> {
  return { class: "medium", ...randomRigWeapons(), equipment: randomEquipment() };
}
```

> If `client/shared.d.ts` declares the `/shared/game-state.js` module with an explicit export list (rather than `any`), add `randomRigWeapons` and `randomEquipment` to that declaration so `tsc` resolves them.

- [ ] **Step 4: Run — verify PASS**

Run: `cd client && npx vitest run src/lib/loadout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/loadout.ts client/src/lib/loadout.test.ts client/shared.d.ts
git commit -m "feat(client): randomAddAttrs loadout helper"
```

---

## Task 6: Seed script (pure) + tests

**Files:**
- Create: `client/src/components/test/seed.ts`
- Test: `client/src/components/test/seed.test.ts`

The seed is a **pure** function returning an ordered list of `{ side, verb, attrs }` commands. `TestHarness` (Task 7) executes them. Pure = testable without a server.

- [ ] **Step 1: Write failing test**

Create `client/src/components/test/seed.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSeedCommands } from "./seed";

describe("buildSeedCommands", () => {
  const cmds = buildSeedCommands();

  it("adds 3 rigs for each side", () => {
    const adds = cmds.filter((c) => c.verb === "add");
    expect(adds.filter((c) => c.side === "a")).toHaveLength(3);
    expect(adds.filter((c) => c.side === "b")).toHaveLength(3);
    expect(adds.every((c) => c.attrs.class === "medium")).toBe(true);
  });

  it("locks the field as side a (the owner) after adds, before ready", () => {
    const lockIdx = cmds.findIndex((c) => c.verb === "field" && c.attrs.action === "lock");
    const firstReadyIdx = cmds.findIndex((c) => c.verb === "ready");
    const lastAddIdx = cmds.map((c) => c.verb).lastIndexOf("add");
    expect(cmds[lockIdx].side).toBe("a");
    expect(lockIdx).toBeGreaterThan(lastAddIdx);
    expect(lockIdx).toBeLessThan(firstReadyIdx);
  });

  it("readies both sides last", () => {
    const readies = cmds.filter((c) => c.verb === "ready");
    expect(readies.map((c) => c.side).sort()).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd client && npx vitest run src/components/test/seed.test.ts`
Expected: FAIL — cannot resolve `./seed`.

- [ ] **Step 3: Implement**

Create `client/src/components/test/seed.ts`:

```ts
import { randomAddAttrs } from "../../lib/loadout";

export interface SeedCommand {
  side: string;
  verb: string;
  attrs: Record<string, unknown>;
}

/** Ordered commands that build a ready-to-fight match: 3 random full rigs per
 *  side, field locked by side a (first joiner = ownerSide), both sides ready. */
export function buildSeedCommands(): SeedCommand[] {
  const cmds: SeedCommand[] = [];
  for (const side of ["a", "b"] as const) {
    for (let i = 1; i <= 3; i++) {
      cmds.push({ side, verb: "add", attrs: { name: `${side.toUpperCase()}-${i}`, owner: side, ...randomAddAttrs() } });
    }
  }
  cmds.push({ side: "a", verb: "field", attrs: { action: "lock" } });
  cmds.push({ side: "a", verb: "ready", attrs: { side: "a" } });
  cmds.push({ side: "b", verb: "ready", attrs: { side: "b" } });
  return cmds;
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd client && npx vitest run src/components/test/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/test/seed.ts client/src/components/test/seed.test.ts
git commit -m "feat(test-harness): pure seed-command builder"
```

---

## Task 7: `TestHarness` + `DevToolbar` + `/test` route

**Files:**
- Create: `client/src/components/test/TestHarness.tsx`
- Create: `client/src/components/test/DevToolbar.tsx`
- Modify: `client/src/App.tsx`

This task is UI wiring; verify it by driving the preview (no unit test — the pure logic it depends on is already covered by Tasks 1/5/6).

- [ ] **Step 1: `postCmd` + seed runner + split view**

Create `client/src/components/test/TestHarness.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useRoomState, useRoomDispatch } from "../../state/RoomStateContext";
import { ViewSideContext } from "../../state/ViewSideContext";
import { Stage } from "../Stage";
import { DevToolbar } from "./DevToolbar";
import { buildSeedCommands } from "./seed";
import type { ServerState } from "../../state/types";

const TEST_ROOM = "test";

/** Post one command with an explicit side (bypasses session.side so the harness
 *  can drive both sides during setup). Returns the new server state or null. */
export async function postCmd(room: string, side: string, verb: string, attrs: Record<string, unknown>): Promise<ServerState | null> {
  const resp = await fetch(`/api/game/${encodeURIComponent(room)}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: { verb, attrs }, side }),
  });
  if (!resp.ok) return null;
  const { state } = await resp.json();
  return state as ServerState;
}

export function TestHarness() {
  const { session, rigs } = useRoomState();
  const dispatch = useRoomDispatch();
  const [status, setStatus] = useState("booting…");
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    (async () => {
      // Join both sides so the room + ownerSide exist.
      for (const side of ["a", "b"]) {
        await fetch(`/api/game/${TEST_ROOM}/join`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: side === "a" ? "Tester A" : "Tester B", side }),
        });
      }
      dispatch({ type: "setSession", session: { room: TEST_ROOM, side: "a", name: "Tester A" } });

      // Idempotent: only seed rigs if the room is empty.
      if (!rigs || rigs.length === 0) {
        let last: ServerState | null = null;
        for (const c of buildSeedCommands()) {
          last = await postCmd(TEST_ROOM, c.side, c.verb, c.attrs);
        }
        if (last) dispatch({ type: "applyServerState", state: last });
      }
      setStatus("ready");
    })().catch((e) => setStatus(`seed failed: ${e instanceof Error ? e.message : e}`));
  }, [dispatch, rigs]);

  return (
    <div className="test-harness">
      <DevToolbar room={TEST_ROOM} status={status} />
      <div className="test-split" style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        {(["a", "b"] as const).map((side) => (
          <ViewSideContext.Provider key={side} value={side}>
            <div style={{ flex: 1, minWidth: 0, borderTop: "3px solid #444" }}>
              <h3>Side {side.toUpperCase()}</h3>
              <Stage />
            </div>
          </ViewSideContext.Provider>
        ))}
      </div>
    </div>
  );
}
```

> Verify the `Stage` export path/name in `client/src/components/Stage.tsx` and that `useRoomState()` exposes `rigs` (check `RoomStateContext.tsx` / `types.ts`). Adjust imports/destructure to the real shapes. If `Stage` expects props, pass what the normal `Terminal` passes it.

- [ ] **Step 2: `DevToolbar`**

Create `client/src/components/test/DevToolbar.tsx`:

```tsx
import { useRoomState, useRoomDispatch } from "../../state/RoomStateContext";
import { randomAddAttrs } from "../../lib/loadout";
import { postCmd } from "./TestHarness";
import type { ServerState } from "../../state/types";

export function DevToolbar({ room, status }: { room: string; status: string }) {
  const { rigs, game } = useRoomState();
  const dispatch = useRoomDispatch();
  const apply = (s: ServerState | null) => { if (s) dispatch({ type: "applyServerState", state: s }); };

  const rerollAll = async () => {
    let last: ServerState | null = null;
    for (const r of rigs || []) last = await postCmd(room, r.owner || "a", "randomize", { name: r.name });
    apply(last);
  };
  const addRig = async (side: string) =>
    apply(await postCmd(room, side, "add", { name: `${side.toUpperCase()}-${Date.now() % 10000}`, owner: side, ...randomAddAttrs() }));
  const rollInitiative = async () => apply(await postCmd(room, "a", "initiative", {}));
  const hardReset = async () => apply(await postCmd(room, "a", "reset", {}));

  return (
    <div className="dev-toolbar" style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", padding: ".5rem", background: "#1a1a1a", position: "sticky", top: 0, zIndex: 10 }}>
      <strong>/test</strong>
      <span>phase: {game?.phase ?? "—"}</span>
      <span>turn: {game?.turn?.side ?? "—"}</span>
      <button onClick={rerollAll}>🎲 Reroll all</button>
      <button onClick={() => addRig("a")}>+ Rig A</button>
      <button onClick={() => addRig("b")}>+ Rig B</button>
      <button onClick={rollInitiative}>Roll initiative</button>
      <button onClick={hardReset}>Reset SP/heat</button>
      <span style={{ marginLeft: "auto" }}>{status}</span>
    </div>
  );
}
```

> `game`, `rigs`, `rig.owner`, `rig.name`, `game.phase`, `game.turn.side` are all fields already present on the client room state (confirmed in `types.ts` / used across existing components). Confirm exact names while editing and adjust.

- [ ] **Step 3: Add the dev-only `/test` branch in `App.tsx`**

In `client/src/App.tsx`, add the import and a branch **after** the existing hooks (hooks must not be conditional) and before the `JoinGate` return:

```tsx
import { TestHarness } from "./components/test/TestHarness";
```

```tsx
  // ... after useRoomSocket(session, applyState); (keep all hooks above this line)
  if (import.meta.env.DEV && typeof window !== "undefined" && window.location.pathname === "/test") {
    return <TestHarness />;
  }
  if (!session?.room) return <JoinGate onJoin={onJoin} error={joinError} />;
  return <Terminal />;
```

- [ ] **Step 4: Typecheck + full suite**

Run: `cd client && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Manual verification (preview)**

1. Start the app (server + client). Ensure `.claude/launch.json` has a config for `npm run dev`; create one if missing.
2. Open `/test`.
3. Confirm via preview tools:
   - Two columns render, headed "Side A" / "Side B", each showing a `RigDeck` with 3 rigs.
   - Toolbar shows `phase: activation` after seed (both sides readied).
   - "🎲 Reroll all" changes rig weapon/upgrade/equipment labels in both columns.
   - In side A's column, side A's rigs show activate buttons on A's turn; acting there advances `turn`; then side B's column can act. (Full two-player loop drivable from one screen.)
   - "Roll initiative" only affects the `initiative` phase; "Reset SP/heat" restores SP.
4. Capture a screenshot as proof.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/test/TestHarness.tsx client/src/components/test/DevToolbar.tsx client/src/App.tsx
git commit -m "feat(test-harness): /test split-view screen + dev toolbar"
```

---

## Self-review notes

- **Spec coverage:** split view (Task 2/4/7), act as both players (Task 3 + explicit-side `postCmd`, Task 7), auto-seed full match (Task 5/6/7), random loadouts (Task 1/5), randomize on demand (Task 1 verb + Task 7 toolbar), dev-only gate (Task 7 Step 3). All spec sections mapped.
- **Type consistency:** `randomRigWeapons`/`randomEquipment` (shared) reused by `randomAddAttrs` (Task 5) and the `randomize` verb (Task 1); `buildSeedCommands` shape `{side,verb,attrs}` consumed unchanged by `TestHarness` seed loop; `postCmd` defined in `TestHarness` and imported by `DevToolbar`.
- **Assumptions to confirm during impl (flagged inline):** `RoomStateContext` provider/export names, `Stage` export + props, `client/shared.d.ts` export list, exact client `game`/`rigs` field names. These are lookups, not design gaps — the surrounding tasks show the intended shape.
```
