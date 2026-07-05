import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RigItem } from "./RigItem";
import { GlossaryTipProvider } from "../../state/GlossaryTipContext";
import type { Rig } from "../../state/types";

const rig: Rig = {
  id: 1, name: "Stalker", weightClass: "medium", owner: "a",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false },
  legs: { sp: 5, max: 5, destroyed: false }, engine: { sp: 5, max: 5, destroyed: false, heat: 0 },
  weapons: { longRange: "Autocannon", melee: "Fist" },
  weaponUpgrades: { longRange: "", melee: "" }, equipment: null, activated: false, destroyed: false,
};

test("damage button issues a damage command", async () => {
  const onCommand = vi.fn();
  render(
    <GlossaryTipProvider>
      <RigItem rig={rig} isActive={false} isOpen started={false}
        canActivateNow={false} onCommand={onCommand} onToggle={() => {}} onActivateLocal={() => {}} />
    </GlossaryTipProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: /Damage hull/i }));
  expect(onCommand).toHaveBeenCalledWith("damage", { name: "Stalker", loc: "hull", amount: "1" });
});

test("renders the Loadout panel with weapon names", () => {
  const onCommand = vi.fn();
  render(
    <GlossaryTipProvider>
      <RigItem rig={rig} isActive={false} isOpen started={false}
        canActivateNow={false} onCommand={onCommand} onToggle={() => {}} onActivateLocal={() => {}} />
    </GlossaryTipProvider>,
  );
  expect(screen.getByText("Loadout")).toBeInTheDocument();
  expect(screen.getByText("Autocannon")).toBeInTheDocument();
  expect(screen.getByText("Fist")).toBeInTheDocument();
});
