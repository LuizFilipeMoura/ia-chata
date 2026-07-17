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
  // chassis gate; the sides[i].bot flag is a lobby field set here directly).
  // Side A's ready over HTTP now auto-readies the bot opponent (B) and starts the
  // match in one step; the route's driveBots hook then plays BOTH bot sides to a
  // terminal state before the response is sent.
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
  // Side A's ready over HTTP now auto-readies the bot opponent (B) and starts the
  // match in one step; the route's driveBots hook then plays BOTH bot sides out.
  const res = await post("/api/game/BOTHOOK/command", { cmd: { verb: "ready", attrs: {} }, side: "a" });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.state.game.outcome != null || body.state.game.round > 1,
    `driveBots did not advance the bot game: phase ${body.state.game.phase}, round ${body.state.game.round}`);
});

test("a human starts a match against a bot over HTTP and the bot plays out", async () => {
  const room = store.getOrCreateRoom("VSBOTHTTP");
  room.mode = "digital";
  claimSide(room, { name: "Human", side: "a" });
  claimSide(room, { name: "Bot", side: "b" });
  // Human commissions two distinct-chassis rigs directly (add stamps chassis).
  const light = CHASSIS.filter((c) => c.class === "light");
  for (let i = 0; i < 2; i++) {
    const pb = light[i];
    applyCommand(room, { verb: "add", attrs: {
      name: `H${i + 1}`, owner: "a", class: pb.class,
      longRange: pb.longRange, melee: pb.melee, chassis: pb.id, sp: pb.sp,
    } }, { side: "a" });
  }
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });

  // Flag the opponent as a bot over HTTP, then ready over HTTP.
  const flag = await post("/api/game/VSBOTHTTP/command", { cmd: { verb: "setbot", attrs: { side: "b", preset: "aggressive" } }, side: "a" });
  assert.equal(flag.status, 200);

  const res = await post("/api/game/VSBOTHTTP/command", { cmd: { verb: "ready", attrs: {} }, side: "a" });
  const body = await res.json();
  assert.equal(res.status, 200);

  // The bot side was filled to mirror the human (2 light rigs) and the game started.
  const botRigs = body.state.rigs.filter((r) => (r.owner || "a") === "b");
  assert.equal(botRigs.length, 2);
  assert.equal(body.state.game.started, true);
  // The human readied first, so side a is the SECOND activator and holds the
  // opening Answer token. driveBots correctly stalls at that human-owned gate — no
  // bot has activated yet. This documents why the next step is needed.
  assert.equal(body.state.game.pendingAnswer?.side, "a");
  assert.ok(body.state.rigs.filter((r) => (r.owner || "a") === "b").every((r) => !r.activated),
    "the bot must not have activated while the human still owes the opening Answer");

  // Human resolves the opening Answer over HTTP (brace on one of their rigs). That
  // clears the gate, and the same POST's driveBots hook plays out the bot's first
  // activation before the response returns.
  const ans = await post("/api/game/VSBOTHTTP/command", { cmd: { verb: "answer", attrs: { name: "H1", prep: "brace", side: "a" } }, side: "a" });
  const played = await ans.json();
  assert.equal(ans.status, 200);
  assert.equal(played.state.game.pendingAnswer, null);
  // Concrete proof the bot acted: side b (the first activator) has activated a rig.
  const botPlayed = played.state.rigs.filter((r) => (r.owner || "a") === "b");
  assert.ok(botPlayed.some((r) => r.activated === true),
    `expected the bot to have activated a rig: turn ${played.state.game.turn?.side}, round ${played.state.game.round}`);
});

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
