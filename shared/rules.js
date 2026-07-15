// Static rulebook data shared by the resolution engine (server) and the
// battle UI (client). Pure data + tiny lookups — no state, no randomness.

import { hitPart } from "./unit-kinds.js";

// Action catalogue (§5). `heat` is the base heat generated; `slot` is the
// action-budget cost. Shut Down is special-cased by the engine (may be declared
// at any point; ends the activation and cools 2 heat per slot left, capped at 5,
// never below the heat floor).
export const ACTIONS = {
  move:     { label: "Move",        heat: 1, slot: 1 },
  sprint:   { label: "Sprint",      heat: 2, slot: 1 },
  fire:     { label: "Fire Weapon", heat: 1, slot: 1 },
  aimed:    { label: "Aimed Shot",  heat: 1, slot: 1 },
  // heat/slot below are NON-authoritative for reload: performAction owns the cost
  // (heat kinds pay a d6 heat roll for 0 actions; cold kinds pay 1 action).
  reload:   { label: "Reload",      heat: 1, slot: 1 },
  repair:   { label: "Repair",      heat: 1, slot: 1 },
  shutdown: { label: "Shut Down",   heat: 0, slot: 0 },
  prepare:  { label: "Prepare",     heat: 1, slot: 1 },
  disengage:{ label: "Disengage",   heat: 1, slot: 1 },
  douse:    { label: "Douse",       heat: 0, slot: 1 },
  lock:     { label: "Lock Target", heat: 1, slot: 1 },
  // Emplacement (§13, Bulwark Shield). Emplace's shield-raise is free; un-plant
  // costs +2 heat, added by the engine rather than this base `heat`.
  emplace:  { label: "Emplace",     heat: 0, slot: 1 },
  unplant:  { label: "Un-plant",    heat: 0, slot: 1 },
  // Barrage (§13, Mortar). Commits the tube to a 2-round shelled zone. The
  // per-round +1 heat is upkeep added in Recovery, not on this placing action.
  barrage:  { label: "Barrage",     heat: 0, slot: 1 },
  // Support-unit module actions (spec: Support Units). Cold — 0 heat — since only
  // Tanks/Walkers carry modules. Each spends one action slot.
  fieldweld:{ label: "Field Weld", heat: 0, slot: 1 },
  vent:     { label: "Vent",       heat: 0, slot: 1 },
  paint:    { label: "Paint",      heat: 0, slot: 1 },
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

// Weight-class STR modifier applied to every Impact Roll (§12); Aim target
// number (§2, roll >= to hit).
export const WEIGHT_STR_MOD = { light: -2, medium: 0, heavy: 2, colossal: 4 };
export const AIM = { light: 4, medium: 4, heavy: 3, colossal: 3 };

// Heat Capacity by weight class (rules §6). A Rig is safe at or below this
// value; each point beyond it adds +2 (capped +10) to the misfire roll.
// Lives here (not game-state.js) so combat.js — which imports ONLY from
// rules.js to avoid a cycle with game-state.js — can read it for
// conditional STR effects (e.g. Opportunist §13).
export const HEAT_CAPACITY = { light: 6, medium: 5, heavy: 4, colossal: 3 };

// Hit-location table (§7): defender's D12 → part-name, keyed by unit kind.
export function hitLocation(kindId, d12) {
  return hitPart(kindId, d12);
}

// The wound roll is a d10 (§7.5).
export const WOUND_DIE = 10;

// §7.5 — the wound roll. A shot's effective STR is compared to the struck
// location's Toughness: roll a d10 against `6 + T - S`.
//
// The clamp is load-bearing. It guarantees a natural 10 always wounds and a
// natural 1 never does, so no weapon/target/location matchup can be
// mathematically hopeless. That was the failure mode of the impact-total model
// this replaces: its base total capped at `6 + STR + arc`, leaving 69 combos
// that could never deal damage at any roll. Do not remove the clamp to "let
// armour really matter" — that reintroduces the bug. See
// docs/superpowers/specs/2026-07-14-hit-wound-location-design.md.
//
// Each point of STR is worth exactly 10%, so the roll is readable as a
// percentage with no lookup table.
export function woundTarget(str, toughness) {
  const s = Math.floor(Number(str) || 0);
  // T is NOT coerced, deliberately: a missing T coercing to 0 yields TN 2 (90%),
  // the single most dangerous default in the system. STR may coerce — it fails
  // toward TN 10 (10%) — but T must be real.
  //
  // The check is `typeof`, not `Number.isFinite(Number(t))`: coercing first
  // reopens the exact hole it means to close, because Number(null), Number(""),
  // Number(false) and Number([]) are all 0 — and `null` is precisely what a
  // failed lookup used to hand us. Only a real number may pass.
  if (typeof toughness !== "number" || !Number.isFinite(toughness)) {
    throw new Error(`woundTarget: toughness must be a number, got ${toughness}`);
  }
  const t = Math.floor(toughness);
  return Math.max(2, Math.min(WOUND_DIE, 6 + t - s));
}

// Toughness of a struck location — the `toughness` argument to `woundTarget`.
export { toughnessOf } from "./unit-kinds.js";

// §13 Bulwark / Raise Shield — which arcs a raised shield covers. Base: negate
// the front, blunt (−4) side/rear. Tower Shield upgrade: negation extends to the
// side arc; only the rear is blunted. Lives here so combat.js can use it without
// importing game-state.js (which would create a cycle).
export function shieldCoverage(rig) {
  const tower = rig?.weaponUpgrades?.melee === "tower-shield";
  return tower
    ? { negate: ["front", "side"], blunt: ["rear"] }
    : { negate: ["front"], blunt: ["side", "rear"] };
}

// Equipment upgrades — mirrors WEAPON_UPGRADES. Each family offers one upgrade
// of each nature (Field / Tuned / Prototype), picked at commission. The 8 Field
// rows carry live effect tags (simple modifiers to existing hooks). The Tuned
// and Prototype rows ship inert (`effect: {}`, TODO(mechanics)) and are wired in
// follow-on plans, exactly as the weapon Prototypes did.
export const EQUIPMENT_UPGRADES = {
  "ablative-plating": [
    { id: "reinforced-plating", nature: "field", name: "Reinforced Plating", tag: "Harden gives −2 impact, not −1", effect: { hardenImpact: 2 } },
    { id: "reactive-armor", nature: "tuned", name: "Reactive Armor", tag: "First hit each round hardens that location", effect: { reactiveArmor: true } },
    { id: "ablative-cascade", nature: "prototype", name: "Ablative Cascade", tag: "Spend ablative charges to soften incoming hits — each costs heat", catch: "Each charge costs heat", effect: { ablativeCascade: true } },
  ],
  "radiator-array": [
    { id: "twin-radiators", nature: "field", name: "Twin Radiators", tag: "Purge vents −3, not −2", effect: { purgeHeat: -3 } },
    { id: "coolant-injection", nature: "tuned", name: "Coolant Injection", tag: "−2 heat before the overheat roll when over Capacity", effect: { coolantInjection: true } },
    { id: "cryo-reservoir", nature: "prototype", name: "Cryo Reservoir", tag: "Bank cold; spend for instant cooling + a STR spike", catch: "Must charge it up first", effect: { cryoReservoir: true } },
  ],
  "servo-actuators": [
    { id: "reinforced-servos", nature: "field", name: "Reinforced Servos", tag: "Sprint reaches 2× Speed, not 1½×", effect: { sprintMult: 2 } },
    { id: "kickstart-pistons", nature: "tuned", name: "Kickstart Pistons", tag: "Charge into contact → first melee after +2 STR", effect: { kickstartPistons: true } },
    { id: "grapnel-launcher", nature: "prototype", name: "Grapnel Launcher", tag: "Yank free of a lock or reel an enemy in — heat + cooldown", catch: "Heat and a cooldown", effect: { grapnelLauncher: true } },
  ],
  "overclock-core": [
    { id: "redundant-capacitors", nature: "field", name: "Redundant Capacitors", tag: "Overclock costs +2 heat, not +3", effect: { overclockHeat: 2 } },
    { id: "adrenaline-surge", nature: "tuned", name: "Adrenaline Surge", tag: "Below half SP, Overclock grants +3 actions", effect: { adrenalineSurge: true } },
    { id: "reactor-overdrive", nature: "prototype", name: "Reactor Overdrive", tag: "Overclock also +2 STR — but overheat bonus doubles", catch: "Overheat bonus doubles", effect: { reactorOverdrive: true } },
  ],
  "field-repair-suite": [
    { id: "master-toolkit", nature: "field", name: "Master Toolkit", tag: "Repair heals +2 SP, not +1", effect: { repairBonus: 2 } },
    { id: "battlefield-triage", nature: "tuned", name: "Battlefield Triage", tag: "Emergency Patch heals 5 SP on a destroyed location", effect: { battlefieldTriage: true } },
    { id: "nanite-swarm", nature: "prototype", name: "Nanite Swarm", tag: "Seed nanites that heal each Recovery — at a heat-cap cost", catch: "Costs heat-cap", effect: { naniteSwarm: true } },
  ],
  "blast-furnace-core": [
    { id: "insulated-core", nature: "field", name: "Insulated Core", tag: "Safe up to +2 over Capacity, not +1", effect: { thermalMargin: 2 } },
    { id: "backdraft", nature: "tuned", name: "Backdraft", tag: "Heat Purge Wave +1 STR per 2 heat over Capacity", effect: { backdraft: true } },
    { id: "meltdown-protocol", nature: "prototype", name: "Meltdown Protocol", tag: "Bank overheat as charge; spend for STR or a burst", catch: "Only banks while overheated", effect: { meltdownProtocol: true } },
  ],
  "targeting-computer": [
    { id: "ballistic-processor", nature: "field", name: "Ballistic Processor", tag: "+1 accuracy vs a target in your sweet-spot band", effect: { sweetBandAcc: 1 } },
    { id: "predictive-tracking", nature: "tuned", name: "Predictive Tracking", tag: "vs a static/pinned target: +2 accuracy, ignore cover", effect: { predictiveTracking: true } },
    { id: "fire-solution-lock", nature: "prototype", name: "Fire Solution Lock", tag: "Hold still and stack a solution → an auto-hit AP volley", catch: "Must hold still to charge it", effect: { fireSolutionLock: true } },
  ],
  "reactive-plating": [
    { id: "angled-plates", nature: "field", name: "Angled Plates", tag: "Side/rear attacks −2 STR, not −1", effect: { sideRearStr: -2 } },
    { id: "chaff-burst", nature: "tuned", name: "Chaff Burst", tag: "Under smoke, free half-Speed side-step when targeted", effect: { chaffBurst: true } },
    { id: "point-defense-system", nature: "prototype", name: "Point-Defense System", tag: "Intercept incoming fire; force rerolls — at a heat cost", catch: "Costs heat", effect: { pointDefense: true } },
  ],
};

// Single source for every equipment-upgrade effect tag. Both game-state.js and
// combat.js import this; combat.js may not import game-state.js (cycle), so the
// catalog lives here in the shared leaf.
export function equipmentUpgradeEffectOf(equipmentId, upgradeId) {
  if (!equipmentId || !upgradeId) return {};
  const row = (EQUIPMENT_UPGRADES[equipmentId] || []).find((u) => u.id === upgradeId);
  return row?.effect || {};
}
