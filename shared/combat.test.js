import { test } from "node:test";
import assert from "node:assert/strict";
import { computeModifiedAim, weaponAccAt, rollToHit, computeStr, arcBonus, rollImpacts, resolveAttack, applyDefensiveReactions } from "./combat.js";
import { WEAPONS, makeRig, makeUnit, UNIT_WEAPONS, effectiveWeaponProfile, HEAT_CAPACITY } from "./game-state.js";

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

test("computeModifiedAim waives the aim penalty when waiveAimPenalty is set", () => {
  const autocannon = WEAPONS.longRange["Autocannon"]; // no Precision
  // Baseline: aimed shot eats the -2 → target number 5.
  assert.equal(computeModifiedAim(attacker, autocannon, { distance: 12, aimed: true }), 5);
  // Waived: no -2 → 4 - 1 = 3.
  assert.equal(computeModifiedAim(attacker, autocannon, { distance: 12, aimed: true, waiveAimPenalty: true }), 3);
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

test("Pop Smoke worsens an attacker's modified Aim by 2", () => {
  const mg = WEAPONS.longRange["Mini Gun"];
  const clear = computeModifiedAim(attacker, mg, { distance: 12, cover: 0, targetSmoke: false });
  const smoked = computeModifiedAim(attacker, mg, { distance: 12, cover: 0, targetSmoke: true });
  assert.equal(smoked - clear, 2);
});

test("Predictive Tracking: +2 ACC and ignores cover vs a pinned target", () => {
  const attacker = { weightClass: "medium", hull: { sp: 7 }, equipment: "targeting-computer", equipmentUpgrade: "predictive-tracking" };
  const mg = WEAPONS.longRange["Mini Gun"];
  // distance:12 is chosen (not the plan's distance:7) because Mini Gun's own
  // `sweet` is 7 — at that distance Ballistic Processor's unrelated sweetBandAcc
  // bonus would also fire and confound the "wrong upgrade" check below. 12 is
  // outside Mini Gun's sweet band (|12-7| > 2), isolating Predictive Tracking.
  const openField = computeModifiedAim(attacker, mg, { distance: 12, cover: 2, targetPinned: false });
  const pinned    = computeModifiedAim(attacker, mg, { distance: 12, cover: 2, targetPinned: true });
  // +2 ACC lowers the aim number by 2, and the 2 points of cover are ignored
  // (−2 more) → the pinned aim number is 4 lower.
  assert.equal(openField - pinned, 4);
  // The wrong Fire-Control upgrade (Field) never triggers, even vs a pinned target.
  const ballistic = { ...attacker, equipmentUpgrade: "ballistic-processor" };
  assert.equal(
    computeModifiedAim(ballistic, mg, { distance: 12, cover: 2, targetPinned: true }),
    openField,
  );
});

test("rollToHit counts hits (>= modAim or natural 6) and fire-mode heat", () => {
  const dbl = { ...WEAPONS.longRange["Double MG"], perks: ["Full Auto"] }; // rof 8, acc [1,0]
  const dice = [1, 2, 3, 4, 5, 6, 1, 1, 6, 2]; // 8 base + 2 full auto = 10 dice; modAim near = 4 - 1 = 3
  const res = rollToHit(attacker, dbl, { range: "near", cover: 0, fullAuto: true }, dice, () => 0);
  assert.equal(res.rof, 10);
  assert.equal(res.hits, 5);          // dice >=3 or ==6: 3,4,5,6,6
  assert.equal(res.fireModeHeat, 3);  // three 1s under Full Auto
});

test("applyDefensiveReactions is an identity pass-through for an impact hit (no reactive gear)", () => {
  const target = { weightClass: "medium" }; // no equipment, no equipState
  const hit = { die: 5, total: 12, tier: "direct", sp: 1, kind: "impact" };
  const out = applyDefensiveReactions(target, hit, { location: "hull", row: 3, spendHeat: () => {} });
  assert.deepEqual(out, hit); // unchanged
});

test("applyDefensiveReactions is an identity pass-through for a to-hit tally (no reactive gear)", () => {
  const target = { weightClass: "medium" };
  const hit = { kind: "tohit", ranged: true, hits: 4 };
  const out = applyDefensiveReactions(target, hit, { location: null, row: null, spendHeat: () => {} });
  assert.equal(out.hits, 4); // hit count untouched by the pass-through seam
});

test("rollImpacts is byte-unchanged by the impact seam for a plain target", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const plain = { weightClass: "medium", hardened: false, preparation: null };
  const out = rollImpacts({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(out[0].total, 13); // 5 + 8(STR) + 0(front) — no dock, seam is a no-op
  assert.equal(out[0].kind, "impact"); // seam stamps the discriminator
});

test("rollToHit hit count is unchanged by the to-hit seam for a plain target", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // rof 2, medium
  const plain = { weightClass: "medium" };
  const res = rollToHit({ weightClass: "medium", hull: { sp: 7 } }, auto,
    { range: "near", cover: 0, target: plain }, [6, 6], () => 0);
  assert.equal(res.hits, 2); // both dice hit; the pass-through seam leaves the tally alone
});

test("computeStr applies weight and Charged Shot", () => {
  assert.equal(computeStr({ weightClass: "light" }, WEAPONS.longRange["Sniper Cannon"], {}), 10); // 12-2
  const arcGun = { ...WEAPONS.longRange["Arc Gun"], perks: ["Charged Shot"] };
  assert.equal(computeStr({ weightClass: "medium" }, arcGun, { charged: true }), 12); // 10+0+2
});

test("Kickstart Pistons: first melee after charging into contact hits +2 STR", () => {
  const claw = WEAPONS.melee["Claw"];
  const charged = { weightClass: "medium", equipment: "servo-actuators", equipmentUpgrade: "kickstart-pistons", chargedIntoContact: true,  kickstartUsed: false };
  const idle    = { weightClass: "medium", equipment: "servo-actuators", equipmentUpgrade: "kickstart-pistons", chargedIntoContact: false, kickstartUsed: false };
  const spent   = { weightClass: "medium", equipment: "servo-actuators", equipmentUpgrade: "kickstart-pistons", chargedIntoContact: true,  kickstartUsed: true  };
  assert.equal(computeStr(charged, claw, {}) - computeStr(idle, claw, {}), 2); // charged → +2
  assert.equal(computeStr(spent, claw, {}), computeStr(idle, claw, {}));       // charge already spent → no bonus
  // The wrong Mobility upgrade (Field) never triggers, even when charged.
  const wrong = { ...charged, equipmentUpgrade: "reinforced-servos" };
  assert.equal(computeStr(wrong, claw, {}), computeStr(idle, claw, {}));
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

test("Reinforced Plating deepens Harden to −2 impact", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const hardened = { weightClass: "medium", hardened: true, preparation: null };
  const reinforced = { weightClass: "medium", hardened: true, preparation: null, equipment: "ablative-plating", equipmentUpgrade: "reinforced-plating" };
  // 1 hit, d6=5 -> plain: 5 + 8 + 0(front) - 1(harden) = 12; reinforced: 5 + 8 + 0 - 2(harden) = 11
  const out = rollImpacts({ weightClass: "medium" }, hardened, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  const out2 = rollImpacts({ weightClass: "medium" }, reinforced, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(out[0].total, 12);
  assert.equal(out2[0].total, 11);
  assert.equal(out[0].total - out2[0].total, 1); // −2 vs −1 = 1 lower
});

test("Reactive Plating docks side/rear attacker STR; Angled Plates doubles it", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const plain = { weightClass: "medium", hardened: false, preparation: null, equipmentUpgrade: null, equipment: null };
  const reactive = { weightClass: "medium", hardened: false, preparation: null, equipmentUpgrade: null, equipment: "reactive-plating" };
  const angled = { weightClass: "medium", hardened: false, preparation: null, equipmentUpgrade: "angled-plates", equipment: "reactive-plating" };
  // 1 hit, d6=5, side arc -> 5 + 8 + 2(side bonus) = 15 for plain; reactive docks -1; angled docks -2.
  const outPlain = rollImpacts({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "side", hits: 1 }, { impacts: [5] }, () => 0);
  const outReactive = rollImpacts({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "side", hits: 1 }, { impacts: [5] }, () => 0);
  const outAngled = rollImpacts({ weightClass: "medium" }, angled, auto, "hull",
    { arc: "side", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(outPlain[0].total - outReactive[0].total, 1);
  assert.equal(outPlain[0].total - outAngled[0].total, 2);

  // Rear arc docks identically to side.
  const rearPlain = rollImpacts({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "rear", hits: 1 }, { impacts: [5] }, () => 0);
  const rearReactive = rollImpacts({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "rear", hits: 1 }, { impacts: [5] }, () => 0);
  const rearAngled = rollImpacts({ weightClass: "medium" }, angled, auto, "hull",
    { arc: "rear", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(rearPlain[0].total - rearReactive[0].total, 1);
  assert.equal(rearPlain[0].total - rearAngled[0].total, 2);

  // Front arc is unaffected: a reactive-plating target takes no dock.
  const frontPlain = rollImpacts({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  const frontReactive = rollImpacts({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(frontReactive[0].total, frontPlain[0].total);
});

test("Raking Fire against the front arc deals no damage", () => {
  const mini = { ...WEAPONS.longRange["Mini Gun"], perks: ["Raking Fire"] };
  const out = rollImpacts({ weightClass: "medium" }, { weightClass: "light" }, mini, "hull",
    { arc: "front", hits: 3 }, { impacts: [6, 6, 6] }, () => 0);
  assert.equal(out.every((h) => h.sp === 0), true);
});

test("machine guns grind, not burst — a raking crit is capped at Severe (2 SP)", () => {
  const target = { weightClass: "light" }; // rig hull crit at 16
  // Double MG: STR 6 + rear arc +8 + die 6 = 20, well past crit — would be Critical.
  const dmg = WEAPONS.longRange["Double MG"];
  const out = rollImpacts({ weightClass: "medium" }, target, dmg, "hull",
    { arc: "rear", hits: 2 }, { impacts: [6, 6] }, () => 0);
  assert.equal(out.every((h) => h.tier === "severe" && h.sp === 2), true);

  // Control: a non-MG gun reaching the same crit tier still crits.
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8, no machineGun flag
  const ctrl = rollImpacts({ weightClass: "medium" }, target, auto, "hull",
    { arc: "rear", hits: 1 }, { impacts: [6] }, () => 0);
  assert.equal(ctrl[0].tier, "critical");
});

test("Raise Shield negates the front arc and blunts side/rear by 4", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const base = {
    weightClass: "medium",
    weapons: { melee: "Bulwark Shield" },
    weaponUpgrades: { melee: "anvil-boss" }, // base coverage (no Tower Shield)
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

test("effectiveWeaponProfile applies selected ROF, STR, perk, and range upgrades", () => {
  const mini = makeRig(1, "Belt", "medium", "a", { longRange: "Mini Gun", melee: "Sword", longRangeUpgrade: "extended-belt" });
  assert.equal(effectiveWeaponProfile("longRange", "Mini Gun", mini).rof, 10);

  const auto = makeRig(2, "Core", "medium", "a", { longRange: "Autocannon", melee: "Sword", longRangeUpgrade: "depleted-core" });
  assert.equal(computeStr(auto, effectiveWeaponProfile("longRange", "Autocannon", auto), {}), 10);

  const sword = makeRig(3, "Edge", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "duelist-balance" });
  assert.equal(effectiveWeaponProfile("melee", "Sword", sword).perks.includes("Precision"), true);

  const lance = makeRig(4, "Reach", "medium", "a", { longRange: "Mini Gun", melee: "Lance", meleeUpgrade: "couched-reach" });
  assert.deepEqual(effectiveWeaponProfile("melee", "Lance", lance).rng, [4, 4]); // 2" base, Couched Reach doubles it to 4"

  const sniper = makeRig(5, "Marksman", "medium", "a", { longRange: "Sniper Cannon", melee: "Sword", longRangeUpgrade: "marksman-optics" });
  assert.equal(effectiveWeaponProfile("longRange", "Sniper Cannon", sniper).perks.includes("Precision"), true);
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
  assert.equal(computeModifiedAim(mortarRig, mortar, { distance: 18, cover: 2 }), 3);
});

test("painted target cancels cover and grants +1 Aim for ranged attacks", () => {
  const attacker = { weightClass: "medium", hull: { sp: 8 } };
  const ranged = { peak: 0, dropoff: 0, sweet: 6 }; // flat ACC 0
  const plain   = computeModifiedAim(attacker, ranged, { distance: 6, cover: 2 });
  const painted = computeModifiedAim(attacker, ranged, { distance: 6, cover: 2, painted: true });
  // cover 2 removed (+2 to accTotal) AND +1 Aim ⇒ modAim drops by 3.
  assert.equal(plain - painted, 3);
});

test("painted does not help melee weapons", () => {
  const attacker = { weightClass: "medium", hull: { sp: 8 } };
  const melee = { melee: true, acc: [0, 0] };
  const a = computeModifiedAim(attacker, melee, { distance: 2, cover: 0 });
  const b = computeModifiedAim(attacker, melee, { distance: 2, cover: 0, painted: true });
  assert.equal(a, b);
});

test("resolveAttack emits a per-die roll for each hit-die plus a location d12, each with a tone", () => {
  // Autocannon: rof 4, acc [0,-1], no Full Auto requested here. Medium attacker,
  // full hull, near range, front arc, cover 0, fire (not aimed) -> modAim =
  // AIM.medium(4) - (acc[0]=0 - cover=0 + aimedPenalty=0 + hullPenalty=0) = 4.
  // ap-shells (tuned) carries no STR bonus, so the expected STR below stays the
  // bare base+weight-class value — the default upgrade (depleted-core, field)
  // would add +2 STR and throw off the comparison.
  const attacker = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw", longRangeUpgrade: "ap-shells" });
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

test("computeModifiedAim adds +2 to the target number for an engaged ranged shot", () => {
  const mg = WEAPONS.longRange["Mini Gun"]; // sweet 7, peak 2
  const base = computeModifiedAim(attacker, mg, { distance: 7, cover: 0 });
  const engaged = computeModifiedAim(attacker, mg, { distance: 7, cover: 0, engaged: true });
  assert.equal(engaged, base + 2); // −2 accuracy raises the D6 target by 2
});

test("engaged penalty does not apply to melee weapons", () => {
  const sword = WEAPONS.melee["Sword"];
  const base = computeModifiedAim(attacker, sword, { range: "near", cover: 0 });
  const engaged = computeModifiedAim(attacker, sword, { range: "near", cover: 0, engaged: true });
  assert.equal(engaged, base); // melee unaffected
});

test("Ballistic Processor: +1 ACC in the sweet band (lower modAim)", () => {
  const attacker = { weightClass: "medium", hull: { sp: 7 }, equipment: "targeting-computer", equipmentUpgrade: "ballistic-processor" };
  const profile = WEAPONS.longRange["Autocannon"]; // has a sweet distance
  const inBand = computeModifiedAim(attacker, profile, { distance: profile.sweet });
  const plain = computeModifiedAim({ ...attacker, equipmentUpgrade: null }, profile, { distance: profile.sweet });
  assert.equal(plain - inBand, 1);
  // Band predicate is |distance − sweet| ≤ 2: the +1 holds at the edge
  // (sweet + 2) but drops just outside it (sweet + 3).
  const edge = computeModifiedAim(attacker, profile, { distance: profile.sweet + 2 });
  const edgePlain = computeModifiedAim({ ...attacker, equipmentUpgrade: null }, profile, { distance: profile.sweet + 2 });
  assert.equal(edgePlain - edge, 1);
  const outside = computeModifiedAim(attacker, profile, { distance: profile.sweet + 3 });
  const outsidePlain = computeModifiedAim({ ...attacker, equipmentUpgrade: null }, profile, { distance: profile.sweet + 3 });
  assert.equal(outsidePlain - outside, 0);
});

test("Targeting Computer passive: first shot ignores cover + engaged penalties", () => {
  const attacker = { weightClass: "medium", hull: { sp: 7 }, equipment: "targeting-computer" };
  const profile = WEAPONS.longRange["Autocannon"];
  const penalized = computeModifiedAim(attacker, profile, { distance: profile.sweet, cover: 2, engaged: true });
  const compensated = computeModifiedAim(attacker, profile, { distance: profile.sweet, cover: 2, engaged: true, fireControlFirst: true });
  // cover 2 and engaged −2 both feed accTotal (+2 and +2 to the target number);
  // the first-shot compensator zeroes both, dropping modAim by exactly 4.
  assert.equal(penalized - compensated, 4);
});

test("Lock Sight rerolls the whole volley of missed to-hit dice", () => {
  const rig = makeRig(1, "L", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  const p = effectiveWeaponProfile("longRange", "Autocannon", rig);
  const initial = [1, 1, 1, 1]; // rof 4, all misses
  const rerolls = [6, 6, 6, 6]; // every reroll lands
  const dice = { 0: 1, 1: 1, 2: 1, 3: 1, rerolls };
  const without = rollToHit(rig, p, { distance: p.sweet, cover: 0 }, initial, () => 0);
  const withLock = rollToHit(rig, p, { distance: p.sweet, cover: 0, lockSight: true }, dice, () => 0);
  assert.equal(without.hits, 0);
  assert.equal(withLock.hits, 4);
});

test("Cold Bore adds +3 STR only when the target is at full SP", () => {
  const sniper = makeRig(1, "S", "medium", "a", { longRange: "Sniper Cannon", melee: "Chainsaw", lrUpgrade: "cold-bore" });
  const fresh = makeRig(2, "F", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const hurt = makeRig(3, "H", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  hurt.arms.sp -= 1;
  const p = effectiveWeaponProfile("longRange", "Sniper Cannon", sniper);
  assert.equal(computeStr(sniper, p, { target: fresh }), p.str + 3);
  assert.equal(computeStr(sniper, p, { target: hurt }), p.str);
});

test("Steady Aim grants +3 STR within 2\" of the sweet spot, nothing off-band", () => {
  const rig = makeRig("r1", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "steady-aim", melee: "honed-talons" };
  const prof = effectiveWeaponProfile("longRange", "Crossbow", rig); // base STR 10, sweet 18
  assert.equal(computeStr(rig, prof, { distance: 18 }), 13); // at sweet: 10 + 3
  assert.equal(computeStr(rig, prof, { distance: 20 }), 13); // +2" edge: still in band
  assert.equal(computeStr(rig, prof, { distance: 16 }), 13); // -2" edge: still in band
  assert.equal(computeStr(rig, prof, { distance: 21 }), 10); // off-band: no bonus
  assert.equal(computeStr(rig, prof, {}), 10);               // no distance: no bonus
});

test("Exploit Wound grants +3 STR only against an already-damaged struck location", () => {
  const rig = makeRig("r2", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "fletched-bolts", melee: "exploit-wound" };
  const prof = effectiveWeaponProfile("melee", "Talon", rig); // base STR 7
  const wounded = { weightClass: "medium", hull: { sp: 3, max: 7 } };
  const fresh = { weightClass: "medium", hull: { sp: 7, max: 7 } };
  assert.equal(computeStr(rig, prof, { target: wounded, location: "hull" }), 10); // 7 + 3
  assert.equal(computeStr(rig, prof, { target: fresh, location: "hull" }), 7);    // no bonus
  assert.equal(computeStr(rig, prof, { target: wounded }), 7);                    // no location: no bonus
});

test("Evisceration forces Critical on a location at or below half max SP", () => {
  const rig = makeRig("r3", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "fletched-bolts", melee: "evisceration" };
  const prof = effectiveWeaponProfile("melee", "Talon", rig);
  // Hull 3/7 -> 3 <= 3.5 half-dead. Even d6=1 (tiny total) is forced Critical.
  const halfDead = { weightClass: "medium", hull: { sp: 3, max: 7 } };
  const out = rollImpacts(rig, halfDead, prof, "hull", { arc: "front", hits: 1 }, { impacts: [1] }, () => 0);
  assert.equal(out[0].tier, "critical");
  assert.equal(out[0].sp, 3);
  // Hull 4/7 -> 4 > 3.5 NOT half-dead: a d6=1 total glances off (no forced crit).
  const above = { weightClass: "medium", hull: { sp: 4, max: 7 } };
  const out2 = rollImpacts(rig, above, prof, "hull", { arc: "front", hits: 1 }, { impacts: [1] }, () => 0);
  assert.notEqual(out2[0].tier, "critical");
});

test("Evisceration downside: -1 STR against a fully-undamaged struck location", () => {
  const rig = makeRig("r4", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "fletched-bolts", melee: "evisceration" };
  const prof = effectiveWeaponProfile("melee", "Talon", rig); // base STR 7
  const fresh = { weightClass: "medium", hull: { sp: 7, max: 7 } };
  const hurt = { weightClass: "medium", hull: { sp: 5, max: 7 } };
  assert.equal(computeStr(rig, prof, { target: fresh, location: "hull" }), 6); // 7 - 1
  assert.equal(computeStr(rig, prof, { target: hurt, location: "hull" }), 7);  // damaged: no downside
});

test("Full Tilt adds +3 STR only when the attacker moved this activation", () => {
  const lance = makeRig(1, "L", "medium", "a", { longRange: "Mini Gun", melee: "Lance", meleeUpgrade: "full-tilt" });
  const p = effectiveWeaponProfile("melee", "Lance", lance);
  assert.equal(computeStr(lance, p, {}), p.str); // stationary — no bonus
  lance.movedThisActivation = true;
  assert.equal(computeStr(lance, p, {}), p.str + 3);
});

test("Momentum Swing reuses the charge gate for +2 STR (generalised charge key)", () => {
  const ball = makeRig(1, "WB", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "momentum-swing" });
  const p = effectiveWeaponProfile("melee", "Wrecking Ball", ball);
  assert.equal(computeStr(ball, p, {}), p.str); // stationary — no bonus
  ball.movedThisActivation = true;
  assert.equal(computeStr(ball, p, {}), p.str + 2);
});

test("Piledriver Protocol spends Momentum for +STR and ignores a braced front arc", () => {
  const ram = makeRig(1, "Ram", "medium", "a", { longRange: "Siege Maul", melee: "Bulwark Shield", lrUpgrade: "piledriver-protocol" });
  const wall = makeRig(2, "Wall", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  wall.preparation = { type: "brace" }; // braced on the front arc
  const p = effectiveWeaponProfile("longRange", "Siege Maul", ram); // STR 13, medium (+0)

  // computeStr: the threaded momentum spend adds +1 STR per point.
  assert.equal(computeStr(ram, p, { target: wall, momentum: 3 }), p.str + 3);

  // Without a guard-break, the brace's -2 applies: 5 + 13 + 0(front) - 2 = 16.
  const normal = rollImpacts(ram, wall, p, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(normal[0].total, 16);

  // Piledriver guard-break skips the brace AND adds +3 STR: 5 + (13+3) + 0 = 21.
  const smash = rollImpacts(ram, wall, p, "hull",
    { arc: "front", hits: 1, momentum: 3, guardBreak: true }, { impacts: [5] }, () => 0);
  assert.equal(smash[0].total, 21);
});

test("computeModifiedAim ignores cover during a Piledriver guard-break", () => {
  const ram = makeRig(1, "Ram", "medium", "a", { longRange: "Siege Maul", melee: "Bulwark Shield", lrUpgrade: "piledriver-protocol" });
  const p = effectiveWeaponProfile("longRange", "Siege Maul", ram); // peak 1 at distance-less
  // Cover 2 normally raises the D6 target by 2; the guard-break zeroes it.
  assert.equal(computeModifiedAim(ram, p, { cover: 2 }), 5);                    // 4 - (1 - 2)
  assert.equal(computeModifiedAim(ram, p, { cover: 2, guardBreak: true }), 3);  // 4 - 1
});

test("A Piledriver Siege Maul volley spends all Momentum (resets to 0) and lands through cover", () => {
  const ram = makeRig(1, "Ram", "medium", "a", { longRange: "Siege Maul", melee: "Bulwark Shield", lrUpgrade: "piledriver-protocol" });
  ram.momentum = 3;
  const wall = makeRig(2, "Wall", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  wall.preparation = { type: "brace" };
  const room = { rigs: [ram, wall], game: { round: 1 } };
  const ctx = makeCtx();
  // Siege Maul ROF 1; die 4 clears the guard-broken modAim of 3 despite cover 2.
  const res = resolveAttack(room, ram, wall,
    { weapon: "longRange", target: wall.name, arc: "front", range: "near", cover: 2,
      dice: { toHit: [4], location: 1, impacts: [5] } }, () => 0, ctx);
  assert.equal(res.ok, true);
  assert.equal(res.hits, 1);          // cover ignored → the shot lands
  assert.equal(ram.momentum, 0);      // all Momentum unloaded by the shot
});

test("A Siege Maul rig without Piledriver never spends or reads Momentum", () => {
  const ram = makeRig(1, "Plain", "medium", "a", { longRange: "Siege Maul", melee: "Sword", lrUpgrade: "breaching-round" });
  const p = effectiveWeaponProfile("longRange", "Siege Maul", ram);
  // A stray momentum in opts must NOT add STR without the piledriver effect.
  assert.equal(computeStr(ram, p, { target: {}, momentum: 3 }), p.str);
});

test("Bloodletter adds +1 to-hit die vs a target missing SP anywhere", () => {
  const chainsawRig = makeRig(1, "C", "medium", "a", { longRange: "Mini Gun", melee: "Chainsaw", meleeUpgrade: "bloodletter" });
  const p = effectiveWeaponProfile("melee", "Chainsaw", chainsawRig);
  const fresh = makeRig(2, "F", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const hurt = makeRig(3, "H", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  hurt.legs.sp -= 1;
  const dice = [1, 1, 1, 1]; // all misses — only ROF (dice count) matters here
  const freshRoll = rollToHit(chainsawRig, p, { range: "near", cover: 0, target: fresh }, dice, () => 0);
  const hurtRoll = rollToHit(chainsawRig, p, { range: "near", cover: 0, target: hurt }, dice, () => 0);
  assert.equal(freshRoll.rof, 3);
  assert.equal(hurtRoll.rof, 4);
});

test("Cold Bore / Bloodletter read the target's real parts (Tank: no arms/legs)", () => {
  // A pristine Tank is hull/tracks/turret/engine — it has no `arms`/`legs`.
  // The undamaged/damaged checks must walk the target's actual anatomy, or
  // Bloodletter over-fires and Cold Bore under-fires against units.
  const pristineTank = makeUnit("tank", 9, "Panzer", "b", { unit: "Coaxial MG" });

  const chainsawRig = makeRig(1, "C", "medium", "a", { longRange: "Mini Gun", melee: "Chainsaw", meleeUpgrade: "bloodletter" });
  const bl = effectiveWeaponProfile("melee", "Chainsaw", chainsawRig);
  const dice = [1, 1, 1, 1]; // all misses — only ROF (dice count) matters
  const roll = rollToHit(chainsawRig, bl, { range: "near", cover: 0, target: pristineTank }, dice, () => 0);
  assert.equal(roll.rof, 3); // full-SP tank is NOT damaged → no extra die

  const sniper = makeRig(2, "S", "medium", "a", { longRange: "Sniper Cannon", melee: "Chainsaw", lrUpgrade: "cold-bore" });
  const cb = effectiveWeaponProfile("longRange", "Sniper Cannon", sniper);
  assert.equal(computeStr(sniper, cb, { target: pristineTank }), cb.str + 3); // pristine tank IS undamaged → +3
});

test("Opportunist adds +3 STR vs an overheated or action-penalised target", () => {
  const sword = makeRig(1, "S", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "opportunist" });
  const p = effectiveWeaponProfile("melee", "Sword", sword);
  const healthy = makeRig(2, "H", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  assert.equal(computeStr(sword, p, { target: healthy }), p.str);

  const overheated = makeRig(3, "O", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  overheated.engine.heat = HEAT_CAPACITY[overheated.weightClass] + 1;
  assert.equal(computeStr(sword, p, { target: overheated }), p.str + 3);

  const disrupted = makeRig(4, "D", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  disrupted.actionPenaltyNextActivation = 1;
  assert.equal(computeStr(sword, p, { target: disrupted }), p.str + 3);
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

test("Pinning Burst sets a 1-action penalty at 4+ hits, not below", () => {
  const attacker = makeRig(1, "P", "medium", "a", { longRange: "Double MG", melee: "Sword", longRangeUpgrade: "pinning-burst" });
  const target4 = makeRig(2, "T4", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room4 = { rigs: [attacker, target4] };
  const ctx = makeCtx();
  // 4 crits (die=6, always hits) out of 8 dice -> hits === 4.
  resolveAttack(room4, attacker, target4, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 6, 6, 6, 1, 1, 1, 1], location: 1 },
  }, () => 0, ctx);
  assert.equal(target4.actionPenaltyNextActivation, 1);

  const target3 = makeRig(3, "T3", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room3 = { rigs: [attacker, target3] };
  // Only 3 crits -> hits === 3, below the 4-hit threshold.
  resolveAttack(room3, attacker, target3, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 6, 6, 1, 1, 1, 1, 1], location: 1 },
  }, () => 0, ctx);
  assert.equal(target3.actionPenaltyNextActivation || 0, 0);
});

test("Redline Governor adds STR from attacker heat over cap, capped at +3", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Mini Gun", melee: "Chainsaw", meleeUpgrade: "redline-governor" });
  const p = effectiveWeaponProfile("melee", "Chainsaw", rig);
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass]; // at cap -> no bonus
  assert.equal(computeStr(rig, p, {}), p.str);
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass] + 2; // +2 over cap
  assert.equal(computeStr(rig, p, {}), p.str + 2);
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass] + 10; // way over cap, still capped at +3
  assert.equal(computeStr(rig, p, {}), p.str + 3);
});

test("Redline Governor adds to-hit dice from attacker heat over cap, capped at +3", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Mini Gun", melee: "Chainsaw", meleeUpgrade: "redline-governor" });
  const p = effectiveWeaponProfile("melee", "Chainsaw", rig);
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass]; // at cap -> no bonus
  const atCap = rollToHit(rig, p, { range: "near", cover: 0 }, [1, 1, 1], () => 0);
  assert.equal(atCap.rof, 3); // base Chainsaw ROF
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass] + 2; // +2 over cap
  const over = rollToHit(rig, p, { range: "near", cover: 0 }, [1, 1, 1, 1, 1], () => 0);
  assert.equal(over.rof, 5); // base 3 + 2 extra dice
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass] + 10; // way over, capped at +3
  const capped = rollToHit(rig, p, { range: "near", cover: 0 }, [1, 1, 1, 1, 1, 1], () => 0);
  assert.equal(capped.rof, 6); // base 3 + capped 3
});

test("Superconductor Edge adds +2 STR when attacker heat is over half class cap", () => {
  const rig = makeRig(1, "S", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "superconductor-edge" });
  const p = effectiveWeaponProfile("melee", "Sword", rig);
  rig.engine.heat = Math.floor(HEAT_CAPACITY[rig.weightClass] / 2); // at/under half -> no bonus
  assert.equal(computeStr(rig, p, {}), p.str);
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass]; // clearly over half
  assert.equal(computeStr(rig, p, {}), p.str + 2);
});

test("Superconductor Edge moves 1 heat attacker->target once per attack while running hot", () => {
  const attacker = makeRig(1, "S", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "superconductor-edge" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  attacker.engine.heat = HEAT_CAPACITY[attacker.weightClass]; // over half cap
  const room = { rigs: [attacker, target] };
  const heatBumps = [];
  const ctx = { ...makeCtx(), bumpHeat(rig, n) { heatBumps.push([rig.id, n]); } };
  resolveAttack(room, attacker, target, {
    weapon: "melee", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6], location: 1 },
  }, () => 0, ctx);
  assert.deepEqual(heatBumps, [[attacker.id, -1], [target.id, 1]]);
});

test("Superconductor Edge does nothing under half class cap heat", () => {
  const attacker = makeRig(1, "S", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "superconductor-edge" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  attacker.engine.heat = 0; // well under half cap
  const room = { rigs: [attacker, target] };
  const heatBumps = [];
  const ctx = { ...makeCtx(), bumpHeat(rig, n) { heatBumps.push([rig.id, n]); } };
  resolveAttack(room, attacker, target, {
    weapon: "melee", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6], location: 1 },
  }, () => 0, ctx);
  assert.deepEqual(heatBumps, []);
});

const BURN_OPTS = { weapon: "melee", arc: "front", range: "near", cover: 0, dice: { toHit: [6], location: 1 } };

test("Napalm sets the target burning to 1 and never stacks past 1", () => {
  const attacker = makeRig(1, "N", "medium", "a", { longRange: "Mini Gun", melee: "Flamethrower", meleeUpgrade: "napalm" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target, BURN_OPTS, () => 0, ctx);
  assert.equal(target.burning, 1);
  resolveAttack(room, attacker, target, BURN_OPTS, () => 0, ctx);
  assert.equal(target.burning, 1); // max, not stack
});

test("Conflagration stacks the target's burning and self-heats the attacker per hit", () => {
  const attacker = makeRig(1, "C", "medium", "a", { longRange: "Mini Gun", melee: "Flamethrower", meleeUpgrade: "conflagration" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const heatBumps = [];
  const ctx = { ...makeCtx(), bumpHeat(rig, n) { heatBumps.push([rig.id, n]); } };
  resolveAttack(room, attacker, target, BURN_OPTS, () => 0, ctx);
  assert.equal(target.burning, 1);
  resolveAttack(room, attacker, target, BURN_OPTS, () => 0, ctx);
  assert.equal(target.burning, 2); // stacks
  // +1 heat to the attacker per hit-resolution (two attacks landed).
  assert.deepEqual(heatBumps.filter(([id]) => id === attacker.id), [[attacker.id, 1], [attacker.id, 1]]);
});

test("Penetrator Rounds forces the 3rd Autocannon volley's hits to Severe, bypassing the armour row", () => {
  const attacker = makeRig(1, "P", "medium", "a", { longRange: "Autocannon", melee: "Claw", longRangeUpgrade: "penetrator-rounds" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const ctx = makeCtx();
  const miss = { weapon: "longRange", arc: "front", range: "near", cover: 0, dice: { toHit: [1, 1, 1, 1] } };
  resolveAttack(room, attacker, target, miss, () => 0, ctx); // 1st volley — all miss, counter -> 1
  attacker.loaded.longRange = true; // simulate the reload a new activation grants
  resolveAttack(room, attacker, target, miss, () => 0, ctx); // 2nd volley — all miss, counter -> 2
  assert.equal(attacker.autocannonShots, 2);
  assert.equal(attacker.autocannonSlowNext, false);
  attacker.loaded.longRange = true;
  // 3rd volley: 1 landed hit (die 6), impact die 5 -> total 5 + 8(STR) + 0(front arc) = 13,
  // which is only "direct" (1 SP) on a medium Hull row (11/14/17) without the upgrade.
  const res = resolveAttack(room, attacker, target, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 1, 1, 1], location: 1, impacts: [5] },
  }, () => 0, ctx);
  assert.equal(attacker.autocannonShots, 3);
  assert.equal(res.impacts.length, 1);
  assert.equal(res.impacts[0].tier, "severe");
  assert.equal(res.impacts[0].sp, 2); // forced Severe instead of the would-be Direct (1 SP)
  assert.equal(attacker.autocannonSlowNext, true); // downside armed for the very next attack
});

test("Penetrator Rounds halves ROF on the attack immediately after it fires", () => {
  const attacker = makeRig(1, "P", "medium", "a", { longRange: "Autocannon", melee: "Claw", longRangeUpgrade: "penetrator-rounds" });
  const profile = effectiveWeaponProfile("longRange", "Autocannon", attacker);
  attacker.autocannonShots = 2; // the next volley will be the 3rd
  const third = rollToHit(attacker, profile, { range: "near", cover: 0 }, [1, 1, 1, 1], () => 0);
  assert.equal(attacker.autocannonShots, 3);
  assert.equal(third.penetratorShot, true);
  assert.equal(third.rof, 4); // full ROF — the slow-belt downside hasn't landed yet
  assert.equal(attacker.autocannonSlowNext, true);
  const fourth = rollToHit(attacker, profile, { range: "near", cover: 0 }, [1, 1], () => 0);
  assert.equal(fourth.rof, 2); // halved: belt cycles slow the attack right after a penetrator shot
  assert.equal(attacker.autocannonSlowNext, false); // consumed
  assert.equal(fourth.penetratorShot, false); // 4 % 3 !== 0
});

const SUPPRESS_SHOT = {
  weapon: "longRange", arc: "front", range: "near", cover: 0,
  dice: { toHit: [6, 1, 1, 1, 1, 1, 1, 1], location: 1 }, // exactly 1 landed hit
};

test("Suppression Lock ramps consecutive same-target hits: speed -> action penalty -> immobilise", () => {
  const attacker = makeRig(1, "S", "medium", "a", { longRange: "Mini Gun", melee: "Sword", longRangeUpgrade: "suppression-lock" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const heatBumps = [];
  const ctx = { ...makeCtx(), bumpHeat(rig, n) { heatBumps.push([rig.id, n]); } };

  resolveAttack(room, attacker, target, SUPPRESS_SHOT, () => 0, ctx);
  assert.equal(attacker.suppressStacks, 1);
  assert.equal(target.speedHalvedNextRound, true);
  assert.equal(target.actionPenaltyNextActivation || 0, 0);
  assert.equal(target.immobilised, false);

  attacker.loaded.longRange = true; // simulate the reload a new activation grants
  resolveAttack(room, attacker, target, SUPPRESS_SHOT, () => 0, ctx);
  assert.equal(attacker.suppressStacks, 2);
  assert.equal(target.actionPenaltyNextActivation, 1);
  assert.equal(target.immobilised, false);

  attacker.loaded.longRange = true;
  resolveAttack(room, attacker, target, SUPPRESS_SHOT, () => 0, ctx);
  assert.equal(attacker.suppressStacks, 3);
  assert.equal(target.suppressImmobile, true);   // scoped, self-clearing pin
  assert.equal(target.immobilised, false);        // never the permanent leg-destruction flag
  assert.equal(target.noPrepNextActivation, true);

  attacker.loaded.longRange = true;
  resolveAttack(room, attacker, target, SUPPRESS_SHOT, () => 0, ctx); // 4th hit — stacks cap at 3
  assert.equal(attacker.suppressStacks, 3);

  // The attacker runs hot every attack while the lock is active — one +1 heat
  // bump per landed hit above.
  assert.deepEqual(
    heatBumps.filter(([id]) => id === attacker.id),
    [[attacker.id, 1], [attacker.id, 1], [attacker.id, 1], [attacker.id, 1]],
  );
});

test("Suppression Lock resets to 1 stack (speed only) when the attacker switches target", () => {
  const attacker = makeRig(1, "S", "medium", "a", { longRange: "Mini Gun", melee: "Sword", longRangeUpgrade: "suppression-lock" });
  const targetA = makeRig(2, "A", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const targetB = makeRig(3, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, targetA, targetB] };
  const ctx = makeCtx();

  resolveAttack(room, attacker, targetA, SUPPRESS_SHOT, () => 0, ctx);
  attacker.loaded.longRange = true; // simulate the reload a new activation grants
  resolveAttack(room, attacker, targetA, SUPPRESS_SHOT, () => 0, ctx);
  assert.equal(attacker.suppressStacks, 2);
  assert.equal(targetA.actionPenaltyNextActivation, 1);

  attacker.loaded.longRange = true;
  resolveAttack(room, attacker, targetB, SUPPRESS_SHOT, () => 0, ctx);
  assert.equal(attacker.suppressTarget, targetB.id);
  assert.equal(attacker.suppressStacks, 1); // reset by the target switch
  assert.equal(targetB.speedHalvedNextRound, true);
  assert.equal(targetB.actionPenaltyNextActivation || 0, 0); // only 1 stack — speed only
});

test("Ion Storm EMPs the struck target and overloads the attacker's own Arc Gun", () => {
  const attacker = makeRig(1, "Ion", "medium", "a", { longRange: "Arc Gun", melee: "Sword", longRangeUpgrade: "ion-storm" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const heatBumps = [];
  const ctx = { ...makeCtx(), bumpHeat(rig, n) { heatBumps.push([rig.id, n]); } };
  // Arc Gun rof 2; die 6 hits (modAim 3), die 1 misses -> exactly 1 landed hit.
  const res = resolveAttack(room, attacker, target, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 1], location: 1, impacts: [1] },
  }, () => 0, ctx);
  assert.equal(res.hits, 1);
  // Target EMP'd for its next activation.
  assert.equal(target.actionPenaltyNextActivation, 1);
  assert.equal(target.noPrepNextActivation, true);
  assert.equal(target.noActivesNextActivation, true);
  // Attacker's own gun overloaded.
  assert.equal(attacker.arcLockedNext, true);
  // 2-heat spike on the target, 3 on the attacker (no other heat sources here).
  assert.deepEqual(heatBumps, [[target.id, 2], [attacker.id, 3]]);
});

test("Ion Storm does nothing on a whiff (no landed hit, no EMP, no self-heat)", () => {
  const attacker = makeRig(1, "Ion", "medium", "a", { longRange: "Arc Gun", melee: "Sword", longRangeUpgrade: "ion-storm" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const heatBumps = [];
  const ctx = { ...makeCtx(), bumpHeat(rig, n) { heatBumps.push([rig.id, n]); } };
  resolveAttack(room, attacker, target, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [1, 1], location: 1 }, // both miss
  }, () => 0, ctx);
  assert.equal(target.noActivesNextActivation, false);
  assert.equal(attacker.arcLockedNext, false);
  assert.deepEqual(heatBumps, []);
});

test("Fire Control Lock's painted Missile Barrage volley auto-hits with Armour Piercing", () => {
  const attacker = makeRig(1, "Lock", "medium", "a", { longRange: "Missile Barrage", melee: "Sword", longRangeUpgrade: "fire-control-lock" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  attacker.lockedTarget = target.id;
  attacker.lockExpiresRound = 2; // fresh paint (round 1 <= 2)
  // rof 4; every to-hit die is a 1 (would all miss at modAim 3) — the lock forces
  // all four to land. Impact die 6 + AP die 3 proves Armour Piercing is applied.
  const res = resolveAttack(room, attacker, target, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [1, 1, 1, 1], location: 1, impacts: [6, 6, 6, 6], ap: [3, 3, 3, 3] },
  }, () => 0, ctx);
  assert.equal(res.hits, 4);                    // unmissable volley — all shots land
  // STR: Missile Barrage 9 + medium weight 0 = 9; front arc +0; die 6 + AP +3.
  assert.equal(res.impacts[0].total, 6 + 9 + 0 + 3); // 18 — AP D3 folded in
  assert.equal(attacker.lockedTarget, null);    // paint consumed by the volley
});

test("Fire Control Lock ignores a stale paint (expired round) and clears it", () => {
  const attacker = makeRig(1, "Lock", "medium", "a", { longRange: "Missile Barrage", melee: "Sword", longRangeUpgrade: "fire-control-lock" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 3 } };
  const ctx = makeCtx();
  attacker.lockedTarget = target.id;
  attacker.lockExpiresRound = 2; // stale: round 3 > 2
  const res = resolveAttack(room, attacker, target, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [1, 1, 1, 1], location: 1 }, // all miss — no auto-hit
  }, () => 0, ctx);
  assert.equal(res.hits, 0);                 // no lock -> the misses stand
  assert.equal(attacker.lockedTarget, null); // stale paint dropped
});

test("Fire Control Lock only fires vs the exact painted target", () => {
  const attacker = makeRig(1, "Lock", "medium", "a", { longRange: "Missile Barrage", melee: "Sword", longRangeUpgrade: "fire-control-lock" });
  const painted = makeRig(2, "P", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const other = makeRig(3, "O", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, painted, other], game: { round: 1 } };
  const ctx = makeCtx();
  attacker.lockedTarget = painted.id;
  attacker.lockExpiresRound = 2;
  // Firing at the un-painted rig gets no auto-hit and leaves the lock intact.
  const res = resolveAttack(room, attacker, other, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [1, 1, 1, 1], location: 1 },
  }, () => 0, ctx);
  assert.equal(res.hits, 0);
  assert.equal(attacker.lockedTarget, painted.id); // paint still saved for the real target
});

test("Breach Grip — a cracked location adds +2 to every impact over its 2-round window, gone by N+2", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  // Applied at round N=4 stores expiry N+1=5: live at rounds 4 and 5, gone at 6.
  const cracked = { weightClass: "medium", cracked: { hull: 5 } };
  const plain = { weightClass: "medium" };
  // die 5 + STR 8 = 13 -> direct(1) on a medium hull (11/14/17) with no crack.
  const base = rollImpacts({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1, round: 5 }, { impacts: [5] }, () => 0);
  assert.equal(base[0].total, 13);
  assert.equal(base[0].tier, "direct");
  // Round N (4) and N+1 (5) are both live: 13 + 2 = 15 -> severe(2).
  for (const round of [4, 5]) {
    const live = rollImpacts({ weightClass: "medium" }, cracked, auto, "hull",
      { arc: "front", hits: 1, round }, { impacts: [5] }, () => 0);
    assert.equal(live[0].total, 15, `round ${round} should still be cracked`);
    assert.equal(live[0].tier, "severe");
  }
  // Gone by N+2 (round 6): the +2 is no longer applied (5 >= 6 is false).
  const stale = rollImpacts({ weightClass: "medium" }, cracked, auto, "hull",
    { arc: "front", hits: 1, round: 6 }, { impacts: [5] }, () => 0);
  assert.equal(stale[0].total, 13);
});

test("Breach Grip — a damaging Claw hit routes through ctx.crackLocation", () => {
  const attacker = makeRig(1, "Pry", "medium", "a", { longRange: "Autocannon", melee: "Claw", meleeUpgrade: "breach-grip" });
  const target = makeRig(2, "Wall", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 4 } };
  const cracks = [];
  const ctx = {
    ...makeCtx(),
    applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); },
    crackLocation: (rm, t, loc) => { cracks.push([t.id, loc, rm.game.round]); },
  };
  const res = resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", range: "near",
      dice: { toHit: [6, 6, 6], location: 1, impacts: [6, 6, 6] } }, () => 0, ctx);
  assert.equal(res.location, "hull");
  assert.deepEqual(cracks, [[2, "hull", 4]]);
});

test("Pinning Bolt immobilises the target and adds +2 self-heat on a damaging hit", () => {
  const heatBumps = [];
  const ctx = {
    pushResolution() {},
    applyDamage() {},
    bumpHeat(rig, n) { heatBumps.push([rig.id, n]); },
    engage() {},
    profileFor: (slot, name, rig) => effectiveWeaponProfile(slot, name, rig),
  };
  const shrike = makeRig("atk", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  shrike.weaponUpgrades = { longRange: "pinning-bolt", melee: "honed-talons" };
  shrike.loaded.longRange = true;
  const prey = makeRig("def", "Prey", "medium", "B", { longRange: "Autocannon", melee: "Sword" });
  const room = { rigs: [shrike, prey], game: { round: 1 } };
  // toHit d6=6 (natural hit), location d12=1 (hull), impact d6=6 -> 6 + STR10 = 16 => severe (sp 2) => damaging.
  const res = resolveAttack(room, shrike, prey, {
    weapon: "longRange", arc: "front", distance: 18, aimed: false,
    dice: { toHit: [6], location: [1], impacts: [6] },
  }, () => 0, ctx);
  assert.equal(res.ok, true);
  assert.equal(prey.immobilised, true);
  assert.deepEqual(heatBumps, [["atk", 2]]); // only the pinning heat (base fire heat is 0 here)
});

test("Dismember — a damaging Circular Saw hit routes through ctx.dismemberLocation", () => {
  const attacker = makeRig(1, "Grind", "medium", "a", { longRange: "Autocannon", melee: "Circular Saw", meleeUpgrade: "dismember" });
  const target = makeRig(2, "Slab", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const calls = [];
  const ctx = {
    ...makeCtx(),
    applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); },
    dismemberLocation: (rm, t, loc) => { calls.push([t.id, loc]); },
  };
  const res = resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", range: "near",
      dice: { toHit: [6, 6, 6], location: 1, impacts: [6, 6, 6] } }, () => 0, ctx);
  assert.equal(res.location, "hull");
  assert.deepEqual(calls, [[2, "hull"]]);
});

test("Kneecapper — a front-arc limb hit lands (Raking Fire would otherwise auto-fail)", () => {
  const attacker = makeRig(1, "K", "medium", "a", { longRange: "Double MG", melee: "Sword", longRangeUpgrade: "kneecapper" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const ctx = {
    ...makeCtx(),
    applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); },
  };
  const res = resolveAttack(room, attacker, target,
    { weapon: "longRange", arc: "front", range: "near", aimed: true, aimedLoc: "legs",
      dice: { toHit: [6], impacts: [6], ap: [1] } }, () => 0, ctx);
  assert.equal(res.location, "legs");
  assert.ok(res.impacts.some((h) => h.sp > 0), "a plain Raking Fire MG would auto-fail the front arc; Kneecapper must not");
  assert.ok(target.legs.sp < target.legs.max);
});

test("Kneecapper — hull and engine are never valid targets, aimed or not", () => {
  const attacker = makeRig(1, "K2", "medium", "a", { longRange: "Double MG", melee: "Sword", longRangeUpgrade: "kneecapper" });
  for (const badAim of ["hull", "engine"]) {
    const target = makeRig(2, "T2", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
    const room = { rigs: [attacker, target] };
    const ctx = {
      ...makeCtx(),
      applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); },
    };
    const res = resolveAttack(room, attacker, target,
      { weapon: "longRange", arc: "front", range: "near", aimed: true, aimedLoc: badAim,
        dice: { toHit: [6], impacts: [6], ap: [1] } }, () => 0, ctx);
    assert.notEqual(res.location, "hull");
    assert.notEqual(res.location, "engine");
    assert.equal(target.hull.sp, target.hull.max, `aiming at ${badAim} must not touch hull`);
    assert.equal(target.engine.sp, target.engine.max, `aiming at ${badAim} must not touch engine`);
  }
  // Un-aimed fire that would randomly roll hull (D12 = 1) is remapped too.
  const target3 = makeRig(3, "T3", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room3 = { rigs: [attacker, target3] };
  const ctx3 = {
    ...makeCtx(),
    applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); },
  };
  const res3 = resolveAttack(room3, attacker, target3,
    { weapon: "longRange", arc: "front", range: "near", aimed: false,
      dice: { toHit: [6], location: 1, impacts: [6], ap: [1] } }, () => 0, ctx3);
  assert.notEqual(res3.location, "hull");
  assert.notEqual(res3.location, "engine");
  assert.equal(target3.hull.sp, target3.hull.max);
  assert.equal(target3.engine.sp, target3.engine.max);
});

test("Kneecapper cripple ramp — armsSuppressed halves ROF for every weapon", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Autocannon", melee: "Chainsaw" });
  const profile = effectiveWeaponProfile("longRange", "Autocannon", rig); // base rof 4
  const dice = [1, 1, 1, 1];
  const healthy = rollToHit(rig, profile, { range: "near", cover: 0 }, dice, () => 0);
  assert.equal(healthy.rof, 4);
  rig.armsSuppressed = true;
  const suppressed = rollToHit(rig, profile, { range: "near", cover: 0 }, dice, () => 0);
  assert.equal(suppressed.rof, 2); // halved, floor division
  // Melee is suppressed too — it's the rig's own weapon limb, not a per-weapon flag.
  const melee = effectiveWeaponProfile("melee", "Chainsaw", rig); // base rof 3
  const meleeRes = rollToHit(rig, melee, { range: "near", cover: 0 }, [1, 1, 1], () => 0);
  assert.equal(meleeRes.rof, 1); // floor(3/2)
});

test("armsSuppressed never silences a ROF-1 weapon — it floors at 1 die (#4)", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Sniper Cannon", melee: "Lance" });
  rig.armsSuppressed = true;
  const sniper = effectiveWeaponProfile("longRange", "Sniper Cannon", rig); // base rof 1
  const res = rollToHit(rig, sniper, { range: "near", cover: 0 }, [6], () => 0);
  assert.equal(res.rof, 1); // Math.max(1, floor(1/2)) = 1, not 0
  const lance = effectiveWeaponProfile("melee", "Lance", rig); // base rof 1
  const lres = rollToHit(rig, lance, { range: "near", cover: 0 }, [6], () => 0);
  assert.equal(lres.rof, 1);
});

// Group G — spatial upgrade effects. The engine has no grid, so forced movement
// / ricochets surface as player-facing instructions in the resolution log. These
// tests assert the pushed instruction text and its gating, not any coordinates.

test("Momentum Swing emits a knockback instruction only on a landed charging swing", () => {
  const opts = { weapon: "melee", arc: "front", range: "near", dice: { toHit: [6], location: 1, impacts: [6] } };

  // Charged (moved this activation) + a landed damaging hit → instruction present.
  const ball = makeRig(1, "WB", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "momentum-swing" });
  ball.movedThisActivation = true;
  const t1 = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const ctx1 = makeCtx();
  resolveAttack({ rigs: [ball, t1] }, ball, t1, { ...opts, target: t1.name }, () => 0, ctx1);
  const kb = ctx1.resolutions.find((r) => /Momentum Swing — knock/.test(r.summary));
  assert.ok(kb, "expected a knockback instruction");
  assert.equal(kb.summary, 'Momentum Swing — knock T back 3" (move the mini).');

  // Did NOT move → the charge never triggered, so no knockback even on a hit.
  const still = makeRig(3, "WB2", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "momentum-swing" });
  const t2 = makeRig(4, "T2", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const ctx2 = makeCtx();
  resolveAttack({ rigs: [still, t2] }, still, t2, { ...opts, target: t2.name }, () => 0, ctx2);
  assert.ok(!ctx2.resolutions.some((r) => /Momentum Swing — knock/.test(r.summary)));

  // Moved but whiffed (no damaging hit) → no knockback.
  const miss = makeRig(5, "WB3", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "momentum-swing" });
  miss.movedThisActivation = true;
  const t3 = makeRig(6, "T3", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const ctx3 = makeCtx();
  resolveAttack({ rigs: [miss, t3] }, miss, t3,
    { weapon: "melee", target: t3.name, arc: "front", range: "near", dice: { toHit: [1], location: 1 } }, () => 0, ctx3);
  assert.ok(!ctx3.resolutions.some((r) => /Momentum Swing — knock/.test(r.summary)));
});

test("Piledriver emits a shove instruction only when Momentum was spent on a landed hit", () => {
  const shot = { weapon: "longRange", arc: "front", range: "near", cover: 0, dice: { toHit: [6], location: 1, impacts: [5] } };

  // Momentum spent (2) + a landed hit → shove instruction present.
  const ram = makeRig(1, "Ram", "medium", "a", { longRange: "Siege Maul", melee: "Bulwark Shield", lrUpgrade: "piledriver-protocol" });
  ram.momentum = 2;
  const wall = makeRig(2, "Wall", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  const ctx = makeCtx();
  const res = resolveAttack({ rigs: [ram, wall], game: { round: 1 } }, ram, wall, { ...shot, target: wall.name }, () => 0, ctx);
  assert.ok(res.hits >= 1);
  const shove = ctx.resolutions.find((r) => /Piledriver — shove/.test(r.summary));
  assert.ok(shove, "expected a shove instruction");
  assert.equal(shove.summary, 'Piledriver — shove Wall back 3" (move the mini).');

  // No stored Momentum → no shove even on a landed hit.
  const ram2 = makeRig(3, "Ram2", "medium", "a", { longRange: "Siege Maul", melee: "Bulwark Shield", lrUpgrade: "piledriver-protocol" });
  ram2.momentum = 0;
  const wall2 = makeRig(4, "Wall2", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  const ctx2 = makeCtx();
  resolveAttack({ rigs: [ram2, wall2], game: { round: 1 } }, ram2, wall2, { ...shot, target: wall2.name }, () => 0, ctx2);
  assert.ok(!ctx2.resolutions.some((r) => /Piledriver — shove/.test(r.summary)));

  // Momentum spent but the smash misses → no shove.
  const ram3 = makeRig(5, "Ram3", "medium", "a", { longRange: "Siege Maul", melee: "Bulwark Shield", lrUpgrade: "piledriver-protocol" });
  ram3.momentum = 3;
  const wall3 = makeRig(6, "Wall3", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  const ctx3 = makeCtx();
  resolveAttack({ rigs: [ram3, wall3], game: { round: 1 } }, ram3, wall3,
    { weapon: "longRange", target: wall3.name, arc: "front", range: "near", cover: 0, dice: { toHit: [1], location: 1 } }, () => 0, ctx3);
  assert.ok(!ctx3.resolutions.some((r) => /Piledriver — shove/.test(r.summary)));
});

test("Brace immovability suppresses the Momentum Swing knockback", () => {
  const ball = makeRig(1, "WB", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "momentum-swing" });
  ball.movedThisActivation = true; // charge is live
  const wall = makeRig(2, "Wall", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  wall.preparation = { type: "brace" };
  const room = { rigs: [ball, wall], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, ball, wall,
    { weapon: "melee", target: wall.name, arc: "front", range: "near",
      dice: { toHit: [6], location: 1, impacts: [5] } }, () => 0, ctx);
  assert.ok(!ctx.resolutions.some((r) => /knock .* back 3"/.test(r.summary)),
    "a braced target must not receive a knockback instruction");
  assert.ok(ctx.resolutions.some((r) => /braced \(immovable\)/.test(r.summary)),
    "expected an immovable no-op note");
});

test("Enfilade emits the ricochet instruction on every 3rd aimed shot; non-aimed shots don't count", () => {
  const sniper = makeRig(1, "Sn", "medium", "a", { longRange: "Sniper Cannon", melee: "Chainsaw", lrUpgrade: "enfilade" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [sniper, target], game: { round: 1 } };
  const aimed = { weapon: "longRange", target: target.name, arc: "front", range: "near", aimed: true, aimedLoc: "hull", dice: { toHit: [1], location: 1 } };

  function fire(opts) {
    sniper.loaded.longRange = true; // a new activation reloads the single-shot cannon
    const ctx = makeCtx();
    resolveAttack(room, sniper, target, opts, () => 0, ctx);
    return ctx;
  }

  const c1 = fire(aimed);
  assert.equal(sniper.enfiladeShots, 1);
  assert.ok(!c1.resolutions.some((r) => /Enfilade — ricochet/.test(r.summary)));

  const c2 = fire(aimed);
  assert.equal(sniper.enfiladeShots, 2);
  assert.ok(!c2.resolutions.some((r) => /Enfilade — ricochet/.test(r.summary)));

  const c3 = fire(aimed);
  assert.equal(sniper.enfiladeShots, 3);
  const ric = c3.resolutions.find((r) => /Enfilade — ricochet/.test(r.summary));
  assert.ok(ric, "expected a ricochet instruction on the 3rd aimed shot");
  assert.equal(ric.summary,
    "Enfilade — ricochet! Resolve a +2 STR hit on the next rig in line of sight behind T (player's choice).");

  // A non-aimed shot fires but must NOT advance the aimed-shot cadence.
  const c4 = fire({ ...aimed, aimed: false, aimedLoc: undefined });
  assert.equal(sniper.enfiladeShots, 3); // unchanged by the non-aimed shot
  assert.ok(!c4.resolutions.some((r) => /Enfilade — ricochet/.test(r.summary)));
});

test("Tow Chain emits the fling instruction, adds +2 heat, roots the attacker, and sets the cooldown — then no fling while recharging", () => {
  const opts = { weapon: "melee", arc: "front", range: "near", dice: { toHit: [6], location: 1, impacts: [6] } };

  // Charged chain (round >= cooldown) + a landed damaging hit → fling + state.
  const ball = makeRig(1, "WB", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "tow-chain" });
  const t1 = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  let heat = 0;
  const ctx1 = { ...makeCtx(), bumpHeat: (rig, n) => { if (rig === ball) heat += n; } };
  resolveAttack({ rigs: [ball, t1], game: { round: 1 } }, ball, t1, { ...opts, target: t1.name }, () => 0, ctx1);
  const fling = ctx1.resolutions.find((r) => /Tow Chain — fling/.test(r.summary));
  assert.ok(fling, "expected a Tow Chain fling instruction");
  assert.equal(fling.summary, 'Tow Chain — fling T up to 4" in a direction you choose (move the mini). You are rooted until end of activation; +2 heat.');
  assert.equal(heat, 2);                       // +2 tow heat
  assert.equal(ball.towedThisActivation, true); // rooted
  assert.equal(ball.towChainCooldownUntil, 4);  // round 1 + 3

  // Recharging (round below the cooldown) → hit lands but no fling, no heat, no root.
  const ball2 = makeRig(3, "WB2", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "tow-chain" });
  ball2.towChainCooldownUntil = 5;
  const t2 = makeRig(4, "T2", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  let heat2 = 0;
  const ctx2 = { ...makeCtx(), bumpHeat: (rig, n) => { if (rig === ball2) heat2 += n; } };
  resolveAttack({ rigs: [ball2, t2], game: { round: 1 } }, ball2, t2, { ...opts, target: t2.name }, () => 0, ctx2);
  assert.ok(!ctx2.resolutions.some((r) => /Tow Chain — fling/.test(r.summary)));
  assert.equal(heat2, 0);
  assert.equal(ball2.towedThisActivation, false);

  // Moved but whiffed (no damaging hit) → no fling.
  const ball3 = makeRig(5, "WB3", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "tow-chain" });
  const t3 = makeRig(6, "T3", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const ctx3 = makeCtx();
  resolveAttack({ rigs: [ball3, t3], game: { round: 1 } }, ball3, t3,
    { weapon: "melee", target: t3.name, arc: "front", range: "near", dice: { toHit: [1], location: 1 } }, () => 0, ctx3);
  assert.ok(!ctx3.resolutions.some((r) => /Tow Chain — fling/.test(r.summary)));
  assert.equal(ball3.towChainCooldownUntil, 0); // never charged/spent
});

test("Harpoon Winch: a damaging hit emits a reel instruction, roots + heats the attacker, sets cooldown", () => {
  const rig = makeRig(1, "Reeler", "light", "a", { longRange: "Harpoon", melee: "Anchor", longRangeUpgrade: "harpoon-winch" });
  const target = makeRig(2, "Prey", "light", "b", { longRange: "Harpoon", melee: "Anchor" });
  const ctx = makeCtx();
  const room = { rigs: [rig, target], game: { round: 2 } };
  resolveAttack(room, rig, target, {
    weapon: "longRange", target: "Prey", arc: "front", distance: 10,
    dice: { toHit: [6], impacts: [6], location: 1 },
  }, () => 0, ctx);
  assert.equal(rig.towedThisActivation, true);
  assert.equal(rig.harpoonWinchCooldownUntil, 5); // round 2 + 3
  const reel = ctx.resolutions.some((e) => /reel/i.test(e.summary || ""));
  assert.equal(reel, true);
});

test("Kneecapper tags the raked limb on a damaging hit; a non-kneecapper Double MG does not", () => {
  const attacker = makeRig(1, "K", "medium", "a", { longRange: "Double MG", melee: "Sword", longRangeUpgrade: "kneecapper" });
  const target = makeRig(2, "T", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target] };
  const ctx = {
    ...makeCtx(),
    applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); },
  };
  resolveAttack(room, attacker, target,
    { weapon: "longRange", arc: "front", range: "near", aimed: true, aimedLoc: "legs",
      dice: { toHit: [6], impacts: [6], ap: [1] } }, () => 0, ctx);
  assert.equal(target.kneecapped.legs, true);
  assert.notEqual(target.kneecapped.arms, true); // only the raked limb is tagged

  // A plain Pinning-Burst Double MG (no kneecapper) tags nothing; on the front
  // arc its Raking Fire even auto-fails, but the point is: no kneecapped tag.
  const plain = makeRig(3, "P", "medium", "a", { longRange: "Double MG", melee: "Sword", longRangeUpgrade: "pinning-burst" });
  const target2 = makeRig(4, "T2", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room2 = { rigs: [plain, target2] };
  const ctx2 = { ...makeCtx(), applyDamage: (rm, t, loc, sp) => { t[loc].sp = Math.max(0, t[loc].sp - sp); } };
  resolveAttack(room2, plain, target2,
    { weapon: "longRange", arc: "side", range: "near", aimed: true, aimedLoc: "legs",
      dice: { toHit: [6], impacts: [6], ap: [1] } }, () => 0, ctx2);
  assert.deepEqual(target2.kneecapped, {}); // untagged by an ordinary weapon
});

test("Taut Cable: +3 STR vs an immobilised or engaged target, else nothing", () => {
  const harpoon = { ...WEAPONS.longRange["Harpoon"], upgradeEffect: { vsPinned: true } };
  const attacker = { weightClass: "medium" };
  // base STR 12, medium weight mod 0
  assert.equal(computeStr(attacker, harpoon, { target: { weightClass: "light" } }), 12);
  assert.equal(computeStr(attacker, harpoon, { target: { weightClass: "light", immobilised: true } }), 15);
  assert.equal(computeStr(attacker, harpoon, { target: { weightClass: "light", engagedWith: 7 } }), 15);
});

test("applyDefensiveReactions is an identity pass-through for a defender with no reactive gear", () => {
  const target = { weightClass: "medium" }; // no equipment, no equipState
  const hit = { die: 5, total: 12, tier: "direct", sp: 1, kind: "impact" };
  const out = applyDefensiveReactions(target, hit, { location: "hull", row: null });
  assert.deepEqual(out, hit);
});

test("Reactive Armor hardens the struck location on the first damaging hit each round, softening severity across a band (−2 impact)", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const plain = { weightClass: "medium", hardened: false, preparation: null };
  const reactive = {
    weightClass: "medium", hardened: false, preparation: null,
    equipment: "ablative-plating", equipmentUpgrade: "reactive-armor",
    equipState: { reactiveArmorLocs: [] },
  };
  // d6=6 → plain hull total = 6 + 8 + 0(front) = 14. Medium hull bands are
  // direct:11, severe:14, critical:17 (shared/unit-kinds.js), so 14 resolves
  // to severe (sp 2). The −2 softening drops it to 12, which falls in the
  // direct band [11,14): sp 1. The totals straddle the severe/direct boundary,
  // so this proves the hit was actually mitigated — not just that `total` moved
  // by 2 while sp/tier stayed identical.
  const outPlain = rollImpacts({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [6] }, () => 0);
  const outReactive = rollImpacts({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [6] }, () => 0);
  assert.equal(outPlain[0].total, 14);
  assert.equal(outPlain[0].sp, 2);
  assert.equal(outPlain[0].tier, "severe");
  assert.equal(outReactive[0].total, 12);
  assert.equal(outReactive[0].sp, 1);
  assert.equal(outReactive[0].tier, "direct");
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull"]); // that location is now hardened

  // A second volley to the SAME hardened location still softens (sp/tier stay
  // dropped, not just total) and does not re-record the location.
  const outReactive2 = rollImpacts({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [6] }, () => 0);
  assert.equal(outReactive2[0].sp, 1);
  assert.equal(outReactive2[0].tier, "direct");
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull"]); // no duplicate
});

test("Reactive Armor independently hardens a second, different location (reactiveArmorLocs holds multiple entries)", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // STR 8 medium
  const plain = { weightClass: "medium", hardened: false, preparation: null };
  const reactive = {
    weightClass: "medium", hardened: false, preparation: null,
    equipment: "ablative-plating", equipmentUpgrade: "reactive-armor",
    equipState: { reactiveArmorLocs: [] },
  };
  // First damaging hit hardens "hull" only.
  rollImpacts({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [6] }, () => 0);
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull"]);

  // A first damaging hit to a DIFFERENT location ("legs") is independently
  // recorded AND softened too — proves reactiveArmorLocs is a per-location list,
  // not a single "already reacted this round" flag.
  // d6=6 → plain legs total = 6 + 8 + 0(front) = 14. Medium legs bands are
  // direct:11, severe:13, critical:15 (shared/unit-kinds.js): 14 → severe
  // (sp 2); softened to 12 → direct band [11,13): sp 1.
  const outPlainLegs = rollImpacts({ weightClass: "medium" }, plain, auto, "legs",
    { arc: "front", hits: 1 }, { impacts: [6] }, () => 0);
  const outReactiveLegs = rollImpacts({ weightClass: "medium" }, reactive, auto, "legs",
    { arc: "front", hits: 1 }, { impacts: [6] }, () => 0);
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull", "legs"]); // both tracked
  assert.equal(outPlainLegs[0].sp, 2);
  assert.equal(outPlainLegs[0].tier, "severe");
  assert.equal(outReactiveLegs[0].total, 12);
  assert.equal(outReactiveLegs[0].sp, 1);
  assert.equal(outReactiveLegs[0].tier, "direct");
});

test("Reactive Armor does not fire for a rig carrying only the base Ablative Plating", () => {
  const auto = WEAPONS.longRange["Autocannon"];
  const base = {
    weightClass: "medium", hardened: false, preparation: null,
    equipment: "ablative-plating", equipmentUpgrade: "reinforced-plating",
    equipState: { reactiveArmorLocs: [] },
  };
  const out = rollImpacts({ weightClass: "medium" }, base, auto, "hull",
    { arc: "front", hits: 1 }, { impacts: [5] }, () => 0);
  assert.equal(out[0].total, 13);                          // no reactive dock
  assert.deepEqual(base.equipState.reactiveArmorLocs, []);  // nothing hardened
});

// Ablative Cascade (Ablative Plating, Prototype). NOTE: the plan's fixtures were
// drafted against a hypothetical seam (nested `hit.impact`, `ctx.bumpHeat`); the
// live Plan-2 seam is flat (`hit.tier`/`hit.sp`/`kind:"impact"`) and injects heat
// via `ctx.spendHeat(n)`. These tests target the real seam.
test("Ablative Cascade: spends a charge to soften a Critical to Severe, at +1 heat", () => {
  const target = {
    weightClass: "medium", equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
    equipState: { ablativeCharges: 2 },
  };
  let heated = 0;
  const ctx = { location: "hull", row: null, spendHeat: (n) => { heated += n; } };
  const hit = { die: 6, total: 18, tier: "critical", sp: 3, kind: "impact" };
  const out = applyDefensiveReactions(target, hit, ctx);
  assert.equal(out.tier, "severe");                        // softened one step
  assert.equal(out.sp, 2);
  assert.equal(target.equipState.ablativeCharges, 1);      // one charge spent
  assert.equal(heated, 1);                                 // +1 heat per spend
});

test("Ablative Cascade: softens Severe→Direct and Direct→negated, one step per spend", () => {
  const mk = () => ({
    weightClass: "medium", equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
    equipState: { ablativeCharges: 2 },
  });
  const noop = { location: "hull", row: null, spendHeat: () => {} };
  const sev = applyDefensiveReactions(mk(), { die: 5, total: 14, tier: "severe", sp: 2, kind: "impact" }, noop);
  assert.equal(sev.tier, "direct"); assert.equal(sev.sp, 1);
  const dir = applyDefensiveReactions(mk(), { die: 3, total: 11, tier: "direct", sp: 1, kind: "impact" }, noop);
  assert.equal(dir.tier, "none"); assert.equal(dir.sp, 0);
});

test("Ablative Cascade: with no charges left, the hit lands full", () => {
  const target = {
    weightClass: "medium", equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
    equipState: { ablativeCharges: 0 },
  };
  let heated = 0;
  const hit = { die: 6, total: 18, tier: "critical", sp: 3, kind: "impact" };
  const out = applyDefensiveReactions(target, hit, { location: "hull", row: null, spendHeat: (n) => { heated += n; } });
  assert.equal(out.tier, "critical");                      // untouched
  assert.equal(out.sp, 3);
  assert.equal(heated, 0);                                 // no heat when nothing spent
});

test("Ablative Cascade: a zero-damage impact never spends a charge (gated on hit.sp > 0)", () => {
  const target = {
    weightClass: "medium", equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
    equipState: { ablativeCharges: 2 },
  };
  let heated = 0;
  const hit = { die: 1, total: 5, tier: "none", sp: 0, kind: "impact" };
  const out = applyDefensiveReactions(target, hit, { location: "hull", row: null, spendHeat: (n) => { heated += n; } });
  assert.equal(out.sp, 0);
  assert.equal(target.equipState.ablativeCharges, 2);      // charge untouched
  assert.equal(heated, 0);
});
