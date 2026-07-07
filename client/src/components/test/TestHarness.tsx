import { useEffect, useRef, useState } from "react";
import { useRoomState, useRoomDispatch } from "../../state/RoomStateContext";
import { ViewSideContext } from "../../state/ViewSideContext";
import { UiProvider } from "../../state/UiStateContext";
import { DrawerProvider } from "../../state/DrawerContext";
import { RollProvider } from "../../state/RollContext";
import { BattleActionsProvider } from "../../state/BattleActionsContext";
import { WizardProvider } from "../../state/WizardContext";
import { Stage } from "../Stage";
import { DevToolbar } from "./DevToolbar";
import { buildSeedCommands } from "./seed";
import type { ServerState } from "../../state/types";

const TEST_ROOM = "test";

/** Post one command with an explicit side (bypasses session.side so the harness
 *  can drive both sides during setup). Returns the new server state or null. */
export async function postCmd(
  room: string,
  side: string,
  verb: string,
  attrs: Record<string, unknown>,
): Promise<ServerState | null> {
  const resp = await fetch(`/api/game/${encodeURIComponent(room)}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: { verb, attrs }, side }),
  });
  if (!resp.ok) return null;
  const { state } = await resp.json();
  return state as ServerState;
}

export function TestHarness() {
  const { rigs } = useRoomState();
  const dispatch = useRoomDispatch();
  const [status, setStatus] = useState("booting…");
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    (async () => {
      for (const side of ["a", "b"]) {
        await fetch(`/api/game/${TEST_ROOM}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: side === "a" ? "Tester A" : "Tester B", side }),
        });
      }
      dispatch({ type: "setSession", session: { room: TEST_ROOM, side: "a", name: "Tester A" } });

      if (!rigs || rigs.length === 0) {
        let last: ServerState | null = null;
        for (const c of buildSeedCommands()) {
          last = await postCmd(TEST_ROOM, c.side, c.verb, c.attrs);
        }
        if (last) dispatch({ type: "applyServerState", state: last });
      }
      setStatus("ready");
    })().catch((e) => setStatus(`seed failed: ${e instanceof Error ? e.message : e}`));
  }, [dispatch, rigs]);

  return (
    <div className="test-harness">
      <DevToolbar room={TEST_ROOM} status={status} />
      <div className="test-split" style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        {(["a", "b"] as const).map((side) => (
          <ViewSideContext.Provider key={side} value={side}>
            <UiProvider>
              <DrawerProvider>
                <RollProvider>
                  <BattleActionsProvider>
                    <WizardProvider>
                      <div style={{ flex: 1, minWidth: 0, borderTop: "3px solid #444" }}>
                        <h3>Side {side.toUpperCase()}</h3>
                        <Stage />
                      </div>
                    </WizardProvider>
                  </BattleActionsProvider>
                </RollProvider>
              </DrawerProvider>
            </UiProvider>
          </ViewSideContext.Provider>
        ))}
      </div>
    </div>
  );
}
