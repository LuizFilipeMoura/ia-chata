import { expect, test } from "vitest";
import { makeProjection } from "./fieldProjection";

const field = { width: 54, height: 36, terrain: [] } as unknown as Parameters<typeof makeProjection>[0];

test("sx/sy map field inches into the padded canvas", () => {
  const p = makeProjection(field);
  expect(p.sx(0)).toBeCloseTo(p.pad);
  expect(p.sy(0)).toBeCloseTo(p.pad);
  expect(p.sx(field.width)).toBeCloseTo(p.pad + field.width * p.scale);
});

test("toInches is the inverse of sx/sy", () => {
  const p = makeProjection(field);
  const inches = p.toInches(p.sx(12.5), p.sy(20.25));
  expect(inches.x).toBeCloseTo(12.5);
  expect(inches.y).toBeCloseTo(20.25);
});
