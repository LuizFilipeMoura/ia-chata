#!/usr/bin/env node
// A/B the cycling-beacon experiment (room.game.beaconRules = "cycle") against
// the current beacons: same squads, same seeds, same pilots, both tables.
//   node scripts/beacon-ab.mjs [--games 100] [--tiers normal,hard] [--seed 1] [--arms legacy,cycle]
// Arms are the rule variants in beacon-arms.mjs.
import { createPool } from "../server/sim/pool.js";
import { tierSquad } from "../shared/sim/tiers.js";
import { mulberry32 } from "../shared/sim/match.js";
import { parseArgs, armsFrom, ARM_RULES } from "./beacon-arms.mjs";

const args = parseArgs();
const GAMES = Number(args.games ?? 100);
const TIERS = String(args.tiers ?? "normal,hard").split(",");
const SEED = Number(args.seed ?? 1);
const TABLES = { standard: null, skirmish: { width: 42, height: 28 } };
const ARMS = armsFrom(args, "legacy,ship");

const pool = createPool();
const jobs = [];
for (const tier of TIERS) for (const [tname, table] of Object.entries(TABLES)) {
  const rnd = mulberry32(SEED * 1000 + tier.length * 17 + tname.length);
  for (let n = 0; n < GAMES; n++) {
    const a = tierSquad(tier, [], rnd);
    const b = tierSquad(tier, a.map((u) => u.chassis), rnd);
    for (const arm of ARMS) {
      jobs.push({ cell: `${tier}/${tname}`, arm,
        job: { squads: { a, b }, weights: { a: tier, b: tier }, seed: SEED * 10000 + n, table, ...ARM_RULES[arm] } });
    }
  }
}
const t0 = Date.now();
let done = 0;
const results = await Promise.all(jobs.map((j) => pool.run(j.job).then((r) => {
  if (++done % 50 === 0) process.stderr.write(`${done}/${jobs.length} (${((Date.now() - t0) / 1000) | 0}s)\n`);
  return { ...j, r };
}, (e) => ({ ...j, err: String(e?.message || e) }))));
pool.close?.();

const pct = (x) => `${(100 * x).toFixed(0)}%`;
const f1 = (x) => x.toFixed(1);
const rows = [];
for (const cell of [...new Set(jobs.map((j) => j.cell))]) for (const arm of ARMS) {
  const rs = results.filter((x) => x.cell === cell && x.arm === arm && x.r).map((x) => x.r);
  const errs = results.filter((x) => x.cell === cell && x.arm === arm && x.err).length;
  const n = rs.length;
  const avg = (fn) => rs.reduce((s, r) => s + fn(r), 0) / Math.max(1, n);
  const beacon = avg((r) => r.vpFlow.beacon.a + r.vpFlow.beacon.b);
  const total = avg((r) => r.vp[0] + r.vp[1]);
  rows.push({
    cell, arm, n, errs,
    "early bcn VP (R1-2)": f1(avg((r) => (r.vpFlow.beaconByRound[1] || 0) + (r.vpFlow.beaconByRound[2] || 0))),
    "R1 bcn VP": f1(avg((r) => r.vpFlow.beaconByRound[1] || 0)),
    "total VP": f1(total),
    "beacon share": pct(beacon / Math.max(1e-9, total)),
    "lead chg": f1(avg((r) => r.vpFlow.leadChanges)),
    margin: f1(avg((r) => Math.abs(r.vp[0] - r.vp[1]))),
    draws: pct(avg((r) => (r.winner == null ? 1 : 0))),
    "1st mover wins": pct(avg((r) => (r.winner && r.winner === r.vpFlow.first ? 1 : r.winner == null ? 0.5 : 0))),
    "side A wins": pct(avg((r) => (r.winner === "a" ? 1 : r.winner == null ? 0.5 : 0))),
    annihil: pct(avg((r) => (r.reason === "annihilation" || (r.winner && !r.survivors[r.winner === "a" ? "b" : "a"].length) ? 1 : 0))),
    rounds: f1(avg((r) => r.rounds)),
    plants: f1(avg((r) => r.vpFlow.plants)),
  });
}
console.table(rows);
console.log(`${jobs.length} games in ${((Date.now() - t0) / 1000) | 0}s`);
process.exit(0);
