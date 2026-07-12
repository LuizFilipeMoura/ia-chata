import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { Squadron } from "./Squadron";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

const rig = (id: number, name: string, owner: "a" | "b"): Rig => ({
  id, name, owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  weapons: { longRange: "Autocannon", melee: "Claw" },
  equipment: "ablative-plating", activated: false, destroyed: false,
});

function Seed({ state }: { state: ServerState }) {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON-42", side: "a", name: "Kostov" } });
    dispatch({ type: "applyServerState", state });
  }, [dispatch, state]);
  return null;
}

test("groups own vs hostile rigs and shows the commissioned count", async () => {
  const state: ServerState = {
    version: 1, ownerSide: "a", field: null,
    rigs: [rig(1, "STALKER", "a"), rig(2, "CINDER", "a"), rig(3, "GRAVELORD", "b")],
    game: { round: 1, phase: "setup", started: false, sides: [
      { id: "a", name: "Kostov", vp: 0, ready: false },
      { id: "b", name: "Rival", vp: 0, ready: false },
    ] },
  };
  render(<V2Providers><Seed state={state} /><Squadron onOpenRig={vi.fn()} onCommission={vi.fn()} /></V2Providers>);
  expect(await screen.findByText("YOUR SQUADRON")).toBeInTheDocument();
  expect(screen.getByText("HOSTILE FORCES")).toBeInTheDocument();
  expect(screen.getByText(/2 COMMISSIONED · 1 extra Light Rig/i)).toBeInTheDocument();
});

test("flags the active rig during the activation phase", async () => {
  const state: ServerState = {
    version: 1, ownerSide: "a", field: null,
    rigs: [rig(1, "STALKER", "a"), rig(2, "CINDER", "a"), rig(3, "GRAVELORD", "b")],
    game: { round: 1, phase: "activation", started: true,
      turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 3 },
      sides: [
        { id: "a", name: "Kostov", vp: 0, ready: false },
        { id: "b", name: "Rival", vp: 0, ready: false },
      ] },
  };
  render(<V2Providers><Seed state={state} /><Squadron onOpenRig={vi.fn()} onCommission={vi.fn()} /></V2Providers>);
  expect(await screen.findByText("ACTIVATING")).toBeInTheDocument();
});
