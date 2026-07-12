import { expect, test } from "vitest";
import { CHASSIS_NAME, weaponGlyph, natureLabel, firstUpgradeId, MODULE_BLURB } from "./commissionData";

test("chassis codename lookup", () => {
  expect(CHASSIS_NAME["light-claw-autocannon"]).toBe("Ironjaw");
});
test("weapon glyph falls back to a gear", () => {
  expect(weaponGlyph("Autocannon")).toBe("🎯");
  expect(weaponGlyph("Nonexistent")).toBe("⚙");
});
test("nature label maps ordnance stamps", () => {
  expect(natureLabel("field")).toBe("Standard");
  expect(natureLabel("tuned")).toBe("Machined");
  expect(natureLabel("prototype")).toBe("Prototype");
});
test("firstUpgradeId returns the first upgrade id for a weapon or null", () => {
  expect(firstUpgradeId("Autocannon")).toBeTypeOf("string");
  expect(firstUpgradeId("Nonexistent")).toBeNull();
});
test("MODULE_BLURB describes each ally-verb module", () => {
  expect(MODULE_BLURB.repair).toMatch(/weld/i);
  expect(MODULE_BLURB.coolant).toMatch(/heat/i);
  expect(MODULE_BLURB.recon).toMatch(/mark/i);
  // Damage is shown as the gun itself, so it has no blurb.
  expect(MODULE_BLURB.damage).toBeUndefined();
});
