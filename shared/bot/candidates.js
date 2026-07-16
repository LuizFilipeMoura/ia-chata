// Candidate generation for the opponent bot. `availableActions` is the legality
// GATE — it says which action KINDS are legal for the active rig this instant
// (Fire is on, Aimed is off because the gun is spent, no budget left, …). It does
// NOT say at whom or where. This module expands each enabled kind into concrete,
// parameterised candidates the scorer can price: one Fire per shootable enemy per
// weapon, one Aimed per enemy per location, and so on.
//
// Non-move actions only. Move/sprint candidates are generated separately
// (candidates.js move section, Task 2.2) because their destination space is
// continuous and needs pathfinding.
import { availableActions } from "../battle-view.js";
import { arcOf, radiusOf, terrainPolygons } from "../geometry.js";
import { findPath } from "../pathfind.js";
import {
  spatial, deriveAttackGeometry, effectiveWeaponProfile, hasBulwarkShield,
  moveBudget, PREP_TYPES, LOCS,
} from "../game-state.js";

const DEG = Math.PI / 180;

// True when `target` sits in `attacker`'s front 90° arc — the arc a shot must
// bear through (§7). NOTE the direction: arcOf(A, B) reports which of B's facings
// A occupies, so to ask "is the target in MY front" we pass (target, attacker).
// That is the mirror of deriveAttackGeometry's `arc`, which reports which of the
// TARGET's facings the shot strikes (for the wound step). Both are needed and
// they are different questions.
function inFrontArc(attacker, target) {
  return arcOf(spatial(target), spatial(attacker)) === "front";
}

// Every non-move candidate for `rig` in the current room state. Each candidate is
// a plain object `{ action, ... }` carrying exactly the fields toCommand needs to
// build the `action` verb: fire/aimed carry weapon/target/arc/distance/cover
// (+location for aimed); the rest carry their own parameter or none.
export function candidatesFor(room, rig) {
  const turn = room.game.turn;
  const enabled = new Set(
    availableActions(rig, turn, room.game.round).filter((a) => a.enabled).map((a) => a.key),
  );
  const enemies = room.rigs.filter(
    (r) => (r.owner || "a") !== (rig.owner || "a") && !r.destroyed && r.pos,
  );
  const out = [];

  const lr = effectiveWeaponProfile("longRange", rig.weapons?.longRange, rig);
  const lrLoaded = rig.loaded?.longRange !== false;
  const inBand = (d) => lr && d >= (lr.minRange ?? 0) && d <= (lr.maxRange ?? Infinity);

  for (const enemy of enemies) {
    const geo = deriveAttackGeometry(room, rig, enemy);   // distance, arc(of target), cover, los, inMeleeReach
    if (!inFrontArc(rig, enemy)) continue;                 // can't bear on it — skip every attack
    const shot = { target: enemy.name, arc: geo.arc, distance: geo.distance, cover: geo.cover };

    // Long-range Fire: needs LOS, a loaded gun, and a distance inside the band.
    if (enabled.has("fire") && geo.los && lrLoaded && inBand(geo.distance)) {
      out.push({ action: "fire", weapon: "longRange", ...shot });
    }
    // Melee Fire: needs the rim gap inside reach (deriveAttackGeometry measured it
    // with this rig's own meleeReachOf). No LOS/band — it is contact.
    if (enabled.has("fire") && geo.inMeleeReach) {
      out.push({ action: "fire", weapon: "melee", ...shot });
    }
    // Aimed is ranged-only (availableActions shuts it off when the gun is spent),
    // so it rides the same LOS + band gate as a long-range Fire, once per location.
    if (enabled.has("aimed") && geo.los && inBand(geo.distance)) {
      for (const location of LOCS) {
        out.push({ action: "aimed", weapon: "longRange", location, ...shot });
      }
    }
  }

  // Prepare × prep type. raise-shield is Bulwark-only (normalizePrep coerces it to
  // brace otherwise), so offer it only when the rig actually carries the shield —
  // no point scoring a candidate that resolves to a duplicate brace.
  if (enabled.has("prepare")) {
    const preps = hasBulwarkShield(rig) ? [...PREP_TYPES, "raise-shield"] : PREP_TYPES;
    for (const prep of preps) out.push({ action: "prepare", prep });
  }

  // Repair × a location that is damaged but not destroyed.
  if (enabled.has("repair")) {
    for (const location of LOCS) {
      const part = rig[location];
      if (part && !part.destroyed && part.sp < part.max) {
        out.push({ action: "repair", location });
      }
    }
  }

  // Reload — a real action the console hides (it is a drawer-only path), offered
  // when the ranged weapon is spent and there is budget. checkCommand is the final
  // arbiter (Task 4.2's invariant fuzz proves the bot never emits an illegal one).
  if (rig.loaded?.longRange === false && turn.actionsUsed < turn.actionsMax) {
    out.push({ action: "reload" });
  }

  // Parameterless actions, straight through the legality gate.
  for (const key of ["disengage", "douse", "shutdown"]) {
    if (enabled.has(key)) out.push({ action: key });
  }

  out.push(...moveCandidates(room, rig, enabled));

  return out;
}

// --- Move candidates --------------------------------------------------------
// Destinations are continuous: a Speed-6 rig has infinitely many legal spots. So
// generate a SHORTLIST — semantic anchors (toward an objective, into a flank,
// into melee, a retreat, a pivot-in-place) unioned with a reachable lattice — and
// keep only those a real path reaches within the move budget. Anchors alone limit
// the bot to spots we imagined; a lattice alone finds spots but explains nothing.
// The union gives both. Every candidate is re-validated by findPath here with the
// same maths E1 uses to apply the move, so the bot can never propose a move the
// engine would reject (Task 4.2 fuzzes exactly that).

function pointAlong(from, target, dist) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist };
}

// Clamp a desired absolute facing to within ±90° of the current one — the pivot
// cap a Move allows (§7), the same clamp E1 enforces on apply.
function clampPivot(current, desired) {
  let delta = (((desired - current) % 360) + 540) % 360 - 180;   // (-180, 180]
  if (delta > 90) delta = 90;
  if (delta < -90) delta = -90;
  return Math.round(((current + delta) % 360 + 360) % 360);
}

function facingToward(from, target) {
  return Math.atan2(target.y - from.y, target.x - from.x) / DEG;
}

// The facings worth trying at a destination: toward each enemy and each objective,
// plus keeping the current heading — each clamped to the pivot cap and de-duped.
function facingsAt(rig, dest, enemies, objectives) {
  const wanted = [rig.facing];
  for (const e of enemies) wanted.push(facingToward(dest, e.pos));
  for (const m of objectives) wanted.push(facingToward(dest, m));
  return [...new Set(wanted.map((f) => clampPivot(rig.facing, f)))];
}

function moveCandidates(room, rig, enabled) {
  const acts = [];
  if (enabled.has("move")) acts.push("move");
  if (enabled.has("sprint")) acts.push("sprint");
  if (!acts.length) return [];

  const from = rig.pos;
  const radius = radiusOf(rig);
  const polys = terrainPolygons(room.field);
  const blockers = room.rigs
    .filter((r) => r !== rig && !r.destroyed && r.pos)
    .map(spatial);
  const enemies = room.rigs.filter(
    (r) => (r.owner || "a") !== (rig.owner || "a") && !r.destroyed && r.pos,
  );
  const objectives = room.game.objectives || [];
  const maxBudget = Math.max(...acts.map((a) => moveBudget(rig, a)));

  // Semantic ideal points (may be far — each is capped to the budget below).
  const ideals = [{ pt: { ...from }, reason: "hold and pivot" }];
  objectives.forEach((m, i) => ideals.push({ pt: { x: m.x, y: m.y }, reason: `contest objective ${i}` }));
  for (const e of enemies) {
    // Into the enemy's rear: a point behind it along its facing.
    const behind = e.facing * DEG;
    const rearGap = radius + radiusOf(e) + 2;
    ideals.push({ pt: { x: e.pos.x - Math.cos(behind) * rearGap, y: e.pos.y - Math.sin(behind) * rearGap }, reason: `flank ${e.name}` });
    // Into melee reach: a point just off its base toward us.
    ideals.push({ pt: pointAlong(e.pos, from, radius + radiusOf(e) + 1), reason: `close on ${e.name}` });
    // A retreat: a step directly away from it.
    ideals.push({ pt: pointAlong(e.pos, from, radius + radiusOf(e) + maxBudget), reason: `retreat from ${e.name}` });
  }

  // A coarse reachable lattice, out to the largest budget, catching what the
  // anchors didn't think of.
  const step = 1.5;
  const reach = Math.ceil(maxBudget);
  const lattice = [];
  for (let dx = -reach; dx <= reach; dx += step) {
    for (let dy = -reach; dy <= reach; dy += step) {
      if (dx === 0 && dy === 0) continue;
      if (Math.hypot(dx, dy) > maxBudget) continue;
      lattice.push({ pt: { x: from.x + dx, y: from.y + dy }, reason: "reposition" });
    }
  }

  const out = [];
  const seen = new Set();
  const emit = (act, dest, facing, reason) => {
    const key = `${act}:${dest.x.toFixed(2)}:${dest.y.toFixed(2)}:${facing}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ action: act, dest: { x: dest.x, y: dest.y }, facing, reason });
  };

  for (const act of acts) {
    const budget = moveBudget(rig, act);
    // Anchors: step toward each ideal as far as the budget allows, so an
    // out-of-reach objective still yields a reachable step toward it.
    for (const { pt, reason } of ideals) {
      const distToIdeal = Math.hypot(pt.x - from.x, pt.y - from.y);
      for (const frac of distToIdeal <= budget ? [1] : [budget / distToIdeal, (budget / distToIdeal) * 0.6]) {
        const dest = distToIdeal < 1e-9 ? { ...from } : pointAlong(from, pt, distToIdeal * frac);
        const route = findPath(room.field, polys, blockers, radius, from, dest);
        if (!route || route.length > budget + 1e-6) continue;
        for (const facing of facingsAt(rig, dest, enemies, objectives)) emit(act, dest, facing, reason);
        break; // first reachable fraction wins for this ideal
      }
    }
    // Lattice.
    for (const { pt, reason } of lattice) {
      const route = findPath(room.field, polys, blockers, radius, from, pt);
      if (!route || route.length > budget + 1e-6) continue;
      for (const facing of facingsAt(rig, pt, enemies, objectives)) emit(act, pt, facing, reason);
    }
  }
  return out;
}
