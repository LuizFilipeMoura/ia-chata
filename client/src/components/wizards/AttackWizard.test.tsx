import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AttackWizard } from "./AttackWizard";
import type { GameState, Rig } from "../../state/types";

const { state, sendCommand, promptDice } = vi.hoisted(() => ({
  state: { rigs: [] as Rig[], game: null as GameState | null },
  sendCommand: vi.fn(),
  promptDice: vi.fn(),
}));

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));
vi.mock("../../state/BattleActionsContext", () => ({
  useBattleActions: () => ({ sendReact: vi.fn() }),
}));
vi.mock("../../state/RollContext", () => ({
  useRoll: () => ({ promptDice }),
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
    weaponUpgrades: { longRange: "extended-belt", melee: "opportunist" },
    equipment: null,
    loaded: { longRange: true, melee: true },
    activated: false,
    destroyed: false,
    ...over,
  };
}

beforeEach(() => {
  sendCommand.mockClear();
  promptDice.mockClear();
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

// A cold kind (Tank / Walker) carries no weightClass and a single `unit` weapon.
function tank(over: Partial<Rig> = {}): Rig {
  return {
    id: 9,
    name: "Bulwark",
    kind: "tank",
    weightClass: undefined as unknown as Rig["weightClass"],
    owner: "b",
    hull: component(8),
    tracks: component(7),
    turret: component(6),
    engine: { ...component(6), heat: 0 },
    weapons: { unit: "Tank Cannon" },
    equipment: null,
    loaded: { unit: true },
    activated: false,
    destroyed: false,
    ...over,
  } as unknown as Rig;
}

test("does not crash when the target is a cold kind with no weightClass (regression)", () => {
  state.rigs = [rig({}), tank({})];
  render(<AttackWizard rig={state.rigs[0]} mode="fire" onClose={() => {}} />);
  // Target option labels the tank by its kind, not a (missing) weight class.
  expect(screen.getByRole("button", { name: /Fire/ })).toBeInTheDocument();
  expect(screen.getAllByText(/Tank/).length).toBeGreaterThan(0);
});

test("flat-pick attacker shows its single unit weapon and no upgrade line", () => {
  const attacker = tank({ id: 1, name: "Bulwark", owner: "a" });
  state.rigs = [attacker, rig({ id: 2, name: "Raider", owner: "b" })];
  render(<AttackWizard rig={attacker} mode="fire" onClose={() => {}} />);
  const notice = screen.getByText(/Before you attack/i).closest(".aw-attack-notice") as HTMLElement;
  expect(notice).toHaveTextContent("Tank Cannon");
  expect(notice).toHaveTextContent(/flat STR/i);
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

test("slider opens at the weapon's sweet-spot distance", async () => {
  // Mini Gun (the default rig fixture's longRange weapon) has sweet: 7.
  render(<AttackWizard rig={state.rigs[0]} mode="fire" onClose={() => {}} />);
  const slider = (await screen.findByLabelText(
    "Distance to target in inches",
  )) as HTMLInputElement;
  expect(slider.value).toBe("7");
  // The band chip's exact copy — disambiguated from the "Sweet spot +N"
  // wording used in the effective-range paragraph below the slider.
  expect(screen.getByText("🎯 sweet spot")).toBeInTheDocument();
});

test("dragging off the sweet spot shows the accuracy falloff", async () => {
  render(<AttackWizard rig={state.rigs[0]} mode="fire" onClose={() => {}} />);
  const slider = (await screen.findByLabelText(
    "Distance to target in inches",
  )) as HTMLInputElement;
  // |18 - 7| * 0.35 = 3.85 -> round to 4 penalty -> acc = peak(2) - 4 = -2.
  fireEvent.change(slider, { target: { value: "18" } });
  expect(screen.getByText("-2 falloff")).toBeInTheDocument();
});

test("lock mode shows only a target picker and dispatches a lock command with no dice prompt", async () => {
  const onClose = vi.fn();
  render(<AttackWizard rig={state.rigs[0]} mode="lock" onClose={onClose} />);

  // Minimal flow: title + target picker, no weapon/arc/range/cover/location fields.
  expect(screen.getByText(/Fire Control Lock/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Distance to target in inches")).toBeNull();
  expect(screen.queryByText(/Weapon/)).toBeNull();
  expect(screen.queryByText(/Cover/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Raider/ }));
  fireEvent.click(screen.getByRole("button", { name: "Lock Target" }));

  expect(sendCommand).toHaveBeenCalledWith("action", {
    name: "Vulcan", action: "lock", target: "Raider",
  });
  expect(promptDice).not.toHaveBeenCalled();
});

test("lock mode never prompts for dice even when autoResolve is off", async () => {
  state.game = { ...(state.game as GameState), autoResolve: false };
  const onClose = vi.fn();
  render(<AttackWizard rig={state.rigs[0]} mode="lock" onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Lock Target" }));
  expect(promptDice).not.toHaveBeenCalled();
  expect(sendCommand).toHaveBeenCalledWith(
    "action",
    expect.objectContaining({ action: "lock" }),
  );
});
