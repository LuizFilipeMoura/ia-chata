import { useEffect, useRef } from "react";
import type { ServerState } from "../state/types";

const MAX_RECONNECT_DELAY = 5000;

function socketUrl(room: string, side?: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ room });
  if (side) params.set("side", side);
  return `${proto}//${location.host}/ws?${params.toString()}`;
}

/** Opens the room push channel; dispatches each state payload. Reconnects with backoff. */
export function useRoomSocket(
  session: { room: string; side?: string } | null,
  onState: (state: ServerState) => void,
): void {
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    if (!session?.room) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let delay = 1000;
    let closed = false;

    const connect = () => {
      socket = new WebSocket(socketUrl(session.room, session.side));
      socket.onopen = () => { delay = 1000; };
      socket.onmessage = (event) => {
        const { state } = JSON.parse(event.data);
        onStateRef.current(state);
      };
      socket.onclose = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      };
      socket.onerror = () => socket?.close();
    };
    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [session?.room, session?.side]);
}
