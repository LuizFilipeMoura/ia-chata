import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { VpWizard } from "./VpWizard";

const sendCommand = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));

function Seed({ state }: { state: ServerState }) {
  const d = useRoomDispatch();
  useEffect(() => { d({ type: "setSession", session: { room: "IR", side: "a", name: "K" } }); d({ type: "applyServerState", state }); }, [d, state]);
  return null;
}
test("toggling a marker updates the VP total and submits claims", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  const state = { version:1, ownerSide:"a", field:null, rigs:[], game:{ round:6, phase:"recovery", started:true,
    sides:[{id:"a",name:"K",vp:0,ready:true}], objectives:[{x:24,y:18,vp:2},{x:6,y:6,vp:1}] } } as unknown as ServerState;
  render(<AppProviders><Seed state={state} /><VpWizard onClose={vi.fn()} /></AppProviders>);
  await user.click(await screen.findByText(/Centre/i));
  expect(screen.getByText(/You'll score/i)).toHaveTextContent("2");
  await user.click(screen.getByRole("button", { name: /Score 2 VP/i }));
  expect(sendCommand).toHaveBeenCalledWith("vp", { side: "a", claims: [0] });
});
