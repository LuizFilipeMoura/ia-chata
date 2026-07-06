import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AttackWizard } from "./AttackWizard";
import type { GameState, Rig } from "../../state/types";

const { state } = vi.hoisted(() => ({
  state: { rigs: [] as Rig[], game: null as GameState | null },
}));

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));
vi.mock("../../state/BattleActionsContext", () => ({
  useBattleActions: () => ({ sendReact: vi.fn() }),
}));
vi.mock("../../state/RollContext", () => ({
  useRoll: () => ({ promptDice: vi.fn() }),
}));
vi.mock("../../state/RoomStateContext", () => ({
  useRoomState: () => state,
}));
vi.mock("../../state/UiStateContext", () => ({
  useUi: () => ({ setGlossaryOpen: vi.fn() }),
}));

const component = (sp: number, max = sp) => ({ sp, max, destroyed: sp <= 0 });

function rig(over: Partial<Rig>): Rig {
  return {
    id: 1,
    name: "Vulcan",
    weightClass: "medium",
    owner: "a",
    hull: component(7),
    arms: component(6),
    legs: component(6),
    engine: { ...component(5), heat: 0 },
    weapons: { longRange: "Mini Gun", melee: "Sword" },
    weaponUpgrades: { longRange: "extended-belt", melee: "keen-edge" },
    equipment: null,
    loaded: { longRange: true, melee: true },
    activated: false,
    destroyed: false,
    ...over,
  };
}

beforeEach(() => {
  state.rigs = [rig({}), rig({ id: 2, name: "Raider", owner: "b" })];
  state.game = {
    round: 1,
    phase: "activation",
    started: true,
    autoResolve: true,
    sides: [],
    turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 5 },
  };
});

test("attack drawer warns about the selected weapon upgrade before the attack button", () => {
  render(<AttackWizard rig={state.rigs[0]} mode="fire" onClose={() => {}} />);

  const notice = screen.getByText(/Before you attack/i).closest(".aw-attack-notice") as HTMLElement;
  expect(notice).not.toBeNull();
  expect(notice).toHaveTextContent("Extended Belt");
  expect(notice).toHaveTextContent("+2 ROF");

  const button = screen.getByRole("button", { name: /Fire/ });
  expect(
    notice.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
