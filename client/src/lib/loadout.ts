import {
  EQUIPMENT, EQUIPMENT_UPGRADES, WEAPON_UPGRADES, CHASSIS, randomEquipment,
  rigEffects, WEAPONS, UNIT_WEAPONS,
} from "/shared/game-state.js";
import type { Rig } from "../state/types";

type Slot = "longRange" | "melee" | "unit";

export interface LoadoutWeapon {
  slot: Slot;
  name: string;
  melee: boolean;
  rof: { base: number; delta: number };
  pen: { base: number; delta: number };
  range: { text: string; delta: number };
  perks: string[];       // base perks
  addedPerks: string[];  // perks added by the upgrade (rendered green)
  upName: string;        // "" when no/unknown upgrade
  upTag: string;
  upNature: string;      // "" when no/unknown upgrade
}
export interface LoadoutEquipment {
  family: string; label: string; passive: string;
  activeLabel: string; activeHeat: number; activeText: string;
  upName?: string; upNature?: string; upTag?: string;
}
export interface Loadout {
  /** Flat-pick kinds (Tank / Walker) carry one `unit` weapon; Rigs carry lr + melee. */
  flat: boolean;
  unit?: LoadoutWeapon;
  lr?: LoadoutWeapon;
  melee?: LoadoutWeapon;
  equipment: LoadoutEquipment | null;
  modules?: string[];   // support-unit role modules (spec: Support Units)
  isSidearm?: boolean;  // true when the single weapon is the built-in Sidearm
}

// Resolve one weapon slot into display-ready base stats + upgrade deltas.
// Base numbers come straight from the weapon table; deltas and added perks
// come from the STRICTLY-resolved upgrade's `effect`. Unknown weapon/upgrade
// names degrade to zeros/"" — we do NOT use effectiveWeaponProfile here, since
// it silently falls back to the weapon's first upgrade for an unknown id and
// would produce phantom deltas/perks with no matching upgrade line.
function weapon(rig: Rig, slot: Slot): LoadoutWeapon {
  const name = (rig.weapons as Record<string, string | undefined>)?.[slot] || "";
  const table = slot === "unit" ? UNIT_WEAPONS : WEAPONS[slot];
  const base = table?.[name];
  const up = slot === "unit"
    ? null
    : (WEAPON_UPGRADES[name] || []).find(
        (u: { id: string }) => u.id === rig.weaponUpgrades?.[slot as "longRange" | "melee"],
      );
  const effect = (up?.effect || {}) as { rof?: number; pen?: number; range?: number; perks?: string[] };
  const isMelee = !!base?.melee;
  const rangeText = isMelee
    ? `RNG ${base?.rng?.[0] ?? 0}"`
    : `${base?.minRange ?? 0}–${base?.maxRange ?? 0}"`;
  const basePerks: string[] = base?.perks || [];
  const addedPerks: string[] = (effect.perks || []).filter((p) => !basePerks.includes(p));
  return {
    slot,
    name,
    melee: isMelee,
    rof: { base: base?.rof ?? 0, delta: effect.rof || 0 },
    pen: { base: base?.pen ?? 0, delta: effect.pen || 0 },
    range: { text: rangeText, delta: effect.range || 0 },
    perks: basePerks,
    addedPerks,
    upName: up?.name || "",
    upTag: up?.tag || "",
    upNature: up?.nature || "",
  };
}

/** Resolve a rig's stored loadout ids into display-ready names/tags/passive/active.
 *  Returns null when the rig carries no weapons (e.g. a minimal AI-added rig). */
export function buildLoadout(rig: Rig): Loadout | null {
  if (!rig.weapons) return null;
  const eqDef = rig.equipment ? EQUIPMENT[rig.equipment] : undefined;
  const eqUp = rig.equipment && rig.equipmentUpgrade
    ? (EQUIPMENT_UPGRADES[rig.equipment] || []).find((u) => u.id === rig.equipmentUpgrade)
    : undefined;
  const equipment = eqDef ? {
    family: eqDef.family, label: eqDef.label, passive: eqDef.passive,
    activeLabel: eqDef.active.label,
    activeHeat: rigEffects(rig).actionHeat[eqDef.active.key],
    activeText: eqDef.active.text,
    upName: eqUp?.name, upNature: eqUp?.nature, upTag: eqUp?.tag,
  } : null;
  // Cold kinds (Tank / Walker) store a single flat-pick weapon under `unit`.
  if (rig.weapons.unit) {
    return {
      flat: true,
      unit: weapon(rig, "unit"),
      equipment,
      modules: Array.isArray(rig.modules) ? rig.modules : [],
      isSidearm: rig.weapons?.unit === "Sidearm",
    };
  }
  return {
    flat: false,
    lr: weapon(rig, "longRange"),
    melee: weapon(rig, "melee"),
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
