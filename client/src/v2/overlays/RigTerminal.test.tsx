import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { RigTerminal } from "./RigTerminal";
import type { Rig } from "../../state/types";

const rig: Rig = {
  id: 1, name: "STALKER", owner: "a", weightClass: "light",
  hull: { sp: 4, max: 6, destroyed: false },
  arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 2, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 3 },
  weapons: { longRange: "Autocannon", melee: "Claw" },
  weaponUpgrades: { longRange: "machined", melee: "field" },
  equipment: "ablative-plating", activated: false, destroyed: false,
};

test("renders header, four component rows, and remove", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  render(<RigTerminal rig={rig} canActivate={false} started={false} onCommand={onCommand} onClose={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "STALKER" })).toBeInTheDocument();
  ["Hull", "Arms", "Legs", "Engine"].forEach((l) => expect(screen.getByText(l)).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Remove STALKER/i }));
  expect(onCommand).toHaveBeenCalledWith("remove", { name: "STALKER" });
});

test("Escape closes the overlay", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<RigTerminal rig={rig} canActivate={false} started={false} onCommand={vi.fn()} onClose={onClose} />);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});

test("activate CTA disabled with a wait label when not activatable in battle", () => {
  // `started` mounts the ActionConsole, which consumes room/battle contexts, so
  // this case renders under AppProviders (with no game state seeded the console
  // renders empty and doesn't affect the CTA assertion).
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.getByRole("button", { name: /Wait for your turn/i })).toBeDisabled();
});
