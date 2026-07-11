import { WEAPON_UPGRADES } from "/shared/game-state.js";

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
