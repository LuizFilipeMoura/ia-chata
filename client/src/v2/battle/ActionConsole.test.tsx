import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { ActionConsole } from "./ActionConsole";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

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
