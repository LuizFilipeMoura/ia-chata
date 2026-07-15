// The duel harness's decision function — deliberately its own file.
//
// This is the harness's single largest source of bias, and the existing sweep's
// fatal flaw was a measurement decision (structuredClone per trial) buried where
// nobody thought to question it. Put the bias where it is visible and swappable.
//
// KNOWN BIAS: greedySafe never exceeds Heat Capacity. A real player does, when
// the trade is worth it — so this systematically UNDER-rates high-heat weapons.
// Acceptable because it is consistent across weapons. Judgment is step 2's bot.
//
// KNOWN BIAS: it reloads the instant the weapon runs dry, budgeting the reload's
// WORST-CASE heat. A player low on heat headroom might strike in melee or push
// the roll instead, so this slightly under-rates weapons that empty often.
//
// It asks the engine what things cost (availableActions) rather than recomputing
// them: one source of truth, and it dogfoods the same view-model the UI renders,
// so a console that lies to a player lies to the harness too. The two places it
// CANNOT ask are marked below, each because the view-model genuinely has no
// answer: a spent weapon's Fire tile reports `enabled` (it opens the reload
// drawer) though the shot is a no-op, and Reload has no tile at all.
import { availableActions } from "../../shared/battle-view.js";
import { HEAT_CAPACITY } from "../../shared/game-state.js";

// Declared distance — physical mode, so arc/distance are inputs, never derived.
let duelDistance = 16;
export function setDuelDistance(d) { duelDistance = d; }

// Reload is a d6 gamble for heat kinds: 1-3 -> +2 heat, 4-6 -> +1 (game-state.js).
// We budget the worst case because that bound is KNOWN, unlike weapon-side heat.
const RELOAD_MAX_HEAT = 2;

export function greedySafe(room, rig, enemy) {
  if (!rig || !enemy || enemy.destroyed || rig.destroyed) return null;
  // Only the ACTIVE rig can act. Shut Down ends the activation outright
  // (endActivation), leaving activeRigId null — after which the engine silently
  // drops every further command for this rig. Deciding on regardless would hand
  // the driver an endless stream of no-ops to apply.
  if (room.game.turn.activeRigId !== rig.id) return null;
  const acts = availableActions(rig, room.game.turn, room.game.round);
  const fire = acts.find((x) => x.key === "fire");
  const cap = HEAT_CAPACITY[rig.weightClass] ?? 5;
  const heat = rig.engine?.heat ?? 0;

  // Can't act safely — vent. Shut Down cools min(5, 2 * actionsLeft), far more
  // than Recovery's 1, so it is the correct play rather than merely passing.
  // The tile is hardcoded `enabled` in battle-view, but the engine refuses while
  // Meltdown Protocol holds a charge — a state this policy can reach on its own,
  // since overshooting capacity is what banks one. Mirror that refusal or the
  // driver re-issues a rejected shutdown forever. Nothing safe left: return null
  // and let the driver end the activation.
  const shutdown = acts.find((x) => x.key === "shutdown");
  const meltdownBanked = (rig.equipState?.meltdownCharge || 0) > 0;
  const vent = () => (shutdown?.enabled && !meltdownBanked
    ? { verb: "action", attrs: { name: rig.name, action: "shutdown" } }
    : null);

  // A spent ranged weapon must be reloaded before it can fire again (§7). The
  // engine makes firing it a SILENT no-op, while battle-view deliberately keeps
  // the Fire tile `enabled` — Fire is what opens the reload drawer. So `enabled`
  // here means "opens a drawer", NOT "the shot resolves". Trusting it stalls the
  // duel on volley one and rebuilds the exact blindness this harness exists to
  // fix. Reload is drawer-only and absent from availableActions, so it is the one
  // action we cannot price from the view-model; the engine charges heat, not an
  // action slot, and allows it at 0 actions left.
  if (rig.loaded?.longRange === false) {
    return heat + RELOAD_MAX_HEAT <= cap
      ? { verb: "action", attrs: { name: rig.name, action: "reload" } }
      : vent();
  }

  // Fire while the KNOWN cost keeps us at or under capacity. Weapon heat is
  // partly random (fireModeHeat — dice showing 1 under Full Auto/Extended Belt),
  // so this budgets against known cost and will sometimes overshoot. That is the
  // gamble a player actually takes; modelling it as certain would be the lie.
  if (fire?.enabled && heat + fire.heat <= cap) {
    return { verb: "action", attrs: {
      name: rig.name, action: "fire", target: enemy.name,
      weapon: "longRange", arc: "front", distance: duelDistance,
    } };
  }
  return vent();
}
