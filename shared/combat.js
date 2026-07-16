// Pure combat math (§7). State mutation happens only through the `ctx` the
// caller (game-state.js) injects, so this module has no import cycle and is
// unit-testable in isolation. It imports ONLY from rules.js.
import {
  BASE_AIM, WEIGHT_PEN_MOD, hitLocation, shieldCoverage, HEAT_CAPACITY,
  equipmentUpgradeEffectOf, toughnessOf, woundTarget, WOUND_DIE,
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
// fixed reach and keep their scalar `accuracy`. A missing distance (legacy
// callers / tests) yields the peak — i.e. "at the sweet spot, in range".
export function weaponAccuracyAt(profile, distance) {
  if (profile.melee) return profile.accuracy?.[0] || 0;
  const d = Number(distance);
  if (!Number.isFinite(d)) return profile.peak || 0;
  const penalty = Math.round((profile.dropoff || 0) * Math.abs(d - profile.sweet));
  return (profile.peak || 0) - penalty;
}

// §7.4 — modified Aim (the D6 target number). Higher Accuracy lowers the number.
//
// Returns `{ value, terms }` — `terms` is the itemised ledger behind `value`,
// one `{ label, value }` per input that ACTUALLY fired, mirroring penBreakdown.
// Terms read in ACCURACY SPACE, not in target-number space: a bonus is positive,
// a penalty is negative, and `value` is `base - (sum of every non-base term)`.
// So cover, which subtracts 2 from Accuracy, emits `{ label: "cover", value: -2 }`.
// Labels are the words a player reads on the table, not our field names.
export function aimBreakdown(attacker, profile, opts) {
  const terms = [];
  const base = BASE_AIM;
  const weaponAccuracy = weaponAccuracyAt(profile, opts.distance);
  // Cover is skipped by Airburst Fuze (ignoreCover) and by a Piledriver Protocol
  // guard-break (opts.guardBreak, §13 Siege Maul) — both reuse the same path.
  const cover = (profile.upgradeEffect?.ignoreCover || opts.guardBreak || (opts.painted && !profile.melee)) ? 0 : Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
  const aimedPenalty = opts.aimed && !hasPerk(profile, "Precision") && !opts.waiveAimPenalty ? -2 : 0;
  const hullPenalty = attacker.hull.sp === 0 ? -1 : 0;
  // §engagement — a rig locked in melee fires ranged weapons at −2 accuracy.
  const engagedPenalty = opts.engaged && !profile.melee ? -2 : 0;
  // Recon paint (spec: Support Units) — allied ranged fire on a marked enemy
  // gains +1 Aim on top of the cover cancel above.
  const paintBonus = (opts.painted && !profile.melee) ? 1 : 0;
  // Pop Smoke (Countermeasures active) — every attacker is at −2 Accuracy against a
  // rig hidden in its own smoke, until that rig's next activation.
  const smoke = opts.targetSmoke ? -2 : 0;
  // Predictive Tracking (Fire Control Tuned) — vs a static/pinned/immobilised
  // target the shot ignores cover and gains +2 Accuracy. `opts.targetPinned` is set by
  // the fire path (game-state.js). Read the effect live from the catalog by id;
  // combat.js imports only rules.js, so no game-state cycle.
  const predictive = attacker.equipment === "targeting-computer" && !profile.melee && !!opts.targetPinned
    && !!equipmentUpgradeEffectOf(attacker.equipment, attacker.equipmentUpgrade)?.predictiveTracking;
  const predictiveAccuracy = predictive ? 2 : 0;
  // Targeting Computer passive — the first Fire this activation ignores cover
  // and the engaged −2 (opts.fireControlFirst is set once per activation by the
  // fire path). Read directly off the attacker to avoid a game-state import cycle.
  const coverEff = (opts.fireControlFirst || predictive) ? 0 : cover;
  const engagedEff = opts.fireControlFirst ? 0 : engagedPenalty;
  // Ballistic Processor (Field) — Accuracy bonus when the measured distance is within
  // the weapon's sweet band (|distance − sweet| ≤ 2). The bonus magnitude is read
  // from the equipment upgrade's effect tag (`sweetBandAccuracy`) via
  // equipmentUpgradeEffectOf — the catalog lives in rules.js, which combat.js may
  // import without a game-state cycle. Only ballistic-processor carries the tag;
  // other targeting-computer upgrades resolve to 0.
  const inSweetBand = !profile.melee && opts.distance != null && Math.abs(opts.distance - (profile.sweet ?? 0)) <= 2;
  const ballistic = (attacker.equipment === "targeting-computer" && inSweetBand) ? (equipmentUpgradeEffectOf(attacker.equipment, attacker.equipmentUpgrade)?.sweetBandAccuracy ?? 0) : 0;
  const accuracyTotal = weaponAccuracy - coverEff + aimedPenalty + hullPenalty + engagedEff + paintBonus + smoke + ballistic + predictiveAccuracy;

  // The two headline inputs are ALWAYS terms, even at 0, exactly as penBreakdown
  // always pushes "weapon Penetration": they are what every modifier below is measured
  // against. A gun contributing 0 Accuracy at its current range is a fact the player
  // needs, not an absence to hide.
  terms.push({ label: "base aim", value: base });
  terms.push({
    label: !profile.melee && Number.isFinite(Number(opts.distance))
      ? `weapon Accuracy at ${opts.distance}"` : "weapon Accuracy",
    value: weaponAccuracy,
  });
  // Cover, and the cancels. `rawCover` is what the target ACTUALLY had on the
  // table, before any upgrade ignored it — the cancel branches above zero
  // `cover`/`coverEff` and so cannot tell us that on their own.
  const rawCover = Math.max(0, Math.min(2, Math.floor(Number(opts.cover) || 0)));
  if (coverEff) terms.push({ label: "cover", value: -coverEff });
  else if (rawCover) {
    // A cancelled penalty must NOT be listed (there IS no cover penalty — it was
    // ignored), but the CANCELLER is listed as a ZERO-VALUED term. This is the one
    // place a zero term earns its space: it explains an ABSENCE. Without it a
    // player looking at real cover on the table sees no cover term at all and
    // concludes the app is broken. Do not "simplify" this away.
    //
    // Precedence follows the evaluation order above: `cover` is zeroed by
    // ignoreCover / guardBreak / paint BEFORE `coverEff` consults fireControlFirst
    // and predictive, so the earlier canceller is the one that actually did it.
    const canceller = profile.upgradeEffect?.ignoreCover ? "airburst fuze"
      : opts.guardBreak ? "piledriver guard-break"
      : (opts.painted && !profile.melee) ? "recon paint"
      : opts.fireControlFirst ? "targeting computer"
      : "predictive tracking";
    terms.push({ label: `${canceller} (ignores cover)`, value: 0 });
  }
  if (aimedPenalty) terms.push({ label: "aimed shot", value: aimedPenalty });
  if (hullPenalty) terms.push({ label: "hull wrecked", value: hullPenalty });
  if (engagedEff) terms.push({ label: "locked in melee", value: engagedEff });
  // Same absence-explaining rule as cover: the engaged −2 is cancelled only by
  // the Targeting Computer's first fire, so name it rather than silently drop it.
  else if (engagedPenalty) terms.push({ label: "targeting computer (ignores melee lock)", value: 0 });
  // Recon paint and Predictive Tracking each do TWO things — cancel cover and
  // grant Accuracy. The bonus term below is a separate fact from the cancel term
  // above; neither substitutes for the other.
  if (paintBonus) terms.push({ label: "recon paint", value: paintBonus });
  if (smoke) terms.push({ label: "target in smoke", value: smoke });
  if (ballistic) terms.push({ label: "ballistic processor", value: ballistic });
  if (predictiveAccuracy) terms.push({ label: "predictive tracking", value: predictiveAccuracy });

  return { value: base - accuracyTotal, terms };
}

// §7.4 — the D6 target number. Thin wrapper over aimBreakdown so the eleven
// inputs folded in here can be shown in the resolution ledger without changing
// any caller.
export function computeModifiedAim(attacker, profile, opts) {
  return aimBreakdown(attacker, profile, opts).value;
}

// §7.4 — roll ROF (+2 for Full Auto) D6, count hits, tally fire-mode heat
// (each 1 rolled under Full Auto / Charged Shot adds 1 heat, §6).
export function rollToHit(attacker, profile, opts, providedDice, random) {
  // aimBreakdown, not computeModifiedAim: the ledger's hit step needs the terms
  // that MADE this target number, and they must be the ones the engine actually
  // used. Recomputing them in resolveAttack would let the two drift.
  const aim = aimBreakdown(attacker, profile, opts);
  const modAim = aim.value;
  const fullAuto = opts.fullAuto && hasPerk(profile, "Full Auto");
  // Bloodletter — an extra to-hit die vs a target missing SP anywhere.
  const bloodletterRof = opts.target && profile.upgradeEffect?.vsDamaged?.rof && !isUndamaged(opts.target)
    ? profile.upgradeEffect.vsDamaged.rof : 0;
  // Redline Governor — extra to-hit dice from attacker heat over its class
  // cap, mirroring the Penetration bonus in computePen (capped at +3).
  let redlineRof = 0;
  if (profile.upgradeEffect?.redline) {
    const cap = HEAT_CAPACITY[attacker.weightClass];
    const over = cap != null ? Math.max(0, (attacker.engine?.heat || 0) - cap) : 0;
    redlineRof = Math.min(3, over);
  }
  // Penetrator Rounds — every 3rd Autocannon volley skips the wound roll
  // (forced in rollWounds below); the belt then cycles slow for exactly the
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
  // Lock Sight (Fire Control active) — the next shot this activation rerolls
  // all its missed to-hit dice, i.e. up to a full volley of rerolls (opts.lockSight).
  const rerolls = Math.max(0, Math.floor(profile.upgradeEffect?.rerollMisses || 0)) + (opts.lockSight ? rof : 0);
  const dice = [];
  // The ledger's per-die view. `dice` stays a bare face array (its consumers —
  // the `rolls` log — predate the ledger); `hitDice` records the face WITH the
  // verdict the loop actually reached, so the ledger never has to re-derive
  // "did this die hit?" from `value >= modAim`. That re-derivation would be
  // wrong under autoHit (Fire Control Lock), where a face below the target
  // number still counts.
  const hitDice = [];
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
    hitDice.push({ value: d, ok: hit });
    if (hit) hits += 1;
    if (heatOnOnes && d === 1) fireModeHeat += 1;
  }
  // §7 — reactive on-incoming-hit seam, to-hit stage. A defender may reroll/alter
  // the counted hits before impacts are rolled (Point-Defense System). `location`/
  // `row` are null here; `modAim` (the target number) and the RNG (`random` +
  // any `providedDice.pd` reroll faces) are threaded through so the branch can
  // reroll the landed dice while combat.js stays pure — it only touches the
  // injected RNG, never game-state.
  const reacted = applyDefensiveReactions(
    opts.target,
    { kind: "tohit", ranged: !profile.melee, hits, modAim },
    { location: null, row: null, spendHeat: opts.spendHeat || (() => {}), random, providedDice },
  );
  hits = reacted.hits;
  // NOTE: a Point-Defense reroll (the seam above) changes the counted `hits`
  // WITHOUT changing the faces in `hitDice` — the rerolled faces are the
  // defender's, not this volley's. So `hits` is authoritative and may disagree
  // with the count of `ok` flags. The ledger reports `hits`, and the PD spend
  // gets its own resolution entry, so the disagreement is explained on screen
  // rather than hidden.
  return { modAim, rof, hits, fireModeHeat, dice, hitDice, aimTerms: aim.terms, penetratorShot };
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

// §12/§7 — Penetration = weapon Penetration + weight modifier + Charged Shot + any conditional
// Tuned/Prototype bonuses (§13) that read the attacker/target state via `opts`.
//
// Returns `{ value, terms }` — `terms` is the itemised ledger behind `value`,
// one `{ label, value }` per contribution that ACTUALLY fired. A modifier
// worth 0 pushes nothing: with ~15 possible contributions here, rendering the
// dead ones would bury the two that decided the shot. Labels are the words a
// player reads on the table ("Cold Bore", "light chassis"), not our field names.
export function penBreakdown(attacker, profile, opts) {
  const terms = [];
  // Anvil Boss riposte (§13 Bulwark) — a forced, flat Penetration for the free counter
  // that ignores weight class and every conditional Tuned/Prototype bonus, so
  // the counter lands at exactly the upgrade's ripostePen regardless of who owns
  // the shield. Threaded through `rollWounds` from `resolveAttack`.
  if (opts.penOverride != null) {
    return { value: opts.penOverride, terms: [{ label: "forced Penetration", value: opts.penOverride }] };
  }
  const charged = opts.charged && hasPerk(profile, "Charged Shot") ? 2 : 0;
  const weightMod = profile.flatPick ? 0 : (WEIGHT_PEN_MOD[attacker.weightClass] || 0);
  // The weapon's own Penetration is the floor every modifier is measured against,
  // so it is always a term even though every other entry here is conditional.
  terms.push({ label: "weapon Penetration", value: profile.pen });
  if (weightMod) terms.push({ label: `${attacker.weightClass} chassis`, value: weightMod });
  if (charged) terms.push({ label: "Charged Shot", value: charged });
  let bonus = 0;
  // Reactor Overdrive (§13, Power Prototype) — +2 Penetration to every attack while the
  // Overclock-armed flag rides this activation (set in game-state.js's overclock
  // branch, cleared at activation end).
  if (attacker.reactorOverdriveActive) {
    bonus += 2;
    terms.push({ label: "Reactor Overdrive", value: 2 });
  }
  // Cold Bore — +3 Penetration against a target whose every location is at max SP.
  if (opts.target && profile.upgradeEffect?.coldBore && isUndamaged(opts.target)) {
    bonus += 3;
    terms.push({ label: "Cold Bore", value: 3 });
  }
  // Full Tilt / Momentum Swing — Penetration while charging in (moved this activation).
  // `charge` is a generalised key: Full Tilt sets it to 3, Momentum Swing to 2.
  if (attacker.movedThisActivation && profile.upgradeEffect?.charge) {
    bonus += profile.upgradeEffect.charge;
    terms.push({ label: "charging in", value: profile.upgradeEffect.charge });
  }
  // Opportunist — +3 Penetration vs a target that's disrupted: overheated past its
  // class cap, or carrying an action penalty into its next activation.
  if (opts.target && profile.upgradeEffect?.vsDisrupted) {
    const cap = HEAT_CAPACITY[opts.target.weightClass];
    const disrupted = (opts.target.actionPenaltyNextActivation || 0) > 0
      || (cap != null && (opts.target.engine?.heat || 0) > cap);
    if (disrupted) {
      bonus += 3;
      terms.push({ label: "Opportunist", value: 3 });
    }
  }
  // Taut Cable — +3 Penetration against a target already pinned down: immobilised, or
  // held in a melee lock (engaged).
  if (opts.target && profile.upgradeEffect?.vsPinned) {
    if (opts.target.immobilised || opts.target.engagedWith != null) {
      bonus += 3;
      terms.push({ label: "Taut Cable", value: 3 });
    }
  }
  // Steady Aim (§13, Crossbow) — +3 Penetration when the measured firing distance is
  // within 2" of the weapon's sweet spot. Needs the distance threaded in via opts.
  if (profile.upgradeEffect?.steadyAim && opts.distance != null
      && Math.abs(opts.distance - profile.sweet) <= 2) {
    bonus += 3;
    terms.push({ label: "Steady Aim", value: 3 });
  }
  // Exploit Wound (§13, Talon) — +3 Penetration against a struck location already below
  // its max SP. Needs the struck location threaded in via opts.location.
  if (profile.upgradeEffect?.vsWoundedLoc && opts.target && opts.location) {
    const p = opts.target[opts.location];
    if (p && p.sp < p.max) {
      bonus += 3;
      terms.push({ label: "Exploit Wound", value: 3 });
    }
  }
  // Evisceration downside (§13, Talon) — the talon needs a wound to grip: -1 Penetration
  // against a struck location that is still fully undamaged.
  if (profile.upgradeEffect?.eviscerate && opts.target && opts.location) {
    const p = opts.target[opts.location];
    if (p && p.sp === p.max) {
      bonus -= 1;
      terms.push({ label: "Evisceration (no wound to grip)", value: -1 });
    }
  }
  // Redline Governor — the hotter the attacker runs past its own class cap,
  // the harder the Chainsaw bites (+1 Penetration per heat over cap, capped at +3).
  if (profile.upgradeEffect?.redline) {
    const cap = HEAT_CAPACITY[attacker.weightClass];
    const over = cap != null ? Math.max(0, (attacker.engine?.heat || 0) - cap) : 0;
    bonus += Math.min(3, over);
    // The term carries what actually applied, not the +3 cap — a Chainsaw one
    // point over cap must read "+1", not the headline number.
    if (Math.min(3, over)) terms.push({ label: "Redline Governor", value: Math.min(3, over) });
  }
  // Superconductor Edge — running past half the attacker's own heat cap
  // charges the blade for +2 Penetration.
  if (profile.upgradeEffect?.superconductor) {
    const cap = HEAT_CAPACITY[attacker.weightClass];
    if (cap != null && (attacker.engine?.heat || 0) > cap / 2) {
      bonus += 2;
      terms.push({ label: "Superconductor Edge", value: 2 });
    }
  }
  // Piledriver Protocol — a Siege Maul shot spends stored Momentum for +1 Penetration
  // per point. The spent amount is threaded in via opts.momentum (computed once
  // in resolveAttack so the Penetration bonus and the post-shot Momentum reset stay in
  // lockstep). Gated on the piledriver effect so a stray opts.momentum on any
  // other weapon is inert.
  if (opts.momentum && profile.upgradeEffect?.piledriver) {
    bonus += opts.momentum;
    terms.push({ label: "Piledriver Protocol", value: opts.momentum });
  }
  // Kickstart Pistons (Mobility Tuned) — a melee blow right after Sprinting into
  // base contact this activation hits +2 Penetration, but only the FIRST such blow:
  // `chargedIntoContact` is armed by the Sprint path, `kickstartUsed` is set by
  // resolveFire once a melee attack lands. Read the equipment effect live from the
  // catalog by id (combat.js imports only rules.js). NOTE: the design also names
  // Jump-into-contact, but the Jump Jets active can't form an engagement lock in
  // this engine yet, so only Sprint arms it today (see follow-up task).
  if (profile.melee && attacker.chargedIntoContact && !attacker.kickstartUsed
      && equipmentUpgradeEffectOf(attacker.equipment, attacker.equipmentUpgrade)?.kickstartPistons) {
    bonus += 2;
    terms.push({ label: "Kickstart Pistons", value: 2 });
  }
  // Cryo Reservoir / Meltdown Protocol — a spent charge arms +Penetration on the next
  // attack. Shared transient off the attacker's equipState; consumed in
  // resolveFire and cleared in endActivation so it can't leak past its activation.
  const nextPen = attacker.equipState?.nextAttackPen || 0;
  if (nextPen) terms.push({ label: "primed charge", value: nextPen });
  return { value: profile.pen + weightMod + charged + bonus + nextPen, terms };
}

// §12/§7 — the shot's effective Penetration. Thin wrapper over penBreakdown so the ~15
// contributions can be shown in the resolution ledger without changing any
// caller: the engine used to compute this arithmetic and throw it away, which is
// why a player could not tell why a shot did nothing.
export function computePen(attacker, profile, opts) {
  return penBreakdown(attacker, profile, opts).value;
}

// §7.7 / §13 — arc Penetration bonus. Raking Fire (machine guns) replaces the standard
// side/rear values and cannot damage the front arc (returns null = auto-fail).
//
// Melee used to return 0 here. That was the root cause of the impact-total
// model's 69 dead zones: ranged had a ladder to climb into heavy armour and
// melee had none, so a melee total was capped at `6 + Penetration` forever. Melee now
// falls through to the shared ladder. The Raking branch stays FIRST — no melee
// weapon carries the perk, but ordering makes that explicit.
export function arcBonus(profile, arc) {
  if (hasPerk(profile, "Raking Fire")) {
    if (arc === "side") return 3;
    if (arc === "rear") return 6;
    return null;
  }
  if (arc === "side") return 2;
  if (arc === "rear") return 3;
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

// §7.5 — one Wound Roll (d10) per hit. The shot's effective Penetration is compared
// to the struck location's Toughness: wound on `die >= woundTarget(effPen, T)`.
// Every modifier below moves EFFECTIVE Penetration, not a total — the wound TN clamps at
// 10, so a natural 10 always wounds and no matchup is hopeless. Each wound deals
// the weapon's `d`. Brace subtracts 2 on the target's front arc (§5 preparation).
// Raise Shield (§13 Bulwark) negates covered arcs outright and blunts the rest by 3.
export function rollWounds(attacker, target, profile, location, opts, providedDice, random) {
  // Thread the real target rig into computePen's opts (the caller's `opts`
  // here may carry only a display name at `opts.target` — see resolveAttack)
  // so target-conditional Penetration upgrades (Cold Bore, Opportunist, §13) work.
  // penBreakdown, not computePen: the ledger's wound step needs the ~15
  // contributions behind this Penetration, and they must be the ones this roll used.
  const penBd = penBreakdown(attacker, profile, { ...opts, target, location });
  const pen = penBd.value;
  let bonus = arcBonus(profile, opts.arc);
  // Kneecapper — bypasses Raking Fire's front-arc auto-fail (arcBonus
  // returning null) but ONLY when the struck location is a limb on the
  // TARGET (mobility or weapon role). resolveAttack has already remapped
  // `location` onto a limb whenever this upgrade is active, so hull/engine
  // are structurally unreachable here; this is defense-in-depth, not the
  // primary guarantee. Reuses the STANDARD side-arc bonus (+2) as the
  // "workable" front value rather than inventing a new number — does NOT
  // touch arcBonus itself, so non-kneecapper Raking Fire guns still auto-fail
  // on the front arc exactly as before. (Was +4 under the impact-total model,
  // which read off Raking Fire's old side value; both ladders rescaled in
  // Task 4, so this tracks the new standard side bonus.)
  if (bonus == null && profile.upgradeEffect?.kneecapper) {
    const role = roleOf(target.kind || "rig", location);
    if (role === "mobility" || role === "weapon") bonus = 2;
  }
  // Brace's front-arc -2 is skipped by a Piledriver Protocol guard-break
  // (opts.guardBreak, §13 Siege Maul) — the smash ignores the target's Brace.
  const braced = !opts.guardBreak && target.preparation?.type === "brace" && opts.arc === "front" ? -2 : 0;
  // Harden (Ablative Plating active). The depth magnitude is read from the
  // equipment upgrade's effect tag (`hardenImpact`) via equipmentUpgradeEffectOf
  // — the catalog lives in rules.js, importable by combat.js without a
  // game-state cycle. Only reinforced-plating carries the tag (→ −2); base stays −1.
  const hardenDepth = equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.hardenImpact ?? 1;
  const hardened = target.hardened ? -hardenDepth : 0;
  // Reactive Armor (Ablative Plating, Tuned) — a location already hardened this
  // round docks a further 2 effective Penetration. The list is recorded by the wound-stage
  // defensive seam below and cleared each Recovery (refreshEquipState).
  const reactive = target.equipState?.reactiveArmorLocs?.includes(location) ? -2 : 0;
  // Reactive Plating (Countermeasures) — side/rear attacks lose Penetration. The dock
  // magnitude is read from the equipment upgrade's effect tag (`sideRearPen`) via
  // equipmentUpgradeEffectOf — the catalog lives in rules.js, importable by
  // combat.js without a game-state cycle. Base Reactive Plating is −1; Angled
  // Plates carries the −2 tag. Front arc is unaffected.
  let sideRearDock = 0;
  if (target.equipment === "reactive-plating" && (opts.arc === "side" || opts.arc === "rear")) {
    sideRearDock = equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.sideRearPen ?? -1;
  }
  const shield = target.preparation?.type === "raise-shield" ? shieldCoverage(target) : null;
  const shieldNegates = !!shield && shield.negate.includes(opts.arc);
  const shieldBlunt = shield && shield.blunt.includes(opts.arc) ? -3 : 0;
  // Breach Grip (§13, Claw) — a cracked location is easier to wound while the
  // crack is live (its stored expiry round is at or past the current round).
  // `opts.round` is threaded in from resolveAttack.
  const crackExpiry = target.cracked?.[location];
  const cracked = crackExpiry != null && opts.round != null && crackExpiry >= opts.round ? 2 : 0;

  const toughness = toughnessOf(target.kind || "rig", location, target.weightClass);

  // The wound step's ledger terms: everything penBreakdown folded into the
  // nominal Penetration, PLUS the arc/defender modifiers computed above. Each is read
  // from the LOCAL the loop below actually adds into `effPen` — never
  // recomputed — so the terms are guaranteed to sum to the effective Penetration the
  // engine tested. A modifier worth 0 pushes nothing (same rule as
  // penBreakdown): with eight possible entries here, listing the dead ones
  // would bury the one that decided the shot.
  //
  // Labels are the words a player reads on the table, not our field names.
  const woundTerms = [...penBd.terms];
  if (bonus) woundTerms.push({ label: `${opts.arc} arc`, value: bonus });
  if (braced) woundTerms.push({ label: "target braced", value: braced });
  if (hardened) woundTerms.push({ label: "hardened", value: hardened });
  if (reactive) woundTerms.push({ label: "reactive armor", value: reactive });
  if (shieldBlunt) woundTerms.push({ label: "shield blunt", value: shieldBlunt });
  if (cracked) woundTerms.push({ label: "cracked open", value: cracked });
  if (sideRearDock) woundTerms.push({ label: "reactive plating", value: sideRearDock });

  const out = [];
  for (let i = 0; i < opts.hits; i++) {
    const die = rollD(WOUND_DIE, providedDice?.wounds?.[i], random);
    // Earned zeroes — a raised shield, or firing into a rake's blind arc. These
    // short-circuit before the roll is compared and stay hard zeroes even on a
    // natural 10. An ARMOUR zero was the bug this rewrite kills; an EARNED zero
    // is a mechanic and must survive.
    if (bonus == null || shieldNegates) {
      // `noRoll` names WHY there was no wound roll, so the ledger can say it
      // rather than emit a step the player has to decode from a null TN. The
      // order mirrors the condition above: a rake's blind arc short-circuits
      // before the shield is consulted.
      // `d` rides even here, where nothing wounded: the ledger's damage step
      // reads it off this object, and a shield-negated attack still has to say
      // what the weapon WOULD have dealt rather than render a blank term.
      out.push({
        die, target: null, pen: null, toughness, sp: 0, negated: true, wounded: false,
        dmg: profile.dmg || 1, rend: 0, evisc: 0,
        noRoll: bonus == null ? "arc" : "shield", terms: woundTerms,
      });
      continue;
    }
    const effPen = pen + bonus + braced + hardened + reactive + shieldBlunt + cracked + sideRearDock;
    const tn = woundTarget(effPen, toughness);
    // Penetrator Rounds (§13) — every 3rd Autocannon volley skips the wound
    // roll entirely (was: forced Severe against the old armour row).
    let wounded = opts.penetrate || die >= tn;
    // Armour Piercing — reroll a failed wound. Buys frequency, not depth.
    if (!wounded && hasPerk(profile, "Armour Piercing")) {
      const re = rollD(WOUND_DIE, providedDice?.ap?.[i], random);
      wounded = re >= tn;
    }
    let sp = 0;
    // Rend / Evisceration are threaded out per wound, not just folded into `sp`,
    // because the ledger's damage step names each one. Rend the ledger could in
    // principle recompute from the profile's perks, and it rides anyway, for
    // shape parity and to keep the arithmetic in one place. Evisceration is the
    // one that genuinely CANNOT be re-derived there: it reads the location's SP
    // BEFORE this volley's damage was applied, which is gone by the time the
    // ledger runs.
    let rend = 0;
    let evisc = 0;
    if (wounded) {
      // Rend — +1 D per wound. Buys depth, not frequency (cf. AP above).
      rend = hasPerk(profile, "Rend") ? 1 : 0;
      // Evisceration (§13, Talon) — +1 D against a location already at or below
      // half its max SP (was: forced Critical).
      evisc = profile.upgradeEffect?.eviscerate && target[location]
        && target[location].sp <= target[location].max / 2 ? 1 : 0;
      sp = (profile.dmg || 1) + rend + evisc;
    }
    const resolved = applyDefensiveReactions(
      target,
      { die, target: tn, pen: effPen, toughness, sp, kind: "wound" },
      { location, spendHeat: opts.spendHeat || (() => {}) },
    );
    // `wounded` is recorded separately from `sp` on purpose. Ablative Cascade
    // (the seam above) zeroes the SP of a wound that DID land, so `sp > 0` is
    // not the same question as "did the wound roll pass" — the ledger's wound
    // step reports the roll, the damage step reports the SP.
    out.push({ ...resolved, wounded, dmg: profile.dmg || 1, rend, evisc, terms: woundTerms });
  }
  return out;
}

// §7 — reactive on-incoming-hit seam. The single point where a DEFENDER may
// alter an incoming attack. It is installed at TWO pipeline stages, discriminated
// by `hit.kind`, so later mechanics only ADD branches here — never new call sites:
//   • "tohit"  — in rollToHit, AFTER successful hit dice are counted, BEFORE
//                impacts are rolled. Consumer: Point-Defense System (reroll the
//                landed dice; only ranged hits carry `hit.ranged === true`).
//                `location`/`row` are null at this stage; `modAim` + the RNG
//                (`random`/`providedDice`) are threaded in for the reroll.
//   • "wound"  — in rollWounds, per resolved wound roll, AFTER the d10 is
//                compared to the wound TN. Consumers: Reactive Armor (record the
//                struck location), Ablative Cascade (negate a wound for a
//                charge). Carries a real `{ location }` — there is no armour row
//                under the wound model.
// combat.js is pure (no game-state import), so any heat spend goes through the
// injected `ctx.spendHeat(n)` mutator that game-state.js wires to bumpHeat. A
// defender with no reactive gear falls through every branch and the hit is
// returned unchanged.

export function applyDefensiveReactions(target, hit, ctx) {
  // Point-Defense System (Reactive Plating, Prototype) — a ranged hit may be met
  // by one interceptor charge, forcing the attacker to reroll every landed hit
  // die. The seam has already counted `hit.hits` landed dice; rerolling them
  // ("all successful hit dice") re-tests the same number of dice against the
  // shot's target number (`hit.modAim`) and returns the new landed count in
  // `.hits`, which rollToHit writes back into its tally. A 6 always lands, matching
  // rollToHit. +1 heat per charge (ctx.spendHeat). Unusable the round after this
  // rig fired its own ranged weapon (equipState.pdLocked, rolled forward in
  // refreshEquipState). Ranged only; melee carries `ranged === false`. combat.js
  // stays pure: the RNG (`ctx.random`) and reroll faces (`ctx.providedDice.pd`)
  // are injected by rollToHit exactly like `spendHeat`.
  if (hit.kind === "tohit" && hit.ranged && target
      && equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.pointDefense
      && (target.equipState?.interceptors || 0) > 0
      && !target.equipState?.pdLocked) {
    target.equipState.interceptors -= 1;
    ctx.spendHeat(1);
    let newHits = 0;
    for (let i = 0; i < hit.hits; i++) {
      const d = rollD(6, ctx.providedDice?.pd?.[i], ctx.random);
      if (d >= hit.modAim || d === 6) newHits += 1;
    }
    return { ...hit, hits: newHits };
  }
  // Reactive Armor (Ablative Plating, Tuned) — the FIRST damaging wound each
  // round to a location hardens THAT location by -2 effective Penetration (Harden-
  // equivalent) until this rig's next activation; further wounds to a hardened
  // location are docked too. The per-round list is cleared in Recovery
  // (refreshEquipState). Wound-stage only, and only for a wound that landed.
  //
  // The dock itself is applied in rollWounds (it reads this list); this branch
  // only RECORDS. Re-deriving damage here would double-apply it.
  if (hit.kind === "wound" && hit.sp > 0
      && equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.reactiveArmor) {
    const locs = target.equipState?.reactiveArmorLocs;
    if (locs && !locs.includes(ctx.location)) locs.push(ctx.location);
  }
  // Ablative Cascade (Ablative Plating, Prototype) — spend one charge to negate
  // a wound outright; each spend runs the defender +1 heat via ctx.spendHeat.
  // Charges refill to 2 each Recovery (game-state refreshEquipState).
  //
  // This is an EARNED zero and is allowed to zero a landed wound — unlike the
  // armour-row zeroes the wound model exists to eliminate, it costs a finite
  // resource. Gate on sp > 0 so a charge is never burnt on a wound that already
  // failed.
  if (hit.kind === "wound" && hit.sp > 0
      && equipmentUpgradeEffectOf(target.equipment, target.equipmentUpgrade)?.ablativeCascade
      && (target.equipState?.ablativeCharges || 0) > 0) {
    target.equipState.ablativeCharges -= 1;
    ctx.spendHeat(1);
    return { ...hit, sp: 0, negated: true };
  }
  return hit;
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
  // Fire Solution Lock (§13, Targeting Computer prototype) — a full 3-solution
  // stack cashes for the same unmissable, armour-piercing volley. The solution
  // is stacked/reset/consumed in game-state's resolveFire; here we just honour
  // the cash-in flag it passes down.
  const solutionPayoff = !!opts.solutionPayoff;
  if (fireControlLock || solutionPayoff) {
    profile = { ...profile, perks: [...new Set([...(profile.perks || []), "Armour Piercing"])] };
  } else if (attacker.lockedTarget != null && round > (attacker.lockExpiresRound || 0)) {
    attacker.lockedTarget = null; // expire a stale lock
  }
  // Piledriver Protocol (§13, Siege Maul) — a shot fired while storing Momentum
  // unloads ALL of it: +1 Penetration per point (computePen) plus a guard-break that
  // ignores the target's Brace (rollWounds) and cover (computeModifiedAim).
  // Compute the spend ONCE here so the Penetration bonus, the guard-break, and the
  // post-shot reset below all read the same number. (The design's 3" shove is
  // deferred to the spatial group and NOT applied here.)
  const piledriverSpend = profile.upgradeEffect?.piledriver ? Math.max(0, attacker.momentum || 0) : 0;
  const guardBreak = piledriverSpend > 0;
  // `opts.target` from the caller is a display name (§ see resolveFire), not
  // the rig — override it with the real target so Bloodletter (§13) can read
  // its live SP.
  // Injected heat mutator for the reactive on-incoming-hit seam. combat.js is
  // pure, so a defender's reactive heat spend (future: Ablative Cascade,
  // Point-Defense) flows through this callback into game-state's bumpHeat rather
  // than importing game-state (which would form a cycle). Wired into both the
  // to-hit and impact seam call sites below via opts.spendHeat.
  const spendHeat = (n) => ctx.bumpHeat(target, n);
  const th = rollToHit(attacker, profile, { ...opts, target, spendHeat, autoHit: fireControlLock || solutionPayoff, guardBreak, targetSmoke: !!target.smokeNextActivation, lockSight: !!attacker.lockSightNext, fireControlFirst: opts.fireControlFirst }, opts.dice?.toHit, random);
  if (fireControlLock) attacker.lockedTarget = null; // painted volley consumed
  const heat = (hasPerk(profile, "Hot") ? 1 : 0) + th.fireModeHeat + (profile.upgradeEffect?.heat || 0);
  if (slot === "longRange") attacker.loaded.longRange = false;
  if (slot === "unit") attacker.loaded.unit = false;

  const rolls = th.dice.map((d, i) => ({
    sides: 6, value: d, label: `hit ${i + 1}`,
    tone: d === 6 ? "crit" : d >= th.modAim ? "ok" : "miss",
  }));
  let impacts = [];
  // Drama (§7 spill / §8 kill tier) — player-facing lines for the resolution's
  // `effects`. `critWounds` collects EVERY wound that tore a location open or
  // killed the rig, so that once the damage loop below has run, each of those
  // dice can be promoted to `crit`. A volley can do both (tear a location open,
  // then kill on a later wound); both dice earn CRIT, one per `effects` line.
  const drama = [];
  const critWounds = [];
  let location = null;
  // Hoisted for the ledger's location step. Stays null on an aimed shot (no d12
  // is rolled — the player chose the part) and on a volley that never landed.
  let locDie = null;
  if (th.hits > 0) {
    locDie = rollD(12, opts.dice?.location, random);
    // The hit-location table belongs to the TARGET's kind — it names the parts
    // being shot at, not the shooter's. Reading the attacker's kind sent a Rig's
    // arms/legs roll into a Tank (tracks/turret) and threw in toughnessOf.
    location = opts.aimed ? opts.aimedLoc : hitLocation(target.kind || "rig", locDie);
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
      impacts = rollWounds(attacker, target, profile, location,
        { arc: opts.arc, hits: th.hits, charged: opts.charged, penOverride: opts.penOverride, penetrate: th.penetratorShot, round: room?.game?.round || 0, momentum: piledriverSpend, guardBreak, distance: opts.distance, spendHeat },
        opts.dice, random);
      // The wound die is the one that decides damage, so it MUST reach the log.
      // Under the impact-total model these were rolled and discarded, leaving a
      // player staring at "2 hits · 4 Penetration → 0 SP" with no way to answer why.
      // Kept as `woundRolls` so the crit promotion below can reach a die by its
      // impact's index instead of re-deriving this label and searching for it.
      const woundRolls = impacts.map((h, i) => {
        const roll = {
          sides: WOUND_DIE, value: h.die, label: `wound ${i + 1}`,
          tone: h.sp > 0 ? "ok" : "miss",
        };
        rolls.push(roll);
        return roll;
      });
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
      // Drama (§7 spill / §8 kill tier) — the roll console already renders
      // `effects`, so this needs no client change. applyDamage returns nothing
      // and mutates in place, so the caller must sample around each call: it
      // spends SP one point at a time and every point spent past 0 fires
      // catastrophicAdditional. By the time it returns, "was it full?" is
      // already overwritten.
      const otherParts = partNamesOf(target.kind || "rig").filter((p) => p !== location);
      const spOutside = () => otherParts.reduce((s, p) => s + (target[p]?.sp ?? 0), 0);
      for (const h of impacts) {
        if (h.sp <= 0) continue;
        const part = target[location];
        const before = part?.sp ?? 0;
        const wasFull = part ? before === part.max : false;
        const wasAlive = !target.destroyed;
        const outsideBefore = spOutside();
        ctx.applyDamage(room, target, location, h.sp, dmgOpts);
        const after = target[location]?.sp ?? 0;
        // What this wound pushed through, as the min of two bounds. NEITHER is
        // the spill on its own, and each is wrong in the opposite direction:
        //   `moved`  — SP that left other parts. Reads HIGH: §8 moves SP for
        //     reasons that are not a spill at all (munition cook-off on a weapon
        //     part first reaching 0; Meltdown Protocol), and cook-off needs no
        //     point spent past 0, so `moved` alone reports a spill on a wound
        //     the location absorbed whole.
        //   `past0` — points spent past 0. Reads HIGH: each fires
        //     catastrophicAdditional once, but clauses that spill nothing
        //     (noSpill/Kneecapper; a structural/power part, which kills) still
        //     consume their point.
        // Each IS a true upper bound on this wound's spill (cook-off only adds
        // to `moved`; a non-spilling clause only adds to `past0`), so the min is
        // an upper bound too — and it can never claim more SP than this wound's
        // Damage, which `moved` alone did. Exact on every case the suite covers.
        const moved = outsideBefore - spOutside();
        const past0 = Math.max(0, h.sp - before);
        const spilled = Math.min(moved, past0);
        if (wasAlive && target.destroyed) {
          // A wreck doesn't also report its parts.
          drama.push(`${weaponName} — ${target.name} gutted in a single blow`);
          critWounds.push(h);
          continue;
        }
        if (wasFull && after === 0) {
          drama.push(`${weaponName} — ${location} torn open in one blow`);
          critWounds.push(h);
        }
        // Independent of the line above, not exclusive with it: one wound can
        // both zero the location and carry through. The already-wrecked case
        // (`before === 0`) is the one that most needs saying — nothing on
        // screen moves except a part the attack never named.
        if (spilled > 0) {
          drama.push(`${weaponName} — through and through (${spilled} SP spilled)`);
        }
      }
      // Every die that tore a location open — or killed the rig outright — earns
      // CRIT. The wound rolls were pushed above, before applyDamage ran, so they
      // could not know then; hence the promotion here.
      // This must stay OUTSIDE the damage loop: the kill branch `continue`s past
      // the loop tail, so promoting inline would never fire on a kill. Promoting
      // the whole list here also means a volley that tears a location open on one
      // wound and kills on a later one lights up BOTH dice — one per `effects`
      // line — instead of last-write-wins keeping only the kill die. The list
      // holds at most two entries (one tear-open + one kill; the kill branch's
      // `continue` keeps a single wound that does both from being counted twice).
      for (const h of critWounds) woundRolls[impacts.indexOf(h)].tone = "crit";
      if (profile.upgradeEffect?.onDamage === "sunder" && impacts.some((h) => h.sp > 0)) {
        ctx.sunderLocation?.(target, location);
      }
      // Breach Grip (§13, Claw) — a damaging Claw hit pries the struck location's
      // armour open, cracking it for +2 impact from anyone until it expires.
      if (profile.upgradeEffect?.breachGrip && impacts.some((h) => h.sp > 0)) {
        ctx.crackLocation?.(room, target, location);
      }
      // Pinning Bolt (§13, Crossbow) — a damaging bolt immobilises the target
      // until this Rig's next activation (reusing the Impale immobilise
      // lifecycle) and runs the attacker +2 heat. Guaranteed, no roll.
      if (profile.upgradeEffect?.pinningBolt && impacts.some((h) => h.sp > 0)) {
        target.immobilised = true;
        ctx.bumpHeat(attacker, 2);
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
  // (computePen/rollWounds already used the captured `piledriverSpend`).
  if (piledriverSpend > 0) attacker.momentum = 0;
  if (heat > 0) ctx.bumpHeat(attacker, heat);

  const total = impacts.reduce((s, h) => s + h.sp, 0);
  const pen = computePen(attacker, profile, { ...opts, target, location, momentum: piledriverSpend });

  // ---- The resolution ledger -------------------------------------------------
  // One step per stage of the chain, in the order they actually resolve.
  //
  // The ledger follows the ENGINE's order — hit, location, wound, damage — not the
  // hit/wound/location sequence 40k-style games use. Toughness here is per-location
  // (a medium hull is T5, its engine T3), so the d12 must land before the wound roll
  // has a T to test against. Rendering wound above location would show a target
  // number derived from a location the player hasn't been told about yet.
  //
  // EVERY number below is threaded out of rollToHit / rollWounds. Nothing here
  // is recomputed: a ledger derived a second time will drift from the engine,
  // and a ledger that lies is worse than no ledger. The reconciliation tests in
  // combat.test.js pin this.
  const steps = [];
  steps.push({
    kind: "hit",
    target: th.modAim,
    terms: th.aimTerms,
    dice: th.hitDice,
    out: `${th.hits} of ${th.hitDice.length} hit`,
  });

  // The location step rides on whether a d12 was ROLLED, not on whether it
  // yielded a part: a Kneecapper remap onto a kind with no limbs picks nothing,
  // and the chain has to say so HERE — before the wound step reports it had no
  // location to wound. A volley that landed nothing never got this far, so it
  // emits no location step at all.
  if (th.hits > 0) {
    // `die` is null on an aimed shot: the player chose the part, so no d12
    // decided it and reporting one would be a fiction.
    steps.push({
      kind: "location",
      die: opts.aimed ? null : locDie,
      out: !location ? "no legal location" : opts.aimed ? `${location} (aimed)` : location,
    });
  }

  // A step that vanishes is the same failure as a hidden die: the player must
  // SEE where the chain stopped, not infer it from an absence. So every path
  // that reaches no wound roll — no hits, no legal location, a raised shield, a
  // rake's blind arc — still emits a wound step that SAYS so.
  const first = impacts[0];
  if (th.hits === 0) {
    steps.push({
      kind: "wound", target: null, pen: null, toughness: null,
      terms: [], dice: [], out: "no hits to wound",
    });
  } else if (!first) {
    // Kneecapper against a kind with no limb parts at all (none exist today):
    // hits landed but there is no legal location to wound.
    steps.push({
      kind: "wound", target: null, pen: null, toughness: null,
      terms: [], dice: [], out: "no legal location to wound",
    });
  } else {
    const wounded = impacts.filter((h) => h.wounded).length;
    const out = first.noRoll === "arc"
      ? "raking fire cannot wound the front arc — no wound roll"
      : first.noRoll === "shield"
        ? "shield negates — no wound roll"
        : `${wounded} of ${impacts.length} wounded`;
    steps.push({
      kind: "wound",
      target: first.target, pen: first.pen, toughness: first.toughness,
      terms: first.terms,
      dice: impacts.map((h) => ({ value: h.die, ok: h.wounded })),
      out,
    });
  }

  if (location) {
    const dmgTerms = [{ label: "wounds", value: impacts.filter((h) => h.sp > 0).length }];
    if (first) {
      dmgTerms.push({ label: "weapon Damage", value: first.dmg });
      // Rend/Evisceration are per-wound riders. PREFER a wound that dealt
      // damage: both are assigned only inside `if (wounded)`, so a wound that
      // failed its roll carries them as 0 — reading impacts[0] blind would
      // silently drop the live riders whenever the first die missed.
      //
      // When NO impact dealt damage, `first` is a deliberate fallback, not the
      // preference above failing. Mostly it changes nothing: a missed wound, and
      // a shield/arc-negated one, carry 0 riders and so push no terms either way.
      // The case with teeth is Ablative Cascade, which zeroes the SP of a wound
      // that DID land while its riders stay set — the step can then report what
      // the shot WOULD have added, for the same reason `d` rides a negated wound
      // rather than render a blank term (see rollWounds).
      //
      // A rider worth 0 pushes nothing (same rule as the wound step's terms).
      const rider = impacts.find((h) => h.sp > 0) || first;
      if (rider.rend) dmgTerms.push({ label: "Rend", value: rider.rend });
      if (rider.evisc) dmgTerms.push({ label: "Evisceration", value: rider.evisc });
    }
    steps.push({ kind: "damage", terms: dmgTerms, out: `${total} SP → ${location}` });
  }

  ctx.pushResolution(room, {
    kind: "attack", actor: attacker.owner, rigId: attacker.id, rolls,
    summary: `${attacker.name} → ${target.name} with ${weaponName} (Pen ${pen}): ${th.hits} hit(s), ${impacts.filter((w) => w.sp > 0).length} wound(s) = ${total} SP${location ? ` to ${location}` : ""}`,
    breakdown: {
      actor: attacker.name, weapon: weaponName, target: target.name,
      steps,
      // `sp`/`location` stay at the top level: they are the headline the roll
      // console renders large, and other code reads them. Everything else that
      // used to live here (`terms`, `pen`, `toughness`, `woundTarget`) moved
      // ONTO the steps — a flat one-equation breakdown could not say which die
      // decided the damage, which is the whole reason this ledger exists.
      //
      // `target` is the target unit's NAME, and must stay that way: types.ts
      // declares it `target?: string` and RollConsole renders it as "→ B". The
      // wound TN is a different number and lives on the wound step, as
      // `steps[i].target`. Do not merge them back into one key.
      sp: total, location,
    },
    effects: drama,
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
  // §5 Brace — a braced Rig is IMMOVABLE: pure knockback/stagger riders are
  // narrated as no-ops. (Tow Chain / Harpoon fling+reel, which carry their own
  // heat/root economy, are intentionally out of scope for v1.)
  const targetImmovable = target.preparation?.type === "brace";
  // G1a — Momentum Swing (Wrecking Ball, Tuned): a charging swing that connects
  // knocks the target back 3". Gated on the same "moved this activation" charge
  // that already granted the +2 Penetration, so it only fires when the charge applied.
  if (profile.upgrade?.id === "momentum-swing" && attacker.movedThisActivation && landedDamage) {
    pushInstruction(targetImmovable
      ? `Momentum Swing — ${target.name} is braced (immovable): no knockback.`
      : `Momentum Swing — knock ${target.name} back 3" (move the mini).`);
  }
  // G1b — Piledriver Protocol (Siege Maul, Prototype): a Momentum-spending smash
  // that connects shoves the target back 3" (piledriverSpend was computed above).
  if (piledriverSpend > 0 && landedDamage) {
    pushInstruction(targetImmovable
      ? `Piledriver — ${target.name} is braced (immovable): no shove.`
      : `Piledriver — shove ${target.name} back 3" (move the mini).`);
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
  // applies the +2 Penetration hit via the normal controls.
  if (profile.upgradeEffect?.enfilade && opts.aimed) {
    attacker.enfiladeShots = (attacker.enfiladeShots || 0) + 1;
    if (attacker.enfiladeShots % 3 === 0) {
      pushInstruction(`Enfilade — ricochet! Resolve a +2 Penetration hit on the next rig in line of sight behind ${target.name} (player's choice).`);
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
    if (target.preparation?.type === "brace") {
      effects.push("Staggering — braced (immovable): no displacement");
    } else {
      const roll = rollD(6, opts.dice?.stagger, random);
      const note = roll <= 2 ? "pivot left" : roll <= 4 ? 'pushed 3"' : "pivot right";
      effects.push(`Staggering ${roll} — ${note} (positional)`);
    }
  }
  if (perks.includes("Cleave") && opts.cleaveTarget) {
    const extra = room.rigs.find((x) => x.name.toLowerCase() === String(opts.cleaveTarget).toLowerCase());
    if (extra && !extra.destroyed) {
      const loc = hitLocation(extra.kind || "rig", rollD(12, opts.dice?.cleaveLocation, random));
      const [hit] = rollWounds(attacker, extra, profile, loc, { arc: "front", hits: 1, charged: opts.charged }, { wounds: [opts.dice?.cleaveImpact] }, random);
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
  // (armour-bypassing) one; the wound roll itself was skipped in rollWounds.
  if (profile.upgradeEffect?.penetrator && opts.penetratorShot) {
    effects.push("Penetrator Rounds — armour bypassed, every hit wounds");
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
