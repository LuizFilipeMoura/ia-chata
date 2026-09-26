// Walkers and drones in the 3D client: the one place that knows a unit may not
// be a chassis rig. A rig has a long-range gun and a melee weapon; a walker or
// drone carries ONE flat-pick weapon (a gun or a blade) plus its modules.
import { UNIT_WEAPONS, DRONE_TYPES, effectiveWeaponProfile, templateById, CHASSIS } from "/shared/game-state.js";
import { partNamesOf, kindOf } from "/shared/unit-kinds.js";

export const isRig = (r) => kindOf(r) === "rig";
export const partsOf = (r) => partNamesOf(kindOf(r));
export const unitWeapon = (r) => (r?.weapons?.unit != null ? UNIT_WEAPONS[r.weapons.unit] || null : null);

// The weapon names a unit can attack with: { longRange, melee } (null = none).
export function weaponNames(r) {
  const u = r?.weapons?.unit;
  if (u != null) return UNIT_WEAPONS[u]?.melee ? { longRange: null, melee: u } : { longRange: u, melee: null };
  return { longRange: r?.weapons?.longRange ?? null, melee: r?.weapons?.melee ?? null };
}
export const weaponName = (r, slot) => weaponNames(r)[slot === "melee" ? "melee" : "longRange"];

// The ranged profile a unit shoots with (a rig's upgraded gun, a walker's mount).
export function rangedProfile(r) {
  const u = unitWeapon(r);
  if (u) return u.melee ? null : u;
  return effectiveWeaponProfile("longRange", r?.weapons?.longRange, r);
}
export const rangedLoaded = (r) => (r?.weapons?.unit != null ? r.loaded?.unit !== false : r?.loaded?.longRange !== false);

// "Medic Walker", "Sapper Drone", or the chassis label.
export function unitLabel(r) {
  const k = kindOf(r);
  if (k === "drone") return `${DRONE_TYPES[r.drone]?.label || "Hunter"} Drone`;
  if (k === "walker") return templateById(r.template)?.name || "Support Walker";
  return CHASSIS.find((c) => c.id === r.chassis)?.label || "";
}
// One line for the unit's kit: "Rocket Pod · Repair, Recon".
export function kitLine(r) {
  if (isRig(r)) return `${r.weapons?.longRange} · ${r.weapons?.melee}`;
  const mods = (r.modules || []).filter((m) => m !== "damage").map((m) => ({ repair: "Weld", coolant: "Vent", recon: "Paint" }[m] || m));
  return [r.weapons?.unit, ...mods].filter(Boolean).join(" · ");
}
