// Boiler blew (wr-0.17): a rig wrecked by its own overheat roll pays the other
// side the normal kill VP plus OVERHEAT_WRECK_VP.
import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, applyCommand, findRig, ANY_KILL_VP, OVERHEAT_WRECK_VP, __test } from "./game-state.js";

function room() {
  const r = createRoom("HEAT-T");
  applyCommand(r, { verb: "mission", attrs: { type: "skirmish", seed: 1, squads: {
    a: [{ name: "Gold", chassis: "light-claw-autocannon" }, { name: "Copper", chassis: "medium-lance-mortar" }],
    b: [{ name: "Red", chassis: "medium-sniper-chainsaw" }, { name: "Blue", chassis: "light-missile-flamethrower" }],
  } } });
  r.game.priorityTargets = {}; // keep Priority Elimination out of the sum
  return r;
}

test("an overheat wreck pays the enemy the kill VP plus the boiler bounty", () => {
  const r = room();
  const gold = findRig(r, "Gold");
  r.game.turn = { side: "a", activeRigId: gold.id, actionsUsed: 3, actionsMax: 3 };
  gold.engine.heat = 14;
  const before = r.game.sides.find((s) => s.id === "b").vp;
  __test.endActivation(r, gold, { overheat: 12 }, () => 0.5);
  assert.equal(gold.destroyed, true);
  const res = r.game.resolutions.find((x) => x.kind === "destruction" && x.rigId === gold.id);
  assert.ok(res.effects.some((e) => /boiler blew/.test(e)));
  assert.equal(r.game.sides.find((s) => s.id === "b").vp - before, ANY_KILL_VP + OVERHEAT_WRECK_VP);
});

test("a wreck from enemy fire pays no boiler bounty", () => {
  const r = room();
  const gold = findRig(r, "Gold");
  __test.applyDamage(r, gold, "engine", 99, { random: () => 0.5 });
  const res = r.game.resolutions.find((x) => x.kind === "destruction" && x.rigId === gold.id);
  assert.ok(!res.effects.some((e) => /boiler/.test(e)));
});
