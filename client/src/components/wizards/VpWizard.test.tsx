import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { VpWizard } from "./VpWizard";

// A mutable holder so each test can vary the room state before rendering.
const { sendCommand, state } = vi.hoisted(() => ({
  sendCommand: vi.fn(),
  state: { session: {} as unknown, game: {} as unknown },
}));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));
vi.mock("../../state/RoomStateContext", () => ({ useRoomState: () => state }));

beforeEach(() => {
  sendCommand.mockClear();
  state.session = { room: "R", side: "a", name: "x" };
  state.game = {
    round: 2,
    objectives: [
      { x: 24, y: 16, vp: 2 }, // centre
      { x: 14, y: 9, vp: 1 }, // corner
      { x: 34, y: 23, vp: 1 }, // corner
    ],
    recoveryClaims: {},
    recoveryConflict: null,
  };
});

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

test("prefills the selection from an already-submitted claim", () => {
  // Centre (2 VP) + one corner (1 VP) already claimed → starts at 3 VP.
  (state.game as { recoveryClaims: Record<string, number[]> }).recoveryClaims = { a: [0, 2] };
  render(<VpWizard onClose={() => {}} />);
  expect(screen.getByRole("button", { name: /Score 3 VP/ })).toBeInTheDocument();
});

test("toggling a prefilled marker off lowers the total", async () => {
  const user = userEvent.setup();
  (state.game as { recoveryClaims: Record<string, number[]> }).recoveryClaims = { a: [0] };
  render(<VpWizard onClose={() => {}} />);
  expect(screen.getByRole("button", { name: /Score 2 VP/ })).toBeInTheDocument();
  await user.click(screen.getByText(/Centre/));
  expect(screen.getByRole("button", { name: /Score 0 VP/ })).toBeInTheDocument();
});

test("flags a disputed marker so the player re-checks it", () => {
  const g = state.game as { recoveryClaims: Record<string, number[]>; recoveryConflict: number[] };
  g.recoveryClaims = { a: [0], b: [0] };
  g.recoveryConflict = [0];
  render(<VpWizard onClose={() => {}} />);
  expect(screen.getByText(/Both of you claimed this/)).toBeInTheDocument();
});
