import { expect, test } from "vitest";
import { spColor, tonnage, squadronStatus } from "./viewModels";
import type { Rig } from "../../state/types";

const rig = (owner: "a" | "b", weightClass: "light" | "medium"): Rig => ({
  id: Math.floor(Math.random() * 1e6), name: "X", owner, weightClass,
  hull: { sp: 6, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: "ablative-plating", activated: false, destroyed: false,
});

test("spColor ramps from green to ember by ratio", () => {
  expect(spColor(6, 6)).toContain("6cc47f");
  expect(spColor(3, 6)).toContain("e8bd57");
  expect(spColor(1, 6)).toContain("ef9450");
  expect(spColor(0, 6)).toContain("f26a50");
});

test("tonnage sums the cosmetic weight-class map for one side", () => {
  const rigs = [rig("a", "light"), rig("a", "medium"), rig("b", "light")];
  expect(tonnage(rigs, "a")).toBe(14);
});

test("squadronStatus reports count and parity against the opponent", () => {
  // a: 1 light + 1 medium. b: 1 light. a is off parity.
  const rigs = [rig("a", "light"), rig("a", "medium"), rig("b", "light")];
  const s = squadronStatus(rigs, "a");
  expect(s.count).toBe(2);
  expect(s.atParity).toBe(false);

  const mirrored = [rig("a", "light"), rig("b", "light")];
  expect(squadronStatus(mirrored, "a")).toEqual({ count: 1, atParity: true, diffLabel: null });
});
