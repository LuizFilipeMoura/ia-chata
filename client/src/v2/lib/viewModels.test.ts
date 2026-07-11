import { expect, test } from "vitest";
import { spColor, tonnage, commissioned } from "./viewModels";
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

test("commissioned counts a side's rigs against the per-side cap", () => {
  const rigs = [rig("a", "light"), rig("a", "medium"), rig("b", "light")];
  expect(commissioned(rigs, "a")).toEqual({ count: 2, max: 3 });
});
