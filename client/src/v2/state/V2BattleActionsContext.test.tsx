import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { V2DrawerProvider } from "./V2DrawerContext";
import { V2RollProvider } from "./V2RollContext";
import { RoomProvider } from "../../state/RoomStateContext";
import { V2BattleActionsProvider, useV2BattleActions } from "./V2BattleActionsContext";
import type { Rig } from "../../state/types";

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
