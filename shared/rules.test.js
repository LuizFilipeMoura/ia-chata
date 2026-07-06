import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, HEAT_THRESHOLDS, heatThreshold } from "./rules.js";
import { impactRow, AIM, WEIGHT_STR_MOD, RAM_STR, hitLocation, impactSeverity } from "./rules.js";

test("ACTIONS carry the rulebook heat and slot costs (§5)", () => {
  assert.equal(ACTIONS.move.heat, 1);
  assert.equal(ACTIONS.sprint.heat, 2);
  assert.equal(ACTIONS.fire.heat, 1);
  assert.equal(ACTIONS.aimed.heat, 1);
  assert.equal(ACTIONS.ram.heat, 1);
  assert.equal(ACTIONS.prepare.heat, 1);
  assert.equal(ACTIONS.reload.heat, 1);
  assert.equal(ACTIONS.repair.heat, 1);
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

test("impactSeverity reads a class/location row (§2) and scalars are correct", () => {
  const row = impactRow("rig", "engine", "light"); // 7-9 / 10-11 / 12+
  assert.equal(impactSeverity(6, row).tier, "none");
  assert.equal(impactSeverity(7, row).sp, 1);
  assert.equal(impactSeverity(10, row).sp, 2);
  assert.equal(impactSeverity(12, row).sp, 3);
  assert.equal(WEIGHT_STR_MOD.light, -2);
  assert.equal(WEIGHT_STR_MOD.medium, 0);
  assert.equal(RAM_STR.medium, 8);
  assert.equal(AIM.medium, 4);
  assert.equal(AIM.heavy, 3);
});
