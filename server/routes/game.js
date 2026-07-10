import { Router } from "express";
import { claimSide, applyCommand, publicState, resolvePrebuilt } from "../../shared/game-state.js";

// Server-side commissioning guard: a Rig may only be added as one of the fixed
// prebuilt loadouts. Resolve the command's attrs to a prebuilt (by id, else by
// weapon+class combo) and stamp its canonical weapons/class, so a hand-crafted
// request can't smuggle in an off-catalogue combo. Tanks/Walkers keep flat-pick.
// Returns { cmd } to run, or { error } to reject with 400.
export function enforcePrebuilt(cmd) {
  const verb = String(cmd?.verb || "").toLowerCase();
  if (verb !== "add") return { cmd };
  const a = cmd.attrs || {};
  const kind = String(a.kind || "rig").toLowerCase();
  if (kind !== "rig") return { cmd };
  const pb = resolvePrebuilt(a);
  if (!pb) return { error: "rig must match a prebuilt loadout" };
  return {
    cmd: {
      ...cmd,
      attrs: { ...a, class: pb.class, longRange: pb.longRange, lr: pb.longRange, melee: pb.melee, prebuilt: pb.id, sp: pb.sp },
    },
  };
}

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
    const guarded = enforcePrebuilt(req.body?.cmd || {});
    if (guarded.error) return res.status(400).json({ error: guarded.error });
    applyCommand(room, guarded.cmd, { side: req.body?.side });
    store.persist();
    hub.broadcast(room);
    res.json({ version: room.version, state: publicState(room, req.body?.side) });
  });

  return router;
}
