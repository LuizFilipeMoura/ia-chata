import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createSimRouter } from "./sim.js";
import { createReplayStore } from "../replays.js";
import { createStore } from "../store.js";
import { playMatch } from "../../shared/sim/match.js";

// The real simulated-game runner, in-process (no worker threads) — so these
// tests exercise the actual engine path the GA uses, end to end.
const pool = { run: async (job) => playMatch(job) };

let server, base, root, replays, store;
before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sim-"));
  fs.mkdirSync(path.join(root, "shared", "bot"), { recursive: true });
  fs.writeFileSync(path.join(root, "shared", "bot", "meta.js"), "// header\nexport const META = {};\n");
  replays = createReplayStore(path.join(root, "data", "replays"));
  store = createStore(path.join(root, "data", "rooms.json"));
  const app = express();
  app.use(express.json());
  app.use("/api/sim", createSimRouter({ pool, rootDir: root, replays, store }));
  await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
after(() => { replays.close(); return new Promise((r) => server.close(r)); });

const post = (u, b) => fetch(base + u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const get = (u) => fetch(base + u).then((r) => r.json());
const until = async (fn, ms = 600000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 50)); } };

test("simulated rooms: games are played, saved as replays, and kept as finished rooms", async () => {
  const batch = await post("/api/sim/rooms", { a: "easy", b: "hard", count: 2, seed: 5, table: { width: 42, height: 28 } });
  const done = await until(async () => { const j = await get(`/api/sim/rooms/${batch.id}`); return j.status === "done" && j; });
  assert.equal(done.results.length, 2);
  for (const r of done.results) {
    assert.ok(!r.error, r.error);
    const room = store.getRoom(r.room);
    assert.ok(room?.simulated && room.game.phase === "finished", "finished room kept in the store");
    assert.equal(room.field.width, 42);
    const rep = await get(`/api/sim/replays/${r.replayId}`);
    assert.ok(rep.frames.length > 10 && rep.field && rep.pilots, "full replay");
    assert.equal(rep.source, "sim");
  }
  const list = await get("/api/sim/replays?source=sim");
  assert.equal(list.total, 2);
});

test("a GA job plays every match as a saved simulated game and exposes a playbook", async () => {
  const job = await post("/api/sim/evolve", { population: 4, generations: 1, gamesPer: 1, seed: 4 });
  const j = await until(async () => { const x = await get(`/api/sim/jobs/${job.id}`); return x.status !== "running" && x; });
  assert.equal(j.status, "done", j.error);
  assert.equal(j.history.length, 1);
  const ga = await get(`/api/sim/replays?source=ga&job=${job.id}`);
  assert.equal(ga.total, j.games, "every GA match is in the library");
  assert.ok(ga.rows.every((r) => r.generation === 0));
  const adopted = await post(`/api/sim/jobs/${job.id}/adopt`);
  assert.equal(adopted.ok, true);
  assert.match(fs.readFileSync(path.join(root, "shared", "bot", "meta.js"), "utf8"), /"chassisRank"/);
  assert.ok(fs.existsSync(path.join(root, "data", "sim-jobs", `${job.id}.json`)), "job summary persisted");
});
