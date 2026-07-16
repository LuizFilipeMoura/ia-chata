// The opponent bot's public entry point. chooseAction generates every legal
// candidate, scores each, and returns the single best command — or null to end
// the activation. The bot never mutates state itself: it hands one command at a
// time to applyCommand, so it goes through the same validation, rejection, and
// resolution a human does and can neither cheat nor desync.
import { candidatesFor } from "./candidates.js";
import { scoreCandidate, PRESETS } from "./score.js";
import { applyCommand } from "../game-state.js";

// The per-side difficulty/personality dial: which weight vector a bot side plays.
// Read off the side; unset (a human side, or an unnamed preset) falls back to
// balanced at the call sites below.
export function sideBotOf(room, owner) {
  return room.game.sides.find((s) => s.id === (owner || "a"))?.bot ?? null;
}

// A candidate object → the `action` verb command applyCommand expects. The engine
// re-derives shot geometry itself in digital rooms (resolveFire), so a Fire needs
// only its weapon and target; a Move carries the dest/facing E1 validates. NOTE
// the attr names the engine actually reads: aimed and repair use `loc`, prepare
// uses `prep`.
function toCommand(cand, rig) {
  const attrs = { name: rig.name, action: cand.action };
  if (cand.action === "fire" || cand.action === "aimed") {
    attrs.weapon = cand.weapon;
    attrs.target = cand.target;
    if (cand.action === "aimed") attrs.loc = cand.location;
  } else if (cand.action === "move" || cand.action === "sprint") {
    attrs.dest = cand.dest;
    attrs.facing = cand.facing;
  } else if (cand.action === "prepare") {
    attrs.prep = cand.prep;
  } else if (cand.action === "repair") {
    attrs.loc = cand.location;
  }
  return { verb: "action", attrs };
}

// A total order over candidates for tie-breaking. Array sort is not stable across
// engines for large inputs, so two candidates with equal scores must resolve the
// same way every run — otherwise a bot-vs-bot game stops being reproducible from
// its seed. Order by the fields a candidate actually carries.
function cmpStable(a, b) {
  return (a.action || "").localeCompare(b.action || "")
    || (a.target || "").localeCompare(b.target || "")
    || (a.location || "").localeCompare(b.location || "")
    || (a.prep || "").localeCompare(b.prep || "")
    || (a.weapon || "").localeCompare(b.weapon || "")
    || ((a.dest?.x ?? 0) - (b.dest?.x ?? 0))
    || ((a.dest?.y ?? 0) - (b.dest?.y ?? 0))
    || ((a.facing ?? 0) - (b.facing ?? 0));
}

// The one decision. Generate → score → argmax → command, or null. Passing is a
// legitimate move: a rig whose only options would overheat it or walk it into a
// kill zone (every candidate ≤ 0) stands still. A bot that must act is a bot that
// hurts itself.
export function chooseAction(room, rig, weights) {
  const scored = candidatesFor(room, rig)
    .map((c) => ({ c, s: scoreCandidate(room, rig, c, weights) }))
    .sort((x, y) => y.s - x.s || cmpStable(x.c, y.c));
  const best = scored[0];
  if (!best || best.s <= 0) return null;
  return toCommand(best.c, rig);
}

// Drive one rig's whole activation: activate it, then feed commands to
// applyCommand until chooseAction passes, then end the activation. The guard is a
// safety net — chooseAction reads live state, so a scoring bug that kept returning
// an accepted-but-pointless command would otherwise spin; 12 is more actions than
// any rig can take. `options.random` threads the seeded RNG through every roll, so
// a whole game is reproducible.
export function runBotActivation(room, rig, options = {}) {
  const weights = PRESETS[sideBotOf(room, rig.owner)] ?? PRESETS.balanced;
  if (room.game.turn?.activeRigId !== rig.id) {
    applyCommand(room, { verb: "activate", attrs: { name: rig.name } }, {}, options);
  }
  const log = [];
  const active = () => room.game.turn?.activeRigId === rig.id && room.game.phase === "activation";
  for (let guard = 0; guard < 12; guard++) {
    // A command can end the activation out from under us — a kill that annihilates
    // the enemy side ends the game and nulls the turn, a destroyed engine parks a
    // pendingBlast. Stop the moment this rig is no longer the one acting.
    if (!active()) break;
    const cmd = chooseAction(room, rig, weights);
    if (!cmd) break;
    applyCommand(room, cmd, {}, options);
    log.push(cmd);
  }
  // Only end the activation if it is still ours to end.
  if (active()) applyCommand(room, { verb: "endactivation", attrs: { name: rig.name } }, {}, options);
  return log;
}
