import { render, act } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MoveTargetOverlay, type Placed } from "./MoveTargetLayer";
import { makeProjection } from "./fieldProjection";
import type { FieldState, Rig } from "../../state/types";

const field = { width: 54, height: 36, diagonal: "tlbr", locked: true, terrain: [] } as unknown as FieldState;
const proj = makeProjection(field);

const rig = (over: Partial<Rig> = {}): Rig => ({
  id: 1, name: "RED", owner: "a", weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, pos: { x: 10, y: 10 }, facing: 0, ...over,
} as Rig);

// The field-surface <rect> spans the field region exactly; for a 54×36 field its
// box ≈ fw×fh = 468×312, so a pointer fraction across it maps to field inches.
const mockSurface = (el: Element) => {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 468, height: 312, right: 468, bottom: 312, x: 0, y: 0, toJSON() {} }) as DOMRect;
};

test("draws the outer sprint ring only when sprinting is allowed", () => {
  const r = rig();
  const { queryByTestId, rerender } = render(
    <svg><MoveTargetOverlay proj={proj} field={field} rigs={[r]} rig={r} sprintAllowed placed={null} onPlaced={() => {}} /></svg>,
  );
  expect(queryByTestId("reach-ring")).toBeTruthy();
  expect(queryByTestId("sprint-ring")).toBeTruthy();

  rerender(
    <svg><MoveTargetOverlay proj={proj} field={field} rigs={[r]} rig={r} sprintAllowed={false} placed={null} onPlaced={() => {}} /></svg>,
  );
  expect(queryByTestId("reach-ring")).toBeTruthy();
  expect(queryByTestId("sprint-ring")).toBeNull();
});

test("grabbing and dragging the rig places a move via onPlaced", () => {
  const onPlaced = vi.fn();
  const r = rig();
  const { getByTestId } = render(
    <svg><MoveTargetOverlay proj={proj} field={field} rigs={[r]} rig={r} sprintAllowed={false} placed={null} onPlaced={onPlaced} /></svg>,
  );
  mockSurface(getByTestId("field-surface"));

  // Grab the rig, drag ~2" east of its {10,10} start (clientX 104 → x≈12, clientY 87 → y≈10).
  act(() => {
    getByTestId("drag-handle").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 104, clientY: 87 }));
  });

  expect(onPlaced).toHaveBeenCalled();
  const placed = onPlaced.mock.calls.at(-1)![0] as Placed;
  expect(placed.action).toBe("move");
  expect(placed.dest.x).toBeCloseTo(12, 0);
  expect(placed.dest.y).toBeCloseTo(10, 0);
});

test("the facing handle appears once placed and re-aims within the pivot budget", () => {
  const onPlaced = vi.fn();
  const r = rig();
  const placed: Placed = {
    dest: { x: 12, y: 10 }, facing: 0, pivot: 0, length: 2,
    path: [{ x: 10, y: 10 }, { x: 12, y: 10 }], action: "move",
  };
  const { getByTestId } = render(
    <svg><MoveTargetOverlay proj={proj} field={field} rigs={[r]} rig={r} sprintAllowed={false} placed={placed} onPlaced={onPlaced} /></svg>,
  );
  const handle = getByTestId("facing-handle"); // only rendered when placed
  mockSurface(getByTestId("field-surface"));

  // Drag the handle due south of the destination → heading ≈ +90°.
  act(() => {
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 104, clientY: 87 }));
  });
  act(() => {
    handle.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 104, clientY: 200 }));
  });

  expect(onPlaced).toHaveBeenCalled();
  const next = onPlaced.mock.calls.at(-1)![0] as Placed;
  expect(next.facing).toBeCloseTo(90, 0);
  expect(next.pivot).toBeCloseTo(90, 0);
});
