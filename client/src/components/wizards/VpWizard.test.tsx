import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { VpWizard } from "./VpWizard";

const { sendCommand } = vi.hoisted(() => ({ sendCommand: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));
vi.mock("../../state/RoomStateContext", () => ({
  useRoomState: () => ({
    session: { room: "R", side: "a", name: "x" },
    game: {
      round: 2,
      objectives: [
        { x: 24, y: 16, vp: 2 },
        { x: 14, y: 9, vp: 1 },
        { x: 34, y: 23, vp: 1 },
      ],
      recoveryClaims: {},
      recoveryConflict: null,
    },
  }),
}));

beforeEach(() => sendCommand.mockClear());

test("offers all three markers and starts at 0 VP", () => {
  render(<VpWizard onClose={() => {}} />);
  expect(screen.getByText(/Centre/)).toBeInTheDocument();
  expect(screen.getAllByText(/Corner/)).toHaveLength(2);
  expect(screen.getByRole("button", { name: /Score 0 VP/ })).toBeInTheDocument();
});

test("tallies selected markers and submits their indices", async () => {
  const user = userEvent.setup();
  render(<VpWizard onClose={() => {}} />);
  await user.click(screen.getByText(/Centre/));
  const go = screen.getByRole("button", { name: /Score 2 VP/ });
  await user.click(go);
  expect(sendCommand).toHaveBeenCalledWith("vp", { side: "a", claims: [0] });
});
