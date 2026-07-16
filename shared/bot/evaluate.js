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
import { computeModifiedAim, arcBonus, effectivePenAgainst } from "../combat.js";
import { effectiveWeaponProfile } from "../game-state.js";
import { shieldCoverage, woundTarget, WOUND_DIE, hitLocation } from "../rules.js";

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

// The RAW hit expectation, ROF × P(hit), with NO arc preference and NO earned-arc
// zeroes. This is the quantity the engine's own to-hit step produces — rollToHit
// ignores arc (arc is a wound-step modifier), and a negating shield still lets
// the dice land (it zeroes the wound, not the hit). So this is what the sampling
// validation (evaluate.test.js) compares against the real engine's mean.
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

// The FULL offence metric: expectedDamage = ROF × P(hit) × P(wound) × Damage, the
// number the deferred damage term feeds `score.js` in place of expectedHits. It
// reads the wound step through effectivePenAgainst — the exact arithmetic
// rollWounds resolves with — so arc, Brace, Harden, shields, plating and the rest
// are valued automatically, and the invented arcFactor is gone: rear genuinely
// wounds harder here because it carries more effective Penetration, not because a
// heuristic said so.
//
// Damage is the weapon's `d` plus its per-wound riders: Rend (+1) and
// Evisceration (+1 vs a location already at/below half). There is NO Penetration
// term in Damage — Overmatch was deleted (2026-07-16); Penetration buys P(wound)
// and nothing else. KNOWN BIAS (small, one-directional): Armour Piercing's
// failed-wound reroll raises P(wound) and is not modelled, so an AP weapon is
// slightly under-rated — the same shape as the hit-side ROF biases above.
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

// Expected hits for one shot from `attacker` at `target` with weapon `slot`
// ("longRange" | "melee"), given the derived geometry in `opts` ({ arc, distance,
// cover, round }). This is the SCORING quantity: rawExpectedHits scaled by the
// arc preference, and zeroed on an earned zero (a rake into a front arc, or a
// shield that negates the arc). Those earned zeroes are wound-step facts the raw
// hit rate cannot see — folded in here because the bot scores damage-through, not
// dice in the air.
export function expectedHits(attacker, target, slot, opts) {
  const profile = effectiveWeaponProfile(slot, attacker.weapons?.[slot], attacker);
  if (!profile) return 0;
  if (arcBonus(profile, opts.arc) == null) return 0;   // earned zero — rake into a front arc
  if (shieldNegatesArc(target, opts.arc)) return 0;     // earned zero — shield negates the arc
  return rawExpectedHits(attacker, target, slot, opts) * arcFactor(profile, opts.arc);
}
