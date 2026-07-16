import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createStore } from "../store.js";
import { createGameRouter } from "./game.js";
import { CHASSIS, claimSide, applyCommand } from "../../shared/game-state.js";

// Two real catalogue chassis — HTTP adds go through enforceChassis, which only
// admits canonical loadouts.
const CH = CHASSIS[0];

// Spin up the real router on an ephemeral port with an in-memory store and a
// no-op hub, so the command/check endpoints are exercised end-to-end over HTTP.
function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "route-")), "rooms.json");
}

let server;
let base;
let store;

before(async () => {
  store = createStore(tmpFile());
  const hub = { broadcast() {}, sendState() {} };
  const app = express();
  app.use(express.json());
  app.use("/api/game", createGameRouter(store, hub));
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => new Promise((resolve) => server.close(resolve)));

const post = (url, body) =>
  fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// Drive a room to the point where side A has an active rig mid-activation.
async function seedActivation(code) {
  store.getOrCreateRoom(code);
  await post(`/api/game/${code}/join`, { name: "A", side: "a" });
  await post(`/api/game/${code}/join`, { name: "B", side: "b" });
  await post(`/api/game/${code}/command`, { cmd: { verb: "add", attrs: { name: "Atk", kind: "rig", owner: "a", chassis: CH.id } }, side: "a" });
  await post(`/api/game/${code}/command`, { cmd: { verb: "add", attrs: { name: "Def", kind: "rig", owner: "b", chassis: CH.id } }, side: "b" });
  // Force the turn state directly on the stored room (bypasses the full field/ready flow).
  const room = store.getRoom(code);
  const atk = room.rigs.find((r) => r.name === "Atk");
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: atk.id, actionsUsed: 0, actionsMax: 3, longRangeShots: 0 };
  atk.loaded = { longRange: true, melee: true };
}

test("POST /command applies a legal command with 200", async () => {
  await seedActivation("RTOK");
  const res = await post("/api/game/RTOK/command", { cmd: { verb: "action", attrs: { name: "Atk", action: "move" } }, side: "a" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.version >= 0);
});

test("POST /command returns 409 with a reason when the command isn't applied", async () => {
  await seedActivation("R409");
  // Def is not the active unit — the action is a no-op and must be rejected.
  const res = await post("/api/game/R409/command", { cmd: { verb: "action", attrs: { name: "Def", action: "move" } }, side: "a" });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "command not applied");
  assert.match(body.reason, /active unit/i);
  assert.ok(body.state, "409 body still carries the current state");
});

test("POST /command 409 leaves the room version untouched", async () => {
  await seedActivation("RVER");
  const first = await (await post("/api/game/RVER/command", { cmd: { verb: "action", attrs: { name: "Atk", action: "move" } }, side: "a" })).json();
  const rejected = await post("/api/game/RVER/command", { cmd: { verb: "action", attrs: { name: "Ghost", action: "move" } }, side: "a" });
  assert.equal(rejected.status, 409);
  const after = store.getRoom("RVER").version;
  assert.equal(after, first.version); // the rejected command bumped nothing
});

test("POST /command/check approves a legal command without mutating", async () => {
  await seedActivation("RCHK");
  const before = store.getRoom("RCHK").version;
  const res = await post("/api/game/RCHK/command/check", { cmd: { verb: "action", attrs: { name: "Atk", action: "move" } }, side: "a" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.reason, null);
  assert.equal(store.getRoom("RCHK").version, before); // dry-run only
});

test("POST /command/check rejects with a reason before the action is taken", async () => {
  await seedActivation("RCHKX");
  const res = await post("/api/game/RCHKX/command/check", { cmd: { verb: "action", attrs: { name: "Def", action: "move" } }, side: "a" });
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.reason, /active unit/i);
});

test("POST /command/check surfaces an enforceChassis rejection as ok:false", async () => {
  store.getOrCreateRoom("RCHASS");
  const res = await post("/api/game/RCHASS/command/check", { cmd: { verb: "add", attrs: { name: "X", kind: "rig", class: "light", lr: "Autocannon", melee: "Sword" } }, side: "a" });
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.ok(body.reason);
});

test("POST /command on an unknown room is 404", async () => {
  const res = await post("/api/game/NOPE/command", { cmd: { verb: "action", attrs: { name: "Atk", action: "move" } }, side: "a" });
  assert.equal(res.status, 404);
});

test("a bot side plays itself out after a human command (driveBots hook)", async () => {
  // Build a digital bot-vs-bot room directly in the store (adds bypass the HTTP
  // chassis gate; the sides[i].bot flag has no command verb yet — it is a lobby
  // field set here directly). Ready side A directly, then POST side B's ready:
  // that command starts the game, and the route's driveBots hook plays BOTH bot
  // sides to a terminal state before the response is sent.
  const room = store.getOrCreateRoom("BOTHOOK");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 2; i++) {
      applyCommand(room, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, longRange: "Autocannon", melee: "Claw" } });
    }
  }
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  room.game.sides[0].bot = "aggressive";
  room.game.sides[1].bot = "cagey";
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "a" });
  const res = await post("/api/game/BOTHOOK/command", { cmd: { verb: "ready", attrs: {} }, side: "b" });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.state.game.outcome != null || body.state.game.round > 1,
    `driveBots did not advance the bot game: phase ${body.state.game.phase}, round ${body.state.game.round}`);
});
