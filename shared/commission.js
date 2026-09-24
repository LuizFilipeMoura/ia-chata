import { resolveChassis, upgradeNature, countPrototypes, normalizeEquipment, equipmentUpgradeNature } from "./game-state.js";

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

