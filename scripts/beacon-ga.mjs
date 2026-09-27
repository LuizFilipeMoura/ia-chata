#!/usr/bin/env node
// Does evolved play still fight for beacons under the cycling-beacon experiment?
// Runs the SAME genetic meta-search twice from the same seed, once under the
// current beacons and once with beaconRules = "cycle", then reports what each
// evolved (the objective weight, the special-action bias Plant rides on) and
// how its champion does against the Normal bot. Touches no gene pool, no
// replays, no meta.js.
//   node scripts/beacon-ga.mjs [--pop 16] [--gens 8] [--games 2] [--gauntlet 24] [--seed 1]
import { evolve } from "../shared/sim/genetic.js";
import { tierSquad, tierWinRate } from "../shared/sim/tiers.js";
import { CHASSIS } from "../shared/game-state.js";
import { mulberry32 } from "../shared/sim/match.js";
import fs from "node:fs";
import { parseArgs, armsFrom, ARM_RULES } from "./beacon-arms.mjs";
import { createPool } from "../server/sim/pool.js";

const args = parseArgs();
const ARMS = armsFrom(args, "legacy,cycle");
const num = (k, d) => (args[k] != null ? Number(args[k]) : d);
const pool = createPool();
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000) | 0;
const W = ["vp", "priority", "damage", "threat", "tactics", "b_special", "b_plant"];

const report = {};
for (const arm of ARMS) {
  const rules = ARM_RULES[arm] || {};
  const evaluate = (jobs) => Promise.all(jobs.map((j) => pool.run({ ...j, ...rules }).catch((e) => ({ error: String(e?.message || e), winner: null, vp: [0, 0] }))));
  const res = await evolve({
    compositions: "all", tables: ["standard", "skirmish"],
    population: num("pop", 16), generations: num("gens", 8), gamesPer: num("games", 2), seed: num("seed", 1), evaluate,
    onGeneration: ({ generation, history }) => {
      const h = history.at(-1);
      console.log(`[${arm}] gen ${generation}  best ${h.best.toFixed(2)}  mean ${h.mean.toFixed(2)}  (${secs()}s)`);
    },
  });
  const top = [res.best.g, ...res.population.slice(0, 3)];
  const mean = Object.fromEntries(W.map((k) => [k, top.reduce((s, g) => s + (g.weights?.[k] || 0), 0) / top.length]));
  // Save what evolved before anything else can go wrong.
  if (args.out) fs.writeFileSync(`${args.out}-${arm}.json`, JSON.stringify({ best: res.best.g, top, history: res.history }, null, 2));
  // Champion vs the Normal bot, under the same rules it evolved in. The bot
  // fields the champion's makeup (lights/mediums), so the room passes parity.
  const champ = res.best.g;
  const comp = {};
  for (const u of champ.squad) { const c = CHASSIS.find((x) => x.id === u.chassis)?.class; if (c) comp[c] = (comp[c] || 0) + 1; }
  const rnd = mulberry32(21);
  const jobs = Array.from({ length: num("gauntlet", 24) }, (_, n) => {
    const bot = tierSquad("normal", champ.squad.map((u) => u.chassis), rnd, comp);
    const botA = n % 2 === 1;
    return { squads: botA ? { a: bot, b: champ.squad } : { a: champ.squad, b: bot },
      weights: botA ? { a: "normal", b: champ.weights } : { a: champ.weights, b: "normal" },
      seed: 2100 + n, botSide: botA ? "a" : "b", ...rules };
  });
  const results = (await Promise.all(jobs.map((j) => pool.run(j).catch(() => null))));
  const ok = results.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
  if (ok.length < results.length) console.log(`[${arm}] ${results.length - ok.length} gauntlet games failed to start`);
  const champSide = (j) => (j.botSide === "a" ? "b" : "a");
  const J = ok.map((i) => jobs[i]), R = ok.map((i) => results[i]);
  const winRate = 1 - tierWinRate(J, R);
  const champBeacon = R.reduce((s, r, i) => s + r.vpFlow.beacon[champSide(J[i])], 0) / Math.max(1, R.length);
  const champTotal = R.reduce((s, r, i) => s + r.vp[champSide(J[i]) === "a" ? 0 : 1], 0) / Math.max(1, R.length);
  report[arm] = {
    "champ vp w": res.best.g.weights.vp?.toFixed(2),
    "top4 vp w": mean.vp.toFixed(2), "top4 priority w": mean.priority.toFixed(2), "top4 damage w": mean.damage.toFixed(2),
    "top4 b_special": mean.b_special.toFixed(2), "top4 b_plant": mean.b_plant.toFixed(2),
    "champ vs Normal": `${(winRate * 100).toFixed(0)}%`,
    "champ beacon VP/game": champBeacon.toFixed(1), "champ total VP/game": champTotal.toFixed(1),
    "champ plants/game": (R.reduce((s, r) => s + r.vpFlow.plants, 0) / Math.max(1, R.length)).toFixed(1),
    squad: res.best.g.squad.map((u) => u.chassis).join(", "),
  };
}
console.table(report);
console.log(`done in ${secs()}s`);
await pool.close();
process.exit(0);
