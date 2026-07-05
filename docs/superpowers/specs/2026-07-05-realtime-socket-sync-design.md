# Realtime Socket Sync — Design

Date: 2026-07-05

Supersedes the polling section of
[2026-07-04-battle-state-tracker-design.md](2026-07-04-battle-state-tracker-design.md)
(that doc's "Non-goals" explicitly chose polling over sockets; this design
reverses that choice).

## Motivation
The shared-state foundation (phase 1 of the battle-state-tracker design) syncs
two players' rooms via a 3-second `GET /api/game/:room` poll. That means up to
3s of latency before one player sees the other's move, and constant polling
traffic even when nothing changed. Replacing the poll with a push channel
(WebSocket) delivers updates immediately and removes the idle poll traffic.

## Scope decisions (agreed)
- **`ws` package**, not Socket.IO — the browser's native `WebSocket` API is
  enough for a single push channel; no client bundle needed, fits the
  project's minimal-dependency style (currently only `express`).
- **Only state delivery moves to the socket.** `POST /:room/join` and
  `POST /:room/command` stay HTTP POST exactly as today. The socket is a
  one-way (server→client) push of `{version, state}`, not a general RPC
  channel.
- **Broadcast is per-socket, not shared.** `publicState(room, side)` redacts
  bounty data per side, so the server computes and sends a state payload
  scoped to each socket's own `side`, not one shared JSON blob.
- **Reconnect with backoff, no polling fallback.** On socket close, the client
  retries (1s, 2s, 5s, capped) until it reconnects; there is no secondary
  slow-poll safety net.

## Non-goals
- General bidirectional RPC over the socket (commands stay HTTP POST).
- Multiple app server processes / horizontal scaling (the client set lives in
  one process's memory, same assumption the in-memory room store already
  makes).
- Presence indicators ("Enemy is online") — out of scope, not requested.
- Changing the command/tag protocol, room/session model, or `data/rooms.json`
  durability — untouched by this change.

## Architecture
**One WebSocket server, same HTTP server, same port.** `server/index.js`
attaches a `WebSocketServer` to the existing `http.Server` at path `/ws`;
`app.listen` continues to serve HTTP and static files as today.

**Client identifies itself via the connection URL.** A client connects to
`/ws?room=IRON42&side=a` once it has joined (i.e. right after `/join`
succeeds, and on every reconnect using the session already in `localStorage`).
No handshake message is needed — query params carry `room` and `side`.

**Server groups sockets by room.** A new module, `server/ws.js`, exports
`createWsHub()`:
- `attach(ws, room, side)` — adds `{ws, side}` to `Map<room, Set<{ws, side}>>`;
  removes it on the socket's `close` event.
- `broadcast(room)` — looks up the room's connected clients (if any; a room
  with no sockets is a no-op), and for each sends
  `JSON.stringify({ version: room.version, state: publicState(room, client.side) })`.

**Broadcast fires after every state-changing HTTP request.** In
`server/routes/game.js`, both the `/join` and `/command` handlers call
`hub.broadcast(room.code)` immediately after `store.persist()` — the same
point where `version` has already been bumped. This reuses 100% of the
existing command/mutation logic; the hub is purely an additional notification
fan-out, not a new mutation path.

## Server changes
- Add `ws` to `package.json` dependencies.
- `server/index.js`: create the raw `http.Server` explicitly (`http.createServer(app)`)
  so a `WebSocketServer` can attach to it at `{ server, path: "/ws" }`; parse
  `room`/`side` from the upgrade request's query string in the `connection`
  handler and call `hub.attach(ws, room, side)`. Reject (close) the connection
  if `room` is missing from the query string.
- `server/ws.js` (new): `createWsHub()` as described above.
- `server/routes/game.js`: `createGameRouter(store, hub)` gains a `hub`
  parameter; `/join` and `/command` call `hub.broadcast(room.code)` after
  `store.persist()`.

## Client changes
- `public/js/api.js`: remove `pollOnce`/`startPolling`/`pollTimer`. Add
  `startSocket()`:
  - Builds the URL from `S.session.room`/`S.session.side`, opens a
    `WebSocket`.
  - `onmessage`: `JSON.parse` the payload; if `version !== S.stateVersion`,
    call `applyServerState(state)` (same gate as the old poll had).
  - `onclose`/`onerror`: schedule a reconnect via `setTimeout` with backoff
    (1s → 2s → 5s, then hold at 5s) that calls `startSocket()` again; reset
    the backoff counter on a successful `onopen`.
  - `sendCommand` is unchanged (`POST /command`) except it no longer needs to
    apply the POST response's `state` as the primary update path — the
    broadcast will deliver it — but it still applies it as an immediate local
    update since the POST response is guaranteed to be at least as fresh as
    that request, avoiding a visible round-trip flicker on the sender's own
    action.
- `public/js/join.js`: `joinRoomFlow` calls `startSocket()` instead of
  `startPolling()` after a successful join (same call site).
- `public/js/state.js`: unchanged — `applyServerState` is transport-agnostic.

## Error handling
- **Room doesn't exist yet at connect time:** the WS `connection` handler
  looks up the room; if missing, it still attaches the socket (a `join` almost
  always precedes the socket open per the join flow, but a lookup miss is not
  fatal — the socket just receives no broadcast until a command targets that
  room). This matches how `GET /:room` today 404s only for the initial poll,
  not an ongoing one.
- **Server restart:** all sockets drop; each client's reconnect loop
  reconnects and the very next broadcast (or, if none happens immediately,
  the client simply waits for one) carries current state — no explicit
  "resync" request is needed because the client already holds the
  last-known state and only needs the *next* change, and a fresh `join`-driven
  page load already re-fetches via `/join`'s response.
- **Command POST fails (network error):** unchanged from today — `sendCommand`
  already swallows the error and relies on the next state delivery (formerly
  poll, now broadcast) to reconcile.

## Testing
- **Server unit test** (extends `shared/game-state.test.js` or a new
  `server/ws.test.js`): two fake `ws`-like sockets (objects with a `send` spy)
  attached to the same room both receive a `broadcast` call with a JSON
  payload; a third socket attached with a different `side` receives a payload
  whose `bounties` differ from the other two, confirming per-side scoping.
- **Manual:** two browser tabs joined to the same room — a damage command in
  tab A appears in tab B without a perceptible delay (vs. the old up-to-3s
  poll lag); stopping and restarting the server reconnects both tabs and
  resyncs state once the next command fires.
