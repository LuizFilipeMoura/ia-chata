// Registry of unit kinds (rig, tank, walker, …) with parts, hit locations, and
// toughness grids. Pure data + tiny lookups shared by server and client.

export const ROLES = ["structural", "power", "mobility", "weapon"];

// §7.5 — Toughness per part. Replaces the old 48-number impact grid: a shot's
// effective Penetration is compared to these via `woundTarget` (rules.js).
//
// Designed, not derived. Converting the old armour rows mechanically
// (`direct - 6`) yields engine values of T1-T3, which would let every weapon in
// the game wound an engine on 2+ and make it the only rational aim point.
//
// Per-location texture is carried TWICE on purpose: a soft T here, and a small
// SP pool in RIG_DEFAULTS (game-state.js). An engine is fragile because it is
// both easier to wound and has less to lose.
const RIG_TOUGHNESS = {
  light:    { hull: 4, arms: 3, legs: 3, engine: 3 },
  medium:   { hull: 5, arms: 4, legs: 4, engine: 3 },
};

// §8 vital-pool floor. `applyDamage` spends SP one point at a time, and a point
// landing PAST zero on a structural or power part fires `catastrophicAdditional`
// (game-state.js), which destroys the part and so the unit. A point landing
// exactly ON zero does not. So a structural/power pool smaller than the
// catalog's top per-wound Damage is not a pool at all — it is a coin flip, and
// the unit dies from full to one wound.
//
// That makes the floor structural, not a balance dial: every structural/power
// `partSp` below must be >= the top Damage in the game (currently 6: Wrecking
// Ball + Haymaker, tied with Siege Maul + Reinforced Head). Mobility/weapon pools are exempt —
// §8 does not kill on those roles, so they carry the fragility instead.
//
// Support-unit fragility therefore lives in `toughness` (below) and in the
// mobility/weapon pools, NOT in how small a hull or engine may be. Derived and
// enforced by "no unit of ANY kind dies to a SINGLE wound from full" in
// game-state.test.js; do not lower a hull/engine here to "tidy" it.
//
// The floor bounds ONE wound, not one attack: ROF and Damage multiply, so a
// full volley concentrating on one location can still kill from full, by design.
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
    toughness: RIG_TOUGHNESS,
    byWeight: true,
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
    // Strawman ⚙ — heavy-Rig-grade toughness, tuned in playtest.
    toughness: { hull: 6, tracks: 5, turret: 5, engine: 4 },
    // engine 8, not 6: the §8 vital floor above. tracks/turret stay small.
    partSp: { hull: 8, tracks: 7, turret: 6, engine: 8 },
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
    // Strawman ⚙ — medium-Rig-grade toughness.
    toughness: { hull: 5, legs: 4, mount: 4, engine: 3 },
    // hull/engine 8, not 6/5: the §8 vital floor above. legs/mount stay small —
    // that is where the Walker is still the most fragile thing fielded.
    partSp: { hull: 8, legs: 6, mount: 5, engine: 8 },
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

// Toughness for a part. Rig grids are keyed by weight class (`byWeight`);
// Tank/Walker are flat. Throws rather than returning a sentinel: every caller
// feeds this straight into woundTarget, where a non-numeric T coerces to 0 and
// yields a 2+ wound (90%) — i.e. a lookup typo would silently make a location
// the softest thing on the table. Fail loud instead.
export function toughnessOf(kindId, partName, weightClass) {
  const kind = UNIT_KINDS[kindId];
  if (!kind?.toughness) throw new Error(`toughnessOf: unknown kind "${kindId}"`);
  const row = kind.byWeight ? kind.toughness[weightClass] : kind.toughness;
  const v = row?.[partName];
  if (typeof v !== "number") {
    throw new Error(`toughnessOf: no T for ${kindId}/${weightClass ?? "flat"}/${partName}`);
  }
  return v;
}
