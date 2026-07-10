// Static rulebook data shared by the resolution engine (server) and the
// battle UI (client). Pure data + tiny lookups — no state, no randomness.

import { hitPart, impactRow as _impactRow } from "./unit-kinds.js";

// Action catalogue (§5). `heat` is the base heat generated; `slot` is the
// action-budget cost. Shut Down is special-cased by the engine (declared before
// any other action; forfeits the activation and cools to the heat floor).
export const ACTIONS = {
  move:     { label: "Move",        heat: 1, slot: 1 },
  sprint:   { label: "Sprint",      heat: 2, slot: 1 },
  fire:     { label: "Fire Weapon", heat: 1, slot: 1 },
  aimed:    { label: "Aimed Shot",  heat: 1, slot: 1 },
  reload:   { label: "Reload",      heat: 1, slot: 1 },
  repair:   { label: "Repair",      heat: 1, slot: 1 },
  shutdown: { label: "Shut Down",   heat: 0, slot: 0 },
  prepare:  { label: "Prepare",     heat: 1, slot: 1 },
  disengage:{ label: "Disengage",   heat: 1, slot: 1 },
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
// number (§2, roll >= to hit).
export const WEIGHT_STR_MOD = { light: -2, medium: 0, heavy: 2, colossal: 4 };
export const AIM = { light: 4, medium: 4, heavy: 3, colossal: 3 };

// Hit-location table (§7): defender's D12 → part-name, keyed by unit kind.
export function hitLocation(kindId, d12) {
  return hitPart(kindId, d12);
}

// Impact Tables (§2): minimum totals for each severity, per kind × part × class.
export function impactRow(kindId, partName, weightClass) {
  return _impactRow(kindId, partName, weightClass);
}

// Impact Roll total vs a location row → SP lost and severity tier.
export function impactSeverity(total, row) {
  const n = Math.floor(Number(total) || 0);
  if (n >= row.critical) return { sp: 3, tier: "critical" };
  if (n >= row.severe) return { sp: 2, tier: "severe" };
  if (n >= row.direct) return { sp: 1, tier: "direct" };
  return { sp: 0, tier: "none" };
}

// §13 Bulwark / Raise Shield — which arcs a raised shield covers. Base: negate
// the front, blunt (−4) side/rear. Tower Shield upgrade: negation extends to the
// side arc; only the rear is blunted. Lives here so combat.js can use it without
// importing game-state.js (which would create a cycle).
export function shieldCoverage(rig) {
  const tower = rig?.weaponUpgrades?.melee === "tower-shield";
  return tower
    ? { negate: ["front", "side"], blunt: ["rear"] }
    : { negate: ["front"], blunt: ["side", "rear"] };
}
