import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { AppProviders } from "../../AppProviders";
import { V2DrawerProvider } from "../state/V2DrawerContext";
import { V2RollProvider } from "../state/V2RollContext";
import { V2BattleActionsProvider } from "../state/V2BattleActionsContext";
import { useRoomDispatch } from "../../state/RoomStateContext";
import type { Rig, ServerState } from "../../state/types";
import { AttackWizard } from "./AttackWizard";

vi.mock("../../hooks/useCommands", () => ({ useCommands: () => vi.fn() }));

const mk = (id: number, owner: "a" | "b"): Rig => ({ id, name: owner === "a" ? "MINE" : "FOE", owner, weightClass: "light",
  hull: { sp: 6, max: 6, destroyed: false }, arms: { sp: 5, max: 5, destroyed: false }, legs: { sp: 5, max: 5, destroyed: false },
  engine: { sp: 4, max: 4, destroyed: false, heat: 0 }, weapons: { longRange: "Autocannon", melee: "Claw" },
  weaponUpgrades: { longRange: "field", melee: "field" }, equipment: "ablative-plating", activated: false, destroyed: false, loaded: { longRange: true, melee: true } } as unknown as Rig);

function Seed({ rigs, children }: { rigs: Rig[]; children: ReactNode }) {
  const d = useRoomDispatch();
  useEffect(() => {
    d({ type: "setSession", session: { room: "IR", side: "a", name: "K" } });
    d({ type: "applyServerState", state: { version: 1, ownerSide: "a", field: null, rigs, game: { round: 1, phase: "activation", started: true, sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }], turn: { side: "a", activeRigId: rigs[0].id, actionsUsed: 0, actionsMax: 3 } } } as unknown as ServerState });
  }, [d, rigs]);
  return <>{children}</>;
}

test("renders the fire control with an Open Fire / Fire button", async () => {
  const rigs = [mk(1, "a"), mk(2, "b")];
  render(
    <AppProviders>
      <V2DrawerProvider><V2RollProvider><V2BattleActionsProvider>
        <Seed rigs={rigs}>
          <AttackWizard rig={rigs[0]} mode="fire" onClose={vi.fn()} />
        </Seed>
      </V2BattleActionsProvider></V2RollProvider></V2DrawerProvider>
    </AppProviders>,
  );
  expect(await screen.findByRole("button", { name: /Fire/i })).toBeInTheDocument();
});
