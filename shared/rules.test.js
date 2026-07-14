import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, HEAT_THRESHOLDS, heatThreshold } from "./rules.js";
import { AIM, WEIGHT_STR_MOD, hitLocation, woundTarget } from "./rules.js";

test("ACTIONS carry the rulebook heat and slot costs (§5)", () => {
  assert.equal(ACTIONS.move.heat, 1);
  assert.equal(ACTIONS.sprint.heat, 2);
  assert.equal(ACTIONS.fire.heat, 1);
  assert.equal(ACTIONS.aimed.heat, 1);
  assert.equal(ACTIONS.ram, undefined); // ram removed — melee covers close combat
  assert.equal(ACTIONS.prepare.heat, 1);
  assert.equal(ACTIONS.reload.heat, 1);
  assert.equal(ACTIONS.repair.heat, 1);
  assert.equal(ACTIONS.shutdown.heat, 0);
  assert.equal(ACTIONS.shutdown.slot, 0);
  assert.equal(ACTIONS.move.slot, 1);
  assert.equal(ACTIONS.reload.slot, 1);
});

test("support module actions are registered, cold (0 heat), 1 slot each", () => {
  for (const key of ["fieldweld", "vent", "paint"]) {
    assert.ok(ACTIONS[key], `${key} registered`);
    assert.equal(ACTIONS[key].heat, 0);
    assert.equal(ACTIONS[key].slot, 1);
  }
});

test("heatThreshold maps a D12+bonus total to the right band (§6)", () => {
  assert.equal(heatThreshold(1).key, "safe");
  assert.equal(heatThreshold(5).key, "safe");
  assert.equal(heatThreshold(6).key, "stall");
  assert.equal(heatThreshold(7).key, "stall");
  assert.equal(heatThreshold(8).key, "detonation");
  assert.equal(heatThreshold(9).key, "detonation");
  assert.equal(heatThreshold(10).key, "blowout");
  assert.equal(heatThreshold(11).key, "blowout");
  assert.equal(heatThreshold(12).key, "buckling");
  assert.equal(heatThreshold(13).key, "buckling");
  assert.equal(heatThreshold(14).key, "engine-failure");
  assert.equal(heatThreshold(16).key, "engine-failure");
  assert.equal(heatThreshold(17).key, "catastrophic");
  assert.equal(heatThreshold(99).key, "catastrophic");
  assert.equal(HEAT_THRESHOLDS.length, 7);
});

test("hitLocation maps the D12 bands (§7)", () => {
  assert.equal(hitLocation("rig", 1), "hull");
  assert.equal(hitLocation("rig", 4), "hull");
  assert.equal(hitLocation("rig", 5), "arms");
  assert.equal(hitLocation("rig", 7), "arms");
  assert.equal(hitLocation("rig", 8), "legs");
  assert.equal(hitLocation("rig", 10), "legs");
  assert.equal(hitLocation("rig", 11), "engine");
  assert.equal(hitLocation("rig", 12), "engine");
});

test("weight-class and aim scalars are correct (§2)", () => {
  assert.equal(WEIGHT_STR_MOD.light, -2);
  assert.equal(WEIGHT_STR_MOD.medium, 0);
  assert.equal(AIM.medium, 4);
  assert.equal(AIM.heavy, 3);
});

test("woundTarget — TN is 6 + T - S", () => {
  assert.equal(woundTarget(5, 5), 6);  // even match
  assert.equal(woundTarget(7, 5), 4);  // stronger
  assert.equal(woundTarget(3, 5), 8);  // weaker
});

test("woundTarget — clamps to 2..10 so no matchup is ever hopeless", () => {
  // A natural 10 must ALWAYS wound. This is the guarantee that kills the
  // 69 dead zones of the impact-total model; do not relax it.
  assert.equal(woundTarget(1, 20), 10);
  // A natural 1 must NEVER wound.
  assert.equal(woundTarget(20, 1), 2);
});

test("woundTarget — the original bug case is possible, not impossible", () => {
  // light Circular Saw: STR 5 base, light weight mod -1 => 4. Medium hull T5.
  // Under the old model this was mathematically 0 damage. Now it is 7+ (40%).
  assert.equal(woundTarget(4, 5), 7);
});

test("woundTarget — coerces junk to a usable number", () => {
  assert.equal(woundTarget(undefined, 5), 10);
  assert.equal(woundTarget(5, undefined), 2);
});
