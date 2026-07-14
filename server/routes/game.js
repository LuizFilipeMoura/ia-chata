import { Router } from "express";
import { claimSide, applyCommand, checkCommand, lastRejectionReason, publicState, resolveChassis, upgradeNature, countPrototypes, normalizeEquipment, equipmentUpgradeNature } from "../../shared/game-state.js";

// Server-side commissioning guard: a Rig may only be added as one of the fixed
// chassis loadouts. Resolve the command's attrs to a chassis (by id, else by
// weapon+class combo) and stamp its canonical weapons/class, so a hand-crafted
// request can't smuggle in an off-catalogue combo. Tanks/Walkers keep flat-pick.
// Returns { cmd } to run, or { error } to reject with 400.
export function enforceChassis(cmd) {
  const verb = String(cmd?.verb || "").toLowerCase();
  if (verb !== "add") return { cmd };
  const a = cmd.attrs || {};
  const kind = String(a.kind || "rig").toLowerCase();
  if (kind !== "rig") return { cmd };
  const pb = resolveChassis(a);
  if (!pb) return { error: "rig must match a chassis loadout" };
  const lrUp = a.longRangeUpgrade || a.lrUpgrade;
  const meleeUp = a.meleeUpgrade;
  // Unknown upgrade id for the resolved weapon → reject (null nature means the id
  // isn't in that weapon's list; an omitted upgrade is allowed and defaults later).
  if (lrUp && !upgradeNature(pb.longRange, lrUp)) return { error: "unknown long-range upgrade" };
  if (meleeUp && !upgradeNature(pb.melee, meleeUp)) return { error: "unknown melee upgrade" };
  const equipment = normalizeEquipment(a.equipment);
  const equipUp = a.equipmentUpgrade;
  if (equipUp && (!equipment || !equipmentUpgradeNature(equipment, equipUp))) {
    return { error: "unknown equipment upgrade" };
  }
  // At most one Prototype per rig (AGENTS.md).
  if (countPrototypes(
        { longRange: pb.longRange, melee: pb.melee },
        { longRange: lrUp, melee: meleeUp },
        equipment, equipUp) > 1) {
    return { error: "a rig may run at most one Prototype upgrade" };
  }
  return {
    cmd: {
      ...cmd,
      attrs: { ...a, class: pb.class, longRange: pb.longRange, lr: pb.longRange, melee: pb.melee, chassis: pb.id, sp: pb.sp, equipmentUpgrade: equipUp || null },
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
    store.persist();
    hub.broadcast(room);
    res.json({ version: room.version, state: publicState(room, req.body?.side) });
  });

  return router;
}
