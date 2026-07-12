import { expect, test } from "vitest";
import { compositionOf, parityStatus } from "./composition";
import type { Rig } from "../state/types";

const rig = (owner: "a" | "b", weightClass: string, kind?: "rig" | "tank" | "walker"): Rig => ({
  id: Math.floor(Math.random() * 1e6), name: "X", owner,
  weightClass: weightClass as Rig["weightClass"], kind,
  hull: { sp: 6, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false,
});

test("compositionOf buckets rigs by weight class and cold kinds by kind", () => {
  const rigs = [rig("a", "light"), rig("a", "light"), rig("a", "heavy"), rig("a", "-", "tank")];
  expect(compositionOf(rigs, "a")).toEqual({ "rig:light": 2, "rig:heavy": 1, tank: 1 });
});

test("parityStatus reports atParity when both sides mirror", () => {
  const rigs = [rig("a", "light"), rig("b", "light")];
  expect(parityStatus(rigs, "a").atParity).toBe(true);
  expect(parityStatus(rigs, "a").diffLabel).toBeNull();
});

test("parityStatus reports a shortfall from my point of view", () => {
  // a: 1 light. b: 1 light + 1 heavy. I am short 1 heavy.
  const rigs = [rig("a", "light"), rig("b", "light"), rig("b", "heavy")];
  const s = parityStatus(rigs, "a");
  expect(s.atParity).toBe(false);
  expect(s.diffLabel).toBe("Short 1 Heavy Rig");
});

test("parityStatus reports an excess from my point of view", () => {
  // a: 1 light + 1 tank. b: 1 light. I have 1 extra tank.
  const rigs = [rig("a", "light"), rig("a", "-", "tank"), rig("b", "light")];
  const s = parityStatus(rigs, "a");
  expect(s.atParity).toBe(false);
  expect(s.diffLabel).toBe("1 extra Tank");
});

test("parityStatus prompts when the opponent has no units", () => {
  const rigs = [rig("a", "light")];
  const s = parityStatus(rigs, "a");
  expect(s.atParity).toBe(false);
  expect(s.diffLabel).toBe("Waiting for opponent to commission units.");
});
