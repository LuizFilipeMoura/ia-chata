// The opponent bot's public entry point. chooseAction generates every legal
// candidate, scores each, and returns the single best command — or null to end
// the activation. The bot never mutates state itself: it hands one command at a
// time to applyCommand, so it goes through the same validation, rejection, and
// resolution a human does and can neither cheat nor desync.
import { candidatesFor } from "./candidates.js";
import { scoreCandidate, scoreParts, PRESETS, TIERS } from "./score.js";
import { applyCommand as applyRaw } from "../game-state.js";

// Every bot command funnels through here so a caller can observe the bot's turn
// step by step (options.onStep) — the 3D client animates those frames instead of
// watching a whole enemy turn teleport in at once.
function applyCommand(room, cmd, context, options = {}) {
  const v = room.version;
  applyRaw(room, cmd, context, options);
  if (room.version !== v) options.onStep?.(room, cmd);
}

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
  } else if (cand.action === "lock") {
    attrs.target = cand.target;
  } else if (cand.action === "repair" || cand.action === "emergencypatch") {
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
// `noise` ({ blunder, topK, random }) is the difficulty dial: with probability
// `blunder` the pick is uniform over the top-K positive candidates instead of
// the argmax. Drawn from the injected RNG, so seeded games stay reproducible.
export function chooseAction(room, rig, weights, noise = null) {
  // Only the unit holding the floor may act (a Shut Down ends the activation).
  if (room.game.turn?.activeRigId !== rig.id) return null;
  const scored = candidatesFor(room, rig)
    .map((c) => ({ c, s: scoreCandidate(room, rig, c, weights) }))
    .sort((x, y) => y.s - x.s || cmpStable(x.c, y.c));
  let best = scored[0];
  if (noise?.blunder > 0) {
    const rnd = noise.random || Math.random;
    if (rnd() < noise.blunder) {
      const top = scored.slice(0, noise.topK || 3).filter((x) => x.s > 0);
      if (top.length) best = top[Math.floor(rnd() * top.length)];
    }
  }
  if (noise?.explain) {
    // Replay "thinking": the top options with their weighted terms.
    // One row per distinct option (move probes at several ranges share a label).
    const seen = new Set();
    const distinct = scored.filter((x) => { const k = candLabel(x.c); if (seen.has(k)) return false; seen.add(k); return true; });
    noise.explain.top = distinct.slice(0, 4).map((x) => {
      const parts = scoreParts(room, rig, x.c);
      return { label: candLabel(x.c), score: +x.s.toFixed(2), picked: candLabel(x.c) === candLabel(best.c),
        parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, +((weights[k] ?? (k === "tactics" ? 1 : 0)) * v).toFixed(2)])) };
    });
    if (best && !noise.explain.top.some((t) => t.picked)) noise.explain.top.push({ label: candLabel(best.c), score: +best.s.toFixed(2), picked: true, parts: {}, blunder: true });
    noise.explain.passed = !best || best.s <= 0;
  }
  if (!best || best.s <= 0) return null;
  return toCommand(best.c, rig);
}

function candLabel(c) {
  if (c.action === "move" || c.action === "sprint") return `${c.action} → ${c.reason ? c.reason + " " : ""}(${c.dest.x.toFixed(0)},${c.dest.y.toFixed(0)})`;
  if (c.action === "fire" || c.action === "aimed") return `${c.action} ${c.weapon === "melee" ? "melee" : "gun"} → ${c.target}${c.location ? " " + c.location : ""}`;
  if (c.action === "prepare") return `prepare ${c.prep}`;
  if (c.action === "repair" || c.action === "emergencypatch") return `${c.action} ${c.location}`;
  if (c.action === "lock") return `lock ${c.target}`;
  return c.action;
}

// Drive one rig's whole activation: activate it, then feed commands to
// applyCommand until chooseAction passes, then end the activation. The guard is a
// safety net — chooseAction reads live state, so a scoring bug that kept returning
// an accepted-but-pointless command would otherwise spin; 12 is more actions than
// any rig can take. `options.random` threads the seeded RNG through every roll, so
// a whole game is reproducible.
export function runBotActivation(room, rig, options = {}) {
  // An evolved weight vector (setbot with `weights`, or the GA) beats a named preset.
  const side = room.game.sides.find((s) => s.id === (rig.owner || "a"));
  const preset = sideBotOf(room, rig.owner);
  const weights = side?.botWeights ?? PRESETS[preset] ?? PRESETS.balanced;
  const tier = TIERS[preset];
  const noise = tier ? { ...tier, random: options.random } : null;
  if (room.game.turn?.activeRigId !== rig.id) {
    applyCommand(room, { verb: "activate", attrs: { name: rig.name } }, {}, options);
  }
  const log = [];
  // Active only while this rig genuinely holds the floor. A pendingReaction (a
  // target's Evasive/Return we just tripped) or pendingBlast (a §9 cook-off we
  // just caused) parks the activation until it is resolved — stop cleanly so the
  // driver (driveBots) can clear it, then resume this same rig on the next pass.
  const active = () => room.game.turn?.activeRigId === rig.id
    && room.game.phase === "activation"
    && !room.game.pendingReaction && !room.game.pendingBlast;
  for (let guard = 0; guard < 12; guard++) {
    // A command can end the activation out from under us — a kill that annihilates
    // the enemy side ends the game and nulls the turn, a destroyed engine parks a
    // pendingBlast. Stop the moment this rig is no longer the one acting.
    if (!active()) break;
    const cmd = chooseAction(room, rig, weights, noise);
    if (!cmd) break;
    applyCommand(room, cmd, {}, options);
    log.push(cmd);
  }
  // Only end the activation if it is still ours to end.
  if (active()) applyCommand(room, { verb: "endactivation", attrs: { name: rig.name } }, {}, options);
  return log;
}

// Advance the game as far as the BOTS can carry it, then stop at the next point
// that needs a human (or a terminal state). Called after every applied command
// (server-side) so a bot side plays itself out without a human clicking through
// its turn. Digital rooms only. It only ever touches gates and turns that belong
// to a bot side: a human's turn, a human-owned reaction, or a human-owned blast
// all return control immediately. `options.random` threads the RNG (omit for live
// play → real randomness).
export function driveBots(room, options = {}) {
  if (room.mode !== "digital") return;
  const isBot = (side) => side != null && sideBotOf(room, side) != null;
  for (let guard = 0; guard < 2000; guard++) {
    const g = room.game;
    if (g.phase === "finished" || g.outcome) return;
    // Mandatory Answer-token gate — only clear it for a bot side (minimal brace).
    if (g.pendingAnswer) {
      if (!isBot(g.pendingAnswer.side)) return;   // a human still owes their answer
      const side = g.pendingAnswer.side;
      const rig = room.rigs.find((r) => (r.owner || "a") === side && !r.destroyed && r.preparation == null);
      if (!rig) return;
      applyCommand(room, { verb: "answer", attrs: { name: rig.name, prep: "brace", side } }, {}, options);
      continue;
    }
    // §9 munition cook-off — clear it (empty targets, no secondary blast) only
    // when a bot caused it; a human declares their own blast.
    if (g.pendingBlast) {
      const src = room.rigs.find((r) => r.id === g.pendingBlast.sourceId);
      if (!src || !isBot(src.owner)) return;
      applyCommand(room, { verb: "blast", attrs: { targets: [] } }, {}, options);
      continue;
    }
    // A pending reaction is always a defender's decision; bots never arm the
    // pre-resolution preps that create one, so this is a human's to resolve.
    if (g.pendingReaction) return;
    // Initiative is a mutual dice roll with no decision — roll it whenever a bot
    // is in the game so a bot side never stalls waiting on the human to click it.
    if (g.phase === "initiative") {
      if (!room.game.sides.some((s) => s.bot)) return;
      applyCommand(room, { verb: "initiative", attrs: {} }, {}, options);
      continue;
    }
    if (g.phase === "activation") {
      const t = g.turn;
      if (!t || !isBot(t.side)) return;           // a human's turn — hand control back
      const rig = room.rigs.find((r) => (r.owner || "a") === t.side && !r.destroyed && !r.activated);
      if (!rig) return;
      runBotActivation(room, rig, options);
      continue;
    }
    return;
  }
}
