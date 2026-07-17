import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import RollConsole, { type RollConsoleHandle } from "./RollConsole";

// matchMedia is stubbed globally in client/src/test/setup.ts.

test("reaction resolution reveals the reaction label", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution({
    id: 1, kind: "reaction", prep: "return", summary: "R reveals Return Fire!", effects: [],
  });
  expect(await screen.findByLabelText("Return Fire")).toBeInTheDocument();
});

// The equation/tier assertions that used to live here pinned `breakdown.terms`,
// `.total` and `.tier` — fields the d10 wound rewrite deleted from the engine and
// Plan 2 removed from ResolutionBreakdown. They were a false green: they proved
// dead markup rendered dead fields the game can no longer produce. The live
// behaviour (the resolution ledger) is tested against the live component, in
// client/src/v2/overlays/RollConsole.test.tsx.
test("a ram breakdown renders its target and the SP dealt", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution({
    id: 2, kind: "ram",
    rolls: [{ sides: 6, value: 6, label: "D6", tone: "ok" }],
    summary: "Ram hits Reaver: 3 SP to engine",
    breakdown: { weapon: "Ram", target: "Reaver", sp: 3, location: "engine" },
    effects: [],
  });
  expect(await screen.findByText("Ram")).toBeInTheDocument();
  expect(await screen.findByText("SP → engine")).toBeInTheDocument();
});
