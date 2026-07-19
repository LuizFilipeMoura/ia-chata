import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { ActionConsole } from "./ActionConsole";

const sendCommand = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => sendCommand }));

const stalker: Rig = { id:1, name:"STALKER", owner:"a", weightClass:"light",
  hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false}, legs:{sp:5,max:5,destroyed:false},
  engine:{sp:4,max:4,destroyed:false,heat:0}, weapons:{longRange:"Autocannon",melee:"Claw"},
  weaponUpgrades:{longRange:"field",melee:"field"}, equipment:"ablative-plating", activated:false, destroyed:false, loaded:{longRange:true,melee:true} };

function Seed({state}:{state:ServerState}){ const d=useRoomDispatch();
  useEffect(()=>{d({type:"setSession",session:{room:"IR",side:"a",name:"K"}});d({type:"applyServerState",state});},[d,state]); return null; }

function started(activeRigId: number|null): ServerState {
  return { version:1, ownerSide:"a", field:null, rigs:[stalker, {...stalker, id:2, owner:"b", name:"FOE"}],
    game:{ round:1, phase:"activation", started:true,
      sides:[{id:"a",name:"K",vp:0,ready:true},{id:"b",name:"R",vp:0,ready:true}],
      turn:{ side:"a", activeRigId, actionsUsed:0, actionsMax:3 } } };
}

test("shows the action budget + Shut Down when this heat rig is active", async () => {
  render(<V2Providers><Seed state={started(1)}/><ActionConsole rig={stalker}/></V2Providers>);
  expect(await screen.findByText(/Actions/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Shut Down/i })).toBeInTheDocument();
});
test("renders empty for a non-active rig", () => {
  const { container } = render(<V2Providers><Seed state={started(null)}/><ActionConsole rig={stalker}/></V2Providers>);
  expect(screen.queryByText(/Actions\s/i)).toBeNull();
  expect(container.querySelector(".v2-ac")?.children.length ?? 0).toBe(0);
});

// Sprint-heat-floor regression: Servo Actuators drops Sprint to 1 heat (= Move's
// own cost), so battle-view splices `move` out of the action list and expects the
// Move-group tile to solo on Sprint. The console's Sprint filter must therefore
// keep Sprint when there's no live Move to arm — otherwise the Move tile's kids
// go empty, the group renders null, and such a rig can never move via the UI.
test("Move tile survives (solos on Sprint) when Servo Actuators dominates Move", async () => {
  const servo: Rig = { ...stalker, equipment: "servo-actuators" };
  const state = started(1);
  state.rigs = [servo, { ...stalker, id: 2, owner: "b", name: "FOE" }];
  render(<V2Providers><Seed state={state}/><ActionConsole rig={servo}/></V2Providers>);
  await screen.findByText(/Actions/i);
  // The Move-group tile is present (as Sprint) and live — not null (the bug).
  const tile = screen.getByRole("button", { name: /move|sprint/i });
  expect(tile).toBeInTheDocument();
  expect(tile).toBeEnabled();
});

// Field Weld / Vent / Paint (spec: Support Units) — a Recon-module rig's
// Support tile opens the Paint target picker, which dispatches the command
// once a target is confirmed.
test("tapping Paint (Recon module) opens a target picker and dispatches the paint command", async () => {
  const user = userEvent.setup();
  sendCommand.mockClear();
  const recon: Rig = { ...stalker, modules: ["recon"] };
  const state = started(1);
  state.rigs = [recon, { ...stalker, id: 2, owner: "b", name: "FOE" }];
  render(<V2Providers><Seed state={state}/><ActionConsole rig={recon}/></V2Providers>);
  // Paint shares the Support tile with repair/prepare/douse, so it opens the
  // group's popover rather than soloing straight through.
  await user.click(await screen.findByRole("button", { name: /Support/i }));
  await user.click(await screen.findByRole("menuitem", { name: /Paint/i }));
  await user.click(await screen.findByRole("button", { name: /FOE/ }));
  await user.click(screen.getByRole("button", { name: /Paint/ }));
  expect(sendCommand).toHaveBeenCalledWith("action", { name: "STALKER", action: "paint", target: "FOE" });
});
