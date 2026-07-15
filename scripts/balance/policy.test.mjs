import { test } from "node:test";
import assert from "node:assert/strict";
import { greedySafe } from "./policy.mjs";
import { createRoom, applyCommand, HEAT_CAPACITY } from "../../shared/game-state.js";

// A real seeded room at the activation phase with `active` activated.
// 3v3 because the seed verb force-starts only at >=3 rigs per side.
function seatedRoom(active = "A1") {
  const room = createRoom("TEST");
  const rnd = () => 0.5;
  const roster = ["A1", "A2", "A3"].map((n) => ({ name: n, owner: "a", chassis: "medium-lance-mortar" }))
    .concat(["B1", "B2", "B3"].map((n) => ({ name: n, owner: "b", chassis: "medium-lance-mortar" })));
  applyCommand(room, { verb: "seed", attrs: { roster, first: "a" } }, {}, { random: rnd });
  // The second player MUST spend an Answer token before anyone can activate —
  // there is no decline path. Spend it on a bystander so no duellist carries a
  // preparation (Brace is -2 STR on the front arc and would skew everything).
  const pa = room.game.pendingAnswer;
  if (pa) applyCommand(room, { verb: "answer", attrs: { name: "B3", side: pa.side, prep: "brace" } }, { side: pa.side }, { random: rnd });
  applyCommand(room, { verb: "activate", attrs: { name: active } }, { side: "a" }, { random: rnd });
  return room;
}

test("greedySafe fires when heat allows", () => {
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.verb, "action");
  assert.equal(cmd.attrs.action, "fire");
  assert.equal(cmd.attrs.target, "B1");
});

test("greedySafe shuts down rather than exceed capacity", () => {
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  // Medium capacity is 5. At 5, one more heat is over — so it must vent, not fire.
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass];
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.attrs.action, "shutdown");
});

test("greedySafe never issues an action availableActions reports disabled", () => {
  // The whole point of reading availableActions is that the engine owns legality.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  room.game.turn.actionsUsed = room.game.turn.actionsMax;
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.notEqual(cmd?.attrs?.action, "fire");
});

test("greedySafe returns null when nothing is worth doing", () => {
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const dead = room.rigs.find((r) => r.name === "B1");
  dead.destroyed = true;
  assert.equal(greedySafe(room, rig, dead), null);
});

test("greedySafe reloads a spent weapon rather than emitting a dead fire", () => {
  // Firing a spent weapon is a silent no-op in the engine (game-state.js: "Firing
  // a spent weapon is a no-op until the player spends a Reload") — yet the Fire
  // tile stays `enabled`, because Fire is what opens the reload drawer. A policy
  // that trusts `enabled` here emits fire forever and the duel never advances.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  rig.loaded.longRange = false;
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.attrs.action, "reload");
});

test("greedySafe vents when a reload roll could break capacity", () => {
  // Reload costs heat kinds a d6 gamble: 1-3 -> +2 heat. Budget the worst case,
  // since that bound is known — unlike weapon-side fireModeHeat.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  rig.loaded.longRange = false;
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass] - 1; // 4: worst-case reload -> 6 > 5
  const cmd = greedySafe(room, rig, room.rigs.find((r) => r.name === "B1"));
  assert.equal(cmd.attrs.action, "shutdown");
});

test("greedySafe stops deciding once the activation has ended", () => {
  // Shut Down calls endActivation: activeRigId goes null and the engine silently
  // drops every later command for this rig. A policy that keeps returning them
  // spins the driver forever, so the contract is "a command only when it acts".
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  applyCommand(room, { verb: "action", attrs: { name: "A1", action: "shutdown" } }, { side: "a" }, { random: () => 0.5 });
  assert.equal(room.game.turn.activeRigId, null);
  assert.equal(greedySafe(room, rig, room.rigs.find((r) => r.name === "B1")), null);
});

test("greedySafe does not vent while a meltdown charge is banked", () => {
  // battle-view hardcodes the Shut Down tile to enabled, but the engine rejects
  // it outright while Meltdown Protocol holds a charge. Since greedySafe budgets
  // only KNOWN heat it can overshoot capacity and bank one — and then it would
  // re-issue a shutdown the engine refuses, forever, hanging the driver.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass]; // can't fire safely either
  rig.equipState = { ...(rig.equipState || {}), meltdownCharge: 2 };
  assert.equal(greedySafe(room, rig, room.rigs.find((r) => r.name === "B1")), null);
});

test("driving greedySafe reaches a second volley", () => {
  // The harness exists because the old sweep never reached a 3rd volley. A policy
  // that stalls on volley one would reproduce exactly that blindness, so assert
  // the loop actually advances against the real command path.
  const room = seatedRoom();
  const rig = room.rigs.find((r) => r.name === "A1");
  const enemy = room.rigs.find((r) => r.name === "B1");
  const rnd = () => 0.5;
  for (let i = 0; i < 6; i++) {
    const cmd = greedySafe(room, rig, enemy);
    if (!cmd) break;
    applyCommand(room, cmd, { side: "a" }, { random: rnd });
  }
  assert.ok(room.game.turn.longRangeShots >= 2, `expected >=2 volleys, got ${room.game.turn.longRangeShots}`);
});
