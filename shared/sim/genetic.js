// Genetic meta-search. A genome is a whole commission — a squad of distinct
// chassis, each with its long-range / melee / equipment upgrade picks — plus the
// bot weight vector that pilots it. Genomes play each other headlessly
// (match.js); fitness is win rate. Selection + crossover + mutation drift the
// population toward whatever the current rules reward, and the aggregated game
// stats (per chassis / per upgrade win rates and pick rates) are the balance
// report: a chassis at 70% win rate is overtuned, an upgrade nobody keeps is a
// trap.
//
// Pure + deterministic from `seed`; the evaluator is injectable so the server can
// fan matches out across worker threads.
import { CHASSIS, WEAPON_UPGRADES, EQUIPMENT } from "../game-state.js";
import { EQUIPMENT_UPGRADES } from "../rules.js";
import { PRESETS } from "../bot/score.js";
import { mulberry32, playMatch } from "./match.js";

export const WEIGHT_KEYS = ["vp", "priority", "damage", "threat", "heat", "fragile", "tactics"];
const EQUIP_IDS = Object.keys(EQUIPMENT);

// Default composition: 1 medium + 2 lights per side. Both sides must mirror
// weight classes (§3) and no chassis may appear twice on the field, so squads
// that meet must be disjoint — there are 4 mediums, so 1M leaves room to pair.
export const DEFAULT_COMPOSITION = { medium: 1, light: 2 };

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const natureOf = (weapon, id) => WEAPON_UPGRADES[weapon]?.find((u) => u.id === id)?.nature;
const equipNature = (eq, id) => EQUIPMENT_UPGRADES[eq]?.find((u) => u.id === id)?.nature;

function prototypes(unit) {
  const ch = CHASSIS.find((c) => c.id === unit.chassis);
  return (natureOf(ch.longRange, unit.longRangeUpgrade) === "prototype")
    + (natureOf(ch.melee, unit.meleeUpgrade) === "prototype")
    + (equipNature(unit.equipment, unit.equipmentUpgrade) === "prototype");
}

// Re-roll picks until the unit honours the one-Prototype-per-rig rule.
function legalise(unit, rnd) {
  const ch = CHASSIS.find((c) => c.id === unit.chassis);
  let guard = 0;
  while (prototypes(unit) > 1 && guard++ < 20) {
    const slot = pick(["longRangeUpgrade", "meleeUpgrade", "equipmentUpgrade"], rnd);
    const list = slot === "longRangeUpgrade" ? WEAPON_UPGRADES[ch.longRange]
      : slot === "meleeUpgrade" ? WEAPON_UPGRADES[ch.melee] : EQUIPMENT_UPGRADES[unit.equipment];
    unit[slot] = pick(list.filter((u) => u.nature !== "prototype"), rnd).id;
  }
  return unit;
}

export function randomUnit(chassisId, rnd) {
  const ch = CHASSIS.find((c) => c.id === chassisId);
  const equipment = pick(EQUIP_IDS, rnd);
  return legalise({
    chassis: ch.id,
    longRangeUpgrade: pick(WEAPON_UPGRADES[ch.longRange], rnd).id,
    meleeUpgrade: pick(WEAPON_UPGRADES[ch.melee], rnd).id,
    equipment,
    equipmentUpgrade: pick(EQUIPMENT_UPGRADES[equipment], rnd).id,
  }, rnd);
}

function randomWeights(rnd) {
  const base = pick(Object.values(PRESETS), rnd);
  return Object.fromEntries(WEIGHT_KEYS.map((k) => [k, +((base[k] ?? 1) * (0.5 + rnd())).toFixed(2)]));
}

export function randomGenome(rnd, composition = DEFAULT_COMPOSITION) {
  const squad = [];
  for (const [cls, n] of Object.entries(composition)) {
    const pool = CHASSIS.filter((c) => c.class === cls).map((c) => c.id);
    for (let i = 0; i < n; i++) {
      const free = pool.filter((id) => !squad.some((u) => u.chassis === id));
      squad.push(randomUnit(pick(free, rnd), rnd));
    }
  }
  return { squad, weights: randomWeights(rnd) };
}

// Uniform crossover per squad slot (slots are grouped by class, so a slot swap
// never breaks the composition), then repair any duplicate chassis.
function crossover(p1, p2, rnd) {
  const squad = p1.squad.map((u, i) => structuredClone(rnd() < 0.5 ? u : p2.squad[i]));
  repairDuplicates(squad, rnd);
  const weights = Object.fromEntries(WEIGHT_KEYS.map((k) => [k, rnd() < 0.5 ? p1.weights[k] : p2.weights[k]]));
  return { squad, weights };
}

function repairDuplicates(squad, rnd) {
  const seen = new Set();
  for (let i = 0; i < squad.length; i++) {
    if (!seen.has(squad[i].chassis)) { seen.add(squad[i].chassis); continue; }
    const cls = CHASSIS.find((c) => c.id === squad[i].chassis).class;
    const free = CHASSIS.filter((c) => c.class === cls && !squad.some((u) => u.chassis === c.id)).map((c) => c.id);
    squad[i] = randomUnit(pick(free, rnd), rnd);
    seen.add(squad[i].chassis);
  }
}

function mutate(g, rnd, rate) {
  const out = structuredClone(g);
  for (let i = 0; i < out.squad.length; i++) {
    const u = out.squad[i];
    const ch = CHASSIS.find((c) => c.id === u.chassis);
    if (rnd() < rate * 0.5) {
      const free = CHASSIS.filter((c) => c.class === ch.class && !out.squad.some((x) => x.chassis === c.id)).map((c) => c.id);
      if (free.length) { out.squad[i] = randomUnit(pick(free, rnd), rnd); continue; }
    }
    if (rnd() < rate) u.longRangeUpgrade = pick(WEAPON_UPGRADES[ch.longRange], rnd).id;
    if (rnd() < rate) u.meleeUpgrade = pick(WEAPON_UPGRADES[ch.melee], rnd).id;
    if (rnd() < rate * 0.5) { u.equipment = pick(EQUIP_IDS, rnd); u.equipmentUpgrade = pick(EQUIPMENT_UPGRADES[u.equipment], rnd).id; }
    else if (rnd() < rate) u.equipmentUpgrade = pick(EQUIPMENT_UPGRADES[u.equipment], rnd).id;
    legalise(u, rnd);
  }
  for (const k of WEIGHT_KEYS) {
    if (rnd() < rate) out.weights[k] = +Math.max(0, out.weights[k] * (0.6 + rnd() * 0.8) + (rnd() - 0.5) * 0.3).toFixed(2);
  }
  return out;
}

const disjoint = (g1, g2) => !g1.squad.some((u) => g2.squad.some((v) => v.chassis === u.chassis));

// Plan this generation's pairings: every genome meets `gamesPer` disjoint foes.
// Sides alternate so neither genome always gets the A deployment corner.
function planPairings(pop, gamesPer, rnd) {
  const pairs = [];
  for (let i = 0; i < pop.length; i++) {
    const foes = pop.map((_, j) => j).filter((j) => j !== i && disjoint(pop[i], pop[j]));
    for (let k = 0; k < gamesPer && foes.length; k++) {
      const j = foes.splice(Math.floor(rnd() * foes.length), 1)[0];
      pairs.push(k % 2 === 0 ? [i, j] : [j, i]);
    }
  }
  return pairs;
}

export function matchJob(ga, gb, seed) {
  return { squads: { a: ga.squad, b: gb.squad }, weights: { a: ga.weights, b: gb.weights }, seed };
}

// Fold one finished game into the running balance tallies.
function tally(stats, genome, won, drew, dmg) {
  for (const u of genome.squad) {
    for (const key of [`chassis:${u.chassis}`, `lr:${u.longRangeUpgrade}`, `melee:${u.meleeUpgrade}`, `equip:${u.equipment}`, `equipUp:${u.equipmentUpgrade}`]) {
      const s = (stats[key] ||= { games: 0, wins: 0, draws: 0, dmg: 0 });
      s.games++; s.wins += won ? 1 : 0; s.draws += drew ? 1 : 0; s.dmg += dmg;
    }
  }
}

// evolve({ population, generations, gamesPer, seed, evaluate, onGeneration })
// `evaluate(jobs) → Promise<results[]>` plays a batch of matches (default: inline).
export async function evolve(opts = {}) {
  const {
    population = 12, generations = 6, gamesPer = 2, seed = 1, eliteFrac = 0.25,
    mutationRate = 0.25, composition = DEFAULT_COMPOSITION,
    evaluate = async (jobs) => jobs.map((j) => playMatch(j)),
    onGeneration = () => {}, shouldStop = () => false,
  } = opts;
  const rnd = mulberry32(seed);
  let pop = Array.from({ length: population }, () => randomGenome(rnd, composition));
  const stats = {};
  const history = [];
  let bestEver = null;
  let seedCounter = seed * 1000;

  for (let gen = 0; gen < generations && !shouldStop(); gen++) {
    const pairs = planPairings(pop, gamesPer, rnd);
    const jobs = pairs.map(([i, j]) => matchJob(pop[i], pop[j], ++seedCounter));
    const results = await evaluate(jobs);
    const score = pop.map(() => ({ w: 0, g: 0, vp: 0 }));
    results.forEach((res, n) => {
      const [i, j] = pairs[n];
      const drew = res.winner == null;
      for (const [idx, side, other] of [[i, "a", 1], [j, "b", 0]]) {
        const won = res.winner === side;
        score[idx].g++;
        score[idx].w += won ? 1 : drew ? 0.5 : 0;
        score[idx].vp += res.vp[side === "a" ? 0 : 1] - res.vp[other];
        tally(stats, pop[idx], won, drew, res.stats?.[side]?.dmgDealt ?? 0);
      }
    });
    // Fitness: win rate, with VP margin as a small tie-breaker.
    const ranked = pop.map((g, i) => ({
      g, fitness: score[i].g ? score[i].w / score[i].g + score[i].vp / (score[i].g * 100) : 0, games: score[i].g,
    })).sort((x, y) => y.fitness - x.fitness);
    if (!bestEver || ranked[0].fitness >= bestEver.fitness) bestEver = structuredClone(ranked[0]);
    history.push({
      generation: gen, best: ranked[0].fitness, mean: ranked.reduce((s, r) => s + r.fitness, 0) / ranked.length,
      bestSquad: ranked[0].g.squad.map((u) => u.chassis),
    });
    onGeneration({ generation: gen, ranked, history, stats, pairs, jobs, results });

    const elite = ranked.slice(0, Math.max(2, Math.round(population * eliteFrac))).map((r) => r.g);
    // Tournament selection over the top half.
    const pool = ranked.slice(0, Math.max(2, Math.ceil(population / 2))).map((r) => r.g);
    const tourney = () => { const a = pick(pool, rnd), b = pick(pool, rnd); return pool.indexOf(a) < pool.indexOf(b) ? a : b; };
    const next = elite.map((g) => structuredClone(g));
    while (next.length < population) next.push(mutate(crossover(tourney(), tourney(), rnd), rnd, mutationRate));
    pop = next;
  }
  return { population: pop, best: bestEver, history, stats: summarise(stats) };
}

// Tallies → sorted table rows { key, kind, id, games, winRate, avgDmg }.
export function summarise(stats) {
  return Object.entries(stats).map(([key, s]) => {
    const [kind, id] = key.split(":");
    return { key, kind, id, games: s.games, winRate: s.games ? (s.wins + s.draws * 0.5) / s.games : 0, avgDmg: s.games ? s.dmg / s.games : 0 };
  }).sort((a, b) => a.kind.localeCompare(b.kind) || b.winRate - a.winRate);
}
