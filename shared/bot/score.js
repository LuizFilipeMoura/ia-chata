// The scorer, one weighted sum per candidate, and the PRESETS that make a bot a
// personality. This is where the tuning churn lives, kept apart from evaluate.js
// (the maths) because the two change for different reasons.
//
//   score = w.vp       × objectiveVpDelta   // take / hold / contest a marker (E2 control)
//         + w.priority  × killProgress       // kill VP: +1 any wreck, +2 more on the Priority Target
//         + w.damage    × offence            // expectedDamage me→them
//         − w.threat    × exposure           // the SAME metric, every enemy's best against me
//         − w.heat      × overheatRisk        // heat pushed past the class cap
//         − w.fragile   × exposureOfWeak      // exposure, weighted up when a part is nearly dead
//
// offence and exposure are the SAME metric pointed in opposite directions, both
// call evaluate.js, so the deferred damage swap upgrades attack and defence
// together and the bot can never value its own shots by one yardstick and the
// enemy's by another.
//
// THE 1-PLY LOOKAHEAD is the whole ballgame: a move candidate's offence is the
// best shot available AFTER arriving (bestShotFrom, re-deriving geometry at the
// destination), so "move to the rear arc, then shoot" emerges from the maths
// instead of being special-cased.
//
// exposure assumes STATIC enemies, each living enemy's best shot from where it
// stands NOW. It does not model the enemy closing first. Documented blind spot
// (see the spec); the cheap partial fix, if the bot proves bait-able, is to
// inflate each enemy's threat range by its moveBudget rather than to search.
import { expectedDamage } from "./evaluate.js";
import { availableActions } from "../battle-view.js";
import {
  arcOf, sightCorridor, distanceBetween, meleeInReach, controlsObjective,
  radiusOf, terrainPolygons,
} from "../geometry.js";
import { spatial, effectiveWeaponProfile, meleeReachOf, findRig, LOCS, ANY_KILL_VP, KILL_VP, TRAILING_KILL_BOUNTY, beaconMultiplier } from "../game-state.js";
import { HEAT_CAPACITY } from "../rules.js";

import { META } from "./meta.js";

export const PRESETS = {
  // vp leads, offence and defence balanced.
  balanced:   { vp: 3, priority: 2, damage: 1,   threat: 1,   heat: 1,   fragile: 1,   tactics: 1 },
  // damage over vp, and it will trade hits it shouldn't, a brawler.
  aggressive: { vp: 2, priority: 2, damage: 3,   threat: 0.5, heat: 0.5, fragile: 0.5, tactics: 0.7 },
  // vp and self-preservation over damage, sits on markers, refuses its rear.
  cagey:      { vp: 4, priority: 1, damage: 0.5, threat: 2,   heat: 1.5, fragile: 2,   tactics: 1.3 },
  // Difficulty tiers (the solo-play opponent). Easy is short-sighted about heat
  // and objectives and blunders (see TIERS); Normal is the balanced pilot; Hard
  // flies the GA champion's weights (meta.js).
  easy:       { vp: 0.6, priority: 0.3, damage: 1.5, threat: 0,   heat: 0.15, fragile: 0,  tactics: 0.2, reckless: true },
  normal:     { vp: 3, priority: 2, damage: 1,   threat: 1,   heat: 1,   fragile: 1,   tactics: 1 },
  hard:       META.weights,
};

// Easy is a reckless brawler: chases damage, shrugs at heat and exposure, barely
// notices objectives. Per-tier decision noise: `blunder` is the chance an action is picked at random
// from the top few (a plausible-but-wrong call rather than a nonsense one).
export const TIERS = {
  easy:   { blunder: 0.55, topK: 8 },
  normal: { blunder: 0.1, topK: 3 },
  hard:   { blunder: 0, topK: 1 },
};

const livingEnemies = (room, rig) =>
  room.rigs.filter((r) => (r.owner || "a") !== (rig.owner || "a") && !r.destroyed && r.pos);

// The pose the rig ends this candidate in: a move relocates it, everything else
// leaves it where it stands. The whole positional half of the score reads this.
function resultingPose(rig, cand) {
  if ((cand.action === "move" || cand.action === "sprint") && cand.dest) {
    return { pos: cand.dest, facing: cand.facing };
  }
  return { pos: rig.pos, facing: rig.facing };
}

// The value of `attacker` (posed at aPos/aFacing) shooting `target` (posed at
// tPos/tFacing): its best expectedDamage with whichever weapon bears, or 0 if the
// target is not in the attacker's front arc / not in LOS+band / not in reach.
// The single primitive behind BOTH offence (my best shot) and exposure (the
// enemy's best shot at me), same yardstick, opposite ends.
function shotValue(room, attacker, aPos, aFacing, target, tPos, tFacing) {
  const A = { pos: aPos, facing: aFacing, radius: radiusOf(attacker) };
  const T = { pos: tPos, facing: tFacing, radius: radiusOf(target) };
  if (arcOf(T, A) !== "front") return 0;              // target not in the attacker's front arc
  const polys = terrainPolygons(room.field);
  const corridor = sightCorridor(A, T, polys);
  const arc = arcOf(A, T);                            // which of the target's facings is struck
  const distance = distanceBetween(A, T);
  const opts = { arc, distance, cover: corridor.cover, round: room.game.round };
  let best = 0;
  const lr = effectiveWeaponProfile("longRange", attacker.weapons?.longRange, attacker);
  if (corridor.los && lr && attacker.loaded?.longRange !== false
      && distance >= (lr.minRange ?? 0) && distance <= (lr.maxRange ?? Infinity)) {
    best = Math.max(best, expectedDamage(attacker, target, "longRange", opts));
  }
  if (meleeInReach(A, T, meleeReachOf(attacker))) {
    best = Math.max(best, expectedDamage(attacker, target, "melee", opts));
  }
  return best;
}

// My best shot from a pose, the leaf the 1-ply move lookahead evaluates.
function bestShotFrom(room, rig, pos, facing) {
  let best = 0;
  for (const e of livingEnemies(room, rig)) {
    best = Math.max(best, shotValue(room, rig, pos, facing, e, e.pos, e.facing));
  }
  return best;
}

// Every living enemy's best shot at me, posed here, from where each stands now.
function exposureAt(room, rig, pos, facing) {
  let total = 0;
  for (const e of livingEnemies(room, rig)) {
    total += shotValue(room, e, e.pos, e.facing, rig, pos, facing);
  }
  return total;
}

// How much damage the enemy can pour into this rig from where everyone stands
// now: the round-start Grit spend reads it to pick which prep to upgrade.
export function exposureOf(room, rig) {
  return rig?.pos ? exposureAt(room, rig, rig.pos, rig.facing) : 0;
}

// A declared shot's expectedDamage. An Aimed Shot is priced as what it is: the
// aim penalty (computeModifiedAim reads `aimed`) at the chosen location.
function declaredShot(room, rig, cand, target) {
  return expectedDamage(rig, target, cand.weapon, {
    arc: cand.arc, distance: cand.distance, cover: cand.cover, round: room.game.round,
    ...(cand.action === "aimed" ? { aimed: true, location: cand.location } : {}),
  });
}

// This candidate's offence: a declared shot's expectedDamage, or a move's best shot
// after arriving (the 1-ply lookahead), or 0 for a non-attacking action.
function offenceAt(room, rig, cand, pos, facing, shots) {
  if (cand.action === "fire" || cand.action === "aimed") {
    const target = findRig(room, cand.target);
    if (!target) return 0;
    return declaredShot(room, rig, cand, target);
  }
  if (cand.action === "move" || cand.action === "sprint") {
    return shots ? Math.max(0, ...shots.map((s) => s.v)) : bestShotFrom(room, rig, pos, facing);
  }
  return 0;
}

// A move's shot at every living enemy from its destination, swept once and
// shared by offence and killProgress.
function shotsFrom(room, rig, pos, facing) {
  return livingEnemies(room, rig).map((e) => ({ e, v: shotValue(room, rig, pos, facing, e, e.pos, e.facing) }));
}

// VP I would score from objectives at `pos`: a marker I control that no living
// enemy also controls (E2's contested-scores-nobody rule, read forward), at this
// round's beacon multiplier (§11 escalation), since it pays at this Recovery.
function objectiveVpAt(room, rig, pos) {
  const me = { pos, radius: radiusOf(rig) };
  const mult = beaconMultiplier(room.game.round, room.game.suddenDeath);
  let vp = 0;
  for (const m of room.game.objectives || []) {
    if (!controlsObjective(me, m)) continue;
    const contested = livingEnemies(room, rig).some((e) => controlsObjective(spatial(e), m));
    if (!contested) vp += (m.vp || 0) * mult;
  }
  return vp;
}

// A distance PULL toward the nearest marker the rig does not yet control. Binary
// control (objectiveVpAt) gives no gradient until you are already on the marker,
// so without this a rig stranded a full move away from every objective scores 0
// for advancing and simply stands still, which is exactly what bot-vs-bot caught.
// The pull is vp/(1+gap): always well under a real control (gap ≥ 0 ⇒ ≤ vp), and
// growing as the rig closes, so "walk to the objective, then hold it" emerges.
// Priced at the richer of this round's and next round's multiplier: a rig still
// walking in usually scores at a later Recovery, so it heads for a beacon that is
// about to escalate.
function objectiveApproach(room, rig, pos) {
  const me = { pos, radius: radiusOf(rig) };
  const g = room.game;
  const mult = Math.max(beaconMultiplier(g.round, g.suddenDeath), beaconMultiplier((g.round || 1) + 1, g.suddenDeath));
  let best = 0;
  for (const m of g.objectives || []) {
    if (controlsObjective(me, m)) continue;   // already priced by objectiveVpAt
    const gap = Math.hypot(pos.x - m.x, pos.y - m.y);
    best = Math.max(best, ((m.vp || 0) * mult) / (1 + gap));
  }
  // Campaign Breakthrough: the breaking side is pulled hard toward the exit zone.
  const exit = room.campaign?.type === "breakthrough" && (rig.owner || "a") === "a" ? room.campaign.exit : null;
  if (exit) {
    const gap = Math.max(0, Math.hypot(pos.x - exit.x, pos.y - exit.y) - exit.r);
    best = Math.max(best, EXIT_PULL / (1 + gap * 0.25));
  }
  // Campaign Assassination / Boss: hunt the commander down.
  const cid = (rig.owner || "a") === "a" ? room.campaign?.commanderId : null;
  const commander = cid != null ? room.rigs.find((r) => r.id === cid && !r.destroyed && r.pos) : null;
  if (commander) {
    const gap = Math.max(0, Math.hypot(pos.x - commander.pos.x, pos.y - commander.pos.y) - 6);
    best = Math.max(best, EXIT_PULL / (1 + gap * 0.25));
  }
  return best;
}
const EXIT_PULL = 10;

// Kill VP a wreck of `target` would pay my side, relative to the richest kill
// (the Priority Target, ANY_KILL_VP + KILL_VP), so the Priority Target keeps the
// scale the evolved weights were tuned on and any other enemy is worth its share
// (1/3). A side strictly behind the target's owner also collects the trailing
// kill bounty (§11), so its kills weigh more. Doubled toward a target with a
// part near 0: damage there is closer to actually landing the kill.
function killWeight(room, rig, target) {
  const mine = rig.owner || "a";
  const pid = room.game.priorityTargets?.[mine];
  const vpOf = (id) => room.game.sides.find((s) => s.id === id)?.vp || 0;
  const behind = vpOf(mine) < vpOf(target.owner || "a");
  // A campaign commander ends the battle: worth far more than any VP.
  const commander = room.campaign?.commanderId === target.id && mine === "a" ? 6 : 0;
  const vp = ANY_KILL_VP + (target.id === pid ? KILL_VP : 0) + (behind ? TRAILING_KILL_BOUNTY : 0) + commander;
  return (vp / (ANY_KILL_VP + KILL_VP)) * (1 + fragility(target));
}

// Progress toward kill VP: offence at an enemy scaled by what its wreck pays
// (a declared shot at it, or a move's best kill-weighted shot on arrival).
function killProgress(room, rig, cand, pos, facing, shots) {
  if (cand.action === "fire" || cand.action === "aimed") {
    const target = findRig(room, cand.target);
    if (!target || target.destroyed) return 0;
    return declaredShot(room, rig, cand, target) * killWeight(room, rig, target);
  }
  if (cand.action === "move" || cand.action === "sprint") {
    let best = 0;
    for (const { e, v } of shots || shotsFrom(room, rig, pos, facing)) {
      if (v > 0) best = Math.max(best, v * killWeight(room, rig, e));
    }
    return best;
  }
  return 0;
}

// Heat this candidate adds, read from the same action menu the human sees.
function candidateHeat(rig, turn, round, cand) {
  for (const a of availableActions(rig, turn, round)) {
    if (a.key === cand.action) return a.heat || 0;
  }
  return 0;
}

export const HEAT_CROSS = 6;
export const HEAT_STEP = 3;
export const HEAT_DEBT = 1.2;
export const HEAT_WEIGHT_FLOOR = 1;
// Risk of pushing past the class heat cap, a linear penalty for heat over the
// cap after the action. Below the cap it is free; a misfire only threatens once
// the engine is redlined.
function overheatRisk(room, rig, turn, cand) {
  const cap = HEAT_CAPACITY[rig.weightClass];
  if (cap == null) return 0;
  const heatNow = rig.engine?.heat || 0;
  if (cand.action === "shutdown") return 0;
  const projected = heatNow + candidateHeat(rig, turn, room.game.round, cand);
  // Overheat bonus is 2 × excess on a D12 whose bad rows start at 6, so the
  // real cost grows much faster than linearly. Price each step past the cap at
  // the marginal worsening of the roll, and charge the step that CROSSES the cap
  // extra (it turns a free activation into a roll). Only the heat this action
  // adds is charged: heat already banked is sunk.
  const over = (h) => Math.max(0, h - cap);
  // ⚙ Heat discipline: bots were ending ~40% of activations over Capacity.
  // Crossing the line is priced as a real gamble now, and each step past it
  // costs steeply more.
  const cost = (x) => (x > 0 ? HEAT_CROSS + HEAT_STEP * x * x : 0);
  // Heat debt: every point banked now is a point that has to be vented before
  // the next activation can act freely, so even under-cap heat carries a small
  // price once the engine is past half Capacity.
  const debt = Math.max(0, projected - Math.max(heatNow, cap / 2)) * HEAT_DEBT;
  return cost(over(projected)) - cost(over(heatNow)) + debt;
}

// 0 (all parts fresh) .. →1 (a part at 0 SP). Scales exposure so a rig already
// hurt guards its weak side harder than a fresh one.
function fragility(rig) {
  let minFrac = 1;
  for (const loc of LOCS) {
    const p = rig[loc];
    if (p && p.max > 0 && !p.destroyed) minFrac = Math.min(minFrac, p.sp / p.max);
  }
  return 1 - minFrac;
}

// Living enemies whose base rim sits within `reach` of this rig's rim.
function enemiesNear(room, rig, reach) {
  if (!rig.pos) return [];
  const me = spatial(rig);
  return livingEnemies(room, rig).filter((e) => e.pos
    && Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) - me.radius - spatial(e).radius <= reach);
}

// Rough worth of a signature action (Prototype stance / equipment active). These
// don't deal damage this instant, so offence prices them at 0; this heuristic is
// what lets the bot, and therefore the GA, actually play them. Deliberately
// crude and weighted by w.tactics so evolution can dial it up or down.
function tacticalValue(room, rig, cand, exposure) {
  const heat = rig.engine?.heat || 0;
  const cap = HEAT_CAPACITY[rig.weightClass] ?? 8;
  const t = room.game.turn;
  const left = t ? t.actionsMax - t.actionsUsed : 0;
  switch (cand.action) {
    case "emplace": return exposure > 0 ? 1.5 : 0.4;
    case "unplant": return exposure === 0 ? 0.3 : 0;
    case "barrage": return livingEnemies(room, rig).length ? 1.6 : 0;
    case "lock": return 1.2;
    // One-shot buffs: a second use this activation does nothing.
    case "harden": return rig.hardened ? 0 : exposure * 0.6;
    case "popsmoke": return rig.smokeNextActivation ? 0 : exposure * 0.6;
    case "purge": return heat >= cap - 2 ? 2 : 0;
    // Digital wave: vents AND scalds whoever stands within 3".
    case "heatpurgewave": return (heat >= cap - 2 ? 2 : 0) + enemiesNear(room, rig, 3).length * 0.8;
    case "cryo": {
      if (heat >= cap - 1) return 2;
      const canShoot = livingEnemies(room, rig).some((e) => shotValue(room, rig, rig.pos, rig.facing, e, e.pos, e.facing) > 0);
      return canShoot ? 0.4 * cand.n : 0;
    }
    case "meltdown": {
      if (cand.mode === "burst") return enemiesNear(room, rig, 4).length * cand.n * 0.5;
      const canShoot = livingEnemies(room, rig).some((e) => shotValue(room, rig, rig.pos, rig.facing, e, e.pos, e.facing) > 0);
      return canShoot ? 0.5 * cand.n : 0;
    }
    case "nanite": {
      const stack = rig.equipState?.naniteStacks?.find((x) => x.loc === cand.location);
      return (stack?.sp || 0) >= 3 ? 0 : 0.4 + fragility(rig) * 3;
    }
    // Grapnel reel: drag a victim into this rig's blade.
    case "jumpjets": return cand.mode === "reel" ? 9 : 0;
    case "extract": return 50;
    case "overclock": return left >= 2 && heat + 3 < cap ? 1.4 : 0;
    case "locksight": {
      // Only worth it primed for a shot this activation, and only once.
      if (rig.lockSightNext || left < 2) return 0;
      const canShoot = livingEnemies(room, rig).some((e) => shotValue(room, rig, rig.pos, rig.facing, e, e.pos, e.facing) > 0);
      return canShoot ? 0.6 : 0;
    }
    case "emergencypatch": return fragility(rig) * 3;
    // Shut Down vents 2 heat per unused action and ends the activation, worth it
    // exactly when the rig is about to roll on the overheat table (or close to).
    case "shutdown": {
      const vented = Math.min(heat, Math.min(5, 2 * left));
      const excess = heat - (cap - 1);
      return excess > 0 ? Math.min(vented, excess + 1) * 1.5 : 0;
    }
    default: return 0;
  }
}

// The raw (unweighted) terms of one candidate's score, what the bot "sees".
// Exposed so replays can show the reasoning behind each pick.
export function scoreParts(room, rig, cand) {
  const { pos, facing } = resultingPose(rig, cand);
  const turn = room.game.turn;
  const exposure = exposureAt(room, rig, pos, facing);
  const shots = cand.action === "move" || cand.action === "sprint" ? shotsFrom(room, rig, pos, facing) : null;
  return {
    vp: objectiveVpAt(room, rig, pos) + objectiveApproach(room, rig, pos),
    priority: killProgress(room, rig, cand, pos, facing, shots),
    damage: offenceAt(room, rig, cand, pos, facing, shots),
    threat: -exposure,
    heat: -overheatRisk(room, rig, turn, cand),
    fragile: -exposure * fragility(rig),
    tactics: tacticalValue(room, rig, cand, exposure),
  };
}

// Action-preference genes: a flat bias per action family, evolved by the GA
// (weights.b_<family>, default 0). They let evolution tune how much a pilot
// likes to Prepare, Shut Down, Sprint, use specials… against the real rules,
// even where the hand-written terms above price an action crudely.
export const BIAS_FAMILIES = ["move", "sprint", "fire", "aimed", "prepare", "repair", "shutdown", "special"];
export function actionFamily(action) {
  if (BIAS_FAMILIES.includes(action) && action !== "special") return action;
  if (action === "reload" || action === "disengage" || action === "douse") return "move";
  return "special";
}

// Score one candidate under a weight vector. Higher is better; the caller picks
// the argmax, and returns null rather than act when the best is ≤ 0.
export function scoreCandidate(room, rig, cand, weights) {
  const w = weights;
  const p = scoreParts(room, rig, cand);
  return (w.vp || 0) * p.vp
    + (w.priority || 0) * p.priority
    + (w.damage || 0) * p.damage
    + (w.threat || 0) * p.threat
    // Heat discipline has a floor: evolved weight sets priced heat low and
    // their bots cooked themselves. Only the deliberately reckless Easy pilot
    // gets to ignore it.
    + (w.reckless ? (w.heat || 0) : Math.max(w.heat || 0, HEAT_WEIGHT_FLOOR)) * p.heat
    + (w.fragile || 0) * p.fragile
    + (w.tactics ?? 1) * p.tactics
    + (w[`b_${actionFamily(cand.action)}`] || 0);
}
