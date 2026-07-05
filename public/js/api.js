import { S, applyServerState } from "./state.js";

// POST one mutation to the server, then adopt the authoritative result.
// The broadcast (see startSocket below) will deliver the same state to every
// connected client, including this one; applying the POST response directly
// just avoids a visible round-trip flicker on the sender's own action.
export async function sendCommand(verb, attrs) {
  if (!S.session?.room) return;
  try {
    const resp = await fetch(`/api/game/${encodeURIComponent(S.session.room)}/command`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd: { verb, attrs }, side: S.session?.side }),
    });
    if (!resp.ok) return;
    const { version, state } = await resp.json();
    if (version !== S.stateVersion) applyServerState(state);
  } catch { /* the socket will deliver the eventual state */ }
}

let socket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 5000;

function socketUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({ room: S.session.room });
  if (S.session?.side) params.set("side", S.session.side);
  return `${proto}//${location.host}/ws?${params.toString()}`;
}

// Opens the room's push channel. Reconnects with backoff (1s, 2s, 4s, capped
// at 5s) on close; no polling fallback (see design doc's Scope decisions).
export function startSocket() {
  if (!S.session?.room) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  socket = new WebSocket(socketUrl());

  socket.onopen = () => { reconnectDelay = 1000; };

  socket.onmessage = (event) => {
    const { version, state } = JSON.parse(event.data);
    if (version !== S.stateVersion) applyServerState(state);
  };

  socket.onclose = () => {
    reconnectTimer = setTimeout(startSocket, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  };

  socket.onerror = () => socket.close();
}
