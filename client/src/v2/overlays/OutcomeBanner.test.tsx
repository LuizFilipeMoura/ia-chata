import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { OutcomeBanner } from "./OutcomeBanner";

function Seed({state}:{state:ServerState}){ const d=useRoomDispatch();
  useEffect(()=>{d({type:"setSession",session:{room:"IR",side:"a",name:"K"}});d({type:"applyServerState",state});},[d,state]); return null; }

test("hidden unless the game is finished", () => {
  const state:ServerState={version:1,ownerSide:"a",field:null,rigs:[],game:{round:1,phase:"activation",started:true,sides:[]}};
  const { container } = render(<V2Providers><Seed state={state}/><OutcomeBanner/></V2Providers>);
  expect(container.querySelector(".v2-outcome")).toBeNull();
});
test("shows New Battle when finished", async () => {
  const state:ServerState={version:1,ownerSide:"a",field:null,rigs:[],
    game:{round:6,phase:"finished",started:true,outcome:{winner:"a"} as any,
      sides:[{id:"a",name:"K",vp:28,ready:true},{id:"b",name:"R",vp:19,ready:true}]}};
  render(<V2Providers><Seed state={state}/><OutcomeBanner/></V2Providers>);
  expect(await screen.findByRole("button", { name: /New Battle/i })).toBeInTheDocument();
});
test("the close button dismisses the banner, baring the final board", async () => {
  const state:ServerState={version:1,ownerSide:"a",field:null,rigs:[],
    game:{round:6,phase:"finished",started:true,outcome:{winner:"a"} as any,
      sides:[{id:"a",name:"K",vp:28,ready:true},{id:"b",name:"R",vp:19,ready:true}]}};
  const { container } = render(<V2Providers><Seed state={state}/><OutcomeBanner/></V2Providers>);
  await screen.findByRole("button", { name: /New Battle/i });
  await userEvent.click(screen.getByRole("button", { name: /close/i }));
  expect(container.querySelector(".v2-outcome")).toBeNull();
});
