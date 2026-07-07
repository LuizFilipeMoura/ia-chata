import { useCallback, useState } from "react";
import { useRoomState, useRoomDispatch } from "./state/RoomStateContext";
import { useRoomSocket } from "./hooks/useRoomSocket";
import { useViewportHeight } from "./hooks/useViewportHeight";
import { JoinGate } from "./components/JoinGate";
import { Terminal } from "./components/Terminal";
import { TestHarness } from "./components/test/TestHarness";
import type { ServerState } from "./state/types";

export default function App() {
  const { session } = useRoomState();
  const dispatch = useRoomDispatch();
  const [joinError, setJoinError] = useState("");
  const [testMode, setTestMode] = useState(false);
  useViewportHeight();

  const applyState = useCallback(
    (state: ServerState) => dispatch({ type: "applyServerState", state }),
    [dispatch],
  );
  useRoomSocket(session, applyState);

  const onJoin = useCallback(async (room: string, name: string, side: string) => {
    setJoinError("");
    try {
      const resp = await fetch(`/api/game/${encodeURIComponent(room)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, side }),
      });
      if (!resp.ok) throw new Error(`join failed (${resp.status})`);
      const data = await resp.json();
      if (!data.side) throw new Error("Room is full.");
      dispatch({ type: "setSession", session: { room, side: data.side, name } });
      dispatch({ type: "applyServerState", state: data.state });
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Join failed");
    }
  }, [dispatch]);

  if (testMode) return <TestHarness />;

  if (!session?.room) {
    return (
      <JoinGate
        onJoin={onJoin}
        error={joinError}
        onOpenTest={import.meta.env.DEV ? () => setTestMode(true) : undefined}
      />
    );
  }
  return <Terminal />;
}
