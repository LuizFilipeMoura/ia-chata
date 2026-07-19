import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { FieldFurniture } from "./FieldFurniture";
import { makeProjection } from "./fieldProjection";
import type { FieldState } from "../../state/types";

const field = { width: 54, height: 36, diagonal: "tlbr", locked: true, terrain: [] } as unknown as FieldState;
const proj = makeProjection(field);

test("rectOnly draws a poly piece as a rect, not a polygon", () => {
  const f = { ...field, terrain: [{ x: 20, y: 18, kind: "wood", shape: "poly", points: [[-2, -2], [2, -2], [2, 2], [-2, 2]] }] } as unknown as FieldState;
  const { container } = render(<svg><FieldFurniture field={f} objectives={[]} proj={proj} rectOnly /></svg>);
  expect(container.querySelector("polygon")).toBeNull();
  expect(container.querySelector('rect[data-testid="terrain"]')).toBeTruthy();
});

test("rectOnly draws an ellipse piece as a rect", () => {
  const f = { ...field, terrain: [{ x: 20, y: 18, kind: "crater", shape: "ellipse", rx: 3, ry: 2 }] } as unknown as FieldState;
  const { container } = render(<svg><FieldFurniture field={f} objectives={[]} proj={proj} rectOnly /></svg>);
  expect(container.querySelector("ellipse")).toBeNull();
  expect(container.querySelector('rect[data-testid="terrain"]')).toBeTruthy();
});

test("rectOnly poly bbox sits at the polygon's real min corner, not the origin", () => {
  const f = { ...field, terrain: [{ x: 20, y: 18, kind: "wood", shape: "poly", points: [[-1, -1], [3, -1], [3, 1], [-1, 1]] }] } as unknown as FieldState;
  const { container } = render(<svg><FieldFurniture field={f} objectives={[]} proj={proj} rectOnly /></svg>);
  const r = container.querySelector('rect[data-testid="terrain"]')!;
  const scale = proj.scale, cx = proj.sx(20), cy = proj.sy(18);
  expect(parseFloat(r.getAttribute("width")!)).toBeCloseTo(4 * scale, 1);
  expect(parseFloat(r.getAttribute("height")!)).toBeCloseTo(2 * scale, 1);
  expect(parseFloat(r.getAttribute("x")!)).toBeCloseTo(cx + -1 * scale, 1);
  expect(parseFloat(r.getAttribute("y")!)).toBeCloseTo(cy + -1 * scale, 1);
});

test("without rectOnly, a poly still renders as a polygon", () => {
  const f = { ...field, terrain: [{ x: 20, y: 18, kind: "wood", shape: "poly", points: [[-2, -2], [2, -2], [2, 2]] }] } as unknown as FieldState;
  const { container } = render(<svg><FieldFurniture field={f} objectives={[]} proj={proj} /></svg>);
  expect(container.querySelector("polygon")).toBeTruthy();
});
