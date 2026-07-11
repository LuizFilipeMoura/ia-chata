import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { V2DrawerProvider } from "../state/V2DrawerContext";
import { V2RollProvider } from "../state/V2RollContext";
import { V2BattleActionsProvider } from "../state/V2BattleActionsContext";
import { V2WizardProvider } from "../state/V2WizardContext";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { useV2BattleWatchers } from "./useV2BattleWatchers";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

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
