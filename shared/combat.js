// Pure combat math (§7). State mutation happens only through the `ctx` the
// caller (game-state.js) injects, so this module has no import cycle and is
// unit-testable in isolation. It imports ONLY from rules.js.
import {
  IMPACT, AIM, WEIGHT_STR_MOD, RAM_STR, hitLocation, impactSeverity,
} from "./rules.js";

function rollD(sides, provided, random) {
  if (provided != null) {
    const v = Math.floor(Number(provided));
    if (Number.isFinite(v) && v >= 1 && v <= sides) return v;
  }
  return Math.floor((random || Math.random)() * sides) + 1;
}

// §7.4 — modified Aim (the D6 target number). Higher ACC lowers the number.
export function computeModifiedAim(attacker, profile, opts) {
  const base = AIM[attacker.weightClass] ?? 4;
  const weaponAcc = profile.acc[opts.range === "far" ? 1 : 0] || 0;
  const cover = Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
  const aimedPenalty = opts.aimed && !profile.perks.includes("Precision") ? -2 : 0;
  const hullPenalty = attacker.hull.sp === 0 ? -1 : 0;
  const accTotal = weaponAcc - cover + aimedPenalty + hullPenalty;
  return base - accTotal;
}

// §7.4 — roll ROF (+2 for Full Auto) D6, count hits, tally fire-mode heat
// (each 1 rolled under Full Auto / Charged Shot adds 1 heat, §6).
export function rollToHit(attacker, profile, opts, providedDice, random) {
  const modAim = computeModifiedAim(attacker, profile, opts);
  const fullAuto = opts.fullAuto && profile.perks.includes("Full Auto");
  const rof = profile.rof + (fullAuto ? 2 : 0);
  const charged = opts.charged && profile.perks.includes("Charged Shot");
  const dice = [];
  let hits = 0;
  let fireModeHeat = 0;
  for (let i = 0; i < rof; i++) {
    const d = rollD(6, providedDice?.[i], random);
    dice.push(d);
    if (d >= modAim || d === 6) hits += 1;
    if ((fullAuto || charged) && d === 1) fireModeHeat += 1;
  }
  return { modAim, rof, hits, fireModeHeat, dice };
}

// §12/§7 — STR = weapon STR + weight modifier + Charged Shot.
export function computeStr(attacker, profile, opts) {
  const charged = opts.charged && profile.perks.includes("Charged Shot") ? 2 : 0;
  return profile.str + (WEIGHT_STR_MOD[attacker.weightClass] || 0) + charged;
}

// §7.7 / §13 — arc STR bonus. Raking Fire (machine guns) replaces the standard
// side/rear values and cannot damage the front arc (returns null = auto-fail).
export function arcBonus(profile, arc) {
  if (profile.perks.includes("Raking Fire")) {
    if (arc === "side") return 4;
    if (arc === "rear") return 8;
    return null;
  }
  if (profile.perks.includes("Melee")) return 0;
  if (arc === "side") return 2;
  if (arc === "rear") return 4;
  return 0;
}

// §7.7-8 — one Impact Roll per hit. Adds AP (+D3 per raw 6) and Rend (+D3 per
// raw 5-6). Brace subtracts 2 on the target's front arc (§5 preparation).
export function rollImpacts(attacker, target, profile, location, opts, providedDice, random) {
  const str = computeStr(attacker, profile, opts);
  const bonus = arcBonus(profile, opts.arc);
  const braced = target.preparation?.type === "brace" && opts.arc === "front" ? -2 : 0;
  const row = IMPACT[target.weightClass][location];
  const out = [];
  for (let i = 0; i < opts.hits; i++) {
    const die = rollD(6, providedDice?.impacts?.[i], random);
    if (bonus == null) { out.push({ die, total: 0, tier: "none", sp: 0 }); continue; }
    let extra = 0;
    if (profile.perks.includes("Armour Piercing") && die === 6) extra += rollD(3, providedDice?.ap?.[i], random);
    if (profile.perks.includes("Rend") && die >= 5) extra += rollD(3, providedDice?.rend?.[i], random);
    const total = die + str + bonus + braced + extra;
    const sev = impactSeverity(total, row);
    out.push({ die, total, tier: sev.tier, sp: sev.sp });
  }
  return out;
}
