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

test("arming a move, dragging a reachable destination, and confirming dispatches action with dest+facing", async () => {
  render(<V2Providers><Seed state={digitalState(1)} /><BattleScreen /></V2Providers>);

  // Sprint is gone from the console; Move solos and arms the drag straight through.
  const moveBtn = await screen.findByRole("button", { name: /move/i });
  moveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const surface = await screen.findByTestId("field-surface");
  // The surface rect spans the field region exactly (≈ fw×fh = 468×312 for 54×36),
  // so a pointer fraction across it maps straight to field inches.
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 468, height: 312, right: 468, bottom: 312, x: 0, y: 0, toJSON() {} }) as DOMRect;

  // Grab the rig and drag ~2" east of its {10,10} start (inside the move ring).
  // clientX = 12/54*468 ≈ 104, clientY = 10/36*312 ≈ 87 → dest ≈ {12,10}.
  const handle = await screen.findByTestId("drag-handle");
  handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 104, clientY: 87 }));
  handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 104, clientY: 87 }));

  const confirm = await screen.findByRole("button", { name: /confirm/i });
  confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  const call = sendSpy.mock.calls.find((c) => c[0] === "action" && (c[1] as { action?: string })?.action);
  expect(call).toBeTruthy();
  expect(call![1]).toMatchObject({ name: "RED", action: "move" });
  const attrs = call![1] as { dest: { x: number; y: number }; facing: number };
  expect(attrs.dest.x).toBeCloseTo(12, 0);
  expect(attrs.dest.y).toBeCloseTo(10, 0);
  expect(typeof attrs.facing).toBe("number");
});
