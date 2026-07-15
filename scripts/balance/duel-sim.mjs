// The duel harness. Drives the REAL command path for 10 rounds (MAX_ROUNDS).
//
// It owns exactly two things it cannot borrow: which command to issue (policy.mjs)
// and what to record. The action budget, heat payment, second-shot surcharge,
// Recovery cooling, overheat table and round advance all live in game-state.js.
// A harness that models those itself is a second copy of the rules that drifts
// from the first — and prints a tidy table about a game nobody is playing.
import {
  createRoom, applyCommand, lastRejectionReason, effectiveWeaponProfile, MAX_ROUNDS,
} from "../../shared/game-state.js";
import { makeGreedySafe } from "./policy.mjs";

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
export function runDuel({ chassisA, chassisB, weaponA, upgradeA, distance, seed }) {
  const random = mulberry32(seed);
  // A factory, not a module-level setter: distance is required and throws if
  // missing. An unexplained default would silently become the answer for every
  // cell a caller forgot to configure.
  const greedySafe = makeGreedySafe({ distance });
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
    return room.version !== before;
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
    // Clamped, and NOT read off room.game.round at the end. We claim no objectives,
    // so VP ends 0-0 unless a Priority Elimination kill breaks it — and advanceRound
    // answers a tie at MAX_ROUNDS by opening Sudden Death: round becomes 11 and the
    // loop exits on the round bound. Reporting that 11 would invent a round nobody
    // played. A `break` (a wreck) likewise wants the round it broke on.
    roundsPlayed = Math.min(g.round, DUEL_ROUNDS);

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
    // sets a preparation, and Brace is -2 STR on the front arc, so it goes on a
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
    // A FOURTH availableActions blind spot, beyond the three policy.mjs lists: an
    // Arms hit at 0 SP rolls a weapon dead (game-state.js:1679) and combat.js:668
    // then refuses the shot as `weapon-destroyed` — while the Fire tile stays
    // `enabled` (battle-view shows the loss only as a badge) and performAction's
    // `return !!res` swallows it with no reason recorded. The policy fires into
    // that void forever; observed live at round 7 of a real duel. Guard here
    // because the fix is the driver's: a gunless rig has nothing this
    // long-range-only policy can do, so it passes like a bystander.
    const gunLost = rig.weaponsDestroyed?.includes(rig.weapons?.longRange);
    if (gunLost && rig === a1) weaponLost = true;
    const canFight = (rig.name === "A1" || rig.name === "B1") && !gunLost;
    const foe = rig.name === "A1" ? b1 : a1;
    const next = canFight ? greedySafe(room, rig, foe) : null;
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
