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
import { arcOf } from "../geometry.js";
import {
  spatial, deriveAttackGeometry, effectiveWeaponProfile, hasBulwarkShield,
  PREP_TYPES, LOCS,
} from "../game-state.js";

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

  return out;
}
