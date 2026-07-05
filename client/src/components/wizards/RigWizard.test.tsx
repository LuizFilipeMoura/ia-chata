import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { RigWizard } from "./RigWizard";
import { GlossaryTipProvider } from "../../state/GlossaryTipContext";

// Replaces the old public/ui-static.test.js source-string assertions with a real
// render test of the commission wizard's invariants.
const { sendCommand } = vi.hoisted(() => ({ sendCommand: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));
vi.mock("../../state/RoomStateContext", () => ({
  useRoomState: () => ({ rigs: [], game: null, session: { room: "R", side: "a", name: "x" } }),
}));

beforeEach(() => sendCommand.mockClear());

test("owner selector offers You and Enemy", () => {
  render(
    <GlossaryTipProvider>
      <RigWizard onClose={() => {}} />
    </GlossaryTipProvider>,
  );
  expect(screen.getByRole("option", { name: "You" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Enemy" })).toBeInTheDocument();
});

test("only light and medium rig classes are offered", () => {
  render(
    <GlossaryTipProvider>
      <RigWizard onClose={() => {}} />
    </GlossaryTipProvider>,
  );
  expect(screen.getByRole("option", { name: "light" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "medium" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "heavy" })).toBeNull();
  expect(screen.queryByRole("option", { name: "colossal" })).toBeNull();
});

test("Identity step shows an SP preview for the selected weight class", () => {
  render(
    <GlossaryTipProvider>
      <RigWizard onClose={() => {}} />
    </GlossaryTipProvider>,
  );
  expect(screen.getByText(/heat cap/i)).toBeInTheDocument();
});

test("commissioning posts an add command carrying the chosen owner", async () => {
  const user = userEvent.setup();
  render(
    <GlossaryTipProvider>
      <RigWizard onClose={() => {}} />
    </GlossaryTipProvider>,
  );
  await user.type(screen.getByPlaceholderText("Rig name"), "Vulcan");
  // Identity -> Weapons -> Equipment -> Confirm
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Commission" }));
  expect(sendCommand).toHaveBeenCalledWith(
    "add",
    expect.objectContaining({ name: "Vulcan", class: "medium", owner: "a" }),
  );
});
