#!/usr/bin/env node
// Run the genetic meta-search, write the Hard bot's playbook (shared/bot/meta.js),
// then calibrate all three difficulty tiers against random "average player"
// builds and against the evolved population.
//   node scripts/evolve-meta.mjs [--pop 12] [--gens 8] [--games 2] [--calib 16] [--seed 1] [--no-write]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evolve } from "../shared/sim/genetic.js";
import { calibrationJobs, tierWinRate, TIER_NAMES } from "../shared/sim/tiers.js";
import { createPool } from "../server/sim/pool.js";
import { createReplayStore } from "../server/replays.js";
import { META } from "../shared/bot/meta.js";
import { playbookFrom, metaSource } from "../shared/sim/playbook.js";

const args = Object.fromEntries(process.argv.slice(2).join(" ").split("--").filter(Boolean).map((s) => {
  const [k, v] = s.trim().split(/\s+/); return [k, v ?? true];
}));
const num = (k, d) => (args[k] != null ? Number(args[k]) : d);
const pool = createPool();
// Every GA match is a simulated game, recorded and filed in the replay library
// (data/replays) under this run's job id — same as a server-side /api/sim job.
const replays = createReplayStore(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "replays"));
const jobId = `cli-${Date.now().toString(36)}`;
let gen = 0;
const evaluate = (jobs) => {
  const g = gen++;
  return Promise.all(jobs.map((j) => pool.run({ ...j, record: true }).then((r) => {
    replays.save(r, j.squads, { source: "ga", job: jobId, generation: g, label: `GA ${jobId} · gen ${g + 1}`, seed: j.seed });
    delete r.frames;
    return r;
  })));
};
const evaluatePlain = (jobs) => Promise.all(jobs.map((j) => pool.run(j)));
const t0 = Date.now();

const res = await evolve({
  population: num("pop", 12), generations: num("gens", 8), gamesPer: num("games", 2), seed: num("seed", 1), evaluate,
  onGeneration: ({ generation, history }) => {
    const h = history.at(-1);
    console.log(`gen ${generation}  best ${h.best.toFixed(2)}  mean ${h.mean.toFixed(2)}  ${h.bestSquad.join(", ")}  (${((Date.now() - t0) / 1000) | 0}s)`);
  },
});

// Gauntlet: the GA's fitness is relative to its own population, so re-test the
// top genomes against the reference "average player" and crown the one that
// actually wins most — that's the Hard bot.
const gauntletGames = num("gauntlet", 12);
const top = [res.best.g, ...res.population.slice(0, 4)];
let champion = res.best.g, bestRate = -1;
for (const g of top) {
  const jobs = calibrationJobs("normal", { games: gauntletGames, seed: 21 }).map((j) => {
    // Replace the tier bot in each job with this genome (keep its opponent).
    const botSide = j.botSide, other = botSide === "a" ? "b" : "a";
    const avoid = j.squads[other].map((u) => u.chassis);
    if (g.squad.some((u) => avoid.includes(u.chassis))) return null;
    return { ...j, squads: { ...j.squads, [botSide]: g.squad }, weights: { ...j.weights, [botSide]: g.weights } };
  }).filter(Boolean);
  if (jobs.length < gauntletGames / 2) continue;
  const results = await evaluatePlain(jobs);
  const rate = tierWinRate(jobs, results);
  console.log(`gauntlet ${g.squad.map((u) => u.chassis).join(", ")}: ${(rate * 100).toFixed(0)}% over ${jobs.length}`);
  if (rate > bestRate) { bestRate = rate; champion = g; }
}
const meta = playbookFrom(res, champion);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!args["no-write"]) {
  const file = path.join(root, "shared", "bot", "meta.js");
  fs.writeFileSync(file, metaSource(fs.readFileSync(file, "utf8"), meta));
  console.log("wrote", file);
}
fs.mkdirSync(path.join(root, "data"), { recursive: true });
fs.writeFileSync(path.join(root, "data", "meta-report.json"), JSON.stringify({ ...meta, history: res.history, stats: res.stats }, null, 2));

// META was imported before evolving: patch this thread's copy in place and
// restart the pool so workers re-import the new playbook too.
Object.assign(META, meta);
await pool.close();
const pool2 = createPool();
const games = num("calib", 16);
console.log("\nTier calibration (bot win rate):");
for (const tier of TIER_NAMES) {
  const vsRandom = calibrationJobs(tier, { games, seed: 11 });
  const vsEvolved = calibrationJobs(tier, { games, seed: 12, challengers: res.population });
  const [r1, r2] = await Promise.all([vsRandom, vsEvolved].map((jobs) => Promise.all(jobs.map((j) => pool2.run(j)))));
  console.log(`  ${tier.padEnd(6)}  vs average builds ${(tierWinRate(vsRandom, r1) * 100).toFixed(0)}%   vs evolved builds ${(tierWinRate(vsEvolved, r2) * 100).toFixed(0)}%`);
}
await pool2.close();
replays.close();
console.log(`GA matches saved to data/replays under job ${jobId}`);
console.log(`done in ${((Date.now() - t0) / 1000) | 0}s`);
