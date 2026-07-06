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

test("a ram breakdown renders the equation, its STR source, tier and SP", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution({
    id: 2, kind: "ram",
    rolls: [{ sides: 6, value: 6, label: "D6", tone: "ok" }],
    summary: "Ram hits Reaver: D6 6 + Ram STR 8 = 14 → critical (3 SP to engine)",
    breakdown: {
      weapon: "Ram", target: "Reaver",
      terms: [
        { value: 6, label: "D6", tone: "die" },
        { value: 8, label: "Ram STR · Medium", op: "+", tone: "mod" },
      ],
      total: 14, tier: "critical", sp: 3, location: "engine",
    },
    effects: [],
  });
  // The +9 is spelled out with its source, so it isn't a mystery modifier.
  expect(await screen.findByText("Ram STR · Medium")).toBeInTheDocument();
  expect(await screen.findByText("critical")).toBeInTheDocument();
  expect(await screen.findByText("SP → engine")).toBeInTheDocument();
});
