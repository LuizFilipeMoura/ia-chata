// The opponent bot's offence metric: analytic expected DAMAGE, no dice, no
// simulation. The full formula (validated by the balance harness, and by this
// module's own tests against the real engine) is
//
//     expectedDamage = ROF × P(hit) × P(wound) × Damage
//
// It reads the wound step through effectivePenAgainst — the exact arithmetic
// rollWounds resolves with — so arc, Brace, Harden, shields, plating and every
// other defender modifier are valued automatically. There is no arc HEURISTIC:
// rear wounds harder because it carries more effective Penetration, not because a
// hand-tuned factor said so. (An earlier hits-only metric multiplied by an
// invented `1 + arcBonus/4`; the damage term deleted it wholesale.)
//
// KNOWN BIASES, all deliberate, all small and one-directional:
//
// 1. Effective-ROF blindness. rollToHit computes an EFFECTIVE rof internally
//    (+2 Full Auto, +Bloodletter vs a damaged target, +Redline Governor from heat
//    over cap). We cannot read it — rollToHit also runs applyDefensiveReactions,
//    which MUTATES the target (Point-Defense spend), and evaluating a candidate
//    must never mutate. So we use profile.rof and under-rate those three upgrades.
// 2. Armour Piercing's failed-wound reroll raises P(wound) and is not modelled, so
//    an AP weapon is slightly under-rated.
import { computeModifiedAim, effectivePenAgainst } from "../combat.js";
import { effectiveWeaponProfile } from "../game-state.js";
import { woundTarget, WOUND_DIE, hitLocation } from "../rules.js";

// A D6 hits on `aim` or better; a natural 6 ALWAYS hits (rollToHit: `d >= modAim
// || d === 6`), so the floor is 1/6 no matter how bad the modifiers get, and the
// ceiling is 1 (aim ≤ 1).
function pHit(aim) {
  return Math.max(1 / 6, Math.min(1, (7 - aim) / 6));
}

// The RAW hit expectation, ROF × P(hit), with NO arc term. This is the quantity
// the engine's own to-hit step produces — rollToHit ignores arc (arc is a
// wound-step modifier). Exported so the sampling validation can compare it to the
// real engine's mean hit count, and reused as the left half of expectedDamage.
export function rawExpectedHits(attacker, target, slot, opts) {
  const profile = effectiveWeaponProfile(slot, attacker.weapons?.[slot], attacker);
  if (!profile) return 0;
  const aim = computeModifiedAim(attacker, profile, { ...opts, target });
  return (profile.rof || 1) * pHit(aim);
}

// The hit-location distribution of a non-aimed shot: the D12 hit table folded to
// a probability per location. resolveAttack rolls ONE location per shot (all that
// shot's hits land there), so averaging P(wound)×D over this distribution and
// multiplying by the hit expectation gives the shot's mean SP.
function locationDist(kind) {
  const counts = {};
  for (let d = 1; d <= 12; d++) {
    const loc = hitLocation(kind, d);
    counts[loc] = (counts[loc] || 0) + 1;
  }
  return Object.entries(counts).map(([loc, n]) => ({ loc, p: n / 12 }));
}

// Expected damage for one shot from `attacker` at `target` with weapon `slot`
// ("longRange" | "melee"), given the derived geometry in `opts` ({ arc, distance,
// cover, round }, plus an optional fixed `location` for an aimed shot). This is
// the number the scorer consumes behind its `w.damage` weight, for BOTH the
// bot's own shots (offence) and every enemy's best shot at it (exposure).
//
// Earned zeroes (a rake into a front arc, or a shield negating the arc) fall out
// naturally: effectivePenAgainst reports `negated`, and those locations
// contribute nothing. Damage is the weapon's `d` plus its per-wound riders —
// Rend (+1) and Evisceration (+1 vs a location already at/below half). There is
// NO Penetration term in Damage: Overmatch was deleted (2026-07-16); Penetration
// buys P(wound) and nothing else.
export function expectedDamage(attacker, target, slot, opts) {
  const profile = effectiveWeaponProfile(slot, attacker.weapons?.[slot], attacker);
  if (!profile) return 0;
  const hits = rawExpectedHits(attacker, target, slot, opts);
  if (hits === 0) return 0;
  const locs = opts.location ? [{ loc: opts.location, p: 1 }] : locationDist(target.kind || "rig");
  const rendD = profile.perks?.includes("Rend") ? 1 : 0;
  let woundDmg = 0;
  for (const { loc, p } of locs) {
    const ep = effectivePenAgainst(attacker, target, profile, loc, opts);
    if (ep.negated || ep.effPen == null) continue;   // earned zero — a rake/shield blind arc
    // P(wound) = P(d10 ≥ TN). woundTarget clamps TN to ≤ WOUND_DIE, so the floor
    // (a natural 10 always wounds) is already baked in.
    const pWound = (WOUND_DIE - woundTarget(ep.effPen, ep.toughness) + 1) / WOUND_DIE;
    const eviscD = profile.upgradeEffect?.eviscerate
      && target[loc] && target[loc].sp <= target[loc].max / 2 ? 1 : 0;
    woundDmg += p * pWound * (ep.d + rendD + eviscD);
  }
  return hits * woundDmg;
}
