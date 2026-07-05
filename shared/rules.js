// Static rulebook data shared by the resolution engine (server) and the
// battle UI (client). Pure data + tiny lookups — no state, no randomness.

// Action catalogue (§5). `heat` is the base heat generated; `slot` is the
// action-budget cost. Shut Down is special-cased by the engine (declared before
// any other action; forfeits the activation and cools to the heat floor).
export const ACTIONS = {
  move:     { label: "Move",        heat: 1, slot: 1 },
  sprint:   { label: "Sprint",      heat: 2, slot: 1 },
  fire:     { label: "Fire Weapon", heat: 1, slot: 1 },
  aimed:    { label: "Aimed Shot",  heat: 1, slot: 1 },
  ram:      { label: "Ram",         heat: 1, slot: 1 },
  reload:   { label: "Reload",      heat: 1, slot: 1 },
  repair:   { label: "Repair",      heat: 0, slot: 1 },
  shutdown: { label: "Shut Down",   heat: 0, slot: 0 },
  prepare:  { label: "Prepare",     heat: 1, slot: 1 },
};

// Heat Threshold Table (§6), consulted with a D12 + overheat bonus total.
// Ordered high→low so the first row whose `min` is met wins.
export const HEAT_THRESHOLDS = [
  { min: 17, key: "catastrophic",   label: "Catastrophic Failure",
    text: "Catastrophic damage to all components; heat can no longer decrease." },
  { min: 14, key: "engine-failure", label: "Engine Failure",
    text: "2 damage to the Engine; heat can no longer decrease." },
  { min: 12, key: "buckling",       label: "Structural Buckling",
    text: "1 damage to each of Hull, Engine, Arms and Legs." },
  { min: 10, key: "blowout",        label: "Hydraulic Blowout",
    text: "2 damage to the Legs; Speed halved next turn." },
  { min: 8,  key: "detonation",     label: "Ammunition Detonation",
    text: "2 damage to the Arms." },
  { min: 6,  key: "stall",          label: "System Stall",
    text: "1 damage to the Engine." },
  { min: 1,  key: "safe",           label: "Nothing happens",
    text: "The engine holds." },
];

export function heatThreshold(total) {
  const n = Math.floor(Number(total) || 0);
  return HEAT_THRESHOLDS.find((row) => n >= row.min) || HEAT_THRESHOLDS.at(-1);
}

// Weight-class STR modifier applied to every Impact Roll (§12); Aim target
// number (§2, roll >= to hit); Ram STR by weight class (§5).
export const WEIGHT_STR_MOD = { light: -2, medium: 0, heavy: 2, colossal: 4 };
export const AIM = { light: 4, medium: 4, heavy: 3, colossal: 3 };
export const RAM_STR = { light: 8, medium: 9, heavy: 10, colossal: 11 };

// Hit-location table (§7): defender's D12 → component.
export function hitLocation(d12) {
  const n = Math.floor(Number(d12) || 0);
  if (n <= 4) return "hull";
  if (n <= 7) return "arms";
  if (n <= 10) return "legs";
  return "engine";
}

// Impact Tables (§2): minimum totals for each severity, per class per location.
export const IMPACT = {
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

// Impact Roll total vs a location row → SP lost and severity tier.
export function impactSeverity(total, row) {
  const n = Math.floor(Number(total) || 0);
  if (n >= row.critical) return { sp: 3, tier: "critical" };
  if (n >= row.severe) return { sp: 2, tier: "severe" };
  if (n >= row.direct) return { sp: 1, tier: "direct" };
  return { sp: 0, tier: "none" };
}
