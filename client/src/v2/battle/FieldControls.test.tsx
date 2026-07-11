import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AppProviders } from "../../AppProviders";
import { V2DrawerProvider } from "../state/V2DrawerContext";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { FieldControls } from "./FieldControls";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

function Seed({ state }: { state: ServerState }) {
  const d = useRoomDispatch();
  useEffect(() => { d({ type:"setSession", session:{room:"IR",side:"a",name:"K"} }); d({ type:"applyServerState", state }); }, [d, state]);
  return null;
}
test("owner sees Set field before lock; non-owner sees the waiting note", async () => {
  const owner = { version:1, ownerSide:"a", field:{width:54,height:36,diagonal:"tlbr",terrain:[],locked:false}, rigs:[],
    game:{ round:1, phase:"setup", started:false, sides:[] } } as unknown as ServerState;
  const { unmount } = render(<AppProviders><V2DrawerProvider><Seed state={owner} /><FieldControls /></V2DrawerProvider></AppProviders>);
  expect(await screen.findByRole("button", { name: /Set field/i })).toBeInTheDocument();
  unmount();
  const guest = { ...owner, ownerSide:"b" } as unknown as ServerState;
  render(<AppProviders><V2DrawerProvider><Seed state={guest} /><FieldControls /></V2DrawerProvider></AppProviders>);
  expect(await screen.findByText(/Waiting for the owner/i)).toBeInTheDocument();
});
