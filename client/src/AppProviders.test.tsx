import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AppProviders } from "./AppProviders";
import { useWizard } from "./state/WizardContext";
import { useRoomState, useRoomDispatch } from "./state/RoomStateContext";
import type { AttackMode } from "./components/wizards/AttackWizard";
import type { Rig, ServerState } from "./state/types";

// The commission wizard is rendered by WizardProvider through a portal and shows
// glossary terms. It must find GlossaryTipProvider as an ancestor — a regression
// here previously crashed the whole app with "useGlossaryTip outside
// GlossaryTipProvider".
vi.mock("./hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

function OpenCommission() {
  const { openCommission } = useWizard();
  return (
    <button type="button" onClick={openCommission}>
      open
    </button>
  );
}

test("opening the commission wizard resolves the glossary context", async () => {
  const user = userEvent.setup();
  render(
    <AppProviders>
      <OpenCommission />
    </AppProviders>,
  );
  await user.click(screen.getByText("open"));
  // The Weapons step renders GlossaryText inside its upgrade choices — advancing
  // to it is what previously crashed with "useGlossaryTip outside provider".
  // Rig flow is Kind -> Weapons (Rig is preselected on the Kind step).
  await user.click(screen.getByRole("button", { name: "Next" }));
  // Weapons step reached (each chassis card shows a heat-cap SP preview).
  expect(screen.getAllByText(/heat cap/i).length).toBeGreaterThan(0);
});

// The AttackWizard is also portalled by WizardProvider, and it calls
// useBattleActions(). So BattleActionsProvider must sit ABOVE WizardProvider —
// a portal reads context from where it is created in the tree. A regression here
// previously threw "useBattleActions outside BattleActionsProvider" the moment
// Fire/Aimed/Ram was pressed, so no attack drawer ever appeared.
const rig = (id: number, name: string, owner: "a" | "b"): Rig => ({
  id, name, owner, weightClass: "medium",
  hull: { sp: 7, max: 7, destroyed: false },
  arms: { sp: 6, max: 6, destroyed: false },
  legs: { sp: 6, max: 6, destroyed: false },
  engine: { sp: 5, max: 5, destroyed: false, heat: 0 },
  weapons: { longRange: "Mini Gun", melee: "Sword" },
  weaponUpgrades: { longRange: "extended-belt", melee: "duelist-balance" },
  equipment: null, activated: false, destroyed: false,
});

function OpenAttack({ mode }: { mode: AttackMode }) {
  const dispatch = useRoomDispatch();
  const { rigs } = useRoomState();
  const { openAttack } = useWizard();
  useEffect(() => {
    const state: ServerState = {
      version: 1, ownerSide: "a", field: null,
      rigs: [rig(1, "Aegis", "a"), rig(2, "Drake", "b")],
      game: { round: 1, phase: "activation", started: true,
        sides: [
          { id: "a", name: "You", vp: 0, ready: true },
          { id: "b", name: "Foe", vp: 0, ready: true },
        ],
        turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 3 } },
    };
    dispatch({ type: "applyServerState", state });
  }, [dispatch]);
  const mine = rigs.find((r) => r.name === "Aegis");
  return (
    <button type="button" disabled={!mine} onClick={() => mine && openAttack(mine, mode)}>
      attack
    </button>
  );
}

test("opening the attack wizard resolves the battle-actions context", async () => {
  const user = userEvent.setup();
  render(
    <AppProviders>
      <OpenAttack mode="fire" />
    </AppProviders>,
  );
  await user.click(await screen.findByRole("button", { name: "attack" }));
  // The wizard mounts through WizardProvider's portal and immediately calls
  // useBattleActions — reaching its title proves the provider order is right.
  expect(await screen.findByText(/Fire Weapon/)).toBeInTheDocument();
});
