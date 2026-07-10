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

// Task 19 added a leading Kind step. Rig is preselected there, so every Rig
// assertion below first advances past it to reach the old Identity view.
async function advanceToIdentity(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Next" }));
}

test("owner selector offers You and Enemy", async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <GlossaryTipProvider>
        <RigWizard onClose={() => {}} />
      </GlossaryTipProvider>
    </UiProvider>,
  );
  await advanceToIdentity(user);
  expect(screen.getByRole("option", { name: "You" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Enemy" })).toBeInTheDocument();
});

// Weapons step now offers only prebuilt chassis (fixed weight class + weapons);
// weight class is no longer a free select. Reach it with a second Next.
async function advanceToWeapons(user: ReturnType<typeof userEvent.setup>) {
  await advanceToIdentity(user);
  // Next is gated on a non-empty name at the Identity step.
  await user.type(screen.getByPlaceholderText("Rig name"), "Vulcan");
  await user.click(screen.getByRole("button", { name: "Next" }));
}

test("only light and medium prebuilt chassis are offered", async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <GlossaryTipProvider>
        <RigWizard onClose={() => {}} />
      </GlossaryTipProvider>
    </UiProvider>,
  );
  await advanceToWeapons(user);
  expect(screen.getAllByText("light").length).toBeGreaterThan(0);
  expect(screen.getAllByText("medium").length).toBeGreaterThan(0);
  expect(screen.queryByText("heavy")).toBeNull();
  expect(screen.queryByText("colossal")).toBeNull();
});

test("Weapons step shows an SP preview with heat cap for each prebuilt", async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <GlossaryTipProvider>
        <RigWizard onClose={() => {}} />
      </GlossaryTipProvider>
    </UiProvider>,
  );
  await advanceToWeapons(user);
  expect(screen.getAllByText(/heat cap/i).length).toBeGreaterThan(0);
});

test("weapons step badges each upgrade with its nature", async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <GlossaryTipProvider>
        <RigWizard onClose={() => {}} />
      </GlossaryTipProvider>
    </UiProvider>,
  );
  await advanceToWeapons(user);
  // Default prebuilt light-claw-autocannon: Autocannon has a Field (Depleted Core)
  // and a Prototype (Penetrator Rounds); their badges must render.
  expect(screen.getAllByText("Field").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Prototype").length).toBeGreaterThan(0);
});

test("selecting a Prototype on one weapon disables Prototype on the other", async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <GlossaryTipProvider>
        <RigWizard onClose={() => {}} />
      </GlossaryTipProvider>
    </UiProvider>,
  );
  await advanceToWeapons(user);
  // Pick the long-range Prototype (Penetrator Rounds).
  await user.click(screen.getByRole("button", { name: /Penetrator Rounds/ }));
  // The melee Prototype (Breach Grip) button must now be disabled.
  const breach = screen.getByRole("button", { name: /Breach Grip/ });
  expect(breach).toBeDisabled();
});

test("commissioning posts an add command with the prebuilt's fixed class and weapons", async () => {
  const user = userEvent.setup();
  render(
    <UiProvider>
      <GlossaryTipProvider>
        <RigWizard onClose={() => {}} />
      </GlossaryTipProvider>
    </UiProvider>,
  );
  await advanceToIdentity(user);
  await user.type(screen.getByPlaceholderText("Rig name"), "Vulcan");
  // Identity -> Weapons -> Equipment -> Confirm
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Commission" }));
  // Default prebuilt is the first entry: light Claw · Autocannon.
  expect(sendCommand).toHaveBeenCalledWith(
    "add",
    expect.objectContaining({
      name: "Vulcan", class: "light", owner: "a",
      prebuilt: "light-claw-autocannon", lr: "Autocannon", melee: "Claw",
    }),
  );
});
