// Room broadcast hub: groups connected WebSocket clients by room code and
// pushes state deltas after every server-side mutation. One-way
// (server -> client) only — commands still arrive over HTTP POST in
// server/routes/game.js, which calls broadcast() after each mutation.
import { publicState } from "../shared/game-state.js";

const OPEN = 1; // WebSocket.OPEN, per the WHATWG WebSocket spec

export function createWsHub() {
  const clientsByRoom = new Map(); // room code -> Set<{ ws, side }>

  function attach(ws, room, side) {
    if (!clientsByRoom.has(room)) clientsByRoom.set(room, new Set());
    const client = { ws, side };
    clientsByRoom.get(room).add(client);
    ws.on("close", () => {
      const set = clientsByRoom.get(room);
      if (!set) return;
      set.delete(client);
      if (set.size === 0) clientsByRoom.delete(room);
    });
  }

  // Push the current snapshot to one socket. Used both to hydrate a socket the
  // moment it connects (reconnect / page refresh) and, per-client, by broadcast.
  function sendState(ws, room, side) {
    if (ws.readyState !== OPEN) return;
    ws.send(JSON.stringify({ version: room.version, state: publicState(room, side) }));
  }

  function broadcast(room) {
    const set = clientsByRoom.get(room.code);
    if (!set) return;
    for (const client of set) sendState(client.ws, room, client.side);
  }

  return { attach, broadcast, sendState };
}
