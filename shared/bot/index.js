// The opponent bot's public entry point. chooseAction generates every legal
// candidate, scores each, and returns the single best command, or null to end
// the activation. The bot never mutates state itself: it hands one command at a
// time to applyCommand, so it goes through the same validation, rejection, and
// resolution a human does and can neither cheat nor desync.
import { candidatesFor } from "./candidates.js";
import { scoreCandidate, scoreParts, actionFamily, PRESETS, TIERS, exposureOf } from "./score.js";
import { applyCommand as applyRaw, deriveAttackGeometry, effectiveWeaponProfile, findRig, heatMeter, LOCS } from "../game-state.js";
import { availableActions } from "../battle-view.js";
import { expectedDamage } from "./evaluate.js";

// Every bot command funnels through here so a caller can observe the bot's turn
// step by step (options.onStep), the 3D client animates those frames instead of
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
  } else if (cand.action === "repair" || cand.action === "emergencypatch" || cand.action === "nanite") {
    attrs.loc = cand.location;
  } else if (cand.action === "cryo" || cand.action === "meltdown") {
    attrs.n = cand.n;
    if (cand.mode) attrs.mode = cand.mode;
  } else if (cand.action === "jumpjets" && cand.mode === "reel") {
    attrs.mode = "reel";
    attrs.target = cand.target;
  }
  return { verb: "action", attrs };
}

// A total order over candidates for tie-breaking. Array sort is not stable across
// engines for large inputs, so two candidates with equal scores must resolve the
// same way every run, otherwise a bot-vs-bot game stops being reproducible from
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
  let cands = candidatesFor(room, rig);
  // Easy's hard rule: never boil over. Only moves that end under Heat Capacity
  // (worst case); once over it (an enemy scalded it), Shut Down is all it has.
  if (weights.noOverheat) cands = cands.filter((c) => staysCool(room, rig, c));
  const scored = cands
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
    // Aimed shots at each location of one target score alike, show them once.
    const key = (c) => (c.action === "aimed" ? `aimed ${c.target}` : candLabel(c));
    const distinct = scored.filter((x) => { const k = key(x.c); if (seen.has(k)) return false; seen.add(k); return true; });
    noise.explain.top = distinct.slice(0, 4).map((x) => {
      const parts = scoreParts(room, rig, x.c);
      return { label: candLabel(x.c), score: +x.s.toFixed(2), picked: key(x.c) === key(best.c),
        parts: { ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, +((weights[k] ?? (k === "tactics" ? 1 : 0)) * v).toFixed(2)])), bias: +(weights[`b_${actionFamily(x.c.action)}`] || 0).toFixed(2) } };
    });
    if (best && !noise.explain.top.some((t) => t.picked)) noise.explain.top.push({ label: candLabel(best.c), score: +best.s.toFixed(2), picked: true, parts: {}, blunder: true });
    noise.explain.passed = !best || best.s <= 0;
  }
  if (!best || best.s <= 0) return null;
  const cmd = toCommand(best.c, rig);
  if (wantsGrit(room, rig, best.c)) cmd.attrs.grit = true;
  return cmd;
}

// True when `cand` leaves `rig` at or under Heat Capacity whatever the dice do.
// Listed heat settles the plain cases (moves, preps); anything that might add
// more (reload's D6, Hot weapons, upgrade heat) is trial-run on a copy of the
// room with the dice pinned low and high, and must stay cool both ways.
function staysCool(room, rig, cand) {
  if (cand.action === "shutdown") return true;
  const m = heatMeter(rig);
  if (m.over > 0) return false;
  const turn = room.game.turn;
  const listed = availableActions(rig, turn, room.game.round).find((a) => a.key === cand.action)?.heat || 0;
  if (cand.action === "move" || cand.action === "sprint") return m.heat + listed <= m.cap;
  const cmd = toCommand(cand, rig);
  for (const pin of [0, 0.999]) {
    const sim = JSON.parse(JSON.stringify(room));
    applyRaw(sim, cmd, {}, { random: () => pin });
    const me = findRig(sim, rig.name);
    if (me && heatMeter(me).over > 0) return false;
  }
  return true;
}

// A Gritted attack (§5) is worth a token when it adds at least this much
// expected SP. ⚙ TUNING
export const GRIT_SHOT_MIN_GAIN = 1;

// Spend a Grit token on this shot? Only when the reroll adds expected damage:
// at least GRIT_SHOT_MIN_GAIN of it, or any at all once the side holds a token
// for every rig still to act this round (Grit expires at Recovery, so a token
// saved past the last shot is a token wasted).
function wantsGrit(room, rig, cand) {
  if (cand.action !== "fire" && cand.action !== "aimed") return false;
  const sideId = rig.owner || "a";
  const tokens = room.game.gritTokens?.[sideId] || 0;
  if (tokens <= 0) return false;
  const target = findRig(room, cand.target);
  if (!target) return false;
  const shot = {
    arc: cand.arc, distance: cand.distance, cover: cand.cover, round: room.game.round,
    ...(cand.action === "aimed" ? { aimed: true, location: cand.location } : {}),
  };
  const gain = expectedDamage(rig, target, cand.weapon, { ...shot, grit: true }) - expectedDamage(rig, target, cand.weapon, shot);
  if (gain <= 1e-9) return false;
  const toAct = room.rigs.filter((r) => (r.owner || "a") === sideId && !r.destroyed && (!r.activated || r.id === rig.id)).length;
  return tokens >= toAct || gain >= GRIT_SHOT_MIN_GAIN;
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
// safety net, chooseAction reads live state, so a scoring bug that kept returning
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
  // "dummy": a Training Grounds practice target. Stands still, ends at once.
  if (preset === "dummy") {
    if (room.game.turn?.activeRigId === rig.id) applyCommand(room, { verb: "endactivation", attrs: { name: rig.name } }, {}, options);
    return log;
  }
  // Active only while this rig genuinely holds the floor. A pendingReaction (a
  // target's Evasive/Return we just tripped) or pendingBlast (a §9 cook-off we
  // just caused) parks the activation until it is resolved, stop cleanly so the
  // driver (driveBots) can clear it, then resume this same rig on the next pass.
  const active = () => room.game.turn?.activeRigId === rig.id
    && room.game.phase === "activation"
    && !room.game.pendingReaction && !room.game.pendingBlast;
  for (let guard = 0; guard < 12; guard++) {
    // A command can end the activation out from under us, a kill that annihilates
    // the enemy side ends the game and nulls the turn, a destroyed engine parks a
    // pendingBlast. Stop the moment this rig is no longer the one acting.
    if (!active()) break;
    // options.onThought: a recorder (simulated rooms) wants the reasoning.
    const explain = options.onThought ? {} : null;
    const cmd = chooseAction(room, rig, weights, explain ? { ...(noise || {}), random: options.random, explain } : noise);
    if (explain) options.onThought(rig, explain);
    if (!cmd) break;
    applyCommand(room, cmd, {}, options);
    log.push(cmd);
  }
  // Only end the activation if it is still ours to end.
  if (active()) applyCommand(room, { verb: "endactivation", attrs: { name: rig.name } }, {}, options);
  return log;
}

// A bot defender's answer to its own tripped reaction. Evasive / Sidestep send
// no `evaded` flag, so the digital engine rolls the D6 dodge. Return Fire,
// Riposte and Exploit take whichever legal counter scores the most expected
// damage (geometry measured off the field, as resolveFire would), or decline.
function botReaction(room, pr) {
  const attrs = { side: pr.defender };
  if (pr.kind === "evasive" || pr.kind === "sidestep") return attrs;
  const reactor = room.rigs.find((r) => r.id === pr.targetId);
  const attacker = room.rigs.find((r) => r.id === pr.attackerId);
  if (!reactor?.pos || !attacker?.pos || reactor.destroyed || attacker.destroyed) return { ...attrs, decline: true };
  const geo = deriveAttackGeometry(room, reactor, attacker);
  const shot = { arc: geo.arc, distance: geo.distance, cover: geo.cover, round: room.game.round };
  const lr = effectiveWeaponProfile("longRange", reactor.weapons?.longRange, reactor);
  const gunBears = pr.kind !== "riposte" && geo.los && lr && reactor.loaded?.longRange !== false
    && geo.distance >= (lr.minRange ?? 0) && geo.distance <= (lr.maxRange ?? Infinity);
  const opts = [];
  if (pr.kind === "exploit") {
    if (gunBears) for (const loc of LOCS) {
      opts.push({ weapon: "longRange", loc, v: expectedDamage(reactor, attacker, "longRange", { ...shot, aimed: true, waiveAimPenalty: true, location: loc }) });
    }
  } else {
    if (gunBears) opts.push({ weapon: "longRange", v: expectedDamage(reactor, attacker, "longRange", shot) });
    if (geo.inMeleeReach) opts.push({ weapon: "melee", v: expectedDamage(reactor, attacker, "melee", shot) });
  }
  const best = opts.sort((x, y) => y.v - x.v)[0];
  if (!best || best.v <= 0) return { ...attrs, decline: true };
  return { ...attrs, attack: {
    weapon: best.weapon, arc: geo.arc, distance: geo.distance, cover: geo.cover,
    range: "near", ...(best.loc ? { loc: best.loc } : {}),
  } };
}

// A bot side's next token spend at the Answer gate. An Answer token goes on the
// first unprepared rig as a Brace (minimal and safe). Grit is mostly kept for
// Gritted attacks: with 2+ tokens and no Improved prep yet, ONE goes on defence
// (an Improved Brace on an unprepared rig, else an upgrade to the preparation on
// the rig the enemy can hurt most from where it stands); the rest are kept.
function botAnswer(room, gate) {
  const side = gate.side;
  const mine = room.rigs.filter((r) => (r.owner || "a") === side && !r.destroyed);
  const free = mine.find((r) => r.preparation == null);
  if ((gate.remaining || 0) > 0 && free) {
    return { verb: "answer", attrs: { name: free.name, prep: "brace", side } };
  }
  if ((gate.grit || 0) > 0) {
    const defended = mine.some((r) => r.preparation?.improved);
    if (gate.grit < 2 || defended) return { verb: "answer", attrs: { side, keep: true } };
    if (free) return { verb: "answer", attrs: { name: free.name, prep: "brace", side, grit: true } };
    const upgradable = mine.filter((r) => r.preparation && !r.preparation.improved);
    if (!upgradable.length) return { verb: "answer", attrs: { side, keep: true } };
    const best = upgradable
      .map((r) => ({ r, e: exposureOf(room, r) }))
      .reduce((x, y) => (y.e > x.e ? y : x));
    return { verb: "answer", attrs: { name: best.r.name, side, grit: true, upgrade: true } };
  }
  return null;
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
    // Mandatory Answer-token gate (Answer and Grit tokens), only clear it for a
    // bot side. Bail if the spend didn't land, so a bad pick can't spin.
    if (g.pendingAnswer) {
      if (!isBot(g.pendingAnswer.side)) return;   // a human still owes their answer
      const cmd = botAnswer(room, g.pendingAnswer);
      if (!cmd) return;
      const v = room.version;
      applyCommand(room, cmd, {}, options);
      if (room.version === v) return;
      continue;
    }
    // §9 munition cook-off caused by a bot's wreck: send no target list, the
    // digital engine measures the 4" ring itself. A human declares their own.
    if (g.pendingBlast) {
      const src = room.rigs.find((r) => r.id === g.pendingBlast.sourceId);
      if (!src || !isBot(src.owner)) return;
      applyCommand(room, { verb: "blast", attrs: {} }, {}, options);
      continue;
    }
    // A pending reaction is the defender's decision: a human's is theirs to
    // make; a bot defender resolves its own (dodges roll on the server,
    // counters take the best shot that bears, or decline).
    if (g.pendingReaction) {
      if (!isBot(g.pendingReaction.defender)) return;
      applyCommand(room, { verb: "react", attrs: botReaction(room, g.pendingReaction) }, {}, options);
      continue;
    }
    // Initiative is a mutual dice roll with no decision, roll it whenever a bot
    // is in the game so a bot side never stalls waiting on the human to click it.
    if (g.phase === "initiative") {
      if (!room.game.sides.some((s) => s.bot)) return;
      applyCommand(room, { verb: "initiative", attrs: {} }, {}, options);
      continue;
    }
    if (g.phase === "activation") {
      const t = g.turn;
      if (!t || !isBot(t.side)) return;           // a human's turn, hand control back
      // Resume the rig already holding the floor (a reaction or blast parked it
      // mid-activation) before picking a fresh one.
      const held = t.activeRigId != null ? room.rigs.find((r) => r.id === t.activeRigId && !r.destroyed) : null;
      const rig = held || room.rigs.find((r) => (r.owner || "a") === t.side && !r.destroyed && !r.activated);
      if (!rig) return;
      runBotActivation(room, rig, options);
      continue;
    }
    return;
  }
}
