import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createSimRouter } from "./sim.js";

// A fake pool: canned results instantly, recorded matches carry one frame.
// The router's job is orchestration (jobs, replays, calibration, adopt), not
// playing chess — the real match runner is covered in shared/sim.
const pool = {
  run: async (job) => ({
    winner: job.squads.a[0].chassis < job.squads.b[0].chassis ? "a" : "b",
    vp: [3, 1], rounds: 10, stats: { a: { dmgDealt: 5 }, b: { dmgDealt: 2 } },
    frames: job.record ? [{ rigs: [], log: [] }] : undefined,
    field: job.record ? { width: 54, height: 36, terrain: [] } : undefined,
    objectives: job.record ? [] : undefined,
    pilots: job.record ? { a: {}, b: {} } : undefined,
  }),
};

let server, base, root;
before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sim-"));
  fs.mkdirSync(path.join(root, "shared", "bot"), { recursive: true });
  fs.writeFileSync(path.join(root, "shared", "bot", "meta.js"), "// header\nexport const META = {};\n");
  const app = express();
  app.use(express.json());
  app.use("/api/sim", createSimRouter({ pool, rootDir: root }));
  await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
after(() => new Promise((r) => server.close(r)));

const post = (u, b) => fetch(base + u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) }).then((r) => r.json());
const get = (u) => fetch(base + u).then((r) => r.json());

test("evolve runs a job to completion with history, stats and replays; adopt rewrites meta.js", async () => {
  const job = await post("/api/sim/evolve", { population: 6, generations: 3, gamesPer: 2, seed: 4 });
  let j = job;
  for (let i = 0; i < 50 && j.status === "running"; i++) { await new Promise((r) => setTimeout(r, 20)); j = await get(`/api/sim/jobs/${job.id}`); }
  assert.equal(j.status, "done");
  assert.equal(j.history.length, 3);
  assert.ok(j.stats.some((s) => s.kind === "chassis"));
  assert.ok(j.replays.length >= 1);
  const rep = await get(`/api/sim/jobs/${job.id}/replays/0`);
  assert.ok(rep.frames && rep.field && rep.pilots);
  const adopted = await post(`/api/sim/jobs/${job.id}/adopt`);
  assert.equal(adopted.ok, true);
  const src = fs.readFileSync(path.join(root, "shared", "bot", "meta.js"), "utf8");
  assert.match(src, /^\/\/ header/);
  assert.match(src, /"chassisRank"/);
});

test("a tier demo match comes back recorded", async () => {
  const r = await post("/api/sim/match", { tiers: { a: "easy", b: "hard" }, seed: 3 });
  assert.ok(Array.isArray(r.frames));
  assert.ok(r.squads.a.length === 3 && r.squads.b.length === 3);
  assert.ok(!r.squads.a.some((u) => r.squads.b.some((v) => v.chassis === u.chassis)), "no mirrored chassis");
});

test("calibrate reports a win rate per tier", async () => {
  const r = await post("/api/sim/calibrate", { games: 4 });
  for (const t of ["easy", "normal", "hard"]) assert.ok(r.calibration[t] >= 0 && r.calibration[t] <= 1);
});
