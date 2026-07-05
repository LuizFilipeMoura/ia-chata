# Realtime Socket Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client's 3-second `GET /api/game/:room` poll with a server-pushed WebSocket, so room-state updates (damage, heat, recovery, joins, etc.) reach every connected player immediately instead of after up to 3s of poll lag.

**Architecture:** A `ws`-based hub (`server/ws.js`) tracks connected sockets grouped by room code and side. `server/index.js` attaches a `WebSocketServer` to the existing HTTP server at `/ws`. The two mutation routes (`/join`, `/command` in `server/routes/game.js`) call `hub.broadcast(room)` right after `store.persist()` — the exact point where `version` has already been bumped — so the hub is a pure notification fan-out with zero new mutation logic. The client (`public/js/api.js`) opens one `WebSocket` per session instead of polling, with reconnect-with-backoff on close; `public/js/join.js` starts it after a successful join.

**Tech Stack:** Node.js (`node:test`, `node:http`), Express, the `ws` npm package, vanilla browser `WebSocket` API (no client library).

Reference spec: [docs/superpowers/specs/2026-07-05-realtime-socket-sync-design.md](../specs/2026-07-05-realtime-socket-sync-design.md)

---

### Task 1: Add the `ws` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `ws`**

Run: `npm install ws`
Expected: `package.json`'s `dependencies` gains `"ws": "^8.x.x"` (exact version per npm's resolution) and `package-lock.json` updates.

- [ ] **Step 2: Verify it's importable**

Run: `node -e "import('ws').then(m => console.log(typeof m.WebSocketServer))"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add ws dependency for realtime socket sync"
```

---

### Task 2: `server/ws.js` — the room broadcast hub

**Files:**
- Create: `server/ws.js`
- Test: `server/ws.test.js`

- [ ] **Step 1: Write the failing tests**

Create `server/ws.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWsHub } from "./ws.js";
import { createRoom, applyCommand } from "../shared/game-state.js";

// Every Rig must be commissioned with one Long Range and one Melee weapon.
const W = { lr: "Mini Gun", melee: "Sword" };

function fakeSocket() {
  const handlers = {};
  return {
    readyState: 1, // WebSocket.OPEN
    sent: [],
    send(msg) { this.sent.push(JSON.parse(msg)); },
    on(event, cb) { handlers[event] = cb; },
    triggerClose() { handlers.close?.(); },
  };
}

test("broadcast sends the current version to every socket in the room", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  const a = fakeSocket();
  const b = fakeSocket();
  hub.attach(a, "IRON42", "a");
  hub.attach(b, "IRON42", "b");

  applyCommand(room, { verb: "add", attrs: { name: "Warden", class: "medium", owner: "a", ...W } });
  hub.broadcast(room);

  assert.equal(a.sent.length, 1);
  assert.equal(b.sent.length, 1);
  assert.equal(a.sent[0].version, room.version);
  assert.equal(b.sent[0].version, room.version);
});

test("broadcast scopes bounties per socket's side", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  const a = fakeSocket();
  const b = fakeSocket();
  hub.attach(a, "IRON42", "a");
  hub.attach(b, "IRON42", "b");

  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(room, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(room, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(room, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  hub.broadcast(room);

  assert.deepEqual(Object.keys(a.sent[0].state.game.bounties), ["a"]);
  assert.deepEqual(Object.keys(b.sent[0].state.game.bounties), ["b"]);
  assert.equal(a.sent[0].state.game.bounties.b, undefined);
  assert.equal(b.sent[0].state.game.bounties.a, undefined);
});

test("a closed socket is removed and receives no further broadcasts", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  const a = fakeSocket();
  hub.attach(a, "IRON42", "a");
  a.triggerClose();

  applyCommand(room, { verb: "add", attrs: { name: "Warden", class: "medium", owner: "a", ...W } });
  hub.broadcast(room);

  assert.equal(a.sent.length, 0);
});

test("a socket that is not OPEN is skipped", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  const a = fakeSocket();
  a.readyState = 0; // CONNECTING
  hub.attach(a, "IRON42", "a");

  hub.broadcast(room);

  assert.equal(a.sent.length, 0);
});

test("broadcasting to a room with no connected sockets is a no-op", () => {
  const hub = createWsHub();
  const room = createRoom("IRON42");
  assert.doesNotThrow(() => hub.broadcast(room));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/ws.test.js`
Expected: FAIL — `Cannot find module './ws.js'` (or similar "module not found")

- [ ] **Step 3: Implement `server/ws.js`**

```js
// Room broadcast hub: groups connected WebSocket clients by room code and
// pushes state deltas after every server-side mutation. One-way
// (server -> client) only — commands still arrive over HTTP POST in
// server/routes/game.js, which calls broadcast() after each mutation.
import { publicState } from "../shared/game-state.js";

const OPEN = 1; // WebSocket.OPEN, per the WHATWG WebSocket spec

export function createWsHub() {
  const clientsByRoom = new Map(); // room code -> Set<{ ws, side }>

  function attach(ws, room, side) {
    if (!clientsByRoom.has(room)) clientsByRoom.set(room, new Set());
    const client = { ws, side };
    clientsByRoom.get(room).add(client);
    ws.on("close", () => {
      const set = clientsByRoom.get(room);
      if (!set) return;
      set.delete(client);
      if (set.size === 0) clientsByRoom.delete(room);
    });
  }

  function broadcast(room) {
    const set = clientsByRoom.get(room.code);
    if (!set) return;
    for (const client of set) {
      if (client.ws.readyState !== OPEN) continue;
      client.ws.send(JSON.stringify({ version: room.version, state: publicState(room, client.side) }));
    }
  }

  return { attach, broadcast };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/ws.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add server/ws.js server/ws.test.js
git commit -m "feat: add WS room broadcast hub"
```

---

### Task 3: Attach the WebSocket server in `server/index.js`

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Wire `http.Server` + `WebSocketServer` + the hub**

Replace the full contents of `server/index.js` with:

```js
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { PORT, MODEL, NUM_CTX, OLLAMA_URL } from "./config.js";
import { createStore } from "./store.js";
import { loadRulebook } from "./prompt.js";
import { createChatRouter } from "./routes/chat.js";
import { createGameRouter } from "./routes/game.js";
import { createWsHub } from "./ws.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const store = createStore(path.join(rootDir, "data", "rooms.json"));
const hub = createWsHub();

const app = express();
app.use(express.json({ limit: "2mb" }));

// Only the client bundle is web-served. `/shared` exposes the pure game-logic
// module so the browser can import it (weapon lists, defaults) without a copy.
app.use(express.static(path.join(rootDir, "public")));
app.use("/shared", express.static(path.join(rootDir, "shared")));

app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "public", "index.html"));
});

app.use("/api", createChatRouter(store));
app.use("/api/game", createGameRouter(store, hub));

const httpServer = http.createServer(app);

// Push channel for room-state updates: a client connects to /ws?room=X&side=Y
// once (right after join, and on every reconnect); server/routes/game.js
// broadcasts the new state to every attached socket after each mutation.
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const room = url.searchParams.get("room");
  const side = url.searchParams.get("side");
  if (!room) { ws.close(); return; }
  hub.attach(ws, room, side);
});

async function start() {
  await loadRulebook(rootDir);
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Oil & Iron rules master listening on http://0.0.0.0:${PORT}`);
    console.log(`Model: ${MODEL} | num_ctx: ${NUM_CTX} | Ollama: ${OLLAMA_URL}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the existing test suite still passes**

Run: `npm test`
Expected: PASS — this task only touches `server/index.js`, which has no direct unit tests, so this confirms the rest of the suite (`shared/game-state.test.js`, `server/store.test.js`, `server/prompt.test.js`, `server/ws.test.js`) is unaffected.

- [ ] **Step 3: Manually verify the server boots and the socket path is live**

Run: `npm start` (leave running), then in a second terminal:

```bash
node -e "
import('ws').then(({ WebSocket }) => {
  const ws = new WebSocket('ws://localhost:8000/ws?room=SMOKE42&side=a');
  ws.on('open', () => console.log('OPEN'));
  ws.on('close', () => console.log('CLOSE'));
});
"
```

Expected: prints `OPEN` (`8000` is `server/config.js`'s default `PORT`; adjust if your `PORT` env var overrides it). Stop both processes (`Ctrl+C`) after confirming.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: attach WebSocket server for room-state push"
```

---

### Task 4: Broadcast from the game routes

**Files:**
- Modify: `server/routes/game.js`

- [ ] **Step 1: Accept the hub and broadcast after each mutation**

Replace the full contents of `server/routes/game.js` with:

```js
import { Router } from "express";
import { claimSide, applyCommand, publicState } from "../../shared/game-state.js";

// Routes mounted at /api/game. A room is the authoritative shared game;
// clients join over HTTP and receive state pushes over the WS hub after
// every mutation (see server/ws.js).
export function createGameRouter(store, hub) {
  const router = Router();

  router.post("/:room/join", (req, res) => {
    const room = store.getOrCreateRoom(req.params.room);
    const side = claimSide(room, { name: req.body?.name, side: req.body?.side });
    store.persist();
    hub.broadcast(room);
    res.json({ side, version: room.version, state: publicState(room, side) });
  });

  router.get("/:room", (req, res) => {
    const room = store.getRoom(req.params.room);
    if (!room) return res.status(404).json({ error: "no such room" });
    res.json({ version: room.version, state: publicState(room, req.query?.side) });
  });

  router.post("/:room/command", (req, res) => {
    const room = store.getRoom(req.params.room);
    if (!room) return res.status(404).json({ error: "no such room" });
    applyCommand(room, req.body?.cmd || {}, { side: req.body?.side });
    store.persist();
    hub.broadcast(room);
    res.json({ version: room.version, state: publicState(room, req.body?.side) });
  });

  return router;
}
```

Note: `GET /:room` is left in place unchanged — it's no longer polled by the client (Task 5 removes that), but keeping the route means a page load that hasn't opened its socket yet, or any future debugging, can still fetch state directly.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — no test directly exercises this router (consistent with the existing codebase, where `shared/game-state.js` carries the unit tests and routes stay thin), so this step is a regression guard on everything else.

- [ ] **Step 3: Commit**

```bash
git add server/routes/game.js
git commit -m "feat: broadcast room state after join/command mutations"
```

---

### Task 5: Client — replace polling with the socket

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/join.js`

- [ ] **Step 1: Replace `public/js/api.js`'s polling with a socket**

Replace the full contents of `public/js/api.js` with:

```js
import { S, applyServerState } from "./state.js";

// POST one mutation to the server, then adopt the authoritative result.
// The broadcast (see startSocket below) will deliver the same state to every
// connected client, including this one; applying the POST response directly
// just avoids a visible round-trip flicker on the sender's own action.
export async function sendCommand(verb, attrs) {
  if (!S.session?.room) return;
  try {
    const resp = await fetch(`/api/game/${encodeURIComponent(S.session.room)}/command`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd: { verb, attrs }, side: S.session?.side }),
    });
    if (!resp.ok) return;
    const { version, state } = await resp.json();
    if (version !== S.stateVersion) applyServerState(state);
  } catch { /* the socket will deliver the eventual state */ }
}

let socket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 5000;

function socketUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ room: S.session.room });
  if (S.session?.side) params.set("side", S.session.side);
  return `${proto}//${location.host}/ws?${params.toString()}`;
}

// Opens the room's push channel. Reconnects with backoff (1s, 2s, 4s, capped
// at 5s) on close; no polling fallback (see design doc's Scope decisions).
export function startSocket() {
  if (!S.session?.room) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  socket = new WebSocket(socketUrl());

  socket.onopen = () => { reconnectDelay = 1000; };

  socket.onmessage = (event) => {
    const { version, state } = JSON.parse(event.data);
    if (version !== S.stateVersion) applyServerState(state);
  };

  socket.onclose = () => {
    reconnectTimer = setTimeout(startSocket, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  };

  socket.onerror = () => socket.close();
}
```

- [ ] **Step 2: Point `public/js/join.js` at the socket instead of the poll**

In `public/js/join.js`, change the import on line 2:

```js
import { startSocket } from "./api.js";
```

And change the call at line 33 (inside `joinRoomFlow`):

```js
  startSocket();
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — these are browser modules with no Node-side unit tests (consistent with the rest of `public/js/`); this step just guards that nothing server-side broke.

- [ ] **Step 4: Commit**

```bash
git add public/js/api.js public/js/join.js
git commit -m "feat: replace 3s poll with WebSocket push on the client"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the app**

Run: `npm start`

- [ ] **Step 2: Two-tab realtime sync**

Open the app in two browser tabs. Join the same room code in both, one as side A and one as side B (use the join gate's side picker). In tab A, trigger a command that changes state (e.g. damage a Rig, or tap the Recovery Phase button once both sides have added rigs and are ready). Confirm tab B's Rig panel / Battle section updates within roughly the network's round-trip time — no more up-to-3-second delay.

- [ ] **Step 3: Reconnect after a server restart**

With both tabs still open and joined, stop the server (`Ctrl+C`) and start it again (`npm start`). Within a few seconds, trigger another command in tab A. Confirm both tabs recover: tab A's command succeeds, and tab B receives the update over its reconnected socket without a manual page refresh.

- [ ] **Step 4: Confirm no console errors**

Check the browser devtools console in both tabs during the above steps. Expected: no uncaught exceptions; WebSocket close/reopen during the restart step is expected and not an error.

No commit for this task — it's verification only. If any step fails, return to the relevant task above, fix, and re-run this task's checklist from Step 1.
