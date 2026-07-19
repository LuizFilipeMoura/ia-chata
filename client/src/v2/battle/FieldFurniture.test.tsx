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

test("without rectOnly, a poly still renders as a polygon", () => {
  const f = { ...field, terrain: [{ x: 20, y: 18, kind: "wood", shape: "poly", points: [[-2, -2], [2, -2], [2, 2]] }] } as unknown as FieldState;
  const { container } = render(<svg><FieldFurniture field={f} objectives={[]} proj={proj} /></svg>);
  expect(container.querySelector("polygon")).toBeTruthy();
});
