import { expect, test } from "vitest";
import { shouldUseV2 } from "./shouldUseV2";

test("returns true when v2 query flag present", () => {
  expect(shouldUseV2("?v2")).toBe(true);
  expect(shouldUseV2("?foo=1&v2")).toBe(true);
  expect(shouldUseV2("?v2=1")).toBe(true);
});

test("returns false when absent", () => {
  expect(shouldUseV2("")).toBe(false);
  expect(shouldUseV2("?foo=1")).toBe(false);
});
