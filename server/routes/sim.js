import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { evolve, randomGenome } from "../../shared/sim/genetic.js";
import { calibrationJobs, tierWinRate, TIER_NAMES, tierSquad } from "../../shared/sim/tiers.js";
import { playbookFrom, metaSource } from "../../shared/sim/playbook.js";
import { META } from "../../shared/bot/meta.js";
import { mulberry32 } from "../../shared/sim/match.js";
import { BOT_PRESETS } from "../../shared/game-state.js";

// /api/sim — simulated play. Every game here is a real bot-vs-bot room played
// through the live engine path (shared/sim/match.js → driveBots) on a worker
// pool, recorded frame by frame and saved to the replay library:
//   - GA jobs (/evolve): EVERY match of every generation is a simulated game,
//     saved under source "ga" with its job + generation;
//   - simulated rooms (/rooms): queue N games between tiers / random builds /
//     explicit squads; each finished room is also kept in the room store, so
//     /api/game/<code> shows its final state;
//   - tier demos (/match) and calibration runs.
// Job summaries are written to data/sim-jobs so a run can be reviewed after a
// restart; replays live in data/replays (see server/replays.js).
export function createSimRouter({ pool, rootDir, replays, store = null }) {
  const router = Router();
  const jobs = new Map();
  const jobsDir = path.join(rootDir, "data", "sim-jobs");
  fs.mkdirSync(jobsDir, { recursive: true });
  const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : d));
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  // Past jobs from disk (read-only summaries).
  for (const f of fs.readdirSync(jobsDir).filter((x) => x.endsWith(".json"))) {
    try { const j = JSON.parse(fs.readFileSync(path.join(jobsDir, f), "utf8")); if (j.status === "running") j.status = "interrupted"; jobs.set(j.id, j); } catch {}
  }

  const view = (job) => ({
    id: job.id, kind: job.kind, status: job.status, error: job.error ?? null, params: job.params,
    generation: job.generation, history: job.history, stats: job.stats, ranked: job.ranked,
    games: job.games, done: job.done, calibration: job.calibration,
    startedAt: job.startedAt, finishedAt: job.finishedAt ?? null, playbook: job.playbook ?? null,
  });
  const persistJob = (job) => {
    try { fs.writeFileSync(path.join(jobsDir, `${job.id}.json`), JSON.stringify(view(job))); } catch {}
  };

  // Play one simulated game (recorded) and file it in the library.
  async function simulate(job, meta) {
    const r = await pool.run({ ...job, record: true, keepRoom: !!store && meta.source === "sim" });
    const entry = replays.save(r, job.squads, { ...meta, table: job.table ?? null, seed: job.seed });
    if (r.room && store) {
      r.room.code = meta.room;
      delete r.room._history;   // undo snapshots — dead weight in a finished sim
      delete r.room.botFrames;
      store.rooms.set(meta.room, r.room);
      store.persist();
    }
    delete r.frames; delete r.room;
    return { ...r, replayId: entry.id };
  }

  // ---- GA: always simulated games ----
  router.post("/evolve", (req, res) => {
    const b = req.body || {};
    const params = {
      population: clamp(b.population, 4, 40, 12), generations: clamp(b.generations, 1, 50, 6),
      gamesPer: clamp(b.gamesPer, 1, 8, 2), seed: clamp(b.seed, 1, 1e9, Date.now() % 1e6),
      mutationRate: clamp(b.mutationRate, 0, 1, 0.25),
    };
    const job = { id: newId(), kind: "ga", status: "running", params, generation: -1, history: [], stats: [], ranked: [], games: 0, done: 0, calibration: null, startedAt: Date.now(), stop: false };
    jobs.set(job.id, job);
    persistJob(job);
    let gen = 0;
    const evaluate = (list) => {
      const g = gen++;
      job.games += list.length;
      return Promise.all(list.map((j) => simulate(j, { source: "ga", job: job.id, generation: g, label: `GA ${job.id} · gen ${g + 1}` }).then((r) => { job.done++; return r; })));
    };
    evolve({
      ...params, evaluate, shouldStop: () => job.stop,
      onGeneration: ({ generation, ranked, history, stats }) => {
        job.generation = generation;
        job.history = history;
        job.stats = Object.entries(stats).map(([key, s]) => {
          const [kind, id] = key.split(":");
          return { key, kind, id, games: s.games, winRate: (s.wins + s.draws * 0.5) / s.games, avgDmg: s.dmg / s.games };
        });
        job.ranked = ranked.slice(0, 8).map((r) => ({ fitness: r.fitness, squad: r.g.squad, weights: r.g.weights }));
        persistJob(job);
      },
    }).then((result) => {
      job.result = result;
      job.playbook = playbookFrom(result);
      job.status = job.stop ? "stopped" : "done";
      job.finishedAt = Date.now();
      persistJob(job);
    }).catch((err) => { job.status = "error"; job.error = String(err?.message || err); persistJob(job); });
    res.json(view(job));
  });

  router.get("/jobs", (req, res) => res.json({ jobs: [...jobs.values()].map(view).sort((a, b) => a.startedAt - b.startedAt) }));
  router.get("/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "no such job" });
    res.json(view(job));
  });
  router.post("/jobs/:id/stop", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "no such job" });
    job.stop = true;
    res.json(view(job));
  });

  // Adopt a finished run as the Hard bot's playbook: rewrite shared/bot/meta.js
  // and update the live object (workers pick it up on their next spawn).
  router.post("/jobs/:id/adopt", (req, res) => {
    const job = jobs.get(req.params.id);
    const meta = job?.playbook;
    if (!meta) return res.status(409).json({ error: "job has not finished" });
    const file = path.join(rootDir, "shared", "bot", "meta.js");
    fs.writeFileSync(file, metaSource(fs.readFileSync(file, "utf8"), meta));
    Object.assign(META, meta);
    res.json({ ok: true, meta });
  });

  // ---- Simulated rooms: queue games, watch them later ----
  // side spec: "easy" | "normal" | "hard" | "random" | { squad, weights }
  function sideSetup(spec, avoid, rnd) {
    if (spec && typeof spec === "object" && Array.isArray(spec.squad)) return { squad: spec.squad, pilot: spec.weights || "normal" };
    if (spec === "random" || !spec) {
      let g; do { g = randomGenome(rnd); } while (g.squad.some((u) => avoid.includes(u.chassis)));
      return { squad: g.squad, pilot: g.weights };
    }
    const tier = BOT_PRESETS.includes(spec) ? spec : "normal";
    return { squad: tierSquad(tier, avoid, rnd), pilot: tier };
  }

  router.post("/rooms", (req, res) => {
    const b = req.body || {};
    const count = clamp(b.count, 1, 200, 1);
    const table = b.table && Number(b.table.width) ? { width: clamp(b.table.width, 24, 96, 54), height: clamp(b.table.height, 18, 72, 36) } : null;
    const seed0 = clamp(b.seed, 1, 1e9, Date.now() % 1e6);
    const job = { id: newId(), kind: "rooms", status: "running", params: { a: b.a ?? "normal", b: b.b ?? "hard", count, table }, games: count, done: 0, results: [], startedAt: Date.now() };
    jobs.set(job.id, job);
    persistJob(job);
    const runs = [];
    for (let n = 0; n < count; n++) {
      const rnd = mulberry32(seed0 + n);
      const A = sideSetup(b.a ?? "normal", [], rnd);
      const B = sideSetup(b.b ?? "hard", A.squad.map((u) => u.chassis), rnd);
      const code = `SIM-${job.id.slice(-4).toUpperCase()}-${n + 1}`;
      const spec = { squads: { a: A.squad, b: B.squad }, weights: { a: A.pilot, b: B.pilot }, seed: seed0 + n, table, code };
      runs.push(simulate(spec, { source: "sim", job: job.id, room: code, label: `${typeof b.a === "string" ? b.a : "custom"} vs ${typeof b.b === "string" ? b.b : "custom"} #${n + 1}` })
        .then((r) => { job.done++; job.results.push({ room: code, replayId: r.replayId, winner: r.winner, vp: r.vp }); })
        .catch((e) => { job.done++; job.results.push({ room: code, error: String(e?.message || e) }); }));
    }
    Promise.all(runs).then(() => {
      job.status = "done"; job.finishedAt = Date.now();
      const w = { a: 0, b: 0, draw: 0 };
      job.results.forEach((r) => { if (!r.error) w[r.winner ?? "draw"]++; });
      job.summary = w;
      persistJob({ ...job, stats: [w] });
    });
    res.json({ ...view(job), rooms: count });
  });

  router.get("/rooms/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "no such batch" });
    res.json({ ...view(job), results: job.results ?? [], summary: job.summary ?? null });
  });

  // ---- Replay library ----
  router.get("/replays", (req, res) => res.json(replays.list({
    source: req.query.source, job: req.query.job, chassis: req.query.chassis,
    limit: clamp(req.query.limit, 1, 1000, 200), offset: clamp(req.query.offset, 0, 1e9, 0),
  })));
  router.get("/replays/:id", (req, res) => {
    const r = replays.get(req.params.id);
    if (!r) return res.status(404).json({ error: "no such replay" });
    res.json({ ...r, squads: r.squadsFull ?? r.squads });
  });
  router.delete("/replays/:id", (req, res) => res.json({ ok: replays.remove(req.params.id) }));

  // Calibrate the difficulty tiers (bot win rate vs random "average" builds, and
  // vs a GA job's evolved population when a job id is given). Simulated games too.
  router.post("/calibrate", async (req, res) => {
    const games = clamp(req.body?.games, 2, 60, 12);
    const job = req.body?.job ? jobs.get(String(req.body.job)) : null;
    const challengers = job?.result?.population;
    const out = {};
    await Promise.all(TIER_NAMES.map(async (tier) => {
      const list = calibrationJobs(tier, { games, seed: clamp(req.body?.seed, 1, 1e9, 11), challengers });
      const results = await Promise.all(list.map((j) => simulate(j, { source: "calibration", label: `calibration · ${tier}` })));
      out[tier] = tierWinRate(list, results);
    }));
    if (job) { job.calibration = out; persistJob(job); }
    res.json({ calibration: out, against: challengers ? "evolved" : "average" });
  });

  // One tier demo game ("watch easy vs hard"), returned with its frames.
  router.post("/match", async (req, res) => {
    const b = req.body || {};
    const seed = clamp(b.seed, 1, 1e9, Date.now() % 1e6);
    const rnd = mulberry32(seed);
    const A = sideSetup(b.tiers?.a || "normal", [], rnd);
    const B = sideSetup(b.tiers?.b || "hard", A.squad.map((u) => u.chassis), rnd);
    try {
      const r = await simulate({ squads: { a: A.squad, b: B.squad }, weights: { a: A.pilot, b: B.pilot }, seed }, { source: "demo", label: `${b.tiers?.a || "normal"} vs ${b.tiers?.b || "hard"}` });
      const full = replays.get(r.replayId);
      res.json({ ...full, squads: full.squadsFull, replayId: r.replayId });
    } catch (err) {
      res.status(400).json({ error: String(err?.message || err) });
    }
  });

  router.get("/meta", (req, res) => {
    let report = null;
    try { report = JSON.parse(fs.readFileSync(path.join(rootDir, "data", "meta-report.json"), "utf8")); } catch {}
    res.json({ meta: META, report });
  });

  return router;
}
