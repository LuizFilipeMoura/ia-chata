import { computeFocus } from "./computeFocus";
import type { GameState } from "../state/types";

const base = (over: Partial<GameState>): GameState => ({
  round: 1, phase: "setup", started: false, sides: [], ...over,
});

test("pre-battle with no rigs prompts commissioning", () => {
  const f = computeFocus(base({ started: false }), [], "a");
  expect(f?.primary).toMatch(/Commission your first Rig/);
  expect(f?.cta?.kind).toBe("commission");
});

test("finished phase yields no focus", () => {
  expect(computeFocus(base({ started: true, phase: "finished" }), [], "a")).toBeNull();
});
