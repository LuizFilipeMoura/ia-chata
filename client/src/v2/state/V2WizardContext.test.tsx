import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { AppProviders } from "../../AppProviders";
import { V2DrawerProvider } from "./V2DrawerContext";
import { V2RollProvider } from "./V2RollContext";
import { V2BattleActionsProvider } from "./V2BattleActionsContext";
import { V2WizardProvider, useV2Wizard } from "./V2WizardContext";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

const mk = (id:number,owner:"a"|"b"): Rig => ({ id, name:owner==="a"?"MINE":"FOE", owner, weightClass:"light",
  hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false}, legs:{sp:5,max:5,destroyed:false},
  engine:{sp:4,max:4,destroyed:false,heat:0}, weapons:{longRange:"Autocannon",melee:"Claw"},
  weaponUpgrades:{longRange:"field",melee:"field"}, equipment:"ablative-plating", activated:false, destroyed:false, loaded:{longRange:true,melee:true} } as unknown as Rig);

function Seed({ rigs, open }: { rigs: Rig[]; open: (w: ReturnType<typeof useV2Wizard>) => void }) {
  const d = useRoomDispatch(); const w = useV2Wizard();
  useEffect(() => { d({ type:"setSession", session:{room:"IR",side:"a",name:"K"} });
    d({ type:"applyServerState", state:{ version:1, ownerSide:"a", field:null, rigs, game:{ round:1, phase:"activation", started:true, sides:[{id:"a",name:"K",vp:0,ready:true},{id:"b",name:"R",vp:0,ready:true}], turn:{side:"a",activeRigId:rigs[0].id,actionsUsed:0,actionsMax:3} } } as unknown as ServerState });
  }, [d, rigs]);
  return <button onClick={() => open(w)}>attack</button>;
}
function wrap(children: ReactNode) {
  return <AppProviders><V2DrawerProvider><V2RollProvider><V2BattleActionsProvider><V2WizardProvider>{children}</V2WizardProvider></V2BattleActionsProvider></V2RollProvider></V2DrawerProvider></AppProviders>;
}
test("openAttack shows the fire control for a rig with enemies", async () => {
  const user = userEvent.setup();
  const rigs = [mk(1,"a"), mk(2,"b")];
  render(wrap(<Seed rigs={rigs} open={(w) => w.openAttack(rigs[0], "fire")} />));
  await user.click(await screen.findByText("attack"));
  expect(await screen.findByText(/Target/i)).toBeInTheDocument();
});
