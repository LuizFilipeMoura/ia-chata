import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { BattleHud } from "./BattleHud";

const rig = (id: number, owner: "a"|"b"): Rig => ({
  id, name: "R"+id, owner, weightClass: "light",
  hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
  legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
  equipment:"ablative-plating", activated:false, destroyed:false,
});
function Seed({ state }:{ state: ServerState }) {
  const d = useRoomDispatch();
  useEffect(()=>{ d({type:"setSession",session:{room:"IR",side:"a",name:"K"}}); d({type:"applyServerState",state}); },[d,state]);
  return null;
}
test("renders phase and round when started", async () => {
  const state: ServerState = { version:1, ownerSide:"a", field:null, rigs:[rig(1,"a"),rig(2,"b")],
    game:{ round:2, phase:"activation", started:true,
      sides:[{id:"a",name:"Kostov",vp:0,ready:true},{id:"b",name:"Rival",vp:0,ready:true}],
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 } } };
  render(<AppProviders><Seed state={state}/><BattleHud/></AppProviders>);
  expect(await screen.findByText(/R2/)).toBeInTheDocument();
  expect(screen.getByText("Kostov")).toBeInTheDocument();
});
test("renders nothing pre-battle", () => {
  const state: ServerState = { version:1, ownerSide:"a", field:null, rigs:[],
    game:{ round:1, phase:"setup", started:false, sides:[] } };
  const { container } = render(<AppProviders><Seed state={state}/><BattleHud/></AppProviders>);
  expect(container.querySelector(".v2-bh")).toBeNull();
});
