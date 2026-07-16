// The scorer — one weighted sum per candidate, and the PRESETS that make a bot a
// personality. This is where the tuning churn lives, kept apart from evaluate.js
// (the maths) because the two change for different reasons.
//
//   score = w.vp       × objectiveVpDelta   // take / hold / contest a marker (E2 control)
//         + w.priority  × priorityProgress   // the game's only kill-VP (+2)
//         + w.damage    × offence            // v1: expectedHits me→them
//         − w.threat    × exposure           // the SAME metric, every enemy's best against me
//         − w.heat      × overheatRisk        // heat pushed past the class cap
//         − w.fragile   × exposureOfWeak      // exposure, weighted up when a part is nearly dead
//
// offence and exposure are the SAME metric pointed in opposite directions — both
// call evaluate.js — so the deferred damage swap upgrades attack and defence
// together and the bot can never value its own shots by one yardstick and the
// enemy's by another.
//
// THE 1-PLY LOOKAHEAD is the whole ballgame: a move candidate's offence is the
// best shot available AFTER arriving (bestShotFrom, re-deriving geometry at the
// destination), so "move to the rear arc, then shoot" emerges from the maths
// instead of being special-cased.
//
// exposure assumes STATIC enemies — each living enemy's best shot from where it
// stands NOW. It does not model the enemy closing first. Documented blind spot
// (see the spec); the cheap partial fix, if the bot proves bait-able, is to
// inflate each enemy's threat range by its moveBudget rather than to search.
import { expectedHits } from "./evaluate.js";
import { availableActions } from "../battle-view.js";
import {
  arcOf, sightCorridor, distanceBetween, meleeInReach, controlsObjective,
  radiusOf, terrainPolygons,
} from "../geometry.js";
import { spatial, effectiveWeaponProfile, meleeReachOf, findRig, LOCS } from "../game-state.js";
import { HEAT_CAPACITY } from "../rules.js";

export const PRESETS = {
  // vp leads, offence and defence balanced.
  balanced:   { vp: 3, priority: 2, damage: 1,   threat: 1,   heat: 1,   fragile: 1 },
  // damage over vp, and it will trade hits it shouldn't — a brawler.
  aggressive: { vp: 2, priority: 2, damage: 3,   threat: 0.5, heat: 0.5, fragile: 0.5 },
  // vp and self-preservation over damage — sits on markers, refuses its rear.
  cagey:      { vp: 4, priority: 1, damage: 0.5, threat: 2,   heat: 1.5, fragile: 2 },
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
// tPos/tFacing): its best expectedHits with whichever weapon bears, or 0 if the
// target is not in the attacker's front arc / not in LOS+band / not in reach.
// The single primitive behind BOTH offence (my best shot) and exposure (the
// enemy's best shot at me) — same yardstick, opposite ends.
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
    best = Math.max(best, expectedHits(attacker, target, "longRange", opts));
  }
  if (meleeInReach(A, T, meleeReachOf(attacker))) {
    best = Math.max(best, expectedHits(attacker, target, "melee", opts));
  }
  return best;
}

// My best shot from a pose — the leaf the 1-ply move lookahead evaluates.
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

// This candidate's offence: a declared shot's expectedHits, or a move's best shot
// after arriving (the 1-ply lookahead), or 0 for a non-attacking action.
function offenceAt(room, rig, cand, pos, facing) {
  if (cand.action === "fire" || cand.action === "aimed") {
    const target = findRig(room, cand.target);
    if (!target) return 0;
    return expectedHits(rig, target, cand.weapon, { arc: cand.arc, distance: cand.distance, cover: cand.cover, round: room.game.round });
  }
  if (cand.action === "move" || cand.action === "sprint") {
    return bestShotFrom(room, rig, pos, facing);
  }
  return 0;
}

// VP I would score from objectives at `pos`: a marker I control that no living
// enemy also controls (E2's contested-scores-nobody rule, read forward).
function objectiveVpAt(room, rig, pos) {
  const me = { pos, radius: radiusOf(rig) };
  let vp = 0;
  for (const m of room.game.objectives || []) {
    if (!controlsObjective(me, m)) continue;
    const contested = livingEnemies(room, rig).some((e) => controlsObjective(spatial(e), m));
    if (!contested) vp += (m.vp || 0);
  }
  return vp;
}

// Progress toward the +2 Priority Elimination kill: offence aimed specifically at
// my assigned Priority Target (a declared shot at it, or a move's best shot at it).
function priorityProgress(room, rig, cand, pos, facing) {
  const pid = room.game.priorityTargets?.[rig.owner || "a"];
  if (pid == null) return 0;
  const pt = room.rigs.find((r) => r.id === pid && !r.destroyed && r.pos);
  if (!pt) return 0;
  if ((cand.action === "fire" || cand.action === "aimed") && cand.target === pt.name) {
    return expectedHits(rig, pt, cand.weapon, { arc: cand.arc, distance: cand.distance, cover: cand.cover, round: room.game.round });
  }
  if (cand.action === "move" || cand.action === "sprint") {
    return shotValue(room, rig, pos, facing, pt, pt.pos, pt.facing);
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

// Risk of pushing past the class heat cap — a linear penalty for heat over the
// cap after the action. Below the cap it is free; a misfire only threatens once
// the engine is redlined.
function overheatRisk(room, rig, turn, cand) {
  const cap = HEAT_CAPACITY[rig.weightClass];
  if (cap == null) return 0;
  const projected = (rig.engine?.heat || 0) + candidateHeat(rig, turn, room.game.round, cand);
  return Math.max(0, projected - cap);
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

// Score one candidate under a weight vector. Higher is better; the caller picks
// the argmax (Task 4.1), and returns null rather than act when the best is ≤ 0.
export function scoreCandidate(room, rig, cand, weights) {
  const w = weights;
  const { pos, facing } = resultingPose(rig, cand);
  const turn = room.game.turn;
  const offence = offenceAt(room, rig, cand, pos, facing);
  const exposure = exposureAt(room, rig, pos, facing);
  const vp = objectiveVpAt(room, rig, pos);
  const priority = priorityProgress(room, rig, cand, pos, facing);
  const heat = overheatRisk(room, rig, turn, cand);
  const fragile = exposure * fragility(rig);
  return (w.vp || 0) * vp
    + (w.priority || 0) * priority
    + (w.damage || 0) * offence
    - (w.threat || 0) * exposure
    - (w.heat || 0) * heat
    - (w.fragile || 0) * fragile;
}
