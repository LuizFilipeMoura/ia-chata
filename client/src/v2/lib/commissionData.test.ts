import { expect, test } from "vitest";
import { CHASSIS_NAME, weaponGlyph, natureLabel, firstUpgradeId } from "./commissionData";

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
