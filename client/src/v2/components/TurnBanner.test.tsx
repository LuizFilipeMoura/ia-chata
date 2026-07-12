import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { V2Providers } from "../state/V2Providers";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { ServerState } from "../../state/types";
import { TurnBanner } from "./TurnBanner";

const PRIMARY_RE = /Commission your first unit/;

function Seed({state}:{state:ServerState}){ const d=useRoomDispatch();
  useEffect(()=>{d({type:"setSession",session:{room:"IR",side:"a",name:"K"}});d({type:"applyServerState",state});},[d,state]); return null; }

test("pre-battle focus prompts the player with a primary line", async () => {
  const state: ServerState = { version:1, ownerSide:"a", field:null, rigs:[],
    game:{ round:1, phase:"setup", started:false, sides:[{id:"a",name:"K",vp:0,ready:false},{id:"b",name:"R",vp:0,ready:false}] } };
  render(<V2Providers><Seed state={state}/><TurnBanner/></V2Providers>);
  expect(await screen.findByText(PRIMARY_RE)).toBeInTheDocument();
});
