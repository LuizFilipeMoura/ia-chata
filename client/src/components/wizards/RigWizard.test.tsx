import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { RigWizard } from "./RigWizard";
import { GlossaryTipProvider } from "../../state/GlossaryTipContext";
import { UiProvider } from "../../state/UiStateContext";

// Replaces the old public/ui-static.test.js source-string assertions with a real
// render test of the commission wizard's invariants.
const { sendCommand } = vi.hoisted(() => ({ sendCommand: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));
vi.mock("../../state/RoomStateContext", () => ({
  useRoomState: () => ({ rigs: [], game: null, session: { room: "R", side: "a", name: "x" } }),
}));

beforeEach(() => sendCommand.mockClear());

// Flow is now Kind -> Weapons -> Equipment -> Confirm (the manual name/side step
// is gone; rigs take their chassis codename). Rig is preselected on the Kind
// step, so one Next reaches the Weapons (chassis + upgrade-path) view.
async function advanceToWeapons(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Next" }));
}

function renderWizard() {
  render(
    <UiProvider>
      <GlossaryTipProvider>
        <RigWizard onClose={() => {}} />
      </GlossaryTipProvider>
    </UiProvider>,
  );
}

test("only light and medium chassis are offered", async () => {
  const user = userEvent.setup();
  renderWizard();
  await advanceToWeapons(user);
  expect(screen.getAllByText("light").length).toBeGreaterThan(0);
  expect(screen.getAllByText("medium").length).toBeGreaterThan(0);
  expect(screen.queryByText("heavy")).toBeNull();
  expect(screen.queryByText("colossal")).toBeNull();
});

test("Weapons step shows an SP preview with heat cap for each chassis", async () => {
  const user = userEvent.setup();
  renderWizard();
  await advanceToWeapons(user);
  expect(screen.getAllByText(/heat cap/i).length).toBeGreaterThan(0);
});

test("weapons step badges each upgrade with its nature", async () => {
  const user = userEvent.setup();
  renderWizard();
  await advanceToWeapons(user);
  // Default chassis light-claw-autocannon: Autocannon has a Field (Depleted Core)
  // and a Prototype (Penetrator Rounds); their dieselpunk stamps must render.
  expect(screen.getAllByText("Standard").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Prototype").length).toBeGreaterThan(0);
});

test("the default chassis shows its dieselpunk codename", async () => {
  const user = userEvent.setup();
  renderWizard();
  await advanceToWeapons(user);
  // light-claw-autocannon is named "Gold".
  expect(screen.getAllByText("Gold").length).toBeGreaterThan(0);
});

test("selecting a Prototype on one weapon disables Prototype on the other", async () => {
  const user = userEvent.setup();
  renderWizard();
  await advanceToWeapons(user);
  // Pick the long-range Prototype (Penetrator Rounds).
  await user.click(screen.getByRole("button", { name: /Penetrator Rounds/ }));
  // The melee Prototype (Breach Grip) button must now be disabled.
  const breach = screen.getByRole("button", { name: /Breach Grip/ });
  expect(breach).toBeDisabled();
});

test("commissioning posts an add command with the chassis codename and fixed loadout", async () => {
  const user = userEvent.setup();
  renderWizard();
  // Kind -> Weapons -> Equipment -> Confirm, then Commission.
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Commission" }));
  // Default chassis is the first entry: light Claw · Autocannon, codename Gold.
  expect(sendCommand).toHaveBeenCalledWith(
    "add",
    expect.objectContaining({
      name: "Gold", class: "light", owner: "a",
      chassis: "light-claw-autocannon", lr: "Autocannon", melee: "Claw",
    }),
  );
});
