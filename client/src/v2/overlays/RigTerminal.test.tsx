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

test("renders header and four component rows", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started={false} mine myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.getByRole("heading", { name: "STALKER" })).toBeInTheDocument();
  ["Hull", "Arms", "Legs", "Engine"].forEach((l) => expect(screen.getByText(l)).toBeInTheDocument());
});

test("my own rig shows a Remove control before the battle starts", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started={false} mine myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.getByRole("button", { name: /Remove/i })).toBeInTheDocument();
});

test("Remove issues the remove command and closes the terminal", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  const onClose = vi.fn();
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started={false} mine myTurn={false} onCommand={onCommand} onClose={onClose} />
    </V2Providers>,
  );
  await user.click(screen.getByRole("button", { name: /Remove/i }));
  expect(onCommand).toHaveBeenCalledWith("remove", { name: "STALKER" });
  expect(onClose).toHaveBeenCalled();
});

test("pre-battle own rig shows Edit loadout and calls onEdit with the rig id", async () => {
  const user = userEvent.setup();
  const onEdit = vi.fn();
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started={false} mine myTurn={false}
        onCommand={vi.fn()} onEdit={onEdit} onClose={vi.fn()} />
    </V2Providers>,
  );
  await user.click(screen.getByRole("button", { name: /Edit loadout/i }));
  expect(onEdit).toHaveBeenCalledWith(1);
});

test("no Remove control once the battle has started", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
});

test("no Remove control on an enemy rig", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started={false} mine={false} myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
});

test("Escape closes the overlay", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started={false} mine myTurn={false} onCommand={vi.fn()} onClose={onClose} />
    </V2Providers>,
  );
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});

test("no activation control before battle starts", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started={false} mine myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.queryByRole("button", { name: /Activate|Wait for your turn/i })).not.toBeInTheDocument();
});

test("shows the Activate CTA when it's my turn and this rig can activate", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate started mine myTurn onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.getByRole("button", { name: /Activate Rig/i })).toBeEnabled();
});

test("never shows 'Wait for your turn' on my own turn", () => {
  // My turn, but this rig can't activate right now (e.g. another rig is mid-turn).
  // The old code fell through to a disabled "Wait for your turn" — a lie on my turn.
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine myTurn onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.queryByText(/Wait for your turn/i)).not.toBeInTheDocument();
});

test("wait label only when it is NOT my turn", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.getByRole("button", { name: /Wait for your turn/i })).toBeDisabled();
});

test("shows a done chip, not a wait CTA, for an already-activated rig", () => {
  render(
    <V2Providers>
      <RigTerminal rig={{ ...rig, activated: true }} canActivate={false} started mine myTurn
        onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.getByText(/Activated this round/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Wait for your turn/i })).not.toBeInTheDocument();
});

test("no activation control for an enemy rig", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine={false} myTurn={false}
        onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.queryByRole("button", { name: /Activate|Wait for your turn/i })).not.toBeInTheDocument();
});

test("defaults to the Status view with component rows visible", () => {
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  expect(screen.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Hull")).toBeInTheDocument();
});

test("Loadout tab swaps in the loadout card; Status restores the rows", async () => {
  const user = userEvent.setup();
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  await user.click(screen.getByRole("tab", { name: "Loadout" }));
  expect(screen.getByText("Autocannon")).toBeInTheDocument();
  expect(screen.queryByText("Hull")).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Status" }));
  expect(screen.getByText("Hull")).toBeInTheDocument();
});

test("enemy rig still exposes the Loadout tab", async () => {
  const user = userEvent.setup();
  render(
    <V2Providers>
      <RigTerminal rig={rig} canActivate={false} started mine={false} myTurn={false} onCommand={vi.fn()} onClose={vi.fn()} />
    </V2Providers>,
  );
  await user.click(screen.getByRole("tab", { name: "Loadout" }));
  expect(screen.getByText("Autocannon")).toBeInTheDocument();
});
