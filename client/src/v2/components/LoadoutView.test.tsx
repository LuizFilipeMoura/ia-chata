import { render, screen } from "@testing-library/react";
import { expect, it, test } from "vitest";
import { LoadoutView } from "./LoadoutView";
import { buildLoadout } from "../../lib/loadout";
import type { Loadout } from "../../lib/loadout";
import type { Rig } from "../../state/types";
import { V2GlossaryTipProvider } from "../state/V2GlossaryTipContext";

function wrap(node: React.ReactNode) {
  return render(<V2GlossaryTipProvider>{node}</V2GlossaryTipProvider>);
}

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
  wrap(<LoadoutView loadout={buildLoadout(rig)!} />);
  expect(screen.getByText("Autocannon")).toBeInTheDocument();
  expect(screen.getByText("Claw")).toBeInTheDocument();
  expect(screen.getByText("+1")).toBeInTheDocument();                  // Penetration delta mark
  expect(screen.getByText(/Depleted Core/)).toBeInTheDocument();       // upgrade name
  expect(screen.getByText(/Ablative Plating/)).toBeInTheDocument();
  expect(screen.getByText(/\+1 max SP to Hull/)).toBeInTheDocument();  // passive
  expect(screen.getByText(/Harden/)).toBeInTheDocument();              // active
});

test("flat-pick weapon: one block, no upgrade line, no equipment", () => {
  const tank = base({ kind: "tank", weapons: { unit: "Tank Cannon" }, equipment: null });
  wrap(<LoadoutView loadout={buildLoadout(tank)!} />);
  expect(screen.getByText("Tank Cannon")).toBeInTheDocument();
  expect(screen.queryByText(/⬡/)).not.toBeInTheDocument();      // no upgrade line
  expect(screen.queryByText(/Passive —/)).not.toBeInTheDocument(); // no equipment
});

it("shows upgrade-aware active heat and an equipment-upgrade line", () => {
  const loadout = {
    flat: false, lr: null, melee: null, modules: [],
    equipment: {
      family: "Cooling", label: "Radiator Array", passive: "Cools 2 heat in Recovery instead of 1",
      activeLabel: "Purge", activeHeat: -3, activeText: "Vent heat on demand.",
      upName: "Twin Radiators", upNature: "field", upTag: "Purge vents −3, not −2",
    },
  } as unknown as Loadout;
  wrap(<LoadoutView loadout={loadout} />);
  expect(document.body.textContent).toContain("-3 heat");
  expect(document.body.textContent).toContain("Twin Radiators");
  expect(document.body.textContent).toContain("Purge vents −3");
});

test("support unit: module chips render and the sidearm is tagged", () => {
  const walker = base({
    kind: "walker",
    weapons: { unit: "Sidearm" },
    modules: ["repair", "recon"],
    equipment: null,
  });
  wrap(<LoadoutView loadout={buildLoadout(walker)!} />);
  expect(screen.getByText(/repair/i)).toBeInTheDocument();
  expect(screen.getByText(/recon/i)).toBeInTheDocument();
  expect(screen.getByText(/\(Sidearm\)/i)).toBeInTheDocument();
});
