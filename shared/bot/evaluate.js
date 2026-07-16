// The opponent bot's offence metric. v1 scores HITS, not damage.
//
// The full formula (validated by the balance harness, scripts/balance/) is
// ROF × P(hit) × P(wound) × Damage. v1 uses only the LEFT half:
//
//     expectedHits = ROF × P(hit) × arcFactor(profile, arc)
//
// because everything right of P(hit) — Penetration, wound TN, Damage — is being
// actively tuned (the penetration rework compressed the band to 3–7 and deleted
// Overmatch on 2026-07-16), while P(hit) is not: it is accuracy, cover, and
// range-band maths, which the balance work does not touch. Scoring hits gets a
// bot playing today against numbers that are stable. See the opponent-brain spec
// for when the damage term lands (it is deferred, not cancelled).
//
// THREE DOCUMENTED BIASES, all deliberate:
//
// 1. Effective-ROF blindness. rollToHit computes an EFFECTIVE rof internally
//    (+2 Full Auto, +Bloodletter vs a damaged target, +Redline Governor from
//    heat over cap). We cannot read it — rollToHit also runs
//    applyDefensiveReactions, which MUTATES the target (Point-Defense spend), and
//    evaluating a candidate must never mutate. So we use profile.rof and
//    under-rate those three conditional upgrades. The bias is small and
//    one-directional.
// 2. The whole wound step is invisible: Brace's −2, Reactive Plating, Harden,
//    toughness, per-wound riders. A braced rig does not read as a poor target.
// 3. arcFactor's `1 + bonus/4` is an invented PREFERENCE (see below), not the
//    real arc maths — arc modifies Penetration, not accuracy.
import { computeModifiedAim, arcBonus } from "../combat.js";
import { effectiveWeaponProfile } from "../game-state.js";
import { shieldCoverage } from "../rules.js";

// A D6 hits on `aim` or better; a natural 6 ALWAYS hits (rollToHit: `d >= modAim
// || d === 6`), so the floor is 1/6 no matter how bad the modifiers get, and the
// ceiling is 1 (aim ≤ 1).
function pHit(aim) {
  return Math.max(1 / 6, Math.min(1, (7 - aim) / 6));
}

// arcBonus is the WOUND step's arc modifier. v1 has no wound term, so it reads it
// as a PREFERENCE instead. Without this, ROF × P(hit) is identical on every arc —
// arc changes Penetration, not accuracy — and the bot would have no reason to
// flank at all, which is the single most important behaviour we want.
//
// The null veto is exact and always right (a Raking-Fire weapon genuinely cannot
// damage a front arc). The `1 + bonus/4` shaping is a GUESS: it preserves the
// ordering (rear > side > front) but not the true value. It is the one invented
// number in v1, and the deferred damage term deletes it.
function arcFactor(profile, arc) {
  const bonus = arcBonus(profile, arc);
  if (bonus == null) return 0;
  return 1 + bonus / 4;
}

// A raised shield covering this arc is the other earned zero. Mirrors rollWounds
// exactly (combat.js): the coverage table only applies while the shield is up,
// and only `negate` arcs are hard zeroes (a `blunt` arc still lets a shot land).
function shieldNegatesArc(target, arc) {
  if (target?.preparation?.type !== "raise-shield") return false;
  return shieldCoverage(target).negate.includes(arc);
}

// Expected hits for one shot from `attacker` at `target` with weapon `slot`
// ("longRange" | "melee"), given the derived geometry in `opts` ({ arc, distance,
// cover, round }). Zero for an earned zero (a rake into a front arc, or a shield
// that negates the arc); otherwise ROF × P(hit) × the arc preference.
export function expectedHits(attacker, target, slot, opts) {
  const profile = effectiveWeaponProfile(slot, attacker.weapons?.[slot], attacker);
  if (!profile) return 0;
  const factor = arcFactor(profile, opts.arc);
  if (factor === 0) return 0;                        // earned zero — rake into a front arc
  if (shieldNegatesArc(target, opts.arc)) return 0;  // earned zero — shield negates the arc
  const aim = computeModifiedAim(attacker, profile, { ...opts, target });
  return (profile.rof || 1) * pHit(aim) * factor;
}
