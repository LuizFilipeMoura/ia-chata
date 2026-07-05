# Phase 1 — Shared-State Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Rig/battle state from the browser's `localStorage` onto the server, keyed by room code, so two players in the same room see one authoritative game (their Rigs and the enemy's), synced by a 3-second HTTP poll.

**Architecture:** A pure-logic module (`game-state.js`) owns the authoritative state shape and all mutations; a persistence module (`store.js`) keeps rooms in a `Map` flushed to `data/rooms.json`; `server.js` exposes `join` / `GET` / `command` routes plus room-aware chat. The browser becomes a renderer + command sender: it joins a room, polls `GET /api/game/:room` every 3s, re-renders only when `version` changes, and POSTs every change (manual tap or Gemma tag) as a command. Changes are deltas, never full-state overwrites, so two writers never clobber.

**Tech Stack:** Node 18+ (ESM), Express, built-in `node:test` runner, vanilla browser JS. No new dependencies.

**Scope note:** This is Phase 1 of the battle-state spec ([2026-07-04-battle-state-tracker-design.md](../specs/2026-07-04-battle-state-tracker-design.md)). It ships shared multiplayer for the Rig-condition features that exist today (SP, heat, add/remove) plus ownership. Weapons, Prepare tokens, Round/Recovery, and VP/objectives are Phases 2–5 and are intentionally out of scope here — but the persisted state shape includes their fields (initialized empty) so later phases add behavior, not migrations.

---

## File Structure

- **Create `game-state.js`** — pure functions: state shape (`createRoom`, `makeRig`), side claiming (`claimSide`, `normalizeSide`), Rig math (`engineHeatFloor`, `recompute`, `damageRig`, `repairRig`, `setRigSp`, `heatRig`, `findRig`), the command dispatcher (`applyCommand`), the public view (`publicState`), and the prompt dump (`formatBattleState`). No I/O. Fully unit-tested.
- **Create `store.js`** — `createStore(filePath)` returning `{ getRoom, getOrCreateRoom, persist }` over a `Map` persisted to JSON. Only I/O lives here. Unit-tested against a temp file.
- **Create `game-state.test.js`, `store.test.js`** — `node:test` suites.
- **Modify `server.js`** — import the store + game-state; add `POST /api/game/:room/join`, `GET /api/game/:room`, `POST /api/game/:room/command`; make `/api/chat` room-aware via `formatBattleState`; document the optional `owner` attribute on `[[RIG add]]`.
- **Modify `index.html`** — join gate (room code + name + side), polling loop, command sender, ownership-aware rendering (Your Squadron vs Enemy). The Rig math functions are deleted from the client (now server-owned); the client renders server state and builds commands.
- **Modify `package.json`** — add `"test": "node --test"`.
- **Create `.gitignore`** — ignore `node_modules/` and `data/`.

---

## Task 1: Project setup (git, test script, gitignore)

**Files:**
- Create: `.gitignore`
- Modify: `package.json:7-10` (scripts block)

- [ ] **Step 1: Initialize git if absent**

Run:
```bash
git rev-parse --is-inside-work-tree 2>/dev/null || git init
```
Expected: either `true`, or `Initialized empty Git repository…`. (If you use a different VCS, skip the `git` commit steps throughout this plan.)

- [ ] **Step 2: Create `.gitignore`**

Create `.gitignore` with exactly:
```gitignore
node_modules/
data/
*.log
```

- [ ] **Step 3: Add the test script**

In `package.json`, change the `scripts` block to:
```json
  "scripts": {
    "start": "node server.js",
    "preview": "set PORT=8123&& node server.js",
    "test": "node --test"
  },
```

- [ ] **Step 4: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: exit 0 with a summary like `tests 0` / `pass 0` (Node reports no test files found but does not error).

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json
git commit -m "chore: add node:test runner and gitignore"
```

---

## Task 2: `game-state.js` — room + Rig state (pure logic)

**Files:**
- Create: `game-state.js`
- Test: `game-state.test.js`

- [ ] **Step 1: Write the failing test**

Create `game-state.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, makeRig, claimSide, applyCommand, findRig,
} from "./game-state.js";

test("createRoom has two unclaimed sides and empty rigs", () => {
  const r = createRoom("IRON42");
  assert.equal(r.code, "IRON42");
  assert.equal(r.version, 0);
  assert.equal(r.rigs.length, 0);
  assert.deepEqual(r.game.sides.map((s) => s.id), ["a", "b"]);
  assert.equal(r.game.sides.every((s) => !s.claimed), true);
  assert.equal(r.game.round, 1);
});

test("claimSide takes the first free side and bumps version", () => {
  const r = createRoom("X");
  const first = claimSide(r, { name: "Ana" });
  assert.equal(first, "a");
  assert.equal(r.game.sides[0].name, "Ana");
  assert.equal(r.game.sides[0].claimed, true);
  assert.equal(r.version, 1);
  const second = claimSide(r, { name: "Bo" });
  assert.equal(second, "b");
  const third = claimSide(r, { name: "Cy" });
  assert.equal(third, null); // room full
});

test("add assigns owner and default SP; damage respects the floor", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "heavy", owner: "b" } });
  const rig = findRig(r, "warden");
  assert.equal(rig.owner, "b");
  assert.equal(rig.hull.max, 8);
  assert.equal(r.version, 1);
  applyCommand(r, { verb: "damage", attrs: { name: "Warden", loc: "hull", amount: "3" } });
  assert.equal(rig.hull.sp, 5);
  assert.equal(r.version, 2);
});

test("engine heat cannot cool below 3 once catastrophic; recovery-less heat math", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "S", class: "light" } });
  applyCommand(r, { verb: "set", attrs: { name: "S", loc: "engine", sp: "0" } });
  const rig = findRig(r, "S");
  assert.equal(rig.engine.heat >= 3, true);
  applyCommand(r, { verb: "heat", attrs: { name: "S", amount: "0" } }); // try to vent
  assert.equal(rig.engine.heat, 3);
});

test("unknown verb and unknown rig are no-ops (no version bump)", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "nonsense", attrs: {} });
  applyCommand(r, { verb: "damage", attrs: { name: "ghost", loc: "hull", amount: "1" } });
  assert.equal(r.version, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test game-state.test.js`
Expected: FAIL — `Cannot find module './game-state.js'`.

- [ ] **Step 3: Write the implementation**

Create `game-state.js`:
```js
export const RIG_DEFAULTS = {
  light:    { hull: 6, arms: 5, legs: 5, engine: 4 },
  medium:   { hull: 7, arms: 6, legs: 6, engine: 5 },
  heavy:    { hull: 8, arms: 7, legs: 7, engine: 6 },
  colossal: { hull: 9, arms: 8, legs: 8, engine: 7 },
};
export const LOCS = ["hull", "arms", "legs", "engine"];

export function createRoom(code) {
  return {
    code,
    version: 0,
    nextRigId: 1,
    game: {
      round: 1,
      sides: [
        { id: "a", name: "You",   vp: 0, claimed: false },
        { id: "b", name: "Enemy", vp: 0, claimed: false },
      ],
      objectives: [],
    },
    rigs: [],
  };
}

export function makeRig(id, name, cls, owner) {
  const weightClass = RIG_DEFAULTS[cls] ? cls : "medium";
  const d = RIG_DEFAULTS[weightClass];
  return {
    id,
    name: String(name || "Rig").trim() || "Rig",
    weightClass,
    owner: owner === "b" ? "b" : "a",
    hull:   { sp: d.hull, max: d.hull, destroyed: false },
    arms:   { sp: d.arms, max: d.arms, destroyed: false },
    legs:   { sp: d.legs, max: d.legs, destroyed: false },
    engine: { sp: d.engine, max: d.engine, destroyed: false, heat: 0 },
    weapons: [],   // Phase 2
    prepare: 0,    // Phase 4
    destroyed: false,
  };
}

export function findRig(room, name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return room.rigs.find((r) => r.name.toLowerCase() === n) || null;
}

export function normalizeSide(room, ref) {
  if (!ref) return null;
  const s = String(ref).trim().toLowerCase();
  const byId = room.game.sides.find((x) => x.id === s);
  if (byId) return byId.id;
  const byName = room.game.sides.find((x) => x.name.toLowerCase() === s);
  return byName ? byName.id : null;
}

export function claimSide(room, { name, side } = {}) {
  let target = side ? room.game.sides.find((s) => s.id === side && !s.claimed) : null;
  if (!target) target = room.game.sides.find((s) => !s.claimed);
  if (!target) return null;
  target.claimed = true;
  if (name) target.name = String(name).trim() || target.name;
  room.version++;
  return target.id;
}

function engineHeatFloor(rig) {
  return rig.engine.sp === 0 ? 3 : 0;
}

function recompute(rig) {
  rig.destroyed = rig.hull.destroyed || rig.engine.destroyed ||
    LOCS.every((l) => rig[l].sp === 0);
  const floor = engineHeatFloor(rig);
  if (rig.engine.heat < floor) rig.engine.heat = floor;
}

function damageRig(rig, loc, amount) {
  const c = rig[loc];
  if (!c) return;
  let n = Math.max(0, Math.floor(Number(amount) || 0));
  while (n-- > 0) {
    if (c.sp > 0) c.sp -= 1;
    else c.destroyed = true;
  }
  if (loc === "engine" && c.sp === 0) c.heat = Math.max(c.heat, 3);
  recompute(rig);
}

function repairRig(rig, loc, amount) {
  const c = rig[loc];
  if (!c) return;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  c.sp = Math.min(c.max, c.sp + n);
  if (c.sp > 0) c.destroyed = false;
  recompute(rig);
}

function setRigSp(rig, loc, sp) {
  const c = rig[loc];
  if (!c) return;
  const v = Math.max(0, Math.min(c.max, Math.floor(Number(sp) || 0)));
  c.sp = v;
  if (v > 0) c.destroyed = false;
  recompute(rig);
}

function heatRig(rig, spec) {
  const c = rig.engine;
  const s = String(spec).trim();
  let v;
  if (/^[+-]/.test(s)) v = c.heat + Number(s);
  else v = Number(s);
  if (!Number.isFinite(v)) return;
  c.heat = Math.max(engineHeatFloor(rig), Math.floor(v));
}

// Apply a single normalized command { verb, attrs } to the room in place.
// Returns the room. Bumps room.version only when something actually changed.
export function applyCommand(room, cmd) {
  const verb = (cmd?.verb || "").toLowerCase();
  const a = cmd?.attrs || {};
  let changed = false;

  if (verb === "add") {
    if (a.name && !findRig(room, a.name)) {
      const owner = normalizeSide(room, a.owner) || "a";
      room.rigs.push(makeRig(room.nextRigId++, a.name, (a.class || "").toLowerCase(), owner));
      changed = true;
    }
  } else if (verb === "remove") {
    const rig = findRig(room, a.name);
    if (rig) { room.rigs = room.rigs.filter((r) => r !== rig); changed = true; }
  } else {
    const rig = findRig(room, a.name);
    if (rig) {
      if (verb === "damage") { damageRig(rig, (a.loc || "").toLowerCase(), a.amount); changed = true; }
      else if (verb === "repair") { repairRig(rig, (a.loc || "").toLowerCase(), a.amount); changed = true; }
      else if (verb === "set") { setRigSp(rig, (a.loc || "").toLowerCase(), a.sp); changed = true; }
      else if (verb === "heat") { heatRig(rig, a.amount); changed = true; }
    }
  }

  if (changed) room.version++;
  return room;
}

// The room view sent to clients — omit internal bookkeeping.
export function publicState(room) {
  return { code: room.code, version: room.version, game: room.game, rigs: room.rigs };
}

// Human-readable battle-state block injected into the chat system prompt.
export function formatBattleState(room) {
  const g = room.game;
  const lines = ["", "=== CURRENT BATTLE STATE ==="];
  lines.push(`Round ${g.round}/5`);
  lines.push(`Sides: ${g.sides.map((s) => `${s.name} (${s.id}) VP ${s.vp}`).join(" | ")}`);
  if (room.rigs.length === 0) {
    lines.push("(No Rigs are being tracked yet.)");
  } else {
    for (const rig of room.rigs) {
      const parts = LOCS.map((loc) => {
        const c = rig[loc];
        let tag = `${loc} ${c.sp}/${c.max}`;
        if (loc === "engine") tag += ` heat ${c.heat}`;
        if (c.destroyed) tag += " (DESTROYED)";
        else if (c.sp === 0) tag += " (CATASTROPHIC)";
        return tag;
      });
      const status = rig.destroyed ? " [RIG DESTROYED]" : "";
      lines.push(`- ${rig.name} (${rig.weightClass}, owner ${rig.owner})${status}: ${parts.join(", ")}`);
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test game-state.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add game-state.js game-state.test.js
git commit -m "feat: server-authoritative room + rig state logic"
```

---

## Task 3: `formatBattleState` output test

**Files:**
- Test: `game-state.test.js` (append)

- [ ] **Step 1: Add the failing test**

Append to `game-state.test.js`:
```js
import { formatBattleState, publicState } from "./game-state.js";

test("formatBattleState reports round, sides and owned rigs", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Ana" });
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "heavy", owner: "a" } });
  const out = formatBattleState(r);
  assert.match(out, /CURRENT BATTLE STATE/);
  assert.match(out, /Round 1\/5/);
  assert.match(out, /Ana \(a\) VP 0/);
  assert.match(out, /Warden \(heavy, owner a\).*hull 8\/8/);
});

test("publicState omits nextRigId bookkeeping", () => {
  const r = createRoom("X");
  const view = publicState(r);
  assert.equal(view.nextRigId, undefined);
  assert.equal(view.code, "X");
  assert.ok(Array.isArray(view.rigs));
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test game-state.test.js`
Expected: PASS (the functions already exist from Task 2; these lock their output).

- [ ] **Step 3: Commit**

```bash
git add game-state.test.js
git commit -m "test: lock formatBattleState and publicState output"
```

---

## Task 4: `store.js` — room persistence over a JSON file

**Files:**
- Create: `store.js`
- Test: `store.test.js`

- [ ] **Step 1: Write the failing test**

Create `store.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "./store.js";
import { applyCommand } from "./game-state.js";

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ooi-")), "rooms.json");
}

test("getOrCreateRoom creates, persists, and reloads", () => {
  const file = tmpFile();
  const store = createStore(file);
  assert.equal(store.getRoom("IRON42"), null);

  const room = store.getOrCreateRoom("IRON42");
  applyCommand(room, { verb: "add", attrs: { name: "Warden", class: "heavy" } });
  store.persist();

  const reloaded = createStore(file);
  const again = reloaded.getRoom("IRON42");
  assert.ok(again);
  assert.equal(again.rigs.length, 1);
  assert.equal(again.rigs[0].name, "Warden");
});

test("missing file loads to an empty store without throwing", () => {
  const store = createStore(path.join(os.tmpdir(), "does-not-exist-ooi", "rooms.json"));
  assert.equal(store.getRoom("anything"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test store.test.js`
Expected: FAIL — `Cannot find module './store.js'`.

- [ ] **Step 3: Write the implementation**

Create `store.js`:
```js
import fs from "node:fs";
import path from "node:path";
import { createRoom } from "./game-state.js";

export function createStore(filePath) {
  const rooms = new Map();

  function load() {
    try {
      const obj = JSON.parse(fs.readFileSync(filePath, "utf8"));
      for (const [code, room] of Object.entries(obj)) rooms.set(code, room);
    } catch {
      // No file yet, or unreadable — start empty.
    }
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(rooms)));
  }

  function getRoom(code) {
    return rooms.get(code) || null;
  }

  function getOrCreateRoom(code) {
    let room = rooms.get(code);
    if (!room) {
      room = createRoom(code);
      rooms.set(code, room);
      persist();
    }
    return room;
  }

  load();
  return { rooms, getRoom, getOrCreateRoom, persist };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test store.test.js`
Expected: PASS — both tests green.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — all files, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add store.js store.test.js
git commit -m "feat: json-file-backed room store"
```

---

## Task 5: Wire routes into `server.js`

**Files:**
- Modify: `server.js` (imports near top; `formatRigState` removed; `/api/chat` body; new routes before `start()`)

- [ ] **Step 1: Add imports and the store**

In `server.js`, just below the existing `import pdfParse from "pdf-parse";` line, add:
```js
import { createStore } from "./store.js";
import { applyCommand, claimSide, publicState, formatBattleState } from "./game-state.js";
```
And just below the `const __dirname = …` line, add:
```js
const store = createStore(path.join(__dirname, "data", "rooms.json"));
```

- [ ] **Step 2: Delete the client-superseded `formatRigState`**

Remove the entire `RIG_DEFAULTS` const and the `formatRigState` function from `server.js` (lines ~50–81 in the current file). The authoritative versions now live in `game-state.js`. Leave `TRACKER_PROTOCOL` in place.

- [ ] **Step 3: Document `owner` on the add tag**

In `server.js`, in the `TRACKER_PROTOCOL` array, replace the add-tag line:
```js
  '[[RIG add name="<name>" class="light|medium|heavy|colossal"]]',
```
with:
```js
  '[[RIG add name="<name>" class="light|medium|heavy|colossal" owner="a|b"]]',
```
and add this bullet to the "Rules for the tags" list (right after the first bullet):
```js
  "- On `add`, `owner` picks the side; if you omit it, the requesting player's",
  "  side is used. Never invent Rigs for the enemy unless the player says so.",
```

- [ ] **Step 4: Make `/api/chat` room-aware**

In the `/api/chat` handler, replace this line:
```js
  const system = SYSTEM_PROMPT + "\n" + TRACKER_PROTOCOL + "\n" + formatRigState(req.body?.rigs);
```
with:
```js
  const room = req.body?.room ? store.getRoom(req.body.room) : null;
  const battle = room ? formatBattleState(room) : "";
  const system = SYSTEM_PROMPT + "\n" + TRACKER_PROTOCOL + "\n" + battle;
```

- [ ] **Step 5: Add the room routes**

In `server.js`, immediately before the `async function start()` declaration, add:
```js
app.post("/api/game/:room/join", (req, res) => {
  const room = store.getOrCreateRoom(req.params.room);
  const side = claimSide(room, { name: req.body?.name, side: req.body?.side });
  store.persist();
  res.json({ side, version: room.version, state: publicState(room) });
});

app.get("/api/game/:room", (req, res) => {
  const room = store.getRoom(req.params.room);
  if (!room) return res.status(404).json({ error: "no such room" });
  res.json({ version: room.version, state: publicState(room) });
});

app.post("/api/game/:room/command", (req, res) => {
  const room = store.getRoom(req.params.room);
  if (!room) return res.status(404).json({ error: "no such room" });
  applyCommand(room, req.body?.cmd || {});
  store.persist();
  res.json({ version: room.version, state: publicState(room) });
});
```

- [ ] **Step 6: Start the server and verify routes with the Preview tools**

Start the server (Preview tool `preview_start` with config `oil-iron-preview`, port 8123). Then drive the endpoints from the page context with `preview_eval`:
```js
await fetch("/api/game/IRON42/join", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Ana" }),
}).then((r) => r.json());
```
Expected: `{ side: "a", version: 1, state: { code: "IRON42", … } }`.

Then:
```js
await fetch("/api/game/IRON42/command", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ cmd: { verb: "add", attrs: { name: "Warden", class: "heavy", owner: "a" } } }),
}).then((r) => r.json());
```
Expected: `version: 2`, `state.rigs[0].name === "Warden"`, `state.rigs[0].owner === "a"`.

Then `GET`:
```js
await fetch("/api/game/IRON42").then((r) => r.json());
```
Expected: `version: 2` with the Warden rig present. Confirm `data/rooms.json` now exists via `preview_logs` (no error) — persistence happened.

- [ ] **Step 7: Commit**

```bash
git add server.js
git commit -m "feat: room join/get/command routes + room-aware chat"
```

---

## Task 6: Client join gate (`index.html`)

**Files:**
- Modify: `index.html` (add join-overlay markup + CSS + logic; identity in `localStorage`)

- [ ] **Step 1: Add the join-overlay markup**

In `index.html`, immediately after the opening `<body>` tag (line ~382), add:
```html
<div id="joinGate" class="join-gate">
  <div class="join-card">
    <h1 class="join-title">OIL <i>&amp;</i> IRON</h1>
    <p class="join-sub">Enter a battle room</p>
    <input id="joinRoom" class="join-input" placeholder="Room code (e.g. IRON42)" autocomplete="off" />
    <input id="joinName" class="join-input" placeholder="Your name" autocomplete="off" />
    <div class="join-sides">
      <button class="join-side" data-side="a" type="button">You (Side A)</button>
      <button class="join-side" data-side="b" type="button">Enemy (Side B)</button>
    </div>
    <button id="joinBtn" class="join-btn" type="button">Enter room</button>
    <p id="joinErr" class="join-err"></p>
  </div>
</div>
```

- [ ] **Step 2: Add the join-overlay CSS**

In `index.html`, inside `<style>` just before the closing `</style>` (line ~380), add:
```css
  .join-gate {
    position: fixed; inset: 0; z-index: 80; display: flex;
    align-items: center; justify-content: center; padding: 1.2rem;
    background: radial-gradient(120% 78% at 50% -12%, rgba(231,154,61,.12), transparent 58%), var(--iron-950);
  }
  .join-gate.hidden { display: none; }
  .join-card {
    width: min(360px, 100%); display: flex; flex-direction: column; gap: .7rem;
    background: linear-gradient(180deg, var(--iron-850), var(--iron-900));
    border: 1px solid var(--line); border-radius: 16px; padding: 1.4rem 1.2rem;
    box-shadow: 0 24px 70px rgba(0,0,0,.6);
  }
  .join-title { margin: 0; text-align: center; letter-spacing: .14em; font-size: 1.3rem; }
  .join-title i { color: var(--oil); font-style: normal; }
  .join-sub { margin: 0 0 .3rem; text-align: center; color: var(--txt-dim); font-size: .8rem; }
  .join-input {
    background: var(--iron-950); color: var(--txt); border: 1px solid var(--line);
    border-radius: 10px; padding: .65rem .8rem; font-family: var(--font-display); font-size: 1rem;
  }
  .join-input:focus { outline: none; border-color: var(--oil); box-shadow: 0 0 0 1px var(--oil); }
  .join-sides { display: flex; gap: .5rem; }
  .join-side {
    flex: 1; background: var(--iron-800); color: var(--txt-dim); border: 1px solid var(--line);
    border-radius: 10px; padding: .55rem; font-family: var(--font-display); font-size: .82rem;
  }
  .join-side.active {
    background: linear-gradient(180deg, rgba(231,154,61,.22), rgba(231,154,61,.09));
    border-color: var(--oil); color: var(--oil-hi);
  }
  .join-btn {
    background: linear-gradient(180deg, var(--oil-hi), var(--oil)); color: #241606;
    font-weight: 700; border-radius: 10px; padding: .7rem; font-size: .95rem; letter-spacing: .06em;
  }
  .join-err { min-height: 1rem; margin: 0; color: var(--ember-hi); font-size: .78rem; text-align: center; }
```

- [ ] **Step 3: Add the join logic**

In `index.html`, inside the main `<script>` IIFE, immediately after the `let isStreaming = false;` line (~457), add:
```js
  // ===== Session identity (room + side) =====
  const SESSION_KEY = "ooi-session-v1";
  let session = null;                 // { room, side, name }
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { session = null; }

  const joinGate = document.getElementById("joinGate");
  const joinRoom = document.getElementById("joinRoom");
  const joinName = document.getElementById("joinName");
  const joinBtn = document.getElementById("joinBtn");
  const joinErr = document.getElementById("joinErr");
  let chosenSide = null;

  document.querySelectorAll(".join-side").forEach((b) => {
    b.addEventListener("click", () => {
      chosenSide = b.dataset.side;
      document.querySelectorAll(".join-side").forEach((x) => x.classList.toggle("active", x === b));
    });
  });

  async function joinRoomFlow(room, name, side) {
    const resp = await fetch(`/api/game/${encodeURIComponent(room)}/join`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, side }),
    });
    if (!resp.ok) throw new Error(`join failed (${resp.status})`);
    const data = await resp.json();
    if (!data.side) throw new Error("Room is full.");
    session = { room, side: data.side, name };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    applyServerState(data.state);       // defined in Task 7
    joinGate.classList.add("hidden");
    startPolling();                      // defined in Task 7
  }

  joinBtn.addEventListener("click", async () => {
    const room = joinRoom.value.trim().toUpperCase();
    const name = joinName.value.trim() || "Player";
    joinErr.textContent = "";
    if (!room) { joinErr.textContent = "Enter a room code."; return; }
    try { await joinRoomFlow(room, name, chosenSide); }
    catch (e) { joinErr.textContent = e.message; }
  });
```

- [ ] **Step 4: Auto-rejoin on load / show the gate**

In `index.html`, replace the final three lines of the IIFE:
```js
  loadRigs();
  renderRigs();

  addBubble("bot", "Ask me anything about the Of Oil and Iron rulebook — by text or by tapping the mic. Tap 🛠 Rigs to track your squadron's condition; I can update it when you narrate hits, repairs, or heat.");
```
with:
```js
  addBubble("bot", "Ask me anything about the Of Oil and Iron rulebook — by text or by tapping the mic. Tap 🛠 Rigs to see your squadron and the enemy's.");

  if (session?.room) {
    joinRoomFlow(session.room, session.name, session.side)
      .catch(() => { joinGate.classList.remove("hidden"); });
  } else {
    joinGate.classList.remove("hidden");
  }
```
(Note: `loadRigs()` / `renderRigs()` from `localStorage` are removed here — Task 7 replaces the Rig data source with server state.)

- [ ] **Step 5: Verify the gate renders**

With the server running (`preview_start` → `oil-iron-preview`), reload the page (`preview_eval`: `location.reload()`), then `preview_snapshot`.
Expected: the join gate is visible with room/name inputs and two side buttons; the terminal behind it is covered. (It will not yet advance — `applyServerState`/`startPolling` land in Task 7. Confirm no console errors other than those two being undefined, which Task 7 resolves.)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: room join gate with persisted session identity"
```

---

## Task 7: Client polling + server-state rendering (`index.html`)

**Files:**
- Modify: `index.html` (replace `localStorage` rig source with server state; add polling; rewrite `rigSnapshot`)

- [ ] **Step 1: Replace the rig persistence helpers with server state**

In `index.html`, replace the block from `const RIG_STORE_KEY = "ooi-rigs-v1";` through the end of `saveRigs()` (lines ~481–493) with:
```js
  let rigs = [];          // mirror of server state.rigs
  let game = null;        // mirror of server state.game
  let stateVersion = -1;  // last version we rendered

  function applyServerState(state) {
    if (!state) return;
    rigs = Array.isArray(state.rigs) ? state.rigs : [];
    game = state.game || null;
    stateVersion = state.version ?? stateVersion;
    renderRigs();
  }
```

- [ ] **Step 2: Delete the now-dead local mutation helpers**

Remove these functions from `index.html` (they now live on the server): `makeRig`, `engineHeatFloor`, `recompute`, `damageRig`, `repairRig`, `setRigSp`, `heatRig`, `loadRigs` (lines ~501–566 plus the `loadRigs` definition). Keep `findRig` (still used for rendering lookups) — it already reads the `rigs` mirror. Keep `LOCS` (used by the `renderRigs` component loop). Remove `RIG_DEFAULTS` too — the server now computes SP, so the client no longer needs it.

- [ ] **Step 3: Rewrite `rigSnapshot` → nothing; chat sends the room**

Remove the `rigSnapshot()` function (lines ~618–624). In `sendMessage`, replace the fetch body:
```js
        body: JSON.stringify({ messages: history, think: thinkEnabled, rigs: rigSnapshot() }),
```
with:
```js
        body: JSON.stringify({ messages: history, think: thinkEnabled, room: session?.room }),
```

- [ ] **Step 4: Add the polling loop**

In `index.html`, immediately after `applyServerState` (from Step 1), add:
```js
  let pollTimer = null;

  async function pollOnce() {
    if (!session?.room) return;
    try {
      const resp = await fetch(`/api/game/${encodeURIComponent(session.room)}`);
      if (!resp.ok) return;
      const { version, state } = await resp.json();
      if (version !== stateVersion) applyServerState(state);   // re-render only on change
    } catch { /* transient network error; next tick retries */ }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollOnce();
    pollTimer = setInterval(pollOnce, 3000);
  }
```

- [ ] **Step 5: Verify polling reflects an external change**

Server running, join as Ana (room IRON42) through the UI. Then from `preview_eval` simulate the *other* player adding a rig via the command endpoint:
```js
await fetch("/api/game/IRON42/command", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ cmd: { verb: "add", attrs: { name: "Reaver", class: "medium", owner: "b" } } }),
}).then((r) => r.json());
```
Wait ~3s, then `preview_snapshot`.
Expected: a "Reaver" card appears in the tracker without a reload (the poll picked up the version bump).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: client polls server state every 3s and renders it"
```

---

## Task 8: Client command sender — rewire manual buttons + Gemma tags (`index.html`)

**Files:**
- Modify: `index.html` (`sendCommand`; `applyRigCommands`; component `−/＋`, heat, remove, add-form handlers)

- [ ] **Step 1: Add the command sender**

In `index.html`, immediately after `startPolling` (Task 7), add:
```js
  // POST one mutation to the server, then adopt the authoritative result.
  async function sendCommand(verb, attrs) {
    if (!session?.room) return;
    try {
      const resp = await fetch(`/api/game/${encodeURIComponent(session.room)}/command`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: { verb, attrs } }),
      });
      if (!resp.ok) return;
      const { version, state } = await resp.json();
      if (version !== stateVersion) applyServerState(state);
    } catch { /* next poll will reconcile */ }
  }
```

- [ ] **Step 2: Route Gemma's tags through the server**

In `index.html`, replace the whole `applyRigCommands` function (lines ~580–606) with a parser that emits commands instead of mutating locally:
```js
  // Parse every [[RIG ...]] command out of `text` and POST each to the server.
  function applyRigCommands(text) {
    RIG_TAG_RE.lastIndex = 0;
    let match;
    while ((match = RIG_TAG_RE.exec(text))) {
      const body = match[1].trim();
      const verb = (body.split(/\s+/)[0] || "").toLowerCase();
      const a = parseAttrs(body);   // { name, loc, amount, ... } — verb word is not an attr
      sendCommand(verb, a);
    }
  }
```
(`parseAttrs` and `RIG_TAG_RE` are unchanged and still defined above this.)

- [ ] **Step 3: Rewire the component damage/repair buttons**

In `compRow`, replace the two click handlers:
```js
    minus.addEventListener("click", () => { damageRig(rig, loc, 1); saveRigs(); renderRigs(); });
```
→
```js
    minus.addEventListener("click", () => sendCommand("damage", { name: rig.name, loc, amount: "1" }));
```
and
```js
    plus.addEventListener("click", () => { repairRig(rig, loc, 1); saveRigs(); renderRigs(); });
```
→
```js
    plus.addEventListener("click", () => sendCommand("repair", { name: rig.name, loc, amount: "1" }));
```

- [ ] **Step 4: Rewire the heat buttons**

In `compRow` (engine branch), replace:
```js
      hMinus.addEventListener("click", () => { heatRig(rig, "-1"); saveRigs(); renderRigs(); });
```
→
```js
      hMinus.addEventListener("click", () => sendCommand("heat", { name: rig.name, amount: "-1" }));
```
and
```js
      hPlus.addEventListener("click", () => { heatRig(rig, "+1"); saveRigs(); renderRigs(); });
```
→
```js
      hPlus.addEventListener("click", () => sendCommand("heat", { name: rig.name, amount: "+1" }));
```

- [ ] **Step 5: Rewire the card remove button and the add form**

In `renderRigs`, replace the remove handler:
```js
      rm.addEventListener("click", () => { rigs = rigs.filter((r) => r !== rig); saveRigs(); renderRigs(); });
```
→
```js
      rm.addEventListener("click", () => sendCommand("remove", { name: rig.name }));
```
Then replace `addRigFromForm` (lines ~746–754) with:
```js
  function addRigFromForm() {
    const name = rigNameInput.value.trim();
    if (!name) { rigNameInput.focus(); return; }
    if (findRig(name)) { setStatus(`A rig named “${name}” already exists.`); return; }
    sendCommand("add", { name, class: rigClassSelect.value, owner: session?.side || "a" });
    rigNameInput.value = "";
  }
```

- [ ] **Step 6: Verify a manual edit round-trips through the server**

Server running, joined as Ana. Add a rig "Warden" (heavy) via the form, then click Hull `−` twice. `preview_snapshot`.
Expected: Warden's Hull reads `6/8` (server applied two damage commands). Reload the page — Warden persists at `6/8` (state is server-side now, not `localStorage`). Check `preview_network` shows `POST /api/game/IRON42/command` calls returning 200.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: route manual edits and Gemma tags through server commands"
```

---

## Task 9: Ownership rendering — Your Squadron vs Enemy (`index.html`)

**Files:**
- Modify: `index.html` (`renderRigs` grouping + owner badge; add-form owner selector)

- [ ] **Step 1: Add an owner selector to the manual add form**

In `index.html`, in the `.rig-add` block (line ~422), add an owner `<select>` right before the add button:
```html
    <select id="rigOwner" aria-label="New rig side">
      <option value="a">You</option>
      <option value="b">Enemy</option>
    </select>
```
and grab it in the element refs near the top of the IIFE (after `rigClassSelect`):
```js
  const rigOwnerSelect = document.getElementById("rigOwner");
```
Then in `addRigFromForm`, use it instead of always the player's side:
```js
    sendCommand("add", { name, class: rigClassSelect.value, owner: rigOwnerSelect.value });
```

- [ ] **Step 2: Group the Rig list by ownership**

In `index.html`, replace the body of `renderRigs` after the empty-state check (the `for (const rig of rigs) { … }` loop, lines ~712–743) with a grouped render:
```js
    const mySide = session?.side || "a";
    const groups = [
      { side: mySide, label: "Your Squadron" },
      { side: mySide === "a" ? "b" : "a", label: "Enemy" },
    ];
    for (const grp of groups) {
      const owned = rigs.filter((r) => (r.owner || "a") === grp.side);
      if (owned.length === 0) continue;
      const heading = document.createElement("div");
      heading.className = "rig-group-head";
      heading.textContent = grp.label;
      rigList.appendChild(heading);
      for (const rig of owned) rigList.appendChild(renderRigCard(rig));
    }
```
Then extract the existing per-card DOM building (the code that built `card`, `head`, bars, etc.) into a new function `renderRigCard(rig)` that returns the `card` element. Keep all its internals identical — only its wrapper changes from inline loop to a function returning `card`.

- [ ] **Step 3: Add the group-heading CSS**

In `index.html` `<style>`, before `</style>`, add:
```css
  .rig-group-head {
    font-family: var(--font-mono); font-size: .62rem; letter-spacing: .14em;
    text-transform: uppercase; color: var(--txt-faint); margin: .3rem .1rem -.1rem;
  }
```

- [ ] **Step 4: Verify the split view**

Server running, joined as Ana (side **a**). Add "Warden" owner You, and "Reaver" owner Enemy via the form. `preview_snapshot`.
Expected: a "Your Squadron" heading with Warden, and an "Enemy" heading with Reaver. Then open a second browser context / `preview_eval` join as side **b** in the same room and confirm the labels flip (b sees Reaver as "Your Squadron").

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: split tracker into Your Squadron vs Enemy by owner"
```

---

## Task 10: End-to-end verification + docs

**Files:**
- Modify: `README.md` (document rooms + multiplayer)

- [ ] **Step 1: Full-suite green**

Run: `npm test`
Expected: PASS, 0 failures across `game-state.test.js` and `store.test.js`.

- [ ] **Step 2: Two-client manual smoke test**

With the server running: in browser context A join room `IRON42` as side **a** (Ana); in a second context B (`preview_eval` from a second tab, or a second `fetch` sequence) join `IRON42` as side **b** (Bo). From A, add Warden (You) and damage its hull. Within 3s, B's poll should show Warden under **Enemy** at reduced hull. From B, add Reaver (You from B's view = side b). Within 3s, A shows Reaver under **Enemy**.
Expected: both clients converge on identical state within one poll interval; `data/rooms.json` reflects both rigs.

- [ ] **Step 3: Restart durability**

Stop the server (`preview_stop`), restart (`preview_start`). Reload A. 
Expected: Warden + Reaver still present with the same SP — state survived restart via `data/rooms.json`.

- [ ] **Step 4: Update the README**

In `README.md`, under "## Usage", add a subsection:
```markdown
### Multiplayer rooms

Two players share a battle by entering the **same room code** on the join screen
and picking opposite sides (You / Enemy). State lives on the server (in
`data/rooms.json`), and each browser polls `GET /api/game/<room>` every 3 seconds,
so both see the same Rigs — yours and the enemy's — updating live. Every change
(a manual tap or one narrated through Gemma) is sent to the server as a command,
so the two clients never overwrite each other.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document multiplayer rooms and polling"
```

---

## Self-Review notes (author)

- **Spec coverage:** rooms + join/poll/command endpoints (Tasks 5–7), `data/rooms.json` durability (Task 4, verified Task 10.3), Rig math moved server-side (Tasks 2, 8), ownership + yours/enemy render (Task 9), `/api/chat` room injection (Task 5.4). Weapons / Prepare / Round / Recovery / VP are explicitly deferred to Phases 2–5 (spec §Implementation phases).
- **Deferred fields present but inert:** `weapons`, `prepare`, `game.round`, `sides[].vp`, `game.objectives` are initialized so Phases 2–5 add behavior without a state migration.
- **Naming consistency:** `applyServerState`, `sendCommand`, `pollOnce`, `startPolling`, `renderRigCard`, `session`, `stateVersion` are defined once and referenced consistently across Tasks 6–9.
