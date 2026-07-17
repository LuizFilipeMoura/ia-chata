import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, claimSide, applyCommand, MAX_ROUNDS, LOCS } from "../game-state.js";
import { runBotActivation } from "./index.js";

// The instrument the whole design rests on: two deterministic bots play a full
// digital game head-to-head with no UI. If they terminate, reproduce from a seed,
// and score, the scorer is doing its job. This file is also where the tuning
// sweep lives (run manually, not committed).

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mirroredRoom(botA, botB) {
  const room = createRoom("BVB");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 2; i++) {
      applyCommand(room, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, longRange: "Autocannon", melee: "Claw" } });
    }
  }
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  room.game.sides[0].bot = botA;
  room.game.sides[1].bot = botB;
  return room;
}

// Drive a whole game by command. Besides activations, the loop must clear the two
// mandatory gates a headless driver owns (E3's finding): the per-round Answer
// token (brace the first eligible rig — the bot plans no reaction) and a §9
// munition cook-off's pendingBlast (cleared with empty targets — the bot skips
// secondary blast, whose targeting is Task-10b geometry, out of scope for v1).
function playGame(seed, botA, botB) {
  const opts = { random: mulberry32(seed) };
  const room = mirroredRoom(botA, botB);
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "a" }, opts);
  applyCommand(room, { verb: "ready", attrs: {} }, { side: "b" }, opts);
  let guard = 0;
  while (guard++ < 600 && room.game.phase !== "finished" && !room.game.outcome) {
    const g = room.game;
    if (g.pendingAnswer) {
      const side = g.pendingAnswer.side;
      const rig = room.rigs.find((r) => (r.owner || "a") === side && !r.destroyed && r.preparation == null);
      if (!rig) break;
      applyCommand(room, { verb: "answer", attrs: { name: rig.name, prep: "brace", side } }, {}, opts);
      continue;
    }
    if (g.pendingBlast) { applyCommand(room, { verb: "blast", attrs: { targets: [] } }, {}, opts); continue; }
    if (g.pendingReaction) break;   // bots never arm an Evasive/Return prep, so this should not arise
    if (g.phase === "initiative") { applyCommand(room, { verb: "initiative", attrs: {} }, {}, opts); continue; }
    if (g.phase === "activation") {
      const t = g.turn;
      const rig = room.rigs.find((r) => (r.owner || "a") === t.side && !r.destroyed && !r.activated);
      if (!rig) break;
      runBotActivation(room, rig, opts);
      continue;
    }
    break;
  }
  return room;
}

// A deterministic fingerprint of the finished game — everything a replay must
// reproduce exactly from the same seed.
function snapshot(room) {
  return {
    round: room.game.round,
    outcome: room.game.outcome,
    vp: room.game.sides.map((s) => s.vp),
    rigs: room.rigs.map((r) => ({
      name: r.name, destroyed: !!r.destroyed,
      pos: r.pos && { x: +r.pos.x.toFixed(4), y: +r.pos.y.toFixed(4) },
      sp: LOCS.map((l) => r[l]?.sp ?? 0),
    })),
  };
}

test("two bots play a full game to a terminal state, and VP can accrue", () => {
  let totalVp = 0;
  for (const seed of [1, 2, 3]) {
    const room = playGame(seed, "aggressive", "cagey");
    assert.ok(room.game.outcome != null || room.game.round > MAX_ROUNDS,
      `seed ${seed} did not terminate (round ${room.game.round}, phase ${room.game.phase})`);
    totalVp += room.game.sides.reduce((sum, s) => sum + s.vp, 0);
  }
  // Objectives (via E2) plus Priority kills mean somebody scores across a few
  // games; a flat 0 would mean the bot ignores the map entirely.
  assert.ok(totalVp > 0, "VP accrued across the games");
});

test("a bot-vs-bot game is reproducible from a seed", () => {
  const a = snapshot(playGame(7, "aggressive", "cagey"));
  const b = snapshot(playGame(7, "aggressive", "cagey"));
  assert.deepEqual(a, b, "same seed, same game");
});
