// Headless bot-vs-bot match runner. Builds a digital room from two squads, plays
// it to a terminal state with the opponent bot driving BOTH sides, and optionally
// records a frame per command so the 3D client can replay the game. Everything
// goes through applyCommand — the sim can't cheat rules the live game enforces.
// Deterministic from `seed`.
import { createRoom, claimSide, applyCommand, chassisById, LOCS, MAX_ROUNDS } from "../game-state.js";
import { chooseAction } from "../bot/index.js";
import { PRESETS, TIERS } from "../bot/score.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// squads: { a: [unit], b: [unit] }, unit = { chassis, longRangeUpgrade?,
// meleeUpgrade?, equipment?, equipmentUpgrade? }. Rig names are the chassis
// codename so replays read naturally.
export function buildMatchRoom(squads, weights, random) {
  const room = createRoom("SIM");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  for (const owner of ["a", "b"]) {
    for (const u of squads[owner]) {
      const ch = chassisById(u.chassis);
      if (!ch) throw new Error(`unknown chassis ${u.chassis}`);
      applyCommand(room, { verb: "add", attrs: {
        name: `${ch.name}`, kind: "rig", owner, chassis: ch.id, class: ch.class,
        longRange: ch.longRange, melee: ch.melee, sp: ch.sp,
        longRangeUpgrade: u.longRangeUpgrade, meleeUpgrade: u.meleeUpgrade,
        equipment: u.equipment ?? null, equipmentUpgrade: u.equipmentUpgrade ?? null,
      } });
    }
  }
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  room.game.sides[0].bot = "balanced";
  room.game.sides[1].bot = "balanced";
  // A side's pilot is either an explicit weight vector (GA genomes) or a tier /
  // preset name ("easy" | "normal" | "hard" | …), which also brings its noise.
  for (const [i, k] of [[0, "a"], [1, "b"]]) {
    const w = weights?.[k];
    const side = room.game.sides[i];
    if (typeof w === "string") { side.bot = w; side.botWeights = PRESETS[w] ?? PRESETS.balanced; side.tier = TIERS[w] ?? null; }
    else side.botWeights = w ?? PRESETS.balanced;
  }
  const opts = { random };
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "a" }, opts);
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "b" }, opts);
  return room;
}

// Compact, render-ready picture of the board.
export function frameOf(room, cmd, fromResolutionId) {
  const g = room.game;
  return {
    cmd: cmd ?? null,
    round: g.round, phase: g.phase,
    turn: g.turn ? { side: g.turn.side, activeRigId: g.turn.activeRigId } : null,
    vp: g.sides.map((s) => s.vp || 0),
    rigs: room.rigs.map((r) => ({
      id: r.id, name: r.name, owner: r.owner || "a", chassis: r.chassis ?? null,
      pos: r.pos ? { x: +r.pos.x.toFixed(2), y: +r.pos.y.toFixed(2) } : null,
      facing: r.facing ?? 0, destroyed: !!r.destroyed,
      heat: r.engine?.heat ?? 0,
      sp: Object.fromEntries(LOCS.map((l) => [l, r[l] ? [r[l].sp, r[l].max] : [0, 0]])),
    })),
    log: (g.resolutions || []).filter((x) => x.id >= fromResolutionId)
      .map((x) => ({ id: x.id, kind: x.kind, actor: x.actor, rigId: x.rigId, targetId: x.targetId, weapon: x.weapon, summary: x.summary, effects: x.effects || [] })),
  };
}

// Play to the end. Returns { winner: "a"|"b"|null, vp, rounds, stats, frames? }.
export function playMatch({ squads, weights, seed = 1, record = false, maxCommands = 1500 }) {
  const random = mulberry32(seed);
  const opts = { random };
  const room = buildMatchRoom(squads, weights, random);
  const frames = [];
  let pendingThought = null;
  let nextRes = room.game.nextResolutionId || 0;
  const step = (cmd, context = {}) => {
    applyCommand(room, cmd, context, opts);
    if (record) {
      const f = frameOf(room, cmd, nextRes);
      if (pendingThought) { f.thought = pendingThought; pendingThought = null; }
      frames.push(f);
      nextRes = room.game.nextResolutionId;
    }
  };
  if (record) frames.push(frameOf(room, null, 0));
  const stats = { a: { dmgDealt: 0, kills: 0 }, b: { dmgDealt: 0, kills: 0 } };
  const spOf = (r) => LOCS.reduce((n, l) => n + (r[l]?.sp || 0), 0);

  let guard = 0;
  while (guard++ < maxCommands && room.game.phase !== "finished" && !room.game.outcome) {
    const g = room.game;
    if (g.pendingAnswer) {
      const side = g.pendingAnswer.side;
      const rig = room.rigs.find((r) => (r.owner || "a") === side && !r.destroyed && r.preparation == null);
      if (!rig) break;
      step({ verb: "answer", attrs: { name: rig.name, prep: "brace", side } });
      continue;
    }
    if (g.pendingBlast) { step({ verb: "blast", attrs: { targets: [] } }); continue; }
    if (g.pendingReaction) break;
    if (g.phase === "initiative") { step({ verb: "initiative", attrs: {} }); continue; }
    if (g.phase !== "activation" || !g.turn) break;
    const t = g.turn;
    const rig = t.activeRigId != null
      ? room.rigs.find((r) => r.id === t.activeRigId)
      : room.rigs.find((r) => (r.owner || "a") === t.side && !r.destroyed && !r.activated);
    if (!rig) break;
    if (t.activeRigId !== rig.id) { step({ verb: "activate", attrs: { name: rig.name } }); continue; }
    const side = g.sides.find((s) => s.id === (rig.owner || "a"));
    const before = new Map(room.rigs.map((r) => [r.id, [spOf(r), r.destroyed]]));
    const explain = record ? {} : null;
    const cmd = chooseAction(room, rig, side.botWeights, { ...(side.tier || {}), random, explain });
    const v = room.version;
    // The reasoning rides on the next frame recorded (the action, or the
    // end-activation when the bot passes).
    if (record) pendingThought = { rig: rig.name, side: rig.owner, ...explain };
    if (cmd) step(cmd);
    if (!cmd || room.version === v) {
      if (room.game.turn?.activeRigId === rig.id) step({ verb: "endactivation", attrs: { name: rig.name } });
      if (room.version === v) break; // nothing moved — bail rather than spin
      continue;
    }
    for (const r of room.rigs) {
      const [sp0, dead0] = before.get(r.id) || [0, false];
      if ((r.owner || "a") === (rig.owner || "a")) continue;
      stats[rig.owner || "a"].dmgDealt += Math.max(0, sp0 - spOf(r));
      if (!dead0 && r.destroyed) stats[rig.owner || "a"].kills++;
    }
  }
  const vp = room.game.sides.map((s) => s.vp || 0);
  const alive = (o) => room.rigs.some((r) => (r.owner || "a") === o && !r.destroyed);
  let winner = room.game.outcome?.winner ?? null;
  if (winner == null) {
    if (!alive("a") && alive("b")) winner = "b";
    else if (!alive("b") && alive("a")) winner = "a";
    else if (vp[0] !== vp[1]) winner = vp[0] > vp[1] ? "a" : "b";
  }
  return {
    winner, vp, rounds: Math.min(room.game.round, MAX_ROUNDS), stats,
    survivors: { a: room.rigs.filter((r) => r.owner === "a" && !r.destroyed).map((r) => r.chassis), b: room.rigs.filter((r) => r.owner === "b" && !r.destroyed).map((r) => r.chassis) },
    frames: record ? frames : undefined,
    field: record ? { width: room.field.width, height: room.field.height, diagonal: room.field.diagonal, terrain: room.field.terrain } : undefined,
    objectives: record ? room.game.objectives : undefined,
    pilots: record ? { a: room.game.sides[0].botWeights, b: room.game.sides[1].botWeights, tiers: { a: room.game.sides[0].bot, b: room.game.sides[1].bot } } : undefined,
  };
}
