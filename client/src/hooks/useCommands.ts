import { useCallback } from "react";
import { useRoomState, useRoomDispatch } from "../state/RoomStateContext";
import { useMySide } from "./useMySide";

export function useCommands() {
  const { session } = useRoomState();
  const dispatch = useRoomDispatch();
  const side = useMySide();

  return useCallback(
    async (verb: string, attrs: Record<string, unknown> = {}) => {
      if (!session?.room) return;
      try {
        const resp = await fetch(`/api/game/${encodeURIComponent(session.room)}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cmd: { verb, attrs }, side }),
        });
        if (!resp.ok) return;
        const { state } = await resp.json();
        dispatch({ type: "applyServerState", state });
      } catch { /* the socket will deliver the eventual state */ }
    },
    [session?.room, side, dispatch],
  );
}
