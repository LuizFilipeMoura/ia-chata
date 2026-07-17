import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { BattleScreen } from "./BattleScreen";

const sendSpy = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendSpy }));
beforeEach(() => sendSpy.mockClear());

function Seed({ state }: { state: ServerState }) {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON-42", side: "a", name: "K" } });
    dispatch({ type: "applyServerState", state });
  }, [dispatch, state]);
  return null;
}

const baseRig = (id: number, owner: "a" | "b", over = {}) => ({
  id, name: id === 1 ? "RED" : "GREY", owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 4, max: 4, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, pos: { x: 10 * id, y: 10 }, facing: 0, ...over,
});

function digitalState(turnActive: number | null): ServerState {
  return {
    version: 1, ownerSide: "a", mode: "digital",
    field: { width: 54, height: 36, diagonal: "tlbr", terrain: [], locked: true } as unknown as ServerState["field"],
    rigs: [baseRig(1, "a"), baseRig(2, "b")] as unknown as ServerState["rigs"],
    game: { round: 1, phase: "activation", started: true,
      turn: { side: "a", activeRigId: turnActive, actionsUsed: 0, actionsMax: 3 },
      sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }],
      priorityTargets: {} } as unknown as ServerState["game"],
  };
}

test("clicking your own idle rig on your turn activates it", async () => {
  render(<V2Providers><Seed state={digitalState(null)} /><BattleScreen /></V2Providers>);
  const tokens = await screen.findAllByTestId("rig-token");
  const mine = tokens.find((t) => t.getAttribute("data-mine") === "true")!;
  mine.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(sendSpy).toHaveBeenCalledWith("activate", { name: "RED" });
});

test("clicking an enemy rig does not activate", async () => {
  render(<V2Providers><Seed state={digitalState(null)} /><BattleScreen /></V2Providers>);
  const tokens = await screen.findAllByTestId("rig-token");
  const foe = tokens.find((t) => t.getAttribute("data-mine") === "false")!;
  foe.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(sendSpy).not.toHaveBeenCalledWith("activate", expect.anything());
});

test("does not activate when a rig is already active", async () => {
  render(<V2Providers><Seed state={digitalState(1)} /><BattleScreen /></V2Providers>);
  const tokens = await screen.findAllByTestId("rig-token");
  const mine = tokens.find((t) => t.getAttribute("data-mine") === "true")!;
  mine.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(sendSpy).not.toHaveBeenCalledWith("activate", { name: "RED" });
});
