// The duel harness's decision function — deliberately its own file.
//
// This is the harness's single largest source of bias, and the existing sweep's
// fatal flaw was a measurement decision (structuredClone per trial) buried where
// nobody thought to question it. Put the bias where it is visible and swappable.
//
// The biases themselves live in KNOWN_BIASES below rather than in this comment,
// because the duel report prints them from there. A caveat the report re-types is
// a caveat that drifts from the numbers it qualifies.
//
// This asks the engine what things cost (availableActions) rather than recomputing
// them: one source of truth, and it dogfoods the same view-model the UI renders,
// so a console that lies to a player lies to the harness too. THREE places it
// cannot ask, each marked below, and each a stalled duel if trusted:
//   - a spent weapon's Fire tile reports `enabled` — Fire opens the reload drawer
//     — though the shot itself is a silent no-op;
//   - Reload has no tile at all: it is drawer-only;
//   - the Shut Down tile is hardcoded `enabled`, but the engine refuses it while a
//     meltdown charge is banked.
// The lesson generalises: `enabled` means "the console offers this", not "the
// engine will honour it". availableActions is not a legality oracle.
import { availableActions } from "../../shared/battle-view.js";
import { HEAT_CAPACITY } from "../../shared/game-state.js";
import { kindOf } from "../../shared/unit-kinds.js";

// Printed verbatim by the duel report, so whoever reads the numbers sees the same
// caveats as whoever reads the code. Exported rather than restated: two copies of
// a caveat are two caveats that disagree by the third edit.
export const KNOWN_BIASES = `
- Never KNOWINGLY exceeds Heat Capacity: it fires only while the cost it can see
  keeps it at or under cap. A real player redlines when the trade is worth it, so
  this UNDER-rates high-heat weapons. It is consistent across weapons, so the
  comparison still holds; judgment is step 2's bot.
- It can still overshoot cap by luck. Weapon heat is partly random (fireModeHeat
  — dice showing 1 under Full Auto / Extended Belt), so a shot budgeted as safe
  can land over. That is the gamble a player actually takes; modelling it as
  certain would be the lie.
- Reloads the instant the weapon runs dry, budgeting the reload's WORST-CASE d6
  heat. A player with no headroom might strike in melee or push the roll instead,
  so this slightly under-rates weapons that empty often.
- It pays reload heat at all, which the clone-per-trial sweep never did: a
  sustained duel is charged 1-2 heat per volley. These numbers are more truthful
  but they are NOT a like-for-like baseline against the old report.
`.trim();

// Reload is a d6 gamble for heat kinds: 1-3 -> +2 heat, 4-6 -> +1 (game-state.js).
// Budget the worst case — that bound is KNOWN, unlike weapon-side heat.
const RELOAD_MAX_HEAT = 2;

// Build a policy bound to one declared distance. A factory rather than a module
// -level default: physical mode takes distance as an input and never derives it,
// so an unexplained default would quietly become the answer for every cell the
// caller forgot to set. Missing is loud; wrong is silent.
export function makeGreedySafe({ distance } = {}) {
  if (typeof distance !== "number" || !Number.isFinite(distance)) {
    throw new Error("makeGreedySafe needs a finite { distance }: physical mode takes distance as an input, never derived.");
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
    const heat = rig.engine?.heat ?? 0;
    // No `?? 5` fallback. The repo pins this convention — toughnessOf throws on a
    // rig with no weight class rather than defaulting — and a silent
    // default-to-medium is the same species as the buried structuredClone this
    // file exists to replace: a measurement decision nobody would think to check.
    const cap = HEAT_CAPACITY[rig.weightClass];
    if (cap == null) {
      throw new Error(`No Heat Capacity for weight class "${rig.weightClass}" — the harness must not guess one.`);
    }

    const shutdown = acts.find((x) => x.key === "shutdown");
    // Shut Down cools min(5, 2 × actionsLeft), down to the engine's heat floor
    // (3, not 0, once the power part is at sp 0). That beats Recovery's 1 while
    // slots remain; at 0 slots left it cools nothing at all and is merely the way
    // to end an activation that has nothing left to spend.
    //
    // The tile is hardcoded `enabled` in battle-view, but the engine refuses while
    // Meltdown Protocol holds a charge — reachable from here, since the random
    // overshoot noted in KNOWN_BIASES is what banks one. Mirror that refusal or
    // the driver re-issues a rejected shutdown forever; null lets it move on.
    const meltdownBanked = (rig.equipState?.meltdownCharge || 0) > 0;
    const vent = () => (shutdown?.enabled && !meltdownBanked
      ? { verb: "action", attrs: { name: rig.name, action: "shutdown" } }
      : null);

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
    // fire.heat rather than ACTIONS.fire.heat: the tile already carries the second
    // -shot surcharge (+1 after a shot this activation) and any per-rig equipment
    // modifier. Recomputing the base cost here would silently under-price the
    // second volley — the whole reason this file asks instead of computing.
    if (fire?.enabled && heat + fire.heat <= cap) {
      return { verb: "action", attrs: {
        name: rig.name, action: "fire", target: enemy.name,
        weapon: "longRange", arc: "front", distance,
      } };
    }
    return vent();
  };
}
