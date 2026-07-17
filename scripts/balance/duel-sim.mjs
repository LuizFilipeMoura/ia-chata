// The duel harness. Drives the REAL command path for 10 rounds (MAX_ROUNDS).
//
// It owns exactly two things it cannot borrow: which command to issue (policy.mjs)
// and what to record. The action budget, heat payment, second-shot surcharge,
// Recovery cooling, overheat table and round advance all live in game-state.js.
// A harness that models those itself is a second copy of the rules that drifts
// from the first — and prints a tidy table about a game nobody is playing.
import {
  createRoom, applyCommand, lastRejectionReason, effectiveWeaponProfile, MAX_ROUNDS,
  EQUIPMENT, EQUIPMENT_UPGRADES, equipmentUpgradeNature,
} from "../../shared/game-state.js";
import { makeGreedySafe } from "./policy.mjs";
import { pilotFor } from "./piloting.mjs";

export const DUEL_ROUNDS = MAX_ROUNDS; // the real game length — imported, never re-typed

// Deterministic RNG so a seed reproduces a duel exactly.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const totalSp = (rig) => ["hull", "arms", "legs", "engine"].reduce((s, k) => s + (rig[k]?.sp || 0), 0);

// A1 (the weapon under test) vs B1 (the control). A2/A3/B2/B3 exist ONLY because
// the seed verb force-starts at >=3 rigs per side; they never act, and the third
// rig of whichever side is second absorbs the Answer token so no duellist carries
// a preparation.
export function runDuel({
  chassisA, chassisB, weaponA, upgradeA, equipmentA, equipmentUpgradeA, distance, arc, seed,
  intensity = "conservative", onCommand = null,
}) {
  const random = mulberry32(seed);
  // A factory, not a module-level setter: distance and arc are BOTH required and
  // throw if missing. An unexplained default would silently become the answer for
  // every cell a caller forgot to configure — and for arc that is not theoretical.
  // "front" looks like the harmless default and is the one value that must never
  // be implicit: arcBonus (combat.js:401) returns null for Raking Fire on the
  // front arc — a structural zero by rule, not a failed roll — so Mini Gun and
  // Double MG measure 0 SP across all 10 rounds there. The old sweep hides this by
  // pooling arcs; a single-arc duel cannot. The caller declares where the shooter
  // stands and owns what it costs those two weapons.
  const greedySafe = makeGreedySafe({ distance, arc });
  // The upgrade under test drives which hook (if any) pilots A1. Equipment takes
  // precedence when present — an equipment cell tests the module, not the weapon
  // field tier A1 also carries. A passive/unregistered id yields a no-op hook.
  const pilotedId = equipmentUpgradeA || upgradeA;
  const pilot = pilotFor(pilotedId, intensity);
  const room = createRoom("DUEL");
  const roster = ["A1", "A2", "A3"].map((n) => ({ name: n, owner: "a", chassis: chassisA }))
    .concat(["B1", "B2", "B3"].map((n) => ({ name: n, owner: "b", chassis: chassisB })));

  // A rejected command returns the room UNCHANGED and says nothing unless asked:
  // applyCommand bumps room.version only when something actually happened. Read
  // that delta rather than trusting the call — without it a dropped fire is an
  // infinite retry that eventually reports a tidy, fictional zero, which is the
  // exact failure availableActions' `enabled` flag invites (see policy.mjs).
  const at = () => `round ${room.game.round}, phase ${room.game.phase}`;
  const apply = (verb, attrs, side) => {
    const before = room.version;
    applyCommand(room, { verb, attrs }, side ? { side } : {}, { random });
    const changed = room.version !== before;
    if (changed && onCommand && attrs?.name) onCommand(attrs.name, attrs);
    return changed;
  };
  // The lifecycle verbs. Every one of these is issued only where the engine has
  // already told us it is legal, so a no-op is a broken driver, not a rules call.
  const cmd = (verb, attrs, side) => {
    if (!apply(verb, attrs, side)) {
      throw new Error(
        `duel-sim: "${verb}" was dropped (${lastRejectionReason() || "no reason recorded"}) — `
        + `${at()}, attrs ${JSON.stringify(attrs)}`,
      );
    }
  };

  cmd("seed", { roster, first: "a" });

  // Demand the tier EXPLICITLY. normalizeWeaponUpgrade falls back to the FIELD
  // upgrade for a null or unknown id (weapon-sweep.mjs documents the same trap),
  // so `upgradeA: null` does not mean "no upgrade" — it silently means "field
  // tier", and a whole cell would report one tier's numbers under another's name.
  // There is no un-upgraded rig in the real game, so make the caller name the id.
  if (typeof upgradeA !== "string" || !upgradeA) {
    throw new Error("duel-sim needs an explicit { upgradeA } id: a null upgrade silently resolves to the FIELD tier, not to none.");
  }

  // Swap the weapon under test onto A1. The chassis supplies real SP pools and
  // speed; the weapon is the variable.
  const a1 = room.rigs.find((r) => r.name === "A1");
  a1.weapons.longRange = weaponA;
  a1.weaponUpgrades.longRange = upgradeA;
  a1.loaded.longRange = true;
  // Assert the tier we asked for is the tier we got — a typo would otherwise
  // degrade the cell to a different weapon-tier without a word.
  const prof = effectiveWeaponProfile("longRange", weaponA, a1);
  if (!prof) throw new Error(`duel-sim: no long-range profile for weapon "${weaponA}".`);
  if (prof.upgrade?.id !== upgradeA) {
    throw new Error(`duel-sim: upgrade "${upgradeA}" rejected for "${weaponA}" — profile carries "${prof.upgrade?.id ?? null}".`);
  }

  // Equipment axis: swap a module + tier onto A1 the same way the weapon is
  // swapped. Optional — a weapon cell leaves both undefined.
  if (equipmentA != null || equipmentUpgradeA != null) {
    if (!EQUIPMENT[equipmentA]) {
      throw new Error(`duel-sim: unknown equipment "${equipmentA}".`);
    }
    // Demand an explicit tier, symmetric with upgradeA. Unlike the weapon side,
    // normalizeEquipmentUpgrade returns null for a falsy id (it does NOT fall back
    // to the field tier), so a null would equip the module with no upgrade at all —
    // a silently different loadout. Reject it loudly instead.
    if (typeof equipmentUpgradeA !== "string" || !equipmentUpgradeA) {
      throw new Error("duel-sim needs an explicit { equipmentUpgradeA } id: a null upgrade silently resolves to the FIELD tier, not to none.");
    }
    const nature = equipmentUpgradeNature(equipmentA, equipmentUpgradeA);
    if (!nature) {
      throw new Error(`duel-sim: equipment upgrade "${equipmentUpgradeA}" is not a tier of "${equipmentA}".`);
    }
    a1.equipment = equipmentA;
    a1.equipmentUpgrade = equipmentUpgradeA;
  }

  const b1 = room.rigs.find((r) => r.name === "B1");

  // Both duellists are one policy bound to one distance, and combat.js:673 refuses
  // an out-of-range shot as `{ ok: false, reason: "range" }` — which performAction
  // swallows via `return !!res` with no reason recorded, while the Fire tile stays
  // `enabled` (availableActions is given no distance and cannot know). Caught live:
  // a Siege Maul control at the Sniper Cannon's 20" sweet spot fired into the void
  // all game. Pre-flight it at the door: a control that cannot reach makes spTaken
  // a structural zero, and a zero the caller did not ask for is the kind of tidy
  // wrong number this harness exists to stop printing.
  for (const rig of [a1, b1]) {
    const p = effectiveWeaponProfile("longRange", rig.weapons.longRange, rig);
    if (!p) throw new Error(`duel-sim: ${rig.name} has no long-range profile.`);
    if (distance < p.minRange || distance > p.maxRange) {
      throw new Error(
        `duel-sim: ${rig.name}'s ${rig.weapons.longRange} cannot fire at ${distance}" `
        + `(range ${p.minRange}-${p.maxRange}"). Pick a distance both weapons reach, or a control chassis that does.`,
      );
    }
  }

  const b1StartSp = totalSp(b1);
  const a1StartSp = totalSp(a1);
  let firstShotSp = null;
  let roundsPlayed = 0;
  // A1's gun can be shot off mid-duel, which caps spDealt for a reason that has
  // nothing to do with the weapon under test. Report it rather than letting the
  // reader mistake a blown-off arm for a weak weapon.
  let weaponLost = false;
  let noops = 0; // consecutive policy commands the engine declined to apply

  let guard = 0;
  while (!room.game.outcome && room.game.round <= DUEL_ROUNDS) {
    if (guard++ >= 3000) throw new Error("duel-sim: loop guard tripped — the driver is spinning.");
    const g = room.game;
    // Recorded HERE, inside the loop, rather than read off room.game.round at the
    // end — that would report a round nobody played. We claim no objectives, so VP
    // ends 0-0 unless a Priority Elimination kill breaks it, and advanceRound
    // answers a tie at MAX_ROUNDS by opening Sudden Death: round becomes 11 and the
    // loop exits on its bound. A `break` (a wreck) likewise wants the round it
    // broke on. The loop condition already guarantees g.round <= DUEL_ROUNDS here,
    // so this needs no clamp of its own.
    roundsPlayed = g.round;

    if (g.phase === "initiative") { cmd("initiative", { dice: null }); continue; }

    if (g.phase === "recovery") {
      // Resolves only once BOTH sides have submitted. No claims: objectives are
      // out of scope, and a VP claim would change what we are measuring. Re-check
      // the phase between submissions — the second one advances the round, and a
      // third `vp` into the next phase would be a dropped command.
      for (const s of ["a", "b"]) {
        if (room.game.phase !== "recovery") break;
        cmd("vp", { side: s, claims: [] }, s);
      }
      continue;
    }

    // The second player gets exactly 1 Answer token per round and there is NO
    // decline path — pendingAnswer blocks activate until it is spent. Spending
    // sets a preparation, and Brace is -2 Penetration on the front arc, so it goes on a
    // bystander. Answering with a duellist would silently corrupt every number.
    // (Recovery clears every preparation, so the same bystander is eligible again
    // each round.)
    if (g.pendingAnswer) {
      const bystander = g.pendingAnswer.side === "b" ? "B3" : "A3";
      cmd("answer", { name: bystander, side: g.pendingAnswer.side, prep: "brace" }, g.pendingAnswer.side);
      continue;
    }

    const t = g.turn;
    if (!t) break;

    if (t.activeRigId == null) {
      const next = room.rigs.find((r) => r.owner === t.side && !r.activated && !r.destroyed);
      if (!next) break;
      cmd("activate", { name: next.name }, t.side);
      continue;
    }

    const rig = room.rigs.find((r) => r.id === t.activeRigId);
    // Only the two duellists fight. The four bystanders pass immediately.
    //
    // An Arms hit at 0 SP rolls a weapon dead (game-state.js:1679) and
    // combat.js:668 then refuses the shot as `weapon-destroyed`, which
    // performAction's `return !!res` swallows with no reason recorded. policy.mjs
    // owns that refusal now (b068fca — its fourth documented blind spot): a
    // gunless rig vents instead of firing into the void, so this is no longer
    // load-bearing for keeping the loop alive.
    //
    // It stays because it is the only source of `weaponLost`. A1 with its gun shot
    // off caps spDealt for a reason that has nothing to do with the weapon under
    // test, and Task 5's aggregate has to censor those cells rather than average a
    // blown-off arm in as a weak weapon. Skipping the policy call for a gunless rig
    // is then just honesty about a rig that has nothing left to decide.
    const gunLost = rig.weaponsDestroyed?.includes(rig.weapons?.longRange);
    if (gunLost && rig === a1) weaponLost = true;
    const canFight = (rig.name === "A1" || rig.name === "B1") && !gunLost;
    const foe = rig.name === "A1" ? b1 : a1;
    // A1 consults its upgrade hook first; a null means "nothing to pilot now" and
    // greedySafe takes over. The control (B1) is never piloted — it is the fixed
    // yardstick. Piloting both would measure the matchup, not the upgrade.
    let next = null;
    if (canFight) {
      if (rig.name === "A1") next = pilot(room, rig, foe, { intensity, distance, arc });
      if (!next) next = greedySafe(room, rig, foe);
    }
    if (next) {
      // Calibration hook: A1's first attack against a FRESH B1 is the only point
      // where this harness and weapon-sweep.mjs measure the same quantity. The
      // sweep records INTENDED damage and never truncates; the real applyDamage
      // walks SP down against actual pools. On a fresh target they agree; on a
      // damaged one they diverge by construction. Measure the delta ACROSS THIS
      // COMMAND, and only while B1 is untouched — B1 can self-damage first
      // (overheat, burning), which would otherwise be booked as A1's output.
      const isFirstShot = firstShotSp == null && rig.name === "A1"
        && next.attrs.action === "fire" && totalSp(b1) === b1StartSp;
      // A policy command is NOT held to the lifecycle verbs' standard, because a
      // refusal here can be the rules talking. Ion Storm (§13, Arc Gun) refuses
      // the shot after a discharge and CONSUMES the lock doing it — the engine
      // changed nothing the version counter can see, yet the retry succeeds. So
      // re-ask the policy instead of throwing, and count consecutive no-ops: a
      // refusal that clears itself moves on, a genuine spin trips the guard with
      // the engine's own reason attached.
      if (apply(next.verb, next.attrs, rig.owner)) {
        noops = 0;
        if (isFirstShot) firstShotSp = b1StartSp - totalSp(b1);
      } else if (++noops >= 3) {
        throw new Error(
          `duel-sim: "${next.attrs.action}" no-opped ${noops}x in a row `
          + `(${lastRejectionReason() || "no reason recorded"}) — ${at()}, `
          + `attrs ${JSON.stringify(next.attrs)}`,
        );
      }
    } else { cmd("endactivation", { name: rig.name }, rig.owner); noops = 0; }

    // Nothing left to measure once the control is scrap: B1 cannot shoot back and
    // A1 has no other target, so every further round is dead loop. Stop here so
    // `rounds` reports when the wreck happened rather than always 10.
    if (b1.destroyed) break;
  }

  return {
    spDealt: b1StartSp - totalSp(b1),   // A1's output — the primary signal
    spTaken: a1StartSp - totalSp(a1),   // B1's output — free, and the only way denial shows
    wrecked: !!b1.destroyed,
    weaponLost,                         // A1's gun was shot off — spDealt is capped, not measured
    rounds: roundsPlayed,
    firstShotSp,
  };
}

// ---- CLI ----------------------------------------------------------------
// Axes are deliberately smaller than weapon-sweep.mjs. The full grid at duel
// length would be ~485M attacks (~3 hours); arc and distance are already
// answered by that sweep (F1 revived arc; F6 says range works as designed) and
// neither interacts with cadence. What is left is what only 10 rounds can show.
import { pathToFileURL } from "node:url";
import { WEAPONS, WEAPON_UPGRADES } from "../../shared/game-state.js";

const TRIALS = Number(process.env.TRIALS || 500);
const CHASSIS_A = "medium-lance-mortar";
const CHASSIS_B = "medium-lance-mortar"; // the CONTROL — a documented constant
// Side, not front: arcBonus returns null for Raking Fire on the front arc, so a
// front sweep measures Mini Gun and Double MG as a structural zero (F7).
const ARC = "side";

// Each cell's mean is only worth reading if enough trials survived censoring.
// Below this the row is reported with its numbers intact but flagged, because a
// mean over 3 duels is a rumour, not a measurement.
const MIN_SAMPLE = Math.max(1, Math.floor(TRIALS * 0.5));

async function main() {
  if (!Number.isFinite(TRIALS) || TRIALS < 1) {
    throw new Error(`TRIALS must be a positive number, got ${JSON.stringify(process.env.TRIALS)}.`);
  }
  const rows = [];
  for (const weapon of Object.keys(WEAPONS.longRange)) {
    const prof = WEAPONS.longRange[weapon];
    // No `?? 12` fallback. A silent default distance is exactly the buried
    // measurement decision this harness exists to stop: the cell would still
    // print a tidy number, just for a range nobody chose. Today every long-range
    // weapon carries a sweet spot, so this throw is unreachable — it is here for
    // the day someone adds one that does not.
    if (!Number.isFinite(prof.sweet)) {
      throw new Error(`duel-sim sweep: "${weapon}" has no numeric sweet spot (got ${prof.sweet}) — the sweep must not guess a distance for it.`);
    }
    const distance = prof.sweet; // sweet spot only
    // A weapon with no upgrade list would contribute zero rows and the sweep
    // would under-report it in silence — the reader counts 30 rows and never
    // learns which weapon went missing. Throw instead.
    const upgrades = WEAPON_UPGRADES[weapon];
    if (!upgrades?.length) {
      throw new Error(`duel-sim sweep: no WEAPON_UPGRADES for "${weapon}" — it would vanish from the sweep without a word.`);
    }
    for (const u of upgrades) {
      let spDealt = 0, spTaken = 0, wrecks = 0, rounds = 0, lost = 0, n = 0;
      for (let s = 1; s <= TRIALS; s++) {
        // Each runDuel builds its own mulberry32 from the seed, so cells are
        // independent and no cross-cell re-seeding is needed. Seeds repeat across
        // cells BY DESIGN: the same 500 dice streams meet every weapon-tier, which
        // pairs the comparison instead of leaving it to luck.
        const r = runDuel({ chassisA: CHASSIS_A, chassisB: CHASSIS_B, weaponA: weapon,
          upgradeA: u.id, distance, arc: ARC, seed: s });
        // weaponLost cells are CENSORED, not measured: spDealt was capped by an
        // arm coming off, not by the weapon. Counted, and excluded from the mean.
        if (r.weaponLost) { lost++; continue; }
        spDealt += r.spDealt; spTaken += r.spTaken; rounds += r.rounds;
        if (r.wrecked) wrecks++;
        n++;
      }
      rows.push({ weapon, tier: u.nature, upgrade: u.id, distance, arc: ARC,
        spDealt: n ? spDealt / n : null, spTaken: n ? spTaken / n : null,
        wreckRate: n ? wrecks / n : null, rounds: n ? rounds / n : null,
        // `n` is the surviving sample, `censored` the trials an arm-loss ate.
        // `underSampled` saves the reader from doing that division themselves and
        // mistaking a mean over a handful of duels for a real one.
        n, censored: lost, underSampled: n < MIN_SAMPLE });
      process.stderr.write(`${weapon} ${u.nature}\n`);
    }
  }
  const under = rows.filter((r) => r.underSampled);
  if (under.length) {
    process.stderr.write(`\nWARNING: ${under.length}/${rows.length} cell(s) kept fewer than ${MIN_SAMPLE}/${TRIALS} trials after censoring:\n`);
    for (const r of under) process.stderr.write(`  ${r.weapon} ${r.tier}: n=${r.n}, censored=${r.censored}\n`);
  }
  process.stdout.write(JSON.stringify({ trials: TRIALS, rounds: DUEL_ROUNDS,
    chassisA: CHASSIS_A, chassisB: CHASSIS_B, arc: ARC, minSample: MIN_SAMPLE, rows }, null, 0));
}

// Run ONLY when invoked directly. Comparing resolved URLs rather than matching
// the filename: `duel-sim.test.mjs` imports this module, and an endsWith check is
// one sibling filename away from making `npm test` run the whole sweep.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
