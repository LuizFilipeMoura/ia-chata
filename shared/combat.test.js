import { test } from "node:test";
import assert from "node:assert/strict";
import { computeModifiedAim, weaponAccAt, rollToHit, computeStr, arcBonus, rollImpacts, resolveAttack } from "./combat.js";
import { WEAPONS, makeRig, makeUnit, UNIT_WEAPONS, effectiveWeaponProfile } from "./game-state.js";

// Minimal ctx double for resolveAttack/resolveRam — mirrors the shape
// game-state.js's combatCtx() injects (§"Mutation primitives" in combat.js),
// but only records calls instead of mutating real Rig state.
function makeCtx() {
  const resolutions = [];
  return {
    resolutions,
    pushResolution(room, entry) { resolutions.push(entry); },
    applyDamage() {},
    bumpHeat() {},
    sunderLocation() {},
    profileFor: (slot, name, attacker) => effectiveWeaponProfile(slot, name, attacker),
  };
}

const attacker = { weightClass: "medium", hull: { sp: 7 } };

test("computeModifiedAim applies weapon ACC, cover, aim and hull penalties", () => {
  const claw = WEAPONS.melee["Claw"]; // acc [1,1]
  assert.equal(computeModifiedAim(attacker, claw, { range: "near", cover: 0 }), 3); // 4 - 1
  assert.equal(computeModifiedAim(attacker, claw, { range: "near", cover: 2 }), 5); // 4 - 1 + 2
  // Perks now ride on the upgrade, so exercise Precision by injecting it (base is stat-only).
  const sniper = { ...WEAPONS.longRange["Sniper Cannon"], perks: ["Precision"] };
  assert.equal(computeModifiedAim(attacker, sniper, { distance: 22, cover: 0, aimed: true }), 2); // peak waived-penalty
  const autocannon = WEAPONS.longRange["Autocannon"]; // no Precision
  assert.equal(computeModifiedAim(attacker, autocannon, { distance: 12, cover: 0, aimed: true }), 5); // 4 - (1 - 2)
  assert.equal(computeModifiedAim({ weightClass: "medium", hull: { sp: 0 } }, claw, { range: "near", cover: 0 }), 4);
});

test("weaponAccAt peaks at the sweet spot and falls off with distance", () => {
  const mg = WEAPONS.longRange["Mini Gun"]; // sweet 7, peak 2, dropoff 0.35
  assert.equal(weaponAccAt(mg, 7), 2);                 // at sweet spot
  assert.equal(weaponAccAt(mg, 2), 0);                 // |2-7|*0.35 = 1.75 -> 2 penalty
  assert.equal(weaponAccAt(mg, 18), -2);               // |18-7|*0.35 = 3.85 -> 4 penalty
  assert.equal(weaponAccAt(mg, undefined), 2);         // no distance -> peak (legacy fallback)
  const claw = WEAPONS.melee["Claw"];                  // melee: scalar acc, distance-independent
  assert.equal(weaponAccAt(claw, 99), 1);
});

test("computeModifiedAim uses distance-based accuracy for ranged weapons", () => {
  const mg = WEAPONS.longRange["Mini Gun"];
  assert.equal(computeModifiedAim(attacker, mg, { distance: 7, cover: 0 }), 2);  // 4 - 2
  assert.equal(computeModifiedAim(attacker, mg, { distance: 2, cover: 0 }), 4);  // 4 - 0
  assert.equal(computeModifiedAim(attacker, mg, { distance: 18, cover: 0 }), 6); // 4 - (-2)
});

test("rollToHit counts hits (>= modAim or natural 6) and fire-mode heat", () => {
  const dbl = { ...WEAPONS.longRange["Double MG"], perks: ["Full Auto"] }; // rof 8, acc [1,0]
  const dice = [1, 2, 3, 4, 5, 6, 1, 1, 6, 2]; // 8 base + 2 full auto = 10 dice; modAim near = 4 - 1 = 3
  const res = rollToHit(attacker, dbl, { range: "near", cover: 0, fullAuto: true }, dice, () => 0);
  assert.equal(res.rof, 10);
  assert.equal(res.hits, 5);          // dice >=3 or ==6: 3,4,5,6,6
  assert.equal(res.fireModeHeat, 3);  // three 1s under Full Auto
});

test("computeStr applies weight and Charged Shot", () => {
  assert.equal(computeStr({ weightClass: "light" }, WEAPONS.longRange["Sniper Cannon"], {}), 10); // 12-2
  const arcGun = { ...WEAPONS.longRange["Arc Gun"], perks: ["Charged Shot"] };
  assert.equal(computeStr({ weightClass: "medium" }, arcGun, { charged: true }), 12); // 10+0+2
});

test("arcBonus: ranged +0/+2/+4, melee none, Raking Fire overrides", () => {
  const auto = WEAPONS.longRange["Autocannon"];
  assert.equal(arcBonus(auto, "front"), 0);
  assert.equal(arcBonus(auto, "side"), 2);
  assert.equal(arcBonus(auto, "rear"), 4);
  assert.equal(arcBonus(WEAPONS.melee["Sword"], "rear"), 0); // melee (structural flag)
  const mini = { ...WEAPONS.longRange["Mini Gun"], perks: ["Raking Fire"] };
  assert.equal(arcBonus(mini, "front"), null); // front auto-fails
  assert.equal(arcBonus(mini, "side"), 4);
  assert.equal(arcBonus(mini, "rear"), 8);
});

test("rollImpacts computes per-hit severity and honours Brace on the front arc", () => {
  const target = { weightClass: "medium", preparation: { type: "brace" } };
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  // 2 hits, both d6=5 -> 5 + 8 + 0(front) - 2(brace) = 11 vs medium hull (11/14/17) -> direct(1).
  const out = rollImpacts({ weightClass: "medium" }, target, auto, "hull",
    { arc: "front", hits: 2 }, { impacts: [5, 5] }, () => 0);
  assert.equal(out.length, 2);
  assert.equal(out[0].total, 11);
  assert.equal(out[0].sp, 1);
});

test("rollImpacts applies Harden's -1 alongside Brace, stacking", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const hardened = { weightClass: "medium", hardened: true, preparation: null };
  // 1 hit, d6=5 -> 5 + 8 + 0(front) - 1(harden) = 12 vs medium hull (11/14/17) -> direct(1), not the 11 it'd be unhardened.
  const out = rollImpacts({ weightClass: "medium" }, hardened, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(out[0].total, 12);

  const both = { weightClass: "medium", hardened: true, preparation: { type: "brace" } };
  const out2 = rollImpacts({ weightClass: "medium" }, both, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(out2[0].total, 10); // 5 + 8 - 2(brace) - 1(harden)
});

test("Raking Fire against the front arc deals no damage", () => {
  const mini = { ...WEAPONS.longRange["Mini Gun"], perks: ["Raking Fire"] };
  const out = rollImpacts({ weightClass: "medium" }, { weightClass: "light" }, mini, "hull",
    { arc: "front", hits: 3 }, { impacts: [6, 6, 6] }, () => 0);
  assert.equal(out.every((h) => h.sp === 0), true);
});

test("Raise Shield negates the front arc and blunts side/rear by 4", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const base = {
    weightClass: "medium",
    weapons: { melee: "Bulwark Shield" },
    weaponUpgrades: { melee: "boss-spike" }, // base coverage (no Tower Shield)
    preparation: { type: "raise-shield" },
  };

  // Front: fully negated regardless of the roll.
  const front = rollImpacts({ weightClass: "medium" }, base, auto, "hull",
    { arc: "front", hits: 2 }, { impacts: [6, 6] }, () => 0);
  assert.equal(front.every((h) => h.sp === 0), true);

  // Side: 5 + 8 + 2(side) - 4(shield) = 11 vs medium hull (11/14/17) -> direct(1).
  const side = rollImpacts({ weightClass: "medium" }, base, auto, "hull",
    { arc: "side", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(side[0].total, 11);
  assert.equal(side[0].sp, 1);
});

test("Tower Shield extends Raise Shield negation to the side arc", () => {
  const auto = WEAPONS.longRange["Autocannon"];
  const tower = {
    weightClass: "medium",
    weapons: { melee: "Bulwark Shield" },
    weaponUpgrades: { melee: "tower-shield" },
    preparation: { type: "raise-shield" },
  };
  // Side negated; rear only blunted: 5 + 8 + 4(rear) - 4 = 13 -> direct on medium hull.
  const side = rollImpacts({ weightClass: "medium" }, tower, auto, "hull",
    { arc: "side", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(side[0].sp, 0);
  const rear = rollImpacts({ weightClass: "medium" }, tower, auto, "hull",
    { arc: "rear", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(rear[0].total, 13);
});

test("Siege Maul with Breaching Round locks the target Hull on a Hull hit", () => {
  const attacker = makeRig(1, "Breaker", "medium", "a", { longRange: "Siege Maul", melee: "Sword", lrUpgrade: "breaching-round" });
  const target = makeRig(2, "Fort", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  const room = { rigs: [attacker, target] };
  let hullBreached = null;
  const ctx = {
    applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); },
    bumpHeat: () => {},
    pushResolution: () => {},
    sunderLocation: () => {},
    breachHull: (t) => { hullBreached = t; t.hullRepairLock = 2; },
    profileFor: (slot, name, rig) => effectiveWeaponProfile(slot, name, rig),
  };
  // Force: to-hit die 6 (hits), location die 1 (hull), impact die 6.
  const res = resolveAttack(room, attacker, target,
    { weapon: "longRange", arc: "front", range: "near",
      dice: { toHit: [6], location: 1, impacts: [6], ap: [1] } }, () => 0, ctx);
  assert.equal(res.location, "hull");
  assert.equal(hullBreached, target);
  assert.equal(target.hullRepairLock, 2);
});

test("effectiveWeaponProfile applies selected ROF, STR, perk, range, and far-penalty upgrades", () => {
  const mini = makeRig(1, "Belt", "medium", "a", { longRange: "Mini Gun", melee: "Sword", longRangeUpgrade: "extended-belt" });
  assert.equal(effectiveWeaponProfile("longRange", "Mini Gun", mini).rof, 10);

  const auto = makeRig(2, "Core", "medium", "a", { longRange: "Autocannon", melee: "Sword", longRangeUpgrade: "depleted-core" });
  assert.equal(computeStr(auto, effectiveWeaponProfile("longRange", "Autocannon", auto), {}), 10);

  const sword = makeRig(3, "Edge", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "keen-edge" });
  assert.equal(effectiveWeaponProfile("melee", "Sword", sword).perks.includes("Rend"), true);

  const lance = makeRig(4, "Reach", "medium", "a", { longRange: "Mini Gun", melee: "Lance", meleeUpgrade: "couched-reach" });
  assert.deepEqual(effectiveWeaponProfile("melee", "Lance", lance).rng, [3, 3]); // 2" base + 1" Couched Reach

  const sniper = makeRig(5, "Barrel", "medium", "a", { longRange: "Sniper Cannon", melee: "Sword", longRangeUpgrade: "match-barrel" });
  assert.equal(effectiveWeaponProfile("longRange", "Sniper Cannon", sniper).dropoff, 0.075); // Match Barrel halves dropoff
});

test("rollToHit uses selected upgrade heat-on-ones and one missed-die reroll", () => {
  const beltRig = makeRig(1, "Belt", "medium", "a", { longRange: "Mini Gun", melee: "Sword", longRangeUpgrade: "extended-belt" });
  const belt = effectiveWeaponProfile("longRange", "Mini Gun", beltRig);
  const beltRoll = rollToHit(beltRig, belt, { range: "near", cover: 0 }, [1, 1, 2, 2, 3, 3, 4, 4, 5, 6], () => 0);
  assert.equal(beltRoll.rof, 10);
  assert.equal(beltRoll.fireModeHeat, 2);

  const gyroRig = makeRig(2, "Gyro", "medium", "a", { longRange: "Double MG", melee: "Sword", longRangeUpgrade: "gyro-mount" });
  const gyro = effectiveWeaponProfile("longRange", "Double MG", gyroRig);
  const gyroRoll = rollToHit(gyroRig, gyro, { range: "near", cover: 0 }, [1, 1, 1, 1, 1, 1, 1, 1], () => 1);
  assert.equal(gyroRoll.hits, 1);
});

test("computeModifiedAim ignores cover when Airburst Fuze is selected", () => {
  const mortarRig = makeRig(1, "Airburst", "medium", "a", { longRange: "Mortar", melee: "Sword", longRangeUpgrade: "airburst-fuze" });
  const mortar = effectiveWeaponProfile("longRange", "Mortar", mortarRig);
  assert.equal(computeModifiedAim(mortarRig, mortar, { range: "near", cover: 2 }), 5);
});

test("resolveAttack emits a per-die roll for each hit-die plus a location d12, each with a tone", () => {
  // Autocannon: rof 4, acc [0,-1], no Full Auto requested here. Medium attacker,
  // full hull, near range, front arc, cover 0, fire (not aimed) -> modAim =
  // AIM.medium(4) - (acc[0]=0 - cover=0 + aimedPenalty=0 + hullPenalty=0) = 4.
  const attacker = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  const target = makeRig(2, "Foe", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const ctx = makeCtx();

  // modAim is 4: die 6 -> crit; die 4 or 5 -> ok; die < 4 -> miss.
  const toHit = [6, 4, 2, 5]; // crit, ok, miss, ok (3 hits out of 4 dice)
  const result = resolveAttack(room, attacker, target, {
    weapon: "longRange", target: target.name, arc: "front", range: "near", cover: 0,
    dice: { toHit, location: 3 }, // location d12 = 3 -> hitLocation(3) = "hull"
  }, () => 0, ctx);

  assert.equal(result.ok, true);
  assert.equal(result.hits, 3);

  const attackRes = ctx.resolutions.find((r) => r.kind === "attack");
  assert.ok(attackRes, "expected a pushed attack resolution");

  const d6Rolls = attackRes.rolls.filter((r) => r.sides === 6);
  const d12Rolls = attackRes.rolls.filter((r) => r.sides === 12);

  // rof entries for the d6 hit dice, plus exactly one d12 location die.
  assert.equal(d6Rolls.length, 4);
  assert.equal(d12Rolls.length, 1);
  assert.equal(d12Rolls[0].value, 3);
  assert.equal(d12Rolls[0].tone, "cool");

  // The face-6 die is a crit; every d6 tone is one of crit/ok/miss.
  const critDie = d6Rolls.find((r) => r.value === 6);
  assert.equal(critDie.tone, "crit");
  assert.ok(d6Rolls.every((r) => ["crit", "ok", "miss"].includes(r.tone)));

  // Damage/summary/heat are untouched by this change: summary still reports
  // hits and location, and hits/location math is unaffected.
  assert.equal(result.location, "hull");
  assert.match(attackRes.summary, /3 hit\(s\)/);
  assert.match(attackRes.summary, /to hull/);

  // Structured breakdown mirrors the summary: hits + weapon STR -> SP to location.
  const b = attackRes.breakdown;
  assert.ok(b, "expected a breakdown on the attack resolution");
  assert.equal(b.weapon, "Autocannon");
  assert.equal(b.location, "hull");
  assert.equal(b.terms[0].value, 3);
  assert.equal(b.terms[0].label, "hits");
  assert.equal(b.terms[1].label, "weapon STR");
  assert.equal(b.terms[1].value, computeStr(attacker, WEAPONS.longRange.Autocannon, {}));
});

test("computeStr skips weight-class modifier for flat-pick weapons", () => {
  const attackerWithClass = { kind: "tank", weightClass: "heavy" };
  const profile = { str: 12, perks: [], flatPick: true };
  assert.equal(computeStr(attackerWithClass, profile, { charged: false }), 12);
});

test("computeStr still applies weight-class modifier for rig-catalog weapons", () => {
  const attacker = { kind: "rig", weightClass: "heavy" };
  const profile = { str: 8, perks: [] };
  assert.equal(computeStr(attacker, profile, { charged: false }), 8 + 2);
});

test("resolveAttack reads weapons.unit when the attacker is a Tank", () => {
  const room = { rigs: [], history: [], game: { nextResolutionId: 1, resolutions: [] } };
  const attacker = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  const target = makeUnit("tank", 2, "Enemy", "b", { unit: "Coaxial MG" });
  room.rigs = [attacker, target];
  const ctx = {
    applyDamage: () => {}, bumpHeat: () => {}, pushResolution: () => {},
    profileFor: (slot, name) => ({ ...UNIT_WEAPONS[name], upgradeEffect: {}, flatPick: true }),
  };
  const res = resolveAttack(room, attacker, target, {
    weapon: "unit", target: "Enemy", arc: "front", range: "near", cover: 0, aimed: false,
    dice: { toHit: [5], location: 3 },
  }, () => 0, ctx);
  assert.equal(res.ok, true);
});

test("Cluster Shells cycles the target's own part list (Tank uses tracks/turret, not arms/legs)", () => {
  const room = { rigs: [], history: [], game: { nextResolutionId: 1, resolutions: [] } };
  const attacker = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  const target = makeUnit("tank", 2, "Enemy", "b", { unit: "Coaxial MG" });
  room.rigs = [attacker, target];
  const hits = [];
  const ctx = {
    applyDamage: (_r, _t, loc) => hits.push(loc),
    bumpHeat: () => {}, pushResolution: () => {},
    // Inject the cluster-shells upgrade AND keep flatPick so combat.js takes cold-kind paths.
    profileFor: (_s, name) => ({ ...UNIT_WEAPONS[name], upgradeEffect: { onHit: "cluster-shells" }, flatPick: true }),
  };
  // Aim at "turret" and force the cluster D12 to 9 → hitLocation("tank", 9) === "turret" — matches primary, must cycle.
  // Force to-hit dice to 6 so the shot always hits regardless of modAim.
  resolveAttack(room, attacker, target, {
    weapon: "unit", target: "Enemy", arc: "front", range: "near", cover: 0, aimed: true, aimedLoc: "turret",
    dice: { toHit: [6], clusterLocation: 9, impacts: [6] },
  }, () => 0, ctx);
  // Cluster-shells runs AFTER the primary aimed hit. The cluster loc must be a Tank part, never a Rig-only name.
  const clusterLoc = hits.find((loc) => loc !== "turret") ?? hits[hits.length - 1];
  const tankParts = ["hull", "tracks", "turret", "engine"];
  assert.ok(tankParts.includes(clusterLoc), `cluster fell on ${clusterLoc} — not a Tank part`);
  assert.ok(clusterLoc !== "arms" && clusterLoc !== "legs", `cluster leaked a Rig-only part name: ${clusterLoc}`);
});
