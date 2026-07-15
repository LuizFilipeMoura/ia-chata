import { render, screen, act } from "@testing-library/react";
import { createRef } from "react";
import type { Resolution, ResolutionStep } from "../../state/types";
import RollConsole, { type RollConsoleHandle } from "./RollConsole";

// matchMedia is stubbed globally in client/src/test/setup.ts.

// A resolution carrying only a ledger. `rolls: []` skips the flicker→settle
// animation (playResolution settles synchronously when there are no dice), so
// these tests assert the ledger render without driving timers. The dice theater
// itself is covered by the verdict tests at the bottom.
const ledger = (steps: ResolutionStep[], sp = 0, location = "hull"): Resolution => ({
  id: 1,
  kind: "attack",
  rolls: [],
  summary: "Shrike → Reaver with Circular Saw",
  breakdown: {
    actor: "Shrike", weapon: "Circular Saw", target: "Reaver",
    steps, sp, location,
  },
  effects: [],
});

// The original bug report, as a ledger: a light Circular Saw into a medium
// hull. Two hits, both wound rolls fail against T5 — "why 0 damage?"
const BUG_CASE: ResolutionStep[] = [
  {
    kind: "hit",
    target: 4,
    terms: [{ label: "base aim", value: 4 }],
    dice: [{ value: 5, ok: true }, { value: 4, ok: true }, { value: 2, ok: false }],
    out: "2 of 3 hit",
  },
  { kind: "location", die: 2, out: "hull" },
  {
    kind: "wound",
    target: 7,
    pen: 4,
    toughness: 5,
    terms: [{ label: "weapon STR", value: 4 }, { label: "light chassis", value: -1 }],
    dice: [{ value: 3, ok: false }, { value: 6, ok: false }],
    out: "0 of 2 wounded",
  },
  { kind: "damage", terms: [{ label: "wounds", value: 0 }], out: "0 SP → hull" },
];

test("renders every step of the ledger in order", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution(ledger(BUG_CASE));

  const steps = await screen.findAllByTestId("v2-roll-step");
  expect(steps).toHaveLength(4);
  // The engine's order — location precedes wound because toughness is
  // per-location, so the d12 supplies the T the wound roll tests against.
  expect(steps.map((s) => s.getAttribute("data-kind"))).toEqual([
    "hit", "location", "wound", "damage",
  ]);
});

test("shows the wound step's STR against toughness and the resulting target", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution(ledger(BUG_CASE));

  // This is the line that answers "why 0 damage?" — the reason this plan exists.
  const wound = await screen.findByTestId("v2-roll-step-wound");
  expect(wound).toHaveTextContent("4");
  expect(wound).toHaveTextContent("5");
  expect(wound).toHaveTextContent("7+");
  // ...and it reads as one sentence, not three loose numbers.
  expect(wound).toHaveTextContent(/STR\s*4\s*vs\s*T\s*5\s*→\s*7\+/);
});

test("renders an auto-fail step rather than omitting it", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution(ledger([
    { kind: "hit", target: 4, terms: [{ label: "base aim", value: 4 }], dice: [{ value: 5, ok: true }], out: "1 of 1 hit" },
    { kind: "location", die: 9, out: "hull" },
    { kind: "wound", target: null, pen: null, toughness: null, terms: [], dice: [], out: "shield negates — no wound roll" },
  ]));

  const wound = await screen.findByTestId("v2-roll-step-wound");
  expect(wound).toHaveTextContent(/shield negates/i);
  // No target number to show: inventing a "null+" would be a fiction.
  expect(wound).not.toHaveTextContent(/\d\+/);
});

test("omits a term that did not fire", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution(ledger(BUG_CASE));

  const hit = await screen.findByTestId("v2-roll-step-hit");
  expect(hit).toHaveTextContent(/base aim/i);
  expect(hit).not.toHaveTextContent(/cover/i);
});

test("renders a zero-valued canceller term, which explains an absence", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution(ledger([
    {
      kind: "hit",
      target: 4,
      terms: [
        { label: "base aim", value: 4 },
        { label: "targeting computer (ignores cover)", value: 0 },
      ],
      dice: [{ value: 5, ok: true }],
      out: "1 of 1 hit",
    },
  ]));

  // A 0 here is the point: it says WHY cover cost nothing.
  const hit = await screen.findByTestId("v2-roll-step-hit");
  expect(hit).toHaveTextContent(/ignores cover/i);
});

test("each step names its own outcome and target number", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution(ledger(BUG_CASE));

  expect(await screen.findByTestId("v2-roll-step-hit")).toHaveTextContent("4+");
  expect(screen.getByTestId("v2-roll-step-hit")).toHaveTextContent("2 of 3 hit");
  expect(screen.getByTestId("v2-roll-step-location")).toHaveTextContent("hull");
  expect(screen.getByTestId("v2-roll-step-wound")).toHaveTextContent("0 of 2 wounded");
  expect(screen.getByTestId("v2-roll-step-damage")).toHaveTextContent("0 SP → hull");
});

test("the ledger headline names actor, weapon and target unit", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution(ledger(BUG_CASE));

  expect(await screen.findByText("Shrike")).toBeInTheDocument();
  expect(screen.getByText("Circular Saw")).toBeInTheDocument();
  // `breakdown.target` is the unit's NAME — never the wound TN.
  expect(screen.getByText("→ Reaver")).toBeInTheDocument();
});

test("a summary with no ledger still renders the fallback sentence", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution({
    id: 3, kind: "overheat", rolls: [], summary: "Reaver vents 3 heat", effects: [],
  });
  expect(await screen.findByText("Reaver vents 3 heat")).toBeInTheDocument();
  expect(screen.queryAllByTestId("v2-roll-step")).toHaveLength(0);
});

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

test("a settled wound die says WOUND!/NO WOUND — not the to-hit vocabulary", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await ref.current!.playResolution({
    id: 1, kind: "attack",
    rolls: [
      { sides: 6, value: 4, label: "hit 1", tone: "ok" },
      { sides: 10, value: 8, label: "wound 1", tone: "ok" },
      { sides: 10, value: 2, label: "wound 2", tone: "miss" },
    ],
    summary: "A1 → B1: 1 wound",
    effects: [],
  });
  expect(await screen.findByText("WOUND!")).toBeInTheDocument();
  expect(await screen.findByText("NO WOUND")).toBeInTheDocument();
  // The d6 keeps to-hit vocabulary; the d10s must not borrow it.
  expect(screen.queryAllByText("HIT!")).toHaveLength(1);
});

// A rolling die's face is written by the flicker interval straight to the DOM
// (el.textContent), which React knows nothing about. If React ALSO rendered a
// random face, its vdom would hold a face it does not control — and when the die
// settles, React diffs its own previous text against the real value and skips the
// DOM write whenever they happen to match, stranding the flicker's last face on
// screen. That shows the player a number the engine never rolled: the panel
// lying about the dice, which is the whole class of bug this console exists to
// avoid. React must own "" while rolling, so a collision is impossible.
test("a rolling die's face is owned by the flicker, never rendered by React", () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  act(() => {
    void ref.current!.playResolution({
      id: 1, kind: "attack", rolls: [{ sides: 6, value: 4, label: "hit 1" }],
      summary: "", effects: [],
    } as Resolution);
  });
  // The interval has not ticked yet, so whatever is on screen came from React.
  expect(document.querySelector(".v2-die")?.textContent).toBe("");
});

// The behavioural half of the same guarantee. `playResolution` resolves once every
// die has settled, so awaiting it needs no timer driving. (Fake timers do NOT work
// here: the settle check reads performance.now(), which vi.useFakeTimers() leaves
// real, so elapsed never reaches the settle threshold and no die ever lands.)
test("a settled die shows the value the engine rolled, not a stale flicker face", async () => {
  const ref = createRef<RollConsoleHandle>();
  render(<RollConsole ref={ref} />);
  await act(async () => {
    await ref.current!.playResolution({
      id: 1, kind: "attack", rolls: [{ sides: 6, value: 4, label: "hit 1" }],
      summary: "", effects: [],
    } as Resolution);
  });
  expect(document.querySelector(".v2-die")?.textContent).toBe("4");
});
