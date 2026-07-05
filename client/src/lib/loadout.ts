import { EQUIPMENT, WEAPON_UPGRADES } from "/shared/game-state.js";
import type { Rig } from "../state/types";

export interface LoadoutWeapon { name: string; upName: string; upTag: string; }
export interface LoadoutEquipment {
  family: string; label: string; passive: string;
  activeLabel: string; activeHeat: number; activeText: string;
}
export interface Loadout { lr: LoadoutWeapon; melee: LoadoutWeapon; equipment: LoadoutEquipment | null; }

function weapon(name: string | undefined, upId: string | undefined): LoadoutWeapon {
  const up = (WEAPON_UPGRADES[name as string] || []).find((u: { id: string }) => u.id === upId);
  return { name: name || "", upName: up?.name || "", upTag: up?.tag || "" };
}

/** Resolve a rig's stored loadout ids into display-ready names/tags/passive/active.
 *  Returns null when the rig carries no weapons (e.g. a minimal AI-added rig). */
export function buildLoadout(rig: Rig): Loadout | null {
  if (!rig.weapons) return null;
  const eqDef = rig.equipment ? EQUIPMENT[rig.equipment] : undefined;
  return {
    lr: weapon(rig.weapons.longRange, rig.weaponUpgrades?.longRange),
    melee: weapon(rig.weapons.melee, rig.weaponUpgrades?.melee),
    equipment: eqDef ? {
      family: eqDef.family, label: eqDef.label, passive: eqDef.passive,
      activeLabel: eqDef.active.label, activeHeat: eqDef.active.heat, activeText: eqDef.active.text,
    } : null,
  };
}
