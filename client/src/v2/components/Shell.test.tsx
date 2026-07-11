import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { Shell } from "./Shell";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

function Seed({ state }: { state: ServerState }) {
  const dispatch = useRoomDispatch();
  useEffect(() => {
    dispatch({ type: "setSession", session: { room: "IRON-42", side: "a", name: "Kostov" } });
    dispatch({ type: "applyServerState", state });
  }, [dispatch, state]);
  return null;
}

const baseState: ServerState = {
  version: 1, rigs: [], ownerSide: "a", field: null,
  game: { round: 1, phase: "setup", started: false, sides: [], canUndo: false },
};

test("shows the room code and only the Yard channel active", async () => {
  render(<AppProviders><Seed state={baseState} /><Shell channel="yard"><div /></Shell></AppProviders>);
  expect(await screen.findByText(/IRON-42/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Yard/i })).toBeEnabled();
  expect(screen.getByRole("button", { name: /Yard/i })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: /Forge/i })).toBeEnabled();
  expect(screen.getByRole("button", { name: /Rules/i })).toBeDisabled();
});

test("Leave opens a confirm dialog and wipes the session", async () => {
  const user = userEvent.setup();
  const clear = vi.spyOn(Storage.prototype, "clear");
  render(<AppProviders><Seed state={baseState} /><Shell channel="yard"><div /></Shell></AppProviders>);
  await user.click(await screen.findByRole("button", { name: /Leave/i }));
  await user.click(await screen.findByRole("button", { name: /Erase and leave/i }));
  expect(clear).toHaveBeenCalled();
});

test("Revert is hidden unless the server allows undo", async () => {
  render(<AppProviders><Seed state={baseState} /><Shell channel="yard"><div /></Shell></AppProviders>);
  await screen.findByText(/IRON-42/);
  expect(screen.queryByRole("button", { name: /Revert/i })).toBeNull();
});
