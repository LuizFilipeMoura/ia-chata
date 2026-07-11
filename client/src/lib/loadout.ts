import { EQUIPMENT, WEAPON_UPGRADES, CHASSIS, randomEquipment } from "/shared/game-state.js";
import type { Rig } from "../state/types";

export interface LoadoutWeapon { name: string; upName: string; upTag: string; }
export interface LoadoutEquipment {
  family: string; label: string; passive: string;
  activeLabel: string; activeHeat: number; activeText: string;
}
export interface Loadout {
  /** Flat-pick kinds (Tank / Walker) carry one `unit` weapon; Rigs carry lr + melee. */
  flat: boolean;
  unit?: LoadoutWeapon;
  lr?: LoadoutWeapon;
  melee?: LoadoutWeapon;
  equipment: LoadoutEquipment | null;
}

function weapon(name: string | undefined, upId: string | undefined): LoadoutWeapon {
  const up = (WEAPON_UPGRADES[name as string] || []).find((u: { id: string }) => u.id === upId);
  return { name: name || "", upName: up?.name || "", upTag: up?.tag || "" };
}

/** Resolve a rig's stored loadout ids into display-ready names/tags/passive/active.
 *  Returns null when the rig carries no weapons (e.g. a minimal AI-added rig). */
export function buildLoadout(rig: Rig): Loadout | null {
  if (!rig.weapons) return null;
  const eqDef = rig.equipment ? EQUIPMENT[rig.equipment] : undefined;
  const equipment = eqDef ? {
    family: eqDef.family, label: eqDef.label, passive: eqDef.passive,
    activeLabel: eqDef.active.label, activeHeat: eqDef.active.heat, activeText: eqDef.active.text,
  } : null;
  // Cold kinds (Tank / Walker) store a single flat-pick weapon under `unit`.
  if (rig.weapons.unit) {
    return { flat: true, unit: weapon(rig.weapons.unit, undefined), equipment };
  }
  return {
    flat: false,
    lr: weapon(rig.weapons.longRange, rig.weaponUpgrades?.longRange),
    melee: weapon(rig.weapons.melee, rig.weaponUpgrades?.melee),
    equipment,
  };
}

/** Attrs for an `add` command that commissions a Rig from a random chassis
 *  loadout with random weapon upgrades + equipment. Server-side add enforcement
 *  only accepts chassis combos, so dev/seed adds must pick one too. */
export function randomAddAttrs(): Record<string, unknown> {
  const pb = CHASSIS[Math.floor(Math.random() * CHASSIS.length)];
  const randUpgrade = (name: string) => {
    const ups = WEAPON_UPGRADES[name] || [];
    return ups.length ? ups[Math.floor(Math.random() * ups.length)].id : undefined;
  };
  return {
    chassis: pb.id,
    class: pb.class,
    lr: pb.longRange,
    longRange: pb.longRange,
    melee: pb.melee,
    longRangeUpgrade: randUpgrade(pb.longRange),
    meleeUpgrade: randUpgrade(pb.melee),
    equipment: randomEquipment(),
  };
}
