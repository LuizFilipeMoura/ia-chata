// The duel harness's decision function — deliberately its own file.
//
// This is the harness's single largest source of bias, and the existing sweep's
// fatal flaw was a measurement decision (structuredClone per trial) buried where
// nobody thought to question it. Put the bias where it is visible and swappable.
//
// The biases themselves live in KNOWN_BIASES below rather than in this comment,
// so the duel report can print them from here once Task 6 lands. A caveat the
// report re-types is a caveat that drifts from the numbers it qualifies.
//
// This asks the engine what things cost (availableActions) rather than recomputing
// them: one source of truth, and it dogfoods the same view-model the UI renders,
// so a console that lies to a player lies to the harness too. FIVE places it
// cannot ask, each marked below, and each a stalled duel if trusted:
//   - a spent weapon's Fire tile reports `enabled` — Fire opens the reload drawer
//     — though the shot itself is a silent no-op;
//   - Reload has no tile at all: it is drawer-only;
//   - the Shut Down tile is hardcoded `enabled`, but the engine refuses it while a
//     meltdown charge is banked;
//   - a rig whose weapon has been rolled dead by an Arms hit keeps an `enabled`
//     Fire tile, while combat.js refuses the shot as `weapon-destroyed` and
//     performAction's `return !!res` swallows the reason entirely;
//   - a rig with a Rivet Lock on its weapon-role location keeps an `enabled` Fire
//     tile while the engine refuses the shot for the ~2 rounds the rivets hold.
// The lesson generalises: `enabled` means "the console offers this", not "the
// engine will honour it". availableActions is not a legality oracle.
import { availableActions } from "../../shared/battle-view.js";
import { HEAT_CAPACITY } from "../../shared/game-state.js";
import { kindOf, roleOf } from "../../shared/unit-kinds.js";

// To be printed verbatim by the duel report (Task 6), so whoever reads the numbers
// sees the same caveats as whoever reads the code. Exported rather than restated:
// two copies of a caveat are two caveats that disagree by the third edit.
export const KNOWN_BIASES = `
- Never KNOWINGLY exceeds Heat Capacity: it fires only while the cost it can see
  keeps it at or under cap. A real player redlines when the trade is worth it, so
  this UNDER-rates high-heat weapons. It is consistent across weapons, so the
  comparison still holds; judgment is step 2's bot.
- It can still overshoot cap by luck. Weapon heat is partly random (fireModeHeat
  — dice showing 1 under Full Auto / Extended Belt), so a shot budgeted as safe
  can land over. That is the gamble a player actually takes; modelling it as
  certain would be the lie.
- Reloads as soon as the weapon runs dry AND the worst-case d6 reload heat still
  fits under cap; with no headroom it vents first. So it slightly under-rates
  weapons that empty often, where a player might strike in melee or push the roll.
- It pays reload heat at all, which the clone-per-trial sweep never did: a
  sustained duel is charged 1-2 heat per volley. These numbers are more truthful
  but they are NOT a like-for-like baseline against the old report.
- A rig it cannot shoot with, it passes with. Gun rolled dead by an Arms hit, or
  riveted shut by a Rivet Lock, and greedySafe simply vents — it has no melee to
  fall back on, where a player would swing. So a weapon that disarms the control
  rig reads as LESS incoming damage (spTaken drops) rather than as the tempo win
  it actually is: the credit lands on the wrong side of the ledger.
- IT MAKES NO CHOICES. It never moves, never picks its target, never prepares,
  locks, or triggers an active. So every upgrade that needs a decision to pay off
  — Fire Control Lock, Enfilade, Barrage, and the spatial effects — reads 0.00
  here. That 0.00 means UNMEASURED, not worthless. This harness exists because 44
  upgrades read a misleading 0.00; do not let it manufacture a new set.
- The control rig's loadout is a constant, and it shapes every number in the
  report: each result is "against THIS rig at THIS distance and arc", never in
  the abstract. The arc is the sharpest of these: Raking Fire (Mini Gun, Double
  MG) scores a hard zero on the front arc by rule, not by luck, so a duel run
  front-on measures those two weapons dealing nothing at all for 10 rounds.
`.trim();

// Reload is a d6 gamble for heat kinds: 1-3 -> +2 heat, 4-6 -> +1 (game-state.js).
// Budget the worst case — that bound is KNOWN, unlike weapon-side heat.
const RELOAD_MAX_HEAT = 2;

// The engine's three arcs. Physical mode takes the arc as an input, exactly like
// distance — the duel declares where the shooter stands rather than deriving it.
const LEGAL_ARCS = ["front", "side", "rear"];

// Build a policy bound to one declared distance and arc. A factory rather than
// module-level defaults: physical mode takes both as inputs and never derives
// them, so an unexplained default would quietly become the answer for every cell
// the caller forgot to set. Missing is loud; wrong is silent.
export function makeGreedySafe({ distance, arc } = {}) {
  // Number.isFinite alone rejects non-numbers, NaN and Infinity.
  if (!Number.isFinite(distance)) {
    throw new Error(`makeGreedySafe needs a finite { distance }, got ${distance}: physical mode takes distance as an input, never derived.`);
  }
  // Arc is NOT defaulted, and "front" especially is not a safe-looking default.
  // arcBonus (combat.js:401) returns null — a hard structural zero, not a failed
  // roll — for Raking Fire on the front arc, and the only two weapons carrying
  // that perk are Mini Gun and Double MG. A front-arc duel measures them dealing
  // literally nothing across all 10 rounds: it is the whole of F7's "all 504
  // zero-damage cells in the sweep are Raking Fire's front arc". The old sweep
  // survives it by pooling arcs; a single-arc duel cannot. So the caller must
  // choose the arc knowingly and own what it costs those two weapons.
  if (!LEGAL_ARCS.includes(arc)) {
    throw new Error(`makeGreedySafe needs an { arc } of ${LEGAL_ARCS.join("/")}, got ${JSON.stringify(arc)}: the duel declares its arc, and "front" zeroes every Raking Fire weapon (combat.js arcBonus).`);
  }

  return function greedySafe(room, rig, enemy) {
    if (!rig || !enemy) return null;
    // Rigs only. A heat-budgeting policy is meaningless for the heatless cold
    // kinds (Tank / Walker), and their spent flag is `loaded.unit`, not
    // `loaded.longRange` (battle-view.js), so the reload guard below would miss it
    // and emit exactly the dead fires this policy was rewritten to avoid. Refuse
    // rather than half-support: a wrong answer here is a silently wrong sweep.
    const kind = kindOf(rig);
    if (kind !== "rig") throw new Error(`greedySafe drives Rigs only — got kind "${kind}".`);
    if (rig.destroyed || enemy.destroyed) return null;

    // Only the ACTIVE rig can act. Shut Down ends the activation outright
    // (endActivation), leaving activeRigId null — after which the engine silently
    // drops every further command for this rig. Deciding on regardless would hand
    // the driver an endless stream of no-ops to apply.
    //
    // `turn` itself is null through recovery and initiative, so the optional chain
    // is load-bearing: a caller that skips the phase check gets null back, which
    // is this function's contract, rather than a TypeError.
    if (room.game.turn?.activeRigId !== rig.id) return null;

    const acts = availableActions(rig, room.game.turn, room.game.round);
    const fire = acts.find((x) => x.key === "fire");
    // No fallbacks here. The repo pins this convention — toughnessOf throws on a
    // rig with no weight class rather than defaulting — and a silent
    // default-to-medium is the same species as the buried structuredClone this
    // file exists to replace: a measurement decision nobody would think to check.
    // A rig with no engine is likewise broken input, not a rig sitting at 0 heat.
    const heat = rig.engine.heat;
    const cap = HEAT_CAPACITY[rig.weightClass];
    if (cap == null) {
      throw new Error(`No Heat Capacity for weight class "${rig.weightClass}" — the harness must not guess one.`);
    }

    // Shut Down cools min(5, 2 × actionsLeft), down to the engine's heat floor
    // (3, not 0, once the power part is at sp 0). That beats Recovery's 1 while
    // slots remain; at 0 slots left it cools nothing at all and is merely the way
    // to end an activation that has nothing left to spend.
    //
    // Its tile is hardcoded `enabled` in battle-view and only filtered out for
    // cold kinds, which the assert above already excludes — so the tile can never
    // veto this and is not worth consulting. The ENGINE can: it refuses while
    // Meltdown Protocol holds a charge, reachable from here since the random
    // overshoot noted in KNOWN_BIASES is what banks one. Mirror that refusal or
    // the driver re-issues a rejected shutdown forever; null lets it move on.
    const meltdownBanked = (rig.equipState?.meltdownCharge || 0) > 0;
    const vent = () => (meltdownBanked
      ? null
      : { verb: "action", attrs: { name: rig.name, action: "shutdown" } });

    // An Arms hit at 0 SP rolls a weapon dead (game-state.js), after which
    // combat.js refuses the shot as `weapon-destroyed` — but the Fire tile stays
    // `enabled` and performAction's `return !!res` swallows the reason, so the
    // no-op is doubly invisible. Reload cannot revive it (reload re-arms `loaded`
    // and never consults weaponsDestroyed), so this must sit ABOVE the reload
    // branch, or a dead-weapon rig burns heat reloading a gun it can never fire.
    // greedySafe has no melee, so with its gun gone it has nothing left but to pass.
    const longRangeName = rig.weapons?.longRange;
    if (longRangeName != null && rig.weaponsDestroyed?.includes(longRangeName)) {
      return vent();
    }

    // Rivet Lock (§13, Rivet Gun) — a seized WEAPON-role location rivets the gun
    // arm shut and the engine refuses the shot, while the Fire tile stays enabled.
    // Unlike Ion Storm, which clears itself on the refusal, this persists ~2 rounds,
    // so retrying never succeeds. Reload cannot free it either, hence the placement
    // above the reload branch alongside weaponsDestroyed.
    //
    // Mirror the engine's test EXACTLY (game-state.js), and note the two ways a
    // near-miss goes quietly wrong rather than loudly:
    //   - the ROLE filter is load-bearing. Only a weapon-role location jams the
    //     gun (for a rig that is `arms` alone); a rivet on legs or hull leaves it
    //     firing normally. Venting on any seize would pass a rig that could shoot.
    //   - do NOT compare against room.game.round. The value is the expiry round,
    //     but recovery DELETES seizes once past it, so presence already means live.
    //     A `> round` test would read false on the seize's own second round — the
    //     exact window this guard exists for — and hand the no-op straight back.
    const riveted = Object.keys(rig.rivetSeized || {}).some(
      (loc) => (rig.rivetSeized[loc] || 0) > 0 && roleOf(kind, loc) === "weapon",
    );
    if (riveted) return vent();

    // A spent ranged weapon must be reloaded before it can fire again (§7). The
    // engine makes firing it a SILENT no-op while the Fire tile stays `enabled`,
    // so trusting the tile stalls the duel on volley one — rebuilding the exact
    // blindness this harness exists to fix. Reload is drawer-only and absent from
    // availableActions, so it is the one action we cannot price from the
    // view-model: the engine charges heat, not a slot, and allows it at 0 actions.
    if (rig.loaded?.longRange === false) {
      return heat + RELOAD_MAX_HEAT <= cap
        ? { verb: "action", attrs: { name: rig.name, action: "reload" } }
        : vent();
    }

    // Fire while the cost the ENGINE reports keeps us at or under capacity. Read
    // fire.heat rather than ACTIONS.fire.heat: the tile owns the fire-heat rule,
    // which today is the base cost plus the second-shot surcharge (+1 once a shot
    // has gone downrange this activation). Recomputing the base cost here would
    // silently under-price the second volley — the whole reason this file asks
    // instead of computing.
    if (fire?.enabled && heat + fire.heat <= cap) {
      return { verb: "action", attrs: {
        name: rig.name, action: "fire", target: enemy.name,
        weapon: "longRange", arc, distance,
      } };
    }
    return vent();
  };
}
