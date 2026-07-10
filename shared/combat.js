// Pure combat math (§7). State mutation happens only through the `ctx` the
// caller (game-state.js) injects, so this module has no import cycle and is
// unit-testable in isolation. It imports ONLY from rules.js.
import {
  impactRow, AIM, WEIGHT_STR_MOD, hitLocation, impactSeverity, shieldCoverage,
} from "./rules.js";
import { partNamesOf } from "./unit-kinds.js";

// Perks now come solely from the chosen weapon upgrade; a base weapon (or a
// profile built straight from WEAPONS/UNIT_WEAPONS) may carry no perks array at
// all, so every read goes through this guard. `Melee` is NOT a perk — it is the
// structural `profile.melee` flag.
function hasPerk(profile, name) {
  return Array.isArray(profile.perks) && profile.perks.includes(name);
}

function rollD(sides, provided, random) {
  if (provided != null) {
    const v = Math.floor(Number(provided));
    if (Number.isFinite(v) && v >= 1 && v <= sides) return v;
  }
  return Math.floor((random || Math.random)() * sides) + 1;
}

// §7.4 — ranged accuracy as a function of measured distance: peak at the sweet
// spot, falling off by `dropoff` per inch away from it. Melee weapons have a
// fixed reach and keep their scalar `acc`. A missing distance (legacy callers /
// tests) yields the peak — i.e. "at the sweet spot, in range".
export function weaponAccAt(profile, distance) {
  if (profile.melee) return profile.acc?.[0] || 0;
  const d = Number(distance);
  if (!Number.isFinite(d)) return profile.peak || 0;
  const penalty = Math.round((profile.dropoff || 0) * Math.abs(d - profile.sweet));
  return (profile.peak || 0) - penalty;
}

// §7.4 — modified Aim (the D6 target number). Higher ACC lowers the number.
export function computeModifiedAim(attacker, profile, opts) {
  const base = AIM[attacker.weightClass] ?? 4;
  const weaponAcc = weaponAccAt(profile, opts.distance);
  const cover = profile.upgradeEffect?.ignoreCover ? 0 : Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
  const aimedPenalty = opts.aimed && !hasPerk(profile, "Precision") ? -2 : 0;
  const hullPenalty = attacker.hull.sp === 0 ? -1 : 0;
  // §engagement — a rig locked in melee fires ranged weapons at −2 accuracy.
  const engagedPenalty = opts.engaged && !profile.melee ? -2 : 0;
  const accTotal = weaponAcc - cover + aimedPenalty + hullPenalty + engagedPenalty;
  return base - accTotal;
}

// §7.4 — roll ROF (+2 for Full Auto) D6, count hits, tally fire-mode heat
// (each 1 rolled under Full Auto / Charged Shot adds 1 heat, §6).
export function rollToHit(attacker, profile, opts, providedDice, random) {
  const modAim = computeModifiedAim(attacker, profile, opts);
  const fullAuto = opts.fullAuto && hasPerk(profile, "Full Auto");
  const rof = profile.rof + (fullAuto ? 2 : 0);
  const charged = opts.charged && hasPerk(profile, "Charged Shot");
  const heatOnOnes = fullAuto || charged || profile.upgradeEffect?.heatOnOnes;
  const rerolls = Math.max(0, Math.floor(profile.upgradeEffect?.rerollMisses || 0));
  const dice = [];
  let hits = 0;
  let fireModeHeat = 0;
  let rerollsUsed = 0;
  for (let i = 0; i < rof; i++) {
    let d = rollD(6, providedDice?.[i], random);
    let hit = d >= modAim || d === 6;
    if (!hit && rerollsUsed < rerolls) {
      rerollsUsed += 1;
      d = rollD(6, providedDice?.rerolls?.[rerollsUsed - 1], random);
      hit = d >= modAim || d === 6;
    }
    dice.push(d);
    if (hit) hits += 1;
    if (heatOnOnes && d === 1) fireModeHeat += 1;
  }
  return { modAim, rof, hits, fireModeHeat, dice };
}

// §12/§7 — STR = weapon STR + weight modifier + Charged Shot.
export function computeStr(attacker, profile, opts) {
  const charged = opts.charged && hasPerk(profile, "Charged Shot") ? 2 : 0;
  const weightMod = profile.flatPick ? 0 : (WEIGHT_STR_MOD[attacker.weightClass] || 0);
  return profile.str + weightMod + charged;
}

// §7.7 / §13 — arc STR bonus. Raking Fire (machine guns) replaces the standard
// side/rear values and cannot damage the front arc (returns null = auto-fail).
export function arcBonus(profile, arc) {
  if (hasPerk(profile, "Raking Fire")) {
    if (arc === "side") return 4;
    if (arc === "rear") return 8;
    return null;
  }
  if (profile.melee) return 0;
  if (arc === "side") return 2;
  if (arc === "rear") return 4;
  return 0;
}

// §7.7-8 — one Impact Roll per hit. Adds AP (+D3 per raw 6) and Rend (+D3 per
// raw 5-6). Brace subtracts 2 on the target's front arc (§5 preparation).
// Raise Shield (§13 Bulwark) negates covered arcs outright and blunts the rest by 4.
export function rollImpacts(attacker, target, profile, location, opts, providedDice, random) {
  const str = computeStr(attacker, profile, opts);
  const bonus = arcBonus(profile, opts.arc);
  const braced = target.preparation?.type === "brace" && opts.arc === "front" ? -2 : 0;
  const hardened = target.hardened ? -1 : 0; // Harden (Ablative Plating active)
  const shield = target.preparation?.type === "raise-shield" ? shieldCoverage(target) : null;
  const shieldNegates = !!shield && shield.negate.includes(opts.arc);
  const shieldBlunt = shield && shield.blunt.includes(opts.arc) ? -4 : 0;
  const row = impactRow(target.kind || "rig", location, target.weightClass);
  const out = [];
  for (let i = 0; i < opts.hits; i++) {
    const die = rollD(6, providedDice?.impacts?.[i], random);
    if (bonus == null || shieldNegates) { out.push({ die, total: 0, tier: "none", sp: 0 }); continue; }
    let extra = 0;
    if (hasPerk(profile, "Armour Piercing") && die === 6) extra += rollD(3, providedDice?.ap?.[i], random);
    if (hasPerk(profile, "Rend") && die >= 5) extra += rollD(3, providedDice?.rend?.[i], random);
    const total = die + str + bonus + braced + hardened + shieldBlunt + extra;
    const sev = impactSeverity(total, row);
    out.push({ die, total, tier: sev.tier, sp: sev.sp });
  }
  return out;
}

// §7 — full attack. Mutates through ctx.applyDamage / ctx.bumpHeat and returns
// a resolution descriptor (or { ok:false, reason } when the shot can't be made).
// The weapon profile is resolved by the caller via ctx.profileFor(slot, name).
export function resolveAttack(room, attacker, target, opts, random, ctx) {
  // Rigs carry a two-slot loadout (longRange + melee). Flat-pick kinds
  // (Tank / Walker) carry a single "unit" slot instead.
  let slot;
  if (attacker.weapons?.unit != null) slot = "unit";
  else slot = opts.weapon === "melee" ? "melee" : "longRange";
  const weaponName = attacker.weapons?.[slot];
  const profile = ctx.profileFor(slot, weaponName, attacker);
  if (!profile) return { ok: false, reason: "no-weapon" };
  if (attacker.weaponsDestroyed.includes(weaponName)) return { ok: false, reason: "weapon-destroyed" };
  // Out of range is now distance-driven for ranged weapons; melee keeps the
  // legacy band flag. A missing distance (older callers) is treated as in range.
  if (!profile.melee) {
    const d = Number(opts.distance);
    if (Number.isFinite(d) && (d < profile.minRange || d > profile.maxRange))
      return { ok: false, reason: "range" };
  } else if (opts.range === "out") {
    return { ok: false, reason: "range" };
  }
  // A spent ranged weapon normally can't fire — unless the caller folds in a
  // rushed reload (§7), paid for with an extra action-slot upstream.
  if (slot === "longRange" && !attacker.loaded.longRange && !opts.autoReload) return { ok: false, reason: "reload" };
  if (slot === "unit" && attacker.loaded.unit === false && !opts.autoReload) return { ok: false, reason: "reload" };

  const th = rollToHit(attacker, profile, opts, opts.dice?.toHit, random);
  const heat = (hasPerk(profile, "Hot") ? 1 : 0) + th.fireModeHeat + (profile.upgradeEffect?.heat || 0);
  if (slot === "longRange") attacker.loaded.longRange = false;
  if (slot === "unit") attacker.loaded.unit = false;

  const rolls = th.dice.map((d, i) => ({
    sides: 6, value: d, label: `hit ${i + 1}`,
    tone: d === 6 ? "crit" : d >= th.modAim ? "ok" : "miss",
  }));
  let impacts = [];
  let location = null;
  if (th.hits > 0) {
    const locDie = rollD(12, opts.dice?.location, random);
    location = opts.aimed ? opts.aimedLoc : hitLocation(attacker.kind || "rig", locDie);
    if (!opts.aimed) rolls.push({ sides: 12, value: locDie, label: "location", tone: "cool" });
    impacts = rollImpacts(attacker, target, profile, location,
      { arc: opts.arc, hits: th.hits, charged: opts.charged }, opts.dice, random);
    for (const h of impacts) if (h.sp > 0) ctx.applyDamage(room, target, location, h.sp, { random, dice: opts.dice });
    if (profile.upgradeEffect?.onDamage === "sunder" && impacts.some((h) => h.sp > 0)) {
      ctx.sunderLocation?.(target, location);
    }
    if (profile.upgradeEffect?.onDamage === "breaching-round" && location === "hull" && impacts.some((h) => h.sp > 0)) {
      ctx.breachHull?.(target);
    }
    applyOnHitPerks(room, attacker, target, profile, opts, random, ctx);
  }
  if (heat > 0) ctx.bumpHeat(attacker, heat);

  const total = impacts.reduce((s, h) => s + h.sp, 0);
  const str = computeStr(attacker, profile, opts);
  ctx.pushResolution(room, {
    kind: "attack", actor: attacker.owner, rigId: attacker.id, rolls,
    summary: `${attacker.name} → ${target.name} with ${weaponName} (STR ${str}): ${th.hits} hit(s) = ${total} SP${location ? ` to ${location}` : ""}`,
    breakdown: {
      actor: attacker.name, weapon: weaponName, target: target.name,
      terms: [
        { value: th.hits, label: "hits", tone: "die" },
        { value: str, label: "weapon STR", op: "·", tone: "mod" },
      ],
      sp: total, location,
    },
    effects: [],
  });
  // §engagement — a legal melee blow (reached here = not out-of-range, weapon not
  // destroyed) locks attacker and target together. No-op if either is already
  // engaged (one-to-one) or same side.
  const isMelee = slot === "melee" || (slot === "unit" && profile.melee);
  if (isMelee) ctx.engage?.(room, attacker, target);

  return { ok: true, hits: th.hits, location, impacts, heat };
}

// §13 — post-hit perk effects (only reached when at least one hit landed).
function applyOnHitPerks(room, attacker, target, profile, opts, random, ctx) {
  const perks = profile.perks || [];
  const effects = [];
  if (perks.includes("Incendiary")) { ctx.bumpHeat(target, 1); effects.push("Incendiary +1 heat"); }
  if (perks.includes("Shock")) { target.speedHalvedNextRound = true; effects.push("Shock — speed halved"); }
  if (perks.includes("Impale")) {
    const roll = rollD(12, opts.dice?.impale, random);
    if (roll >= 8) { target.immobilised = true; effects.push(`Impale ${roll} — immobilised`); }
  }
  if (perks.includes("Staggering")) {
    const roll = rollD(6, opts.dice?.stagger, random);
    const note = roll <= 2 ? "pivot left" : roll <= 4 ? 'pushed 3"' : "pivot right";
    effects.push(`Staggering ${roll} — ${note} (positional)`);
  }
  if (perks.includes("Cleave") && opts.cleaveTarget) {
    const extra = room.rigs.find((x) => x.name.toLowerCase() === String(opts.cleaveTarget).toLowerCase());
    if (extra && !extra.destroyed) {
      const loc = hitLocation(extra.kind || "rig", rollD(12, opts.dice?.cleaveLocation, random));
      const [hit] = rollImpacts(attacker, extra, profile, loc, { arc: "front", hits: 1, charged: opts.charged }, { impacts: [opts.dice?.cleaveImpact] }, random);
      if (hit.sp > 0) ctx.applyDamage(room, extra, loc, hit.sp, { random });
      effects.push(`Cleave → ${extra.name}`);
    }
  }
  const onHit = profile.upgradeEffect?.onHit;
  if (onHit === "systems-overload") {
    target.actionPenaltyNextActivation = Math.max(target.actionPenaltyNextActivation || 0, 1);
    effects.push("Systems Overload - target loses 1 action next activation");
  }
  if (onHit === "cluster-shells") {
    const primary = opts.aimed ? opts.aimedLoc : null;
    const locs = partNamesOf(target.kind || "rig");
    let loc = hitLocation(target.kind || "rig", rollD(12, opts.dice?.clusterLocation, random));
    if (primary && loc === primary) loc = locs[(locs.indexOf(loc) + 1) % locs.length];
    ctx.applyDamage(room, target, loc, 1, { random, dice: opts.dice });
    effects.push(`Cluster Shells - 1 SP to ${loc}`);
  }
  if (effects.length) ctx.pushResolution(room, {
    kind: "perk", actor: attacker.owner, rigId: target.id, rolls: [], summary: effects.join("; "), effects,
  });
}
