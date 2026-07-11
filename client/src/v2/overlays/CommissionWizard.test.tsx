import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { useEffect } from "react";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { CommissionWizard } from "./CommissionWizard";

const sendCommand = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));

function Seed() {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON", side: "a", name: "K" } });
    dispatch({ type: "applyServerState", state: {
      version: 1, ownerSide: "a", field: null, rigs: [],
      game: { round: 1, phase: "setup", started: false, sides: [{ id: "a", name: "K", vp: 0, ready: false }] },
    } as ServerState });
  }, [dispatch]);
  return null;
}
function open() {
  render(<AppProviders><Seed /><CommissionWizard onClose={vi.fn()} /></AppProviders>);
}

test("rig flow has an Equipment step; tank flow does not", async () => {
  const user = userEvent.setup();
  open();
  expect(await screen.findByText("Equipment")).toBeInTheDocument();
  await user.click(screen.getByText("Tank"));
  expect(screen.queryByText("Equipment")).toBeNull();
});

test("commissioning a rig dispatches add with the rig field set", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  open();
  await user.click(await screen.findByRole("button", { name: /^Next$/i }));
  await user.click(await screen.findByRole("button", { name: /^Next$/i }));
  await user.click(await screen.findByRole("button", { name: /^Next$/i }));
  await user.click(await screen.findByRole("button", { name: /Commission/i }));
  expect(sendCommand).toHaveBeenCalledWith("add", expect.objectContaining({
    kind: "rig", chassis: expect.any(String), owner: "a",
    lr: expect.any(String), melee: expect.any(String), equipment: expect.any(String),
  }));
});
