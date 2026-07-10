import { render, screen, act } from "@testing-library/react";
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

test("a destroyed rig plays the full-screen KABOOM notice with its name", () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  // Not awaited: the cinematic self-dismisses on a timer — the DOM is set
  // synchronously, which is what we assert (cleanup clears the pending timer).
  act(() => {
    void ref.current!.playResolution({
      id: 3, kind: "destruction", rigName: "Stalker", exploded: false,
      summary: "Stalker destroyed — no secondary blast",
    });
  });
  expect(screen.getByText("RIG DESTROYED")).toBeInTheDocument();
  expect(screen.getByText("Stalker")).toBeInTheDocument();
  expect(screen.queryByText(/MUNITIONS COOK OFF/)).toBeNull();
});

test("an erupting rig adds the munitions-blast badge", () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  act(() => {
    void ref.current!.playResolution({
      id: 4, kind: "destruction", rigName: "Warden", exploded: true,
      summary: 'Warden destroyed — munitions erupt (mark rigs within 12")',
    });
  });
  expect(screen.getByText(/MUNITIONS COOK OFF/)).toBeInTheDocument();
});

test("a damaging overheat raises the engine-misfire klaxon; a safe one stays quiet", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution({
    id: 5, kind: "overheat", sev: "engine-failure",
    rolls: [{ sides: 12, value: 14, label: "D12" }],
    summary: "Warden: Engine Failure (D12 14+2=16)",
    effects: ["2 damage to the Engine; heat can no longer be decreased."],
  });
  expect(await screen.findByText("⚠ ENGINE MISFIRE")).toBeInTheDocument();

  // Over capacity but rolled low → "safe" row: no misfire, no alarm.
  await ref.current!.playResolution({
    id: 6, kind: "overheat", sev: "safe",
    rolls: [{ sides: 12, value: 2, label: "D12" }],
    summary: "Warden: Nothing happens (D12 2+2=4)",
    effects: ["Nothing happens."],
  });
  expect(screen.queryByText("⚠ ENGINE MISFIRE")).toBeNull();
});
