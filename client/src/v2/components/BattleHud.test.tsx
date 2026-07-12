import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "../../AppProviders";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { BattleHud } from "./BattleHud";
import { _resetForTest, getEnabled } from "../audio/audioMixer";

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
test("shows both sides' running VP, highlighting mine", async () => {
  const state: ServerState = { version:1, ownerSide:"a", field:null, rigs:[],
    game:{ round:3, phase:"activation", started:true,
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 },
      sides:[{id:"a",name:"Kostov",vp:4,ready:true},{id:"b",name:"Rival",vp:2,ready:true}] } };
  render(<AppProviders><Seed state={state}/><BattleHud/></AppProviders>);
  const mine = await screen.findByText(/Kostov 4/);
  const foe = screen.getByText(/Rival 2/);
  expect(mine).toHaveClass("v2-bh-mine");
  expect(foe).toHaveClass("v2-bh-foe");
});
test("pops a kill toast when a fresh destruction resolution carries a vp award", async () => {
  const base: ServerState = { version:1, ownerSide:"a", field:null, rigs:[],
    game:{ round:3, phase:"activation", started:true,
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 },
      sides:[{id:"a",name:"Kostov",vp:0,ready:true},{id:"b",name:"Rival",vp:0,ready:true}],
      resolutions:[] } };
  const killed: ServerState = { version:2, ownerSide:"a", field:null, rigs:[],
    game:{ round:3, phase:"activation", started:true,
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 },
      sides:[{id:"a",name:"Kostov",vp:2,ready:true},{id:"b",name:"Rival",vp:0,ready:true}],
      resolutions:[{ id:5, kind:"destruction", rigId:9, victimName:"Ravager", vp:{ side:"a", amount:2 }, effects:[] }] } };
  const { rerender } = render(<AppProviders><Seed state={base}/><BattleHud/></AppProviders>);
  await screen.findByText(/Kostov 0/);
  expect(screen.queryByText(/Ravager/)).toBeNull();
  rerender(<AppProviders><Seed state={killed}/><BattleHud/></AppProviders>);
  expect(await screen.findByText(/🎯 Target eliminated — Ravager · \+2 VP/)).toBeInTheDocument();
});
test("shows the local side's Priority Target", async () => {
  const state = { version:1, ownerSide:"a", field:null,
    rigs:[{ id:9, name:"Ravager", owner:"b", weightClass:"light",
      hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
      legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
      equipment:null, activated:false, destroyed:false }],
    game:{ round:2, phase:"activation", started:true,
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 },
      sides:[{id:"a",name:"Kostov",vp:0,ready:true},{id:"b",name:"Rival",vp:0,ready:true}],
      priorityTargets:{ a: 9 } } } as unknown as ServerState;
  render(<AppProviders><Seed state={state}/><BattleHud/></AppProviders>);
  expect(await screen.findByText(/🎯 Target: Ravager/)).toBeInTheDocument();
});
test("does not toast for a kill already in the backlog on (re)connect", async () => {
  const hydrated: ServerState = { version:1, ownerSide:"a", field:null, rigs:[],
    game:{ round:3, phase:"activation", started:true,
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 },
      sides:[{id:"a",name:"Kostov",vp:2,ready:true},{id:"b",name:"Rival",vp:0,ready:true}],
      resolutions:[{ id:5, kind:"destruction", rigId:9, victimName:"Ravager", vp:{ side:"a", amount:2 }, effects:[] }] } };
  render(<AppProviders><Seed state={hydrated}/><BattleHud/></AppProviders>);
  await screen.findByText(/Kostov 2/);       // HUD hydrated
  expect(screen.queryByText(/Ravager/)).toBeNull();  // stale backlog kill must NOT toast
});
test("audio mute button toggles battle audio", async () => {
  localStorage.clear(); _resetForTest();
  const user = userEvent.setup();
  const state: ServerState = { version:1, ownerSide:"a", field:null, rigs:[rig(1,"a"),rig(2,"b")],
    game:{ round:1, phase:"activation", started:true,
      sides:[{id:"a",name:"Kostov",vp:0,ready:true},{id:"b",name:"Rival",vp:0,ready:true}],
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 } } };
  render(<AppProviders><Seed state={state}/><BattleHud/></AppProviders>);
  const btn = await screen.findByRole("button", { name: /audio/i });
  expect(getEnabled()).toBe(true);
  await user.click(btn);
  expect(getEnabled()).toBe(false);
});
