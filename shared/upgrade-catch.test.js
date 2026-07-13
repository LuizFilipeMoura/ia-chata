import { test } from "node:test";
import assert from "node:assert/strict";
import { WEAPON_UPGRADES, EQUIPMENT_UPGRADES } from "./game-state.js";

test("every Prototype upgrade (weapons + equipment) has an authored catch", () => {
  for (const map of [WEAPON_UPGRADES, EQUIPMENT_UPGRADES]) {
    for (const [key, tiers] of Object.entries(map)) {
      const proto = tiers.find((t) => t.nature === "prototype");
      assert.ok(proto, `${key} has no prototype tier`);
      assert.equal(typeof proto.catch, "string", `${key} prototype missing catch`);
      assert.ok(proto.catch.trim().length > 0, `${key} prototype catch is empty`);
    }
  }
});
