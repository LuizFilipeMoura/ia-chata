import { expect, test } from "vitest";
import { CHASSIS_NAME, weaponGlyph, natureLabel, firstUpgradeId, MODULE_BLURB } from "./commissionData";
import { upgradePips, splitUpgradeTag } from "./commissionData";

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

test("upgradePips climbs reward and risk by nature", () => {
  expect(upgradePips("field")).toEqual({ reward: 1, risk: 0 });
  expect(upgradePips("tuned")).toEqual({ reward: 2, risk: 1 });
  expect(upgradePips("prototype")).toEqual({ reward: 3, risk: 2 });
  expect(upgradePips("bogus")).toEqual({ reward: 1, risk: 0 });
});

test("splitUpgradeTag strips the tag for payoff and prefers an authored catch", () => {
  const t = { id: "x", nature: "prototype", name: "N", tag: "Ignores armour; belt cycles slow after", catch: "Belt cycles slow after — no fire next turn" };
  expect(splitUpgradeTag(t)).toEqual({ payoff: "Ignores armour", catch: "Belt cycles slow after — no fire next turn" });
});

test("splitUpgradeTag with an authored catch and no delimiter keeps the whole tag as payoff", () => {
  const t = { id: "y", nature: "prototype", name: "N", tag: "EMP a rig for a turn", catch: "Overloads your own gun" };
  expect(splitUpgradeTag(t)).toEqual({ payoff: "EMP a rig for a turn", catch: "Overloads your own gun" });
});

test("splitUpgradeTag parses a delimited tag when no catch is authored", () => {
  const semi = { id: "a", nature: "prototype", name: "N", tag: "Ignores armour; belt cycles slow after" };
  expect(splitUpgradeTag(semi)).toEqual({ payoff: "Ignores armour", catch: "belt cycles slow after" });
  const dash = { id: "b", nature: "prototype", name: "N", tag: "Reel a rig in — runs hot" };
  expect(splitUpgradeTag(dash)).toEqual({ payoff: "Reel a rig in", catch: "runs hot" });
});

test("splitUpgradeTag reports no catch for a clean safe upgrade", () => {
  const t = { id: "c", nature: "field", name: "N", tag: "+2 STR" };
  expect(splitUpgradeTag(t)).toEqual({ payoff: "+2 STR", catch: null });
});
