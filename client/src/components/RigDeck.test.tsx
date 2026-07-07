import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../AppProviders";
import { useRoomDispatch } from "../state/RoomStateContext";
import { RigDeck } from "./RigDeck";
import type { Rig, ServerState } from "../state/types";

vi.mock("../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

const rig = (id: number, name: string, owner: "a" | "b"): Rig => ({
  id,
  name,
  owner,
  weightClass: "medium",
  hull: { sp: 8, max: 8, destroyed: false },
  arms: { sp: 6, max: 6, destroyed: false },
  legs: { sp: 6, max: 6, destroyed: false },
  engine: { sp: 5, max: 5, destroyed: false, heat: 0 },
  weapons: { longRange: "Mini Gun", melee: "Sword" },
  weaponUpgrades: { longRange: "extended-belt", melee: "duelist-balance" },
  equipment: "ablative-plating",
  activated: false,
  destroyed: false,
});

function SeedRoom({ state }: { state: ServerState }) {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "PLAY", side: "a", name: "Codex" } });
    dispatch({ type: "applyServerState", state });
  }, [dispatch, state]);
  return null;
}

test("disables activation while the opponent has pending answer tokens", async () => {
  const state: ServerState = {
    version: 1,
    rigs: [
      rig(1, "Aegis", "a"),
      rig(2, "Boreal", "a"),
      rig(3, "Cinder", "a"),
      rig(4, "Drake", "b"),
    ],
    ownerSide: "a",
    field: null,
    game: {
      round: 1,
      phase: "activation",
      started: true,
      sides: [
        { id: "a", name: "Codex", vp: 0, ready: true },
        { id: "b", name: "Rival", vp: 0, ready: true },
      ],
      turn: { side: "a", activeRigId: null, actionsUsed: 0, actionsMax: 0 },
      pendingAnswer: { side: "b", remaining: 2 },
    },
  };

  render(
    <AppProviders>
      <SeedRoom state={state} />
      <RigDeck />
    </AppProviders>,
  );

  // The Activate control now lives in each own Rig's body (out of the expand
  // target). With the opponent holding answer tokens, all three are disabled.
  const activateButtons = await screen.findAllByRole("button", { name: "Wait for your turn" });
  expect(activateButtons).toHaveLength(3);
  for (const button of activateButtons) {
    expect(button).toBeDisabled();
  }
});
