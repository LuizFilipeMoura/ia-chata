import { render, screen } from "@testing-library/react";
import { FieldMap } from "./FieldMap";
import type { FieldState, Objective } from "../state/types";

const field: FieldState = {
  width: 48, height: 32, diagonal: "tlbr",
  terrain: [
    { x: 20, y: 12, size: "sm" },
    { x: 30, y: 20, size: "md" },
    { x: 12, y: 22, size: "sm" },
    { x: 36, y: 10, size: "md" },
  ],
  locked: false,
};
const objectives: Objective[] = [
  { x: 24, y: 16, vp: 2 },
  { x: 14, y: 9, vp: 1 },
  { x: 34, y: 23, vp: 1 },
];

test("renders three objective markers and every terrain piece", () => {
  render(<FieldMap field={field} objectives={objectives} mySide="a" ownerSide="a" />);
  expect(screen.getAllByTestId("objective")).toHaveLength(3);
  expect(screen.getAllByTestId("terrain")).toHaveLength(4);
});

test("labels the viewer's own deployment zone", () => {
  render(<FieldMap field={field} objectives={objectives} mySide="a" ownerSide="a" />);
  expect(screen.getByText("You deploy")).toBeInTheDocument();
  expect(screen.getByText("Enemy deploys")).toBeInTheDocument();
});
