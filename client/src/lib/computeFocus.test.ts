import { computeFocus } from "./computeFocus";
import type { GameState, Rig } from "../state/types";

const base = (over: Partial<GameState>): GameState => ({
  round: 1, phase: "setup", started: false, sides: [], ...over,
});

const rig = (over: Partial<Rig>): Rig => ({
  id: 1, name: "Warden", weightClass: "medium", owner: "a",
  hull: { sp: 4, max: 4, destroyed: false },
  arms: { sp: 4, max: 4, destroyed: false },
  legs: { sp: 4, max: 4, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null,
  activated: false,
  destroyed: false,
  ...over,
});

test("pre-battle with no rigs prompts commissioning", () => {
  const f = computeFocus(base({ started: false }), [], "a");
  expect(f?.primary).toMatch(/Commission your first unit/);
  expect(f?.cta?.kind).toBe("commission");
});

test("pre-battle off parity shows the composition diff", () => {
  const g = base({
    started: false,
    sides: [
      { id: "a", name: "Codex", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false },
    ],
  });
  // a: 1 light. b: 1 light + 1 medium. a is short 1 medium.
  const rigs = [
    rig({ id: 1, owner: "a", weightClass: "light" }),
    rig({ id: 2, owner: "b", weightClass: "light" }),
    rig({ id: 3, owner: "b", weightClass: "medium" }),
  ];
  const f = computeFocus(g, rigs, "a");
  expect(f?.primary).toBe("Match your opponent's composition");
  expect(f?.secondary).toBe("Short 1 Medium Rig");
});

test("pre-battle at parity prompts Ready", () => {
  const g = base({
    started: false,
    sides: [
      { id: "a", name: "Codex", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false },
    ],
  });
  const rigs = [
    rig({ id: 1, owner: "a", weightClass: "light" }),
    rig({ id: 2, owner: "b", weightClass: "light" }),
  ];
  const f = computeFocus(g, rigs, "a");
  expect(f?.cta?.kind).toBe("ready");
  expect(f?.primary).toMatch(/Mark ready/);
});

test("finished phase yields no focus", () => {
  expect(computeFocus(base({ started: true, phase: "finished" }), [], "a")).toBeNull();
});

test("prompts End turn when the active rig has no actions left", () => {
  const activeRig = rig({ id: 1, name: "Warden" });
  const g = base({
    started: true, phase: "activation",
    turn: { side: "a", activeRigId: 1, actionsUsed: 2, actionsMax: 2 },
  });
  const f = computeFocus(g, [activeRig], "a");
  expect(f?.tone).toBe("act");
  expect(f?.primary).toBe(`End ${activeRig.name}'s turn`);
  expect(f?.secondary).toBe("No actions left — pass to the next Rig.");
  expect(f?.cta).toEqual({ label: "End turn", kind: "endTurn" });
});

test("keeps the Fire/Move/Reload hint", () => {
  const activeRig = rig({ id: 1, name: "Warden" });
  const g = base({
    started: true, phase: "activation",
    turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 2 },
  });
  const f = computeFocus(g, [activeRig], "a");
  expect(f?.secondary).toContain("· Fire, Move or Reload");
});

test("waits when opponent must spend answer tokens before activation", () => {
  const g = base({
    started: true,
    phase: "activation",
    sides: [
      { id: "a", name: "Codex", vp: 0, ready: true },
      { id: "b", name: "Rival", vp: 0, ready: true },
    ],
    turn: { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 0 },
    pendingAnswer: { side: "b", remaining: 2 },
  });
  const f = computeFocus(g, [rig({ owner: "a" })], "a");
  expect(f?.tone).toBe("wait");
  expect(f?.primary).toBe("Waiting for Rival to set answer tokens...");
});

test("gives Roll initiative a secondary round line", () => {
  const g = base({ started: true, phase: "initiative", round: 2 });
  const f = computeFocus(g, [], "a");
  expect(f?.secondary).toBe("Round 2 — decide who moves first.");
});

test("recovery prompts scoring when I haven't submitted", () => {
  const g = base({ started: true, phase: "recovery", recoveryClaims: {} });
  const f = computeFocus(g, [], "a");
  expect(f?.tone).toBe("act");
  expect(f?.primary).toBe("Score your objectives");
  expect(f?.cta).toEqual({ label: "Score VP", kind: "score" });
});

test("recovery waits after I submit with no conflict", () => {
  const g = base({ started: true, phase: "recovery", recoveryClaims: { a: [0] } });
  const f = computeFocus(g, [], "a");
  expect(f?.tone).toBe("wait");
  expect(f?.primary).toMatch(/Waiting for opponent/);
});

test("recovery flags a disputed marker to both sides", () => {
  const g = base({
    started: true, phase: "recovery",
    recoveryClaims: { a: [0], b: [0] }, recoveryConflict: [0],
  });
  const f = computeFocus(g, [], "a");
  expect(f?.primary).toBe("Objectives disputed");
  expect(f?.cta).toEqual({ label: "Re-check", kind: "score" });
});
