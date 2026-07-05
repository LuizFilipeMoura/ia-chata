import { Router } from "express";
import { claimSide, applyCommand, publicState } from "../../shared/game-state.js";

// Routes mounted at /api/game. A room is the authoritative shared game;
// clients join over HTTP and receive state pushes over the WS hub after
// every mutation (see server/ws.js).
export function createGameRouter(store, hub) {
  const router = Router();

  router.post("/:room/join", (req, res) => {
    const room = store.getOrCreateRoom(req.params.room);
    const side = claimSide(room, { name: req.body?.name, side: req.body?.side });
    store.persist();
    hub.broadcast(room);
    res.json({ side, version: room.version, state: publicState(room, side) });
  });

  router.get("/:room", (req, res) => {
    const room = store.getRoom(req.params.room);
    if (!room) return res.status(404).json({ error: "no such room" });
    res.json({ version: room.version, state: publicState(room, req.query?.side) });
  });

  router.post("/:room/command", (req, res) => {
    const room = store.getRoom(req.params.room);
    if (!room) return res.status(404).json({ error: "no such room" });
    applyCommand(room, req.body?.cmd || {}, { side: req.body?.side });
    store.persist();
    hub.broadcast(room);
    res.json({ version: room.version, state: publicState(room, req.body?.side) });
  });

  return router;
}
