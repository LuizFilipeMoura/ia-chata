import { WEAPON_UPGRADES, EQUIPMENT_UPGRADES } from "/shared/game-state.js";

export const CHASSIS_NAME: Record<string, string> = {
  "light-claw-autocannon": "Ironjaw",
  "light-missile-flamethrower": "Cinderwalk",
  "light-saw-minigun": "Scrapmaw",
  "light-wreckingball-double": "Sledge",
  "light-sword-arc": "Arclight",
  "medium-lance-mortar": "Halberd",
  "medium-shield-siege": "Rampart",
  "medium-sniper-chainsaw": "Deadeye",
};
const WEAPON_GLYPH: Record<string, string> = {
  "Autocannon": "🎯", "Mini Gun": "🎯", "Double MG": "🎯", "Sniper Cannon": "🎯",
  "Arc Gun": "⚡", "Mortar": "💥", "Missile Barrage": "🚀", "Siege Maul": "🔨",
  "Claw": "🦾", "Flamethrower": "🔥", "Circular Saw": "🪚", "Chainsaw": "🪚",
  "Wrecking Ball": "⛓️", "Sword": "🗡️", "Lance": "🗡️", "Bulwark Shield": "🛡️",
};
export const weaponGlyph = (weapon: string): string => WEAPON_GLYPH[weapon] || "⚙";
const NATURE_LABEL: Record<string, string> = { field: "Standard", tuned: "Machined", prototype: "Prototype" };
export const natureLabel = (nature: string): string => NATURE_LABEL[nature] || nature;
export const NODE_MARK = ["I", "II", "III"];
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
  if (tier.catch) return { payoff: tier.tag, catch: tier.catch };
  const m = tier.tag.match(/^(.*?)(?:\s+—\s+|;\s+)(.*)$/);
  if (m) return { payoff: m[1].trim(), catch: m[2].trim() };
  return { payoff: tier.tag, catch: null };
}
