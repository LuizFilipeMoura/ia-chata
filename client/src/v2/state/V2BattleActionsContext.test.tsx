import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { V2DrawerProvider } from "./V2DrawerContext";
import { V2RollProvider } from "./V2RollContext";
import { RoomProvider, useRoomDispatch } from "../../state/RoomStateContext";
import { V2BattleActionsProvider, useV2BattleActions } from "./V2BattleActionsContext";
import type { Rig, ServerState } from "../../state/types";

const sendCommand = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));
vi.mock("../../hooks/useMySide", () => ({ useMySide: () => "a" }));

const rig = { id:1, name:"STALKER", owner:"a", weightClass:"light",
  hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false}, legs:{sp:5,max:5,destroyed:false},
  engine:{sp:4,max:4,destroyed:false,heat:0}, weapons:{longRange:"Autocannon",melee:"Claw"},
  equipment:"ablative-plating", activated:false, destroyed:false } as unknown as Rig;

function Harness() {
  const { openRepair } = useV2BattleActions();
  return <button onClick={() => openRepair(rig, "emergencypatch")}>patch</button>;
}
function wrap(ui: ReactNode) {
  return <RoomProvider><V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>{ui}</V2BattleActionsProvider></V2RollProvider></V2DrawerProvider></RoomProvider>;
}
test("emergency patch opens a drawer and dispatches the patch command", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  render(wrap(<Harness />));
  await user.click(screen.getByText("patch"));
  await user.click(await screen.findByRole("button", { name: /Patch/i }));
  expect(sendCommand).toHaveBeenCalledWith("action", expect.objectContaining({ name: "STALKER", action: "emergencypatch", loc: "hull" }));
});

// Field Weld / Vent / Paint (spec: Support Units) — openSupport picks a
// target (friendly for Field Weld/Vent, enemy for Paint) via SupportBody,
// then dispatches the module action.
const foe: Rig = { ...rig, id: 2, owner: "b", name: "FOE" };
const ally: Rig = { ...rig, id: 3, owner: "a", name: "ALLY" };
const seeded: ServerState = {
  version: 1, ownerSide: "a", field: null, rigs: [rig, foe, ally],
  game: { round: 1, phase: "activation", started: true,
    sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }],
    turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 3 } },
};
function Seed() {
  const d = useRoomDispatch();
  useEffect(() => { d({ type: "applyServerState", state: seeded }); }, [d]);
  return null;
}
function SupportHarness({ action }: { action: string }) {
  const { openSupport } = useV2BattleActions();
  return <button onClick={() => openSupport(rig, action)}>open</button>;
}
function wrapSeeded(ui: ReactNode) {
  return (
    <RoomProvider>
      <Seed />
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>{ui}</V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </RoomProvider>
  );
}

test("Paint targets an enemy and dispatches the paint command", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  render(wrapSeeded(<SupportHarness action="paint" />));
  await user.click(screen.getByText("open"));
  await user.click(await screen.findByRole("button", { name: /FOE/ }));
  await user.click(screen.getByRole("button", { name: /Paint/ }));
  expect(sendCommand).toHaveBeenCalledWith("action", { name: "STALKER", action: "paint", target: "FOE" });
});

test("Field Weld defaults to a friendly target (self included) with a location", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  render(wrapSeeded(<SupportHarness action="fieldweld" />));
  await user.click(screen.getByText("open"));
  // The acting rig itself is first in the friendly pool — "self or ally" per spec.
  expect(await screen.findByRole("button", { name: /STALKER/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /FOE/ })).toBeNull();
  await user.click(screen.getByRole("button", { name: /ALLY/ }));
  await user.click(screen.getByRole("button", { name: /Weld/ }));
  expect(sendCommand).toHaveBeenCalledWith("action", { name: "STALKER", action: "fieldweld", target: "ALLY", loc: "hull" });
});
