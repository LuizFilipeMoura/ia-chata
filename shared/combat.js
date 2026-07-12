// Pure combat math (§7). State mutation happens only through the `ctx` the
// caller (game-state.js) injects, so this module has no import cycle and is
// unit-testable in isolation. It imports ONLY from rules.js.
import {
  impactRow, AIM, WEIGHT_STR_MOD, hitLocation, impactSeverity, shieldCoverage, HEAT_CAPACITY,
} from "./rules.js";
import { partNamesOf, roleOf, partsByRole } from "./unit-kinds.js";

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
  // Cover is skipped by Airburst Fuze (ignoreCover) and by a Piledriver Protocol
  // guard-break (opts.guardBreak, §13 Siege Maul) — both reuse the same path.
  const cover = (profile.upgradeEffect?.ignoreCover || opts.guardBreak || (opts.painted && !profile.melee)) ? 0 : Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
  const aimedPenalty = opts.aimed && !hasPerk(profile, "Precision") ? -2 : 0;
  const hullPenalty = attacker.hull.sp === 0 ? -1 : 0;
  // §engagement — a rig locked in melee fires ranged weapons at −2 accuracy.
  const engagedPenalty = opts.engaged && !profile.melee ? -2 : 0;
  // Recon paint (spec: Support Units) — allied ranged fire on a marked enemy
  // gains +1 Aim on top of the cover cancel above.
  const paintBonus = (opts.painted && !profile.melee) ? 1 : 0;
  const accTotal = weaponAcc - cover + aimedPenalty + hullPenalty + engagedPenalty + paintBonus;
  return base - accTotal;
}

// §7.4 — roll ROF (+2 for Full Auto) D6, count hits, tally fire-mode heat
// (each 1 rolled under Full Auto / Charged Shot adds 1 heat, §6).
export function rollToHit(attacker, profile, opts, providedDice, random) {
  const modAim = computeModifiedAim(attacker, profile, opts);
  const fullAuto = opts.fullAuto && hasPerk(profile, "Full Auto");
  // Bloodletter — an extra to-hit die vs a target missing SP anywhere.
  const bloodletterRof = opts.target && profile.upgradeEffect?.vsDamaged?.rof && !isUndamaged(opts.target)
    ? profile.upgradeEffect.vsDamaged.rof : 0;
  // Redline Governor — extra to-hit dice from attacker heat over its class
  // cap, mirroring the STR bonus in computeStr (capped at +3).
  let redlineRof = 0;
  if (profile.upgradeEffect?.redline) {
    const cap = HEAT_CAPACITY[attacker.weightClass];
    const over = cap != null ? Math.max(0, (attacker.engine?.heat || 0) - cap) : 0;
    redlineRof = Math.min(3, over);
  }
  // Penetrator Rounds — every 3rd Autocannon volley ignores the armour row
  // (forced in rollImpacts below); the belt then cycles slow for exactly the
  // next attack, halving that attack's ROF. `autocannonSlowNext` is a
  // one-shot downside: read here and immediately consumed.
  let penetratorShot = false;
  let penetratorSlow = false;
  if (profile.upgradeEffect?.penetrator) {
    if (attacker.autocannonSlowNext) {
      penetratorSlow = true;
      attacker.autocannonSlowNext = false; // consumed
    }
    attacker.autocannonShots = (attacker.autocannonShots || 0) + 1;
    penetratorShot = attacker.autocannonShots % 3 === 0;
    if (penetratorShot) attacker.autocannonSlowNext = true;
  }
  let rof = profile.rof + (fullAuto ? 2 : 0) + bloodletterRof + redlineRof;
  // Every ROF-halving downside floors at 1 die — a suppressed / slow-belt
  // weapon fires at reduced volume, it is not silenced (a ROF-1 gun stays 1).
  if (penetratorSlow) rof = Math.max(1, Math.floor(rof / 2));
  // Kneecapper progressive cripple (§13, Double MG) — a rig whose own weapon
  // limb (Rig arms, or the weapon-role part on Tank/Walker) has been raked by
  // a Kneecapper down to <= half max SP fires every weapon, long-range or
  // melee, at half ROF. `armsSuppressed` is derived in game-state.js
  // (recompute), scoped to limbs a Kneecapper actually tagged.
  if (attacker.armsSuppressed) rof = Math.max(1, Math.floor(rof / 2));
  const charged = opts.charged && hasPerk(profile, "Charged Shot");
  const heatOnOnes = fullAuto || charged || profile.upgradeEffect?.heatOnOnes;
  const rerolls = Math.max(0, Math.floor(profile.upgradeEffect?.rerollMisses || 0));
  const dice = [];
  let hits = 0;
  let fireModeHeat = 0;
  let rerollsUsed = 0;
  for (let i = 0; i < rof; i++) {
    let d = rollD(6, providedDice?.[i], random);
    // Fire Control Lock (§13, Missile Barrage) — a painted volley can't miss:
    // every die counts as a hit regardless of face. Dice are still rolled (so
    // heat-on-ones and the per-die log stay honest) but the to-hit test is skipped.
    let hit = opts.autoHit || d >= modAim || d === 6;
    if (!hit && rerollsUsed < rerolls) {
      rerollsUsed += 1;
      d = rollD(6, providedDice?.rerolls?.[rerollsUsed - 1], random);
      hit = d >= modAim || d === 6;
    }
    dice.push(d);
    if (hit) hits += 1;
    if (heatOnOnes && d === 1) fireModeHeat += 1;
  }
  return { modAim, rof, hits, fireModeHeat, dice, penetratorShot };
}

// §13 — every one of the target's real locations is at max SP, i.e. the target
// is entirely undamaged. Walks the target's actual anatomy (via partNamesOf) so
// it's correct for Tank (hull/tracks/turret/engine) and Walker
// (hull/legs/mount/engine), not just Rigs. Shared by Cold Bore (needs
// "undamaged") and Bloodletter (needs its negation, "damaged somewhere").
function isUndamaged(target) {
  return partNamesOf(target.kind || "rig").every(
    (l) => target[l] && target[l].sp >= target[l].max,
  );
}

// §12/§7 — STR = weapon STR + weight modifier + Charged Shot + any conditional
// Tuned/Prototype bonuses (§13) that read the attacker/target state via `opts`.
export function computeStr(attacker, profile, opts) {
  // Anvil Boss riposte (§13 Bulwark) — a forced, flat STR for the free counter
  // that ignores weight class and every conditional Tuned/Prototype bonus, so
  // the counter lands at exactly the upgrade's riposteStr regardless of who owns
  // the shield. Threaded through `rollImpacts` from `resolveAttack`.
  if (opts.strOverride != null) return opts.strOverride;
  const charged = opts.charged && hasPerk(profile, "Charged Shot") ? 2 : 0;
  const weightMod = profile.flatPick ? 0 : (WEIGHT_STR_MOD[attacker.weightClass] || 0);
  let bonus = 0;
  // Cold Bore — +3 STR against a target whose every location is at max SP.
  if (opts.target && profile.upgradeEffect?.coldBore && isUndamaged(opts.target)) {
    bonus += 3;
  }
  // Full Tilt / Momentum Swing — STR while charging in (moved this activation).
  // `charge` is a generalised key: Full Tilt sets it to 3, Momentum Swing to 2.
  if (attacker.movedThisActivation && profile.upgradeEffect?.charge) {
    bonus += profile.upgradeEffect.charge;
  }
  // Opportunist — +3 STR vs a target that's disrupted: overheated past its
  // class cap, or carrying an action penalty into its next activation.
  if (opts.target && profile.upgradeEffect?.vsDisrupted) {
    const cap = HEAT_CAPACITY[opts.target.weightClass];
    const disrupted = (opts.target.actionPenaltyNextActivation || 0) > 0
      || (cap != null && (opts.target.engine?.heat || 0) > cap);
    if (disrupted) bonus += 3;
  }
  // Taut Cable — +3 STR against a target already pinned down: immobilised, or
  // held in a melee lock (engaged).
  if (opts.target && profile.upgradeEffect?.vsPinned) {
    if (opts.target.immobilised || opts.target.engagedWith != null) bonus += 3;
  }
  // Redline Governor — the hotter the attacker runs past its own class cap,
  // the harder the Chainsaw bites (+1 STR per heat over cap, capped at +3).
  if (profile.upgradeEffect?.redline) {
    const cap = HEAT_CAPACITY[attacker.weightClass];
    const over = cap != null ? Math.max(0, (attacker.engine?.heat || 0) - cap) : 0;
    bonus += Math.min(3, over);
  }
  // Superconductor Edge — running past half the attacker's own heat cap
  // charges the blade for +2 STR.
  if (profile.upgradeEffect?.superconductor) {
    const cap = HEAT_CAPACITY[attacker.weightClass];
    if (cap != null && (attacker.engine?.heat || 0) > cap / 2) bonus += 2;
  }
  // Piledriver Protocol — a Siege Maul shot spends stored Momentum for +1 STR
  // per point. The spent amount is threaded in via opts.momentum (computed once
  // in resolveAttack so the STR bonus and the post-shot Momentum reset stay in
  // lockstep). Gated on the piledriver effect so a stray opts.momentum on any
  // other weapon is inert.
  if (opts.momentum && profile.upgradeEffect?.piledriver) bonus += opts.momentum;
  return profile.str + weightMod + charged + bonus;
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

// Kneecapper (§13, Double MG) — limbs-only targeting. Guarantees hull/engine
// can NEVER be struck by this upgrade: after the normal location pick (aimed
// or the D12 fire roll), any non-limb result (structural/power role) is
// remapped onto a limb — preferring the mobility part (Rig legs), falling
// back to the weapon part (Rig arms). Reads the TARGET's own part roles via
// unit-kinds.js so it generalises past Rig (arms/legs) to Tank
// (tracks/turret) and Walker (legs/mount) alike; a kind with no limb parts at
// all (none exist today) yields null and the shot simply finds no legal
// location — the "guard reads for units" case.
function kneecapperLocation(kindId, location) {
  const role = roleOf(kindId, location);
  if (role === "mobility" || role === "weapon") return location;
  const [mobility] = partsByRole(kindId, "mobility");
  const [weapon] = partsByRole(kindId, "weapon");
  return mobility || weapon || null;
}

// §7.7-8 — one Impact Roll per hit. Adds AP (+D3 per raw 6) and Rend (+D3 per
// raw 5-6). Brace subtracts 2 on the target's front arc (§5 preparation).
// Raise Shield (§13 Bulwark) negates covered arcs outright and blunts the rest by 4.
export function rollImpacts(attacker, target, profile, location, opts, providedDice, random) {
  // Thread the real target rig into computeStr's opts (the caller's `opts`
  // here may carry only a display name at `opts.target` — see resolveAttack)
  // so target-conditional STR upgrades (Cold Bore, Opportunist, §13) work.
  const str = computeStr(attacker, profile, { ...opts, target });
  let bonus = arcBonus(profile, opts.arc);
  // Kneecapper — bypasses Raking Fire's front-arc auto-fail (arcBonus
  // returning null) but ONLY when the struck location is a limb on the
  // TARGET (mobility or weapon role). resolveAttack has already remapped
  // `location` onto a limb whenever this upgrade is active, so hull/engine
  // are structurally unreachable here; this is defense-in-depth, not the
  // primary guarantee. Reuses Raking Fire's own side-arc value (+4) as the
  // "workable" front bonus rather than inventing a new number — does NOT
  // touch arcBonus itself, so non-kneecapper Raking Fire guns still auto-fail
  // on the front arc exactly as before.
  if (bonus == null && profile.upgradeEffect?.kneecapper) {
    const role = roleOf(target.kind || "rig", location);
    if (role === "mobility" || role === "weapon") bonus = 4;
  }
  // Brace's front-arc -2 is skipped by a Piledriver Protocol guard-break
  // (opts.guardBreak, §13 Siege Maul) — the smash ignores the target's Brace.
  const braced = !opts.guardBreak && target.preparation?.type === "brace" && opts.arc === "front" ? -2 : 0;
  const hardened = target.hardened ? -1 : 0; // Harden (Ablative Plating active)
  const shield = target.preparation?.type === "raise-shield" ? shieldCoverage(target) : null;
  const shieldNegates = !!shield && shield.negate.includes(opts.arc);
  const shieldBlunt = shield && shield.blunt.includes(opts.arc) ? -4 : 0;
  // Breach Grip (§13, Claw) — a location cracked open eats +2 on every impact
  // from ANY attacker while the crack is live (its stored expiry round is at or
  // past the current round). `opts.round` is threaded in from resolveAttack.
  const crackExpiry = target.cracked?.[location];
  const cracked = crackExpiry != null && opts.round != null && crackExpiry >= opts.round ? 2 : 0;
  const row = impactRow(target.kind || "rig", location, target.weightClass);
  const out = [];
  for (let i = 0; i < opts.hits; i++) {
    const die = rollD(6, providedDice?.impacts?.[i], random);
    if (bonus == null || shieldNegates) { out.push({ die, total: 0, tier: "none", sp: 0 }); continue; }
    let extra = 0;
    if (hasPerk(profile, "Armour Piercing") && die === 6) extra += rollD(3, providedDice?.ap?.[i], random);
    if (hasPerk(profile, "Rend") && die >= 5) extra += rollD(3, providedDice?.rend?.[i], random);
    const total = die + str + bonus + braced + hardened + shieldBlunt + cracked + extra;
    // Penetrator Rounds — every 3rd Autocannon volley bypasses the armour row
    // entirely: every landed hit is forced to Severe (2 SP) regardless of the
    // total rolled or the location's row.
    const sev = opts.penetrate ? { tier: "severe", sp: 2 } : impactSeverity(total, row);
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
  let profile = ctx.profileFor(slot, weaponName, attacker);
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

  // Fire Control Lock (§13, Missile Barrage) — a painted target eats one
  // unmissable, armour-piercing volley. Live only while the paint is fresh (the
  // current round is at or before its expiry round) and aimed at the very rig
  // that was locked. All reads are defensive so a room with no game state (unit
  // tests / cold callers) simply sees no lock. A stale paint is dropped so it
  // can never fire late.
  const round = room?.game?.round || 0;
  const fireControlLock = !!profile.upgradeEffect?.fireControl
    && attacker.lockedTarget != null
    && attacker.lockedTarget === target.id
    && round <= (attacker.lockExpiresRound || 0);
  if (fireControlLock) {
    profile = { ...profile, perks: [...new Set([...(profile.perks || []), "Armour Piercing"])] };
  } else if (attacker.lockedTarget != null && round > (attacker.lockExpiresRound || 0)) {
    attacker.lockedTarget = null; // expire a stale lock
  }
  // Piledriver Protocol (§13, Siege Maul) — a shot fired while storing Momentum
  // unloads ALL of it: +1 STR per point (computeStr) plus a guard-break that
  // ignores the target's Brace (rollImpacts) and cover (computeModifiedAim).
  // Compute the spend ONCE here so the STR bonus, the guard-break, and the
  // post-shot reset below all read the same number. (The design's 3" shove is
  // deferred to the spatial group and NOT applied here.)
  const piledriverSpend = profile.upgradeEffect?.piledriver ? Math.max(0, attacker.momentum || 0) : 0;
  const guardBreak = piledriverSpend > 0;
  // `opts.target` from the caller is a display name (§ see resolveFire), not
  // the rig — override it with the real target so Bloodletter (§13) can read
  // its live SP.
  const th = rollToHit(attacker, profile, { ...opts, target, autoHit: fireControlLock, guardBreak }, opts.dice?.toHit, random);
  if (fireControlLock) attacker.lockedTarget = null; // painted volley consumed
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
    // Kneecapper (§13, Double MG) — remap whatever location was just picked
    // (aimed or random) onto a limb. This is the PRIMARY guarantee that
    // hull/engine are never damaged by this upgrade — it runs unconditionally
    // before any impact/damage code below ever sees `location`.
    if (profile.upgradeEffect?.kneecapper) location = kneecapperLocation(target.kind || "rig", location);
    // A kind with no limb parts at all (none exist today) leaves `location`
    // null here — no legal target, so the shot lands with zero effect rather
    // than crashing on a missing part.
    if (location) {
      impacts = rollImpacts(attacker, target, profile, location,
        { arc: opts.arc, hits: th.hits, charged: opts.charged, strOverride: opts.strOverride, penetrate: th.penetratorShot, round: room?.game?.round || 0, momentum: piledriverSpend, guardBreak },
        opts.dice, random);
      // Kneecapper (§13, Double MG) — a limbs-only rake. On a damaging hit:
      //  (a) TAG the struck limb (`target.kneecapped[location]`) so the cripple
      //      ramp in game-state recompute applies ONLY to limbs this weapon
      //      actually raked — keeping the "focus one limb; switching resets"
      //      identity instead of every weapon crippling half-limbs. Set BEFORE
      //      applyDamage so the recompute fired inside it sees the tag.
      //  (b) thread `noSpill` so the §8 munition cook-off / cascade can't bleed
      //      into hull/engine — "cripple, never kill" (the limb still degrades
      //      and can be destroyed; nothing spills to hull/engine).
      const kneecapHit = !!profile.upgradeEffect?.kneecapper && impacts.some((h) => h.sp > 0);
      if (kneecapHit) {
        target.kneecapped = target.kneecapped || {};
        target.kneecapped[location] = true;
      }
      const dmgOpts = { random, dice: opts.dice, noSpill: kneecapHit || undefined };
      for (const h of impacts) if (h.sp > 0) ctx.applyDamage(room, target, location, h.sp, dmgOpts);
      if (profile.upgradeEffect?.onDamage === "sunder" && impacts.some((h) => h.sp > 0)) {
        ctx.sunderLocation?.(target, location);
      }
      // Breach Grip (§13, Claw) — a damaging Claw hit pries the struck location's
      // armour open, cracking it for +2 impact from anyone until it expires.
      if (profile.upgradeEffect?.breachGrip && impacts.some((h) => h.sp > 0)) {
        ctx.crackLocation?.(room, target, location);
      }
      // Rivet Lock (§13, Rivet Gun) — a damaging volley drives a rivet into the
      // struck location; ctx stacks it and seizes at 3.
      if (profile.upgradeEffect?.rivetLock && impacts.some((h) => h.sp > 0)) {
        ctx.rivetHit?.(room, attacker, target, location);
      }
      // Dismember (§13, Circular Saw) — the prototype escalation of Sunder: also
      // grinds max SP down (via ctx) and permanently cripples the location once
      // it drops to <= half its commissioned original.
      if (profile.upgradeEffect?.dismember && impacts.some((h) => h.sp > 0)) {
        ctx.dismemberLocation?.(room, target, location, { random, dice: opts.dice });
      }
      if (profile.upgradeEffect?.onDamage === "breaching-round" && location === "hull" && impacts.some((h) => h.sp > 0)) {
        ctx.breachHull?.(target);
      }
      applyOnHitPerks(room, attacker, target, profile, { ...opts, hits: th.hits, penetratorShot: th.penetratorShot }, random, ctx);
    }
  }
  // Piledriver Protocol (§13) — the swing is committed, so the stored Momentum is
  // fully spent whether or not it connected. Reset AFTER every read above
  // (computeStr/rollImpacts already used the captured `piledriverSpend`).
  if (piledriverSpend > 0) attacker.momentum = 0;
  if (heat > 0) ctx.bumpHeat(attacker, heat);

  const total = impacts.reduce((s, h) => s + h.sp, 0);
  const str = computeStr(attacker, profile, { ...opts, target, momentum: piledriverSpend });
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
  // Group G — spatial upgrade effects. The board is physical and the engine has
  // no grid, so forced movement / ricochets are NOT simulated with coordinates:
  // each resolves its positional part as a clear player-facing INSTRUCTION in the
  // log (AGENTS.md "Spatial effects — narrate, don't simulate"). Only the
  // non-spatial cadence (Enfilade's aimed-shot counter) is tracked in state.
  const landedDamage = impacts.some((h) => h.sp > 0);
  const pushInstruction = (summary) => ctx.pushResolution(room, {
    kind: "perk", actor: attacker.owner, rigId: target.id, rolls: [], summary, effects: [summary],
  });
  // G1a — Momentum Swing (Wrecking Ball, Tuned): a charging swing that connects
  // knocks the target back 3". Gated on the same "moved this activation" charge
  // that already granted the +2 STR, so it only fires when the charge applied.
  if (profile.upgrade?.id === "momentum-swing" && attacker.movedThisActivation && landedDamage) {
    pushInstruction(`Momentum Swing — knock ${target.name} back 3" (move the mini).`);
  }
  // G1b — Piledriver Protocol (Siege Maul, Prototype): a Momentum-spending smash
  // that connects shoves the target back 3" (piledriverSpend was computed above).
  if (piledriverSpend > 0 && landedDamage) {
    pushInstruction(`Piledriver — shove ${target.name} back 3" (move the mini).`);
  }
  // G1d — Tow Chain (Wrecking Ball, Prototype): a damaging swing hooks the target
  // and flings it up to 4" where the attacker chooses, but the effort roots the
  // attacker for the rest of its activation and runs it +2 heat. On a per-rig
  // 3-round cooldown (from `round`): while recharging the ball hits normally with
  // no fling. `round` is defined above (room.game.round || 0).
  if (profile.upgradeEffect?.towChain && landedDamage) {
    if (round >= (attacker.towChainCooldownUntil || 0)) {
      ctx.bumpHeat(attacker, 2);
      attacker.towedThisActivation = true;
      attacker.towChainCooldownUntil = round + 3;
      pushInstruction(`Tow Chain — fling ${target.name} up to 4" in a direction you choose (move the mini). You are rooted until end of activation; +2 heat.`);
    } else {
      pushInstruction(`Tow Chain recharging — ${attacker.name}'s hit lands with no fling.`);
    }
  }
  // G1e — Harpoon Winch (Harpoon, Prototype): a damaging shot spears the target
  // and reels it up to 4" toward the attacker (narrated). The reel roots the
  // attacker for the rest of its activation and runs it +2 heat; 3-round cooldown,
  // during which the harpoon fires normally with no reel. Mirrors Tow Chain.
  if (profile.upgradeEffect?.harpoonWinch && landedDamage) {
    if (round >= (attacker.harpoonWinchCooldownUntil || 0)) {
      ctx.bumpHeat(attacker, 2);
      attacker.towedThisActivation = true;
      attacker.harpoonWinchCooldownUntil = round + 3;
      pushInstruction(`Harpoon Winch — reel ${target.name} up to 4" toward you (move the mini). You are rooted until end of activation; +2 heat.`);
    } else {
      pushInstruction(`Harpoon Winch recharging — ${attacker.name}'s hit lands with no reel.`);
    }
  }
  // G1c — Enfilade (Sniper Cannon, Prototype): only AIMED shots feed the cadence
  // (per the design). Count every aimed shot fired; on every 3rd, emit a ricochet
  // instruction — the player picks the rig in line of sight behind the target and
  // applies the +2 STR hit via the normal controls.
  if (profile.upgradeEffect?.enfilade && opts.aimed) {
    attacker.enfiladeShots = (attacker.enfiladeShots || 0) + 1;
    if (attacker.enfiladeShots % 3 === 0) {
      pushInstruction(`Enfilade — ricochet! Resolve a +2 STR hit on the next rig in line of sight behind ${target.name} (player's choice).`);
    }
  }
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
  // Napalm — a non-stacking burn: raise the target's burning to the effect's
  // value (never past it), leaving it to tick each activation until doused.
  if (profile.upgradeEffect?.burn && !profile.upgradeEffect?.burnStacks) {
    target.burning = Math.max(target.burning || 0, profile.upgradeEffect.burn);
    effects.push(`Napalm — target burning ${target.burning}`);
  }
  // Conflagration — a stacking burn: +1 burn per hit-resolution, and the
  // attacker runs itself hot (+1 heat) as the downside of the chain.
  if (profile.upgradeEffect?.burnStacks) {
    target.burning = (target.burning || 0) + 1;
    ctx.bumpHeat(attacker, 1);
    effects.push(`Conflagration — target burning ${target.burning}, +1 self-heat`);
  }
  // Pinning Burst — 4+ landed hits pin the target for its next activation.
  if (profile.upgradeEffect?.pinOnHits && opts.hits >= profile.upgradeEffect.pinOnHits) {
    target.actionPenaltyNextActivation = Math.max(target.actionPenaltyNextActivation || 0, 1);
    effects.push("Pinning Burst — target loses 1 action");
  }
  // Superconductor Edge — once per attack (not per hit), while running past
  // half the attacker's heat cap, dump 1 heat from attacker into target.
  if (profile.upgradeEffect?.superconductor) {
    const cap = HEAT_CAPACITY[attacker.weightClass];
    if (cap != null && (attacker.engine?.heat || 0) > cap / 2) {
      ctx.bumpHeat(attacker, -1);
      ctx.bumpHeat(target, 1);
      effects.push("Superconductor Edge — 1 heat transferred to target");
    }
  }
  // Penetrator Rounds — cosmetic confirmation that this volley was the 3rd
  // (armour-bypassing) one; the actual severity override happened in rollImpacts.
  if (profile.upgradeEffect?.penetrator && opts.penetratorShot) {
    effects.push("Penetrator Rounds — armour bypassed, hits forced to Severe");
  }
  // Suppression Lock — consecutive Mini Gun hits on the same target ramp a
  // pin: 1 stack halves their speed, 2 also docks an action, 3 immobilises
  // them and blocks their next Prepare. Switching targets resets to 1 stack.
  // The attacker runs hot (+1 heat) every attack while the lock is active.
  if (profile.upgradeEffect?.suppressLock) {
    if (attacker.suppressTarget === target.id) {
      attacker.suppressStacks = Math.min(3, (attacker.suppressStacks || 0) + 1);
    } else {
      attacker.suppressTarget = target.id;
      attacker.suppressStacks = 1;
    }
    const stacks = attacker.suppressStacks;
    if (stacks >= 1) target.speedHalvedNextRound = true;
    if (stacks >= 2) target.actionPenaltyNextActivation = Math.max(target.actionPenaltyNextActivation || 0, 1);
    if (stacks === 3) {
      // A scoped, self-clearing pin — NOT the permanent `immobilised` flag (that
      // one is reserved for leg destruction and never resets mid-match).
      // suppressImmobile is cleared in runRecovery, so the pin lasts one round
      // and must be re-applied by continued suppression.
      target.suppressImmobile = true;
      target.noPrepNextActivation = true;
    }
    ctx.bumpHeat(attacker, 1);
    effects.push(`Suppression Lock ${stacks} — ${target.name} ${
      stacks === 3 ? "pinned, Prepare blocked" : stacks === 2 ? "action penalty" : "speed halved"
    }`);
  }
  // Ion Storm (§13, Arc Gun) — an EMP surge. A landed Arc Gun hit disrupts the
  // target for its next activation (loses an action, can't Prepare, can't fire
  // an equipment active) and spikes its heat by 2. The discharge overloads the
  // attacker's own gun: +3 self-heat and its Arc Gun is locked until its next
  // fire attempt (arcLockedNext, consumed by the fire gate in game-state.js).
  if (profile.upgradeEffect?.ionStorm) {
    target.actionPenaltyNextActivation = Math.max(target.actionPenaltyNextActivation || 0, 1);
    target.noPrepNextActivation = true;
    target.noActivesNextActivation = true;
    ctx.bumpHeat(target, 2);
    ctx.bumpHeat(attacker, 3);
    attacker.arcLockedNext = true;
    effects.push("Ion Storm — target EMP'd (no action / Prepare / active next activation), attacker's Arc Gun overloaded");
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
