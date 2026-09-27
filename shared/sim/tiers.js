// Difficulty tiers as whole opponents: a tier fixes BOTH how the bot commissions
// its squad and how it pilots it. Mirrors generateBotOpponent's rules so the
// calibration measures the same bot a solo player actually meets.
//   easy  , random chassis, default upgrades, no equipment, blundering pilot
//   normal, random chassis, default upgrades + primary equipment, balanced pilot
//   hard  , GA-ranked chassis with the GA's winning builds, champion pilot
import { CHASSIS, CHASSIS_PRIMARY_EQUIPMENT } from "../game-state.js";
import { META } from "../bot/meta.js";
import { DEFAULT_COMPOSITION, randomGenome } from "./genetic.js";
import { mulberry32 } from "./match.js";
import { PRESETS } from "../bot/score.js";

export const TIER_NAMES = ["easy", "normal", "hard"];

// Class makeup of a squad (counts per weight class), read off CHASSIS. Used
// to build a mirrored bot squad for a challenger whose composition isn't the
// GA's default (evolve-meta.mjs runs with compositions "all").
export function compositionOf(squad) {
  const comp = {};
  for (const u of squad) {
    const c = CHASSIS.find((x) => x.id === u.chassis);
    if (c) comp[c.class] = (comp[c.class] || 0) + 1;
  }
  return comp;
}

export function tierSquad(tier, avoid = [], rnd = Math.random, composition = DEFAULT_COMPOSITION) {
  const squad = [];
  const rank = (id) => { const i = META.chassisRank.indexOf(id); return i < 0 ? 99 : i; };
  for (const [cls, n] of Object.entries(composition)) {
    let pool = CHASSIS.filter((c) => c.class === cls && !avoid.includes(c.id));
    pool = pool.map((c) => ({ c, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.c);
    if (tier === "hard" && META.chassisRank.length) pool.sort((a, b) => rank(a.id) - rank(b.id));
    for (const c of pool.slice(0, n)) {
      const b = tier === "hard" ? META.builds[c.id] : null;
      squad.push({
        chassis: c.id,
        longRangeUpgrade: b?.longRangeUpgrade, meleeUpgrade: b?.meleeUpgrade,
        equipment: tier === "easy" ? null : (b?.equipment ?? CHASSIS_PRIMARY_EQUIPMENT[c.id] ?? null),
        equipmentUpgrade: b?.equipmentUpgrade,
      });
    }
  }
  return squad;
}

// Build calibration jobs: each challenger genome plays the tier bot `games`
// times, alternating corners. `challengers` defaults to random builds flown by
// the balanced pilot, a stand-in for "an average human".
export function calibrationJobs(tier, { challengers, games = 12, seed = 77 } = {}) {
  const rnd = mulberry32(seed);
  const jobs = [];
  for (let n = 0; n < games; n++) {
    // Reference "average player": a random legal build flown by a competent,
    // unhurried pilot (balanced weights, no blunders).
    const g = challengers ? challengers[n % challengers.length] : { ...randomGenome(rnd), weights: PRESETS.balanced };
    // Mirror the challenger's own class makeup, not the GA's default: a
    // challenger genome bred under compositions "all" may run 2 mediums + 1
    // light, or 3 lights, and the bot squad must match or the room refuses
    // to ready ("Both sides must field a mirrored composition").
    const bot = tierSquad(tier, g.squad.map((u) => u.chassis), rnd, compositionOf(g.squad));
    const botA = n % 2 === 1;
    jobs.push({
      squads: botA ? { a: bot, b: g.squad } : { a: g.squad, b: bot },
      weights: botA ? { a: tier, b: g.weights } : { a: g.weights, b: tier },
      seed: seed * 100 + n,
      botSide: botA ? "a" : "b",
    });
  }
  return jobs;
}

// Tier win rate (draw = ½) over finished results paired with their jobs.
export function tierWinRate(jobs, results) {
  let s = 0;
  results.forEach((r, i) => { s += r.winner === jobs[i].botSide ? 1 : r.winner == null ? 0.5 : 0; });
  return results.length ? s / results.length : 0;
}
