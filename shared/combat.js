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
  const cover = profile.upgradeEffect?.ignoreCover ? 0 : Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
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
  const hardened = target.hardened ? -1 : 0; // Harden (Ablative Plating active)
  const row = IMPACT[target.weightClass][location];
  const out = [];
  for (let i = 0; i < opts.hits; i++) {
    const die = rollD(6, providedDice?.impacts?.[i], random);
    if (bonus == null) { out.push({ die, total: 0, tier: "none", sp: 0 }); continue; }
    let extra = 0;
    if (profile.perks.includes("Armour Piercing") && die === 6) extra += rollD(3, providedDice?.ap?.[i], random);
    if (profile.perks.includes("Rend") && die >= 5) extra += rollD(3, providedDice?.rend?.[i], random);
    const total = die + str + bonus + braced + hardened + extra;
    const sev = impactSeverity(total, row);
    out.push({ die, total, tier: sev.tier, sp: sev.sp });
  }
  return out;
}

// §7 — full attack. Mutates through ctx.applyDamage / ctx.bumpHeat and returns
// a resolution descriptor (or { ok:false, reason } when the shot can't be made).
// The weapon profile is resolved by the caller via ctx.profileFor(slot, name).
export function resolveAttack(room, attacker, target, opts, random, ctx) {
  const slot = opts.weapon === "melee" ? "melee" : "longRange";
  const weaponName = attacker.weapons?.[slot];
  const profile = ctx.profileFor(slot, weaponName, attacker);
  if (!profile) return { ok: false, reason: "no-weapon" };
  if (attacker.weaponsDestroyed.includes(weaponName)) return { ok: false, reason: "weapon-destroyed" };
  if (opts.range === "out") return { ok: false, reason: "range" };
  // A spent ranged weapon normally can't fire — unless the caller folds in a
  // rushed reload (§7), paid for with an extra action-slot upstream.
  if (slot === "longRange" && !attacker.loaded.longRange && !opts.autoReload) return { ok: false, reason: "reload" };

  const th = rollToHit(attacker, profile, opts, opts.dice?.toHit, random);
  const heat = (profile.perks.includes("Hot") ? 1 : 0) + th.fireModeHeat + (profile.upgradeEffect?.heat || 0);
  if (slot === "longRange") attacker.loaded.longRange = false;

  const rolls = th.dice.map((d, i) => ({
    sides: 6, value: d, label: `hit ${i + 1}`,
    tone: d === 6 ? "crit" : d >= th.modAim ? "ok" : "miss",
  }));
  let impacts = [];
  let location = null;
  if (th.hits > 0) {
    const locDie = rollD(12, opts.dice?.location, random);
    location = opts.aimed ? opts.aimedLoc : hitLocation(locDie);
    if (!opts.aimed) rolls.push({ sides: 12, value: locDie, label: "location", tone: "cool" });
    impacts = rollImpacts(attacker, target, profile, location,
      { arc: opts.arc, hits: th.hits, charged: opts.charged }, opts.dice, random);
    for (const h of impacts) if (h.sp > 0) ctx.applyDamage(room, target, location, h.sp, { random, dice: opts.dice });
    if (profile.upgradeEffect?.onDamage === "sunder" && impacts.some((h) => h.sp > 0)) {
      ctx.sunderLocation?.(target, location);
    }
    applyOnHitPerks(room, attacker, target, profile, opts, random, ctx);
  }
  if (heat > 0) ctx.bumpHeat(attacker, heat);

  const total = impacts.reduce((s, h) => s + h.sp, 0);
  ctx.pushResolution(room, {
    kind: "attack", actor: attacker.owner, rigId: attacker.id, rolls,
    summary: `${attacker.name} → ${target.name} with ${weaponName}: ${th.hits} hit(s), ${total} SP${location ? ` to ${location}` : ""}`,
    effects: [],
  });
  return { ok: true, hits: th.hits, location, impacts, heat };
}

// §13 — post-hit perk effects (only reached when at least one hit landed).
function applyOnHitPerks(room, attacker, target, profile, opts, random, ctx) {
  const perks = profile.perks;
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
      const loc = hitLocation(rollD(12, opts.dice?.cleaveLocation, random));
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
    const locs = ["hull", "arms", "legs", "engine"];
    let loc = hitLocation(rollD(12, opts.dice?.clusterLocation, random));
    if (primary && loc === primary) loc = locs[(locs.indexOf(loc) + 1) % locs.length];
    ctx.applyDamage(room, target, loc, 1, { random, dice: opts.dice });
    effects.push(`Cluster Shells - 1 SP to ${loc}`);
  }
  if (effects.length) ctx.pushResolution(room, {
    kind: "perk", actor: attacker.owner, rigId: target.id, rolls: [], summary: effects.join("; "), effects,
  });
}

// §5 Ram — both Rigs take one D6 + their own weight-class ram STR hit.
export function resolveRam(room, attacker, target, opts, random, ctx) {
  for (const [rig, who] of [[attacker, "self"], [target, "target"]]) {
    const d = opts.dice?.[who] || {};
    const loc = hitLocation(rollD(12, d.location, random));
    const die = rollD(6, d.impact, random);
    const total = die + (RAM_STR[rig.weightClass] || 9);
    const sev = impactSeverity(total, IMPACT[rig.weightClass][loc]);
    if (sev.sp > 0) ctx.applyDamage(room, rig, loc, sev.sp, { random });
    ctx.pushResolution(room, {
      kind: "ram", actor: attacker.owner, rigId: rig.id,
      rolls: [{ sides: 6, value: die, label: "D6", tone: sev.sp > 0 ? "ok" : "miss" }],
      summary: `Ram hits ${rig.name}: ${total} → ${sev.tier} (${sev.sp} SP to ${loc})`, effects: [],
    });
  }
  return { ok: true };
}
