import { Router } from "express";
import { claimSide, applyCommand, checkCommand, lastRejectionReason, publicState } from "../../shared/game-state.js";
import { enforceChassis } from "../../shared/commission.js";
import { driveBots } from "../../shared/bot/index.js";
import { frameOf } from "../../shared/sim/match.js";

// The commissioning guard lives in shared/commission.js so simulated rooms (the
// GA's games) pass the exact same check as a player's HTTP command.
export { enforceChassis };

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

  // Preflight: would this command apply? Dry-runs on a clone and answers
  // { ok, reason } without mutating the room. The client calls this before
  // opening an action wizard so an illegal move is explained up front rather
  // than silently swallowed after the player commits.
  router.post("/:room/command/check", (req, res) => {
    const room = store.getRoom(req.params.room);
    if (!room) return res.status(404).json({ error: "no such room" });
    const guarded = enforceChassis(req.body?.cmd || {});
    if (guarded.error) return res.json({ ok: false, reason: guarded.error });
    const { ok, reason } = checkCommand(room, guarded.cmd, { side: req.body?.side });
    res.json({ ok, reason });
  });

  router.post("/:room/command", (req, res) => {
    const room = store.getRoom(req.params.room);
    if (!room) return res.status(404).json({ error: "no such room" });
    const guarded = enforceChassis(req.body?.cmd || {});
    if (guarded.error) return res.status(400).json({ error: guarded.error });
    // applyCommand bumps room.version only when it actually mutates state; an
    // illegal or no-op command leaves it untouched and records why. Treat
    // "nothing changed" as a rejected command and answer 409 with the reason
    // instead of a misleading 200.
    const before = room.version;
    applyCommand(room, guarded.cmd, { side: req.body?.side });
    if (room.version === before) {
      return res.status(409).json({
        error: "command not applied",
        reason: lastRejectionReason() || "This command can't be applied right now.",
        state: publicState(room, req.body?.side),
      });
    }
    // A human command may have handed the floor to a bot side (its activation, or
    // a gate it owns). Play every bot side out to the next human decision point
    // before persisting/broadcasting, so the pushed state already reflects the
    // bot's whole turn. No-op unless the room is digital and has a bot side.
    // Record each bot step as a render frame; the push carries them as
    // `botFrames` so a client can replay the bot's turn move by move.
    const botFrames = [];
    let resMark = room.game.nextResolutionId || 0;
    driveBots(room, { onStep: (r, c) => { botFrames.push(frameOf(r, c, resMark)); resMark = r.game.nextResolutionId; } });
    room.botFrames = botFrames.length ? { version: room.version, frames: botFrames } : null;
    store.persist();
    hub.broadcast(room);
    res.json({ version: room.version, state: publicState(room, req.body?.side) });
  });

  return router;
}
