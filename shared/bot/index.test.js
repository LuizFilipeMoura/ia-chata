import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAction, runBotActivation, sideBotOf } from "./index.js";
import { PRESETS } from "./score.js";
import { createRoom, claimSide, applyCommand, checkCommand, findRig, autoDeploy } from "../game-state.js";
import { computeObjectives, scatterTerrain } from "../field.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A digital room with a mover ("Atk") and an enemy ("Foe"), objectives down, the
// a-side ready to activate Atk (turn open, no rig active yet — so runBotActivation
// issues the `activate` itself). Returns { room, atk, foe }.
function botSetup() {
  const room = createRoom("BOT01");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  applyCommand(room, { verb: "add", attrs: { name: "Atk", class: "medium", owner: "a", longRange: "Autocannon", melee: "Sword" } });
  applyCommand(room, { verb: "add", attrs: { name: "Foe", class: "medium", owner: "b", longRange: "Autocannon", melee: "Sword" } });
  const atk = findRig(room, "Atk");
  const foe = findRig(room, "Foe");
  atk.pos = { x: 24, y: 18 }; atk.facing = 0;
  foe.pos = { x: 36, y: 18 }; foe.facing = 180;
  room.field.terrain = [];
  room.game.objectives = computeObjectives(room.field);
  room.game.phase = "activation";
  room.game.turn = { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 0 };
  atk.loaded = { longRange: true, melee: true };
  return { room, atk, foe };
}

test("sideBotOf reads the per-side preset name", () => {
  const { room } = botSetup();
  room.game.sides[0].bot = "aggressive";
  assert.equal(sideBotOf(room, "a"), "aggressive");
  assert.equal(sideBotOf(room, "b"), null);
});

test("chooseAction returns null when every candidate scores <= 0", () => {
  const { room, atk, foe } = botSetup();
  foe.destroyed = true;          // no enemy to shoot or fear
  room.game.objectives = [];     // no marker to hold
  atk.pos = { x: 6, y: 6 };      // nothing positive anywhere
  room.game.turn.activeRigId = atk.id;
  room.game.turn.actionsMax = 3;
  assert.equal(chooseAction(room, atk, PRESETS.balanced), null);
});

test("chooseAction is deterministic — same room, same weights, same command", () => {
  const { room, atk } = botSetup();
  room.game.turn.activeRigId = atk.id;
  room.game.turn.actionsMax = 3;
  const first = chooseAction(room, atk, PRESETS.aggressive);
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(chooseAction(room, atk, PRESETS.aggressive), first);
  }
});

test("runBotActivation always ends the activation", () => {
  const { room, atk } = botSetup();
  runBotActivation(room, atk, { random: () => 0.5 });
  assert.equal(findRig(room, "Atk").activated, true, "the rig's activation is marked done");
});

test("runBotActivation respects the action budget", () => {
  const { room, atk } = botSetup();
  // Pre-activate with a tight budget so activate() doesn't reset it.
  room.game.turn = { side: "a", activeRigId: atk.id, actionsUsed: 0, actionsMax: 2 };
  const log = runBotActivation(room, atk, { random: () => 0.5 });
  assert.ok(log.length <= 2, `spent ${log.length} actions on a 2-action budget`);
});

test("the guard stops a runaway loop", () => {
  const { room, atk, foe } = botSetup();
  foe.destroyed = true;
  const mk = room.game.objectives[0];
  atk.pos = { x: mk.x, y: mk.y };   // on a marker: a 0" hold always scores vp > 0
  // Suppression Lock is the real runaway the guard exists for: availableActions
  // still OFFERS move (it only disables move when engaged/emplaced), but
  // performAction REJECTS it ("Pinned by Suppression"). So chooseAction keeps
  // returning the same always-positive hold, applyCommand keeps rejecting it, and
  // state never advances — an infinite loop without the guard. Pre-activated with
  // a budget past the guard, activeRigId set so runBotActivation skips activate().
  atk.suppressImmobile = true;
  room.game.turn = { side: "a", activeRigId: atk.id, actionsUsed: 0, actionsMax: 50 };
  const log = runBotActivation(room, atk, { random: () => 0.5 });
  assert.equal(log.length, 12, "the guard caps the loop at 12 iterations");
});

// A deployed digital board with a mirrored 2-light squadron per side, terrain
// scattered from `seed`. Mirrors digitalRoomWithMirroredRigs (game-state.test.js).
function deployedBoard(seed) {
  const room = createRoom("FUZZ");
  room.mode = "digital";
  claimSide(room, { name: "A", side: "a" });
  claimSide(room, { name: "B", side: "b" });
  room.field.terrain = scatterTerrain(room.field, mulberry32(seed), { digital: true });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 2; i++) {
      applyCommand(room, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, longRange: "Autocannon", melee: "Claw" } });
    }
  }
  applyCommand(room, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  autoDeploy(room, mulberry32(seed + 1000));
  room.game.objectives = computeObjectives(room.field);
  return room;
}

test("the bot never proposes a command the engine rejects", () => {
  // If the bot can never emit a command checkCommand rejects, an entire class of
  // bug is gone — including any drift between the move candidates and E1's own
  // validation. Any failure here is a real bug: fix the bot, never the assertion.
  // 60 seeds (not the spec's 200): checkCommand deep-clones the room per proposed
  // command, so this is already the suite's slowest test at ~12s. 60 boards ×
  // 4 rigs × 4 actions is a solid sample; bump it locally when hunting a
  // suspected drift.
  for (let seed = 1; seed <= 60; seed++) {
    const room = deployedBoard(seed);
    for (const rig of room.rigs) {
      room.game.phase = "activation";
      room.game.turn = { side: rig.owner || "a", activeRigId: rig.id, actionsUsed: 0, actionsMax: 3 };
      rig.loaded = { longRange: true, melee: true };
      for (let i = 0; i < 4; i++) {
        const cmd = chooseAction(room, rig, PRESETS.balanced);
        if (!cmd) break;
        const res = checkCommand(room, cmd);
        assert.equal(res.ok, true, `seed ${seed}: ${rig.name} proposed ${JSON.stringify(cmd)} → ${res.reason}`);
        applyCommand(room, cmd, {}, { random: mulberry32(seed + i) });
      }
    }
  }
});
