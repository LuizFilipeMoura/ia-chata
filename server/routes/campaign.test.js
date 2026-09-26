import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createStore } from "../store.js";
import { createCampaignStore } from "../campaign-store.js";
import { createCampaignRouter } from "./campaign.js";
import { driveBots } from "../../shared/bot/index.js";
import { STARTING } from "../../shared/campaign/index.js";

let server, base, rooms, campaignFile;

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "camp-"));
  rooms = createStore(path.join(dir, "rooms.json"));
  campaignFile = path.join(dir, "campaign.json");
  const app = express();
  app.use(express.json());
  app.use("/api/campaign", createCampaignRouter(rooms, createCampaignStore(campaignFile)));
  await new Promise((resolve) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); }); });
  // A whole bot-vs-bot contract runs synchronously below and can outlast the
  // 5 s default keep-alive; the next fetch would reuse a closed socket.
  server.keepAliveTimeout = 120000;
});
after(() => new Promise((resolve) => server.close(resolve)));

const post = async (url, body = {}) => {
  const r = await fetch(base + "/api/campaign" + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

test("a fresh profile has no run and the starting pools", async () => {
  const r = await fetch(base + "/api/campaign");
  const body = await r.json();
  assert.equal(body.run, null);
  assert.deepEqual(body.pools.chassis, STARTING.chassis);
});

test("start a run, fight a contract, resolve it from the room, then abandon for Renown", async () => {
  const start = await post("/run", { chassis: STARTING.chassis.slice(0, 3), notoriety: 0, seed: 42 });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const run = start.body.run;
  assert.equal(run.status, "map");
  assert.equal(run.roster.length, 3);

  assert.equal((await post("/run", { chassis: STARTING.chassis.slice(0, 3) })).status, 400);

  const node = run.offers.find((n) => n.kind === "contract");
  const pick = await post("/run/node", { nodeId: node.id });
  assert.equal(pick.status, 200, JSON.stringify(pick.body));
  const code = pick.body.run.room;
  assert.match(code, /^CAMP-/);
  const room = rooms.getRoom(code);
  assert.equal(room.game.started, true);
  assert.equal(room.campaign.type, node.type);

  assert.equal((await post("/run/resolve")).status, 400); // not finished yet

  room.game.sides.find((s) => s.id === "a").bot = "normal";
  driveBots(room);
  assert.equal(room.game.phase, "finished");
  const res = await post("/run/resolve");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.debrief);
  assert.ok(["reward", "debrief", "over"].includes(res.body.run.status));

  const quit = await post("/run/abandon");
  assert.equal(quit.status, 200);
  assert.equal(quit.body.run.status, "over");
  assert.ok(quit.body.last);
  const renown = res.body.debrief.won ? 2 : 0;
  assert.equal(quit.body.profile.renown, renown);

  const closed = await post("/run/close");
  assert.equal(closed.body.run, null);
  assert.ok(JSON.parse(fs.readFileSync(campaignFile, "utf8")).profile);
});
