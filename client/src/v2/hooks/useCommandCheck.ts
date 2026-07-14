import { useCallback } from "react";
import { useRoomState } from "../../state/RoomStateContext";
import { useMySide } from "../../hooks/useMySide";

export interface CheckResult {
  ok: boolean;
  reason: string | null;
}

// Preflight a command against the server WITHOUT applying it (POST /command/check).
// Lets the UI block an illegal action before opening its wizard and explain why.
// Fails open: a transport/parse error returns ok:true so a network hiccup never
// wedges play — the real /command still guards with a 409 on submit.
export function useCommandCheck() {
  const { session } = useRoomState();
  const side = useMySide();

  return useCallback(
    async (verb: string, attrs: Record<string, unknown> = {}): Promise<CheckResult> => {
      if (!session?.room) return { ok: true, reason: null };
      try {
        const resp = await fetch(`/api/game/${encodeURIComponent(session.room)}/command/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cmd: { verb, attrs }, side }),
        });
        if (!resp.ok) return { ok: true, reason: null };
        const body = await resp.json();
        return { ok: body.ok !== false, reason: body.reason ?? null };
      } catch {
        return { ok: true, reason: null };
      }
    },
    [session?.room, side],
  );
}
