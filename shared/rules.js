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
  reload:   { label: "Reload",      heat: 0, slot: 1 },
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
