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
