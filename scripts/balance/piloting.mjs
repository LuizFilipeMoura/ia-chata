// scripts/balance/piloting.mjs
//
// Per-upgrade piloting hooks layered over greedySafe (policy.mjs). A hook returns
// the ACTIVATING command for its upgrade when the mechanic is ripe, else null —
// null means "nothing to pilot this instant", and the driver falls through to
// greedySafe. Only DECISION-DEPENDENT upgrades get a hook; passives measure fine
// through plain firing and are deliberately absent.
//
// Each hook has two intensities:
//   ceiling      — fire whenever the mechanic is legal (best-case piloting).
//   conservative — fire only under a documented "a competent player bothers here"
//                  predicate (the realistic floor).
// The report prints both; the spread is the skill-reward of the risky pick.
//
// A hook is a PURE reader: it inspects room/rig/enemy and returns a command. It
// must never mutate engine state — the engine owns that when the command applies.
import { HEAT_CAPACITY, equipmentUpgradeEffectOf } from "../../shared/game-state.js";
import { availableActions } from "../../shared/battle-view.js";

// One line per registered hook. The report prints this verbatim next to
// policy.mjs's KNOWN_BIASES so the assumptions travel with the numbers. KEEP EACH
// LINE TRUE TO ITS PREDICATE — a lying bias line is the exact trap the last
// rework shipped eleven times.
export const PILOTING_BIASES = `
- enfilade: piloted as Aimed shots at the sweet-spot distance. Ceiling and
  conservative coincide because the duel is pinned to the sweet spot; a marksman
  aims every shot here. Off-band cells would diverge.
- reactor-overdrive: piloted via the overclock active, once per activation, gated
  on availableActions. Ceiling overclocks whenever legal; conservative overclocks
  only with heat headroom for its cost, so the doubled-overheat catch does not
  immediately bite. Benefit lands in A1's spDealt.
- fire-control-lock: piloted by locking the target whenever not already painted
  (gated on availableActions), then falling through to greedySafe's Fire, which
  cashes in the paint as an auto-hit Armour-Piercing volley. Ceiling and
  conservative coincide — the mechanic's only cost is the turn spent painting,
  which both intensities pay identically.
- emplacement: piloted by rooting into the fortress stance whenever legal
  (gated on availableActions), then falling through to greedySafe's Fire once
  already rooted. Ceiling roots the instant it's legal; conservative holds off
  the one activation where rooting would spend the last action and skip that
  round's shot entirely.
`.trim();

// Build an Aimed command at the duel's fixed geometry. Location defaults to the
// enemy's engine — the kill location a marksman aims for; the choice changes only
// WHERE the shot lands, not whether the Aimed-cadence mechanic fires. Returns null
// when the long-range weapon is spent: game-state.js (resolveFire) makes firing a
// spent weapon a SILENT no-op until it is reloaded, so piloting through that state
// would retry a doomed shot instead of falling through to greedySafe, which already
// knows how to reload.
function aimedAt(rig, enemy, distance, arc, location = "engine") {
  if (rig.loaded?.longRange === false) return null;
  return { verb: "action", attrs: {
    name: rig.name, action: "aimed", weapon: "longRange",
    loc: location, target: enemy.name, arc, distance,
  } };
}

const OVERCLOCK_HEAT = 3; // EQUIPMENT["overclock-core"].active.heat — confirmed in shared/game-state.js

// Issue the overclock active once per activation, gated on legality so it never
// no-ops (a repeated no-op trips the duel driver's 3x guard). `careful` adds the
// conservative heat-headroom check. Per the hook contract, decline (null) when
// the room has no live turn to judge legality from.
function overclockCmd(room, rig, careful) {
  if (rig.reactorOverdriveActive) return null;   // already overclocked this activation
  const turn = room?.game?.turn;
  if (!turn) return null;
  const enabled = new Set(
    availableActions(rig, turn, room.game.round).filter((a) => a.enabled).map((a) => a.key),
  );
  if (!enabled.has("overclock")) return null;    // not legal now — let greedySafe act
  if (careful) {
    const cap = HEAT_CAPACITY[rig.weightClass];
    if (cap == null || rig.engine.heat + OVERCLOCK_HEAT > cap) return null;
  }
  return { verb: "action", attrs: { name: rig.name, action: "overclock" } };
}

// Issue the Fire Control Lock `lock` active when A1 isn't already painted onto
// THIS enemy. Gated on legality (availableActions' "lock" key) and the
// turn-less contract. Once locked, subsequent calls this activation (or next
// round, if the lock survives that long) see `rig.lockedTarget === enemy.id`
// and decline — falling through to greedySafe's Fire, whose resolveFire reads
// the live lock and cashes it in as an auto-hit Armour-Piercing volley
// (combat.js:701), then clears it. Ceiling and conservative coincide: the
// catch here IS the mechanic itself (one action spent painting instead of
// shooting), not a separate risk a careful pilot could dodge.
function lockCmd(room, rig, enemy) {
  if (rig.lockedTarget === enemy.id) return null; // already painted this target
  const turn = room?.game?.turn;
  if (!turn) return null;
  const enabled = new Set(
    availableActions(rig, turn, room.game.round).filter((a) => a.enabled).map((a) => a.key),
  );
  if (!enabled.has("lock")) return null;
  return { verb: "action", attrs: { name: rig.name, action: "lock", target: enemy.name } };
}

// Root into the Emplacement fortress stance once (never double-plants; the
// engine itself rejects that), gated on legality (availableActions' "emplace"
// key — covers both the cooldown and the budget) and the turn-less contract.
// Once emplaced, further calls this activation short-circuit on rig.emplaced
// and fall through to greedySafe's Fire. `careful` adds a headroom check: don't
// spend the LAST action rooting when that would forfeit this activation's shot
// entirely (a competent pilot fires first if the budget can't cover both).
function emplaceCmd(room, rig, careful) {
  if (rig.emplaced) return null; // already rooted — nothing to plant
  const turn = room?.game?.turn;
  if (!turn) return null;
  const enabled = new Set(
    availableActions(rig, turn, room.game.round).filter((a) => a.enabled).map((a) => a.key),
  );
  if (!enabled.has("emplace")) return null; // on cooldown, or no budget
  if (careful && (turn.actionsMax - turn.actionsUsed) < 2) return null; // would forfeit the shot
  return { verb: "action", attrs: { name: rig.name, action: "emplace" } };
}

// upgradeId -> { ceiling(room, rig, enemy, { intensity, distance, arc }),
//                conservative(room, rig, enemy, { intensity, distance, arc }) }
export const PILOTING_HOOKS = {
  // Sniper Cannon prototype. Keys off Aimed-shot cadence, which greedySafe never
  // triggers (its confirmed structural 0.00). The duel is pinned to the sweet
  // spot, so both intensities aim every shot here; they diverge only for a future
  // off-band cell, which will need its own band check added to `conservative`.
  enfilade: {
    ceiling: (room, rig, enemy, { distance, arc }) => aimedAt(rig, enemy, distance, arc),
    conservative: (room, rig, enemy, { distance, arc }) => aimedAt(rig, enemy, distance, arc),
  },
  // Power prototype (Overclock Core). overclock gains +2 Penetration but DOUBLES
  // the overheat bonus — the catch. greedySafe never overclocks. Once per
  // activation, legality-gated. Ceiling: overclock whenever legal. Conservative:
  // only with heat headroom for its cost so the doubled-overheat catch does not
  // immediately bite.
  "reactor-overdrive": {
    ceiling: (room, rig) => overclockCmd(room, rig, false),
    conservative: (room, rig) => overclockCmd(room, rig, true),
  },
  // Missile Barrage prototype (Fire Control Lock). Paint the target, then let
  // the next volley auto-hit with Armour Piercing. greedySafe never locks
  // (IT MAKES NO CHOICES — policy.mjs), so this reads a structural 0.00 there.
  // No conservative/ceiling split: the "catch" (a turn spent painting instead
  // of shooting) is inherent to the mechanic, not a separate risk to weigh.
  "fire-control-lock": {
    ceiling: (room, rig, enemy) => lockCmd(room, rig, enemy),
    conservative: (room, rig, enemy) => lockCmd(room, rig, enemy),
  },
  // Bulwark Shield prototype (Emplacement). Root into the permanent fortress
  // shield, trading Move + 1 action budget for a persistent Raise Shield.
  // greedySafe never moves and never emplaces, so this reads a structural 0.00
  // there. Ceiling roots as soon as it's legal; conservative holds off on the
  // one activation where rooting would use the LAST action and forfeit that
  // round's shot entirely.
  emplacement: {
    ceiling: (room, rig) => emplaceCmd(room, rig, false),
    conservative: (room, rig) => emplaceCmd(room, rig, true),
  },
};

const NOOP = () => null;

// Returns a single hook function bound to the chosen intensity, or a no-op for an
// unregistered / passive upgrade. The driver calls this once per (upgrade,
// intensity) and asks it every turn.
export function pilotFor(upgradeId, intensity = "conservative") {
  const h = PILOTING_HOOKS[upgradeId];
  if (!h) return NOOP;
  const fn = h[intensity];
  if (typeof fn !== "function") {
    throw new Error(`pilotFor: hook "${upgradeId}" has no "${intensity}" intensity.`);
  }
  return fn;
}
