import { useEffect } from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { AppProviders } from "../../AppProviders";
import { V2DrawerProvider } from "../state/V2DrawerContext";
import { V2RollProvider } from "../state/V2RollContext";
import { V2BattleActionsProvider } from "../state/V2BattleActionsContext";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import type { DiceSpec } from "./RollConsole";
import { AttackWizard } from "./AttackWizard";

const { sent } = vi.hoisted(() => ({ sent: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sent }));
vi.mock("../audio/actionAudio", () => ({ playAction: vi.fn() }));

// Manual-dice mode routes every roll through promptDice; stub the hook (not the
// provider, which the tree still mounts) so the specs the wizard asks for are
// inspectable and the entered faces are ours to choose.
const { rollApi } = vi.hoisted(() => ({
  rollApi: {
    promptDice: vi.fn(async () => ({}) as Record<string, number>),
    playResolution: vi.fn(async () => {}),
    closeRoll: vi.fn(),
  },
}));
vi.mock("../state/V2RollContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/V2RollContext")>()),
  useV2Roll: () => rollApi,
}));
const promptDiceSpy = rollApi.promptDice as unknown as {
  mock: { calls: [DiceSpec[], string?][] };
  mockClear: () => void;
  mockResolvedValue: (v: Record<string, number>) => void;
};

const mk = (id: number, owner: "a" | "b", over: Partial<Rig> = {}): Rig => ({ id, name: owner === "a" ? "MINE" : "FOE", owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false }, legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 }, weapons: { longRange: "Autocannon", melee: "Claw" },
  weaponUpgrades: { longRange: "field", melee: "field" }, equipment: "ablative-plating", activated: false, destroyed: false, loaded: { longRange: true, melee: true }, ...over } as unknown as Rig);

function Seed({ rigs, children, autoResolve }: { rigs: Rig[]; children: ReactNode; autoResolve?: boolean }) {
  const d = useRoomDispatch();
  useEffect(() => {
    d({ type: "setSession", session: { room: "IR", side: "a", name: "K" } });
    d({ type: "applyServerState", state: { version: 1, ownerSide: "a", field: null, rigs, game: { round: 1, phase: "activation", started: true, autoResolve, sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }], turn: { side: "a", activeRigId: rigs[0].id, actionsUsed: 0, actionsMax: 3 } } } as unknown as ServerState });
  }, [d, rigs, autoResolve]);
  return <>{children}</>;
}

// A ROF-3 ranged gun: three hit dice, so a surplus/short wound-dice bug shows up
// as a count mismatch rather than an off-by-one that reads as correct.
const MORTAR: Partial<Rig> = { weapons: { longRange: "Mortar", melee: "Claw" } } as Partial<Rig>;

// Faces for a ROF-3 manual volley: hit dice 1/6/6 (die 0 MISSES, dice 1-2 land),
// so the engine wants wounds[0] and wounds[1] — the first two wound dice, not
// the 2nd and 3rd. The asymmetry is the point: it catches a wizard that pairs
// wound die i with hit die i.
const FACES: Record<string, number> = { h0: 1, h1: 6, h2: 6, loc: 3, w0: 10, w1: 1, w2: 5 };

const manual = (child: ReactNode, rigs: Rig[]) => (
  <AppProviders>
    <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
      <Seed rigs={rigs} autoResolve={false}>{child}</Seed>
    </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
  </AppProviders>
);

test("renders the fire control with an Open Fire / Fire button", async () => {
  const rigs = [mk(1, "a"), mk(2, "b")];
  render(
    <AppProviders>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
        <Seed rigs={rigs}>
          <AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />
        </Seed>
      </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </AppProviders>,
  );
  expect(await screen.findByRole("button", { name: /Fire/i })).toBeInTheDocument();
});

test("Aimed Shot toggle reveals the location field and fires an aimed action", async () => {
  sent.mockClear();
  const rigs = [mk(1, "a"), mk(2, "b")];
  render(
    <AppProviders>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
        <Seed rigs={rigs}>
          <AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />
        </Seed>
      </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </AppProviders>,
  );
  // Off by default: no Location field, CTA fires a straight shot.
  const aim = await screen.findByRole("switch", { name: /Aimed Shot/i });
  expect(aim).toHaveAttribute("aria-checked", "false");
  expect(screen.queryByText(/Component to hit/i)).not.toBeInTheDocument();
  // Toggle on: the Location field appears and the shot becomes aimed.
  fireEvent.click(aim);
  expect(await screen.findByText(/Component to hit/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Aimed Shot/i }));
  expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({ action: "aimed", loc: expect.any(String) }));
});

test("reopening recalls the last target and shot distance per rig", async () => {
  sent.mockClear();
  const rigs = [mk(1, "a"), mk(2, "b", { id: 2, name: "FOE" }), mk(3, "b", { id: 3, name: "FOE2" })];
  // `openKey` remounts only the wizard; the providers (and room state) persist,
  // so the reopen mirrors production where state exists before the drawer opens.
  const tree = (openKey: number) => (
    <AppProviders>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
        <Seed rigs={rigs}>
          <AttackWizard key={openKey} rig={rigs[0]} mode="fire" onClose={vi.fn()} />
        </Seed>
      </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </AppProviders>
  );
  const { rerender } = render(tree(1));

  // Aim at the second foe and measure 5" before firing.
  fireEvent.click(await screen.findByRole("button", { name: /FOE2/ }));
  fireEvent.change(screen.getByLabelText(/Distance to target/i), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: /^Fire$/ }));
  expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({ target: "FOE2", distance: 5 }));

  // Reopen: the drawer holds the same target and distance.
  rerender(tree(2));
  expect(await screen.findByRole("button", { name: /FOE2/ })).toHaveClass("is-sel");
  expect(screen.getByText(/^5"$/)).toBeInTheDocument();
});

test("spent long-range weapon is disabled and a Reload button appears", async () => {
  sent.mockClear();
  const rigs = [mk(1, "a", { loaded: { longRange: false, melee: true } }), mk(2, "b")];
  render(
    <AppProviders>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
        <Seed rigs={rigs}>
          <AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />
        </Seed>
      </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </AppProviders>,
  );
  expect(await screen.findByRole("button", { name: /Autocannon/i })).toBeDisabled();
  const reload = await screen.findByRole("button", { name: /⟳ Reload/ });
  reload.click();
  expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({ action: "reload" }));
});

test("spent with no melee makes the primary CTA a Reload", async () => {
  sent.mockClear();
  const rigs = [mk(1, "a", { weapons: { longRange: "Autocannon" }, loaded: { longRange: false, melee: true } }), mk(2, "b")];
  render(
    <AppProviders>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
        <Seed rigs={rigs}>
          <AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />
        </Seed>
      </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </AppProviders>,
  );
  const go = await screen.findByRole("button", { name: /⟳ Reload/ });
  go.click();
  expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({ action: "reload" }));
});

test("declares a threat 500ms after opening on an enemy", () => {
  sent.mockClear();
  vi.useFakeTimers();
  try {
    const rigs = [mk(1, "a"), mk(2, "b")];
    const harness = (child: ReactNode) => (
      <AppProviders>
        <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
          <Seed rigs={rigs}>{child}</Seed>
        </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
      </AppProviders>
    );
    // Prime room state first, then mount the wizard so it opens on a live enemy
    // (production always has room state before the drawer opens).
    const { rerender } = render(harness(null));
    rerender(harness(<AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />));
    act(() => { vi.advanceTimersByTime(500); });
    const declare = sent.mock.calls.find((c) => c[0] === "threat" && c[1]?.action === "declare");
    expect(declare).toBeTruthy();
    expect(declare![1].target).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

test("manual dice: prompts for a wound die per potential hit", async () => {
  sent.mockClear();
  promptDiceSpy.mockClear();
  promptDiceSpy.mockResolvedValue(FACES);
  const rigs = [mk(11, "a", MORTAR), mk(12, "b")];
  render(manual(<AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />, rigs));
  fireEvent.click(await screen.findByRole("button", { name: /^Fire$/ }));
  await waitFor(() => expect(promptDiceSpy.mock.calls.length).toBe(1));
  const specs = promptDiceSpy.mock.calls[0][0];
  expect(specs.filter((s) => s.sides === 6)).toHaveLength(3);  // hit dice
  expect(specs.filter((s) => s.sides === 12)).toHaveLength(1); // location
  expect(specs.filter((s) => s.sides === 10)).toHaveLength(3); // wound dice
});

test("manual dice: sends the entered wound dice, not undefined", async () => {
  sent.mockClear();
  promptDiceSpy.mockClear();
  promptDiceSpy.mockResolvedValue(FACES);
  const rigs = [mk(11, "a", MORTAR), mk(12, "b")];
  render(manual(<AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />, rigs));
  fireEvent.click(await screen.findByRole("button", { name: /^Fire$/ }));
  await waitFor(() => expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({
    dice: expect.objectContaining({ toHit: [1, 6, 6], location: 3, wounds: [10, 1, 5] }),
  })));
  // `impacts` was the dead key that let the server roll the wound dice unseen.
  const dice = sent.mock.calls.find((c) => c[0] === "action")![1].dice;
  expect(dice).not.toHaveProperty("impacts");
});

test("manual dice: wound-die labels name the landed hit they answer for, not a hit die", async () => {
  promptDiceSpy.mockClear();
  promptDiceSpy.mockResolvedValue(FACES);
  const rigs = [mk(11, "a", MORTAR), mk(12, "b")];
  render(manual(<AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />, rigs));
  fireEvent.click(await screen.findByRole("button", { name: /^Fire$/ }));
  await waitFor(() => expect(promptDiceSpy.mock.calls.length).toBe(1));
  const labels = promptDiceSpy.mock.calls[0][0].filter((s) => s.sides === 10).map((s) => s.label);
  // Wound dice are consumed in LANDED-hit order, so no wound die belongs to a
  // numbered hit die. A "Wound die N" label would claim a pairing that the
  // engine does not honour.
  expect(labels).toEqual([
    "Wound · 1st hit that lands",
    "Wound · 2nd hit that lands",
    "Wound · 3rd hit that lands",
  ]);
});

test("manual dice: an aimed shot drops the location die but keeps the wound dice", async () => {
  sent.mockClear();
  promptDiceSpy.mockClear();
  promptDiceSpy.mockResolvedValue(FACES);
  const rigs = [mk(11, "a", MORTAR), mk(12, "b")];
  render(manual(<AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />, rigs));
  fireEvent.click(await screen.findByRole("switch", { name: /Aimed Shot/i }));
  fireEvent.click(await screen.findByRole("button", { name: /^Aimed Shot$/ }));
  await waitFor(() => expect(promptDiceSpy.mock.calls.length).toBe(1));
  const specs = promptDiceSpy.mock.calls[0][0];
  expect(specs.filter((s) => s.sides === 12)).toHaveLength(0);
  expect(specs.filter((s) => s.sides === 10)).toHaveLength(3);
  await waitFor(() => expect(sent).toHaveBeenCalledWith("action", expect.objectContaining({
    action: "aimed",
    dice: expect.objectContaining({ wounds: [10, 1, 5] }),
  })));
});

test("manual dice: return fire prompts for and sends the wound dice too", async () => {
  sent.mockClear();
  promptDiceSpy.mockClear();
  promptDiceSpy.mockResolvedValue(FACES);
  const rigs = [mk(11, "a", MORTAR), mk(12, "b")];
  render(manual(<AttackWizard rig={rigs[0]} mode="fire" react target="FOE" onClose={vi.fn()} />, rigs));
  fireEvent.click(await screen.findByRole("button", { name: /^Fire$/ }));
  await waitFor(() => expect(promptDiceSpy.mock.calls.length).toBe(1));
  expect(promptDiceSpy.mock.calls[0][0].filter((s) => s.sides === 10)).toHaveLength(3);
  await waitFor(() => expect(sent).toHaveBeenCalledWith("react", expect.objectContaining({
    attack: expect.objectContaining({
      dice: expect.objectContaining({ toHit: [1, 6, 6], wounds: [10, 1, 5] }),
    }),
  })));
});

test("does not declare a threat in return-fire (react) mode", () => {
  sent.mockClear();
  vi.useFakeTimers();
  try {
    const rigs = [mk(1, "a"), mk(2, "b")];
    const harness = (child: ReactNode) => (
      <AppProviders>
        <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
          <Seed rigs={rigs}>{child}</Seed>
        </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
      </AppProviders>
    );
    const { rerender } = render(harness(null));
    rerender(harness(<AttackWizard rig={rigs[0]} mode="fire" react target="FOE" onClose={vi.fn()} />));
    act(() => { vi.advanceTimersByTime(500); });
    expect(sent.mock.calls.some((c) => c[0] === "threat")).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
