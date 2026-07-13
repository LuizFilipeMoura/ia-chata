import { CHASSIS, EQUIPMENT, canAddRigForSide } from "/shared/game-state.js";
import { CHASSIS_NAME, firstUpgradeId, firstEquipmentUpgradeId } from "./commissionData";

// Namespace + format version. A future format bump (v2) can carry more fields
// without breaking codes already printed under v1.
export const QR_PREFIX = "rig:v1:";

// Parse a scanned string to a known chassis id, or null if it is not a valid
// v1 rig-commission code for a chassis in the catalogue.
export function parseChassisQr(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t.startsWith(QR_PREFIX)) return null;
  const id = t.slice(QR_PREFIX.length).trim().toLowerCase();
  return CHASSIS.some((c: { id: string }) => c.id === id) ? id : null;
}

// Encode a chassis id as its printable QR payload string.
export function chassisQrPayload(id: string): string {
  return QR_PREFIX + id;
}

export interface ScanResolve {
  ok: boolean;
  attrs?: Record<string, unknown>;
  error?: string;
}

// Resolve a decoded string against current room state for a given side. On
// success, `attrs` is the exact Standard-build payload the `add` command wants;
// owner is always the scanner's side and is never read from the code.
export function resolveScan(
  state: { rigs: Array<{ chassis?: string }>; game: unknown },
  text: string,
  mySide: string,
): ScanResolve {
  const id = parseChassisQr(text);
  if (!id) return { ok: false, error: "Unrecognized code" };
  const pb = CHASSIS.find((c: { id: string }) => c.id === id)!;
  const used = new Set(state.rigs.map((r) => r.chassis).filter(Boolean));
  if (used.has(id)) return { ok: false, error: `${CHASSIS_NAME[id]} is already on the field` };
  // canAddRigForSide's ambient type wants a full Rig[]/GameState shape; resolveScan
  // only needs the minimal { rigs, game } view (this is a stable-true predicate —
  // see game-state.js), so the cast is a type-shape bridge, not a behavior change.
  if (!canAddRigForSide(state as never, mySide)) return { ok: false, error: "Your roster is full" };
  const equipment = Object.keys(EQUIPMENT)[0];
  return {
    ok: true,
    attrs: {
      name: CHASSIS_NAME[id] || pb.class,
      kind: "rig",
      chassis: id,
      class: pb.class,
      owner: mySide,
      lr: pb.longRange,
      melee: pb.melee,
      longRangeUpgrade: firstUpgradeId(pb.longRange),
      meleeUpgrade: firstUpgradeId(pb.melee),
      equipment,
      equipmentUpgrade: firstEquipmentUpgradeId(equipment),
    },
  };
}
