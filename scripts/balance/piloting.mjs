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

// One line per registered hook. The report prints this verbatim next to
// policy.mjs's KNOWN_BIASES so the assumptions travel with the numbers. KEEP EACH
// LINE TRUE TO ITS PREDICATE — a lying bias line is the exact trap the last
// rework shipped eleven times.
export const PILOTING_BIASES = `
- enfilade: piloted as Aimed shots at the sweet-spot distance. Ceiling and
  conservative coincide because the duel is pinned to the sweet spot; a marksman
  aims every shot here. Off-band cells would diverge.
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
