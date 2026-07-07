import { useRoomState, useRoomDispatch } from "../../state/RoomStateContext";
import { randomAddAttrs } from "../../lib/loadout";
import { postCmd } from "./TestHarness";
import type { ServerState } from "../../state/types";

export function DevToolbar({ room, status }: { room: string; status: string }) {
  const { rigs, game } = useRoomState();
  const dispatch = useRoomDispatch();
  const apply = (s: ServerState | null) => {
    if (s) dispatch({ type: "applyServerState", state: s });
  };

  const rerollAll = async () => {
    let last: ServerState | null = null;
    for (const r of rigs || []) last = await postCmd(room, r.owner || "a", "randomize", { name: r.name });
    apply(last);
  };
  const addRig = async (side: string) =>
    apply(
      await postCmd(room, side, "add", {
        name: `${side.toUpperCase()}-x${(rigs?.length ?? 0) + 1}`,
        owner: side,
        ...randomAddAttrs(),
      }),
    );
  const rollInitiative = async () => apply(await postCmd(room, "a", "initiative", {}));
  const hardReset = async () => apply(await postCmd(room, "a", "reset", {}));

  return (
    <div
      className="dev-toolbar"
      style={{
        display: "flex",
        gap: ".5rem",
        flexWrap: "wrap",
        alignItems: "center",
        padding: ".5rem",
        background: "#1a1a1a",
        color: "#eee",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <strong>/test</strong>
      <span>phase: {game?.phase ?? "—"}</span>
      <span>turn: {game?.turn?.side ?? "—"}</span>
      <button onClick={rerollAll}>🎲 Reroll all</button>
      <button onClick={() => addRig("a")}>+ Rig A</button>
      <button onClick={() => addRig("b")}>+ Rig B</button>
      <button onClick={rollInitiative}>Roll initiative</button>
      <button onClick={hardReset}>Reset SP/heat</button>
      <span style={{ marginLeft: "auto" }}>{status}</span>
    </div>
  );
}
