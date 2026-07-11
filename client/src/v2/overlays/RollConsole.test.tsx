import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import RollConsole, { type RollConsoleHandle } from "./RollConsole";

// matchMedia is stubbed globally in client/src/test/setup.ts.

test("settled to-hit dice show HIT!/FAILED!/CRIT! verdicts by tone", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution({
    id: 1, kind: "attack",
    rolls: [
      { sides: 6, value: 4, label: "hit 1", tone: "ok" },
      { sides: 6, value: 2, label: "hit 2", tone: "miss" },
      { sides: 6, value: 6, label: "hit 3", tone: "crit" },
      { sides: 12, value: 7, label: "location", tone: "cool" },
    ],
    summary: "A1 → B1: 2 hit(s)",
    effects: [],
  });
  expect(await screen.findByText("HIT!")).toBeInTheDocument();
  expect(await screen.findByText("FAILED!")).toBeInTheDocument();
  expect(await screen.findByText("CRIT!")).toBeInTheDocument();
  // The location die (tone "cool") carries no verdict word.
  expect(screen.queryAllByText(/HIT!|FAILED!|CRIT!/)).toHaveLength(3);
});
