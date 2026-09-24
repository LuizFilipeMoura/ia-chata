// Simulated play: a real bot-vs-bot room driven through the SAME path live games
// use — `setbot` flags both sides, rigs are commissioned with `add`, `ready`
// starts (and deploys) the digital battle, then the server's own `driveBots`
// plays every activation, gate and round to the end. The GA evaluates genomes
// only through this, so balance numbers come from the engine the players use.
// Every command can be recorded as a render frame (+ the bot's reasoning) for
// replays. Deterministic from `seed`.
import { createRoom, claimSide, applyCommand, chassisById, lastRejectionReason, LOCS, MAX_ROUNDS, BOT_PRESETS } from "../game-state.js";
import { driveBots } from "../bot/index.js";
import { PRESETS } from "../bot/score.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A side's pilot: a tier / preset name ("easy" | "normal" | "hard" | …) or an
// explicit weight vector (a GA genome), which flies as "balanced" + weights.
function pilotAttrs(pilot) {
  if (typeof pilot === "string" && BOT_PRESETS.includes(pilot)) return { preset: pilot };
  return { preset: "balanced", weights: pilot && typeof pilot === "object" ? pilot : PRESETS.balanced };
}

// Build and start a simulated room. squads: { a: [unit], b: [unit] } where unit
// = { chassis, longRangeUpgrade?, meleeUpgrade?, equipment?, equipmentUpgrade? };
// weights: { a: pilot, b: pilot }; table: { width, height } (default rulebook).
export function createSimRoom({ code = "SIM", squads, weights, table, random = Math.random }) {
  const room = createRoom(code);
  const opts = { random };
  const cmd = (verb, attrs, side = "a") => {
    const v = room.version;
    applyCommand(room, { verb, attrs }, { side }, opts);
    return room.version !== v;
  };
  claimSide(room, { name: "Cyan", side: "a" });
  claimSide(room, { name: "Red", side: "b" });
  for (const s of ["a", "b"]) cmd("setbot", { side: s, ...pilotAttrs(weights?.[s]) }, s);
  if (table && (table.width !== room.field.width || table.height !== room.field.height)) {
    cmd("field", { action: "set", width: table.width, height: table.height });
  }
  for (const owner of ["a", "b"]) {
    for (const u of squads[owner]) {
      const ch = chassisById(u.chassis);
      if (!ch) throw new Error(`unknown chassis ${u.chassis}`);
      const ok = cmd("add", {
        name: ch.name, kind: "rig", owner, chassis: ch.id, class: ch.class,
        longRange: ch.longRange, melee: ch.melee, sp: ch.sp,
        longRangeUpgrade: u.longRangeUpgrade, meleeUpgrade: u.meleeUpgrade,
        equipment: u.equipment ?? null, equipmentUpgrade: u.equipmentUpgrade ?? null,
      }, owner);
      if (!ok) throw new Error(`could not commission ${ch.id}: ${lastRejectionReason()}`);
    }
  }
  cmd("field", { action: "lock" });
  if (!cmd("ready", {}) || !room.game.started) throw new Error(`simulated room did not start: ${lastRejectionReason()}`);
  room.simulated = true;
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

// Play a simulated room to the end. Returns { winner, vp, rounds, stats,
// survivors } plus, with `record`, { frames, field, objectives, pilots } — and
// `room` (the finished room) when `keepRoom` is set.
export function playMatch({ squads, weights, seed = 1, record = false, table, code, keepRoom = false }) {
  const random = mulberry32(seed);
  const room = createSimRoom({ code, squads, weights, table, random });
  const frames = [];
  const stats = { a: { dmgDealt: 0, kills: 0 }, b: { dmgDealt: 0, kills: 0 } };
  const spOf = (r) => LOCS.reduce((n, l) => n + (r[l]?.sp || 0), 0);
  let snapshot = new Map(room.rigs.map((r) => [r.id, [spOf(r), !!r.destroyed]]));
  let nextRes = room.game.nextResolutionId || 0;
  let pendingThought = null;
  if (record) frames.push(frameOf(room, null, 0));

  const onStep = (r, cmd) => {
    // Damage/kill tallies credited to whoever issued the command; a rig hurting
    // itself (overheat) credits nobody.
    const named = cmd?.attrs?.name && r.rigs.find((x) => x.name === cmd.attrs.name);
    const actor = named ? (named.owner || "a") : r.game.turn?.side;
    for (const rig of r.rigs) {
      const [sp0, dead0] = snapshot.get(rig.id) || [spOf(rig), false];
      if (!actor || (rig.owner || "a") === actor) continue;
      stats[actor].dmgDealt += Math.max(0, sp0 - spOf(rig));
      if (!dead0 && rig.destroyed) stats[actor].kills++;
    }
    snapshot = new Map(r.rigs.map((x) => [x.id, [spOf(x), !!x.destroyed]]));
    if (record) {
      const f = frameOf(r, cmd, nextRes);
      if (pendingThought) { f.thought = pendingThought; pendingThought = null; }
      frames.push(f);
      nextRes = r.game.nextResolutionId;
    }
  };
  const onThought = record ? (rig, explain) => { pendingThought = { rig: rig.name, side: rig.owner, ...explain }; } : undefined;

  // driveBots stops at anything a human would owe; with bots on both sides that
  // is only the end of the game (or a stall, which the guard catches).
  for (let pass = 0; pass < 50 && room.game.phase !== "finished" && !room.game.outcome; pass++) {
    const v = room.version;
    driveBots(room, { random, onStep, onThought });
    if (room.version === v) break;
  }

  const vp = room.game.sides.map((s) => s.vp || 0);
  const alive = (o) => room.rigs.some((r) => (r.owner || "a") === o && !r.destroyed);
  let winner = room.game.outcome?.winner ?? null;
  if (winner == null && !room.game.outcome) {
    if (!alive("a") && alive("b")) winner = "b";
    else if (!alive("b") && alive("a")) winner = "a";
    else if (vp[0] !== vp[1]) winner = vp[0] > vp[1] ? "a" : "b";
  }
  const out = {
    winner, vp, rounds: Math.min(room.game.round, MAX_ROUNDS), stats,
    reason: room.game.outcome?.reason ?? null,
    finished: !!room.game.outcome,
    survivors: { a: room.rigs.filter((r) => r.owner === "a" && !r.destroyed).map((r) => r.chassis), b: room.rigs.filter((r) => r.owner === "b" && !r.destroyed).map((r) => r.chassis) },
  };
  if (record) {
    out.frames = frames;
    out.field = { width: room.field.width, height: room.field.height, diagonal: room.field.diagonal, terrain: room.field.terrain };
    out.objectives = room.game.objectives;
    out.pilots = { a: room.game.sides[0].botWeights ?? PRESETS[room.game.sides[0].bot], b: room.game.sides[1].botWeights ?? PRESETS[room.game.sides[1].bot], tiers: { a: room.game.sides[0].bot, b: room.game.sides[1].bot } };
  }
  if (keepRoom) out.room = room;
  return out;
}
