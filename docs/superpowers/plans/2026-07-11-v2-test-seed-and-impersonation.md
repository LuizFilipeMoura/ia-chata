# V2 Test Seed + Enemy Impersonation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One action seeds a valid, already-started 3v3 v2 battle (from shared tests, an HTTP call, or a Join-screen button), and the seeding operator can act on the enemy's turn.

**Architecture:** A new `seed` command verb in `shared/game-state.js` is the single source of truth — it wipes the room, adds 6 distinct-chassis rigs (3/side), locks the field, and force-starts deterministically with the chosen opening side. A `room.seeded` flag drops the (minimal) `publicState` redaction. On the client, a thin `useSeedBattle` helper and a Join CTA reach the verb; impersonation reuses the existing `ViewSideContext`/`useMySide` cascade made runtime-switchable. AGENTS.md gains a UI-work mandate and an agent UI-debugging section.

**Tech Stack:** Node ESM (`shared/*.js`, `node:test`), React + TypeScript (`client/src/v2/**`), Vitest + Testing Library, Express (`server/routes/game.js`, unchanged).

---

## Reference — verified facts (read before starting)

- `applyCommand(room, cmd, context, options)` lives in `shared/game-state.js` (verb dispatch starts ~line 1932). Add the `seed` branch alongside the others.
- `makeUnit("rig", id, name, owner, opts)` builds a rig; opts used: `{ weightClass, longRange, melee, chassis, sp }` (see `shared/game-state.js:714`).
- `resolveChassis({ chassis })` returns the catalogue entry `{ id, class, longRange, melee, sp }` or falsy.
- `applyInitiative(room, order, rolls)` sets `turn`, answer tokens, phase (`shared/game-state.js:922`). `order[0]` activates FIRST.
- `sideRigCount(room, sideId)`, `normalizeSide(room, ref)`, `pushResolution(room, entry)` all exist in the file.
- `createRoom` return shape and the `reset` verb's game-field wipe are at `shared/game-state.js:393` and `~2081`.
- `publicState(room, side)` redaction is a single `.map` hiding enemy face-down prep (`shared/game-state.js`, `export function publicState`).
- Client state flow: `ServerState` (`client/src/state/types.ts:161`) → reducer `applyServerState` (`client/src/state/roomReducer.ts:23`) → `RoomState` (`roomReducer.ts:3`) → `useRoomState()`.
- `useMySide()` (`client/src/hooks/useMySide.ts`) returns `ViewSideContext` override ?? `session.side` ?? `"a"`. `useCommands()` (`client/src/hooks/useCommands.ts`) sends `{ cmd, side: useMySide() }`.
- `V2Providers` stack: `client/src/v2/state/V2Providers.tsx`. `V2App`/`V2Terminal`: `client/src/v2/`.

**Commands to run tests:**
- Shared: `node --test shared/game-state.test.js`
- Client (one file): `npx vitest run client/src/v2/<path>`
- Types: `npx tsc --noEmit`

**Git:** Work on `main`. One commit per task. Plain messages. (Per AGENTS.md — no branches/worktrees.)

---

## File Structure

- `shared/game-state.js` — `SEED_ROSTER`, `resetGameShape` (extracted), `startGameSeeded`, `seed` verb, `room.seeded` in `createRoom`/`ensureGameShape`, `publicState` changes. *(Tasks 1–2)*
- `shared/game-state.test.js` — seed + publicState tests. *(Tasks 1–2)*
- `client/src/state/types.ts` — `seeded?: boolean` on `ServerState`. *(Task 3)*
- `client/src/state/roomReducer.ts` — `seeded` on `RoomState`/initial/reducer. *(Task 3)*
- `client/src/v2/hooks/useSeedBattle.ts` (+ `.test.tsx`) — helper. *(Task 4)*
- `client/src/v2/screens/Join.tsx` (+ `.test.tsx`) — seed CTA + mini-wizard. *(Task 5)*
- `client/src/v2/V2App.tsx` — `onSeed` handler (join + seed). *(Task 5)*
- `client/src/v2/state/ImpersonationContext.tsx` — runtime `ViewSideContext` override. *(Task 6)*
- `client/src/v2/state/V2Providers.tsx` — mount provider. *(Task 6)*
- `client/src/v2/components/ImpersonateChip.tsx` (+ `.test.tsx`) — Acting-as A/B chip. *(Task 7)*
- `client/src/v2/V2Terminal.tsx` — mount chip. *(Task 7)*
- `client/src/v2/styles/*.css` — chip styles. *(Task 7)*
- `AGENTS.md` — UI mandate + agent UI-debugging section. *(Task 8)*

---

## Task 1: `seed` verb — roster, deterministic start, `seeded` flag

**Files:**
- Modify: `shared/game-state.js`
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js` (imports: add `SEED_ROSTER` to the existing `from "./game-state.js"` import list):

```js
test("seed builds a started 3v3 with 6 distinct chassis and turn=first", () => {
  const r = createRoom("SEED-T1");
  applyCommand(r, { verb: "seed", attrs: { first: "b" } });

  assert.equal(r.seeded, true);
  assert.equal(r.game.started, true);
  assert.equal(r.game.phase, "activation");
  assert.equal(r.game.round, 1);
  assert.equal(r.field.locked, true);
  assert.equal(r.game.turn.side, "b");

  const a = r.rigs.filter((rig) => rig.owner === "a");
  const b = r.rigs.filter((rig) => rig.owner === "b");
  assert.equal(a.length, 3);
  assert.equal(b.length, 3);
  const chassisIds = r.rigs.map((rig) => rig.chassis);
  assert.equal(new Set(chassisIds).size, 6);
});

test("seed first defaults to 'a' and is idempotent (re-seed resets)", () => {
  const r = createRoom("SEED-T2");
  applyCommand(r, { verb: "seed", attrs: {} });
  assert.equal(r.game.turn.side, "a");
  const firstIds = r.rigs.map((rig) => rig.id);

  applyCommand(r, { verb: "seed", attrs: { first: "b" } });
  assert.equal(r.rigs.length, 6);
  assert.equal(r.game.turn.side, "b");
  // A fresh build re-numbers from 1, not appends.
  assert.deepEqual(r.rigs.map((rig) => rig.id), firstIds);
});

test("SEED_ROSTER is 6 entries, 3 per side, all chassis distinct", () => {
  assert.equal(SEED_ROSTER.length, 6);
  assert.equal(SEED_ROSTER.filter((e) => e.owner === "a").length, 3);
  assert.equal(SEED_ROSTER.filter((e) => e.owner === "b").length, 3);
  assert.equal(new Set(SEED_ROSTER.map((e) => e.chassis)).size, 6);
  for (const e of SEED_ROSTER) assert.ok(resolveChassis({ chassis: e.chassis }), e.chassis);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `SEED_ROSTER` undefined / `r.seeded` undefined / no seed verb.

- [ ] **Step 3: Add `SEED_ROSTER` and `room.seeded` default**

In `shared/game-state.js`, near the `CHASSIS` export (after it), add:

```js
// Fixed test roster for the `seed` verb: 6 distinct chassis, 3 per side. Varied
// weight classes (3 medium / 3 light — the catalogue has no heavy). All chassis
// ids are unique, honouring the no-mirror-matchup invariant (AGENTS.md).
export const SEED_ROSTER = [
  { name: "A1", owner: "a", chassis: "medium-lance-mortar" },
  { name: "A2", owner: "a", chassis: "light-claw-autocannon" },
  { name: "A3", owner: "a", chassis: "light-sword-arc" },
  { name: "B1", owner: "b", chassis: "medium-shield-siege" },
  { name: "B2", owner: "b", chassis: "medium-sniper-chainsaw" },
  { name: "B3", owner: "b", chassis: "light-harpoon-anchor" },
];
```

In `createRoom` (`shared/game-state.js:393`), add `seeded: false,` to the returned object (top level, next to `ownerSide: null,`):

```js
    code,
    version: 0,
    nextRigId: 1,
    ownerSide: null,
    seeded: false,
    field,
```

In `ensureGameShape` (where it patches `room.ownerSide`, ~line 525), add:

```js
  if (room.seeded === undefined) room.seeded = false;
```

- [ ] **Step 4: Extract `resetGameShape` and add `startGameSeeded`**

In `shared/game-state.js`, add these two helpers just above `function maybeStartGame` (~line 942):

```js
// The game-field portion of a full reset (no per-rig work). Shared by the
// `reset` verb (which also rebuilds each rig) and the `seed` verb (which
// discards all rigs, so it only needs this).
function resetGameShape(room) {
  room.game.started = false;
  room.game.phase = "setup";
  room.game.round = 1;
  room.game.turn = null;
  room.game.resolutions = [];
  room.game.nextResolutionId = 1;
  room.game.recoveryClaims = {};
  room.game.recoveryConflict = null;
  room.game.outcome = null;
  room.game.pendingBlast = null;
  room.game.pendingAnswer = null;
  room.game.pendingReaction = null;
  room.game.answerTokens = { a: 0, b: 0 };
  room.game.suddenDeath = false;
  room.game.deployOrder = [];
  room.game.initiative = null;
  room.game.bounties = {};
  room._history = [];
  for (const s of room.game.sides) { s.ready = false; s.vp = 0; }
}

// Deterministic force-start for seeded test rooms: no dice, no deployment-order
// inference. Bounty for each side = its first enemy rig. turn.side = `first`.
function startGameSeeded(room, first) {
  const other = first === "b" ? "a" : "b";
  const bounties = {};
  for (const side of room.game.sides) {
    const target = room.rigs.find((rig) => (rig.owner || "a") !== side.id);
    if (!target) return false;
    bounties[side.id] = target.id;
  }
  room.game.bounties = bounties;
  room.game.started = true;
  room.game.phase = "initiative";
  room.game.round = 1;
  applyInitiative(room, [first, other], null);
  pushResolution(room, {
    kind: "initiative", actor: first, rigId: null, rolls: [],
    summary: `Seeded battle — ${first} activates first`, effects: [],
  });
  return true;
}
```

Then in the existing `reset` verb branch (`shared/game-state.js`, the block starting `room.game.started = false;` at ~line 2081), replace that block of `room.game.*` assignments **and** the `room._history = []; for (const s of room.game.sides)...` line with a single call:

```js
    resetGameShape(room);
    changed = true;
```

(The per-rig `for (const rig of room.rigs) { ... }` loop above it stays unchanged.)

- [ ] **Step 5: Add the `seed` verb branch**

In `applyCommand`, add a new branch (place it right after the `reset` branch closes):

```js
  } else if (verb === "seed") {
    const roster = Array.isArray(a.roster) && a.roster.length ? a.roster : SEED_ROSTER;
    const first = normalizeSide(room, a.first) || "a";
    room.rigs = [];
    room.nextRigId = 1;
    resetGameShape(room);
    for (const entry of roster) {
      const pb = resolveChassis({ chassis: entry.chassis });
      if (!pb) continue;
      const owner = normalizeSide(room, entry.owner) || "a";
      const unit = makeUnit("rig", room.nextRigId, entry.name, owner, {
        weightClass: pb.class, longRange: pb.longRange, melee: pb.melee,
        chassis: pb.id, sp: pb.sp,
      });
      if (!unit) continue;
      room.nextRigId++;
      room.rigs.push(unit);
    }
    room.field.locked = true;
    room.seeded = true;
    if (sideRigCount(room, "a") >= 3 && sideRigCount(room, "b") >= 3) {
      startGameSeeded(room, first);
    }
    changed = true;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (new tests green, existing `reset`/`createRoom` tests still green).

- [ ] **Step 7: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(shared): seed verb builds a deterministic started 3v3"
```

---

## Task 2: `publicState` exposes `seeded` and skips redaction in seed rooms

**Files:**
- Modify: `shared/game-state.js` (`publicState`)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing test**

Add to `shared/game-state.test.js`:

```js
test("publicState exposes seeded and skips enemy face-down prep redaction when seeded", () => {
  const r = createRoom("SEED-T3");
  applyCommand(r, { verb: "seed", attrs: { first: "a" } });
  // Give an enemy (b) rig a hidden face-down preparation.
  const enemy = r.rigs.find((rig) => rig.owner === "b");
  enemy.preparation = { type: "brace", faceUp: false };

  const asA = publicState(r, "a");
  assert.equal(asA.seeded, true);
  const enemyView = asA.rigs.find((rig) => rig.id === enemy.id);
  // Not redacted to { hidden: true } because the room is seeded.
  assert.equal(enemyView.preparation.faceUp, false);
  assert.equal(enemyView.preparation.type, "brace");
});

test("publicState still redacts enemy face-down prep in a normal room", () => {
  const r = createRoom("NORMAL-T");
  claimSide(r, { side: "a" });
  applyCommand(r, { verb: "add", attrs: { name: "E1", owner: "b", chassis: "light-sword-arc", class: "light", longRange: "Arc Gun", melee: "Sword" } });
  const enemy = r.rigs.find((rig) => rig.owner === "b");
  enemy.preparation = { type: "brace", faceUp: false };

  const asA = publicState(r, "a");
  assert.equal(asA.seeded, false);
  const enemyView = asA.rigs.find((rig) => rig.id === enemy.id);
  assert.deepEqual(enemyView.preparation, { hidden: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `asA.seeded` undefined; seeded room still redacts.

- [ ] **Step 3: Update `publicState`**

In `shared/game-state.js`, in `export function publicState(room, side)`:

Change the `rigs` map to respect the seeded flag:

```js
  const rigs = room.rigs.map((rig) => {
    const prep = rig.preparation;
    if (!room.seeded && prep && prep.faceUp === false && (rig.owner || "a") !== viewer) {
      return { ...rig, preparation: { hidden: true } };
    }
    return rig;
  });
```

And add `seeded` to the returned object (next to `code`/`version`):

```js
  return {
    code: room.code,
    version: room.version,
    seeded: room.seeded ?? false,
    ownerSide: room.ownerSide ?? null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(shared): publicState exposes seeded, drops redaction in seed rooms"
```

---

## Task 3: Thread `seeded` through client state

**Files:**
- Modify: `client/src/state/types.ts`
- Modify: `client/src/state/roomReducer.ts`
- Test: `client/src/state/roomReducer.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `client/src/state/roomReducer.test.ts` (follow the existing `applyServerState` test style in that file):

```ts
test("applyServerState carries the seeded flag through", () => {
  const next = roomReducer(initialRoomState, {
    type: "applyServerState",
    state: { version: 1, rigs: [], game: null, field: null, seeded: true },
  });
  expect(next.seeded).toBe(true);
});

test("seeded defaults to false when absent", () => {
  const next = roomReducer(initialRoomState, {
    type: "applyServerState",
    state: { version: 1, rigs: [], game: null, field: null },
  });
  expect(next.seeded).toBe(false);
});
```

(If `roomReducer`/`initialRoomState` aren't yet imported in that test file, add them to the import from `./roomReducer`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/state/roomReducer.test.ts`
Expected: FAIL — `seeded` not on `RoomState` / not carried.

- [ ] **Step 3: Add `seeded?` to `ServerState`**

In `client/src/state/types.ts` (`ServerState`, line ~161):

```ts
export interface ServerState {
  code?: string;
  version: number;
  seeded?: boolean;
  rigs: Rig[];
  game: GameState | null;
  ownerSide?: string | null;
  field?: FieldState | null;
}
```

- [ ] **Step 4: Add `seeded` to `RoomState`, initial, and reducer**

In `client/src/state/roomReducer.ts`:

`RoomState` interface — add `seeded: boolean;`:

```ts
export interface RoomState {
  rigs: Rig[];
  game: GameState | null;
  field: FieldState | null;
  ownerSide: string | null;
  seeded: boolean;
  stateVersion: number;
  session: Session | null;
}
```

`initialRoomState` — add `seeded: false,`:

```ts
export const initialRoomState: RoomState = {
  rigs: [], game: null, field: null, ownerSide: null, seeded: false, stateVersion: -1, session: null,
};
```

`applyServerState` case — add `seeded`:

```ts
      return {
        ...state,
        rigs: Array.isArray(s.rigs) ? s.rigs : [],
        game: s.game ?? null,
        field: s.field ?? null,
        ownerSide: s.ownerSide ?? null,
        seeded: s.seeded ?? false,
        stateVersion: s.version ?? state.stateVersion,
      };
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run client/src/state/roomReducer.test.ts`
Expected: PASS
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/state/types.ts client/src/state/roomReducer.ts client/src/state/roomReducer.test.ts
git commit -m "feat(client): thread seeded flag through room state"
```

---

## Task 4: `useSeedBattle` client helper

**Files:**
- Create: `client/src/v2/hooks/useSeedBattle.ts`
- Test: `client/src/v2/hooks/useSeedBattle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/hooks/useSeedBattle.test.tsx` (mirror `useV2Commands.test.tsx`'s mock of `useCommands`):

```tsx
import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const send = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => send }));

import { useSeedBattle } from "./useSeedBattle";

test("sends the seed verb with the chosen first side", () => {
  const { result } = renderHook(() => useSeedBattle());
  result.current("b");
  expect(send).toHaveBeenCalledWith("seed", { first: "b" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/hooks/useSeedBattle.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `client/src/v2/hooks/useSeedBattle.ts`:

```ts
import { useCallback } from "react";
import { useCommands } from "../../hooks/useCommands";

/** Seed a full 3v3 test battle. `first` is the side whose turn opens the game
 *  ("a" = your turn, "b" = the enemy's turn). Callable without a browser. */
export function useSeedBattle() {
  const send = useCommands();
  return useCallback((first: "a" | "b") => send("seed", { first }), [send]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run client/src/v2/hooks/useSeedBattle.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/hooks/useSeedBattle.ts client/src/v2/hooks/useSeedBattle.test.tsx
git commit -m "feat(client): useSeedBattle helper sends the seed verb"
```

---

## Task 5: Join seed CTA + mini-wizard + `V2App.onSeed`

**Files:**
- Modify: `client/src/v2/screens/Join.tsx`
- Modify: `client/src/v2/V2App.tsx`
- Test: `client/src/v2/screens/Join.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `client/src/v2/screens/Join.test.tsx`:

```ts
test("seed CTA opens the turn picker and fires onSeed with the chosen side", async () => {
  const user = userEvent.setup();
  const onSeed = vi.fn();
  render(<Join onJoin={vi.fn()} error="" onSeed={onSeed} />);

  await user.click(screen.getByRole("button", { name: /Seed Test Battle/i }));
  await user.click(screen.getByRole("button", { name: /Enemies turn/i }));

  expect(onSeed).toHaveBeenCalledWith("b");
});

test("seed 'Your turn' fires onSeed with a", async () => {
  const user = userEvent.setup();
  const onSeed = vi.fn();
  render(<Join onJoin={vi.fn()} error="" onSeed={onSeed} />);
  await user.click(screen.getByRole("button", { name: /Seed Test Battle/i }));
  await user.click(screen.getByRole("button", { name: /Your turn/i }));
  expect(onSeed).toHaveBeenCalledWith("a");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/screens/Join.test.tsx`
Expected: FAIL — `onSeed` prop / seed button don't exist.

- [ ] **Step 3: Add the seed CTA + picker to `Join`**

In `client/src/v2/screens/Join.tsx`:

Extend `Props` and add a `seeding` state + picker. Change the interface:

```ts
interface Props {
  onJoin: (room: string, name: string, side: string) => void;
  error: string;
  onSeed?: (first: "a" | "b") => void;
}

export function Join({ onJoin, error, onSeed }: Props) {
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [side, setSide] = useState("a");
  const [seeding, setSeeding] = useState(false);
```

Then, immediately **after** the existing "Enter The Yard" CTA button (before the `{error ? ...}` block), insert the seed affordance:

```tsx
          {onSeed && !seeding && (
            <button
              type="button"
              className="v2-join-seed"
              onClick={() => setSeeding(true)}
            >
              Seed Test Battle ▸
            </button>
          )}

          {onSeed && seeding && (
            <div className="v2-join-seedpick" role="group" aria-label="Seed opening turn">
              <div className="v2-join-label">Who acts first?</div>
              <button type="button" className="v2-join-seedbtn" onClick={() => onSeed("a")}>
                Your turn
              </button>
              <button type="button" className="v2-join-seedbtn" onClick={() => onSeed("b")}>
                Enemies turn
              </button>
              <button type="button" className="v2-join-seedcancel" onClick={() => setSeeding(false)}>
                Cancel
              </button>
            </div>
          )}
```

- [ ] **Step 4: Add `onSeed` handler in `V2App` and pass it to `Join`**

In `client/src/v2/V2App.tsx`:

Add a room-code generator above the component:

```ts
// Seed rooms get an autogenerated code so a tester never collides with a real
// game. Ambiguous glyphs (0/O/1/I) are excluded.
function randomSeedCode(n = 4): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += A[Math.floor(Math.random() * A.length)];
  return `SEED-${s}`;
}
```

Add the handler inside the component (after `onJoin`):

```ts
  const onSeed = useCallback(async (first: "a" | "b") => {
    setJoinError("");
    const room = randomSeedCode();
    try {
      const jr = await fetch(`/api/game/${encodeURIComponent(room)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: "a" }),
      });
      if (!jr.ok) throw new Error(`seed join failed (${jr.status})`);
      const jd = await jr.json();
      dispatch({ type: "setSession", session: { room, side: jd.side, name: "Tester" } });
      const cr = await fetch(`/api/game/${encodeURIComponent(room)}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: { verb: "seed", attrs: { first } }, side: "a" }),
      });
      if (!cr.ok) throw new Error(`seed failed (${cr.status})`);
      const cd = await cr.json();
      dispatch({ type: "applyServerState", state: cd.state });
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Seed failed");
    }
  }, [dispatch]);
```

Pass it to `Join`:

```tsx
  if (!session?.room) return <Join onJoin={onJoin} error={joinError} onSeed={onSeed} />;
```

- [ ] **Step 5: Add minimal styles**

Append to `client/src/v2/styles/join.css`:

```css
.v2-join-seed,
.v2-join-seedbtn,
.v2-join-seedcancel {
  display: block;
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.6rem 0.8rem;
  cursor: pointer;
  font: inherit;
}
.v2-join-seedpick { margin-top: 0.75rem; }
```

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run client/src/v2/screens/Join.test.tsx`
Expected: PASS (existing Join tests still pass — `onSeed` is optional, so the old `<Join onJoin=... error=... />` calls compile).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/screens/Join.tsx client/src/v2/screens/Join.test.tsx client/src/v2/V2App.tsx client/src/v2/styles/join.css
git commit -m "feat(client): Join seed-test-battle CTA + turn picker"
```

---

## Task 6: Impersonation context (runtime `ViewSideContext` override)

**Files:**
- Create: `client/src/v2/state/ImpersonationContext.tsx`
- Modify: `client/src/v2/state/V2Providers.tsx`
- Test: `client/src/v2/state/ImpersonationContext.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/state/ImpersonationContext.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useContext } from "react";
import { expect, test } from "vitest";
import { ImpersonationProvider, useImpersonation } from "./ImpersonationContext";
import { ViewSideContext } from "../../state/ViewSideContext";

function Probe() {
  const view = useContext(ViewSideContext);
  const { setActingSide } = useImpersonation();
  return (
    <div>
      <span data-testid="view">{view ?? "none"}</span>
      <button onClick={() => setActingSide("b")}>impersonate b</button>
    </div>
  );
}

test("setActingSide drives ViewSideContext; default is undefined", async () => {
  const user = userEvent.setup();
  render(<ImpersonationProvider><Probe /></ImpersonationProvider>);
  expect(screen.getByTestId("view")).toHaveTextContent("none");
  await user.click(screen.getByRole("button", { name: /impersonate b/i }));
  expect(screen.getByTestId("view")).toHaveTextContent("b");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/state/ImpersonationContext.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the provider**

Create `client/src/v2/state/ImpersonationContext.tsx`:

```tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { ViewSideContext } from "../../state/ViewSideContext";

interface Impersonation {
  actingSide: string | undefined;
  setActingSide: (side: string | undefined) => void;
}

const ImpersonationCtx = createContext<Impersonation | null>(null);

// Makes the app-wide ViewSideContext override runtime-switchable. Because
// useMySide() reads ViewSideContext and the whole app routes both view and
// command `side` through useMySide, flipping actingSide impersonates that side
// everywhere. Default undefined = act as your real session side.
export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [actingSide, setActingSide] = useState<string | undefined>(undefined);
  return (
    <ImpersonationCtx.Provider value={{ actingSide, setActingSide }}>
      <ViewSideContext.Provider value={actingSide}>{children}</ViewSideContext.Provider>
    </ImpersonationCtx.Provider>
  );
}

export function useImpersonation(): Impersonation {
  const v = useContext(ImpersonationCtx);
  if (!v) throw new Error("useImpersonation outside ImpersonationProvider");
  return v;
}
```

- [ ] **Step 4: Mount in `V2Providers`**

In `client/src/v2/state/V2Providers.tsx`, import and wrap the inner tree (inside `RoomProvider` so room state is available, outside the overlay providers so the whole terminal sees the override):

```tsx
import { ImpersonationProvider } from "./ImpersonationContext";
```

```tsx
    <RoomProvider>
      <ImpersonationProvider>
        <V2GlossaryTipProvider>
          <UiProvider>
            <V2DrawerProvider>
              <V2RollProvider>
                <V2BattleActionsProvider>
                  <V2WizardProvider>{children}</V2WizardProvider>
                </V2BattleActionsProvider>
              </V2RollProvider>
            </V2DrawerProvider>
          </UiProvider>
        </V2GlossaryTipProvider>
      </ImpersonationProvider>
    </RoomProvider>
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run client/src/v2/state/ImpersonationContext.test.tsx`
Expected: PASS
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/state/ImpersonationContext.tsx client/src/v2/state/ImpersonationContext.test.tsx client/src/v2/state/V2Providers.tsx
git commit -m "feat(client): runtime-switchable ViewSideContext for impersonation"
```

---

## Task 7: `ImpersonateChip` — Acting-as A/B (seed rooms only)

**Files:**
- Create: `client/src/v2/components/ImpersonateChip.tsx`
- Modify: `client/src/v2/V2Terminal.tsx`
- Modify: `client/src/v2/styles/battle.css`
- Test: `client/src/v2/components/ImpersonateChip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/v2/components/ImpersonateChip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { ImpersonateChip } from "./ImpersonateChip";
import { ImpersonationProvider } from "../state/ImpersonationContext";
import { RoomProvider, useRoomDispatch } from "../../state/RoomStateContext";
import { useEffect } from "react";
import type { ServerState } from "../../state/types";

function Seed({ state }: { state: ServerState }) {
  const dispatch = useRoomDispatch();
  useEffect(() => { dispatch({ type: "applyServerState", state }); }, [dispatch, state]);
  return null;
}

function wrap(state: ServerState) {
  return render(
    <RoomProvider>
      <ImpersonationProvider>
        <Seed state={state} />
        <ImpersonateChip />
      </ImpersonationProvider>
    </RoomProvider>,
  );
}

test("hidden when the room is not seeded", () => {
  wrap({ version: 1, rigs: [], game: null, field: null, seeded: false });
  expect(screen.queryByLabelText(/Impersonate side/i)).not.toBeInTheDocument();
});

test("shows A/B toggles when seeded", async () => {
  const user = userEvent.setup();
  wrap({ version: 1, rigs: [], game: null, field: null, seeded: true });
  const chip = screen.getByLabelText(/Impersonate side/i);
  expect(chip).toBeInTheDocument();
  const b = screen.getByRole("button", { name: /^B$/ });
  await user.click(b);
  expect(b).toHaveAttribute("aria-pressed", "true");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run client/src/v2/components/ImpersonateChip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the chip**

Create `client/src/v2/components/ImpersonateChip.tsx`:

```tsx
import { useRoomState } from "../../state/RoomStateContext";
import { useMySide } from "../../hooks/useMySide";
import { useImpersonation } from "../state/ImpersonationContext";

// Only rendered in seeded test rooms. Toggling flips the app-wide acting side
// (view + every command's `side`), letting a tester drive the enemy's turn.
export function ImpersonateChip() {
  const { seeded } = useRoomState();
  const { setActingSide } = useImpersonation();
  const active = useMySide();
  if (!seeded) return null;
  return (
    <div className="v2-impersonate" role="group" aria-label="Impersonate side">
      <span className="v2-impersonate-label">Acting as</span>
      <button
        type="button"
        className="v2-impersonate-btn"
        aria-pressed={active === "a"}
        onClick={() => setActingSide("a")}
      >
        A
      </button>
      <button
        type="button"
        className="v2-impersonate-btn"
        aria-pressed={active === "b"}
        onClick={() => setActingSide("b")}
      >
        B
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Mount in `V2Terminal`**

In `client/src/v2/V2Terminal.tsx`, import and render it just inside the `Shell` (above `TurnBanner`):

```tsx
import { ImpersonateChip } from "./components/ImpersonateChip";
```

```tsx
    >
      <ImpersonateChip />
      <TurnBanner onCommission={() => setCommissionOpen(true)} />
```

- [ ] **Step 5: Add styles**

Append to `client/src/v2/styles/battle.css`:

```css
.v2-impersonate {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.v2-impersonate-btn {
  min-width: 2rem;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  font: inherit;
}
.v2-impersonate-btn[aria-pressed="true"] {
  outline: 2px solid currentColor;
}
```

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run client/src/v2/components/ImpersonateChip.test.tsx`
Expected: PASS
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/v2/components/ImpersonateChip.tsx client/src/v2/components/ImpersonateChip.test.tsx client/src/v2/V2Terminal.tsx client/src/v2/styles/battle.css
git commit -m "feat(client): impersonate chip to act as either side in seed rooms"
```

---

## Task 8: AGENTS.md — UI-work mandate + agent UI-debugging guide

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the two sections**

In `AGENTS.md`, after the `## Project nature` section (before `## Game design invariants`), insert:

```markdown
## UI work — V2 only, everything

**ALL UI work goes in V2. Everything.** Every user-facing UI change — new
screens, components, overlays, wizards, styling, battle flows, chat, glossary —
lives under `client/src/v2/**` (with shared, non-UI state hooks under
`client/src/hooks/**` and `client/src/state/**` where V2 already reuses them).

- **Do not build new UI in the legacy V1 tree** (`client/src/components/**`). V1
  is frozen; treat it as read-only reference. If a feature needs a V1-only file
  changed, stop and flag it — don't extend V1.
- New UI files: create them in the matching `client/src/v2/` folder
  (`screens/`, `overlays/`, `components/`, `battle/`, `state/`, `hooks/`,
  `styles/`).
- Reuse the V2 provider stack (`client/src/v2/state/V2Providers.tsx`) and V2
  primitives (Drawer, wizards, Shell) — never import V1 overlay providers into
  V2 (there's a `no-v1-imports.test.ts` guard; keep it green).

## Debugging the UI as an agent

You can drive and inspect the running UI yourself — don't ask the user to click.

- **Seed a live battle instantly.** Instead of hand-commissioning 6 rigs, use the
  `seed` verb to get a valid, already-started 3v3:
  - **UI:** the Join screen's **"Seed Test Battle ▸"** button → pick *Your turn* /
    *Enemies turn*. Autogenerates a `SEED-XXXX` room and drops you into the battle.
  - **HTTP (no browser):** join then seed —
    ```
    curl -XPOST localhost:5173/api/game/SEED-DBG1/join  -H 'content-type: application/json' -d '{"side":"a"}'
    curl -XPOST localhost:5173/api/game/SEED-DBG1/command -H 'content-type: application/json' \
      -d '{"cmd":{"verb":"seed","attrs":{"first":"a"}},"side":"a"}'
    ```
    (`first`: `"a"` = your turn opens, `"b"` = the enemy's.)
  - **Unit test:** `applyCommand(room, { verb: "seed", attrs: { first } })` builds
    the same state deterministically (no dice) — assert on `turn.side`, rig counts.
- **Act on the enemy's turn (impersonate).** Seed rooms are flagged `seeded`, which
  drops `publicState` fog and shows an **"Acting as: A / B"** chip in the terminal.
  Toggle it to flip your acting side (view + every command's `side`). Over HTTP,
  just send commands with the other side: `{"cmd":{...},"side":"b"}` — the server
  doesn't auth `side`, so impersonation needs no special call.
- **Inspect at runtime** with the browser preview tools (read the console, the
  DOM/accessibility tree, and network requests) rather than adding `console.log`
  and asking the user to report back.
```

- [ ] **Step 2: Verify the doc reads correctly**

Run: `git diff AGENTS.md`
Expected: two new sections inserted cleanly after `## Project nature`; no mangled existing content.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: mandate V2 for all UI + agent UI-debugging via seed/impersonation"
```

---

## Final verification

- [ ] **Full shared suite:** `node --test` → all pass.
- [ ] **Full client suite:** `npx vitest run` → all pass.
- [ ] **Types:** `npx tsc --noEmit` → no errors.
- [ ] **Manual smoke (optional):** start the dev server, open the Join screen, click
  *Seed Test Battle → Enemies turn*, confirm a 3v3 loads with the enemy active,
  toggle the *Acting as: B* chip, and take an action on the enemy's rig.

---

## Self-review notes (author)

- **Spec coverage:** Feature 1 (seed verb) → Task 1. Feature 2 (publicState seeded) →
  Task 2. `seeded` client thread → Task 3. Feature 3 (helper) → Task 4. Feature 4
  (Join UI) → Task 5. Feature 5 (impersonation) → Tasks 6–7. AGENTS.md (both
  requested additions: V2-only mandate + agent UI debugging) → Task 8. No gaps.
- **Type consistency:** `SEED_ROSTER`, `resetGameShape`, `startGameSeeded`,
  `seeded`, `ImpersonationProvider`/`useImpersonation`/`actingSide`/`setActingSide`,
  `useSeedBattle`, `onSeed` used identically across tasks.
- **No placeholders:** every code/test step carries full source.
```
