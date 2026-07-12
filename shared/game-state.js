import { ACTIONS, heatThreshold, hitLocation, impactSeverity, impactRow, HEAT_CAPACITY } from "./rules.js";
import { resolveAttack } from "./combat.js";
import {
  FIELD_DEFAULT, clampDimensions, computeObjectives, scatterTerrain,
} from "./field.js";
import { UNIT_KINDS, kindOf, roleOf, partsByRole, partNamesOf, normalizeModules } from "./unit-kinds.js";

export const RIG_DEFAULTS = {
  light:    { hull: 6, arms: 5, legs: 5, engine: 4 },
  medium:   { hull: 7, arms: 6, legs: 6, engine: 5 },
  heavy:    { hull: 8, arms: 7, legs: 7, engine: 6 },
  colossal: { hull: 9, arms: 8, legs: 8, engine: 7 },
};
export const LOCS = ["hull", "arms", "legs", "engine"];
// HEAT_CAPACITY now lives in rules.js (combat.js needs it and imports only
// from rules.js); re-exported here so existing callers (client, tests) keep
// importing it from game-state.js.
export { HEAT_CAPACITY };
export const MAX_OVERHEAT_BONUS = 10;
export const SUPPORTED_RIG_CLASSES = ["light", "medium"];
export const MAX_RIGS_PER_SIDE = 3;
export const MAX_RIGS_TOTAL = 6;
// The objective game runs this many rounds before victory resolves on points
// (§11). Doubled from the original 5 to pair with the ~2× per-rig SP scaling —
// longer fights so the upgrade natures (ramps, DoT, attrition) have time to matter.
export const MAX_ROUNDS = 10;
// Base weapons carry stats only. Perks are delivered exclusively by the chosen
// weapon upgrade (see WEAPON_UPGRADES); `melee: true` is a structural flag (not a
// perk) that drives arc/range logic in combat.js and the wizards.
export const WEAPONS = {
  longRange: {
    "Mini Gun":       { rof: 8, str: 4,  sweet: 7,  peak: 2, dropoff: 0.35, minRange: 0, maxRange: 18, perks: ["Raking Fire"] },
    "Double MG":      { rof: 8, str: 6,  sweet: 9,  peak: 1, dropoff: 0.25, minRange: 0, maxRange: 20, perks: ["Raking Fire"] },
    "Autocannon":     { rof: 4, str: 8,  sweet: 12, peak: 1, dropoff: 0.22, minRange: 0, maxRange: 26 },
    "Arc Gun":        { rof: 2, str: 10, sweet: 20, peak: 1, dropoff: 0.18, minRange: 0, maxRange: 32 },
    "Mortar":         { rof: 3, str: 9,  sweet: 18, peak: 1, dropoff: 0.15, minRange: 6, maxRange: 34 },
    "Sniper Cannon":  { rof: 1, str: 12, sweet: 22, peak: 2, dropoff: 0.15, minRange: 0, maxRange: 28 },
    "Siege Maul":     { rof: 1, str: 13, sweet: 8,  peak: 1, dropoff: 0.30, minRange: 0, maxRange: 16 },
    "Missile Barrage":{ rof: 4, str: 9,  sweet: 20, peak: 1, dropoff: 0.15, minRange: 6, maxRange: 34 },
    "Harpoon":        { rof: 1, str: 12, sweet: 14, peak: 2, dropoff: 0.28, minRange: 0, maxRange: 22 },
    "Rivet Gun":      { rof: 6, str: 4,  sweet: 6,  peak: 2, dropoff: 0.40, minRange: 0, maxRange: 14 },
  },
  melee: {
    "Sword":         { rof: 2, str: 6,  acc: [0, 0], rng: [2, 2], melee: true },
    "Circular Saw":  { rof: 3, str: 6,  acc: [0, 0], rng: [2, 2], melee: true },
    "Chainsaw":      { rof: 3, str: 8,  acc: [0, 0], rng: [2, 2], melee: true },
    "Claw":          { rof: 2, str: 8,  acc: [1, 1], rng: [2, 2], melee: true },
    "Lance":         { rof: 1, str: 11, acc: [1, 1], rng: [2, 2], melee: true },
    "Wrecking Ball": { rof: 1, str: 12, acc: [0, 0], rng: [2, 2], melee: true },
    "Bulwark Shield":{ rof: 1, str: 6,  acc: [0, 0], rng: [2, 2], melee: true },
    "Flamethrower":  { rof: 4, str: 7,  acc: [1, 0], rng: [2, 2], melee: true },
    "Anchor":        { rof: 1, str: 12, acc: [0, 0], rng: [2, 2], melee: true },
    "Pressure Claw": { rof: 2, str: 9,  acc: [1, 1], rng: [2, 2], melee: true },
  },
};

// Flat unit-weapon list (spec §Weapons, "Unit-weapon list"). Tanks and Walkers
// pick exactly one. Marked flatPick: true so combat.js skips the weight-class
// STR modifier — the listed STR is the shot's STR on any chassis.
export const UNIT_WEAPONS = {
  "Tank Cannon":      { rof: 1, str: 12, sweet: 18, peak: 2, dropoff: 0.16, minRange: 0, maxRange: 28, flatPick: true },
  "Autocannon Mount": { rof: 3, str: 8,  sweet: 12, peak: 1, dropoff: 0.22, minRange: 0, maxRange: 26, flatPick: true },
  "Coaxial MG":       { rof: 6, str: 5,  sweet: 8,  peak: 2, dropoff: 0.35, minRange: 0, maxRange: 18, flatPick: true },
  "Rocket Pod":       { rof: 2, str: 10, sweet: 20, peak: 1, dropoff: 0.16, minRange: 4, maxRange: 34, flatPick: true },
  "Dozer Blade":      { rof: 1, str: 10, acc: [0, 0],  rng: [2, 2], melee: true, flatPick: true },
  "Ram Spike":        { rof: 1, str: 11, acc: [1, 0],  rng: [2, 2], melee: true, flatPick: true },
  // Built-in weak weapon every support unit carries; replaced by a Damage
  // module. peak 0 + dropoff 0 = a flat ACC 0 at any distance (spec §Sidearm).
  "Sidearm":          { rof: 2, str: 4,  sweet: 6,  peak: 0, dropoff: 0,    minRange: 0, maxRange: 12, flatPick: true },
};

export function normalizeUnitWeapon(name) {
  if (!name) return null;
  const ref = String(name).trim().toLowerCase();
  return Object.keys(UNIT_WEAPONS).find((w) => w.toLowerCase() === ref) || null;
}

// Chassis Rigs — the physical minis arrive pre-assembled, so a Rig is
// commissioned by picking one of these fixed weight-class + weapon combos rather
// than free-picking each slot. Weapon upgrades are still chosen per weapon at
// commission time; only the two weapons and the weight class are locked. Names
// (`longRange` / `melee`) index straight into WEAPONS. `sp` is the per-rig
// Structure Points (≈2× the old class defaults) — a durability lever tuned to
// each rig's identity; makeRig uses it in place of RIG_DEFAULTS.
export const CHASSIS = [
  { id: "light-claw-autocannon",      label: "Claw · Autocannon",           class: "light",  longRange: "Autocannon",      melee: "Claw",          sp: { hull: 13, arms: 11, legs: 11, engine: 9 } },
  { id: "light-missile-flamethrower", label: "Missile Barrage · Flamethrower", class: "light", longRange: "Missile Barrage", melee: "Flamethrower", sp: { hull: 12, arms: 10, legs: 10, engine: 8 } },
  { id: "light-saw-minigun",          label: "Circular Saw · Mini Gun",     class: "light",  longRange: "Mini Gun",        melee: "Circular Saw",  sp: { hull: 13, arms: 11, legs: 11, engine: 9 } },
  { id: "light-wreckingball-double",  label: "Wrecking Ball · Double MG",   class: "light",  longRange: "Double MG",       melee: "Wrecking Ball", sp: { hull: 12, arms: 10, legs: 11, engine: 8 } },
  { id: "light-sword-arc",            label: "Sword · Arc Gun",             class: "light",  longRange: "Arc Gun",         melee: "Sword",         sp: { hull: 11, arms: 9,  legs: 10, engine: 7 } },
  { id: "light-harpoon-anchor",       label: "Harpoon · Anchor",            class: "light",  longRange: "Harpoon",         melee: "Anchor",        sp: { hull: 12, arms: 11, legs: 11, engine: 8 } },
  { id: "light-rivet-pressureclaw",   label: "Rivet Gun · Pressure Claw",   class: "light",  longRange: "Rivet Gun",       melee: "Pressure Claw", sp: { hull: 13, arms: 11, legs: 10, engine: 9 } },
  { id: "medium-lance-mortar",        label: "Lance · Mortar",              class: "medium", longRange: "Mortar",          melee: "Lance",         sp: { hull: 14, arms: 12, legs: 12, engine: 10 } },
  { id: "medium-shield-siege",        label: "Bulwark Shield · Siege Maul", class: "medium", longRange: "Siege Maul",      melee: "Bulwark Shield", sp: { hull: 16, arms: 13, legs: 12, engine: 11 } },
  { id: "medium-sniper-chainsaw",     label: "Sniper Cannon · Chainsaw",    class: "medium", longRange: "Sniper Cannon",   melee: "Chainsaw",      sp: { hull: 12, arms: 11, legs: 11, engine: 9 } },
];

// Fixed test roster for the `seed` verb: 6 distinct chassis, 3 per side. Varied
// weight classes (3 medium / 3 light — the catalogue has no heavy). All chassis
// ids are unique, honouring the no-mirror-matchup invariant (AGENTS.md).
export const SEED_ROSTER = [
  { name: "A1", owner: "a", chassis: "medium-lance-mortar" },
  { name: "A2", owner: "a", chassis: "light-claw-autocannon" },
  { name: "A3", owner: "a", chassis: "light-sword-arc" },
  { name: "B1", owner: "b", chassis: "medium-shield-siege" },
  { name: "B2", owner: "b", chassis: "medium-sniper-chainsaw" },
  { name: "B3", owner: "b", chassis: "light-harpoon-anchor" },
];

export function chassisById(id) {
  if (!id) return null;
  const ref = String(id).trim().toLowerCase();
  return CHASSIS.find((p) => p.id === ref) || null;
}

// Find the chassis whose fixed loadout matches an exact (class, longRange,
// melee) triple — case-insensitive. Lets callers that only know the weapon combo
// (e.g. the AI tracker tag) resolve back to the canonical chassis.
export function matchChassisCombo(cls, longRange, melee) {
  const c = String(cls || "").trim().toLowerCase();
  const lr = String(longRange || "").trim().toLowerCase();
  const ml = String(melee || "").trim().toLowerCase();
  if (!c || !lr || !ml) return null;
  return CHASSIS.find(
    (p) => p.class === c && p.longRange.toLowerCase() === lr && p.melee.toLowerCase() === ml,
  ) || null;
}

// Resolve an `add` command's attrs to the chassis it must use — by id first,
// then by exact weapon+class combo. Returns the CHASSIS entry or null.
// Server-side enforcement uses this so a rig can only be commissioned as one of
// the fixed chassis loadouts (weapons + weight class are not free-picked).
export function resolveChassis(attrs = {}) {
  return (
    chassisById(attrs.chassis) ||
    matchChassisCombo(attrs.class || attrs.weightClass, attrs.longRange || attrs.lr, attrs.melee)
  );
}

// Rig equipment loadout (docs/superpowers/specs/2026-07-05-rig-equipment-loadout-design.md,
// Part 1). One slot per Rig. Passives hook into existing systems (see makeRig /
// runRecovery / catastrophicOnZero / performAction below); actives are ordinary
// actions gated to the Rig carrying the matching equipment — unlimited use,
// leashed only by the 5-slot action budget and the heat they generate.
export const EQUIPMENT = {
  "ablative-plating": {
    family: "Armor", label: "Ablative Plating", passive: "+1 max SP to Hull",
    active: { key: "harden", label: "Harden", heat: 1,
      text: "Until this Rig's next activation, all impact rolls against it are at −1." },
  },
  "radiator-array": {
    family: "Cooling", label: "Radiator Array", passive: "Cools 2 heat in Recovery instead of 1",
    active: { key: "purge", label: "Purge", heat: -2, text: "Vent heat on demand." },
  },
  "servo-actuators": {
    family: "Mobility", label: "Servo Actuators", passive: "Sprint costs 1 heat instead of 2",
    active: { key: "jumpjets", label: "Jump Jets", heat: 2,
      text: "Move up to base Speed, ignoring terrain, enemy Rigs, and all leg-damage / Speed-halved penalties." },
  },
  "overclock-core": {
    family: "Power", label: "Overclock Core",
    passive: "The first time this Rig's Engine reaches 0 SP, it does not skip its next activation",
    active: { key: "overclock", label: "Overclock", heat: 3, text: "+2 actions this activation (net +1 after the slot)." },
  },
  "field-repair-suite": {
    family: "Utility", label: "Field Repair Suite", passive: "The Repair action restores +1 additional SP",
    active: { key: "emergencypatch", label: "Emergency Patch", heat: 2,
      text: "Guaranteed repair 2 SP to one location, no D12 roll." },
  },
};

// Reverse lookup: active-ability key -> the equipment id that grants it.
export const EQUIPMENT_ACTIVE_BY_KEY = Object.fromEntries(
  Object.entries(EQUIPMENT).map(([id, e]) => [e.active.key, id])
);

// The three §5 preparation reactions. Unknown/missing input falls back to brace.
export const PREP_TYPES = ["brace", "evasive", "return"];

export function hasBulwarkShield(rig) {
  return rig?.weapons?.melee === "Bulwark Shield";
}

// shieldCoverage lives in rules.js (shared with combat.js without an import
// cycle); re-exported here so callers/tests can reach it via game-state.
export { shieldCoverage } from "./rules.js";

// "raise-shield" is a fourth, gated §5 preparation available only to Rigs
// carrying a Bulwark Shield (§13 Bulwark); everything else falls back to brace.
export function normalizePrep(type, rig) {
  const ref = String(type || "").trim().toLowerCase();
  if (ref === "raise-shield") return hasBulwarkShield(rig) ? "raise-shield" : "brace";
  return PREP_TYPES.includes(ref) ? ref : "brace";
}

export function normalizeEquipment(id) {
  if (!id) return null;
  const ref = String(id).trim().toLowerCase();
  return Object.keys(EQUIPMENT).includes(ref) ? ref : null;
}

// The three upgrade natures (AGENTS.md). Field = unconditional upside; Tuned =
// conditional upside; Prototype = systemic/tracked, may carry a downside, and a
// rig may run at most one. Order is display order.
export const NATURES = ["field", "tuned", "prototype"];

export function upgradeNature(weaponName, upgradeId) {
  const u = (WEAPON_UPGRADES[weaponName] || []).find((x) => x.id === upgradeId);
  return u?.nature || null;
}

// How many of a rig's two chosen weapon upgrades are Prototype nature. Used to
// enforce "at most one Prototype per rig" (AGENTS.md).
export function countPrototypes(weapons = {}, upgrades = {}) {
  let n = 0;
  if (upgradeNature(weapons.longRange, upgrades.longRange) === "prototype") n++;
  if (upgradeNature(weapons.melee, upgrades.melee) === "prototype") n++;
  return n;
}

// Weapon upgrades (Part 2 of the design) — every weapon offers exactly three
// signature upgrades, one of each nature (Field / Tuned / Prototype), authored
// as flavor + a toolkit-effect tag. New-mechanic Prototype/Tuned upgrades ship
// `effect: {}` until the mechanics plan implements them (TODO(mechanics)).
export const WEAPON_UPGRADES = {
  "Mini Gun": [
    { id: "suppressive-fire", nature: "field", name: "Suppressive Fire", tag: "Gains Shock", effect: { perks: ["Shock"] } },
    { id: "extended-belt", nature: "tuned", name: "Extended Belt", tag: "+2 ROF; dice showing 1 add heat", effect: { rof: 2, heatOnOnes: true } },
    { id: "suppression-lock", nature: "prototype", name: "Suppression Lock", tag: "Grind one target down turn by turn until it's pinned", effect: { suppressLock: true } },
  ],
  "Double MG": [
    { id: "gyro-mount", nature: "field", name: "Gyro Mount", tag: "Reroll one missed to-hit die", effect: { rerollMisses: 1 } },
    { id: "pinning-burst", nature: "tuned", name: "Pinning Burst", tag: "4+ hits: target loses 1 action next activation", effect: { pinOnHits: 4 } },
    { id: "kneecapper", nature: "prototype", name: "Kneecapper", tag: "Rake legs/arms from any arc to cripple them; never hull/engine", effect: { kneecapper: true } },
  ],
  "Autocannon": [
    { id: "depleted-core", nature: "field", name: "Depleted Core", tag: "+2 STR", effect: { str: 2 } },
    { id: "ap-shells", nature: "tuned", name: "AP Shells", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "penetrator-rounds", nature: "prototype", name: "Penetrator Rounds", tag: "Every 3rd volley ignores armour; belt cycles slow after", effect: { penetrator: true } },
  ],
  "Arc Gun": [
    { id: "ion-burn", nature: "field", name: "Ion Burn", tag: "Gains Incendiary", effect: { perks: ["Incendiary"] } },
    { id: "systems-overload", nature: "tuned", name: "Systems Overload", tag: "On hit: target loses 1 action next activation", effect: { onHit: "systems-overload" } },
    { id: "ion-storm", nature: "prototype", name: "Ion Storm", tag: "EMP a rig's systems for a turn; overloads your own gun", effect: { ionStorm: true } },
  ],
  "Mortar": [
    { id: "cluster-shells", nature: "field", name: "Cluster Shells", tag: "On hit: 1 SP to a second random location", effect: { onHit: "cluster-shells" } },
    { id: "airburst-fuze", nature: "tuned", name: "Airburst Fuze", tag: "Ignores cover", effect: { ignoreCover: true } },
    { id: "barrage", nature: "prototype", name: "Barrage", tag: "Shell a zone for 2 rounds; mortar locked + hot (spatial)", effect: { barrage: true } },
  ],
  "Sniper Cannon": [
    { id: "marksman-optics", nature: "field", name: "Marksman Optics", tag: "Gains Precision", effect: { perks: ["Precision"] } },
    { id: "cold-bore", nature: "tuned", name: "Cold Bore", tag: "+3 STR vs undamaged targets", effect: { coldBore: true } },
    { id: "enfilade", nature: "prototype", name: "Enfilade", tag: "Every 3rd aimed shot ricochets to a rig the target can see (spatial)", effect: { enfilade: true } }, // spatial ricochet narrated as a player instruction (Group G)
  ],
  "Siege Maul": [
    { id: "reinforced-head", nature: "field", name: "Reinforced Head", tag: "+2 STR", effect: { str: 2 } },
    { id: "breaching-round", nature: "tuned", name: "Breaching Round", tag: "Hull SP it strips can't be repaired until end of next round", effect: { onDamage: "breaching-round" } },
    { id: "piledriver-protocol", nature: "prototype", name: "Piledriver Protocol", tag: "Store Momentum by advancing; unload a guard-breaking smash (spatial shove)", effect: { piledriver: true } }, // shove (3") deferred — Group G (spatial)
  ],
  "Missile Barrage": [
    { id: "swarm-warheads", nature: "field", name: "Swarm Warheads", tag: "+2 ROF", effect: { rof: 2 } },
    { id: "shaped-charges", nature: "tuned", name: "Shaped Charges", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "fire-control-lock", nature: "prototype", name: "Fire Control Lock", tag: "Lock a target for one unmissable armor-piercing volley", effect: { fireControl: true } },
  ],
  "Sword": [
    { id: "duelist-balance", nature: "field", name: "Duelist's Balance", tag: "Gains Precision", effect: { perks: ["Precision"] } },
    { id: "opportunist", nature: "tuned", name: "Opportunist", tag: "+3 STR vs disrupted / overheated targets", effect: { vsDisrupted: true } },
    { id: "superconductor-edge", nature: "prototype", name: "Superconductor Edge", tag: "Run hot and dump your heat into them through the blade", effect: { superconductor: true } },
  ],
  "Circular Saw": [
    { id: "tempered-teeth", nature: "field", name: "Tempered Teeth", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "sunder", nature: "tuned", name: "Sunder", tag: "On damaging hit: -1 max SP to struck location", effect: { onDamage: "sunder" } },
    { id: "dismember", nature: "prototype", name: "Dismember", tag: "Saw a location in half to cripple it for good", effect: { dismember: true } },
  ],
  "Chainsaw": [
    { id: "ripper-teeth", nature: "field", name: "Ripper Teeth", tag: "Gains Rend", effect: { perks: ["Rend"] } },
    { id: "bloodletter", nature: "tuned", name: "Bloodletter", tag: "Extra hit vs damaged targets", effect: { vsDamaged: { rof: 1 } } },
    { id: "redline-governor", nature: "prototype", name: "Redline Governor", tag: "The hotter you run, the harder it bites", effect: { redline: true } },
  ],
  "Claw": [
    { id: "rending-talons", nature: "field", name: "Rending Talons", tag: "Gains Rend", effect: { perks: ["Rend"] } },
    { id: "vice-grip", nature: "tuned", name: "Vice Grip", tag: "Gains Impale", effect: { perks: ["Impale"] } },
    { id: "breach-grip", nature: "prototype", name: "Breach Grip", tag: "Pry a location's armor open (+2 impact from anyone)", effect: { breachGrip: true } },
  ],
  "Lance": [
    { id: "couched-reach", nature: "field", name: "Couched Reach", tag: "Doubles melee reach to 4\"", effect: { range: 2 } },
    { id: "full-tilt", nature: "tuned", name: "Full Tilt", tag: "Charge in for +3 STR", effect: { charge: 3 } },
    { id: "skewer", nature: "prototype", name: "Skewer", tag: "Impale a rig in the melee lock; leaving you costs it a free lance hit", effect: { skewer: true } },
  ],
  "Wrecking Ball": [
    { id: "haymaker", nature: "field", name: "Haymaker", tag: "+3 STR", effect: { str: 3 } },
    { id: "momentum-swing", nature: "tuned", name: "Momentum Swing", tag: "Charge in for +2 STR and a knockback (knockback spatial)", effect: { charge: 2 } }, // knockback deferred — Group G (spatial)
    { id: "tow-chain", nature: "prototype", name: "Tow Chain", tag: "Yank a rig 4\" where you want it (spatial)", effect: { towChain: true } },
  ],
  "Bulwark Shield": [
    { id: "tower-shield", nature: "field", name: "Tower Shield", tag: "Raise Shield also negates side-arc attacks", effect: { shieldArc: "front-side" } },
    { id: "anvil-boss", nature: "tuned", name: "Anvil Boss", tag: "Counter the first melee attacker each round while braced", effect: { riposteStr: 6 } },
    { id: "emplacement", nature: "prototype", name: "Emplacement", tag: "Root into a permanent fortress shield; immobile, 2 actions, cooldown", effect: { emplacement: true } },
  ],
  "Flamethrower": [
    { id: "sticky-fuel", nature: "field", name: "Sticky Fuel", tag: "Gains Rend", effect: { perks: ["Rend"] } },
    { id: "napalm", nature: "tuned", name: "Napalm", tag: "Hits set the target burning (1 SP/activation until doused)", effect: { burn: 1 } },
    { id: "conflagration", nature: "prototype", name: "Conflagration", tag: "Stack burns for escalating damage-over-time; runs you hot", effect: { burn: 1, burnStacks: true } },
  ],
  "Harpoon": [
    { id: "barbed-head", nature: "field", name: "Barbed Head", tag: "Gains Impale", effect: { perks: ["Impale"] } },
    { id: "taut-cable", nature: "tuned", name: "Taut Cable", tag: "+3 STR vs immobilised or engaged targets", effect: { vsPinned: true } },
    { id: "harpoon-winch", nature: "prototype", name: "Harpoon Winch", tag: "Spear and reel a rig 4\" toward you; roots you, runs hot", effect: { harpoonWinch: true } },
  ],
  "Rivet Gun": [
    { id: "rapid-feed", nature: "field", name: "Rapid Feed", tag: "+2 ROF", effect: { rof: 2 } },
    { id: "staple-burst", nature: "tuned", name: "Staple Burst", tag: "4+ hits: target loses 1 action next activation", effect: { pinOnHits: 4 } },
    { id: "rivet-lock", nature: "prototype", name: "Rivet Lock", tag: "Rivet a location shut — no repairs, jams a weapon there", effect: { rivetLock: true } },
  ],
  "Anchor": [
    { id: "fluked-head", nature: "field", name: "Fluked Head", tag: "+3 STR", effect: { str: 3 } },
    { id: "dead-weight", nature: "tuned", name: "Dead Weight", tag: "Struck target can't Disengage next activation", effect: { deadWeight: true } },
    { id: "ground-anchor", nature: "prototype", name: "Ground Anchor", tag: "Anchor a rig in the lock; leaving you costs it a free Anchor hit", effect: { groundAnchor: true } },
  ],
  "Pressure Claw": [
    { id: "hardened-jaws", nature: "field", name: "Hardened Jaws", tag: "Gains Armour Piercing", effect: { perks: ["Armour Piercing"] } },
    { id: "crush-grip", nature: "tuned", name: "Crush Grip", tag: "On damaging hit: -1 max SP to struck location", effect: { onDamage: "sunder" } },
    { id: "hydraulic-vice", nature: "prototype", name: "Hydraulic Vice", tag: "Pry a location's armour open (+2 impact from anyone)", effect: { breachGrip: true } },
  ],
};

export function defaultWeaponUpgrade(weaponName) {
  const upgrades = WEAPON_UPGRADES[weaponName];
  return Array.isArray(upgrades) && upgrades.length ? upgrades[0].id : null;
}

export function normalizeWeaponUpgrade(weaponName, upgradeId) {
  const upgrades = WEAPON_UPGRADES[weaponName];
  if (!Array.isArray(upgrades) || upgrades.length === 0) return null;
  const ref = String(upgradeId || "").trim().toLowerCase();
  return upgrades.find((u) => u.id.toLowerCase() === ref)?.id || upgrades[0].id;
}

export function upgradeForWeapon(weaponName, upgradeId) {
  const normalized = normalizeWeaponUpgrade(weaponName, upgradeId);
  return (WEAPON_UPGRADES[weaponName] || []).find((u) => u.id === normalized) || null;
}

function pickKey(obj, rng) {
  return randomPick(Object.keys(obj), rng);
}

// A random full Rig loadout: one long-range + one melee weapon, each with a
// random signature upgrade. Shape matches makeRig's `weapons` argument.
export function randomRigWeapons(rng) {
  const longRange = pickKey(WEAPONS.longRange, rng);
  const melee = pickKey(WEAPONS.melee, rng);
  const lrUps = WEAPON_UPGRADES[longRange] || [];
  const meleeUps = WEAPON_UPGRADES[melee] || [];
  return {
    longRange,
    melee,
    longRangeUpgrade: randomPick(lrUps, rng)?.id,
    meleeUpgrade: randomPick(meleeUps, rng)?.id,
  };
}

export function randomEquipment(rng) {
  return pickKey(EQUIPMENT, rng);
}

function uniquePerks(base, added = []) {
  return [...new Set([...(base || []), ...(added || [])])];
}

export function effectiveWeaponProfile(slot, weaponName, rig) {
  if (slot === "unit") {
    const base = UNIT_WEAPONS[weaponName];
    if (!base) return null;
    // Flat-pick weapons have no upgrades and no weight-class scaling. Ship a
    // shape identical to the rig-catalog result so downstream code (computeStr,
    // rollToHit) doesn't need to know which domain the profile came from.
    return { ...base, perks: base.perks || [], upgradeEffect: {} };
  }
  const base = WEAPONS[slot]?.[weaponName];
  if (!base) return null;
  const upgrade = upgradeForWeapon(weaponName, rig?.weaponUpgrades?.[slot]);
  const effect = upgrade?.effect || {};
  const profile = {
    ...base,
    rof: base.rof + (effect.rof || 0),
    str: base.str + (effect.str || 0),
    perks: uniquePerks(base.perks, effect.perks),
    upgrade: upgrade || null,
    upgradeEffect: effect,
  };
  if (base.melee) {
    profile.acc = [...base.acc];
    profile.rng = [...base.rng];
    if (effect.range) profile.rng = profile.rng.map((n) => n + effect.range);
  } else {
    // Ranged: `...base` already copied sweet/peak/dropoff/minRange/maxRange.
    if (effect.range) {
      profile.maxRange = base.maxRange + effect.range;
      profile.sweet = base.sweet + Math.round(effect.range / 2);
    }
    if (effect.noFarPenalty) profile.dropoff = base.dropoff * 0.5;
  }
  return profile;
}

export function createRoom(code) {
  const field = { ...FIELD_DEFAULT, diagonal: "tlbr", terrain: [], locked: false };
  return {
    code,
    version: 0,
    nextRigId: 1,
    ownerSide: null,
    seeded: false,
    field,
    game: {
      round: 1,
      sides: [
        { id: "a", name: "You",   vp: 0, claimed: false, ready: false },
        { id: "b", name: "Enemy", vp: 0, claimed: false, ready: false },
      ],
      objectives: computeObjectives(field),
      started: false,
      bounties: {},
      autoResolve: true,
      phase: "setup",
      deployOrder: [],
      initiative: null,
      answerTokens: { a: 0, b: 0 },
      turn: null,
      resolutions: [],
      nextResolutionId: 1,
      recoveryClaims: {},
      recoveryConflict: null,
      suddenDeath: false,
      outcome: null,
      pendingBlast: null,
      pendingAnswer: null,
      pendingReaction: null,
    },
    rigs: [],
  };
}

function ensureRigShape(rig) {
  if (typeof rig.activated !== "boolean") rig.activated = false;
  if (typeof rig.skipNextActivation !== "boolean") rig.skipNextActivation = false;
  if (typeof rig.noCool !== "boolean") rig.noCool = false;
  if (typeof rig.speedHalvedNextRound !== "boolean") rig.speedHalvedNextRound = false;
  if (typeof rig.movedThisActivation !== "boolean") rig.movedThisActivation = false;
  if (!rig.loaded || typeof rig.loaded !== "object") rig.loaded = { longRange: true, melee: true };
  if (rig.preparation === undefined) rig.preparation = null;
  if (rig.chassis === undefined) rig.chassis = null;
  if (rig.preparation && typeof rig.preparation.faceUp !== "boolean") rig.preparation.faceUp = false;
  if (!Array.isArray(rig.weaponsDestroyed)) rig.weaponsDestroyed = [];
  if (typeof rig.immobilised !== "boolean") rig.immobilised = false;
  if (rig.engagedWith === undefined) rig.engagedWith = null;
  if (rig.equipment === undefined) rig.equipment = null;
  if (typeof rig.hardened !== "boolean") rig.hardened = false;
  if (typeof rig.overclockCoreUsed !== "boolean") rig.overclockCoreUsed = false;
  if (typeof rig.actionPenaltyNextActivation !== "number") rig.actionPenaltyNextActivation = 0;
  if (typeof rig.hullRepairLock !== "number") rig.hullRepairLock = 0;
  if (typeof rig.burning !== "number") rig.burning = 0;
  // Kneecapper progressive cripple (§13, Double MG) — derived state, not set
  // directly here; recompute() below (also called on every applyDamage/
  // repairRig) re-derives it from live SP. Just guard the field's shape on a
  // legacy rig loaded from an older save.
  if (typeof rig.armsSuppressed !== "boolean") rig.armsSuppressed = false;
  if (typeof rig.ripostedThisRound !== "boolean") rig.ripostedThisRound = false;
  // Skewer (§13, Lance) — the id of the rig that impaled this one in the melee
  // lock; Disengaging from it costs a free STR-11 lance strike.
  if (rig.skeweredBy === undefined) rig.skeweredBy = null;
  // Ground Anchor (§13, Anchor) — the id of the rig that anchored this one in
  // the melee lock; Disengaging from it costs a free natural-STR Anchor strike.
  if (rig.anchoredBy === undefined) rig.anchoredBy = null;
  if (typeof rig.autocannonShots !== "number") rig.autocannonShots = 0;
  if (typeof rig.autocannonSlowNext !== "boolean") rig.autocannonSlowNext = false;
  // Enfilade (§13, Sniper Cannon) — per-rig aimed-shot counter; every 3rd aimed
  // shot emits a ricochet instruction (spatial — narrated, not simulated).
  if (typeof rig.enfiladeShots !== "number") rig.enfiladeShots = 0;
  // Piledriver Protocol (§13, Siege Maul) — stored Momentum (+1 per advancing
  // activation, cap 3); spent whole on a Siege Maul shot for guard-break + STR.
  if (typeof rig.momentum !== "number") rig.momentum = 0;
  // Emplacement (§13, Bulwark Shield) — the rooted-stance flag and the round the
  // stance may next be re-entered (cooldown measured from when it was entered).
  if (typeof rig.emplaced !== "boolean") rig.emplaced = false;
  if (typeof rig.emplaceCooldownUntil !== "number") rig.emplaceCooldownUntil = 0;
  // Barrage (§13, Mortar) — rounds of shelling left on the committed tube.
  if (typeof rig.barrageRoundsLeft !== "number") rig.barrageRoundsLeft = 0;
  // Tow Chain (§13, Wrecking Ball) — the round the fling recharges by, and the
  // per-activation root flag a successful tow sets (blocks Move/Sprint after).
  if (typeof rig.towChainCooldownUntil !== "number") rig.towChainCooldownUntil = 0;
  if (typeof rig.harpoonWinchCooldownUntil !== "number") rig.harpoonWinchCooldownUntil = 0;
  if (typeof rig.towedThisActivation !== "boolean") rig.towedThisActivation = false;
  if (rig.suppressTarget === undefined) rig.suppressTarget = null;
  if (typeof rig.suppressStacks !== "number") rig.suppressStacks = 0;
  // Rivet Lock (§13, Rivet Gun) — which target+location this rig is riveting
  // and how many consecutive-fire stacks it has piled on.
  if (rig.rivetTarget === undefined) rig.rivetTarget = null;
  if (rig.rivetLoc === undefined) rig.rivetLoc = null;
  if (typeof rig.rivetStacks !== "number") rig.rivetStacks = 0;
  if (!rig.rivetSeized || typeof rig.rivetSeized !== "object") rig.rivetSeized = {};
  if (typeof rig.noPrepNextActivation !== "boolean") rig.noPrepNextActivation = false;
  // Dead Weight (§13, Anchor) — a damaging Anchor melee hit pins the struck
  // target: it can't Disengage on its next activation. Scoped/self-clearing
  // like noPrepNextActivation.
  if (typeof rig.noDisengageNextActivation !== "boolean") rig.noDisengageNextActivation = false;
  if (typeof rig.suppressImmobile !== "boolean") rig.suppressImmobile = false;
  // Ion Storm (§13, Arc Gun) — EMP active-lockout on the struck target, and the
  // attacker's own Arc Gun overload flag.
  if (typeof rig.noActivesNextActivation !== "boolean") rig.noActivesNextActivation = false;
  if (typeof rig.arcLockedNext !== "boolean") rig.arcLockedNext = false;
  // Fire Control Lock (§13, Missile Barrage) — painted target id + the round the
  // paint goes stale.
  if (rig.lockedTarget === undefined) rig.lockedTarget = null;
  if (typeof rig.lockExpiresRound !== "number") rig.lockExpiresRound = 0;
  // Breach Grip / Dismember (§13) — per-location tracking maps.
  if (!rig.cracked || typeof rig.cracked !== "object") rig.cracked = {};
  if (!rig.crippled || typeof rig.crippled !== "object") rig.crippled = {};
  if (!rig.noRepair || typeof rig.noRepair !== "object") rig.noRepair = {};
  // Kneecapper (§13, Double MG) — per-limb tag: which limbs a Kneecapper has
  // raked (gates the cripple ramp in recompute so ordinary weapons don't).
  if (!rig.kneecapped || typeof rig.kneecapped !== "object") rig.kneecapped = {};
  // Dismember origMax — default each part to its current max on a legacy rig
  // (best-effort yardstick; a rig commissioned pre-Dismember was never sundered).
  if (!rig.origMax || typeof rig.origMax !== "object") {
    rig.origMax = {};
    for (const l of partNamesOf(rig.kind || "rig")) if (rig[l]) rig.origMax[l] = rig[l].max;
  }
  if (!rig.weaponUpgrades || typeof rig.weaponUpgrades !== "object") rig.weaponUpgrades = {};
  rig.weaponUpgrades.longRange = normalizeWeaponUpgrade(rig.weapons?.longRange, rig.weaponUpgrades.longRange);
  rig.weaponUpgrades.melee = normalizeWeaponUpgrade(rig.weapons?.melee, rig.weaponUpgrades.melee);
  if (!rig.kind) rig.kind = "rig";
  if (!rig.parts) rig.parts = { hull: rig.hull, arms: rig.arms, legs: rig.legs, engine: rig.engine };
  return rig;
}

function ensureGameShape(room) {
  room.game ||= {};
  if (room.ownerSide === undefined) room.ownerSide = null;
  if (room.seeded === undefined) room.seeded = false;
  if (!room.field || typeof room.field !== "object") {
    room.field = { ...FIELD_DEFAULT, diagonal: "tlbr", terrain: [], locked: false };
  }
  room.field.diagonal = room.field.diagonal === "trbl" ? "trbl" : "tlbr";
  if (!Array.isArray(room.field.terrain)) room.field.terrain = [];
  if (typeof room.field.locked !== "boolean") room.field.locked = false;
  room.game.round ||= 1;
  room.game.sides ||= [
    { id: "a", name: "You",   vp: 0, claimed: false },
    { id: "b", name: "Enemy", vp: 0, claimed: false },
  ];
  for (const side of room.game.sides) {
    if (typeof side.ready !== "boolean") side.ready = false;
  }
  if (!Array.isArray(room.game.objectives) || room.game.objectives.length === 0) {
    room.game.objectives = computeObjectives(room.field);
  }
  if (typeof room.game.started !== "boolean") room.game.started = false;
  room.game.bounties ||= {};
  room.rigs ||= [];
  if (typeof room.game.autoResolve !== "boolean") room.game.autoResolve = true;
  room.game.phase ||= "setup";
  room.game.deployOrder ||= [];
  if (room.game.initiative === undefined) room.game.initiative = null;
  room.game.answerTokens ||= { a: 0, b: 0 };
  if (room.game.turn === undefined) room.game.turn = null;
  room.game.resolutions ||= [];
  room.game.nextResolutionId ||= 1;
  room.game.recoveryClaims ||= {};
  if (room.game.recoveryConflict === undefined) room.game.recoveryConflict = null;
  if (typeof room.game.suddenDeath !== "boolean") room.game.suddenDeath = false;
  if (room.game.outcome === undefined) room.game.outcome = null;
  if (room.game.pendingBlast === undefined) room.game.pendingBlast = null;
  if (room.game.pendingAnswer === undefined) room.game.pendingAnswer = null;
  if (room.game.pendingReaction === undefined) room.game.pendingReaction = null;
  if (!Array.isArray(room._history)) room._history = [];
  for (const rig of room.rigs) ensureRigShape(rig);
  return room;
}

export function normalizeWeapon(category, name) {
  const table = WEAPONS[category];
  if (!table || !name) return null;
  const ref = String(name).trim().toLowerCase();
  return Object.keys(table).find((weapon) => weapon.toLowerCase() === ref) || null;
}

export function makeRig(id, name, cls, owner, weapons = {}, equipment = null) {
  const normalizedClass = String(cls || "").trim().toLowerCase();
  if (!SUPPORTED_RIG_CLASSES.includes(normalizedClass)) return null;
  const longRange = normalizeWeapon("longRange", weapons.longRange || weapons.lr);
  const melee = normalizeWeapon("melee", weapons.melee);
  if (!longRange || !melee) return null;
  const weaponUpgrades = {
    longRange: normalizeWeaponUpgrade(longRange, weapons.longRangeUpgrade || weapons.lrUpgrade),
    melee: normalizeWeaponUpgrade(melee, weapons.meleeUpgrade),
  };

  const weightClass = normalizedClass;
  const d = RIG_DEFAULTS[weightClass];
  // Per-rig SP override (chassis `sp`) wins field-by-field, else the class
  // default. Lets each chassis carry its own durability without a class change.
  const o = weapons.sp && typeof weapons.sp === "object" ? weapons.sp : {};
  const base = {
    hull:   Number.isFinite(o.hull)   ? o.hull   : d.hull,
    arms:   Number.isFinite(o.arms)   ? o.arms   : d.arms,
    legs:   Number.isFinite(o.legs)   ? o.legs   : d.legs,
    engine: Number.isFinite(o.engine) ? o.engine : d.engine,
  };
  const equipmentId = normalizeEquipment(equipment);
  // Ablative Plating (Armor) — passive +1 max SP to Hull, applied once at commission.
  const hullMax = base.hull + (equipmentId === "ablative-plating" ? 1 : 0);
  const rig = {
    id,
    name: String(name || "Rig").trim() || "Rig",
    kind: "rig",
    weightClass,
    owner: owner === "b" ? "b" : "a",
    hull:   { sp: hullMax, max: hullMax, destroyed: false },
    arms:   { sp: base.arms, max: base.arms, destroyed: false },
    legs:   { sp: base.legs, max: base.legs, destroyed: false },
    engine: { sp: base.engine, max: base.engine, destroyed: false, heat: 0 },
    weapons: { longRange, melee },
    weaponUpgrades,
    equipment: equipmentId,
    chassis: weapons.chassis || null, // CHASSIS id it was commissioned from — drives its flavor description in the UI
    prepare: 0,    // Phase 4
    activated: false,
    skipNextActivation: false,
    noCool: false,
    speedHalvedNextRound: false,
    // Kneecapper progressive cripple (§13, Double MG) — derived state; recompute()
    // (called below and on every applyDamage/repairRig) keeps it in sync with
    // live arms SP. Initialised false since a fresh rig starts undamaged.
    armsSuppressed: false,
    movedThisActivation: false,
    loaded: { longRange: true, melee: true },
    preparation: null,
    weaponsDestroyed: [],
    immobilised: false,
    engagedWith: null,
    hardened: false,
    overclockCoreUsed: false,
    actionPenaltyNextActivation: 0,
    hullRepairLock: 0,
    burning: 0,
    ripostedThisRound: false,
    // Skewer (§13, Lance) — set to the skewerer's id while impaled in the lock.
    skeweredBy: null,
    // Ground Anchor (§13, Anchor) — set to the anchorer's id while pinned in the lock.
    anchoredBy: null,
    // Penetrator Rounds (§13, Autocannon) — belt-cycle counter + the ROF-halving
    // downside carried into the attack right after a penetrator shot.
    autocannonShots: 0,
    autocannonSlowNext: false,
    // Enfilade (§13, Sniper Cannon) — per-rig aimed-shot cadence counter; every
    // 3rd aimed Sniper Cannon shot emits a ricochet instruction (spatial).
    enfiladeShots: 0,
    // Piledriver Protocol (§13, Siege Maul) — stored Momentum: +1 for any
    // activation this rig advanced (cap 3), spent whole on a Siege Maul shot for
    // a guard-break (ignores Brace + cover) and +1 STR per point. While
    // momentum > 0 the rig can't Raise Shield (all-in on the charge).
    momentum: 0,
    // Emplacement (§13, Bulwark Shield) — the rooted fortress stance and the
    // round it may next be re-entered (3-round cooldown from entry).
    emplaced: false,
    emplaceCooldownUntil: 0,
    // Barrage (§13, Mortar) — rounds of shelling left; while > 0 the Mortar is
    // locked (can't fire a direct shot) and takes +1 heat upkeep each Recovery.
    barrageRoundsLeft: 0,
    // Tow Chain (§13, Wrecking Ball) — the round the fling recharges by (3-round
    // cooldown from a tow) and a per-activation root flag a successful tow sets.
    towChainCooldownUntil: 0,
    harpoonWinchCooldownUntil: 0,
    towedThisActivation: false,
    // Suppression Lock (§13, Mini Gun) — which target this rig is grinding down
    // and how many consecutive-fire stacks it has piled on.
    suppressTarget: null,
    suppressStacks: 0,
    // Suppression Lock's 3rd-stack payload: blocks this rig's next Prepare and
    // pins it in place. Both are scoped, self-clearing (NOT the permanent
    // `immobilised` flag): noPrepNextActivation clears at activation end,
    // suppressImmobile clears in Recovery.
    noPrepNextActivation: false,
    // Dead Weight (§13, Anchor) — mirrors noPrepNextActivation's shape: a
    // damaging Anchor hit blocks this rig's next Disengage, self-clears at
    // that activation's end.
    noDisengageNextActivation: false,
    suppressImmobile: false,
    // Ion Storm (§13, Arc Gun) — an EMP hit blocks the target's equipment
    // actives for its next activation; arcLockedNext overloads the attacker's
    // own Arc Gun until its next fire attempt.
    noActivesNextActivation: false,
    arcLockedNext: false,
    // Fire Control Lock (§13, Missile Barrage) — the painted target's id and the
    // round the paint expires; the next Missile Barrage volley on it can't miss.
    lockedTarget: null,
    lockExpiresRound: 0,
    // Breach Grip (§13, Claw) — location → the round the armour crack expires.
    cracked: {},
    // Rivet Lock (§13, Rivet Gun) — which target+location this rig is riveting,
    // how many consecutive-fire stacks it has piled on, and (on the receiving
    // end) location → the round a seize expires.
    rivetTarget: null,
    rivetLoc: null,
    rivetStacks: 0,
    rivetSeized: {},
    // Kneecapper (§13, Double MG) — which limbs a Kneecapper rake has tagged;
    // gates the cripple ramp in recompute so ordinary weapons don't cripple.
    kneecapped: {},
    // Dismember (§13, Circular Saw) — locations already crippled (apply once),
    // and locations whose repairs are permanently blocked by a dismembered
    // hull/engine.
    crippled: {},
    noRepair: {},
    destroyed: false,
  };
  rig.parts = { hull: rig.hull, arms: rig.arms, legs: rig.legs, engine: rig.engine };
  // Dismember (§13) — each location's commissioned max SP, the yardstick for the
  // "ground to <= half" cripple check (Sunder chips away at the live max).
  rig.origMax = { hull: rig.hull.max, arms: rig.arms.max, legs: rig.legs.max, engine: rig.engine.max };
  return rig;
}

// Registry-driven unit factory. Rigs still go through makeRig (which handles
// weight-class stats, weapon slots, equipment). Cold single-model kinds (Tank,
// Walker) build directly from the registry entry's partSp with one flat-pick
// weapon and no equipment.
export function makeUnit(kindId, id, name, owner, opts = {}) {
  const kind = UNIT_KINDS[kindId];
  if (!kind) return null;
  if (kindId === "rig") {
    return makeRig(id, name, opts.weightClass, owner, {
      longRange: opts.longRange, melee: opts.melee,
      longRangeUpgrade: opts.longRangeUpgrade, meleeUpgrade: opts.meleeUpgrade,
      sp: opts.sp, chassis: opts.chassis,
    }, opts.equipment ?? null);
  }
  // Cold single-model kinds (tank / walker). Parts, SP, and role come from the
  // registry; the unit carries exactly one flat-pick weapon and no equipment.
  // Support units carry exactly two distinct modules; a bare tank/walker carries
  // none. A Damage module fits the chosen unit-weapon; without one the unit falls
  // back to the built-in Sidearm.
  const modules = normalizeModules(opts.modules);
  if (modules.length > 0 && modules.length !== 2) return null;
  const weaponName = modules.length > 0
    ? (modules.includes("damage") ? normalizeUnitWeapon(opts.unit) : "Sidearm")
    : normalizeUnitWeapon(opts.unit);
  if (!weaponName) return null;
  const parts = {};
  for (const p of kind.parts) {
    const sp = kind.partSp[p.name];
    parts[p.name] = { sp, max: sp, destroyed: false };
  }
  // heatMeter/engineHeatFloor read power-part heat via rig.engine.heat. Give
  // the power part a heat=0 so cold-kind code paths that touch it don't NPE.
  const [powerPart] = partsByRole(kindId, "power");
  if (powerPart && !("heat" in parts[powerPart])) parts[powerPart].heat = 0;
  const unit = {
    id,
    name: String(name || kind.label).trim() || kind.label,
    kind: kindId,
    owner: owner === "b" ? "b" : "a",
    parts,
    weapons: { unit: weaponName },
    modules,
    painted: null,
    equipment: null,
    chassis: null, // cold kinds (tank / walker) aren't commissioned from a chassis
    activated: false,
    skipNextActivation: false,
    noCool: false,
    speedHalvedNextRound: false,
    // Kneecapper progressive cripple (§13, Double MG) — mirrors makeRig; kept
    // in sync by recompute() off the unit's own weapon-role part (turret /
    // mount rather than "arms" on cold kinds).
    armsSuppressed: false,
    loaded: { unit: true },
    preparation: null,
    weaponsDestroyed: [],
    immobilised: false,
    engagedWith: null,
    hardened: false,
    actionPenaltyNextActivation: 0,
    // Dead Weight (§13, Anchor) — mirrored for shape parity (cold kinds never
    // carry the Anchor upgrade, so this never actually triggers).
    noDisengageNextActivation: false,
    // Emplacement (§13) — mirrored from makeRig for shape parity (cold kinds
    // never carry the upgrade, so the stance never actually engages).
    emplaced: false,
    emplaceCooldownUntil: 0,
    // Barrage / Tow Chain (§13) — mirrored for shape parity (cold kinds never
    // carry the Mortar / Wrecking Ball upgrades, so these never actually fire).
    barrageRoundsLeft: 0,
    towChainCooldownUntil: 0,
    harpoonWinchCooldownUntil: 0,
    towedThisActivation: false,
    // Piledriver Protocol (§13) — mirrored for shape parity (cold kinds never
    // carry the Siege Maul upgrade, so Momentum never actually builds).
    momentum: 0,
    // Enfilade (§13) — mirrored for shape parity (cold kinds never carry the
    // Sniper Cannon upgrade, so the counter never actually advances).
    enfiladeShots: 0,
    // Group E per-location state (Breach Grip / Dismember / Kneecapper), mirrored from makeRig.
    cracked: {},
    // Rivet Lock (§13) — mirrored for shape parity (cold kinds never carry the
    // Rivet Gun upgrade, so the stack never actually advances).
    rivetTarget: null,
    rivetLoc: null,
    rivetStacks: 0,
    rivetSeized: {},
    kneecapped: {},
    crippled: {},
    noRepair: {},
    destroyed: false,
  };
  // Alias top-level part fields so shared-code reads like rig.hull / rig.engine
  // resolve for cold kinds too (Task 4's recompute + Task 7's action-budget
  // helper walk names via partNamesOf, so they read rig[name] directly).
  for (const p of kind.parts) unit[p.name] = parts[p.name];
  // Dismember (§13) — commissioned max SP per part for the cripple yardstick.
  unit.origMax = {};
  for (const p of kind.parts) unit.origMax[p.name] = parts[p.name].max;
  return unit;
}

// Derive the full heat picture for a Rig's engine: current heat, its Heat
// Capacity (the redline), the floor heat can't drop below, and — when running
// hot — the misfire bonus that would be added to the D12 overheat roll right
// now. `zone` is a coarse severity band for UI colouring.
export function heatMeter(rig) {
  const kind = kindOf(rig);
  if (!UNIT_KINDS[kind].hasHeat) return { heat: 0, cap: 0, floor: 0, over: 0, bonus: 0, zone: "none" };
  const heat = rig?.engine?.heat || 0;
  const cap = HEAT_CAPACITY[rig?.weightClass] ?? 5;
  const floor = rig?.engine?.sp === 0 ? 3 : 0;
  const over = Math.max(0, heat - cap);
  const bonus = over > 0 ? Math.min(MAX_OVERHEAT_BONUS, 2 * over) : 0;
  let zone;
  if (over > 0) zone = "over";
  else if (heat >= cap) zone = "redline";
  else if (heat > cap * 0.6) zone = "warm";
  else if (heat > 0) zone = "cool";
  else zone = "cold";
  return { heat, cap, floor, over, bonus, zone };
}

export function findRig(room, name) {
  ensureGameShape(room);
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return room.rigs.find((r) => r.name.toLowerCase() === n) || null;
}

export function normalizeSide(room, ref) {
  ensureGameShape(room);
  if (!ref) return null;
  const s = String(ref).trim().toLowerCase();
  const byId = room.game.sides.find((x) => x.id === s);
  if (byId) return byId.id;
  const byName = room.game.sides.find((x) => x.name.toLowerCase() === s);
  return byName ? byName.id : null;
}

export function claimSide(room, { name, side } = {}) {
  ensureGameShape(room);
  // An explicitly requested side is always granted — this makes auto-rejoin
  // idempotent (a returning player reclaims their own side) and lets players
  // deliberately pick a side. Only auto-assign the first free side when none
  // was requested; return null only if the room is genuinely full.
  let target = side ? room.game.sides.find((s) => s.id === side) : null;
  if (!target) target = room.game.sides.find((s) => !s.claimed);
  if (!target) return null;
  const newName = name ? (String(name).trim() || target.name) : target.name;
  const changed = !target.claimed || target.name !== newName;
  target.claimed = true;
  if (room.ownerSide == null) room.ownerSide = target.id;
  target.name = newName;
  if (changed) room.version++;
  return target.id;
}

function sideRigCount(room, sideId) {
  return room.rigs.filter((rig) => (rig.owner || "a") === sideId).length;
}

export function canAddRigForSide(room, sideId) {
  const rigs = Array.isArray(room?.rigs) ? room.rigs : [];
  const owner = sideId === "b" ? "b" : "a";
  return rigs.length < MAX_RIGS_TOTAL &&
    rigs.filter((rig) => (rig.owner || "a") === owner).length < MAX_RIGS_PER_SIDE;
}

function resetReadyBeforeStart(room) {
  if (room.game.started) return;
  for (const side of room.game.sides) side.ready = false;
  room.game.bounties = {};
  room.game.deployOrder = [];
}

// Roll an N-sided die. A valid caller-supplied value (manual dice entry) is used
// as-is; otherwise roll with the injectable random (auto mode / tests).
function rollD(sides, provided, random = Math.random) {
  if (provided != null) {
    const v = Math.floor(Number(provided));
    if (Number.isFinite(v) && v >= 1 && v <= sides) return v;
  }
  return Math.floor((random || Math.random)() * sides) + 1;
}

// Append a dice/effect entry to the capped shared log the client animates.
function pushResolution(room, entry) {
  entry.id = room.game.nextResolutionId++;
  room.game.resolutions.push(entry);
  while (room.game.resolutions.length > 12) room.game.resolutions.shift();
}

function prepName(type) {
  if (type === "evasive") return "Evasive Manoeuvre";
  if (type === "return") return "Return Fire";
  if (type === "raise-shield") return "Raise Shield";
  return "Brace for Incoming Fire";
}
function prepEffectLine(type) {
  if (type === "evasive") return "Defender may move ½ Speed — the attack can miss entirely.";
  if (type === "return") return "Defender answers with a counter-attack.";
  if (type === "raise-shield") return "Front-arc attack negated; side/rear impacts suffer −4.";
  return "Front-arc impacts suffer −2.";
}
function reactionRevealEntry(rig, type) {
  return {
    kind: "reaction", actor: rig.owner, rigId: rig.id, rolls: [], prep: type,
    summary: `${rig.name} reveals ${prepName(type)}!`, effects: [prepEffectLine(type)],
  };
}

// Round-1 initiative comes from deployment, not dice: the first side to Ready
// (deployOrder[0]) is the first-deployer and therefore activates SECOND (§10.5).
function deploymentOrder(room) {
  const second = room.game.deployOrder[0] || "a";
  const first = second === "a" ? "b" : "a";
  return [first, second];
}

// Record an initiative result: set activation order, grant the second activator
// 1 Answer token, open the turn, and enter the activation phase.
function applyInitiative(room, order, rolls) {
  const [first, second] = order;
  room.game.initiative = { rolls: rolls || null, order: [first, second], second };
  room.game.answerTokens = { a: 0, b: 0 };
  room.game.answerTokens[second] = 1;
  room.game.pendingAnswer =
    room.game.answerTokens[second] > 0 && eligibleForPrep(room, second).length > 0
      ? { side: second, remaining: room.game.answerTokens[second] }
      : null;
  room.game.turn = { side: first, activeRigId: null, actionsUsed: 0, actionsMax: 0 };
  room.game.phase = "activation";
}

function randomPick(items, random = Math.random) {
  if (!items.length) return null;
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index];
}

// The game-field portion of a full reset (no per-rig work). Shared by the
// `reset` verb (which also rebuilds each rig) and the `seed` verb (which
// discards all rigs, so it only needs this).
function resetGameShape(room) {
  room.game.started = false;
  room.game.phase = "setup";
  room.game.round = 1;
  room.game.turn = null;
  room.game.resolutions = [];
  room.game.nextResolutionId = 1;
  room.game.recoveryClaims = {};
  room.game.recoveryConflict = null;
  room.game.outcome = null;
  room.game.pendingBlast = null;
  room.game.pendingAnswer = null;
  room.game.pendingReaction = null;
  room.game.answerTokens = { a: 0, b: 0 };
  room.game.suddenDeath = false;
  room.game.deployOrder = [];
  room.game.initiative = null;
  room.game.bounties = {};
  room._history = [];
  for (const s of room.game.sides) { s.ready = false; s.vp = 0; }
}

// Deterministic force-start for seeded test rooms: no dice, no deployment-order
// inference. Bounty for each side = its first enemy rig. turn.side = `first`.
function startGameSeeded(room, first) {
  const other = first === "b" ? "a" : "b";
  const bounties = {};
  for (const side of room.game.sides) {
    const target = room.rigs.find((rig) => (rig.owner || "a") !== side.id);
    if (!target) return false;
    bounties[side.id] = target.id;
  }
  room.game.bounties = bounties;
  room.game.started = true;
  room.game.phase = "initiative";
  room.game.round = 1;
  applyInitiative(room, [first, other], null);
  for (const side of room.game.sides) side.ready = true;
  // deployOrder[0] is the first-to-deploy = second activator (deploymentOrder()).
  // `first` activates first, so it is the second-to-deploy.
  room.game.deployOrder = [other, first];
  pushResolution(room, {
    kind: "initiative", actor: first, rigId: null, rolls: [],
    summary: `Seeded battle — ${first} activates first`, effects: [],
  });
  return true;
}

function maybeStartGame(room, random = Math.random) {
  if (room.game.started) return false;
  const canStart = room.game.sides.every((side) => side.ready && sideRigCount(room, side.id) >= 3);
  if (!canStart) return false;

  const bounties = {};
  for (const side of room.game.sides) {
    const target = randomPick(room.rigs.filter((rig) => (rig.owner || "a") !== side.id), random);
    if (!target) return false;
    bounties[side.id] = target.id;
  }
  room.game.bounties = bounties;
  room.game.started = true;
  room.game.phase = "initiative";
  room.game.round = 1;
  applyInitiative(room, deploymentOrder(room), null);
  pushResolution(room, {
    kind: "initiative", actor: room.game.turn.side, rigId: null, rolls: [],
    summary: `Round 1 — ${room.game.initiative.order[0]} activates first`, effects: [],
  });
  return true;
}

function engineHeatFloor(rig) {
  const kind = kindOf(rig);
  if (!UNIT_KINDS[kind].hasHeat) return 0;
  const [powerPart] = partsByRole(kind, "power");
  return rig[powerPart]?.sp === 0 ? 3 : 0;
}

function recompute(rig) {
  const kind = kindOf(rig);
  const names = partNamesOf(kind);
  rig.destroyed = names.some((n) => rig[n]?.destroyed) ||
    names.every((n) => rig[n]?.sp === 0);
  const floor = engineHeatFloor(rig);
  if (rig.engine && rig.engine.heat < floor) rig.engine.heat = floor;
  // Kneecapper progressive cripple (§13, Double MG) — SCOPED to limbs a
  // Kneecapper attack has actually raked. `rig.kneecapped[part]` is set true
  // ONLY by a kneecapper-sourced damaging hit (combat.js), so ordinary weapons
  // never impose a half-limb debuff — Kneecapper keeps its "focus one limb"
  // identity. The debuff itself is still derived from live SP here, re-derived
  // on every applyDamage / repairRig / Recovery tick:
  //   mobility limb (Rig legs / Tank tracks / Walker legs) <= half max ->
  //     speedHalvedNextRound = true. Recovery resets that flag to false each
  //     round THEN calls recompute() again, so a still-<=half tagged limb
  //     keeps re-flagging it (the "re-apply while <= half" behaviour).
  //   weapon limb (Rig arms / Tank turret / Walker mount) <= half max ->
  //     armsSuppressed = true, read by combat.js rollToHit to halve this
  //     rig's own ROF on every shot.
  // A tagged limb repaired back ABOVE half clears its tag, so it's re-armable
  // by a later rake — and, with the attacker only ever tagging the limb it is
  // raking, that gives the design's "switching limbs resets the ramp". At 0 SP
  // the existing §8 destruction consequences (weaponsDestroyed / immobilised)
  // already fire; these flags only add the crippled-but-not-destroyed state.
  rig.armsSuppressed = false;
  if (rig.kneecapped) {
    for (const part of names) {
      if (!rig.kneecapped[part]) continue;
      const c = rig[part];
      if (!c || c.max <= 0) continue;
      if (c.sp <= c.max / 2) {
        const role = roleOf(kind, part);
        if (role === "mobility") rig.speedHalvedNextRound = true;
        else if (role === "weapon") rig.armsSuppressed = true;
      } else {
        rig.kneecapped[part] = false; // repaired above half — re-armable
      }
    }
  }
}

// §8 — effect when a component first reaches 0 SP. May recurse via applyDamage.
function catastrophicOnZero(room, rig, loc, opts) {
  const kind = kindOf(rig);
  const role = roleOf(kind, loc);
  if (role === "power") {
    // Overclock Core (Rig only) — the first time the power part hits 0 SP,
    // the unit does not skip its next activation. After that, normal rules apply.
    if (rig.equipment === "overclock-core" && !rig.overclockCoreUsed) rig.overclockCoreUsed = true;
    else rig.skipNextActivation = true;
    if (rig.engine) rig.engine.heat = Math.max(rig.engine.heat, 3);
  } else if (role === "weapon") {
    if (kind === "rig") {
      // Rig two-slot weapon-destroy roll (D12 ≤6 → long-range, >6 → melee).
      const roll = rollD(12, opts?.dice?.armsWeapon, opts?.random);
      const slot = roll <= 6 ? "longRange" : "melee";
      const name = rig.weapons?.[slot];
      if (name && !rig.weaponsDestroyed.includes(name)) rig.weaponsDestroyed.push(name);
    } else {
      // Flat-pick kinds carry exactly one gun on the weapon part.
      const name = rig.weapons?.unit;
      if (name && !rig.weaponsDestroyed.includes(name)) rig.weaponsDestroyed.push(name);
    }
    // Munition cook-off: 1 to a structural + 1 to a power part — UNLESS the
    // hit was a Kneecapper rake (opts.noSpill). Kneecapper is limbs-only and
    // "cripples, never kills": the weapon limb still dies, but no damage bleeds
    // into hull/engine, so a rake can never finish a target through the cascade.
    if (!opts?.noSpill) {
      const [structPart] = partsByRole(kind, "structural");
      const [powerPart] = partsByRole(kind, "power");
      if (structPart) applyDamage(room, rig, structPart, 1, opts);
      if (powerPart) applyDamage(room, rig, powerPart, 1, opts);
    }
  }
  // structural and mobility 0-SP effects are enforced where they apply
  // (activation budget, combat modAim, movement) — no state to set here.
}

// §8 — additional damage to an already 0-SP location.
function catastrophicAdditional(room, rig, loc, opts) {
  const kind = kindOf(rig);
  const role = roleOf(kind, loc);
  if (role === "structural" || role === "power") rig[loc].destroyed = true;
  else if (role === "mobility") rig.immobilised = true;
  else if (role === "weapon") {
    // Kneecapper (§13) — a limbs-only rake never spills the extra structural
    // damage into hull; the weapon limb is already dead, that's the finish.
    if (opts?.noSpill) return;
    const [structPart] = partsByRole(kind, "structural");
    if (structPart) applyDamage(room, rig, structPart, 3, opts);
  }
}

// Engagement (melee lock, §engagement design). Symmetric one-to-one link between
// two rigs, stored as each rig's `engagedWith` = the other's id. The two helpers
// below are the ONLY way the link changes, so the symmetric invariant holds.
function findRigById(room, id) {
  return room?.rigs?.find((r) => r.id === id) || null;
}
function setEngagement(a, b) {
  if (!a || !b || a === b) return false;
  if (a.engagedWith != null || b.engagedWith != null) return false; // one-to-one
  a.engagedWith = b.id;
  b.engagedWith = a.id;
  return true;
}
function clearEngagement(room, rig) {
  if (!rig || rig.engagedWith == null) return;
  const partner = findRigById(room, rig.engagedWith);
  rig.engagedWith = null;
  // Skewer (§13, Lance) — the impale can't outlive the lock; clear the mark on
  // both ends however the engagement ends (Disengage, destruction, remove, …).
  if (rig.skeweredBy != null) rig.skeweredBy = null;
  // Ground Anchor (§13, Anchor) — mirrors Skewer: the anchor can't outlive the
  // lock, so clear the mark on both ends however the engagement ends.
  if (rig.anchoredBy != null) rig.anchoredBy = null;
  if (partner) {
    partner.engagedWith = null;
    if (partner.skeweredBy != null) partner.skeweredBy = null;
    if (partner.anchoredBy != null) partner.anchoredBy = null;
  }
}
// Enemy-only, both-alive guard around setEngagement (used by the melee and
// move-into triggers). `room` is unused today but kept for signature symmetry.
function maybeEngage(room, a, b) {
  if (!a || !b) return false;
  if ((a.owner || "a") === (b.owner || "a")) return false;
  if (a.destroyed || b.destroyed || a.immobilised || b.immobilised) return false;
  return setEngagement(a, b);
}

// Move-into declaration: resolve an engage-target name to a rig and try to
// engage it. Tolerates an unknown/invalid name (returns false, no throw).
function maybeEngageByName(room, rig, name) {
  const target = findRig(room, name);
  return target ? maybeEngage(room, rig, target) : false;
}

// Cascade-aware damage entry point. Applies `amount` SP one point at a time,
// firing §8 clauses, then recomputes destruction (§9 handled in onRigDamaged).
function applyDamage(room, rig, loc, amount, opts) {
  const c = rig[loc];
  if (!c) return;
  let n = Math.max(0, Math.floor(Number(amount) || 0));
  while (n-- > 0) {
    if (c.sp > 0) {
      c.sp -= 1;
      if (c.sp === 0) { recompute(rig); catastrophicOnZero(room, rig, loc, opts); }
    } else {
      catastrophicAdditional(room, rig, loc, opts);
    }
  }
  recompute(rig);
  onRigDamaged(room, rig, opts);
}

// §9 — on the transition to destroyed, roll a D12; 4+ erupts. Record a pending
// blast the controller resolves by naming rigs within 4" (see the `blast` verb).
function onRigDamaged(room, rig, opts) {
  if (rig.destroyed && !rig._blastRolled) {
    rig._blastRolled = true;
    const roll = rollD(12, opts?.dice?.destruction, opts?.random);
    const exploded = roll >= 4;
    pushResolution(room, {
      kind: "destruction", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} destroyed — ${exploded ? 'munitions erupt (mark rigs within 4")' : "no secondary blast"}`,
      effects: [],
    });
    if (exploded) room.game.pendingBlast = { sourceId: rig.id, exploded: true };
  }
  // Engagement (§engagement) — a destroyed or immobilised rig can no longer hold
  // the melee lock; free both ends.
  if ((rig.destroyed || rig.immobilised) && rig.engagedWith != null) clearEngagement(room, rig);
  checkAnnihilation(room);
}

function repairRig(rig, loc, amount) {
  const c = rig[loc];
  if (!c) return;
  // Breaching Round (§12) — a breached Hull can't be repaired until the lock clears.
  if (loc === "hull" && (rig.hullRepairLock || 0) > 0) return;
  // Dismember (§13) — a location sawn past half its original is crippled for good.
  if (rig.noRepair && rig.noRepair[loc]) return;
  // Rivet Lock (§13) — a seized location can't be repaired while rivets hold.
  if (rig.rivetSeized && (rig.rivetSeized[loc] || 0) > 0) return;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  c.sp = Math.min(c.max, c.sp + n);
  if (c.sp > 0) c.destroyed = false;
  recompute(rig);
}

// Breaching Round — deny Hull repair for this round and the next (two Recovery
// ticks). Set from combat when a Siege Maul with the upgrade damages the Hull.
function breachHull(rig) {
  if (rig) rig.hullRepairLock = 2;
}
function tickBreach(rig) {
  if (rig && rig.hullRepairLock > 0) rig.hullRepairLock -= 1;
}

function sunderLocation(target, loc) {
  const c = target?.[loc];
  if (!c || c.max <= 1) return false;
  c.max = Math.max(1, c.max - 1);
  c.sp = Math.min(c.sp, c.max);
  recompute(target);
  return true;
}

// Breach Grip (§13, Claw) — pry the struck location's armour open. The crack
// covers a 2-round window: the round it lands (N) and the next (N+1). It stores
// expiry N+1; rollImpacts applies the +2 while `expiry >= currentRound`, so it
// is live at N and N+1 and gone by N+2. Stale entries are swept in runRecovery.
function crackLocation(room, target, loc) {
  if (!target || !target[loc]) return;
  target.cracked = target.cracked || {};
  target.cracked[loc] = (room?.game?.round || 0) + 1;
}

// Rivet Lock (§13, Rivet Gun) — stack rivets on the struck location. Consecutive
// damaging volleys on the SAME target+location ramp; switching either resets to 1.
// At 3 rivets the location seizes: SP can't be repaired (checked in repairRig) and,
// if it's a weapon-role location, that rig's long-range weapon jams (fire gate) —
// both for a two-Recovery window (round N and N+1, swept in runRecovery). The
// attacker runs +1 heat every rivet volley while the lock is live.
function rivetHit(room, attacker, target, loc) {
  if (!attacker || !target || !target[loc]) return;
  if (attacker.rivetTarget === target.id && attacker.rivetLoc === loc) {
    attacker.rivetStacks = Math.min(3, (attacker.rivetStacks || 0) + 1);
  } else {
    attacker.rivetTarget = target.id;
    attacker.rivetLoc = loc;
    attacker.rivetStacks = 1;
  }
  bumpHeat(attacker, 1);
  if (attacker.rivetStacks >= 3) {
    target.rivetSeized = target.rivetSeized || {};
    target.rivetSeized[loc] = (room?.game?.round || 0) + 1;
  }
}

// Dismember (§13, Circular Saw) — the prototype escalation of Sunder. Chips the
// location's max SP down like Sunder, then, once that max reaches <= half its
// commissioned original, applies a one-time PERMANENT cripple keyed by the
// location's role: mobility → immobilise; weapon → destroy a weapon; structural
// or power → block repairs on that location for good.
function dismemberLocation(room, target, loc, opts) {
  sunderLocation(target, loc);
  const c = target?.[loc];
  if (!c) return;
  target.crippled = target.crippled || {};
  if (target.crippled[loc]) return; // permanent — apply the cripple only once
  const orig = target.origMax?.[loc] ?? c.max;
  if (c.max > orig / 2) return;     // not yet ground to half — no cripple
  target.crippled[loc] = true;
  const kind = kindOf(target);
  const role = roleOf(kind, loc);
  const effects = [];
  if (role === "mobility") {
    // Permanent immobilise — reuse the leg-destruction flag; never resets mid-match.
    target.immobilised = true;
    if (target.engagedWith != null) clearEngagement(room, target);
    effects.push(`Dismember — ${loc} severed; ${target.name} immobilised for good`);
  } else if (role === "weapon") {
    if (kind === "rig") {
      // Rig arms carry two guns; roll which one the saw wrecks (mirrors §8).
      const roll = rollD(12, opts?.dice?.dismemberWeapon, opts?.random);
      const slot = roll <= 6 ? "longRange" : "melee";
      const name = target.weapons?.[slot];
      if (name && !target.weaponsDestroyed.includes(name)) target.weaponsDestroyed.push(name);
    } else {
      const name = target.weapons?.unit;
      if (name && !target.weaponsDestroyed.includes(name)) target.weaponsDestroyed.push(name);
    }
    effects.push(`Dismember — ${loc} mangled; weapon destroyed`);
  } else {
    // structural / power — a permanent repair block on this location.
    target.noRepair = target.noRepair || {};
    target.noRepair[loc] = true;
    effects.push(`Dismember — ${loc} wrecked; repairs permanently blocked`);
  }
  if (room?.game) pushResolution(room, {
    kind: "perk", actor: target.owner, rigId: target.id, rolls: [], summary: effects.join("; "), effects,
  });
}

function setRigSp(rig, loc, sp) {
  const c = rig[loc];
  if (!c) return;
  const v = Math.max(0, Math.min(c.max, Math.floor(Number(sp) || 0)));
  c.sp = v;
  if (v > 0) c.destroyed = false;
  recompute(rig);
  if (c.sp === 0 && roleOf(kindOf(rig), loc) === "power") rig.skipNextActivation = true;
}

function heatRig(rig, spec) {
  const c = rig.engine;
  const s = String(spec).trim();
  let v;
  if (/^[+-]/.test(s)) v = c.heat + Number(s);
  else v = Number(s);
  if (!Number.isFinite(v)) return;
  c.heat = Math.max(engineHeatFloor(rig), Math.floor(v));
}

function sideHasActivatable(room, sideId) {
  return room.rigs.some((r) => (r.owner || "a") === sideId && !r.destroyed && !r.activated);
}

// Rigs a side may still place a preparation on: alive and not already prepared.
function eligibleForPrep(room, sideId) {
  return room.rigs.filter((r) => (r.owner || "a") === sideId && !r.destroyed && r.preparation == null);
}

// After a rig finishes, pass to the other side if it can still act; otherwise
// the same side continues back-to-back; if neither can act, run Recovery (§4).
function handoff(room) {
  if (room.game.outcome) return;
  const cur = room.game.turn.side;
  const other = cur === "a" ? "b" : "a";
  if (sideHasActivatable(room, other)) room.game.turn.side = other;
  else if (sideHasActivatable(room, cur)) room.game.turn.side = cur;
  else runRecovery(room);
}

function runRecovery(room) {
  for (const rig of room.rigs) {
    if (!rig.noCool) {
      const floor = engineHeatFloor(rig);
      // Radiator Array (Cooling) — cools 2 heat instead of the usual 1.
      const cooling = rig.equipment === "radiator-array" ? 2 : 1;
      rig.engine.heat = Math.max(floor, rig.engine.heat - cooling);
    }
    rig.activated = false;
    rig.speedHalvedNextRound = false;
    rig.preparation = null;
    rig.ripostedThisRound = false; // Anvil Boss — the riposte re-arms each round
    rig.suppressImmobile = false;  // Suppression Lock pin lasts one round; re-applied by continued fire
    // Breach Grip (§13, Claw) — sweep out cracks whose expiry round has passed.
    if (rig.cracked) {
      for (const loc of Object.keys(rig.cracked)) {
        if (rig.cracked[loc] < room.game.round) delete rig.cracked[loc];
      }
    }
    // Rivet Lock (§13) — sweep out seizes whose expiry round has passed.
    if (rig.rivetSeized) {
      for (const loc of Object.keys(rig.rivetSeized)) {
        if (rig.rivetSeized[loc] < room.game.round) delete rig.rivetSeized[loc];
      }
    }
    tickBreach(rig);
    // Barrage (§13, Mortar) — upkeep for a committed tube: +1 heat, emit the
    // per-round apply-SP prompt, then count down. At 0 the mortar unlocks.
    if ((rig.barrageRoundsLeft || 0) > 0) {
      bumpHeat(rig, 1);
      pushResolution(room, {
        kind: "barrage", actor: rig.owner, rigId: rig.id, rolls: [],
        summary: `Barrage active — apply 1 SP to each rig in the 3" zone (${rig.barrageRoundsLeft} round(s) left).`,
        effects: [],
      });
      rig.barrageRoundsLeft -= 1;
    }
    recompute(rig);
  }
  room.game.answerTokens = { a: 0, b: 0 };
  room.game.turn = null;
  room.game.phase = "recovery";
  room.game.recoveryClaims = {};
  room.game.recoveryConflict = null;
}

function bumpHeat(rig, n) {
  rig.engine.heat = Math.max(engineHeatFloor(rig), rig.engine.heat + n);
  recompute(rig);
}

// End the acting rig's activation: run the overheat check (§6), mark it done,
// close the turn, then hand off (which may trigger Recovery).
function endActivation(room, rig, dice, random) {
  const m = heatMeter(rig);
  if (m.over > 0) {
    const roll = rollD(12, dice?.overheat, random);
    const total = roll + m.bonus;
    const row = applyOverheat(room, rig, total, { random });
    pushResolution(room, {
      kind: "overheat", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name}: ${row.label} (D12 ${roll}+${m.bonus}=${total})`,
      effects: [row.text],
    });
    checkAnnihilation(room);
  }
  rig.activated = true;
  // Piledriver Protocol (§13, Siege Maul) — a rig carrying the piledriver
  // upgrade gains +1 Momentum (cap 3) for any activation it advanced. Read
  // movedThisActivation HERE, before the clear below zeroes it — endActivation is
  // the once-per-activation choke point, so the gain lands exactly once even if
  // the rig moved several times. Gated on the live long-range profile so only a
  // Siege Maul actually carrying the upgrade charges.
  if (rig.movedThisActivation) {
    const lr = effectiveWeaponProfile("longRange", rig.weapons?.longRange, rig);
    if (lr?.upgradeEffect?.piledriver) rig.momentum = Math.min(3, (rig.momentum || 0) + 1);
  }
  // Clear the Full Tilt/Momentum Swing charge flag at activation end too (not
  // just at start), so a stale `true` can't leak into a reactive strike on the
  // opponent's turn before this rig next activates.
  rig.movedThisActivation = false;
  // Tow Chain (§13, Wrecking Ball) — clear the per-activation root flag at
  // activation end too, so a stale root can't leak past this activation.
  rig.towedThisActivation = false;
  // Suppression Lock's Prepare block (§13) is scoped to exactly the one
  // activation it landed on — clear it here so it doesn't leak into the rig's
  // activation after next.
  rig.noPrepNextActivation = false;
  // Dead Weight (§13, Anchor) — the no-Disengage pin is scoped to the one
  // activation it targeted; clear it here so it can't leak forward.
  rig.noDisengageNextActivation = false;
  // Ion Storm's EMP active-lockout (§13) is scoped to exactly the one activation
  // it penalises — clear it here alongside noPrepNextActivation so it can't leak
  // into a later activation. (Set by an enemy Arc Gun hit before this activation.)
  rig.noActivesNextActivation = false;
  room.game.turn.activeRigId = null;
  handoff(room);
}

// Apply one Heat Threshold Table row's effect to a rig (§6), routed through
// the §8 cascade-aware applyDamage. Returns the row.
function applyOverheat(room, rig, total, opts) {
  const row = heatThreshold(total);
  const kind = kindOf(rig);
  if (!UNIT_KINDS[kind].hasHeat) return row;
  const [powerPart] = partsByRole(kind, "power");
  const [mobPart]   = partsByRole(kind, "mobility");
  const [weapPart]  = partsByRole(kind, "weapon");
  const all = partNamesOf(kind);
  if (row.key === "stall") applyDamage(room, rig, powerPart, 1, opts);
  else if (row.key === "detonation") applyDamage(room, rig, weapPart, 2, opts);
  else if (row.key === "blowout") { applyDamage(room, rig, mobPart, 2, opts); rig.speedHalvedNextRound = true; }
  else if (row.key === "buckling") for (const l of all) applyDamage(room, rig, l, 1, opts);
  else if (row.key === "engine-failure") { applyDamage(room, rig, powerPart, 2, opts); rig.noCool = true; }
  else if (row.key === "catastrophic") { for (const l of all) setRigSp(rig, l, 0); rig.noCool = true; }
  // Engagement (§engagement) — a catastrophic overheat destroys via setRigSp,
  // which bypasses onRigDamaged; clear the melee lock here too.
  if ((rig.destroyed || rig.immobilised) && rig.engagedWith != null) clearEngagement(room, rig);
  return row;
}

// Mutation primitives + weapon-profile lookup injected into the pure combat
// module so it never imports game-state.js (avoids an import cycle).
function combatCtx() {
  return {
    applyDamage,
    bumpHeat,
    pushResolution,
    sunderLocation,
    crackLocation,
    rivetHit: (room, attacker, target, loc) => rivetHit(room, attacker, target, loc),
    dismemberLocation,
    breachHull,
    profileFor: (slot, name, attacker) => effectiveWeaponProfile(slot, name, attacker),
    engage: (room, attacker, target) => maybeEngage(room, attacker, target),
  };
}

// Resolve one Fire/Aimed shot end-to-end (to-hit, heat, budget). Returns the
// resolveAttack result ({ ok, hits, ... }, always truthy) when the shot was made,
// or false when it couldn't be. Callers that only need "did it fire?" treat the
// object as truthy; the Anvil Boss hook reads `res.hits`. Shared by the direct
// path and the deferred Evasive path.
function resolveFire(room, rig, target, a, act, random) {
  const t = room.game.turn;
  const slot = a.weapon === "melee" ? "melee" : "longRange";
  // The ranged weapon must be reloaded before it can fire again (§7): no rushed
  // shot. Firing a spent weapon is a no-op until the player spends a Reload.
  if (slot === "longRange" && rig.loaded.longRange === false) return false;
  const cost = 1;
  if (t.actionsUsed + cost > t.actionsMax) return false;
  const res = resolveAttack(room, rig, target, {
    weapon: a.weapon, target: a.target, arc: a.arc, range: a.range, distance: a.distance, cover: a.cover,
    engaged: rig.engagedWith != null,
    aimed: act === "aimed", aimedLoc: String(a.loc || "hull").toLowerCase(),
    fullAuto: a.fullAuto === true || a.fullAuto === "true",
    charged: a.charged === true || a.charged === "true",
    dice: a.dice,
  }, random, combatCtx());
  if (!res.ok) return false;
  t.actionsUsed += cost;
  // A second (or later) ranged shot in the same activation runs the barrel hot:
  // +1 heat over the base Fire/Aimed cost.
  const secondShot = slot === "longRange" && (t.longRangeShots || 0) >= 1;
  bumpHeat(rig, ACTIONS[act].heat + (secondShot ? 1 : 0));
  if (slot === "longRange") t.longRangeShots = (t.longRangeShots || 0) + 1;
  return res;
}

// Anvil Boss (§13 Bulwark) — a reactive riposte. When a rig holding Raise Shield
// with the Anvil Boss upgrade is HIT (>=1 landed hit) by the FIRST melee attack
// of the round, it answers with a free counter-hit at the upgrade's riposteStr (a
// flat STR-6 melee blow that bypasses weight/conditional STR — see
// combat.computeStr strOverride). A whiff (0 hits) provokes nothing and does NOT
// consume the round's riposte. Melee only (never ranged), once per round
// (ripostedThisRound). Reuses the same resolveAttack path as `return`'s counter.
function maybeAnvilRiposte(room, attacker, defender, incomingWeapon, hits, random) {
  if (incomingWeapon !== "melee") return false;                 // melee attacks only
  if (!(hits > 0)) return false;                                // only a landed hit ripostes
  if (!defender || defender.destroyed) return false;
  if (defender.preparation?.type !== "raise-shield") return false;
  if (defender.weaponUpgrades?.melee !== "anvil-boss") return false;
  if (defender.ripostedThisRound) return false;
  if (!attacker || attacker.destroyed) return false;
  if ((attacker.owner || "a") === (defender.owner || "a")) return false; // enemy only
  const effect = effectiveWeaponProfile("melee", defender.weapons?.melee, defender)?.upgradeEffect;
  const riposteStr = effect?.riposteStr;
  if (riposteStr == null) return false;
  defender.ripostedThisRound = true;
  pushResolution(room, {
    kind: "riposte", actor: defender.owner, rigId: defender.id, rolls: [],
    summary: `${defender.name} ripostes ${attacker.name} — Anvil Boss free counter (STR ${riposteStr}).`,
    effects: [`Anvil Boss — free STR ${riposteStr} melee counter`],
  });
  resolveAttack(room, defender, attacker, {
    weapon: "melee", target: attacker.name,
    arc: "front", range: "near", aimed: false, aimedLoc: "hull",
    engaged: defender.engagedWith != null, strOverride: riposteStr,
  }, random, combatCtx());
  return true;
}

// Skewer (§13, Lance) — after a melee Lance attack resolves, mark the target as
// impaled if the Skewer prototype is fitted, the blow dealt SP (>=1 damaging
// hit), and the attacker↔target melee lock actually holds. The mark is stored on
// the pinned target (`skeweredBy` = the skewerer's id) and read by Disengage.
function maybeSkewer(room, attacker, target, incomingWeapon, res) {
  if (incomingWeapon !== "melee") return false;                 // melee (Lance) only
  if (!attacker || !target || attacker.destroyed) return false;
  if (!res || !(res.hits > 0)) return false;                    // must land a hit
  const dealtSp = Array.isArray(res.impacts) && res.impacts.some((h) => h.sp > 0);
  if (!dealtSp) return false;                                   // and deal SP
  const effect = effectiveWeaponProfile("melee", attacker.weapons?.melee, attacker)?.upgradeEffect;
  if (!effect?.skewer) return false;                            // Skewer prototype only
  // Only mark when the lock actually holds attacker↔target (one-to-one).
  if (attacker.engagedWith !== target.id || target.engagedWith !== attacker.id) return false;
  target.skeweredBy = attacker.id;
  return true;
}

// Dead Weight (§13, Anchor) — a damaging Anchor melee blow pins the struck target
// under the anchor: it can't Disengage on its next activation. Mirrors the
// maybeSkewer gate shape (melee only, must land SP, upgrade must be equipped).
function maybeDeadWeight(room, attacker, target, incomingWeapon, res) {
  if (incomingWeapon !== "melee") return false;
  if (!attacker || !target || attacker.destroyed) return false;
  if (!res || !(res.hits > 0)) return false;
  const dealtSp = Array.isArray(res.impacts) && res.impacts.some((h) => h.sp > 0);
  if (!dealtSp) return false;
  const effect = effectiveWeaponProfile("melee", attacker.weapons?.melee, attacker)?.upgradeEffect;
  if (!effect?.deadWeight) return false;
  target.noDisengageNextActivation = true;
  return true;
}

// Ground Anchor (§13, Anchor) — a damaging Anchor blow that leaves the target
// locked to the anchorer drives the anchor in (`anchoredBy`). Mirrors maybeSkewer.
function maybeGroundAnchor(room, attacker, target, incomingWeapon, res) {
  if (incomingWeapon !== "melee") return false;
  if (!attacker || !target || attacker.destroyed) return false;
  if (!res || !(res.hits > 0)) return false;
  const dealtSp = Array.isArray(res.impacts) && res.impacts.some((h) => h.sp > 0);
  if (!dealtSp) return false;
  const effect = effectiveWeaponProfile("melee", attacker.weapons?.melee, attacker)?.upgradeEffect;
  if (!effect?.groundAnchor) return false;
  if (attacker.engagedWith !== target.id || target.engagedWith !== attacker.id) return false;
  target.anchoredBy = attacker.id;
  return true;
}

// Ground Anchor's Disengage payload — one free Anchor strike at the weapon's
// natural STR (unlike Skewer's flat STR 11). Reuses the resolveAttack path.
function resolveAnchorStrike(room, anchorer, victim, random) {
  pushResolution(room, {
    kind: "anchor", actor: anchorer.owner, rigId: anchorer.id, rolls: [],
    summary: `${victim.name} tears off ${anchorer.name}'s Anchor — free strike as it breaks the lock.`,
    effects: ["Ground Anchor — free Anchor strike on Disengage"],
  });
  resolveAttack(room, anchorer, victim, {
    weapon: "melee", target: victim.name,
    arc: "front", range: "near", aimed: false, aimedLoc: "hull",
    engaged: anchorer.engagedWith != null,
  }, random, combatCtx());
}

// Skewer's Disengage payload — one free STR-11 Lance strike from the skewerer
// onto the fleeing rig as it tears itself off the point. Reuses the same
// strOverride escape hatch and resolveAttack path as the Anvil Boss riposte.
function resolveSkewerStrike(room, skewerer, victim, random) {
  pushResolution(room, {
    kind: "skewer", actor: skewerer.owner, rigId: skewerer.id, rolls: [],
    summary: `${victim.name} tears free of ${skewerer.name}'s Lance — Skewer free strike (STR 11).`,
    effects: ["Skewer — free STR 11 lance strike on Disengage"],
  });
  resolveAttack(room, skewerer, victim, {
    weapon: "melee", target: victim.name,
    arc: "front", range: "near", aimed: false, aimedLoc: "hull",
    engaged: skewerer.engagedWith != null, strOverride: 11,
  }, random, combatCtx());
}

// One action during an activation. Returns whether anything changed.
function performAction(room, rig, act, a, random) {
  const t = room.game.turn;
  if (act === "shutdown") {
    // Shutdown may be called at any point in the activation. Cooling scales
    // with the slots left unspent: 2 heat per remaining action, capped at 5.
    // Never cools below the engine's heat floor.
    const floor = engineHeatFloor(rig);
    const actionsLeft = Math.max(0, t.actionsMax - t.actionsUsed);
    const cool = Math.min(5, 2 * actionsLeft);
    rig.engine.heat = Math.max(floor, rig.engine.heat - cool);
    recompute(rig);
    endActivation(room, rig, null, random);
    return true;
  }
  const equipId = EQUIPMENT_ACTIVE_BY_KEY[act];
  if (equipId) {
    // §engagement — Jump Jets is movement; an engaged rig is pinned and must
    // Disengage before it can jump out. Other actives (harden/purge/…) are fine.
    if (act === "jumpjets" && rig.engagedWith != null) return false;
    // Suppression Lock (§13, Mini Gun) — a stack-3 pin also grounds Jump Jets
    // (movement) until it clears in Recovery.
    if (act === "jumpjets" && rig.suppressImmobile) return false;
    // Emplacement (§13, Bulwark Shield) — a rooted rig can't move, so Jump Jets
    // (movement) is blocked while emplaced. Un-plant first.
    if (act === "jumpjets" && rig.emplaced) return false;
    // Ion Storm (§13, Arc Gun) — an EMP'd rig can't fire any equipment active
    // for its whole next activation. Cleared in endActivation (mirrors
    // noPrepNextActivation) so it's scoped to exactly that one activation.
    if (rig.noActivesNextActivation) return false;
    if (rig.equipment !== equipId || t.actionsUsed >= t.actionsMax) return false;
    const active = EQUIPMENT[equipId].active;
    t.actionsUsed += 1;
    if (act === "harden") rig.hardened = true;
    else if (act === "overclock") t.actionsMax += 2;
    else if (act === "emergencypatch") {
      const loc = LOCS.includes(String(a.loc || "").toLowerCase()) ? a.loc.toLowerCase() : "hull";
      repairRig(rig, loc, 2);
    }
    // purge / jumpjets need no extra state beyond the heat cost below.
    bumpHeat(rig, active.heat);
    pushResolution(room, {
      kind: "equipment", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} uses ${active.label}.`, effects: [active.text],
    });
    return true;
  }
  const def = ACTIONS[act];
  if (!def || t.actionsUsed >= t.actionsMax) return false;
  if (act === "fire" || act === "aimed") {
    const target = findRig(room, a.target);
    if (!target) return false;
    // Ion Storm (§13, Arc Gun) — the discharge overloads the attacker's own gun:
    // its next Arc Gun shot is refused and the lock is consumed on that blocked
    // attempt (mirrors the autocannonSlowNext one-shot downside). Gating here —
    // before any facedown reveal — covers the direct, brace/return and evasive
    // paths in one place. Melee and other long-range weapons are unaffected.
    if (a.weapon !== "melee" && rig.arcLockedNext) {
      const p = effectiveWeaponProfile("longRange", rig.weapons?.longRange, rig);
      if (p?.upgradeEffect?.ionStorm) { rig.arcLockedNext = false; return false; }
    }
    // Barrage (§13, Mortar) — while the tube is committed to a barrage it can't
    // fire a direct Mortar shot (the mortar is locked). Melee is unaffected.
    if (a.weapon !== "melee" && (rig.barrageRoundsLeft || 0) > 0) {
      const p = effectiveWeaponProfile("longRange", rig.weapons?.longRange, rig);
      if (p?.upgradeEffect?.barrage) return false;
    }
    // Rivet Lock (§13, Rivet Gun) — a seized weapon-role location jams this rig's
    // long-range weapon (the gun arm is riveted shut). Melee is unaffected.
    if (a.weapon !== "melee" && rig.rivetSeized) {
      const kind = kindOf(rig);
      const jammed = Object.keys(rig.rivetSeized).some(
        (loc) => (rig.rivetSeized[loc] || 0) > 0 && roleOf(kind, loc) === "weapon",
      );
      if (jammed) return false;
    }
    const facedown = target.preparation && target.preparation.faceUp === false;
    if (facedown) {
      const prep = target.preparation;
      // Affordability pre-check so an unaffordable (or unloaded) shot never
      // reveals the token: a spent ranged weapon must be reloaded first.
      const slot = a.weapon === "melee" ? "melee" : "longRange";
      if (slot === "longRange" && rig.loaded.longRange === false) return false;
      const cost = 1;
      if (t.actionsUsed + cost > t.actionsMax) return false;

      if (prep.type === "evasive") {
        prep.faceUp = true;
        pushResolution(room, reactionRevealEntry(target, "evasive"));
        room.game.pendingReaction = {
          kind: "evasive", attackerId: rig.id, targetId: target.id, defender: target.owner,
          attack: { ...a, act },
        };
        return true; // whole attack deferred to the `react` verb
      }
      const res = resolveFire(room, rig, target, a, act, random);
      if (!res) return false;
      prep.faceUp = true;
      pushResolution(room, reactionRevealEntry(target, prep.type));
      if (prep.type === "return" && !target.destroyed) {
        room.game.pendingReaction = {
          kind: "return", attackerId: rig.id, targetId: target.id, defender: target.owner,
        };
      }
      // Anvil Boss — a raised shield answers the first melee attacker to land a hit.
      maybeAnvilRiposte(room, rig, target, a.weapon, res.hits, random);
      // Skewer — a damaging Lance blow impales the target it just locked.
      maybeSkewer(room, rig, target, a.weapon, res);
      // Dead Weight — a damaging Anchor blow pins the target's next Disengage.
      maybeDeadWeight(room, rig, target, a.weapon, res);
      // Ground Anchor — a damaging Anchor blow drives the anchor into the target it just locked.
      maybeGroundAnchor(room, rig, target, a.weapon, res);
      return true;
    }
    const res = resolveFire(room, rig, target, a, act, random);
    // The shield may already be revealed (face-up) from an earlier attack this
    // round; the riposte still gates on a landed hit and ripostedThisRound.
    if (res) maybeAnvilRiposte(room, rig, target, a.weapon, res.hits, random);
    if (res) maybeSkewer(room, rig, target, a.weapon, res);
    if (res) maybeDeadWeight(room, rig, target, a.weapon, res);
    if (res) maybeGroundAnchor(room, rig, target, a.weapon, res);
    return !!res;
  }
  if (act === "move" || act === "sprint") {
    // §engagement — a rig locked in melee is pinned; it must Disengage before it
    // can reposition. (Repositioning while engaged is meaningless without a grid.)
    if (rig.engagedWith != null) return false;
    // Suppression Lock (§13, Mini Gun) — a stack-3 pin holds the target in place
    // for the round: no Move/Sprint until it clears in Recovery.
    if (rig.suppressImmobile) return false;
    // Emplacement (§13, Bulwark Shield) — a rooted rig cannot move; it must
    // Un-plant first (which lifts the stance and costs +2 heat).
    if (rig.emplaced) return false;
    // Tow Chain (§13, Wrecking Ball) — hauling a rig in with the chain roots the
    // attacker for the rest of this activation: no Move/Sprint after a tow.
    if (rig.towedThisActivation) return false;
    // Optional move-into declaration: the player states they moved into base
    // contact with an enemy, forming the lock. Invalid/friendly names are ignored.
    if (a.engage) maybeEngageByName(room, rig, a.engage);
    // Move / Sprint may repeat within an activation; each spends one slot and
    // adds its heat. Sprint costs 2 heat — 1 with Servo Actuators (Mobility).
    const heat = act === "sprint" ? (rig.equipment === "servo-actuators" ? 1 : def.heat) : def.heat;
    t.actionsUsed += 1;
    bumpHeat(rig, heat);
    // Full Tilt / Momentum Swing (§13) — advancing this activation charges
    // the "moved" flag their melee STR bonus is gated on.
    rig.movedThisActivation = true;
    return true;
  }
  if (act === "disengage") {
    // §engagement — break the melee lock. The budget/`def` guard above already
    // ran (a slot is available). No-op if the rig isn't actually engaged.
    if (rig.engagedWith == null) return false;
    // Dead Weight (§13, Anchor) — pinned under the anchor: can't break the lock
    // this activation. Refused without spending a slot; clears at activation end.
    if (rig.noDisengageNextActivation) return false;
    // Skewer (§13, Lance) — if this rig is impaled by the very partner it's
    // locked to, tearing free provokes one free STR-11 lance strike before the
    // lock breaks. A missing/destroyed skewerer just clears the mark (no strike).
    if (rig.skeweredBy != null && rig.engagedWith === rig.skeweredBy) {
      const skewerer = findRigById(room, rig.skeweredBy);
      if (skewerer && !skewerer.destroyed) resolveSkewerStrike(room, skewerer, rig, random);
      rig.skeweredBy = null;
    }
    // Ground Anchor (§13, Anchor) — tearing off the anchor provokes one free
    // Anchor strike at its natural STR before the lock breaks.
    if (rig.anchoredBy != null && rig.engagedWith === rig.anchoredBy) {
      const anchorer = findRigById(room, rig.anchoredBy);
      if (anchorer && !anchorer.destroyed) resolveAnchorStrike(room, anchorer, rig, random);
      rig.anchoredBy = null;
    }
    clearEngagement(room, rig);
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "disengage", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} disengages.`, effects: [],
    });
    return true;
  }
  if (act === "douse") {
    // §13 — beat out the flames: one slot removes one Burning stack. Napalm
    // never stacks past 1, so a single Douse clears it; Conflagration needs one
    // Douse per stack. No-op if the rig isn't burning.
    if ((rig.burning || 0) <= 0) return false;
    rig.burning = Math.max(0, rig.burning - 1);
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "douse", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} douses the flames (burning ${rig.burning}).`, effects: [],
    });
    return true;
  }
  if (act === "lock") {
    // Fire Control Lock (§13, Missile Barrage) — paint one target for one slot.
    // The next Missile Barrage volley aimed at that exact rig (this round or the
    // next) auto-hits and gains Armour Piercing (see resolveAttack). Only a rig
    // carrying the fire-control upgrade can lock; an unknown target is a no-op.
    const profile = effectiveWeaponProfile("longRange", rig.weapons?.longRange, rig);
    if (!profile?.upgradeEffect?.fireControl) return false;
    const target = findRig(room, a.target);
    if (!target || target.id === rig.id) return false;
    rig.lockedTarget = target.id;
    rig.lockExpiresRound = room.game.round + 1;
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "lock", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} locks Fire Control onto ${target.name}.`,
      effects: [`Next Missile Barrage volley vs ${target.name} auto-hits with Armour Piercing.`],
    });
    return true;
  }
  if (act === "emplace") {
    // Emplacement (§13, Bulwark Shield) — root into the fortress stance. Only a
    // rig carrying the emplacement upgrade may plant, it can't double-plant, and
    // the stance is on a 3-round cooldown measured from when it was entered.
    if (rig.weaponUpgrades?.melee !== "emplacement") return false;
    if (rig.emplaced) return false;
    if (room.game.round < rig.emplaceCooldownUntil) return false;
    rig.emplaced = true;
    rig.emplaceCooldownUntil = room.game.round + 3;
    // Immediately raise the shield — while emplaced this stays up permanently
    // (re-established free at each activation start; see the `activate` verb).
    rig.preparation = { type: "raise-shield", source: "emplace", faceUp: false };
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "emplace", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} emplaces — shield raised, rooted in place.`,
      effects: ["Raise Shield permanent · 2 actions · cannot move · +2 heat to un-plant."],
    });
    return true;
  }
  if (act === "unplant") {
    // Emplacement (§13) — tear the roots up. Lifts the stance and costs +2 heat.
    if (!rig.emplaced) return false;
    rig.emplaced = false;
    bumpHeat(rig, 2);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "unplant", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `${rig.name} un-plants (+2 heat).`, effects: [],
    });
    return true;
  }
  if (act === "barrage") {
    // Barrage (§13, Mortar) — commit the tube to a shelled zone for 2 rounds.
    // Only a Mortar carrying the barrage upgrade may barrage, and not while a
    // barrage is already running (barrageRoundsLeft must be 0). While active the
    // Mortar is locked (see the fire gate) and takes +1 heat upkeep each Recovery.
    const profile = effectiveWeaponProfile("longRange", rig.weapons?.longRange, rig);
    if (!profile?.upgradeEffect?.barrage) return false;
    if ((rig.barrageRoundsLeft || 0) > 0) return false;
    rig.barrageRoundsLeft = 2;
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "barrage", actor: rig.owner, rigId: rig.id, rolls: [],
      summary: `Barrage — place a shelled-zone marker within 6–34" of this Rig; it shells a 3" zone for 2 rounds. Each round, apply 1 SP to every rig in the zone (players adjudicate who's inside).`,
      effects: [`${rig.name} commits its Mortar to a Barrage.`],
    });
    return true;
  }
  if (act === "fieldweld") {
    // Repair module (spec: Support Units) — weld SP onto a friendly unit.
    if (!(rig.modules || []).includes("repair")) return false;
    const target = findRig(room, a.target);
    if (!target || target.owner !== rig.owner || target.destroyed) return false;
    const roll = rollD(12, a.dice?.weld, random);
    const amt = roll >= 10 ? 2 : roll >= 7 ? 1 : 0;
    const names = partNamesOf(kindOf(target));
    const loc = names.includes(String(a.loc || "").toLowerCase()) ? String(a.loc).toLowerCase() : names[0];
    if (amt > 0) repairRig(target, loc, amt);
    bumpHeat(rig, def.heat);
    t.actionsUsed += 1;
    pushResolution(room, {
      kind: "fieldweld", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} field-welds ${target.name} — rolled ${roll} → ${amt} SP to ${loc}`, effects: [],
    });
    return true;
  }
  if (act === "reload") {
    rig.loaded = { longRange: true, melee: true };
  } else if (act === "repair") {
    const roll = rollD(12, a.dice?.repair, random);
    let amt = roll >= 10 ? 2 : roll >= 7 ? 1 : 0;
    // Field Repair Suite (Utility) — the Repair action restores +1 additional SP.
    if (amt > 0 && rig.equipment === "field-repair-suite") amt += 1;
    const loc = LOCS.includes(String(a.loc || "").toLowerCase()) ? a.loc.toLowerCase() : "hull";
    if (amt > 0) repairRig(rig, loc, amt);
    pushResolution(room, {
      kind: "repair", actor: rig.owner, rigId: rig.id,
      rolls: [{ sides: 12, value: roll, label: "D12" }],
      summary: `${rig.name} repair — rolled ${roll} → ${amt} SP to ${loc}`, effects: [],
    });
  } else if (act === "prepare") {
    // Preparations are Rig-only (spec §17). Cold kinds (Tank / Walker) carry
    // reactions: false in their registry entry and cannot Prepare.
    if (!UNIT_KINDS[kindOf(rig)]?.reactions) return false;
    // Suppression Lock (§13, Mini Gun) — a 3rd stack denies this rig's Prepare
    // for its whole next activation. Cleared in endActivation once that
    // activation concludes (NOT at activation start — Prepare is only ever
    // reachable *after* activate() runs for this same activation, so clearing
    // it there would zero the flag before the gate below ever sees it).
    if (rig.noPrepNextActivation) return false;
    let prepType = normalizePrep(a.prep, rig);
    // Piledriver Protocol (§13, Siege Maul) — a rig storing Momentum is all-in on
    // the charge and cannot Raise Shield: a requested Raise Shield downgrades to
    // Brace while momentum > 0 (mirrors normalizePrep's "can't raise → brace"
    // fallback, so the action still yields a preparation rather than fizzling).
    if (prepType === "raise-shield" && (rig.momentum || 0) > 0) prepType = "brace";
    rig.preparation = { type: prepType, source: "action", faceUp: false };
  }
  bumpHeat(rig, def.heat);
  t.actionsUsed += 1;
  return true;
}

// A side that owns rigs but has none left standing loses immediately (§4).
function checkAnnihilation(room) {
  if (!room.game.started || room.game.outcome) return;
  for (const side of room.game.sides) {
    const owns = room.rigs.some((r) => (r.owner || "a") === side.id);
    const alive = room.rigs.some((r) => (r.owner || "a") === side.id && !r.destroyed);
    if (owns && !alive) {
      room.game.outcome = { winner: side.id === "a" ? "b" : "a", reason: "annihilation" };
      room.game.phase = "finished";
      return;
    }
  }
}

// After both sides score Recovery VP: advance to the next round's initiative,
// or — at round MAX_ROUNDS (or beyond, in Sudden Death) — resolve victory by
// points, enter one Sudden Death round on a tie, or declare a draw if still tied.
function advanceRound(room) {
  const [sa, sb] = room.game.sides;
  const lastRound = room.game.suddenDeath || room.game.round >= MAX_ROUNDS;
  if (lastRound) {
    if (sa.vp !== sb.vp) {
      room.game.outcome = { winner: sa.vp > sb.vp ? sa.id : sb.id, reason: "points" };
      room.game.phase = "finished";
    } else if (!room.game.suddenDeath) {
      room.game.suddenDeath = true;
      room.game.round += 1;
      room.game.phase = "initiative";
      room.game.initiative = null;
    } else {
      room.game.outcome = { winner: null, reason: "draw" };
      room.game.phase = "finished";
    }
  } else {
    room.game.round += 1;
    room.game.phase = "initiative";
    room.game.initiative = null;
  }
}

// Turn-scoped verbs whose effect the acting side may revert with `undo`.
const UNDO_VERBS = new Set(["action", "endactivation", "activate", "blast", "react", "answer"]);
const UNDO_LIMIT = 12; // bounded so the serialized room stays small

const cloneState = (v) => JSON.parse(JSON.stringify(v));

// Apply a single normalized command { verb, attrs } to the room in place.
// Returns the room. Bumps room.version only when something actually changed.
export function applyCommand(room, cmd, context = {}, options = {}) {
  ensureGameShape(room);
  const verb = (cmd?.verb || "").toLowerCase();
  const a = cmd?.attrs || {};
  let changed = false;

  // Revert: pop the last turn-scoped snapshot, but only for the side that made
  // it (the acting side). Restores rigs + game wholesale; dice already rolled
  // are undone with it.
  if (verb === "undo") {
    const top = room._history?.[room._history.length - 1];
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    if (top && sideId && top.side === sideId) {
      room._history.pop();
      room.rigs = top.rigs;
      room.game = top.game;
      room.version++;
    }
    return room;
  }

  // Snapshot before a turn-scoped mutation so it can be reverted. Captured up
  // front (pre-mutation) and only committed to history if the command changed
  // anything. Tag it with the acting side: turn-owner verbs belong to the turn
  // side; answer/react are the opponent's reactions and belong to that side.
  let undoSnapshot = null;
  if (UNDO_VERBS.has(verb) && room.game.phase === "activation") {
    const actor = (verb === "answer" || verb === "react")
      ? (normalizeSide(room, a.side) || normalizeSide(room, context.side))
      : room.game.turn?.side;
    if (actor) {
      undoSnapshot = { side: actor, rigs: cloneState(room.rigs), game: cloneState(room.game) };
    }
  }

  if (verb === "add") {
    if (a.name && !findRig(room, a.name)) {
      const kindId = String(a.kind || "rig").toLowerCase();
      if (!UNIT_KINDS[kindId]) return room;
      const owner = normalizeSide(room, a.owner) || normalizeSide(room, context.side) || "a";
      if (canAddRigForSide(room, owner)) {
        const unit = makeUnit(kindId, room.nextRigId, a.name, owner, {
          // Rig options
          weightClass: (a.class || a.weightClass || "").toLowerCase() || undefined,
          longRange: a.longRange || a.lr,
          melee: a.melee,
          longRangeUpgrade: a.longRangeUpgrade || a.lrUpgrade,
          meleeUpgrade: a.meleeUpgrade,
          equipment: a.equipment ?? null,
          sp: a.sp,
          chassis: a.chassis,
          // Flat-pick options
          unit: a.unit,
        });
        if (!unit) return room;
        room.nextRigId++;
        room.rigs.push(unit);
        resetReadyBeforeStart(room);
        changed = true;
      }
    }
  } else if (verb === "remove") {
    const rig = findRig(room, a.name);
    if (rig) {
      clearEngagement(room, rig);
      room.rigs = room.rigs.filter((r) => r !== rig);
      resetReadyBeforeStart(room);
      changed = true;
    }
  } else if (verb === "ready") {
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    const side = room.game.sides.find((s) => s.id === sideId);
    if (side && !room.game.started && room.field.locked &&
        sideRigCount(room, side.id) >= 3 && !side.ready) {
      side.ready = true;
      if (!room.game.deployOrder.includes(side.id)) room.game.deployOrder.push(side.id);
      maybeStartGame(room, options.random);
      changed = true;
    }
  } else if (verb === "reset") {
    for (const rig of room.rigs) {
      for (const loc of LOCS) { rig[loc].sp = rig[loc].max; rig[loc].destroyed = false; }
      rig.engine.heat = 0;
      rig.activated = false;
      rig.destroyed = false;
      rig.skipNextActivation = false;
      rig.noCool = false;
      rig.speedHalvedNextRound = false;
      if (rig.loaded) { rig.loaded.longRange = true; rig.loaded.melee = true; }
      rig.preparation = null;
      rig.weaponsDestroyed = [];
      rig.immobilised = false;
      rig.engagedWith = null;
      rig.hardened = false;
      rig.overclockCoreUsed = false;
      rig.actionPenaltyNextActivation = 0;
      rig.hullRepairLock = 0;
      rig.ripostedThisRound = false;
      rig.emplaced = false;
      rig.emplaceCooldownUntil = 0;
      rig.momentum = 0; // Piledriver Protocol (§13) — clear stored Momentum on reset
      rig.barrageRoundsLeft = 0;      // Barrage (§13) — clear a committed tube
      rig.towChainCooldownUntil = 0;  // Tow Chain (§13) — clear the fling cooldown
      rig.harpoonWinchCooldownUntil = 0; // Harpoon Winch (§13) — clear the reel cooldown
      rig.towedThisActivation = false;
      rig.noDisengageNextActivation = false; // Dead Weight (§13) — clear the Disengage pin on reset
      // Melee-lock marks (§13) — a reset rebuilds each rig pristine and drops
      // engagedWith directly (bypassing clearEngagement), so clear the free-strike
      // marks here too or a stale id survives into the next match and fires a
      // phantom strike the first time the re-engaged partner Disengages.
      rig.skeweredBy = null;     // Skewer (§13, Lance)
      rig.anchoredBy = null;     // Ground Anchor (§13, Anchor)
      // Rivet Lock (§13, Rivet Gun) — clear the attacker's stacking counters and
      // the target's seizes, else a carried stack instantly seizes on the first
      // hit of the next match.
      rig.rivetTarget = null;
      rig.rivetLoc = null;
      rig.rivetStacks = 0;
      rig.rivetSeized = {};
      // §13 status effects — a reset returns each rig to its commissioned state,
      // so clear every remaining transient combat status. A stale counter/stack/
      // paint or a leftover per-location map would otherwise misfire on the first
      // action of the next match (e.g. an instant Suppression pin, a phantom
      // Fire Control volley, or a location still marked cracked/no-repair).
      rig.burning = 0;                    // Napalm / Conflagration DoT
      rig.suppressTarget = null;          // Suppression Lock (Mini Gun)
      rig.suppressStacks = 0;
      rig.suppressImmobile = false;
      rig.autocannonShots = 0;            // Penetrator Rounds (Autocannon) belt cadence
      rig.autocannonSlowNext = false;
      rig.enfiladeShots = 0;              // Enfilade (Sniper Cannon) ricochet cadence
      rig.arcLockedNext = false;          // Ion Storm (Arc Gun) self-overload
      rig.noPrepNextActivation = false;   // Suppression Lock / Ion Storm scoped pins
      rig.noActivesNextActivation = false;
      rig.movedThisActivation = false;
      rig.lockedTarget = null;            // Fire Control Lock (Missile Barrage) paint
      rig.lockExpiresRound = 0;
      rig.cracked = {};                   // Breach Grip (Claw)
      rig.crippled = {};                  // Dismember (Circular Saw) — permanent within a match, cleared between
      rig.noRepair = {};
      rig.kneecapped = {};                // Kneecapper (Double MG) per-limb tags
      delete rig._blastRolled;
      // Re-derive SP-dependent state (armsSuppressed, cripple ramps) now that
      // every location is back at max and the tag maps are cleared.
      recompute(rig);
    }
    resetGameShape(room);
    changed = true;
  } else if (verb === "seed") {
    const roster = Array.isArray(a.roster) && a.roster.length ? a.roster : SEED_ROSTER;
    const first = normalizeSide(room, a.first) || "a";
    room.rigs = [];
    room.nextRigId = 1;
    resetGameShape(room);
    for (const entry of roster) {
      const pb = resolveChassis({ chassis: entry.chassis });
      if (!pb) continue;
      const owner = normalizeSide(room, entry.owner) || "a";
      const unit = makeUnit("rig", room.nextRigId, entry.name, owner, {
        weightClass: pb.class, longRange: pb.longRange, melee: pb.melee,
        chassis: pb.id, sp: pb.sp,
      });
      if (!unit) continue;
      room.nextRigId++;
      room.rigs.push(unit);
    }
    const canStart = sideRigCount(room, "a") >= 3 && sideRigCount(room, "b") >= 3;
    if (canStart) {
      room.field.locked = true;
      room.seeded = true;
      startGameSeeded(room, first);
    }
    changed = true;
  } else if (verb === "setdice") {
    if (!room.game.started) {
      const want = String(a.value || "").toLowerCase() !== "manual";
      if (room.game.autoResolve !== want) { room.game.autoResolve = want; changed = true; }
    }
  } else if (verb === "field") {
    const sideId = normalizeSide(room, context.side);
    const action = String(a.action || "set").toLowerCase();
    if (sideId && sideId === room.ownerSide && !room.game.started) {
      if (action === "lock") {
        if (!room.field.locked) { room.field.locked = true; changed = true; }
      } else if (!room.field.locked) {
        if (action === "reroll") {
          room.field.terrain = scatterTerrain(room.field, options.random);
          changed = true;
        } else if (action === "set") {
          const dims = clampDimensions(
            a.width != null ? a.width : room.field.width,
            a.height != null ? a.height : room.field.height,
          );
          room.field.width = dims.width;
          room.field.height = dims.height;
          if (a.diagonal === "trbl" || a.diagonal === "tlbr") room.field.diagonal = a.diagonal;
          room.game.objectives = computeObjectives(room.field);
          room.field.terrain = scatterTerrain(room.field, options.random);
          changed = true;
        }
      }
    }
  } else if (verb === "initiative") {
    if (room.game.phase === "initiative") {
      const auto = a.dice == null;
      let ra = rollD(12, a.dice?.a, options.random);
      let rb = rollD(12, a.dice?.b, options.random);
      if (auto) { while (ra === rb) { ra = rollD(12, null, options.random); rb = rollD(12, null, options.random); } }
      if (ra !== rb) {
        const order = ra > rb ? ["a", "b"] : ["b", "a"];
        applyInitiative(room, order, { a: ra, b: rb });
        pushResolution(room, {
          kind: "initiative", actor: order[0], rigId: null,
          rolls: [{ sides: 12, value: ra, label: "Side A" }, { sides: 12, value: rb, label: "Side B" }],
          summary: `Round ${room.game.round} initiative — ${order[0]} first (${ra} vs ${rb})`,
          effects: [],
        });
        changed = true;
      }
    }
  } else if (verb === "activate") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && room.game.phase === "activation" && t.activeRigId == null &&
        !room.game.pendingAnswer && !room.game.pendingReaction &&
        (rig.owner || "a") === t.side && !rig.destroyed && !rig.activated) {
      rig.hardened = false; // Harden (Ablative Plating) lasts only until this Rig's next activation
      if (rig.skipNextActivation) {
        rig.skipNextActivation = false;
        rig.activated = true;
        pushResolution(room, { kind: "skip", actor: rig.owner, rigId: rig.id, rolls: [],
          summary: `${rig.name} loses this activation (engine offline).`, effects: [] });
        handoff(room);
      } else {
        t.activeRigId = rig.id;
        t.actionsUsed = 0;
        t.longRangeShots = 0; // ranged shots fired this activation (2nd+ runs hot)
        const penalty = Math.max(0, Math.floor(rig.actionPenaltyNextActivation || 0));
        const base = UNIT_KINDS[kindOf(rig)]?.actionBudget ?? 3;
        const [structPart] = partsByRole(kindOf(rig), "structural");
        const structPenalty = structPart && rig[structPart]?.sp === 0 ? 2 : 0;
        let actionsMax = Math.max(0, base - structPenalty - penalty);
        // Emplacement (§13, Bulwark Shield) — a rooted rig trades one action for
        // its permanent guard: budget drops by 1 (floored at 1).
        if (rig.emplaced) actionsMax = Math.max(1, actionsMax - 1);
        t.actionsMax = actionsMax;
        rig.actionPenaltyNextActivation = 0;
        rig.movedThisActivation = false; // Full Tilt/Momentum Swing charge flag (§13)
        rig.towedThisActivation = false; // Tow Chain root flag (§13) — fresh each activation
        rig.loaded = { longRange: true, melee: true };
        // Emplacement (§13) — the fortress shield is permanent: re-establish
        // Raise Shield for free each activation (no Prepare, no Answer token),
        // unless it's already up (e.g. carried over from a mid-round reveal).
        if (rig.emplaced && !(rig.preparation && rig.preparation.type === "raise-shield")) {
          rig.preparation = { type: "raise-shield", source: "emplace", faceUp: false };
        }
        // Burning (§13, Napalm/Conflagration) — a rig on fire takes `burning` SP
        // to its Hull at the start of its activation. The status persists until
        // doused (one stack per Douse action).
        if (rig.burning > 0) {
          applyDamage(room, rig, "hull", rig.burning, { random: options.random });
          pushResolution(room, {
            kind: "burning", actor: rig.owner, rigId: rig.id, rolls: [],
            summary: `${rig.name} burns for ${rig.burning} SP to the Hull.`, effects: [],
          });
        }
      }
      changed = true;
    }
  } else if (verb === "action") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && !room.game.pendingReaction &&
        room.game.phase === "activation" && t.activeRigId === rig.id) {
      changed = performAction(room, rig, String(a.action || "").toLowerCase(), a, options.random);
    }
  } else if (verb === "endactivation") {
    const rig = findRig(room, a.name);
    const t = room.game.turn;
    if (rig && t && !room.game.pendingReaction &&
        room.game.phase === "activation" && t.activeRigId === rig.id) {
      endActivation(room, rig, a.dice, options.random);
      changed = true;
    }
  } else if (verb === "vp") {
    if (room.game.phase === "recovery") {
      const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
      if (sideId) {
        const objs = room.game.objectives || [];
        // Sanitize the claimed marker indices: integers in range, de-duplicated.
        const claims = Array.isArray(a.claims)
          ? [...new Set(
              a.claims
                .map((i) => Math.floor(Number(i)))
                .filter((i) => Number.isInteger(i) && i >= 0 && i < objs.length),
            )]
          : [];
        // Overwrite so a side can resubmit to resolve a conflict.
        room.game.recoveryClaims[sideId] = claims;
        changed = true;
        // Resolve only once BOTH sides have submitted their claims.
        if (room.game.sides.every((s) => Array.isArray(room.game.recoveryClaims[s.id]))) {
          const [sa, sb] = room.game.sides;
          const ca = room.game.recoveryClaims[sa.id];
          const cb = room.game.recoveryClaims[sb.id];
          const conflict = ca.filter((i) => cb.includes(i));
          if (conflict.length) {
            // Both claimed the same marker — block and flag for re-check (§11).
            room.game.recoveryConflict = conflict;
          } else {
            room.game.recoveryConflict = null;
            for (const s of room.game.sides) {
              s.vp += room.game.recoveryClaims[s.id]
                .reduce((sum, i) => sum + (objs[i]?.vp || 0), 0);
            }
            advanceRound(room);
          }
        }
      }
    }
  } else if (verb === "blast") {
    if (room.game.pendingBlast) {
      const pending = room.game.pendingBlast;
      const source = room.rigs.find((x) => x.id === pending.sourceId);
      const actor = source ? (source.owner || "a") : null;
      const names = Array.isArray(a.targets) ? a.targets : [];
      for (const name of names) {
        const t = findRig(room, name);
        if (!t || t.destroyed) continue;
        const loc = hitLocation(t.kind || "rig", rollD(12, a.dice?.location?.[name], options.random));
        const die = rollD(6, a.dice?.impacts?.[name], options.random);
        const total = die + 10; // D6 + STR 10 (§9)
        const sev = impactSeverity(total, impactRow(t.kind || "rig", loc, t.weightClass));
        if (sev.sp > 0) applyDamage(room, t, loc, sev.sp, { random: options.random });
        pushResolution(room, {
          kind: "blast", actor, rigId: t.id,
          rolls: [{ sides: 6, value: die, label: "D6" }],
          summary: `Blast hits ${t.name}: ${total} → ${sev.tier} (${sev.sp} SP to ${loc})`, effects: [],
        });
      }
      // A target destroyed by this blast may itself chain into a new pending
      // blast (set by onRigDamaged during applyDamage above) — don't clobber it.
      if (room.game.pendingBlast === pending) room.game.pendingBlast = null;
      changed = true;
    }
  } else if (verb === "answer") {
    const rig = findRig(room, a.name);
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    if (rig && sideId && (rig.owner || "a") === sideId &&
        room.game.answerTokens[sideId] > 0 && rig.preparation == null) {
      rig.preparation = { type: normalizePrep(a.prep, rig), source: "answer", faceUp: false };
      room.game.answerTokens[sideId] -= 1;
      if (room.game.pendingAnswer && room.game.pendingAnswer.side === sideId) {
        room.game.pendingAnswer.remaining -= 1;
        if (room.game.pendingAnswer.remaining <= 0 || eligibleForPrep(room, sideId).length === 0) {
          room.game.pendingAnswer = null;
        }
      }
      changed = true;
    }
  } else if (verb === "react") {
    const pr = room.game.pendingReaction;
    const sideId = normalizeSide(room, a.side) || normalizeSide(room, context.side);
    if (pr && sideId === pr.defender) {
      const reactor = room.rigs.find((x) => x.id === pr.targetId);   // the prepared rig
      const attacker = room.rigs.find((x) => x.id === pr.attackerId);
      if (pr.kind === "evasive" && reactor && attacker) {
        const evaded = a.evaded === true || a.evaded === "true";
        if (evaded) {
          // The shot was fired but dodged: weapon discharged, attacker still runs
          // hot and spends the action, but no to-hit / no damage.
          const slot = pr.attack.weapon === "melee" ? "melee" : "longRange";
          const cost = 1;
          const rt = room.game.turn;
          const secondShot = slot === "longRange" && (rt.longRangeShots || 0) >= 1;
          if (slot === "longRange") attacker.loaded.longRange = false;
          const profile = effectiveWeaponProfile(slot, attacker.weapons?.[slot], attacker);
          const hot = profile?.perks?.includes("Hot") ? 1 : 0;
          bumpHeat(attacker, (ACTIONS[pr.attack.act]?.heat || 1) + hot + (secondShot ? 1 : 0));
          rt.actionsUsed += cost;
          if (slot === "longRange") rt.longRangeShots = (rt.longRangeShots || 0) + 1;
          pushResolution(room, {
            kind: "attack", actor: attacker.owner, rigId: reactor.id, rolls: [],
            summary: `${reactor.name} evades — ${attacker.name}'s attack fails.`, effects: [],
          });
        } else {
          resolveFire(room, attacker, reactor, pr.attack, pr.attack.act, options.random);
        }
        reactor.preparation = null;
        room.game.pendingReaction = null;
        changed = true;
      } else if (pr.kind === "return" && reactor && attacker) {
        const declined = a.decline === true || a.decline === "true";
        if (!declined && a.attack && !reactor.destroyed) {
          resolveAttack(room, reactor, attacker, {
            weapon: a.attack.weapon, target: attacker.name,
            arc: a.attack.arc, range: a.attack.range, distance: a.attack.distance, cover: a.attack.cover,
            engaged: reactor.engagedWith != null,
            aimed: false, aimedLoc: "hull",
            fullAuto: a.attack.fullAuto === true || a.attack.fullAuto === "true",
            charged: a.attack.charged === true || a.attack.charged === "true",
            autoReload: false, dice: a.attack.dice,
          }, options.random, combatCtx());
        }
        reactor.preparation = null;
        room.game.pendingReaction = null;
        changed = true;
      }
    }
  } else if (verb === "randomize") {
    const rig = findRig(room, a.name);
    if (rig && kindOf(rig) === "rig") {
      clearEngagement(room, rig);
      const idx = room.rigs.indexOf(rig);
      const fresh = makeRig(
        rig.id, rig.name, rig.weightClass, rig.owner,
        randomRigWeapons(options.random), randomEquipment(options.random),
      );
      if (fresh && idx >= 0) { room.rigs[idx] = fresh; changed = true; }
    }
  } else {
    const rig = findRig(room, a.name);
    if (rig) {
      if (verb === "damage") { applyDamage(room, rig, (a.loc || "").toLowerCase(), a.amount, { random: options.random }); changed = true; }
      else if (verb === "repair") { repairRig(rig, (a.loc || "").toLowerCase(), a.amount); changed = true; }
      else if (verb === "set") {
        setRigSp(rig, (a.loc || "").toLowerCase(), a.sp);
        // §engagement — setRigSp can mark a rig destroyed/immobilised without routing
        // through onRigDamaged; clear any melee lock here too.
        if ((rig.destroyed || rig.immobilised) && rig.engagedWith != null) clearEngagement(room, rig);
        changed = true;
      }
      else if (verb === "heat") { heatRig(rig, a.amount); changed = true; }
    }
  }

  if (changed) {
    if (undoSnapshot) {
      room._history.push(undoSnapshot);
      while (room._history.length > UNDO_LIMIT) room._history.shift();
    }
    room.version++;
  }
  return room;
}

// The room view sent to clients — omit internal bookkeeping.
export function publicState(room, side) {
  ensureGameShape(room);
  const sideId = normalizeSide(room, side);
  const bounties = {};
  if (sideId && room.game.bounties[sideId]) bounties[sideId] = room.game.bounties[sideId];
  const viewer = sideId;
  const top = room._history?.[room._history.length - 1];
  const canUndo = !!top && room.game.phase === "activation" && top.side === viewer;
  const rigs = room.rigs.map((rig) => {
    const prep = rig.preparation;
    if (!room.seeded && prep && prep.faceUp === false && (rig.owner || "a") !== viewer) {
      return { ...rig, preparation: { hidden: true } };
    }
    return rig;
  });
  return {
    code: room.code,
    version: room.version,
    seeded: room.seeded ?? false,
    ownerSide: room.ownerSide ?? null,
    field: room.field
      ? { ...room.field, terrain: room.field.terrain.map((t) => ({ ...t })) }
      : null,
    game: {
      ...room.game,
      sides: room.game.sides.map((s) => ({ ...s })),
      objectives: room.game.objectives.map((objective) => ({ ...objective })),
      bounties,
      canUndo,
    },
    rigs,
  };
}

// Human-readable battle-state block injected into the chat system prompt.
export function formatBattleState(room, side) {
  ensureGameShape(room);
  const g = room.game;
  const lines = ["", "=== CURRENT BATTLE STATE ==="];
  lines.push(`Round ${g.round}/5`);
  lines.push(`Sides: ${g.sides.map((s) => `${s.name} (${s.id}) VP ${s.vp}${s.ready ? " READY" : ""}`).join(" | ")}`);
  lines.push(`Battle started: ${g.started ? "yes" : "no"}`);
  lines.push(`Phase: ${g.phase}${g.outcome ? ` (winner: ${g.outcome.winner || "draw"})` : ""}`);
  if (g.turn) {
    const active = g.turn.activeRigId ? room.rigs.find((x) => x.id === g.turn.activeRigId) : null;
    const acting = active ? ` — ${active.name} (${g.turn.actionsUsed}/${g.turn.actionsMax} actions)` : "";
    lines.push(`Turn: ${g.turn.side}${acting}`);
  }
  if (room.rigs.length === 0) {
    lines.push("(No Rigs are being tracked yet.)");
  } else {
    for (const rig of room.rigs) {
      const kind = kindOf(rig);
      const cfg = UNIT_KINDS[kind];
      const [powerPart] = partsByRole(kind, "power");
      const parts = partNamesOf(kind).map((loc) => {
        const c = rig[loc];
        let tag = `${loc} ${c.sp}/${c.max}`;
        if (cfg.hasHeat && loc === powerPart) tag += ` heat ${c.heat}`;
        if (c.destroyed) tag += " (DESTROYED)";
        else if (c.sp === 0) tag += " (CATASTROPHIC)";
        return tag;
      });
      const status = rig.destroyed ? ` [${cfg.label.toUpperCase()} DESTROYED]` : "";
      let weapons = "";
      if (rig.weapons) {
        if (cfg.weaponMode === "flat-pick") {
          weapons = `; weapon ${rig.weapons.unit || "?"}`;
        } else {
          weapons = `; weapons ${rig.weapons.longRange || "?"} / ${rig.weapons.melee || "?"}`;
        }
      }
      const chassis = cfg.id === "rig" ? rig.weightClass : cfg.label;
      lines.push(`- ${rig.name} (${chassis}, owner ${rig.owner})${status}: ${parts.join(", ")}${weapons}`);
    }
  }
  const sideId = normalizeSide(room, side);
  const bountyId = sideId ? g.bounties[sideId] : null;
  const bounty = bountyId ? room.rigs.find((rig) => rig.id === bountyId) : null;
  if (bounty) lines.push(`Your Ironclad Bounty: ${bounty.name}`);
  return lines.join("\n");
}

export const __test = { applyDamage, applyOverheat, breachHull, tickBreach, repairRig, setRigSp, ensureRigShape, setEngagement, clearEngagement, maybeEngage, runRecovery, crackLocation, dismemberLocation, rivetHit };
