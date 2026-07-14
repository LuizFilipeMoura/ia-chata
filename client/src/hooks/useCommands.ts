import { useCallback } from "react";
import { useRoomState, useRoomDispatch } from "../state/RoomStateContext";
import { emitCommandRejected } from "../state/commandRejectionBus";
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
        if (!resp.ok) {
          // The server rejected the command (409 "command not applied"): surface
          // the per-rule reason so the player learns why instead of the action
          // silently no-op'ing. Other errors fall through to the socket.
          // `threat` is a cosmetic attack telegraph the player never explicitly
          // invokes; its idempotent clear/declare no-ops legitimately don't bump
          // version, so never turn one into a rejection banner.
          if (resp.status === 409 && verb !== "threat") {
            try {
              const { reason } = await resp.json();
              if (reason) emitCommandRejected(reason);
            } catch { /* no body — nothing to explain */ }
          }
          return;
        }
        const { state } = await resp.json();
        dispatch({ type: "applyServerState", state });
      } catch { /* the socket will deliver the eventual state */ }
    },
    [session?.room, side, dispatch],
  );
}
