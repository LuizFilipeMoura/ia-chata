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
import { PRESETS, BIAS_FAMILIES } from "../bot/score.js";
import { mulberry32, playMatch } from "./match.js";

export const WEIGHT_KEYS = ["vp", "priority", "damage", "threat", "heat", "fragile", "tactics"];
// Additive action-preference genes (see score.js BIAS_FAMILIES), centred on 0.
export const BIAS_KEYS = BIAS_FAMILIES.map((f) => `b_${f}`);
const EQUIP_IDS = Object.keys(EQUIPMENT);

// Default composition: 1 medium + 2 lights per side. Both sides must mirror
// weight classes (§3) and no chassis may appear twice on the field, so squads
// that meet must be disjoint — there are 4 mediums, so 1M leaves room to pair.
export const DEFAULT_COMPOSITION = { medium: 1, light: 2 };
// The squad makeups the GA may explore (3 rigs; only 4 mediums exist, so two
// disjoint 2M squads is the ceiling). The server's parity rule means genomes only
// ever meet a foe with the SAME makeup — the GA can't field what a player can't.
export const COMPOSITIONS = [{ medium: 1, light: 2 }, { medium: 2, light: 1 }, { light: 3 }];
const CLASS_OF = (id) => CHASSIS.find((c) => c.id === id)?.class;
export function compKey(g) {
  const n = { medium: 0, light: 0 };
  for (const u of g.squad) n[CLASS_OF(u.chassis)]++;
  return `${n.medium}M${n.light}L`;
}
// Tables a run can span; each match is played on one (alternating).
export const TABLES = { standard: { width: 54, height: 36 }, skirmish: { width: 42, height: 28 } };

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
  return {
    ...Object.fromEntries(WEIGHT_KEYS.map((k) => [k, +((base[k] ?? 1) * (0.5 + rnd())).toFixed(2)])),
    ...Object.fromEntries(BIAS_KEYS.map((k) => [k, +((rnd() - 0.5) * 0.6).toFixed(2)])),
  };
}

// A stable identity for a genome (squad + picks + rounded pilot), for pooling.
export function genomeSignature(g) {
  const sq = g.squad.map((u) => [u.chassis, u.longRangeUpgrade, u.meleeUpgrade, u.equipment, u.equipmentUpgrade].join("/")).sort().join("|");
  const w = [...WEIGHT_KEYS, ...BIAS_KEYS].map((k) => (g.weights?.[k] ?? 0).toFixed(1)).join(",");
  return `${sq}#${w}`;
}

// Re-validate a stored genome against the CURRENT catalogue: unknown chassis or
// a squad that no longer fits a makeup → dropped; unknown upgrades/equipment →
// re-rolled; one-Prototype rule re-applied; missing pilot genes filled. Genes
// react to the rules; they never carry old rules forward.
export function sanitiseGenome(g, rnd = Math.random) {
  if (!g?.squad?.length) return null;
  const ids = g.squad.map((u) => u.chassis);
  if (new Set(ids).size !== ids.length || ids.some((id) => !CHASSIS.find((c) => c.id === id))) return null;
  const n = { medium: 0, light: 0 };
  ids.forEach((id) => { n[CLASS_OF(id)]++; });
  if (!COMPOSITIONS.some((c) => (c.medium || 0) === n.medium && (c.light || 0) === n.light)) return null;
  const squad = g.squad.map((u) => {
    const ch = CHASSIS.find((c) => c.id === u.chassis);
    const ok = (list, id) => list?.some((x) => x.id === id);
    const out = { ...u };
    if (!ok(WEAPON_UPGRADES[ch.longRange], out.longRangeUpgrade)) out.longRangeUpgrade = pick(WEAPON_UPGRADES[ch.longRange], rnd).id;
    if (!ok(WEAPON_UPGRADES[ch.melee], out.meleeUpgrade)) out.meleeUpgrade = pick(WEAPON_UPGRADES[ch.melee], rnd).id;
    if (!EQUIP_IDS.includes(out.equipment)) out.equipment = pick(EQUIP_IDS, rnd);
    if (!ok(EQUIPMENT_UPGRADES[out.equipment], out.equipmentUpgrade)) out.equipmentUpgrade = pick(EQUIPMENT_UPGRADES[out.equipment], rnd).id;
    return legalise(out, rnd);
  });
  const weights = Object.fromEntries([
    ...WEIGHT_KEYS.map((k) => [k, Number.isFinite(g.weights?.[k]) ? g.weights[k] : PRESETS.balanced[k] ?? 1]),
    ...BIAS_KEYS.map((k) => [k, Number.isFinite(g.weights?.[k]) ? g.weights[k] : 0]),
  ]);
  return { squad, weights };
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
  // Slots line up only between squads of the same makeup; otherwise inherit p1's.
  const same = compKey(p1) === compKey(p2);
  const squad = p1.squad.map((u, i) => structuredClone(same && rnd() < 0.5 ? p2.squad[i] : u));
  repairDuplicates(squad, rnd);
  const weights = Object.fromEntries([...WEIGHT_KEYS, ...BIAS_KEYS].map((k) => [k, rnd() < 0.5 ? (p1.weights[k] ?? 0) : (p2.weights[k] ?? 0)]));
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

function mutate(g, rnd, rate, compositions) {
  const out = structuredClone(g);
  // Rarely, try a whole different squad makeup (keeps the pilot).
  if (compositions && compositions.length > 1 && rnd() < rate * 0.15) {
    const key = (c) => `${c.medium || 0}M${c.light || 0}L`;
    const others = compositions.filter((c) => key(c) !== compKey(out));
    if (others.length) { out.squad = randomGenome(rnd, pick(others, rnd)).squad; return out; }
  }
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
  // Biases drift additively and may go negative (a pilot that avoids an action).
  for (const k of BIAS_KEYS) {
    if (rnd() < rate) out.weights[k] = +Math.max(-2, Math.min(2, (out.weights[k] ?? 0) + (rnd() - 0.5) * 0.5)).toFixed(2);
  }
  return out;
}

const disjoint = (g1, g2) => !g1.squad.some((u) => g2.squad.some((v) => v.chassis === u.chassis));

// Plan this generation's pairings: every genome meets `gamesPer` disjoint foes.
// Sides alternate so neither genome always gets the A deployment corner.
// A legal foe for `g` when the population has none (small makeup groups often
// all share a chassis): clone a same-makeup genome (or g's own pilot) and swap
// every clashing chassis for an unused one of the same class. Its result isn't
// scored — it only exists so g gets a game.
function sparringPartner(g, pop, rnd) {
  const same = pop.filter((x) => x !== g && compKey(x) === compKey(g));
  const base = structuredClone(same.length ? pick(same, rnd) : g);
  const taken = new Set(g.squad.map((u) => u.chassis));
  base.squad = base.squad.map((u) => {
    if (!taken.has(u.chassis)) { taken.add(u.chassis); return u; }
    const cls = CLASS_OF(u.chassis);
    const free = CHASSIS.filter((c) => c.class === cls && !taken.has(c.id) && !base.squad.some((v) => v.chassis === c.id));
    const nu = randomUnit(pick(free, rnd).id, rnd);
    taken.add(nu.chassis);
    return nu;
  });
  base.spar = true;
  return base;
}

// Plan this generation's pairings: every genome meets `gamesPer` legal foes
// (disjoint chassis, mirrored weight classes — what the server allows). Pairs are
// [i, j] population indices; j may be a sparring genome object instead.
// Sides alternate so neither genome always gets the A deployment corner.
function planPairings(pop, gamesPer, rnd) {
  const pairs = [];
  for (let i = 0; i < pop.length; i++) {
    const foes = pop.map((_, j) => j).filter((j) => j !== i && disjoint(pop[i], pop[j]) && compKey(pop[i]) === compKey(pop[j]));
    for (let k = 0; k < gamesPer; k++) {
      const j = foes.length ? foes.splice(Math.floor(rnd() * foes.length), 1)[0] : sparringPartner(pop[i], pop, rnd);
      pairs.push(k % 2 === 0 ? [i, j] : [j, i]);
    }
  }
  return pairs;
}

export function matchJob(ga, gb, seed) {
  return { squads: { a: ga.squad, b: gb.squad }, weights: { a: ga.weights, b: gb.weights }, seed };
}

// Fold one finished game into the running balance tallies.
function tally(stats, genome, won, drew, dmg, tableId) {
  const add = (key) => {
    const s = (stats[key] ||= { games: 0, wins: 0, draws: 0, dmg: 0 });
    s.games++; s.wins += won ? 1 : 0; s.draws += drew ? 1 : 0; s.dmg += dmg;
  };
  add(`comp:${compKey(genome)}`);
  if (tableId) add(`table:${tableId}`);
  for (const u of genome.squad) {
    if (tableId) add(`chassis@${tableId}:${u.chassis}`);
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
    // compositions: makeups to explore ("all" → COMPOSITIONS); tables: table ids
    // from TABLES to alternate matches across.
    compositions: compOpt = null, tables = null,
    // seedPopulation: genomes (e.g. from the gene pool) to start from — the run
    // fine-tunes the previous meta instead of starting from scratch.
    seedPopulation = [],
    evaluate = async (jobs) => jobs.map((j) => playMatch(j)),
    onGeneration = () => {}, shouldStop = () => false,
  } = opts;
  const rnd = mulberry32(seed);
  const compositions = compOpt === "all" ? COMPOSITIONS : Array.isArray(compOpt) ? compOpt : null;
  const tableIds = Array.isArray(tables) && tables.length ? tables.filter((t) => TABLES[t]) : null;
  // Seed the population evenly across makeups so each has foes to meet.
  // At most 75% seeds — the rest stay random so the run can still find
  // something the old meta never tried.
  const seeds = (seedPopulation || []).map((g) => sanitiseGenome(g, rnd)).filter(Boolean)
    .filter((g) => !compositions ? compKey(g) === `${composition.medium || 0}M${composition.light || 0}L` : true)
    .slice(0, Math.floor(population * 0.75));
  let pop = [...seeds, ...Array.from({ length: population - seeds.length }, (_, i) => randomGenome(rnd, compositions ? compositions[i % compositions.length] : composition))];
  const stats = {};
  const history = [];
  let bestEver = null;
  let lastRanked = [];
  let seedCounter = seed * 1000;

  for (let gen = 0; gen < generations && !shouldStop(); gen++) {
    const pairs = planPairings(pop, gamesPer, rnd);
    const G = (x) => (typeof x === "number" ? pop[x] : x);
    const jobs = pairs.map(([i, j], n) => {
      const job = matchJob(G(i), G(j), ++seedCounter);
      if (tableIds) { job.tableId = tableIds[n % tableIds.length]; job.table = TABLES[job.tableId]; }
      return job;
    });
    const results = await evaluate(jobs);
    const score = pop.map(() => ({ w: 0, g: 0, vp: 0 }));
    results.forEach((res, n) => {
      const [i, j] = pairs[n];
      const drew = res.winner == null;
      if (res.error) return;   // an illegal/crashed game scores nobody
      for (const [idx, side, other] of [[i, "a", 1], [j, "b", 0]]) {
        if (typeof idx !== "number") continue;   // sparring partner — not scored
        const won = res.winner === side;
        score[idx].g++;
        score[idx].w += won ? 1 : drew ? 0.5 : 0;
        score[idx].vp += res.vp[side === "a" ? 0 : 1] - res.vp[other];
        tally(stats, pop[idx], won, drew, res.stats?.[side]?.dmgDealt ?? 0, jobs[n].tableId);
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
    lastRanked = ranked;
    onGeneration({ generation: gen, ranked, history, stats, pairs, jobs, results });

    const elite = ranked.slice(0, Math.max(2, Math.round(population * eliteFrac))).map((r) => r.g);
    // Tournament selection over the top half.
    const pool = ranked.slice(0, Math.max(2, Math.ceil(population / 2))).map((r) => r.g);
    const tourney = () => { const a = pick(pool, rnd), b = pick(pool, rnd); return pool.indexOf(a) < pool.indexOf(b) ? a : b; };
    const next = elite.map((g) => structuredClone(g));
    while (next.length < population) next.push(mutate(crossover(tourney(), tourney(), rnd), rnd, mutationRate, compositions));
    pop = next;
  }
  return { population: pop, best: bestEver, history, stats: summarise(stats), finalRanked: lastRanked, seeded: seeds.length };
}

// Tallies → sorted table rows { key, kind, id, games, winRate, avgDmg }.
// 95% Wilson score interval for a win rate over n games — how much of a row's
// number is signal vs dice. A row whose interval straddles 50% isn't proven
// strong or weak yet.
export function wilson(rate, n, z = 1.96) {
  if (!n) return [0, 1];
  const d = 1 + (z * z) / n;
  const c = (rate + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((rate * (1 - rate)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export function summarise(stats) {
  return Object.entries(stats).map(([key, s]) => {
    const i = key.indexOf(":");
    const kind = key.slice(0, i), id = key.slice(i + 1);
    const winRate = s.games ? (s.wins + s.draws * 0.5) / s.games : 0;
    const [ciLow, ciHigh] = wilson(winRate, s.games);
    return { key, kind, id, games: s.games, winRate, ciLow, ciHigh, avgDmg: s.games ? s.dmg / s.games : 0 };
  }).sort((a, b) => a.kind.localeCompare(b.kind) || b.winRate - a.winRate);
}
