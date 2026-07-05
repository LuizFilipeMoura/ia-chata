import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, HEAT_THRESHOLDS, heatThreshold } from "./rules.js";

test("ACTIONS carry the rulebook heat and slot costs (§5)", () => {
  assert.equal(ACTIONS.move.heat, 1);
  assert.equal(ACTIONS.sprint.heat, 2);
  assert.equal(ACTIONS.fire.heat, 1);
  assert.equal(ACTIONS.aimed.heat, 1);
  assert.equal(ACTIONS.ram.heat, 1);
  assert.equal(ACTIONS.prepare.heat, 1);
  assert.equal(ACTIONS.reload.heat, 0);
  assert.equal(ACTIONS.repair.heat, 0);
  assert.equal(ACTIONS.shutdown.heat, 0);
  assert.equal(ACTIONS.shutdown.slot, 0);
  assert.equal(ACTIONS.move.slot, 1);
  assert.equal(ACTIONS.reload.slot, 1);
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
