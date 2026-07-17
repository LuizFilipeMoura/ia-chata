import { expect, test } from "vitest";
import { computeMovePreview } from "./movePreview";
import { moveBudget } from "/shared/game-state.js";
import type { FieldState, Rig } from "../../state/types";

const field = { width: 54, height: 36, terrain: [] } as unknown as FieldState;
const rig = (over: Partial<Rig> = {}): Rig => ({
  id: 1, name: "RED", owner: "a", weightClass: "light", speed: 5,
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, pos: { x: 10, y: 10 }, facing: 0, ...over,
} as Rig);

test("a destination within moveBudget is reachable; the path length is reported", () => {
  const r = rig();
  const budget = moveBudget(r as never, "move");
  const dest = { x: 10 + budget * 0.5, y: 10 };
  const p = computeMovePreview(field, [r], r, "move", dest);
  expect(p.reachable).toBe(true);
  expect(p.length).toBeGreaterThan(0);
  expect(p.length).toBeLessThanOrEqual(budget + 1e-6);
});

test("a destination beyond moveBudget is unreachable", () => {
  const r = rig();
  const budget = moveBudget(r as never, "move");
  const dest = { x: 10 + budget * 3, y: 10 };
  const p = computeMovePreview(field, [r], r, "move", dest);
  expect(p.reachable).toBe(false);
});

test("facing defaults to the movement heading and reports the pivot from current", () => {
  const r = rig({ facing: 0 });
  const dest = { x: 12, y: 10 };
  const p = computeMovePreview(field, [r], r, "move", dest);
  expect(Math.abs(p.facing)).toBeLessThan(1);
  expect(p.pivot).toBeLessThan(1);
});
