#!/usr/bin/env node
// Does the deploy phase change the game? Same squads, seeds and pilots, both
// tables, three arms:
//   scatter  both bots keep the engine's random corner scatter (the old game)
//   plan     both bots arrange their squadron (shared/bot/deploy.js)
//   duel     one side plans, the other scatters (alternating sides per game);
//            "planner wins" is how much a good deployment is worth on its own
//   node scripts/deploy-ab.mjs [--games 100] [--tiers normal,hard] [--seed 1]
import { createPool } from "../server/sim/pool.js";
import { tierSquad } from "../shared/sim/tiers.js";
import { mulberry32 } from "../shared/sim/match.js";
import { parseArgs } from "./beacon-arms.mjs";

const args = parseArgs();
const GAMES = Number(args.games ?? 100);
const TIERS = String(args.tiers ?? "normal,hard").split(",");
const SEED = Number(args.seed ?? 1);
const TABLES = { standard: null, skirmish: { width: 42, height: 28 } };
const ARMS = ["scatter", "plan", "duel"];

const pool = createPool();
const jobs = [];
for (const tier of TIERS) for (const [tname, table] of Object.entries(TABLES)) {
  const rnd = mulberry32(SEED * 1000 + tier.length * 17 + tname.length);
  for (let n = 0; n < GAMES; n++) {
    const a = tierSquad(tier, [], rnd);
    const b = tierSquad(tier, a.map((u) => u.chassis), rnd);
    const planner = n % 2 ? "b" : "a";
    for (const arm of ARMS) {
      const botDeploy = arm === "plan" ? true : arm === "scatter" ? false : { a: planner === "a", b: planner === "b" };
      jobs.push({ cell: `${tier}/${tname}`, arm, planner: arm === "duel" ? planner : null,
        job: { squads: { a, b }, weights: { a: tier, b: tier }, seed: SEED * 10000 + n, table, botDeploy } });
    }
  }
}
const t0 = Date.now();
let done = 0;
const results = await Promise.all(jobs.map((j) => pool.run(j.job).then((r) => {
  if (++done % 100 === 0) process.stderr.write(`${done}/${jobs.length} (${((Date.now() - t0) / 1000) | 0}s)\n`);
  return { ...j, r };
}, (e) => ({ ...j, err: String(e?.message || e) }))));
pool.close?.();

const pct = (x) => `${(100 * x).toFixed(0)}%`;
const f1 = (x) => x.toFixed(1);
const rows = [];
for (const cell of [...new Set(jobs.map((j) => j.cell))]) for (const arm of ARMS) {
  const xs = results.filter((x) => x.cell === cell && x.arm === arm && x.r);
  const avg = (fn, list = xs) => list.reduce((s, x) => s + fn(x.r ?? x, x), 0) / Math.max(1, list.length);
  const winScore = (r, side) => (r.winner === side ? 1 : r.winner == null ? 0.5 : 0);
  rows.push({
    cell, arm, n: xs.length, errs: results.filter((x) => x.cell === cell && x.arm === arm && x.err).length,
    "planner wins": arm === "duel" ? pct(avg((r, x) => winScore(r, x.planner))) : "",
    "R2 bcn VP": f1(avg((r) => r.vpFlow.beaconByRound[2] || 0)),
    "total VP": f1(avg((r) => r.vp[0] + r.vp[1])),
    margin: f1(avg((r) => Math.abs(r.vp[0] - r.vp[1]))),
    "1st mover wins": pct(avg((r) => (r.winner && r.winner === r.vpFlow.first ? 1 : r.winner == null ? 0.5 : 0))),
    "side A wins": pct(avg((r) => winScore(r, "a"))),
    annihil: pct(avg((r) => (r.reason === "annihilation" || (r.winner && !r.survivors[r.winner === "a" ? "b" : "a"].length) ? 1 : 0))),
    rounds: f1(avg((r) => r.rounds)),
    plants: f1(avg((r) => r.vpFlow.plants)),
  });
}
console.table(rows);
console.log(`${jobs.length} games in ${((Date.now() - t0) / 1000) | 0}s`);
process.exit(0);
