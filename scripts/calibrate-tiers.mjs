#!/usr/bin/env node
// Measure each difficulty tier's win rate against the reference "average
// player" (random legal builds, balanced pilot), and optionally against the
// last GA population. Targets: easy ≤ 25%, normal ≈ 50%, hard ≥ 70%.
//   node scripts/calibrate-tiers.mjs [--games 16] [--seed 11] [--tiers easy,normal,hard]
import { calibrationJobs, tierWinRate } from "../shared/sim/tiers.js";
import { createPool } from "../server/sim/pool.js";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const games = Number(arg("games", 16)), seed = Number(arg("seed", 11));
const tiers = arg("tiers", "easy,normal,hard").split(",");
const pool = createPool();
const t0 = Date.now();
await Promise.all(tiers.map(async (tier) => {
  const jobs = calibrationJobs(tier, { games, seed });
  const res = await Promise.all(jobs.map((j) => pool.run(j)));
  console.log(`${tier.padEnd(7)} bot win rate ${(tierWinRate(jobs, res) * 100).toFixed(0)}%  (${games} games)`);
}));
await pool.close();
console.log(`${((Date.now() - t0) / 1000) | 0}s`);
