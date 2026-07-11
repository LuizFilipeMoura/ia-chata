import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { V2DrawerProvider } from "../state/V2DrawerContext";
import { V2RollProvider } from "../state/V2RollContext";
import { V2BattleActionsProvider } from "../state/V2BattleActionsContext";
import { V2WizardProvider } from "../state/V2WizardContext";
import { useRoomDispatch } from "../../state/RoomStateContext";
import { ViewSideContext } from "../../state/ViewSideContext";
import type { Rig, ServerState } from "../../state/types";
import { useV2BattleWatchers } from "./useV2BattleWatchers";
import { playDamage, playEngineStart, startEngineLoop, stopEngineLoop } from "../audio/actionAudio";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

vi.mock("../audio/actionAudio", () => ({
  playDamage: vi.fn(), playHeat: vi.fn(), playEngineStart: vi.fn(), startEngineLoop: vi.fn(), stopEngineLoop: vi.fn(),
}));

const gameBase = {
  round: 1, phase: "activation", started: true,
  sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }],
  turn: { side: "b", activeRigId: 2, actionsUsed: 0, actionsMax: 3 },
};

const mk = (id: number, owner: "a" | "b"): Rig => ({ id, name: owner === "a" ? "MINE" + id : "FOE" + id, owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false }, legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 }, weapons: { longRange: "Autocannon", melee: "Claw" },
  equipment: "ablative-plating", activated: false, destroyed: false } as unknown as Rig);

function Harness({ state }: { state: ServerState }) {
  const d = useRoomDispatch(); useV2BattleWatchers();
  useEffect(() => { d({ type: "setSession", session: { room: "IR", side: "a", name: "K" } }); d({ type: "applyServerState", state }); }, [d, state]);
  return null;
}
function wrap(children: React.ReactNode) {
  return <AppProviders><V2DrawerProvider><V2RollProvider><V2BattleActionsProvider><V2WizardProvider>{children}</V2WizardProvider></V2BattleActionsProvider></V2RollProvider></V2DrawerProvider></AppProviders>;
}

test("opens the answer-token gate when the current side owes answer tokens", async () => {
  const state = { version: 1, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")],
    game: { round: 2, phase: "activation", started: true, sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }],
      turn: { side: "b", activeRigId: 2, actionsUsed: 0, actionsMax: 3 }, pendingAnswer: { side: "a", remaining: 2 } } } as unknown as ServerState;
  render(wrap(<Harness state={state} />));
  // The gate drawer title ported from V1 useBattleWatchers: "⟡ Answer Tokens — prepare a reaction".
  expect(await screen.findByText(/answer tokens/i)).toBeInTheDocument();
});

test("opens the gate for the impersonated side, not the session side", async () => {
  // Session joined as "a", but impersonating "b" (seed-room act-as-either-side).
  // The answer token belongs to "b"; the gate must follow the impersonated view.
  const state = { version: 1, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")],
    game: { round: 2, phase: "activation", started: true, sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }],
      turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 3 }, pendingAnswer: { side: "b", remaining: 1 } } } as unknown as ServerState;
  render(wrap(<ViewSideContext.Provider value="b"><Harness state={state} /></ViewSideContext.Provider>));
  expect(await screen.findByText(/answer tokens/i)).toBeInTheDocument();
});

test("plays damage sfx when a rig's total SP drops", async () => {
  vi.mocked(playDamage).mockClear();
  const full = { version: 1, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")], game: gameBase } as unknown as ServerState;
  const hurtRig = { ...mk(1, "a"), hull: { sp: 3, max: 6, destroyed: false } } as unknown as Rig;
  const hurt = { version: 2, ownerSide: "a", field: null, rigs: [hurtRig, mk(2, "b")], game: gameBase } as unknown as ServerState;
  const { rerender } = render(wrap(<Harness state={full} />));
  await waitFor(() => expect(vi.mocked(playDamage)).not.toHaveBeenCalled());
  rerender(wrap(<Harness state={hurt} />));
  await waitFor(() => expect(vi.mocked(playDamage)).toHaveBeenCalledTimes(1));
});

test("starts engine loop on your turn, stops on opponent turn", async () => {
  vi.mocked(startEngineLoop).mockClear();
  vi.mocked(stopEngineLoop).mockClear();
  const mine = { version: 10, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")],
    game: { ...gameBase, turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 3 } } } as unknown as ServerState;
  const foe = { version: 11, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")],
    game: { ...gameBase, turn: { side: "b", activeRigId: 2, actionsUsed: 0, actionsMax: 3 } } } as unknown as ServerState;
  const { rerender } = render(wrap(<Harness state={mine} />));
  await waitFor(() => expect(vi.mocked(startEngineLoop)).toHaveBeenCalled());
  rerender(wrap(<Harness state={foe} />));
  await waitFor(() => expect(vi.mocked(stopEngineLoop)).toHaveBeenCalled());
});

test("fires engine start when one of your rigs activates (not merely on turn start)", async () => {
  const noActive = { version: 30, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")],
    game: { ...gameBase, turn: { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 3 } } } as unknown as ServerState;
  const rigActive = { version: 31, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")],
    game: { ...gameBase, turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 3 } } } as unknown as ServerState;
  const { rerender } = render(wrap(<Harness state={noActive} />));
  await waitFor(() => expect(vi.mocked(startEngineLoop)).toHaveBeenCalled());
  vi.mocked(playEngineStart).mockClear(); // ignore any hydration-render call
  rerender(wrap(<Harness state={rigActive} />));
  await waitFor(() => expect(vi.mocked(playEngineStart)).toHaveBeenCalled());
});
