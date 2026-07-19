import { expect, test } from "vitest";
import { actionForDistance, clampToPivot, placeDrag } from "./dragMove";
import type { FieldState, Rig } from "../../state/types";

const field = { width: 54, height: 36, diagonal: "tlbr", locked: true, terrain: [] } as unknown as FieldState;
const mover = (over: Partial<Rig> = {}): Rig => ({
  id: 1, name: "RED", owner: "a", weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, pos: { x: 27, y: 18 }, facing: 0, ...over,
} as Rig);

test("clampToPivot limits a turn to ±90° and reports the magnitude", () => {
  expect(clampToPivot(200, 0).pivot).toBe(90);
  expect(clampToPivot(45, 0)).toEqual({ facing: 45, pivot: 45 });
});

test("actionForDistance picks sprint only past the move ring and only when allowed", () => {
  expect(actionForDistance(3, 5, true)).toBe("move");
  expect(actionForDistance(8, 5, true)).toBe("sprint");
  expect(actionForDistance(8, 5, false)).toBe("move");
});

test("placeDrag clamps an out-of-reach point back inside budget", () => {
  const rig = mover();
  const p = placeDrag(field, [rig], rig, { x: 60, y: 18 }, false); // far east, off-field
  const dist = Math.hypot(p.dest.x - 27, p.dest.y - 18);
  expect(p.action).toBe("move");
  expect(Number.isFinite(p.length)).toBe(true);
  expect(dist).toBeLessThan(60 - 27); // pulled in from the raw point
});

test("placeDrag keeps a nearby reachable point as-is and faces toward it", () => {
  const rig = mover();
  const p = placeDrag(field, [rig], rig, { x: 30, y: 18 }, false); // 3\" east, reachable
  expect(p.dest.x).toBeCloseTo(30, 1);
  expect(p.dest.y).toBeCloseTo(18, 1);
  expect(p.facing).toBeCloseTo(0, 0); // heading due east
});
