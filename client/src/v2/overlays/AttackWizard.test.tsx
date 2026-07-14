import { useEffect } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { AppProviders } from "../../AppProviders";
import { V2DrawerProvider } from "../state/V2DrawerContext";
import { V2RollProvider } from "../state/V2RollContext";
import { V2BattleActionsProvider } from "../state/V2BattleActionsContext";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { AttackWizard } from "./AttackWizard";

const { sent } = vi.hoisted(() => ({ sent: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sent }));
vi.mock("../audio/actionAudio", () => ({ playAction: vi.fn() }));

const mk = (id: number, owner: "a" | "b", over: Partial<Rig> = {}): Rig => ({ id, name: owner === "a" ? "MINE" : "FOE", owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false }, legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 }, weapons: { longRange: "Autocannon", melee: "Claw" },
  weaponUpgrades: { longRange: "field", melee: "field" }, equipment: "ablative-plating", activated: false, destroyed: false, loaded: { longRange: true, melee: true }, ...over } as unknown as Rig);

function Seed({ rigs, children }: { rigs: Rig[]; children: ReactNode }) {
  const d = useRoomDispatch();
  useEffect(() => {
    d({ type: "setSession", session: { room: "IR", side: "a", name: "K" } });
    d({ type: "applyServerState", state: { version: 1, ownerSide: "a", field: null, rigs, game: { round: 1, phase: "activation", started: true, sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }], turn: { side: "a", activeRigId: rigs[0].id, actionsUsed: 0, actionsMax: 3 } } } as unknown as ServerState });
  }, [d, rigs]);
  return <>{children}</>;
}

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
