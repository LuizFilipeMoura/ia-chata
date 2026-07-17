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
(hooks registered below add their line here)
`.trim();

// upgradeId -> { ceiling(room, rig, enemy), conservative(room, rig, enemy) }
export const PILOTING_HOOKS = {};

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
