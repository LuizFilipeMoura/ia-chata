import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { evolve } from "../../shared/sim/genetic.js";
import { calibrationJobs, tierWinRate, TIER_NAMES, tierSquad } from "../../shared/sim/tiers.js";
import { playbookFrom, metaSource } from "../../shared/sim/playbook.js";
import { META } from "../../shared/bot/meta.js";
import { mulberry32 } from "../../shared/sim/match.js";

// /api/sim — the balance lab. Runs the genetic meta-search as background jobs on
// a worker pool, keeps a recorded replay of each generation's top match, and can
// adopt a finished run as the Hard bot's playbook. In-memory: jobs die with the
// server, which is fine for a lab.
export function createSimRouter({ pool, rootDir }) {
  const router = Router();
  const jobs = new Map();
  let nextJob = 1;
  const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : d));

  const view = (job) => ({
    id: job.id, status: job.status, error: job.error ?? null, params: job.params,
    generation: job.generation, history: job.history, stats: job.stats,
    ranked: job.ranked, replays: job.replays.map((r) => ({ generation: r.generation, title: r.title, winner: r.winner, vp: r.vp })),
    calibration: job.calibration, startedAt: job.startedAt, finishedAt: job.finishedAt ?? null,
  });

  router.post("/evolve", (req, res) => {
    const b = req.body || {};
    const params = {
      population: clamp(b.population, 4, 40, 12), generations: clamp(b.generations, 1, 50, 6),
      gamesPer: clamp(b.gamesPer, 1, 8, 2), seed: clamp(b.seed, 1, 1e9, Date.now() % 1e6),
      mutationRate: clamp(b.mutationRate, 0, 1, 0.25),
    };
    const job = { id: String(nextJob++), status: "running", params, generation: -1, history: [], stats: [], ranked: [], replays: [], calibration: null, startedAt: Date.now(), stop: false };
    jobs.set(job.id, job);
    const evaluate = (list) => Promise.all(list.map((j) => pool.run(j)));
    evolve({
      ...params, evaluate, shouldStop: () => job.stop,
      onGeneration: ({ generation, ranked, history, stats, pairs, jobs: played, results }) => {
        job.generation = generation;
        job.history = history;
        job.stats = Object.entries(stats).map(([key, s]) => {
          const [kind, id] = key.split(":");
          return { key, kind, id, games: s.games, winRate: (s.wins + s.draws * 0.5) / s.games, avgDmg: s.dmg / s.games };
        });
        job.ranked = ranked.slice(0, 8).map((r) => ({ fitness: r.fitness, squad: r.g.squad, weights: r.g.weights }));
        // Replay: re-run this generation's most decisive match with recording on.
        let pickN = 0, margin = -1;
        results.forEach((r, n) => { const m = Math.abs(r.vp[0] - r.vp[1]); if (m > margin) { margin = m; pickN = n; } });
        const j = played[pickN];
        if (j) {
          pool.run({ ...j, record: true }).then((r) => {
            job.replays.push({ generation, title: `Gen ${generation + 1} feature match`, winner: r.winner, vp: r.vp, frames: r.frames, field: r.field, objectives: r.objectives, pilots: r.pilots, squads: j.squads });
          }).catch(() => {});
        }
      },
    }).then((result) => {
      job.result = result;
      job.status = job.stop ? "stopped" : "done";
      job.finishedAt = Date.now();
    }).catch((err) => { job.status = "error"; job.error = String(err?.message || err); });
    res.json(view(job));
  });

  router.get("/jobs", (req, res) => res.json({ jobs: [...jobs.values()].map(view) }));
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
  router.get("/jobs/:id/replays/:n", (req, res) => {
    const job = jobs.get(req.params.id);
    const r = job?.replays[Number(req.params.n)];
    if (!r) return res.status(404).json({ error: "no such replay" });
    res.json(r);
  });

  // Adopt a finished run as the Hard bot's playbook: rewrite shared/bot/meta.js
  // (the node --watch dev server restarts on it) and update the live object.
  router.post("/jobs/:id/adopt", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job?.result) return res.status(409).json({ error: "job has not finished" });
    const meta = playbookFrom(job.result);
    const file = path.join(rootDir, "shared", "bot", "meta.js");
    fs.writeFileSync(file, metaSource(fs.readFileSync(file, "utf8"), meta));
    Object.assign(META, meta);
    res.json({ ok: true, meta });
  });

  // Calibrate the difficulty tiers (bot win rate vs random "average" builds, and
  // vs the job's evolved population when a job id is given).
  router.post("/calibrate", async (req, res) => {
    const games = clamp(req.body?.games, 2, 60, 12);
    const job = req.body?.job ? jobs.get(String(req.body.job)) : null;
    const challengers = job?.result?.population;
    const out = {};
    await Promise.all(TIER_NAMES.map(async (tier) => {
      const list = calibrationJobs(tier, { games, seed: clamp(req.body?.seed, 1, 1e9, 11), challengers });
      const results = await Promise.all(list.map((j) => pool.run(j)));
      out[tier] = tierWinRate(list, results);
    }));
    if (job) job.calibration = out;
    res.json({ calibration: out, against: challengers ? "evolved" : "average" });
  });

  // One recorded match on demand: either explicit squads/weights, or a tier demo
  // ("watch easy vs hard"): { tiers: { a: "easy", b: "hard" } }.
  router.post("/match", async (req, res) => {
    const b = req.body || {};
    const seed = clamp(b.seed, 1, 1e9, Date.now() % 1e6);
    let job;
    if (b.squads) job = { squads: b.squads, weights: b.weights, seed };
    else {
      const rnd = mulberry32(seed);
      const ta = b.tiers?.a || "normal", tb = b.tiers?.b || "hard";
      const sa = tierSquad(ta, [], rnd);
      const sb = tierSquad(tb, sa.map((u) => u.chassis), rnd);
      job = { squads: { a: sa, b: sb }, weights: { a: ta, b: tb }, seed };
    }
    try {
      const r = await pool.run({ ...job, record: true });
      res.json({ ...r, squads: job.squads });
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


