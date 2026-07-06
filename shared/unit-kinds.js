// Registry of unit kinds (rig, tank, walker, …) with parts, hit locations, and
// armour tables. Pure data + tiny lookups shared by server and client.

export const ROLES = ["structural", "power", "mobility", "weapon"];

const RIG_IMPACT = {
  light: {
    hull:   { direct: 10, severe: 14, critical: 16 },
    arms:   { direct: 10, severe: 12, critical: 14 },
    legs:   { direct: 10, severe: 13, critical: 15 },
    engine: { direct: 7,  severe: 10, critical: 12 },
  },
  medium: {
    hull:   { direct: 11, severe: 14, critical: 17 },
    arms:   { direct: 10, severe: 13, critical: 15 },
    legs:   { direct: 11, severe: 13, critical: 15 },
    engine: { direct: 8,  severe: 10, critical: 12 },
  },
  heavy: {
    hull:   { direct: 13, severe: 15, critical: 17 },
    arms:   { direct: 12, severe: 14, critical: 16 },
    legs:   { direct: 14, severe: 16, critical: 17 },
    engine: { direct: 8,  severe: 11, critical: 13 },
  },
  colossal: {
    hull:   { direct: 13, severe: 16, critical: 17 },
    arms:   { direct: 13, severe: 14, critical: 16 },
    legs:   { direct: 13, severe: 16, critical: 17 },
    engine: { direct: 9,  severe: 11, critical: 14 },
  },
};

export const UNIT_KINDS = {
  rig: {
    id: "rig",
    label: "Rig",
    parts: [
      { name: "hull",   role: "structural" },
      { name: "arms",   role: "weapon" },
      { name: "legs",   role: "mobility" },
      { name: "engine", role: "power" },
    ],
    hitLocation: [
      { min: 1,  part: "hull" },
      { min: 5,  part: "arms" },
      { min: 8,  part: "legs" },
      { min: 11, part: "engine" },
    ],
    armour: RIG_IMPACT,
    hasHeat: true,
    hasArcs: true,
    actionBudget: 3,
    weaponMode: "rig-catalog",
    reloads: true,
    hasEquipment: true,
    reactions: true,
    ramStr: null,
    destruction: "single-model",
  },
};

export function kindOf(unit) {
  if (!unit || typeof unit !== "object") return "rig";
  const k = unit.kind;
  return typeof k === "string" && k ? k : "rig";
}

export function partsOf(kindId) {
  return UNIT_KINDS[kindId]?.parts || [];
}

export function partNamesOf(kindId) {
  return partsOf(kindId).map((p) => p.name);
}

export function roleOf(kindId, partName) {
  const p = partsOf(kindId).find((p) => p.name === partName);
  return p ? p.role : null;
}

export function partsByRole(kindId, role) {
  return partsOf(kindId).filter((p) => p.role === role).map((p) => p.name);
}

export function hitPart(kindId, d12) {
  const rows = UNIT_KINDS[kindId]?.hitLocation || [];
  const n = Math.floor(Number(d12) || 0);
  let picked = rows[0]?.part;
  for (const row of rows) if (n >= row.min) picked = row.part;
  return picked;
}

export function impactRow(kindId, partName, weightClass) {
  const armour = UNIT_KINDS[kindId]?.armour;
  if (!armour) return null;
  if (weightClass && armour[weightClass]) return armour[weightClass][partName];
  return armour[partName];
}
