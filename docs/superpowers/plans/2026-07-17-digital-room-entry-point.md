# Digital-Room Entry Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player flip a room to digital mode from the app, lighting up the (currently dark) human-vs-bot opponent and the digital battle map.

**Architecture:** A new pre-battle `mode` verb (mirrors the existing `setdice` toggle) sets `room.mode`; the `setbot` verb auto-forces digital when a bot preset is picked (replacing its physical-room reject); a Physical/Digital toggle in the V2 lobby drives the verb. Everything downstream of `room.mode` (auto-deploy, terrain scatter, Rigs-only, the map screen) is already wired.

**Tech Stack:** Node ESM engine (`shared/game-state.js`), Express routes, React + TS V2 client. Tests: `node --test` (shared/server), Vitest (client).

**Design:** `docs/superpowers/specs/2026-07-17-digital-room-entry-point-design.md`

**Scope:** Adds the switch only — no new digital gameplay. Default stays physical; existing rooms/tests unaffected except the one `setbot` test whose physical-reject assertion is now obsolete (Task 2).

---

## File Structure

- `shared/game-state.js` — **modify.** Add the `mode` verb (next to `setdice`); change `setbot` to auto-force digital instead of rejecting physical rooms.
- `shared/game-state.test.js` — **modify.** Unit tests for `mode`; new `setbot` auto-force tests; **rewrite** the obsolete physical-reject test.
- `server/routes/game.test.js` — **modify.** One integration test: a default (physical) room becomes digital via `setbot` and reaches a started digital game.
- `client/src/v2/screens/Squadron.tsx` — **modify.** The lobby Physical/Digital toggle.
- `client/src/v2/screens/Squadron.test.tsx` — **modify.** Toggle dispatch + bot-pins-digital tests.
- `client/src/v2/styles/squadron.css` — **modify.** Toggle styles (reuse the opponent-selector rules).

---

## Task 1: The `mode` verb

**Files:**
- Modify: `shared/game-state.js` (add a `mode` branch next to `setdice`, ~line 3619)
- Test: `shared/game-state.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `shared/game-state.test.js` (uses the existing `createRoom`, `claimSide`, `applyCommand` imports):

```js
test("mode verb flips a room to digital and back pre-battle", () => {
  const room = createRoom("MODE1");
  claimSide(room, { name: "A", side: "a" });
  applyCommand(room, { verb: "mode", attrs: { mode: "digital" } }, { side: "a" });
  assert.equal(room.mode, "digital");
  applyCommand(room, { verb: "mode", attrs: { mode: "physical" } }, { side: "a" });
  assert.equal(room.mode, "physical");
});

test("mode verb is a no-op once the game has started", () => {
  const room = createRoom("MODE2");
  claimSide(room, { name: "A", side: "a" });
  applyCommand(room, { verb: "mode", attrs: { mode: "digital" } }, { side: "a" });
  room.game.started = true;
  applyCommand(room, { verb: "mode", attrs: { mode: "physical" } }, { side: "a" });
  assert.equal(room.mode, "digital"); // unchanged after start
});

test("mode verb ignores an unknown value", () => {
  const room = createRoom("MODE3");
  claimSide(room, { name: "A", side: "a" });
  applyCommand(room, { verb: "mode", attrs: { mode: "hologram" } }, { side: "a" });
  assert.notEqual(room.mode, "hologram");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `mode` is an unknown verb, so `room.mode` never becomes `"digital"`.

- [ ] **Step 3: Add the `mode` verb branch**

In `shared/game-state.js`, immediately after the `setdice` branch (the block at ~line 3619-3623, before `} else if (verb === "field") {`), insert:

```js
  } else if (verb === "mode") {
    // Pre-battle room-wide toggle between a physical (tabletop-companion) game
    // and a digital (simulated-positions) game. Mirrors setdice. Digital unlocks
    // the battle map + bot opponent; positions and terrain are fixed at game
    // start, so mode can't change once started. An unknown value is ignored.
    if (!room.game.started) {
      const want = String(a.mode || "").toLowerCase();
      if ((want === "digital" || want === "physical") && room.mode !== want) {
        room.mode = want;
        changed = true;
      }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS (three new tests + the whole existing file green).

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(mode): pre-battle mode verb toggles room digital/physical"
```

---

## Task 2: `setbot` auto-forces digital

**Files:**
- Modify: `shared/game-state.js` (the `setbot` branch, ~lines 3486-3489)
- Test: `shared/game-state.test.js` (new tests + rewrite one obsolete test)

- [ ] **Step 1: Write the failing / updated tests**

First, **rewrite** the existing test named `"setbot rejects an unknown preset, a physical room, and a started game"` in `shared/game-state.test.js`. Its physical-room-rejects assertion is now obsolete (setbot auto-forces digital). Replace that entire `test(...)` block with:

```js
test("setbot flips a physical room to digital; still rejects unknown preset and started game", () => {
  const room = createRoom("SETBOT3");
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  // A physical room: picking a bot now auto-forces digital (was a reject).
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: "cagey" } }, { side: "a" });
  assert.equal(room.mode, "digital");
  assert.equal(room.game.sides.find((s) => s.id === "b").bot, "cagey");
  // Unknown preset is still rejected (no change).
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: "wombat" } }, { side: "a" });
  assert.match(lastRejectionReason() || "", /preset/i);
  // A started game is still rejected.
  room.game.started = true;
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: "balanced" } }, { side: "a" });
  assert.match(lastRejectionReason() || "", /started/i);
});
```

Then add two new tests:

```js
test("setbot with a preset auto-forces the room to digital", () => {
  const room = createRoom("SETBOT5");
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  assert.notEqual(room.mode, "digital"); // starts physical
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: "aggressive" } }, { side: "a" });
  assert.equal(room.mode, "digital");
  assert.equal(room.game.sides.find((s) => s.id === "b").bot, "aggressive");
});

test("clearing a bot to Human leaves the room digital", () => {
  const room = createRoom("SETBOT6");
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: "balanced" } }, { side: "a" });
  applyCommand(room, { verb: "setbot", attrs: { side: "b", preset: null } }, { side: "a" });
  assert.equal(room.game.sides.find((s) => s.id === "b").bot, null);
  assert.equal(room.mode, "digital");
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `node --test shared/game-state.test.js`
Expected: FAIL — `SETBOT5` (mode stays physical) and the rewritten `SETBOT3` (setbot still rejects a physical room) fail against the current code.

- [ ] **Step 3: Change the `setbot` branch to auto-force digital**

In `shared/game-state.js`, in the `setbot` branch (~lines 3485-3489):
- **Delete** the line `else if (room.mode !== "digital") reject("Bots play only in digital battles.");` (~line 3486).
- **Replace** the success line `else { side.bot = preset; changed = true; }` (~line 3489) with:

```js
    else {
      // A bot requires a digital game; picking a preset flips the room to
      // digital in one step (was: reject in a physical room). Clearing to Human
      // (null preset) leaves the mode as-is.
      if (preset !== null) room.mode = "digital";
      side.bot = preset;
      changed = true;
    }
```

The remaining guards (unknown side, started game, unknown preset) stay unchanged. Also update the leading comment on the branch (it says "digital rooms only") to reflect that a preset now forces digital.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test shared/game-state.test.js`
Expected: PASS. The human-vs-bot tests (`VSBOT1`..`VSBOT3`, which set `room.mode="digital"` directly then call setbot) remain green — setbot's force is idempotent when already digital.

- [ ] **Step 5: Commit**

```bash
git add shared/game-state.js shared/game-state.test.js
git commit -m "feat(mode): setbot auto-forces a room to digital"
```

---

## Task 3: Lobby Physical/Digital toggle

**Files:**
- Modify: `client/src/v2/screens/Squadron.tsx`
- Test: `client/src/v2/screens/Squadron.test.tsx`
- Modify: `client/src/v2/styles/squadron.css`

- [ ] **Step 1: Write the failing tests**

Add to `client/src/v2/screens/Squadron.test.tsx` (it already mocks `useCommands` with a shared `sendSpy` and has a `beforeEach(() => sendSpy.mockClear())`):

```tsx
test("the battle-mode toggle dispatches mode and reflects room state", async () => {
  const state: ServerState = {
    version: 1, ownerSide: "a", mode: "physical",
    field: { locked: false } as unknown as ServerState["field"],
    rigs: [rig(1, "STALKER", "a")],
    game: { round: 1, phase: "setup", started: false, sides: [
      { id: "a", name: "Kostov", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false },
    ] },
  };
  render(<V2Providers><Seed state={state} /><Squadron onOpenRig={vi.fn()} onCommission={vi.fn()} /></V2Providers>);
  const digitalBtn = await screen.findByRole("button", { name: /^digital$/i });
  digitalBtn.click();
  expect(sendSpy).toHaveBeenCalledWith("mode", { mode: "digital" });
});

test("Physical mode is disabled when a bot opponent is selected", async () => {
  const state: ServerState = {
    version: 1, ownerSide: "a", mode: "digital",
    field: { locked: true } as unknown as ServerState["field"],
    rigs: [rig(1, "STALKER", "a")],
    game: { round: 1, phase: "setup", started: false, sides: [
      { id: "a", name: "Kostov", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false, bot: "balanced" },
    ] },
  };
  render(<V2Providers><Seed state={state} /><Squadron onOpenRig={vi.fn()} onCommission={vi.fn()} /></V2Providers>);
  const physicalBtn = await screen.findByRole("button", { name: /^physical$/i });
  expect(physicalBtn).toBeDisabled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client/src/v2/screens/Squadron.test.tsx`
Expected: FAIL — no Physical/Digital buttons exist yet.

- [ ] **Step 3: Add `mode` to the Squadron room-state read**

In `client/src/v2/screens/Squadron.tsx`, change the destructure on line 13 from:

```tsx
  const { rigs, game, field } = useRoomState();
```
to:
```tsx
  const { rigs, game, field, mode } = useRoomState();
```

(`mode` was added to `RoomState`/the reducer during the battle-map work; confirm by grepping `client/src/state/roomReducer.ts` for `mode`. If `useRoomState`'s return type doesn't expose `mode`, it's on the same `RoomState` object — read it there.)

Then derive, near the other locals (after `enemyBot`, ~line 17):

```tsx
  const isDigital = mode === "digital";
```

- [ ] **Step 4: Render the mode toggle**

In `Squadron.tsx`, add this block inside the `!started` region, immediately ABOVE the existing `{!started && (<div className="v2-yard-opponent">…` block (mode is chosen before the opponent):

```tsx
      {!started && (
        <div className="v2-yard-mode">
          <span className="v2-yard-mode-label v2-eyebrow">BATTLE MODE</span>
          <div className="v2-yard-mode-opts" role="group" aria-label="Battle mode">
            <button
              type="button"
              className={"v2-yard-mode-btn" + (!isDigital ? " is-on" : "")}
              aria-pressed={!isDigital}
              disabled={!!enemyBot}
              onClick={() => sendCommand("mode", { mode: "physical" })}
            >
              Physical
            </button>
            <button
              type="button"
              className={"v2-yard-mode-btn" + (isDigital ? " is-on" : "")}
              aria-pressed={isDigital}
              onClick={() => sendCommand("mode", { mode: "digital" })}
            >
              Digital
            </button>
          </div>
          <div className="v2-yard-mode-sub">
            {enemyBot
              ? "Bots require digital."
              : isDigital
                ? "Simulated positions — play on the map."
                : "Tabletop companion — you track the physical table."}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run client/src/v2/screens/Squadron.test.tsx`
Expected: PASS (the two new tests + the existing Squadron tests, which don't set `mode` → `isDigital` false → Physical on, unaffected).

- [ ] **Step 6: Add toggle styles**

In `client/src/v2/styles/squadron.css`, append (reuse the same `.v2-root`-scoped token conventions as the opponent-selector rules — grep the file for `.v2-yard-opponent` and mirror it):

```css
.v2-root .v2-yard-mode { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; }
.v2-root .v2-yard-mode-opts { display: flex; gap: 6px; }
.v2-root .v2-yard-mode-btn {
  font: inherit; padding: 6px 12px; border: 1px solid var(--v2-line, #3a3a3a);
  background: transparent; color: var(--v2-txt, #ddd); border-radius: 4px; cursor: pointer;
}
.v2-root .v2-yard-mode-btn.is-on { border-color: var(--v2-oil, #e8792a); color: var(--v2-oil, #e8792a); }
.v2-root .v2-yard-mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.v2-root .v2-yard-mode-sub { font-size: 11px; opacity: 0.7; }
```

- [ ] **Step 7: Run the full client suite + typecheck**

Run: `npx vitest run` then `npx tsc -p tsconfig.json --noEmit`
Expected: PASS + exit 0.

- [ ] **Step 8: Commit**

```bash
git add client/src/v2/screens/Squadron.tsx client/src/v2/screens/Squadron.test.tsx client/src/v2/styles/squadron.css
git commit -m "feat(mode): lobby Physical/Digital toggle (pinned to digital under a bot)"
```

---

## Task 4: Reachability integration test

**Files:**
- Test: `server/routes/game.test.js` (add one test near the existing human-vs-bot HTTP tests)

Proves the whole point: from a **default physical** room, picking a bot flips it digital and a started digital game results — the previously-dark path is now reachable over HTTP.

- [ ] **Step 1: Write the failing test**

```js
test("a default physical room becomes digital via setbot and starts a digital game", async () => {
  const room = store.getOrCreateRoom("MODEHTTP");
  // NOTE: room.mode is NOT set here — it defaults to physical.
  claimSide(room, { name: "Human", side: "a" });
  claimSide(room, { name: "Bot", side: "b" });
  const light = CHASSIS.filter((c) => c.class === "light");
  for (let i = 0; i < 2; i++) {
    const pb = light[i];
    applyCommand(room, { verb: "add", attrs: {
      name: `H${i + 1}`, owner: "a", class: pb.class,
      longRange: pb.longRange, melee: pb.melee, chassis: pb.id, sp: pb.sp,
    } }, { side: "a" });
  }
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });

  // Picking a bot over HTTP flips the physical room to digital.
  const flag = await post("/api/game/MODEHTTP/command", { cmd: { verb: "setbot", attrs: { side: "b", preset: "aggressive" } }, side: "a" });
  assert.equal(flag.status, 200);

  const res = await post("/api/game/MODEHTTP/command", { cmd: { verb: "ready", attrs: {} }, side: "a" });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.state.mode, "digital");        // the room flipped to digital
  assert.equal(body.state.game.started, true);      // and started
  assert.equal(body.state.rigs.filter((r) => (r.owner || "a") === "b").length, 2); // mirrored bot force
  // Digital start assigned positions (autoDeploy), proving the digital path ran.
  assert.ok(body.state.rigs.every((r) => r.pos && typeof r.pos.x === "number"));
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `node --test server/routes/game.test.js`
Expected: PASS after Tasks 1-2 are committed (no route change needed — `setbot`/`ready` flow through the existing `/command` handler + `driveBots`). If it FAILS because `mode` isn't `"digital"`, Task 2's auto-force isn't wired — stop and check.

- [ ] **Step 3: Commit**

```bash
git add server/routes/game.test.js
git commit -m "test(mode): default room reaches a started digital game via setbot"
```

---

## Task 5: Full suite + live smoke (now reachable)

**Files:** none (verification only)

- [ ] **Step 1: Full suite + build**

Run: `npm test` then `npm run build`
Expected: Vitest (client) + `node --test` (shared/server/scripts) all green; production bundle builds.

- [ ] **Step 2: Live smoke — the whole digital stack, end to end**

This is now possible for the first time. Start the dev servers (preview_start `vite-client` on 5173 and `oil-iron-server` on 8000, or `npm run dev`). In the V2 app: join/create a room, in the lobby toggle **Digital** (or pick a Balanced Bot — which auto-flips to Digital and mirrors your force), commission 2-3 Rigs, lock the field, hit READY. Confirm:
- the room starts and the **battle map** renders with every unit at a real position;
- clicking your rig on your turn activates it (reach ring appears);
- Move → tap a reachable cell → ghost + facing handle + readout → Confirm moves the token;
- a Balanced Bot opponent takes its turn (state arrives resolved).

Capture a screenshot of the live battle map as proof.

- [ ] **Step 3: Commit any smoke-fix (only if needed)**

```bash
git add <specific files you fixed>
git commit -m "fix(mode): <describe the smoke-test fix>"
```

(Never `git add -A` — concurrent committer; stage only files you touched.)

---

## Self-Review

**Spec coverage:**
- §1 `mode` verb (pre-battle, validated, no-op when started/unknown/unchanged) → Task 1. ✓
- §2 `setbot` auto-forces digital (drops the physical reject; clear-to-Human leaves mode) → Task 2. ✓
- §3 lobby Physical/Digital toggle (dispatches `mode`, reflects state, Physical disabled under a bot) → Task 3. ✓
- §4 no other engine change (publicState already publishes `mode`) → confirmed; Task 4 asserts `body.state.mode`. ✓
- §5 default stays physical → tests start from unset/physical rooms; existing tests unaffected except the rewritten `SETBOT3`. ✓
- Testing (mode verb; setbot auto-force; integration from a default room; lobby toggle) → Tasks 1-4. ✓

**Placeholder scan:** No TBD/TODO. The one dependency on prior work (`useRoomState` exposing `mode`) has an explicit confirm-step; the CSS reuses documented tokens with literal fallbacks.

**Type/name consistency:** the `mode` command shape `{ verb: "mode", attrs: { mode } }` and the `setbot` `{ side, preset }` shape are consistent across engine, tests, route, and the Squadron toggle. `isDigital`/`enemyBot`/`mode` are consistent within Task 3. The rewritten `SETBOT3` replaces the obsolete assertion rather than adding a contradictory one.
