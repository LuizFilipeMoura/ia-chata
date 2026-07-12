import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { LoadoutView } from "./LoadoutView";
import { buildLoadout } from "../../lib/loadout";
import type { Rig } from "../../state/types";

const base = (over: Partial<Rig>): Rig => ({
  id: 1, name: "STALKER", owner: "a", weightClass: "medium",
  hull: { sp: 7, max: 7, destroyed: false },
  arms: { sp: 6, max: 6, destroyed: false },
  legs: { sp: 6, max: 6, destroyed: false },
  engine: { sp: 5, max: 5, destroyed: false, heat: 0 },
  equipment: null, activated: false, destroyed: false, ...over,
});

test("shows weapon names, base stats, upgrade delta and equipment", () => {
  const rig = base({
    weapons: { longRange: "Autocannon", melee: "Claw" },
    weaponUpgrades: { longRange: "depleted-core", melee: "vice-grip" },
    equipment: "ablative-plating",
  });
  render(<LoadoutView loadout={buildLoadout(rig)!} />);
  expect(screen.getByText("Autocannon")).toBeInTheDocument();
  expect(screen.getByText("Claw")).toBeInTheDocument();
  expect(screen.getByText("+2")).toBeInTheDocument();                  // STR delta mark
  expect(screen.getByText(/Depleted Core/)).toBeInTheDocument();       // upgrade name
  expect(screen.getByText(/Ablative Plating/)).toBeInTheDocument();
  expect(screen.getByText(/\+1 max SP to Hull/)).toBeInTheDocument();  // passive
  expect(screen.getByText(/Harden/)).toBeInTheDocument();              // active
});

test("flat-pick weapon: one block, no upgrade line, no equipment", () => {
  const tank = base({ kind: "tank", weapons: { unit: "Tank Cannon" }, equipment: null });
  render(<LoadoutView loadout={buildLoadout(tank)!} />);
  expect(screen.getByText("Tank Cannon")).toBeInTheDocument();
  expect(screen.queryByText(/⬡/)).not.toBeInTheDocument();      // no upgrade line
  expect(screen.queryByText(/Passive —/)).not.toBeInTheDocument(); // no equipment
});

test("support unit: module chips render and the sidearm is tagged", () => {
  const walker = base({
    kind: "walker",
    weapons: { unit: "Sidearm" },
    modules: ["repair", "recon"],
    equipment: null,
  });
  render(<LoadoutView loadout={buildLoadout(walker)!} />);
  expect(screen.getByText(/repair/i)).toBeInTheDocument();
  expect(screen.getByText(/recon/i)).toBeInTheDocument();
  expect(screen.getByText(/\(Sidearm\)/i)).toBeInTheDocument();
});
