// Campaign catalog: static data for the Mercenary Contracts roguelite
// (docs/design/campaign.md). Pure data, no logic beyond tiny lookups.
//
// Side modifiers (`mods`) use the engine keys from the doc's "Side modifiers"
// table: sp {loc:n}, heatCap, startHeat, speed, pen {ranged, melee}, acc, cool,
// repair, answer, grit, actionsR1. Economy-only relic keys live in `econ` and
// never reach the engine.

import { CHASSIS, EQUIPMENT } from "../game-state.js";

export const FACTIONS = [
  { id: "krim", name: "Krim Corporation", short: "Krim", perk: "Overwhelming Fire",
    text: "+1 Penetration on ranged attacks", mods: { pen: { ranged: 1 } } },
  { id: "nox", name: "Nox Industries", short: "Nox", perk: "Heavy Frames",
    text: "+2 max SP Hull, +1 max SP Legs", mods: { sp: { hull: 2, legs: 1 } } },
  { id: "arcus", name: "Arcus Technologies", short: "Arcus", perk: "Arc Drives",
    text: "+1\" Speed", mods: { speed: 1 } },
  { id: "triton", name: "Triton Engineering", short: "Triton", perk: "Sea-Cooled",
    text: "+1 Heat Capacity", mods: { heatCap: 1 } },
  { id: "freegear", name: "Freegear Coalition", short: "Freegear", perk: "Scrap Wizards",
    text: "Repair heals +1 SP; +1 Grit token at the start of each battle", mods: { repair: 1, grit: 1 } },
];

export const factionById = (id) => FACTIONS.find((f) => f.id === id) || null;

// `pack`: 0 = unlocked from the start, 1..3 = bought at HQ as relic packs.
export const RELICS = [
  { id: "coolant-lines", name: "Salvaged Coolant Lines", text: "+1 Heat Capacity", pack: 0, mods: { heatCap: 1 } },
  { id: "hardened-bulkheads", name: "Hardened Bulkheads", text: "+2 max SP Hull", pack: 0, mods: { sp: { hull: 2 } } },
  { id: "tuned-pistons", name: "Tuned Pistons", text: "+1\" Speed", pack: 0, mods: { speed: 1 } },
  { id: "scrappers-contract", name: "Scrapper's Contract", text: "+2 salvage per kill", pack: 0, econ: { salvagePerKill: 2 } },

  { id: "reinforced-chassis", name: "Reinforced Chassis", text: "+1 max SP Legs and Arms", pack: 1, mods: { sp: { legs: 1, arms: 1 } } },
  { id: "heat-sinks", name: "Heat Sinks", text: "Cool +1 extra each Recovery", pack: 1, mods: { cool: 1 } },
  { id: "field-welders", name: "Field Welders", text: "Repair heals +1 SP", pack: 1, mods: { repair: 1 } },
  { id: "union-mechanics", name: "Union Mechanics", text: "Repairs cost 1 salvage less per SP (min 1)", pack: 1, econ: { repairDiscount: 1 } },

  { id: "veteran-crews", name: "Veteran Crews", text: "+1 Answer token each round", pack: 2, mods: { answer: 1 } },
  { id: "grit-and-gears", name: "Grit and Gears", text: "+1 Grit token at battle start", pack: 2, mods: { grit: 1 } },
  { id: "gyro-stabilisers", name: "Gyro Stabilisers", text: "+1 accuracy on every attack", pack: 2, mods: { acc: 1 } },
  { id: "lucky-charm", name: "Lucky Charm", text: "Reward rerolls are free", pack: 2, econ: { freeReroll: true } },

  { id: "hot-loads", name: "Hot Loads", text: "+1 Penetration on ranged attacks, rigs start with 1 heat", pack: 3, mods: { pen: { ranged: 1 }, startHeat: 1 } },
  { id: "serrated-edges", name: "Serrated Edges", text: "+1 Penetration in melee", pack: 3, mods: { pen: { melee: 1 } } },
  { id: "cracked-reactor", name: "Cracked Reactor", text: "+1 action on round 1, rigs start with 2 heat", pack: 3, mods: { actionsR1: 1, startHeat: 2 } },
  { id: "recovery-winch", name: "Recovery Winch", text: "Wreck recovery costs half", pack: 3, econ: { recoveryHalf: true } },
];

export const relicById = (id) => RELICS.find((r) => r.id === id) || null;

// Perk kits graft an existing combat perk onto one weapon. Roster stores the
// perk NAME in rig.perkKits[slot] so the engine can merge it straight into the
// weapon profile's `perks`. ("Staggering" from the doc has no engine perk yet.)
export const PERK_KITS = [
  { perk: "Armour Piercing", text: "Failed wound rolls get a second chance" },
  { perk: "Incendiary", text: "Hits add +1 heat to the target" },
  { perk: "Shock", text: "Hits halve the target's Speed next round" },
  { perk: "Rend", text: "+1 Damage per wound" },
  { perk: "Impale", text: "Hits pin the target in place" },
];

export const PRICES = {
  startSalvage: 20,
  workshopSalvage: 10,
  payoutBase: 12, payoutPerStep: 4, bossPayout: 40,
  kill: 3,
  crate: 6,
  repair: { field: 2, depot: 1 },
  recover: { field: 24, depot: 16 },
  upgrade: { field: 10, tuned: 16, prototype: 24 },
  equipment: 14,
  equipUpgrade: { field: 8, tuned: 14, prototype: 20 },
  relic: 26,
  perkKit: 18,
  respec: 6,
  reroll: 5,
  salvageCache: 15,
};

// Starting (free) unlock state.
export const STARTING = {
  chassis: ["light-claw-autocannon", "light-harpoon-anchor", "medium-lance-mortar", "medium-shield-siege"],
  equipment: ["ablative-plating", "radiator-array", "servo-actuators", "field-repair-suite"],
  relics: RELICS.filter((r) => r.pack === 0).map((r) => r.id),
};

// HQ unlock table. `kind` groups the tree; `target` is the chassis / equipment
// id or pack number it opens; `requires` names another unlock id.
export const UNLOCKS = [
  ...CHASSIS.filter((c) => !STARTING.chassis.includes(c.id)).map((c) => ({
    id: `chassis:${c.id}`, kind: "chassis", target: c.id, cost: 4, label: `${c.name} (${c.label})`,
  })),
  { id: "nature:tuned", kind: "nature", target: "tuned", cost: 6, label: "Tuned upgrades" },
  { id: "nature:prototype", kind: "nature", target: "prototype", cost: 10, label: "Prototype upgrades", requires: "nature:tuned" },
  ...Object.keys(EQUIPMENT).filter((e) => !STARTING.equipment.includes(e)).map((e) => ({
    id: `equipment:${e}`, kind: "equipment", target: e, cost: 3, label: EQUIPMENT[e].label,
  })),
  { id: "perkkits", kind: "perkkits", cost: 6, label: "Perk kits" },
  ...[1, 2, 3].map((p) => ({
    id: `relics:${p}`, kind: "relics", target: p, cost: 5,
    label: `Relic pack ${p}: ${RELICS.filter((r) => r.pack === p).map((r) => r.name).join(", ")}`,
  })),
  { id: "workshop:salvage1", kind: "workshop", cost: 4, label: "+10 starting salvage" },
  { id: "workshop:salvage2", kind: "workshop", cost: 4, label: "+10 starting salvage (II)", requires: "workshop:salvage1" },
  { id: "workshop:salvage3", kind: "workshop", cost: 4, label: "+10 starting salvage (III)", requires: "workshop:salvage2" },
  { id: "workshop:cards4", kind: "workshop", cost: 8, label: "4 reward cards instead of 3" },
  { id: "workshop:freerecovery", kind: "workshop", cost: 6, label: "One free wreck recovery per run" },
  { id: "workshop:fieldstart", kind: "workshop", cost: 5, label: "Start with a Field upgrade on each weapon" },
];

export const unlockById = (id) => UNLOCKS.find((u) => u.id === id) || null;

// Notoriety ladder. Upgrade policy per enemy unit by step:
//   fieldFrom  , Field upgrades on both weapons from this step
//   tunedFrom  , Tuned upgrades from this step
//   metaFrom   , META.builds (GA hard builds) from this step
//   equipment  , primary equipment (+ its Field upgrade from tunedFrom on)
//   factionAlways, the faction perk on every contract (else only the boss)
//   relics     , random enemy relics for the run
export const NOTORIETY = [
  { level: 0, enemyBot: "easy", equipment: false, fieldFrom: 3, tunedFrom: null, metaFrom: null, factionAlways: false, mods: {}, relics: 0,
    text: "Easy pilot, bare rigs, Field upgrades from step 3" },
  { level: 1, enemyBot: "normal", equipment: true, fieldFrom: 1, tunedFrom: null, metaFrom: null, factionAlways: false, mods: {}, relics: 0,
    text: "Normal pilot, primary equipment, Field upgrades" },
  { level: 2, enemyBot: "normal", equipment: true, fieldFrom: 1, tunedFrom: 3, metaFrom: null, factionAlways: true, mods: {}, relics: 0,
    text: "Normal pilot, Tuned from step 3, faction perk on every contract" },
  { level: 3, enemyBot: "hard", equipment: true, fieldFrom: 1, tunedFrom: 1, metaFrom: 3, factionAlways: true, mods: {}, relics: 0,
    text: "Hard pilot, meta builds from step 3" },
  { level: 4, enemyBot: "hard", equipment: true, fieldFrom: 1, tunedFrom: 1, metaFrom: 1, factionAlways: true,
    mods: { sp: { hull: 1, arms: 1, legs: 1, engine: 1 } }, relics: 0,
    text: "Hard pilot, meta builds, enemy +1 SP on every location" },
  { level: 5, enemyBot: "hard", equipment: true, fieldFrom: 1, tunedFrom: 1, metaFrom: 1, factionAlways: true,
    mods: { sp: { hull: 1, arms: 1, legs: 1, engine: 1 } }, relics: 1,
    text: "Hard pilot, meta builds, enemy +1 SP, one enemy relic" },
];

export const MAX_NOTORIETY = NOTORIETY.length - 1;

export const CONTRACT_TYPES = {
  beacons: { name: "Beacon Hold", icon: "beacon", blurb: "Hold the beacons: more VP at the round limit wins." },
  skirmish: { name: "Skirmish", icon: "crossed-swords", blurb: "Fight over one centre beacon: out-score them by the round limit, or annihilate them." },
  assassinate: { name: "Assassination", icon: "crosshair", blurb: "Wreck the marked Commander before the round limit." },
  breakthrough: { name: "Breakthrough", icon: "arrow", blurb: "Reach the enemy corner and Extract rigs before the round limit." },
  laststand: { name: "Last Stand", icon: "shield", blurb: "Keep one rig alive to the round limit. The enemy comes for your relay; reinforcements land on rounds 3 and 5." },
  salvage: { name: "Salvage Run", icon: "crate", blurb: "Claim crates for VP and salvage; more VP at the limit wins." },
  boss: { name: "Warlord", icon: "crown", blurb: "Wreck the faction Warlord." },
};

// Contract types that can roll on a regular map node (boss is step 6 only).
export const CONTRACT_POOL = ["beacons", "skirmish", "assassinate", "breakthrough", "laststand", "salvage"];
// Step 1 sticks to the straightforward fights.
export const OPENING_POOL = ["beacons", "skirmish"];

export const RUN_STEPS = 5; // regular steps; step 6 is the boss
export const BOSS_STEP = RUN_STEPS + 1;
export const MAX_STRIKES = 2;
// Hunting a commander or crossing the whole table needs a little longer. ⚙ TUNING
export const ROUNDS = { contract: 6, assassinate: 8, breakthrough: 8, boss: 8 };
export const TABLE = { width: 42, height: 28 };
export const COMMANDER_SP = { assassinate: 1.25, boss: 1.5 };

// Renown per the Meta progression table.
export const RENOWN = { contractWon: 2, reachedBoss: 3, bossWonBase: 6 };

// Reward card weights (per card category) + rarity per category.
export const CARD_WEIGHTS = {
  "upgrade:field": 60, "upgrade:tuned": 30, "upgrade:prototype": 12,
  equipment: 30,
  "equipUpgrade:field": 60, "equipUpgrade:tuned": 30, "equipUpgrade:prototype": 12,
  perkKit: 10,
  relic: 8,
  salvage: 20,
};
export const RARITY = { field: "common", tuned: "rare", prototype: "epic", equipment: "common", perkKit: "rare", relic: "epic", salvage: "common" };
