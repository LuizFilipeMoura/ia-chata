import { test } from "node:test";
import assert from "node:assert/strict";
import { computeModifiedAim, rollToHit, computeStr, arcBonus, rollImpacts, resolveAttack, resolveRam } from "./combat.js";
import { WEAPONS, makeRig, effectiveWeaponProfile } from "./game-state.js";

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
  const sniper = WEAPONS.longRange["Sniper Cannon"]; // Precision
  assert.equal(computeModifiedAim(attacker, sniper, { range: "near", cover: 0, aimed: true }), 4); // waived
  const autocannon = WEAPONS.longRange["Autocannon"]; // no Precision
  assert.equal(computeModifiedAim(attacker, autocannon, { range: "near", cover: 0, aimed: true }), 6); // 4 + 2
  assert.equal(computeModifiedAim({ weightClass: "medium", hull: { sp: 0 } }, claw, { range: "near", cover: 0 }), 4);
});

test("rollToHit counts hits (>= modAim or natural 6) and fire-mode heat", () => {
  const dbl = WEAPONS.longRange["Double MG"]; // rof 8, Full Auto, acc [1,0]
  const dice = [1, 2, 3, 4, 5, 6, 1, 1, 6, 2]; // 8 base + 2 full auto = 10 dice; modAim near = 4 - 1 = 3
  const res = rollToHit(attacker, dbl, { range: "near", cover: 0, fullAuto: true }, dice, () => 0);
  assert.equal(res.rof, 10);
  assert.equal(res.hits, 5);          // dice >=3 or ==6: 3,4,5,6,6
  assert.equal(res.fireModeHeat, 3);  // three 1s under Full Auto
});

test("computeStr applies weight and Charged Shot", () => {
  assert.equal(computeStr({ weightClass: "light" }, WEAPONS.longRange["Sniper Cannon"], {}), 10); // 12-2
  assert.equal(computeStr({ weightClass: "medium" }, WEAPONS.longRange["Arc Gun"], { charged: true }), 12); // 10+0+2
});

test("arcBonus: ranged +0/+2/+4, melee none, Raking Fire overrides", () => {
  const auto = WEAPONS.longRange["Autocannon"];
  assert.equal(arcBonus(auto, "front"), 0);
  assert.equal(arcBonus(auto, "side"), 2);
  assert.equal(arcBonus(auto, "rear"), 4);
  assert.equal(arcBonus(WEAPONS.melee["Sword"], "rear"), 0); // melee
  const mini = WEAPONS.longRange["Mini Gun"]; // Raking Fire
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
  const mini = WEAPONS.longRange["Mini Gun"];
  const out = rollImpacts({ weightClass: "medium" }, { weightClass: "light" }, mini, "hull",
    { arc: "front", hits: 3 }, { impacts: [6, 6, 6] }, () => 0);
  assert.equal(out.every((h) => h.sp === 0), true);
});

test("effectiveWeaponProfile applies selected ROF, STR, perk, range, and far-penalty upgrades", () => {
  const mini = makeRig(1, "Belt", "medium", "a", { longRange: "Mini Gun", melee: "Sword", longRangeUpgrade: "extended-belt" });
  assert.equal(effectiveWeaponProfile("longRange", "Mini Gun", mini).rof, 10);

  const auto = makeRig(2, "Core", "medium", "a", { longRange: "Autocannon", melee: "Sword", longRangeUpgrade: "depleted-core" });
  assert.equal(computeStr(auto, effectiveWeaponProfile("longRange", "Autocannon", auto), {}), 10);

  const sword = makeRig(3, "Edge", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "keen-edge" });
  assert.equal(effectiveWeaponProfile("melee", "Sword", sword).perks.includes("Rend"), true);

  const lance = makeRig(4, "Reach", "medium", "a", { longRange: "Mini Gun", melee: "Lance", meleeUpgrade: "couched-reach" });
  assert.deepEqual(effectiveWeaponProfile("melee", "Lance", lance).rng, [2.5, 2.5]);

  const sniper = makeRig(5, "Barrel", "medium", "a", { longRange: "Sniper Cannon", melee: "Sword", longRangeUpgrade: "match-barrel" });
  assert.deepEqual(effectiveWeaponProfile("longRange", "Sniper Cannon", sniper).acc, [0, 0]);
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
});

test("resolveRam adds a tone to its D6 roll reflecting whether it dealt damage", () => {
  const attacker = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  const target = makeRig(2, "Foe", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const ctx = makeCtx();

  // Ram STR (medium) = 9. A high impact die should deal damage (sp > 0, tone "ok");
  // location doesn't matter for the assertion, force both to something valid.
  resolveRam(room, attacker, target, {
    dice: {
      self: { location: 1, impact: 6 },   // 6 + 9 = 15 -> medium hull severe (>=14) -> sp>0
      target: { location: 1, impact: 1 }, // 1 + 9 = 10 -> medium hull (<11 direct) -> sp=0
    },
  }, () => 0, ctx);

  const ramResults = ctx.resolutions.filter((r) => r.kind === "ram");
  assert.equal(ramResults.length, 2);
  const [selfRes, targetRes] = ramResults;
  assert.equal(selfRes.rolls[0].tone, "ok");
  assert.equal(targetRes.rolls[0].tone, "miss");
});
