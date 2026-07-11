import { expect, test } from "vitest";
import { soundUrl } from "./soundAssets";

test("resolves a known stem to a URL string", () => {
  const url = soundUrl("fire_firing");
  expect(typeof url).toBe("string");
  expect(url).toMatch(/fire_firing/);
});

test("resolves the renamed engine stems", () => {
  expect(soundUrl("engine_idle_1")).toBeTruthy();
  expect(soundUrl("engine_idle_2")).toBeTruthy();
});

test("returns null for an unknown stem", () => {
  expect(soundUrl("does_not_exist")).toBeNull();
});
