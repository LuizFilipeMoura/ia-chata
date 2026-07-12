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
    destruction: "single-model",
  },
  tank: {
    id: "tank",
    label: "Tank",
    parts: [
      { name: "hull",   role: "structural" },
      { name: "tracks", role: "mobility" },
      { name: "turret", role: "weapon" },
      { name: "engine", role: "power" },
    ],
    hitLocation: [
      { min: 1,  part: "hull" },
      { min: 5,  part: "tracks" },
      { min: 8,  part: "turret" },
      { min: 11, part: "engine" },
    ],
    // Strawman ⚙ — heavy-Rig-grade armour, tuned in playtest.
    armour: {
      hull:   { direct: 13, severe: 15, critical: 17 },
      tracks: { direct: 14, severe: 16, critical: 17 },
      turret: { direct: 12, severe: 14, critical: 16 },
      engine: { direct: 8,  severe: 11, critical: 13 },
    },
    partSp: { hull: 8, tracks: 7, turret: 6, engine: 6 },
    hasHeat: false,
    hasArcs: true,
    actionBudget: 2,
    weaponMode: "flat-pick",
    reloads: true,
    hasEquipment: false,
    reactions: false,
    destruction: "single-model",
    speed: 3,
  },
  walker: {
    id: "walker",
    label: "Walker",
    parts: [
      { name: "hull",   role: "structural" },
      { name: "legs",   role: "mobility" },
      { name: "mount",  role: "weapon" },
      { name: "engine", role: "power" },
    ],
    hitLocation: [
      { min: 1,  part: "hull" },
      { min: 5,  part: "legs" },
      { min: 8,  part: "mount" },
      { min: 11, part: "engine" },
    ],
    // Strawman ⚙ — medium-Rig-grade armour.
    armour: {
      hull:   { direct: 11, severe: 14, critical: 17 },
      legs:   { direct: 11, severe: 13, critical: 15 },
      mount:  { direct: 10, severe: 13, critical: 15 },
      engine: { direct: 8,  severe: 10, critical: 12 },
    },
    partSp: { hull: 6, legs: 6, mount: 5, engine: 5 },
    hasHeat: false,
    hasArcs: true,
    actionBudget: 3,
    weaponMode: "flat-pick",
    reloads: true,
    hasEquipment: false,
    reactions: false,
    destruction: "single-model",
    speed: 4,
  },
};

// Support-unit role modules (spec: Support Units). A support unit is a Tank or
// Walker carrying exactly TWO distinct modules. Damage grants a real gun from
// UNIT_WEAPONS; the other three grant an ally-targeting action verb.
export const MODULES = {
  damage:  { id: "damage",  label: "Damage",  action: null },
  repair:  { id: "repair",  label: "Repair",  action: "fieldweld" },
  coolant: { id: "coolant", label: "Coolant", action: "vent" },
  recon:   { id: "recon",   label: "Recon",   action: "paint" },
};
export const MODULE_IDS = Object.keys(MODULES);

// Canonicalize a module list: lowercase, keep only known ids, drop duplicates,
// preserve first-seen order. Returns [] for non-arrays.
export function normalizeModules(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const id = String(m || "").trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(MODULES, id) && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

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

// Rig armour is nested by weight class; cold kinds (Tank, Walker) hold a flat
// map keyed by part name and ignore weightClass.
export function impactRow(kindId, partName, weightClass) {
  const armour = UNIT_KINDS[kindId]?.armour;
  if (!armour) return null;
  if (weightClass && armour[weightClass]) return armour[weightClass][partName];
  return armour[partName];
}
