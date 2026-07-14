import { CHASSIS, WEAPON_UPGRADES, EQUIPMENT_UPGRADES } from "/shared/game-state.js";

// id → codename, derived straight from the CHASSIS catalogue so a chassis is
// named automatically the moment it's added there (its `name` field). No manual
// map to keep in sync.
export const CHASSIS_NAME: Record<string, string> = Object.fromEntries(
  CHASSIS.map((c: { id: string; name: string }) => [c.id, c.name]),
);
const WEAPON_GLYPH: Record<string, string> = {
  "Autocannon": "🎯", "Mini Gun": "🎯", "Double MG": "🎯", "Sniper Cannon": "🎯",
  "Arc Gun": "⚡", "Mortar": "💥", "Missile Barrage": "🚀", "Siege Maul": "🔨",
  "Claw": "🦾", "Flamethrower": "🔥", "Circular Saw": "🪚", "Chainsaw": "🪚",
  "Wrecking Ball": "⛓️", "Sword": "🗡️", "Lance": "🗡️", "Bulwark Shield": "🛡️",
};
export const weaponGlyph = (weapon: string): string => WEAPON_GLYPH[weapon] || "⚙";
// Rig codenames are colours. Map each to a { swatch, text } pair: `swatch` is
// the literal colour (or a CSS pattern for Zebra); `text` is a readability-
// tuned tint that stays legible on the dark v2 panels. Keyed by the codename.
export interface RigColor { swatch: string; text: string }
const RIG_COLORS: Record<string, RigColor> = {
  Red:       { swatch: "#e23b3b", text: "#ff6a6a" },
  Green:     { swatch: "#3ec14e", text: "#57d867" },
  Copper:    { swatch: "#c8843c", text: "#e0a05a" },
  Black:     { swatch: "#0d0d0d", text: "#b3b3b3" },
  Silver:    { swatch: "linear-gradient(135deg,#e9edf2,#9aa2ac)", text: "#d6dbe1" },
  Pumpkin:   { swatch: "#e8792a", text: "#ff954a" },
  Turquoise: { swatch: "#2ec9c0", text: "#4fe0d7" },
  Zebra:     { swatch: "repeating-linear-gradient(60deg,#111 0 4px,#f4f4f4 4px 8px)", text: "#e6e6e6" },
  Purple:    { swatch: "#a24bd6", text: "#c078ee" },
  Gold:      { swatch: "#e3b23c", text: "#f4cb5c" },
  Blue:      { swatch: "#3b82f6", text: "#6aa6ff" },
};
export const rigColor = (name: string): RigColor | null => RIG_COLORS[name] || null;

const NATURE_LABEL: Record<string, string> = { field: "Standard", tuned: "Machined", prototype: "Prototype" };
export const natureLabel = (nature: string): string => NATURE_LABEL[nature] || nature;
export function firstUpgradeId(name: string): string | null {
  return (WEAPON_UPGRADES[name] || [])[0]?.id || null;
}
export function firstEquipmentUpgradeId(equipmentId: string): string | null {
  return (EQUIPMENT_UPGRADES[equipmentId] || [])[0]?.id || null;
}

// One-line summaries of the ally-targeting support modules, shown on the
// commission loadout cards. Damage is represented by the gun itself, so it is
// intentionally absent here.
export const MODULE_BLURB: Record<string, string> = {
  repair:  'Field Weld — heal an ally or self within 2".',
  coolant: 'Vent — cool a friendly Rig within 2" by 2 heat.',
  recon:   'Paint — mark an enemy; allies ignore its cover and gain +1 Aim.',
};

export interface UpgradeTier {
  id: string;
  nature: string;
  name: string;
  tag: string;
  catch?: string;
  effect?: unknown;
}

// Reward/risk climb the tier ladder. Derived purely from nature so no upgrade
// row needs to carry pip counts.
const PIPS: Record<string, { reward: number; risk: number }> = {
  field: { reward: 1, risk: 0 },
  tuned: { reward: 2, risk: 1 },
  prototype: { reward: 3, risk: 2 },
};
export function upgradePips(nature: string): { reward: number; risk: number } {
  return PIPS[nature] || PIPS.field;
}

// Payoff vs Catch text for a tier. Prefer an authored `catch`; otherwise split
// the tag on the first cost delimiter (" — " or ";"). A tag with no delimiter is
// all payoff and has no catch.
export function splitUpgradeTag(tier: UpgradeTier): { payoff: string; catch: string | null } {
  const m = tier.tag.match(/^(.*?)(?:\s+—\s+|;\s+)(.*)$/);
  const payoff = m ? m[1].trim() : tier.tag;
  const parsed = m ? m[2].trim() : null;
  return { payoff, catch: tier.catch ?? parsed };
}
