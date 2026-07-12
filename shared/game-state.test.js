import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, makeRig, makeUnit, claimSide, applyCommand, findRig,
  normalizeWeapon, WEAPONS, formatBattleState, publicState, __test,
  EQUIPMENT, EQUIPMENT_ACTIVE_BY_KEY, normalizeEquipment, WEAPON_UPGRADES,
  EQUIPMENT_UPGRADES, equipmentUpgradeNature, firstEquipmentUpgradeId,
  normalizeEquipmentUpgrade, equipmentActiveHeat,
  equipmentSprintHeat, equipmentRepairBonus,
  normalizeWeaponUpgrade, upgradeForWeapon, defaultWeaponUpgrade,
  effectiveWeaponProfile, normalizePrep, hasBulwarkShield, shieldCoverage,
  normalizeAnswerPrep, ANSWER_COUNTERS,
  UNIT_WEAPONS, normalizeUnitWeapon,
  randomRigWeapons, randomEquipment,
  NATURES, upgradeNature, countPrototypes,
  chassisById, resolveChassis, SEED_ROSTER, CHASSIS,
  heatMeter,
} from "./game-state.js";

// Every Rig must be commissioned with one Long Range and one Melee weapon,
// so the add-command attrs used across these tests carry both.
const W = { lr: "Mini Gun", melee: "Sword" };

test("createRoom has two unclaimed sides and empty rigs", () => {
  const r = createRoom("IRON42");
  assert.equal(r.code, "IRON42");
  assert.equal(r.version, 0);
  assert.equal(r.rigs.length, 0);
  assert.deepEqual(r.game.sides.map((s) => s.id), ["a", "b"]);
  assert.equal(r.game.sides.every((s) => !s.claimed), true);
  assert.equal(r.game.round, 1);
});

test("claimSide takes the first free side and bumps version", () => {
  const r = createRoom("X");
  const first = claimSide(r, { name: "Ana" });
  assert.equal(first, "a");
  assert.equal(r.game.sides[0].name, "Ana");
  assert.equal(r.game.sides[0].claimed, true);
  assert.equal(r.version, 1);
  const second = claimSide(r, { name: "Bo" });
  assert.equal(second, "b");
  const third = claimSide(r, { name: "Cy" });
  assert.equal(third, null); // room full
});

test("claimSide reclaims a requested side without consuming the other slot", () => {
  const r = createRoom("X");
  assert.equal(claimSide(r, { name: "Ana", side: "a" }), "a");
  const v = r.version;
  // Auto-rejoin as side a: same side back, no version churn, side b still free.
  assert.equal(claimSide(r, { name: "Ana", side: "a" }), "a");
  assert.equal(r.version, v);                    // idempotent — no bump
  assert.equal(r.game.sides[1].claimed, false);  // side b untouched
  // Someone deliberately takes side b.
  assert.equal(claimSide(r, { name: "Bo", side: "b" }), "b");
});

test("normalizeWeapon resolves case-insensitively and rejects unknown", () => {
  assert.equal(normalizeWeapon("longRange", "mini gun"), "Mini Gun");
  assert.equal(normalizeWeapon("melee", "  SWORD "), "Sword");
  assert.equal(normalizeWeapon("longRange", "Sword"), null);   // wrong category
  assert.equal(normalizeWeapon("melee", "Death Ray"), null);   // not a weapon
  assert.equal(normalizeWeapon("longRange", ""), null);
  assert.equal(Object.keys(WEAPONS.longRange).length, 11);
  assert.equal(Object.keys(WEAPONS.melee).length, 11);
});

test("WEAPONS carries full combat profiles keyed by canonical name", () => {
  assert.equal(Object.keys(WEAPONS.longRange).length, 11);
  assert.equal(Object.keys(WEAPONS.melee).length, 11);
  assert.equal(WEAPONS.longRange["Mini Gun"].rof, 8);
  assert.equal(WEAPONS.longRange["Mini Gun"].str, 4);
  assert.equal(WEAPONS.longRange["Mini Gun"].sweet, 7);
  assert.equal(WEAPONS.longRange["Mini Gun"].peak, 2);
  assert.equal(WEAPONS.longRange["Mini Gun"].dropoff, 0.35);
  assert.equal(WEAPONS.longRange["Mini Gun"].minRange, 0);
  assert.equal(WEAPONS.longRange["Mini Gun"].maxRange, 18);
  assert.equal(WEAPONS.longRange["Mini Gun"].acc, undefined);
  assert.equal(WEAPONS.longRange["Mini Gun"].rng, undefined);
  // Machine guns carry Raking Fire innately (it defines the type, not a
  // signature upgrade); every other base weapon is stat-only. Ranged carry no
  // melee flag.
  assert.deepEqual(WEAPONS.longRange["Mini Gun"].perks, ["Raking Fire"]);
  assert.deepEqual(WEAPONS.longRange["Double MG"].perks, ["Raking Fire"]);
  assert.equal(WEAPONS.longRange["Mini Gun"].melee, undefined);
  assert.equal(WEAPONS.melee["Lance"].str, 11);
  assert.equal(WEAPONS.melee["Sword"].melee, true);
  assert.equal(WEAPONS.melee["Sword"].perks, undefined);
});

test("makeRig honours a per-rig SP override, else falls back to class defaults", () => {
  // Default (no sp): medium class defaults 7/6/6/5.
  const def = makeRig(1, "Default", "medium", "a", { lr: "Sniper Cannon", melee: "Chainsaw" });
  assert.equal(def.hull.max, 7);
  assert.equal(def.engine.max, 5);

  // Override: the chassis-style sp wins field-by-field.
  const custom = makeRig(2, "Tanky", "medium", "a", {
    lr: "Siege Maul", melee: "Bulwark Shield", sp: { hull: 16, arms: 13, legs: 12, engine: 11 },
  });
  assert.equal(custom.hull.max, 16);
  assert.equal(custom.hull.sp, 16);
  assert.equal(custom.arms.max, 13);
  assert.equal(custom.legs.max, 12);
  assert.equal(custom.engine.max, 11);

  // Ablative Plating still adds its +1 Hull on top of the override.
  const plated = makeRig(3, "Plated", "medium", "a", {
    lr: "Siege Maul", melee: "Bulwark Shield", sp: { hull: 16, arms: 13, legs: 12, engine: 11 },
  }, "ablative-plating");
  assert.equal(plated.hull.max, 17);
});

test("makeRig stamps equipmentUpgradeEffect from the catalog (single source of truth)", () => {
  // A resolved upgrade copies its catalog `effect` object onto the rig so combat
  // reads the magnitude from data, not a hardcoded id-check.
  const reinforced = makeRig(1, "Bulwark", "medium", "a",
    { longRange: "Autocannon", melee: "Sword" }, "ablative-plating", "reinforced-plating");
  assert.equal(reinforced.equipmentUpgradeEffect.hardenImpact, 2);
  // No upgrade → empty object (never null), so combat's `?.tag ?? default` reads
  // land on the base path.
  const bare = makeRig(2, "Plain", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  assert.deepEqual(bare.equipmentUpgradeEffect, {});
});

test("makeUnit stores the chassis id on the rig (for its flavor description)", () => {
  const rig = makeUnit("rig", 1, "Vulcan", "a", {
    weightClass: "light", longRange: "Autocannon", melee: "Claw", chassis: "light-claw-autocannon",
  });
  assert.equal(rig.chassis, "light-claw-autocannon");
  const bare = makeRig(2, "Plain", "medium", "a", { lr: "Sniper Cannon", melee: "Chainsaw" });
  assert.equal(bare.chassis, null);
  const tank = makeUnit("tank", 3, "T", "a", { unit: "Tank Cannon" });
  assert.equal(tank.chassis, null);
});

test("makeUnit threads the sp override through to the rig", () => {
  const rig = makeUnit("rig", 9, "Sniper", "a", {
    weightClass: "medium", longRange: "Sniper Cannon", melee: "Chainsaw",
    sp: { hull: 12, arms: 11, legs: 11, engine: 9 },
  });
  assert.equal(rig.hull.max, 12);
  assert.equal(rig.engine.max, 9);
});

test("new weapons: Siege Maul and Bulwark Shield are in the universal list", () => {
  const maul = WEAPONS.longRange["Siege Maul"];
  assert.deepEqual(maul, { rof: 1, str: 13, sweet: 8, peak: 1, dropoff: 0.30, minRange: 0, maxRange: 16 });

  const shield = WEAPONS.melee["Bulwark Shield"];
  assert.deepEqual(shield, { rof: 1, str: 6, acc: [0, 0], rng: [2, 2], melee: true });

  // The list is now 10 + 10.
  assert.equal(Object.keys(WEAPONS.longRange).length, 11);
  assert.equal(Object.keys(WEAPONS.melee).length, 11);
});

test("new weapons: Harpoon, Anchor, Rivet Gun, Pressure Claw carry full profiles", () => {
  assert.deepEqual(WEAPONS.longRange["Harpoon"],
    { rof: 1, str: 12, sweet: 14, peak: 2, dropoff: 0.28, minRange: 0, maxRange: 22 });
  assert.deepEqual(WEAPONS.melee["Anchor"],
    { rof: 1, str: 12, acc: [0, 0], rng: [2, 2], melee: true });
  assert.deepEqual(WEAPONS.longRange["Rivet Gun"],
    { rof: 6, str: 4, sweet: 6, peak: 2, dropoff: 0.40, minRange: 0, maxRange: 14 });
  assert.deepEqual(WEAPONS.melee["Pressure Claw"],
    { rof: 2, str: 9, acc: [1, 1], rng: [2, 2], melee: true });
  assert.equal(Object.keys(WEAPONS.longRange).length, 11);
  assert.equal(Object.keys(WEAPONS.melee).length, 11);
});

test("new weapon upgrades resolve through effectiveWeaponProfile", () => {
  assert.equal(WEAPON_UPGRADES["Siege Maul"].length, 3);
  assert.equal(WEAPON_UPGRADES["Bulwark Shield"].length, 3);

  // Reinforced Head is the default (first) Siege Maul upgrade: +2 STR.
  const headed = makeRig(1, "Breaker", "medium", "a",
    { longRange: "Siege Maul", melee: "Sword" });
  assert.equal(headed.weaponUpgrades.longRange, "reinforced-head");
  assert.equal(effectiveWeaponProfile("longRange", "Siege Maul", headed).str, 15); // 13 base + 2

  // Breaching Round marks onDamage.
  const breach = makeRig(2, "Breaker2", "medium", "a",
    { longRange: "Siege Maul", melee: "Sword", lrUpgrade: "breaching-round" });
  assert.equal(effectiveWeaponProfile("longRange", "Siege Maul", breach).upgradeEffect.onDamage, "breaching-round");

  // Anvil Boss is a valid non-Tower-Shield melee upgrade; Tower Shield is the default.
  const anvil = makeRig(3, "Guard", "medium", "a",
    { longRange: "Autocannon", melee: "Bulwark Shield", meleeUpgrade: "anvil-boss" });
  assert.equal(effectiveWeaponProfile("melee", "Bulwark Shield", anvil).upgrade.id, "anvil-boss");
  assert.equal(makeRig(4, "Guard2", "medium", "a",
    { longRange: "Autocannon", melee: "Bulwark Shield" }).weaponUpgrades.melee, "tower-shield");
});

test("NATURES lists the three upgrade natures in order", () => {
  assert.deepEqual(NATURES, ["field", "tuned", "prototype"]);
});

test("every WEAPON_UPGRADES entry declares a valid nature", () => {
  for (const [weapon, ups] of Object.entries(WEAPON_UPGRADES)) {
    for (const u of ups) {
      assert.ok(NATURES.includes(u.nature), `${weapon}/${u.id} nature=${u.nature}`);
    }
  }
});

test("every weapon offers exactly one upgrade of each nature", () => {
  for (const [weapon, ups] of Object.entries(WEAPON_UPGRADES)) {
    assert.equal(ups.length, 3, `${weapon} has ${ups.length} upgrades`);
    const natures = ups.map((u) => u.nature).sort();
    assert.deepEqual(natures, ["field", "prototype", "tuned"], `${weapon} natures`);
  }
});

test("countPrototypes counts prototype picks across a rig's two upgrades", () => {
  // Autocannon penetrator-rounds is prototype; depleted-core is field.
  assert.equal(countPrototypes({ longRange: "Autocannon", melee: "Claw" },
    { longRange: "penetrator-rounds", melee: "breach-grip" }), 2);
  assert.equal(countPrototypes({ longRange: "Autocannon", melee: "Claw" },
    { longRange: "penetrator-rounds", melee: "vice-grip" }), 1);
  assert.equal(countPrototypes({ longRange: "Autocannon", melee: "Claw" },
    { longRange: "depleted-core", melee: "vice-grip" }), 0);
});

test("countPrototypes counts an equipment Prototype", () => {
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" },
    { longRange: "fletched-bolts", melee: "honed-talons" },
    "ablative-plating", "reinforced-plating"), 0);
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" },
    { longRange: "fletched-bolts", melee: "honed-talons" },
    "ablative-plating", "ablative-cascade"), 1);
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" },
    { longRange: "pinning-bolt", melee: "honed-talons" },
    "ablative-plating", "ablative-cascade"), 2);
  assert.equal(countPrototypes(
    { longRange: "Crossbow", melee: "Talon" },
    { longRange: "pinning-bolt", melee: "honed-talons" }), 1);
});

test("normalizePrep gates raise-shield to Bulwark Shield rigs", () => {
  const shieldRig = { weapons: { melee: "Bulwark Shield" }, weaponUpgrades: { melee: "tower-shield" } };
  const swordRig = { weapons: { melee: "Sword" } };

  assert.equal(normalizePrep("raise-shield", shieldRig), "raise-shield");
  assert.equal(normalizePrep("raise-shield", swordRig), "brace"); // not allowed -> fallback
  assert.equal(normalizePrep("raise-shield"), "brace");           // no rig -> fallback
  assert.equal(normalizePrep("brace", shieldRig), "brace");       // existing preps unaffected
  assert.equal(normalizePrep("bogus", shieldRig), "brace");
});

test("normalizeAnswerPrep accepts the three Answer counters; normalizePrep rejects them", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  for (const t of ["riposte", "sidestep", "exploit"]) {
    assert.equal(normalizeAnswerPrep(t, rig), t);   // Answer path keeps it
    assert.equal(normalizePrep(t, rig), "brace");   // Prepare path falls back
  }
  // Generic three and shield still work on both where valid.
  assert.equal(normalizeAnswerPrep("evasive", rig), "evasive");
  assert.deepEqual(ANSWER_COUNTERS, ["riposte", "sidestep", "exploit"]);
});

test("shieldCoverage depends on the Tower Shield upgrade", () => {
  const base = { weapons: { melee: "Bulwark Shield" }, weaponUpgrades: { melee: "anvil-boss" } };
  const tower = { weapons: { melee: "Bulwark Shield" }, weaponUpgrades: { melee: "tower-shield" } };

  assert.deepEqual(shieldCoverage(base), { negate: ["front"], blunt: ["side", "rear"] });
  assert.deepEqual(shieldCoverage(tower), { negate: ["front", "side"], blunt: ["rear"] });
  assert.equal(hasBulwarkShield(base), true);
  assert.equal(hasBulwarkShield({ weapons: { melee: "Sword" } }), false);
});

test("a Bulwark Shield rig can arm Raise Shield; others fall back to brace", () => {
  const r = createRoom("SHLD");
  applyCommand(r, { verb: "add", attrs: { name: "Guard", class: "medium", owner: "a", longRange: "Autocannon", melee: "Bulwark Shield" } });
  applyCommand(r, { verb: "add", attrs: { name: "Grunt", class: "medium", owner: "a", longRange: "Autocannon", melee: "Sword" } });

  // Answer-token arming path (poke a token in; no full activation needed).
  r.game.answerTokens.a = 2;
  applyCommand(r, { verb: "answer", attrs: { name: "Guard", prep: "raise-shield", side: "a" } });
  assert.equal(findRig(r, "Guard").preparation.type, "raise-shield");

  applyCommand(r, { verb: "answer", attrs: { name: "Grunt", prep: "raise-shield", side: "a" } });
  assert.equal(findRig(r, "Grunt").preparation.type, "brace"); // gated -> fallback
});

test("Breaching Round locks Hull repair for two Recovery Phases", () => {
  const rig = makeRig(1, "Fort", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  rig.hull.sp = 3;

  // Simulate a breach: the countdown is set to 2 (this round + next).
  __test.breachHull(rig);
  assert.equal(rig.hullRepairLock, 2);

  // Repair action / Emergency Patch cannot restore the Hull while locked.
  __test.repairRig(rig, "hull", 2);
  assert.equal(rig.hull.sp, 3); // unchanged

  // Non-hull repairs still work while the Hull is locked.
  rig.legs.sp = 2;
  __test.repairRig(rig, "legs", 1);
  assert.equal(rig.legs.sp, 3);

  // Each Recovery Phase ticks the lock down; after two it clears.
  __test.tickBreach(rig); assert.equal(rig.hullRepairLock, 1);
  __test.repairRig(rig, "hull", 2); assert.equal(rig.hull.sp, 3); // still locked at 1
  __test.tickBreach(rig); assert.equal(rig.hullRepairLock, 0);
  __test.repairRig(rig, "hull", 2); assert.equal(rig.hull.sp, 5); // now repairs
});

test("makeRig requires a supported class, one valid long-range and one valid melee weapon", () => {
  const ok = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  assert.equal(ok.weapons.longRange, "Autocannon");
  assert.equal(ok.weapons.melee, "Claw");
  assert.equal(makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon" }), null); // no melee
  assert.equal(makeRig(1, "Warden", "medium", "a", {}), null);                          // neither
  assert.equal(makeRig(1, "Warden", "medium", "a", { longRange: "Nope", melee: "Claw" }), null);
  assert.equal(makeRig(1, "Warden", "heavy", "a", { longRange: "Autocannon", melee: "Claw" }), null);
  assert.equal(makeRig(1, "Warden", "colossal", "a", { longRange: "Autocannon", melee: "Claw" }), null);
});

test("ensureRigShape backfills speed from the chassis id on reload", () => {
  // Simulate an old saved rig that predates the speed field.
  const rig = makeRig(1, "OldSave", "medium", "a", {
    longRange: "Crossbow", melee: "Talon", chassis: "medium-crossbow-talon",
  });
  delete rig.speed;
  const room = createRoom("r");
  room.rigs.push(rig);
  __test.ensureRigShape(rig);
  assert.equal(rig.speed, 4);
});

test("add assigns owner, weapons and default SP; damage respects the floor", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", owner: "b", ...W } });
  const rig = findRig(r, "warden");
  assert.equal(rig.owner, "b");
  assert.equal(rig.hull.max, 7);
  assert.equal(rig.weapons.longRange, "Mini Gun");
  assert.equal(rig.weapons.melee, "Sword");
  assert.equal(r.version, 1);
  applyCommand(r, { verb: "damage", attrs: { name: "Warden", loc: "hull", amount: "3" } });
  assert.equal(rig.hull.sp, 4);
  assert.equal(r.version, 2);
});

test("add without weapons is a no-op — no rig, no version bump, no id burn", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium" } });          // missing both
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", lr: "Mini Gun" } }); // missing melee
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", lr: "X", melee: "Y" } }); // invalid
  assert.equal(r.rigs.length, 0);
  assert.equal(r.version, 0);
  // The next valid add still gets id 1 — a rejected add must not consume an id.
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", ...W } });
  assert.equal(findRig(r, "Warden").id, 1);
  assert.equal(r.version, 1);
});

test("add blocks heavy and colossal for now without version bump or id burn", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Breaker", class: "heavy", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "Atlas", class: "colossal", ...W } });
  assert.equal(r.rigs.length, 0);
  assert.equal(r.version, 0);
  applyCommand(r, { verb: "add", attrs: { name: "Vela", class: "light", ...W } });
  assert.equal(findRig(r, "Vela").id, 1);
  assert.equal(r.version, 1);
});

test("add without owner uses the requesting side", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Reaver", class: "medium", ...W } }, { side: "b" });
  const rig = findRig(r, "Reaver");
  assert.equal(rig.owner, "b");
});

test("add blocks a fourth rig for the same side without version bump or id burn", () => {
  const r = createRoom("X");
  for (let i = 1; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `A${i}`, class: "light", owner: "a", ...W } });
  }
  const version = r.version;
  applyCommand(r, { verb: "add", attrs: { name: "A4", class: "light", owner: "a", ...W } });

  assert.equal(r.rigs.length, 3);
  assert.equal(findRig(r, "A4"), null);
  assert.equal(r.version, version);

  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "light", owner: "b", ...W } });
  assert.equal(findRig(r, "B1").id, 4);
  assert.equal(r.version, version + 1);
});

test("add blocks all new rigs once six rigs are in place", () => {
  const r = createRoom("X");
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  const version = r.version;

  applyCommand(r, { verb: "add", attrs: { name: "Overflow", class: "light", owner: "b", ...W } });

  assert.equal(r.rigs.length, 6);
  assert.equal(findRig(r, "Overflow"), null);
  assert.equal(r.version, version);
});

test("ready requires at least three rigs for that side", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "add", attrs: { name: "A1", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, false);

  applyCommand(r, { verb: "add", attrs: { name: "A2", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "A3", class: "light", owner: "a", ...W } });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);
});

test("adding or removing rigs before start resets ready flags", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  for (let i = 1; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `A${i}`, class: "light", owner: "a", ...W } });
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);

  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "light", owner: "b", ...W } });
  assert.equal(r.game.sides.every((s) => s.ready === false), true);

  applyCommand(r, { verb: "ready", attrs: { side: "a" } });
  applyCommand(r, { verb: "remove", attrs: { name: "B1" } });
  assert.equal(r.game.sides.every((s) => s.ready === false), true);
});

test("both ready starts game and assigns private random priorityTargets", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }

  const rolls = [0.99, 0];
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => rolls.shift() });

  assert.equal(r.game.started, true);
  assert.equal(r.game.priorityTargets.a, findRig(r, "b3").id);
  assert.equal(r.game.priorityTargets.b, findRig(r, "a1").id);
});

test("public state only exposes the requesting side bounty", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });

  assert.deepEqual(Object.keys(publicState(r, "a").game.priorityTargets), ["a"]);
  assert.deepEqual(Object.keys(publicState(r, "b").game.priorityTargets), ["b"]);
  assert.equal(publicState(r, "a").game.priorityTargets.b, undefined);
  assert.equal(publicState(r, "b").game.priorityTargets.a, undefined);
});

test("rerollPriorityTargets picks a living enemy and skips destroyed rigs", () => {
  const r = startedRoom();
  const [b1, b2, b3] = ["b1", "b2", "b3"].map((id) => findRig(r, id));
  b1.destroyed = true; // dead — must be skipped
  __test.rerollPriorityTargets(r, () => 0); // 0 picks the first LIVING enemy of "a"
  const targetA = r.game.priorityTargets.a;
  assert.ok(targetA === b2.id || targetA === b3.id, "target is a living enemy");
  assert.notEqual(targetA, b1.id, "destroyed rig never chosen");
});

test("advanceRound re-rolls each side's Priority Target to a living enemy", () => {
  const r = startedRoom();
  r.game.round = 3;
  __test.advanceRound(r);
  const livingEnemiesOfA = r.rigs
    .filter((x) => (x.owner || "a") === "b" && !x.destroyed)
    .map((x) => x.id);
  assert.ok(livingEnemiesOfA.includes(r.game.priorityTargets.a));
});

test("engine heat cannot cool below 3 once catastrophic; recovery-less heat math", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "S", class: "light", ...W } });
  applyCommand(r, { verb: "set", attrs: { name: "S", loc: "engine", sp: "0" } });
  const rig = findRig(r, "S");
  assert.equal(rig.engine.heat >= 3, true);
  applyCommand(r, { verb: "heat", attrs: { name: "S", amount: "0" } }); // try to vent
  assert.equal(rig.engine.heat, 3);
});

test("unknown verb and unknown rig are no-ops (no version bump)", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "nonsense", attrs: {} });
  applyCommand(r, { verb: "damage", attrs: { name: "ghost", loc: "hull", amount: "1" } });
  assert.equal(r.version, 0);
});

test("formatBattleState reports round, sides and owned rigs with weapons", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Ana" });
  applyCommand(r, { verb: "add", attrs: { name: "Warden", class: "medium", owner: "a", ...W } });
  const out = formatBattleState(r);
  assert.match(out, /CURRENT BATTLE STATE/);
  assert.match(out, /Round 1\/5/);
  assert.match(out, /Ana \(a\) VP 0/);
  assert.match(out, /Warden \(medium, owner a\).*hull 7\/7/);
  assert.match(out, /Mini Gun/);
  assert.match(out, /Sword/);
});

test("publicState omits nextRigId bookkeeping", () => {
  const r = createRoom("X");
  const view = publicState(r);
  assert.equal(view.nextRigId, undefined);
  assert.equal(view.code, "X");
  assert.ok(Array.isArray(view.rigs));
});

test("new rigs carry activation/heat-effect defaults", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "S", class: "light", ...W } });
  const rig = findRig(r, "S");
  assert.equal(rig.activated, false);
  assert.equal(rig.skipNextActivation, false);
  assert.equal(rig.noCool, false);
  assert.equal(rig.speedHalvedNextRound, false);
  assert.deepEqual(rig.loaded, { longRange: true, melee: true });
  assert.equal(rig.preparation, null);
  assert.deepEqual(rig.weaponsDestroyed, []);
  assert.equal(rig.immobilised, false);
  // Enfilade (§13, Sniper Cannon) — per-rig aimed-shot cadence counter starts at 0.
  assert.equal(rig.enfiladeShots, 0);
});

test("createRoom game carries round-loop defaults", () => {
  const r = createRoom("X");
  assert.equal(r.game.autoResolve, true);
  assert.equal(r.game.phase, "setup");
  assert.deepEqual(r.game.deployOrder, []);
  assert.equal(r.game.initiative, null);
  assert.deepEqual(r.game.answerTokens, { a: 0, b: 0 });
  assert.equal(r.game.turn, null);
  assert.deepEqual(r.game.resolutions, []);
  assert.equal(r.game.outcome, null);
});

test("ensureGameShape backfills fields on a legacy room", () => {
  const legacy = { code: "L", version: 0, nextRigId: 2, game: { round: 1, started: false },
    rigs: [{ id: 1, name: "Old", weightClass: "light", owner: "a",
      hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
      legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
      weapons:{longRange:"Mini Gun",melee:"Sword"}, destroyed:false }] };
  applyCommand(legacy, { verb: "nonsense", attrs: {} });
  assert.equal(legacy.game.autoResolve, true);
  assert.equal(legacy.game.phase, "setup");
  assert.equal(legacy.rigs[0].activated, false);
  assert.deepEqual(legacy.rigs[0].loaded, { longRange: true, melee: true });
});

// Helper: stand up a started 3v3 battle. Side "a" readies first (deploys first),
// so "a" activates SECOND in round 1 and "b" activates first.
function startedRoom() {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  return r;
}

test("setdice toggles autoResolve only before the game starts", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "setdice", attrs: { value: "manual" } });
  assert.equal(r.game.autoResolve, false);
  applyCommand(r, { verb: "setdice", attrs: { value: "auto" } });
  assert.equal(r.game.autoResolve, true);
});

test("setdice is a no-op once started", () => {
  const r = startedRoom();
  const v = r.version;
  applyCommand(r, { verb: "setdice", attrs: { value: "manual" } });
  assert.equal(r.game.autoResolve, true);
  assert.equal(r.version, v);
});

test("starting the game seeds round 1 initiative from deploy order", () => {
  const r = startedRoom();
  assert.equal(r.game.phase, "activation");
  assert.equal(r.game.round, 1);
  assert.deepEqual(r.game.initiative.order, ["b", "a"]);
  assert.equal(r.game.initiative.second, "a");
  assert.equal(r.game.answerTokens.a, 1);
  assert.equal(r.game.answerTokens.b, 0);
  assert.equal(r.game.turn.side, "b");
  assert.equal(r.game.turn.activeRigId, null);
});

test("second player gets a blocking answer gate that clears when the token is spent", () => {
  const r = startedRoom(); // "a" is second and holds 1 token; turn.side === "b"
  assert.deepEqual(r.game.pendingAnswer, { side: "a", remaining: 1 });

  // First player cannot start activating while the gate is up.
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.activeRigId, null);

  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  assert.equal(r.game.pendingAnswer, null);

  // Gate cleared — activation works again.
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.activeRigId, findRig(r, "b1").id);
});

test("initiative verb rolls D12 for both sides and higher goes first", () => {
  const r = startedRoom();
  r.game.phase = "initiative";
  r.game.round = 2;
  r.game.initiative = null;
  applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
  assert.deepEqual(r.game.initiative.order, ["a", "b"]);
  assert.equal(r.game.initiative.second, "b");
  assert.equal(r.game.answerTokens.b, 1);
  assert.equal(r.game.phase, "activation");
  assert.equal(r.game.turn.side, "a");
});

test("initiative rerolls ties when rolling automatically", () => {
  const r = startedRoom();
  r.game.phase = "initiative"; r.game.round = 2; r.game.initiative = null;
  // random() sequence: a=6,b=6 (tie) -> reroll a=1,b=12 -> b first.
  const seq = [5 / 12, 5 / 12, 0 / 12, 11 / 12];
  applyCommand(r, { verb: "initiative", attrs: {} }, {}, { random: () => seq.shift() });
  assert.deepEqual(r.game.initiative.order, ["b", "a"]);
});

test("initiative verb only runs during the initiative phase", () => {
  const r = startedRoom(); // phase is "activation"
  const v = r.version;
  applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
  assert.equal(r.version, v);
});

test("activate opens the acting rig with a 3-action budget", () => {
  const r = startedRoom(); // turn.side === "b"
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.activeRigId, findRig(r, "b1").id);
  assert.equal(r.game.turn.actionsUsed, 0);
  assert.equal(r.game.turn.actionsMax, 3);
});

test("activate rejects the wrong side, a second rig mid-activation, and destroyed rigs", () => {
  const r = startedRoom(); // b's turn
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });   // not b's rig
  assert.equal(r.game.turn.activeRigId, null);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const first = r.game.turn.activeRigId;
  applyCommand(r, { verb: "activate", attrs: { name: "b2" } });   // one at a time
  assert.equal(r.game.turn.activeRigId, first);
});

test("Hull at 0 SP drops the action budget by 2", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "hull", sp: "0" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.actionsMax, 1); // base 3 − 2
});

test("engine reaching 0 SP flags the next activation as skipped", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "engine", sp: "0" } });
  assert.equal(findRig(r, "b1").skipNextActivation, true);
});

test("activating a skip-flagged rig burns the activation and hands off", () => {
  const r = startedRoom(); // b's turn
  clearPendingAnswer(r);
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "engine", sp: "0" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  assert.equal(b1.activated, true);
  assert.equal(b1.skipNextActivation, false);
  assert.equal(r.game.turn.activeRigId, null);
  assert.equal(r.game.turn.side, "a"); // handed off
});

test("actions add their heat and spend the budget", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "prepare" } });
  const b1 = findRig(r, "b1");
  assert.equal(b1.engine.heat, 2);            // move 1 + prepare 1
  assert.equal(r.game.turn.actionsUsed, 2);
});

test("Move may repeat within an activation, each spending a slot and adding heat", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } }); // slot 1, +1 heat
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } }); // slot 2, +1 heat
  const b1 = findRig(r, "b1");
  assert.equal(r.game.turn.actionsUsed, 2);
  assert.equal(b1.engine.heat, 2);            // heat corresponds to both Moves
});

test("Sprint may repeat within an activation, each spending a slot and +2 heat", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } }); // light, no Servo Actuators
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } }); // slot 1, +2 heat
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } }); // slot 2, +2 heat
  const b1 = findRig(r, "b1");
  assert.equal(r.game.turn.actionsUsed, 2);
  assert.equal(b1.engine.heat, 4);            // 2 + 2 — heat corresponds to both Sprints
});

test("Sprint then Move stack heat and slots (mixed movement in one activation)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } }); // +2 heat
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });   // +1 heat
  const b1 = findRig(r, "b1");
  assert.equal(r.game.turn.actionsUsed, 2);
  assert.equal(b1.engine.heat, 3);            // 2 + 1
});

test("Move sets movedThisActivation (Full Tilt/Momentum Swing's charge flag)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(findRig(r, "b1").movedThisActivation, false);
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(findRig(r, "b1").movedThisActivation, true);
});

test("Sprint sets movedThisActivation (Full Tilt/Momentum Swing's charge flag)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(findRig(r, "b1").movedThisActivation, false);
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } });
  assert.equal(findRig(r, "b1").movedThisActivation, true);
});

test("endActivation clears movedThisActivation (no stale charge into a reaction)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(findRig(r, "b1").movedThisActivation, true);
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(findRig(r, "b1").movedThisActivation, false);
});

test("activation start clears a stale movedThisActivation flag", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  // Simulate a lingering flag (belt-and-braces with the endActivation clear):
  // activating a rig must always open it uncharged.
  findRig(r, "b1").movedThisActivation = true;
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(findRig(r, "b1").movedThisActivation, false);
});

test("a burning rig loses `burning` SP to its Hull at activation start", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.burning = 2;
  const hullBefore = b1.hull.sp; // light hull = 6
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(b1.hull.sp, hullBefore - 2); // 2 SP burn damage to hull
  assert.equal(b1.burning, 2);              // burning persists until doused
});

test("douse spends an action and removes one burning stack", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.burning = 2;
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const usedBefore = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "douse" } });
  assert.equal(b1.burning, 1);                              // one stack cleared
  assert.equal(r.game.turn.actionsUsed, usedBefore + 1);    // costs one action slot
});

test("Suppression Lock's 3rd stack blocks Prepare during the pinned rig's activation", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.noPrepNextActivation = true; // simulates a Suppression Lock 3-stack landed on this rig
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const usedBefore = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "prepare", prep: "brace" } });
  assert.equal(b1.preparation, null);                       // Prepare refused
  assert.equal(r.game.turn.actionsUsed, usedBefore);        // no slot/heat spent on the refusal
});

test("noPrepNextActivation clears when the pinned rig's activation ends", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.noPrepNextActivation = true;
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "prepare", prep: "brace" } }); // refused
  assert.equal(b1.preparation, null);
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(b1.noPrepNextActivation, false);             // scoped to just the blocked activation
});

test("Suppression Lock's stack-3 pin (suppressImmobile) blocks Move/Sprint that round, then clears in Recovery", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.suppressImmobile = true; // simulates a Suppression Lock 3-stack pin landed on this rig
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const usedBefore = r.game.turn.actionsUsed;
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } });
  assert.equal(r.game.turn.actionsUsed, usedBefore);        // both movement actions refused
  assert.equal(b1.engine.heat, heatBefore);                 // no heat spent on the refusals

  __test.runRecovery(r);
  assert.equal(b1.suppressImmobile, false);                 // the pin lasts one round, then recovers
  assert.equal(b1.immobilised, false);                      // and never touched the permanent flag
});

// A started room whose b1 is a medium Siege Maul rig with a chosen Siege Maul
// upgrade (Bulwark Shield melee, so Raise Shield is available). Mirrors
// startedRoom's deploy/initiative so turn.side === "b" and b1 activates first.
function siegeRoom(lrUpgrade) {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "add", attrs: {
    name: "b1", class: "medium", owner: "b",
    longRange: "Siege Maul", melee: "Bulwark Shield", lrUpgrade,
  } });
  for (const owner of ["a", "b"]) {
    for (let i = owner === "b" ? 2 : 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, ...W } });
    }
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  return r;
}

test("a Piledriver rig gains 1 Momentum for an activation it advanced", () => {
  const r = siegeRoom("piledriver-protocol");
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  assert.equal(b1.momentum, 0);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(b1.momentum, 1);
});

test("Piledriver Momentum caps at 3 across activations", () => {
  const r = siegeRoom("piledriver-protocol");
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.momentum = 3; // already fully charged from prior advances
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(b1.momentum, 3); // capped — never 4
});

test("a Piledriver rig that did not advance gains no Momentum", () => {
  const r = siegeRoom("piledriver-protocol");
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "prepare", prep: "brace" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(b1.momentum, 0);
});

test("a Siege Maul rig WITHOUT the Piledriver upgrade gains no Momentum from advancing", () => {
  const r = siegeRoom("breaching-round"); // Siege Maul, but not the piledriver prototype
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(b1.momentum, 0);
});

test("a Piledriver rig storing Momentum cannot Raise Shield (downgrades to Brace)", () => {
  const r = siegeRoom("piledriver-protocol");
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.momentum = 2; // charged — all-in on the smash, no guard
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "prepare", prep: "raise-shield" } });
  assert.equal(b1.preparation.type, "brace"); // Raise Shield refused, downgraded to Brace

  // Control: with no Momentum stored, the same Bulwark Shield rig CAN raise its shield.
  const r2 = siegeRoom("piledriver-protocol");
  clearPendingAnswer(r2);
  applyCommand(r2, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r2, { verb: "action", attrs: { name: "b1", action: "prepare", prep: "raise-shield" } });
  assert.equal(findRig(r2, "b1").preparation.type, "raise-shield");
});

test("Ion Storm's active-lockout blocks an equipment active during the pinned activation", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.equipment = "radiator-array";         // grants the Purge active
  b1.noActivesNextActivation = true;       // simulates an Ion Storm hit landed on this rig
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const usedBefore = r.game.turn.actionsUsed;
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "purge" } });
  assert.equal(r.game.turn.actionsUsed, usedBefore); // active refused — no slot spent
  assert.equal(b1.engine.heat, heatBefore);          // and no heat vented
});

test("Ion Storm's active-lockout clears when the pinned rig's activation ends", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.noActivesNextActivation = true;
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(b1.noActivesNextActivation, false);   // scoped to just the blocked activation
});

test("Ion Storm's Arc Gun overload refuses the next Arc Gun shot, then clears (consumed)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.longRange = "Arc Gun";
  b1.weaponUpgrades.longRange = "ion-storm";
  b1.arcLockedNext = true;                 // gun overloaded from a prior Ion Storm discharge
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  const spBefore = a1.hull.sp + a1.arms.sp + a1.legs.sp + a1.engine.sp;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6], impacts: [6, 6], location: 1 },
  } });
  const spAfter = a1.hull.sp + a1.arms.sp + a1.legs.sp + a1.engine.sp;
  assert.equal(r.game.turn.actionsUsed, 0);  // shot refused — no slot spent
  assert.equal(spAfter, spBefore);           // target untouched
  assert.equal(b1.arcLockedNext, false);     // overload consumed by the blocked attempt
  // The lock is one-shot: the very next Arc Gun shot now goes through.
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6], impacts: [6, 6], location: 1 },
  } });
  assert.equal(r.game.turn.actionsUsed, 1);  // fired this time
});

test("Fire Control Lock: the `lock` action paints a target for one slot", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.longRange = "Missile Barrage";
  b1.weaponUpgrades.longRange = "fire-control-lock";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  const usedBefore = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "lock", target: "a1" } });
  assert.equal(b1.lockedTarget, a1.id);
  assert.equal(b1.lockExpiresRound, r.game.round + 1);
  assert.equal(r.game.turn.actionsUsed, usedBefore + 1); // costs one slot
});

test("Fire Control Lock: only a rig carrying the upgrade can lock", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1"); // default loadout: Mini Gun / Sword, no fire-control
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const usedBefore = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "lock", target: "a1" } });
  assert.equal(b1.lockedTarget, null);                 // no paint applied
  assert.equal(r.game.turn.actionsUsed, usedBefore);   // refused — no slot spent
});

test("Fire Control Lock: the painted Missile Barrage volley auto-hits and clears the lock", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.longRange = "Missile Barrage";
  b1.weaponUpgrades.longRange = "fire-control-lock";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "lock", target: "a1" } });
  // Every to-hit die is a 1 (would all miss) — the lock forces all four to land.
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1, 1, 1], location: 1, impacts: [6, 6, 6, 6], ap: [1, 1, 1, 1] },
  } });
  const attack = r.game.resolutions.filter((x) => x.kind === "attack").at(-1);
  assert.match(attack.summary, /4 hit\(s\)/); // unmissable — all shots landed
  assert.equal(findRig(r, "b1").lockedTarget, null); // paint consumed
});

test("Shutdown is allowed after a real action has been spent (not just as the first)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } }); // spend a slot first
  assert.equal(r.game.turn.actionsUsed, 1);
  const b1 = findRig(r, "b1");
  b1.engine.heat = 9;                          // hot after the move
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "shutdown" } });
  assert.equal(b1.activated, true);            // shutdown went through mid-activation (was blocked before)
  assert.equal(b1.engine.heat, 5);             // 9 − min(5, 2·2 left) = 9 − 4
});

test("Shutdown cools 2 heat per slot left and ends the activation", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.engine.heat = 6;              // floor is 0 for a fresh engine
  r.game.turn.actionsUsed = 2;     // 1 of 3 slots left → cools 2
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "shutdown" } });
  assert.equal(b1.engine.heat, 4); // 6 − min(5, 2·1)
  assert.equal(b1.activated, true);
});

test("Shutdown as the first action cools by the 5-heat cap", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.engine.heat = 6;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "shutdown" } });
  assert.equal(b1.engine.heat, 1); // 3 slots left → 2·3 = 6, capped at 5 → 6 − 5
});

test("undo reverts the acting side's last turn-scoped action", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const heatBefore = findRig(r, "b1").engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(r.game.turn.actionsUsed, 1);
  // The other side cannot undo it.
  applyCommand(r, { verb: "undo", attrs: { side: "a" } });
  assert.equal(r.game.turn.actionsUsed, 1);
  // The acting side can.
  applyCommand(r, { verb: "undo", attrs: { side: "b" } });
  assert.equal(r.game.turn.actionsUsed, 0);
  assert.equal(findRig(r, "b1").engine.heat, heatBefore);
});

test("undo restores full state after an attack — damage, heat and slot reverted", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const spSum = (rig) => rig.hull.sp + rig.arms.sp + rig.legs.sp + rig.engine.sp;
  const targetSpBefore = spSum(findRig(r, "a1"));
  const heatBefore = findRig(r, "b1").engine.heat;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6], impacts: [6, 6], location: 1 },
  } });
  assert.ok(spSum(findRig(r, "a1")) < targetSpBefore, "attack dealt damage");
  assert.equal(r.game.turn.actionsUsed, 1);
  applyCommand(r, { verb: "undo", attrs: { side: "b" } });
  assert.equal(spSum(findRig(r, "a1")), targetSpBefore); // damage rolled back
  assert.equal(findRig(r, "b1").engine.heat, heatBefore);
  assert.equal(r.game.turn.actionsUsed, 0);
});

test("undo reverts an ended activation back to the acting Rig", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(findRig(r, "b1").activated, true);
  applyCommand(r, { verb: "undo", attrs: { side: "b" } });
  assert.equal(findRig(r, "b1").activated, false);       // active again
  assert.equal(r.game.turn.activeRigId, findRig(r, "b1").id);
});

test("answer-token placement is undoable by the answering side, not the turn side", () => {
  const r = startedRoom(); // turn.side === "b"; "a" holds the answer gate
  assert.deepEqual(r.game.pendingAnswer, { side: "a", remaining: 1 });
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  // The reacting side (a) owns the undo, not the turn side (b).
  assert.equal(publicState(r, "a").game.canUndo, true);
  assert.equal(publicState(r, "b").game.canUndo, false);
  applyCommand(r, { verb: "undo", attrs: { side: "a" } });
  assert.equal(findRig(r, "a1").preparation, null); // token placement reverted
});

test("publicState exposes canUndo only to the side that made the last move", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(publicState(r, "b").game.canUndo, true);
  assert.equal(publicState(r, "a").game.canUndo, false);
  applyCommand(r, { verb: "undo", attrs: { side: "b" } });
  // Only the activate snapshot remains; still b's to revert.
  assert.equal(publicState(r, "b").game.canUndo, true);
});

test("actions beyond the budget are rejected", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  for (let i = 0; i < 6; i++) applyCommand(r, { verb: "action", attrs: { name: "b1", action: "prepare" } });
  assert.equal(r.game.turn.actionsUsed, 3);   // capped at actionsMax
});

test("reload reloads all weapons; repair rolls a D12 and heals", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.loaded.longRange = false;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "reload" } });
  assert.equal(b1.loaded.longRange, true);
  applyCommand(r, { verb: "damage", attrs: { name: "b1", loc: "arms", amount: "3" } }); // 5 -> 2
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "repair", loc: "arms", dice: { repair: 10 } } });
  assert.equal(b1.arms.sp, 4);                // 10+ repairs 2
  assert.equal(r.game.resolutions.at(-1).kind, "repair");
});

test("shut down before any action cools to the floor and ends the activation", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.engine.heat = 5;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "shutdown" } });
  assert.equal(b1.engine.heat, 0);
  assert.equal(b1.activated, true);
  assert.equal(r.game.turn.activeRigId, null);
});

test("end activation with safe heat just hands off", () => {
  const r = startedRoom(); // b first
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  assert.equal(findRig(r, "b1").activated, true);
  assert.equal(r.game.turn.side, "a");        // alternated
  assert.equal(r.game.turn.activeRigId, null);
});

test("overheating at end of activation resolves the Heat Threshold Table", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");               // Light, capacity 6
  b1.engine.heat = 8;                         // 2 over -> bonus +4
  // D12 roll 6 -> total 10 -> Hydraulic Blowout: legs -2, speed halved.
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1", dice: { overheat: 6 } } });
  assert.equal(b1.legs.sp, 3);                // 5 - 2
  assert.equal(b1.speedHalvedNextRound, true);
  assert.equal(r.game.resolutions.at(-1).kind, "overheat");
});

test("a full round of activations triggers Recovery cooldown and reset", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const order = ["b1", "a1", "b2", "a2", "b3", "a3"];
  for (const name of order) {
    applyCommand(r, { verb: "activate", attrs: { name } });
    applyCommand(r, { verb: "action", attrs: { name, action: "move" } }); // +1 heat
    applyCommand(r, { verb: "endactivation", attrs: { name } });
  }
  assert.equal(r.game.phase, "recovery");
  assert.equal(findRig(r, "b1").engine.heat, 0);   // 1 -> floor 0 after -1
  assert.equal(findRig(r, "b1").activated, false);
  assert.deepEqual(r.game.answerTokens, { a: 0, b: 0 });
});

test("firing on a braced rig reveals it and logs a reaction entry", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } }); // clear gate
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  const a1 = findRig(r, "a1");
  assert.equal(a1.preparation.faceUp, true);                 // revealed
  assert.equal(r.game.resolutions.some((e) => e.kind === "reaction"), true);
});

test("firing on a return-fire rig resolves the shot then parks a counter", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "return", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1, 1, 1, 1, 1, 1, 1] }, // all misses — target survives so Return triggers
  } });
  assert.equal(findRig(r, "a1").preparation.faceUp, true);
  assert.equal(r.game.pendingReaction.kind, "return");
  assert.equal(r.game.pendingReaction.defender, "a");
});

// Round-start Answer gate blocks the first activator until the second side
// spends its Answer tokens. Test helpers that just want to drive activation
// forward (not exercise the gate itself) call this to clear it immediately.
function clearPendingAnswer(r) {
  // Just lift the gate — do NOT place real preparations here. Placing facedown
  // reactions on rigs would trigger the reveal/interpose when those rigs are
  // fired on in unrelated attack tests (see Tasks 4/5). Test-only state poke.
  r.game.pendingAnswer = null;
}

// Drives one full round of activations by following whichever side actually
// holds the turn (rather than a hardcoded name order) so it stays correct
// after initiative flips in round 2+. No heat is added, so no overheat.
function runFullRound(r) {
  clearPendingAnswer(r);
  const counts = { a: 0, b: 0 };
  while (r.game.phase === "activation") {
    const side = r.game.turn.side;
    const name = `${side}${++counts[side]}`;
    applyCommand(r, { verb: "activate", attrs: { name } });
    applyCommand(r, { verb: "endactivation", attrs: { name } });
  }
}

test("both sides scoring VP advances to the next round's initiative", () => {
  const r = startedRoom();
  runFullRound(r);
  assert.equal(r.game.phase, "recovery");
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [0] } });
  assert.equal(r.game.phase, "recovery");         // still waiting on b
  applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [1] } });
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2);
  assert.equal(r.game.sides.find((s) => s.id === "b").vp, 1);
  assert.equal(r.game.round, 2);
  assert.equal(r.game.phase, "initiative");
});

test("VP claims score per-objective and block on a both-claimed marker", () => {
  const r = startedRoom();
  runFullRound(r);
  assert.equal(r.game.phase, "recovery");
  // Objectives: index 0 = centre (2 VP), indices 1 & 2 = corners (1 VP each).
  // Both claim the centre — conflict, no advance, no VP awarded.
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [0] } });
  applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [0] } });
  assert.equal(r.game.phase, "recovery");
  assert.deepEqual(r.game.recoveryConflict, [0]);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 0);
  assert.equal(r.game.round, 1);
  // A backs off the centre and resubmits — conflict clears, round advances.
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [1] } });
  assert.equal(r.game.phase, "initiative");
  assert.equal(r.game.round, 2);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 1); // corner
  assert.equal(r.game.sides.find((s) => s.id === "b").vp, 2); // centre
  assert.equal(r.game.recoveryConflict, null);
});

test("VP claims ignore out-of-range and duplicate indices", () => {
  const r = startedRoom();
  runFullRound(r);
  applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [0, 0, 9, -1] } });
  applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [] } });
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2); // just the centre, once
  assert.equal(r.game.phase, "initiative");
});

test("after the final round (10) the higher VP wins", () => {
  const r = startedRoom();
  for (let round = 1; round <= 10; round++) {
    if (round >= 2) applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
    runFullRound(r);
    applyCommand(r, { verb: "vp", attrs: { side: "a", claims: round === 1 ? [0, 1] : [] } });
    applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [] } });
    // Not finished until the last round resolves.
    if (round < 10) assert.equal(r.game.phase, "initiative");
  }
  assert.equal(r.game.phase, "finished");
  assert.deepEqual(r.game.outcome, { winner: "a", reason: "points" });
});

test("annihilation ends the game immediately", () => {
  const r = startedRoom();
  for (const name of ["b1", "b2", "b3"]) {
    for (const loc of ["hull", "engine"]) {
      applyCommand(r, { verb: "set", attrs: { name, loc, sp: "0" } });
      applyCommand(r, { verb: "damage", attrs: { name, loc, amount: "1" } }); // destroy
    }
  }
  assert.equal(r.game.outcome.winner, "a");
  assert.equal(r.game.outcome.reason, "annihilation");
  assert.equal(r.game.phase, "finished");
});

test("answer token places a free preparation and decrements the pool", () => {
  const r = startedRoom(); // side a holds 1 Answer token
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  const a1 = findRig(r, "a1");
  assert.deepEqual(a1.preparation, { type: "brace", source: "answer", faceUp: false });
  assert.equal(r.game.answerTokens.a, 0);
});

test("answer token is rejected without tokens, off-side, or when already prepared", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "b1", prep: "brace", side: "b" } }); // b has 0
  assert.equal(findRig(r, "b1").preparation, null);
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  const v = r.version;
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a" } }); // already prepared
  assert.equal(r.version, v);
});

test("publicState carries the new round-loop fields", () => {
  const r = startedRoom();
  const view = publicState(r, "a");
  assert.equal(view.game.phase, "activation");
  assert.equal(view.game.turn.side, "b");
  assert.equal(view.game.autoResolve, true);
  assert.ok(Array.isArray(view.game.resolutions));
});

test("formatBattleState reports phase and whose turn it is", () => {
  const r = startedRoom();
  const out = formatBattleState(r, "a");
  assert.match(out, /Phase: activation/i);
  assert.match(out, /Turn: b/);
});

test("applyDamage arms-to-0 destroys a weapon and spills to hull and engine", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1"); // Light: arms 5, hull 6, engine 4
  __test.applyDamage(r, b1, "arms", 5, { random: () => 0, dice: { armsWeapon: 4 } });
  assert.equal(b1.arms.sp, 0);
  assert.equal(b1.weaponsDestroyed.length, 1);   // D12 4 -> longRange slot destroyed
  assert.equal(b1.hull.sp, 5);                    // 6 - 1 spill
  assert.equal(b1.engine.sp, 3);                  // 4 - 1 spill
  assert.equal(b1.skipNextActivation, false);     // engine at 3, not 0
});

test("engine-role zero fires the 'lose next activation' clause (regression)", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  rig.engine.sp = 1;
  __test.applyDamage(room, rig, "engine", 1, {});
  assert.equal(rig.skipNextActivation, true);
});

test("weapon-role zero rolls the weapon-destroy D12 and cooks off 1+1 (regression)", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  const hullBefore = rig.hull.sp;
  const engineBefore = rig.engine.sp;
  rig.arms.sp = 1;
  __test.applyDamage(room, rig, "arms", 1, { dice: { armsWeapon: 3 } });
  assert.ok(rig.weaponsDestroyed.includes(rig.weapons.longRange));
  assert.equal(rig.hull.sp, hullBefore - 1);
  assert.equal(rig.engine.sp, engineBefore - 1);
});

test("additional hit to a 0-SP arms spills exactly 1 SP to Hull (not 3), linear", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  rig.arms.sp = 0;                         // already catastrophic (weapon spent earlier)
  const hull0 = rig.hull.sp;
  __test.applyDamage(room, rig, "arms", 1, { dice: { armsWeapon: 3 } }); // additional
  assert.equal(rig.hull.sp, hull0 - 1);    // 1 spill, not 3
  __test.applyDamage(room, rig, "arms", 1, { dice: { armsWeapon: 3 } }); // second additional
  assert.equal(rig.hull.sp, hull0 - 2);    // linear, not compounding
});

test("additional hit to a 0-SP legs immobilises AND spills 1 SP to Hull (conserved)", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  rig.legs.sp = 0;                         // already catastrophic
  const hull0 = rig.hull.sp;
  __test.applyDamage(room, rig, "legs", 1, {}); // additional
  assert.equal(rig.immobilised, true);     // §8 effect kept
  assert.equal(rig.hull.sp, hull0 - 1);    // damage no longer evaporates
});

test("catastrophic spill retargets to Engine when Hull is already at 0", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  rig.legs.sp = 0;
  __test.setRigSp(rig, "hull", 0);         // Hull can't absorb — next living part
  const engine0 = rig.engine.sp;
  __test.applyDamage(room, rig, "legs", 1, {});
  assert.equal(rig.hull.sp, 0);            // dead Hull untouched (no destroyed cascade)
  assert.equal(rig.engine.sp, engine0 - 1);// spill routed to Engine
});

test("Kneecapper rake to a 0-SP legs immobilises but never spills (cripple, never kill)", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  rig.legs.sp = 0;
  const hull0 = rig.hull.sp, engine0 = rig.engine.sp;
  __test.applyDamage(room, rig, "legs", 1, { noSpill: true }); // kneecapper-sourced
  assert.equal(rig.immobilised, true);
  assert.equal(rig.hull.sp, hull0);        // no spill
  assert.equal(rig.engine.sp, engine0);
});

test("Kneecapper cripple ramp — a raked leg at <= half max flags speedHalvedNextRound", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  assert.equal(rig.legs.max, 6); // medium default
  rig.kneecapped.legs = true; // as a Kneecapper hit would tag it (combat.js)
  __test.applyDamage(room, rig, "legs", 3, {}); // 6 -> 3, exactly half
  assert.equal(rig.legs.sp, 3);
  assert.equal(rig.speedHalvedNextRound, true);
});

test("Kneecapper cripple ramp — a raked arm at <= half max sets armsSuppressed", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  assert.equal(rig.arms.max, 6);
  rig.kneecapped.arms = true;
  __test.applyDamage(room, rig, "arms", 3, { dice: { armsWeapon: 12 } }); // 6 -> 3, exactly half
  assert.equal(rig.arms.sp, 3);
  assert.equal(rig.armsSuppressed, true);
});

test("Kneecapper cripple ramp is SCOPED — the SAME limb ground to <= half by a non-Kneecapper weapon does NOT debuff", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  // No kneecapped tag — ordinary damage grinds both limbs to exactly half.
  __test.applyDamage(room, rig, "legs", 3, {}); // 6 -> 3
  __test.applyDamage(room, rig, "arms", 3, { dice: { armsWeapon: 12 } }); // 6 -> 3
  assert.equal(rig.legs.sp, 3);
  assert.equal(rig.arms.sp, 3);
  assert.equal(rig.speedHalvedNextRound, false); // untagged -> no cripple
  assert.equal(rig.armsSuppressed, false);
});

test("Kneecapper cripple ramp — a raked limb above half applies nothing", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  rig.kneecapped.legs = true; rig.kneecapped.arms = true;
  __test.applyDamage(room, rig, "legs", 2, {}); // 6 -> 4, still above half (3)
  __test.applyDamage(room, rig, "arms", 2, { dice: { armsWeapon: 12 } }); // 6 -> 4, still above half (3)
  assert.equal(rig.legs.sp, 4);
  assert.equal(rig.arms.sp, 4);
  assert.equal(rig.speedHalvedNextRound, false);
  assert.equal(rig.armsSuppressed, false);
});

test("Kneecapper cripple ramp — repairing a raked limb above half clears its tag (switching-limbs reset)", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  rig.kneecapped.arms = true;
  __test.applyDamage(room, rig, "arms", 3, { dice: { armsWeapon: 12 } }); // 6 -> 3, suppressed
  assert.equal(rig.armsSuppressed, true);
  __test.repairRig(rig, "arms", 2); // 3 -> 5, back above half -> tag cleared
  assert.equal(rig.armsSuppressed, false);
  assert.equal(rig.kneecapped.arms, false);
});

test("Kneecapper cripple ramp — Recovery re-applies speedHalvedNextRound while a raked leg stays <= half", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  rig.kneecapped.legs = true;
  __test.applyDamage(room, rig, "legs", 3, {}); // 6 -> 3, exactly half
  assert.equal(rig.speedHalvedNextRound, true);
  __test.runRecovery(room); // resets the flag to false, then recompute() re-derives it
  assert.equal(rig.speedHalvedNextRound, true); // still raked & <= half -> re-flagged
});

test("Kneecapper — a rake to 0 arms destroys the weapon but never spills into hull/engine (cripple, never kill)", () => {
  const room = createRoom("R", "u"); claimSide(room, "u", "a");
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  const hullBefore = rig.hull.sp;
  const engineBefore = rig.engine.sp;
  // noSpill mirrors what combat.js threads for a kneecapper-sourced hit.
  __test.applyDamage(room, rig, "arms", 6, { random: () => 0, dice: { armsWeapon: 3 }, noSpill: true }); // 6 -> 0
  assert.equal(rig.arms.sp, 0);
  assert.ok(rig.weaponsDestroyed.includes(rig.weapons.longRange)); // weapon still dies
  assert.equal(rig.hull.sp, hullBefore);     // no cook-off spill
  assert.equal(rig.engine.sp, engineBefore); // no cook-off spill
  assert.equal(rig.destroyed, false);        // cripple, never kill
});

test("applyDamage: first hit to 0 SP hull does not destroy; additional damage destroys the rig", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  __test.applyDamage(r, b1, "hull", 6, { random: () => 0 }); // 6 -> 0 (first-time, no destroy)
  assert.equal(b1.hull.sp, 0);
  assert.equal(b1.hull.destroyed, false);
  __test.applyDamage(r, b1, "hull", 1, { random: () => 0 }); // additional -> destroyed
  assert.equal(b1.hull.destroyed, true);
  assert.equal(b1.destroyed, true);
});

test("applyOverheat still routes through the cascade (engine failure sets noCool)", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  const before = b1.engine.sp;
  __test.applyOverheat(r, b1, 14, { random: () => 0 }); // 14 -> engine-failure: 2 dmg engine + noCool
  assert.equal(b1.engine.sp, Math.max(0, before - 2));
  assert.equal(b1.noCool, true);
});

test("recompute destroys the unit when every registered part hits 0 (regression)", () => {
  const room = createRoom("R"); claimSide(room, { name: "u", side: "a" });
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  for (const p of ["hull", "arms", "legs", "engine"]) __test.setRigSp(rig, p, 0);
  assert.equal(rig.destroyed, true);
});

test("recompute leaves the unit alive while any part has SP (regression)", () => {
  const room = createRoom("R"); claimSide(room, { name: "u", side: "a" });
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  __test.setRigSp(rig, "hull", 0);
  __test.setRigSp(rig, "arms", 0);
  __test.setRigSp(rig, "legs", 0);
  assert.equal(rig.destroyed, false);
});

test("destruction rolls a D12; 4+ records a pending blast", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.hull.sp = 1;
  __test.applyDamage(r, b1, "hull", 5, { random: () => 0, dice: { destruction: 9 } }); // hull past 0 -> destroyed
  assert.equal(b1.destroyed, true);
  assert.equal(r.game.pendingBlast.sourceId, b1.id);
  assert.equal(r.game.pendingBlast.exploded, true);
});

test("destroying your Priority Target scores +2 VP", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  r.game.priorityTargets = { a: b1.id, b: findRig(r, "a1").id };
  b1.hull.sp = 1;
  __test.applyDamage(r, b1, "hull", 5, { random: () => 0, dice: { destruction: 9 } });
  assert.equal(b1.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2);
  const kill = r.game.resolutions.find((e) => e.kind === "destruction" && e.rigId === b1.id);
  assert.deepEqual(kill.vp, { side: "a", amount: 2 });
  assert.equal(kill.victimName, b1.name);
  assert.ok(kill.effects.some((e) => /Priority Elimination/.test(e)));
});

test("destroying a NON-target enemy scores nothing", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1"); const b2 = findRig(r, "b2");
  r.game.priorityTargets = { a: b1.id, b: findRig(r, "a1").id }; // a hunts b1, not b2
  b2.hull.sp = 1;
  __test.applyDamage(r, b2, "hull", 5, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(b2.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 0);
  const kill = r.game.resolutions.find((e) => e.kind === "destruction" && e.rigId === b2.id);
  assert.equal(kill.vp, undefined);
});

test("a Priority Target lost to its own cause still scores for its hunter", () => {
  const r = startedRoom();
  const a1 = findRig(r, "a1");
  r.game.priorityTargets = { a: findRig(r, "b1").id, b: a1.id }; // b hunts a1
  a1.hull.sp = 1;
  __test.applyDamage(r, a1, "hull", 5, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(a1.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "b").vp, 2);
});

test("Priority Target kill VP is awarded once, never twice", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  r.game.priorityTargets = { a: b1.id, b: findRig(r, "a1").id };
  b1.hull.sp = 1;
  __test.applyDamage(r, b1, "hull", 5, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2);
  __test.setRigSp(b1, "hull", 5);     // "revive" the hull; _blastRolled stays set
  assert.equal(b1.destroyed, false);
  __test.applyDamage(r, b1, "hull", 9, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(b1.destroyed, true);
  assert.equal(r.game.sides.find((s) => s.id === "a").vp, 2); // still 2, not 4
});

test("blast applies D6 + STR 10 to each named rig and clears the pending blast", () => {
  const r = startedRoom();
  r.game.pendingBlast = { sourceId: findRig(r, "b1").id, exploded: true };
  const a1 = findRig(r, "a1"); // light hull 6
  applyCommand(r, { verb: "blast", attrs: { targets: ["a1"], dice: { impacts: { a1: 6 }, location: { a1: 1 } } } });
  // D6 6 + STR 10 = 16 vs light hull (10/14/16) -> critical (3 SP).
  assert.equal(a1.hull.sp, 3);
  assert.equal(r.game.pendingBlast, null);
});

test("fire action resolves an attack, applies damage and logs it", () => {
  const r = startedRoom(); // b acts first
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1"); // Light target, hull 6
  // Fire the melee Sword: STR 6-2(light)=4. 2 dice both 6 -> impacts 6+4+0(front)=10
  // vs light hull (10/14/16) -> direct 1 each = 2 SP.
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 6], impacts: [6, 6], location: 1 },
  } });
  assert.equal(a1.hull.sp, 4); // 6 - 2
  assert.equal(r.game.turn.actionsUsed, 1);
  assert.equal(r.game.resolutions.at(-1).kind, "attack");
});

test("firing a spent ranged weapon is rejected — you must reload first", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.loaded.longRange = false; // already fired once this activation, not yet reloaded
  const before = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "side", range: "near",
    dice: { toHit: [6,6,6,6,6,6,6,6], location: 1, impacts: [1,1,1,1,1,1,1,1] },
  } });
  assert.equal(r.game.turn.actionsUsed, before); // no-op: the shot needs a reload first
  assert.equal(b1.loaded.longRange, false);
});

test("a second ranged shot costs 1 slot but runs the barrel hot: +1 heat", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  const fire = {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "side", range: "near",
    dice: { toHit: [6,6,6,6,6,6,6,6], location: 1, impacts: [1,1,1,1,1,1,1,1] },
  };
  const rand = { random: () => 0 };                        // keep the shots deterministic
  const h0 = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: fire }, {}, rand); // shot 1
  const firstDelta = b1.engine.heat - h0;
  assert.equal(b1.loaded.longRange, false);                // weapon spent
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "reload" } }, {}, rand);
  assert.equal(b1.loaded.longRange, true);
  const h1 = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: fire }, {}, rand); // shot 2
  const secondDelta = b1.engine.heat - h1;
  assert.equal(secondDelta, firstDelta + 1);               // second shot: +1 heat
  assert.equal(r.game.turn.actionsUsed, 3);                // fire + reload + fire = 3 slots
});

test("ram action is removed — melee covers close combat, so it is a no-op", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  const aBefore = a1.hull.sp;
  const bBefore = b1.hull.sp;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "ram", target: "a1",
    dice: { self: { location: 1, impact: 6 }, target: { location: 1, impact: 6 } },
  } });
  // No damage, no slot spent — ram no longer exists.
  assert.equal(a1.hull.sp, aBefore);
  assert.equal(b1.hull.sp, bBefore);
  assert.equal(r.game.turn.actionsUsed, 0);
});

// Perks now come only from the chosen upgrade, so these drive the effect through
// the upgrade that grants it: Ion Burn → Incendiary, Suppressive Fire → Shock.
test("Incendiary (via Ion Burn) adds 1 heat to the target", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.longRange = "Arc Gun";
  b1.weaponUpgrades.longRange = "ion-burn";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  const heatBefore = a1.engine.heat;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6], impacts: [1, 1], location: 1 },
  } });
  assert.equal(a1.engine.heat, heatBefore + 1);
});

test("Shock (via Suppressive Fire) halves target speed next round", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.longRange = "Mini Gun";
  b1.weaponUpgrades.longRange = "suppressive-fire";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6, 6, 6, 6, 6, 6, 6], impacts: [1, 1, 1, 1, 1, 1, 1, 1], location: 1 },
  } });
  assert.equal(a1.speedHalvedNextRound, true);
});

test("Impale (via Vice Grip) immobilises on a D12 of 8+", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Claw";
  b1.weaponUpgrades.melee = "vice-grip";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6], impacts: [6, 6], location: 1, impale: 9 },
  } });
  assert.equal(a1.immobilised, true);
});

test("EQUIPMENT has the 8 catalogue pieces with passive + active shape", () => {
  const ids = Object.keys(EQUIPMENT).sort();
  assert.deepEqual(ids, [
    "ablative-plating", "blast-furnace-core", "field-repair-suite", "overclock-core",
    "radiator-array", "reactive-plating", "servo-actuators", "targeting-computer",
  ]);
  for (const id of ids) {
    const e = EQUIPMENT[id];
    assert.equal(typeof e.family, "string");
    assert.equal(typeof e.label, "string");
    assert.equal(typeof e.passive, "string");
    assert.equal(typeof e.active.key, "string");
    assert.equal(typeof e.active.heat, "number");
    assert.equal(typeof e.active.text, "string");
  }
});

test("EQUIPMENT has 8 families including the 3 new ones", () => {
  assert.equal(Object.keys(EQUIPMENT).length, 8);
  for (const id of ["blast-furnace-core", "targeting-computer", "reactive-plating"]) {
    assert.ok(EQUIPMENT[id], `missing ${id}`);
    assert.ok(EQUIPMENT[id].active.key, `${id} needs an active key`);
  }
  assert.equal(EQUIPMENT_ACTIVE_BY_KEY["heatpurgewave"], "blast-furnace-core");
  assert.equal(EQUIPMENT_ACTIVE_BY_KEY["locksight"], "targeting-computer");
  assert.equal(EQUIPMENT_ACTIVE_BY_KEY["popsmoke"], "reactive-plating");
});

test("normalizeEquipment is case-insensitive and rejects unknown ids", () => {
  assert.equal(normalizeEquipment("Ablative-Plating"), "ablative-plating");
  assert.equal(normalizeEquipment("nonsense"), null);
  assert.equal(normalizeEquipment(null), null);
});

test("every equipment family has exactly 3 upgrades, one per nature", () => {
  for (const id of Object.keys(EQUIPMENT)) {
    const ups = EQUIPMENT_UPGRADES[id];
    assert.ok(Array.isArray(ups), `${id} has no upgrades`);
    assert.equal(ups.length, 3, `${id} needs 3 upgrades`);
    assert.deepEqual(ups.map((u) => u.nature), ["field", "tuned", "prototype"]);
  }
});

test("equipment upgrade helpers resolve", () => {
  assert.equal(equipmentUpgradeNature("ablative-plating", "reinforced-plating"), "field");
  assert.equal(equipmentUpgradeNature("ablative-plating", "ablative-cascade"), "prototype");
  assert.equal(equipmentUpgradeNature("ablative-plating", "nope"), null);
  assert.equal(firstEquipmentUpgradeId("ablative-plating"), "reinforced-plating");
});

test("normalizeEquipmentUpgrade validates + normalizes", () => {
  assert.equal(normalizeEquipmentUpgrade("ablative-plating", "REINFORCED-PLATING "), "reinforced-plating"); // trims + lowercases
  assert.equal(normalizeEquipmentUpgrade("ablative-plating", "reinforced-plating"), "reinforced-plating");
  assert.equal(normalizeEquipmentUpgrade("ablative-plating", "unknown-id"), null);
  assert.equal(normalizeEquipmentUpgrade("ablative-plating", null), null);
  assert.equal(normalizeEquipmentUpgrade("no-such-equipment", "reinforced-plating"), null);
});

test("Field upgrades override equipment active heat", () => {
  assert.equal(equipmentActiveHeat("radiator-array", null), -2);
  assert.equal(equipmentActiveHeat("radiator-array", "twin-radiators"), -3);
  assert.equal(equipmentActiveHeat("overclock-core", null), 3);
  assert.equal(equipmentActiveHeat("overclock-core", "redundant-capacitors"), 2);
  assert.equal(equipmentActiveHeat("ablative-plating", "reinforced-plating"), 1);
});

test("Reinforced Servos zeroes Sprint heat; base Servo is 1, none is 2", () => {
  assert.equal(equipmentSprintHeat(null, null), 2);
  assert.equal(equipmentSprintHeat("servo-actuators", null), 1);
  assert.equal(equipmentSprintHeat("servo-actuators", "reinforced-servos"), 0);
});

test("Master Toolkit repairs +2, base suite +1, none +0", () => {
  assert.equal(equipmentRepairBonus(null, null), 0);
  assert.equal(equipmentRepairBonus("field-repair-suite", null), 1);
  assert.equal(equipmentRepairBonus("field-repair-suite", "master-toolkit"), 2);
});

test("makeRig stores a normalized equipmentUpgrade", () => {
  const rig = makeRig("r1", "Test", "light", "a",
    { longRange: "Crossbow", melee: "Talon" }, "ablative-plating", "reinforced-plating");
  assert.equal(rig.equipmentUpgrade, "reinforced-plating");
  const bad = makeRig("r2", "Test2", "light", "a",
    { longRange: "Crossbow", melee: "Talon" }, "ablative-plating", "not-real");
  assert.equal(bad.equipmentUpgrade, null);
});

test("WEAPON_UPGRADES has exactly 3 upgrades for all 20 weapons", () => {
  const all = [...Object.keys(WEAPONS.longRange), ...Object.keys(WEAPONS.melee)];
  assert.equal(all.length, 22);
  for (const name of all) {
    const ups = WEAPON_UPGRADES[name];
    assert.equal(Array.isArray(ups), true, `${name} missing upgrades`);
    assert.equal(ups.length, 3, `${name} must have exactly 3 upgrades`);
    for (const u of ups) {
      assert.equal(typeof u.name, "string");
      assert.equal(typeof u.tag, "string");
    }
  }
});

test("medium-crossbow-talon chassis resolves and carries its weapons", () => {
  const entry = CHASSIS.find((c) => c.id === "medium-crossbow-talon");
  assert.ok(entry, "chassis entry present");
  assert.equal(entry.longRange, "Crossbow");
  assert.equal(entry.melee, "Talon");
  assert.ok(WEAPONS.longRange["Crossbow"], "Crossbow weapon present");
  assert.ok(WEAPONS.melee["Talon"], "Talon weapon present");
  assert.equal(WEAPON_UPGRADES["Crossbow"].length, 3);
  assert.equal(WEAPON_UPGRADES["Talon"].length, 3);
});

test("makeRig resolves speed from the chassis id", () => {
  const rig = makeRig(1, "Shrike", "medium", "a", {
    longRange: "Crossbow", melee: "Talon", chassis: "medium-crossbow-talon",
  });
  assert.equal(rig.speed, 4);
});

test("makeRig leaves speed null for a free combo with no chassis id", () => {
  const rig = makeRig(1, "Freeform", "light", "a", {
    longRange: "Mini Gun", melee: "Sword",
  });
  assert.equal(rig.speed, null);
});

test("WEAPON_UPGRADES has stable ids and effect objects for every option", () => {
  const all = [...Object.keys(WEAPONS.longRange), ...Object.keys(WEAPONS.melee)];
  for (const name of all) {
    const ups = WEAPON_UPGRADES[name];
    assert.equal(ups.length, 3, `${name} must have exactly 3 upgrades`);
    const ids = new Set();
    for (const u of ups) {
      assert.equal(typeof u.id, "string", `${name} upgrade missing id`);
      assert.equal(u.id.length > 0, true, `${name} upgrade id empty`);
      assert.equal(ids.has(u.id), false, `${name} duplicate upgrade id ${u.id}`);
      ids.add(u.id);
      assert.equal(typeof u.effect, "object", `${name} ${u.id} missing effect`);
      assert.equal(u.effect != null, true, `${name} ${u.id} missing effect`);
    }
  }
});

test("normalizeWeaponUpgrade resolves valid ids and defaults missing/invalid selections", () => {
  assert.equal(defaultWeaponUpgrade("Mini Gun"), "suppressive-fire");
  assert.equal(normalizeWeaponUpgrade("Mini Gun", "suppressive-fire"), "suppressive-fire");
  assert.equal(normalizeWeaponUpgrade("Mini Gun", ""), "suppressive-fire");
  assert.equal(normalizeWeaponUpgrade("Mini Gun", "not-real"), "suppressive-fire");
  assert.equal(normalizeWeaponUpgrade("Not A Weapon", "extended-belt"), null);
  assert.equal(upgradeForWeapon("Mini Gun", "suppressive-fire").name, "Suppressive Fire");
});

test("makeRig stores default and explicit selected weapon upgrades", () => {
  const fallback = makeRig(1, "Warden", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  assert.deepEqual(fallback.weaponUpgrades, { longRange: "suppressive-fire", melee: "duelist-balance" });

  const explicit = makeRig(2, "Reaver", "medium", "a", {
    longRange: "Mini Gun",
    melee: "Sword",
    longRangeUpgrade: "extended-belt",
    meleeUpgrade: "opportunist",
  });
  assert.deepEqual(explicit.weaponUpgrades, { longRange: "extended-belt", melee: "opportunist" });
});

test("add command passes selected weapon upgrades through to the created rig", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: {
    name: "Chooser", class: "medium", owner: "a",
    lr: "Autocannon", melee: "Claw",
    longRangeUpgrade: "depleted-core",
    meleeUpgrade: "rending-talons",
  } });
  const rig = findRig(r, "Chooser");
  assert.deepEqual(rig.weaponUpgrades, { longRange: "depleted-core", melee: "rending-talons" });
});

test("ensureRigShape backfills selected weapon upgrades on legacy rig objects", () => {
  const legacy = { code: "L", version: 0, nextRigId: 2, game: { round: 1, started: false },
    rigs: [{ id: 1, name: "Old", weightClass: "light", owner: "a",
      hull:{sp:6,max:6,destroyed:false}, arms:{sp:5,max:5,destroyed:false},
      legs:{sp:5,max:5,destroyed:false}, engine:{sp:4,max:4,destroyed:false,heat:0},
      weapons:{longRange:"Double MG",melee:"Chainsaw"}, destroyed:false }] };
  applyCommand(legacy, { verb: "nonsense", attrs: {} });
  assert.deepEqual(legacy.rigs[0].weaponUpgrades, { longRange: "gyro-mount", melee: "ripper-teeth" });
});

test("makeRig accepts an equipment id and Ablative Plating grants +1 max/current Hull SP", () => {
  const plain = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  assert.equal(plain.equipment, null);
  assert.equal(plain.hull.max, 7);

  const armored = makeRig(2, "Bastion", "medium", "a", { longRange: "Autocannon", melee: "Claw" }, "ablative-plating");
  assert.equal(armored.equipment, "ablative-plating");
  assert.equal(armored.hull.max, 8);
  assert.equal(armored.hull.sp, 8);
});

test("makeRig rejects an invalid equipment id by falling back to no equipment", () => {
  const rig = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" }, "not-a-real-slot");
  assert.equal(rig.equipment, null);
  assert.equal(rig.hull.max, 7);
});

test("add passes equipment through to the created rig", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Bastion", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw", equipment: "servo-actuators" } });
  const rig = findRig(r, "Bastion");
  assert.equal(rig.equipment, "servo-actuators");
});

test("add passes equipmentUpgrade through to the created rig", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Bastion", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw", equipment: "ablative-plating", equipmentUpgrade: "reinforced-plating" } });
  const rig = findRig(r, "Bastion");
  assert.equal(rig.equipmentUpgrade, "reinforced-plating");
});

test("ensureRigShape backfills equipment/hardened/overclockCoreUsed on legacy rig objects", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Bastion", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  const rig = findRig(r, "Bastion");
  delete rig.equipment; delete rig.equipmentUpgrade; delete rig.hardened; delete rig.overclockCoreUsed;
  findRig(r, "Bastion"); // findRig calls ensureGameShape -> ensureRigShape internally
  assert.equal(rig.equipment, null);
  assert.equal(rig.equipmentUpgrade, null);
  assert.equal(rig.hardened, false);
  assert.equal(rig.overclockCoreUsed, false);
});

test("Radiator Array cools 2 heat in Recovery instead of the usual 1", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      applyCommand(r, { verb: "add", attrs: { name: `${owner}${i}`, class: "light", owner, lr: "Mini Gun", melee: "Sword",
        equipment: owner === "a" && i === 1 ? "radiator-array" : undefined } });
    }
  }
  for (const side of ["a", "b"]) applyCommand(r, { verb: "ready", attrs: { side } });
  applyCommand(r, { verb: "initiative", attrs: {} });

  const cooled = findRig(r, "a1");   // has Radiator Array
  const plain = findRig(r, "a2");    // no equipment
  cooled.engine.heat = 5;
  plain.engine.heat = 5;

  // Drive every rig to its activation and immediately end it so Recovery fires.
  clearPendingAnswer(r);
  while (r.game.phase === "activation") {
    const active = r.rigs.find((x) => (x.owner || "a") === r.game.turn.side && !x.activated && !x.destroyed);
    applyCommand(r, { verb: "activate", attrs: { name: active.name } });
    if (r.game.turn?.activeRigId) applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
  }

  assert.equal(cooled.engine.heat, 3); // 5 - 2
  assert.equal(plain.engine.heat, 4);  // 5 - 1
});

test("Servo Actuators makes Sprint cost 1 heat instead of 2", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "add", attrs: { name: "A1", class: "light", owner: "a", lr: "Mini Gun", melee: "Sword", equipment: "servo-actuators" } });
  applyCommand(r, { verb: "add", attrs: { name: "A2", class: "light", owner: "a", lr: "Mini Gun", melee: "Sword" } });
  applyCommand(r, { verb: "add", attrs: { name: "A3", class: "light", owner: "a", lr: "Mini Gun", melee: "Sword" } });
  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "light", owner: "b", lr: "Mini Gun", melee: "Sword" } });
  applyCommand(r, { verb: "add", attrs: { name: "B2", class: "light", owner: "b", lr: "Mini Gun", melee: "Sword" } });
  applyCommand(r, { verb: "add", attrs: { name: "B3", class: "light", owner: "b", lr: "Mini Gun", melee: "Sword" } });
  for (const side of ["a", "b"]) applyCommand(r, { verb: "ready", attrs: { side } });
  applyCommand(r, { verb: "initiative", attrs: {} });

  const servo = findRig(r, "A1");
  clearPendingAnswer(r);
  while (r.game.turn.side !== servo.owner || r.game.activated) {
    const active = r.rigs.find((x) => (x.owner || "a") === r.game.turn.side && !x.activated && !x.destroyed);
    if (active === servo) break;
    applyCommand(r, { verb: "activate", attrs: { name: active.name } });
    applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
  }
  applyCommand(r, { verb: "activate", attrs: { name: "A1" } });
  applyCommand(r, { verb: "action", attrs: { name: "A1", action: "sprint" } });
  assert.equal(servo.engine.heat, 1);
});

test("Overclock Core skips the skip-next-activation penalty the first time Engine hits 0, not after", () => {
  const rig = makeRig(1, "Reactor", "medium", "a", { longRange: "Autocannon", melee: "Claw" }, "overclock-core");
  rig.engine.sp = 1;
  __test.applyDamage({ game: { nextResolutionId: 1, resolutions: [] } }, rig, "engine", 1, {});
  assert.equal(rig.engine.sp, 0);
  assert.equal(rig.skipNextActivation, false);   // first time: bypassed
  assert.equal(rig.overclockCoreUsed, true);

  rig.engine.sp = 1; // repaired, then hit again
  __test.applyDamage({ game: { nextResolutionId: 1, resolutions: [] } }, rig, "engine", 1, {});
  assert.equal(rig.skipNextActivation, true);    // second time: normal rule applies
});

test("Field Repair Suite adds +1 SP to the Repair action only", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "add", attrs: { name: "Medic", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw", equipment: "field-repair-suite" } });
  applyCommand(r, { verb: "add", attrs: { name: "A2", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "A3", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "medium", owner: "b", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "B2", class: "medium", owner: "b", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "B3", class: "medium", owner: "b", lr: "Autocannon", melee: "Claw" } });
  for (const side of ["a", "b"]) applyCommand(r, { verb: "ready", attrs: { side } });
  applyCommand(r, { verb: "initiative", attrs: {} });

  const medic = findRig(r, "Medic");
  medic.hull.sp = 3;
  clearPendingAnswer(r);
  while (r.game.turn.side !== "a" || r.game.turn.activeRigId != null) {
    const active = r.rigs.find((x) => (x.owner || "a") === r.game.turn.side && !x.activated && !x.destroyed);
    if (!active || active === medic) break;
    applyCommand(r, { verb: "activate", attrs: { name: active.name } });
    applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
  }
  applyCommand(r, { verb: "activate", attrs: { name: "Medic" } });
  applyCommand(r, { verb: "action", attrs: { name: "Medic", action: "repair", loc: "hull", dice: { repair: 10 } } }); // 10+ = 2 SP roll
  assert.equal(medic.hull.sp, 6); // 3 + 2 (roll) + 1 (Field Repair Suite)
});

test("Field Repair Suite does not add +1 SP when the Repair roll whiffs", () => {
  const r = createRoom("X");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "add", attrs: { name: "Medic", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw", equipment: "field-repair-suite" } });
  applyCommand(r, { verb: "add", attrs: { name: "A2", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "A3", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "B1", class: "medium", owner: "b", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "B2", class: "medium", owner: "b", lr: "Autocannon", melee: "Claw" } });
  applyCommand(r, { verb: "add", attrs: { name: "B3", class: "medium", owner: "b", lr: "Autocannon", melee: "Claw" } });
  for (const side of ["a", "b"]) applyCommand(r, { verb: "ready", attrs: { side } });
  applyCommand(r, { verb: "initiative", attrs: {} });

  const medic = findRig(r, "Medic");
  medic.hull.sp = 3;
  clearPendingAnswer(r);
  while (r.game.turn.side !== "a" || r.game.turn.activeRigId != null) {
    const active = r.rigs.find((x) => (x.owner || "a") === r.game.turn.side && !x.activated && !x.destroyed);
    if (!active || active === medic) break;
    applyCommand(r, { verb: "activate", attrs: { name: active.name } });
    applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
  }
  applyCommand(r, { verb: "activate", attrs: { name: "Medic" } });
  applyCommand(r, { verb: "action", attrs: { name: "Medic", action: "repair", loc: "hull", dice: { repair: 6 } } }); // <7 = whiff, amt=0
  assert.equal(medic.hull.sp, 3); // unchanged: whiff must not be bumped to 1 by Field Repair Suite
});

function readyThreeAndThree(r, equipmentByName = {}) {
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  for (const owner of ["a", "b"]) {
    for (let i = 1; i <= 3; i++) {
      const name = `${owner}${i}`;
      applyCommand(r, { verb: "add", attrs: { name, class: "medium", owner, lr: "Autocannon", melee: "Claw", equipment: equipmentByName[name] } });
    }
  }
  for (const side of ["a", "b"]) applyCommand(r, { verb: "ready", attrs: { side } });
  applyCommand(r, { verb: "initiative", attrs: {} });
}

function activate(r, name) {
  clearPendingAnswer(r);
  while (r.game.phase === "activation" && r.game.turn.activeRigId == null) {
    const active = r.rigs.find((x) => (x.owner || "a") === r.game.turn.side && !x.activated && !x.destroyed);
    if (active.name.toLowerCase() === name.toLowerCase()) { applyCommand(r, { verb: "activate", attrs: { name } }); return; }
    applyCommand(r, { verb: "activate", attrs: { name: active.name } });
    applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
  }
}

test("harden requires Ablative Plating, costs 1 slot + 1 heat, and sets rig.hardened", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "ablative-plating" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  const usedBefore = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "harden" } });
  assert.equal(rig.hardened, true);
  assert.equal(rig.engine.heat, 1);
  assert.equal(r.game.turn.actionsUsed, usedBefore + 1);
});

test("popsmoke requires Reactive Plating and sets rig.smokeNextActivation", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "reactive-plating" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "popsmoke" } });
  assert.equal(rig.smokeNextActivation, true);
});

test("locksight requires Targeting Computer and arms rig.lockSightNext", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "targeting-computer" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  assert.equal(rig.lockSightNext, false);
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "locksight" } });
  assert.equal(rig.lockSightNext, true);
});

test("Lock Sight armed but not fired is cleared at activation end (no leak into reactive fire)", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "targeting-computer" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "locksight" } });
  assert.equal(rig.lockSightNext, true); // armed
  applyCommand(r, { verb: "endactivation", attrs: { name: "a1" } });
  // A shot not taken must not carry into the enemy turn's Return Fire / riposte.
  assert.equal(rig.lockSightNext, false);
});

test("popsmoke breaks an enemy missile Fire Control Lock aimed at this rig", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "reactive-plating" });
  const target = findRig(r, "a1");
  const enemy = findRig(r, "b1");
  enemy.lockedTarget = target.id;      // a missile Lock painting a1
  enemy.lockExpiresRound = 999;
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "popsmoke" } });
  assert.equal(enemy.lockedTarget, null);
  assert.equal(enemy.lockExpiresRound, 0);
});

test("harden is refused without Ablative Plating", () => {
  const r = createRoom("X");
  readyThreeAndThree(r);
  activate(r, "a1");
  const rig = findRig(r, "a1");
  const before = r.version;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "harden" } });
  assert.equal(rig.hardened, false);
  assert.equal(r.version, before); // no-op, no version bump
});

test("purge vents 2 heat on demand for Radiator Array", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "radiator-array" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.engine.heat = 5;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "purge" } });
  assert.equal(rig.engine.heat, 3);
});

test("Twin Radiators purge vents 3 heat through the action pipeline", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "radiator-array" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "twin-radiators"; // Field upgrade: Purge vents -3, not -2
  rig.engine.heat = 5;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "purge" } });
  assert.equal(rig.engine.heat, 2); // -3, not the base -2 (which would leave 3)
});

test("Heat Purge Wave vents to the raw Heat Capacity and narrates the 3\" AoE", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "blast-furnace-core" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.engine.heat = 9; // well above Medium's raw cap of 5 (and above the +1 margin)
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "heatpurgewave" } });
  assert.equal(rig.engine.heat, 5); // vented to the RAW class cap, not the +1 margin
  const last = r.game.resolutions.at(-1);
  const text = `${last.summary} ${last.effects.join(" ")}`;
  assert.match(text, /3"/);
});

test("Reinforced Servos zeroes Sprint heat through the action pipeline", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "servo-actuators" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "reinforced-servos"; // Field upgrade: Sprint costs 0, not 1
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "sprint" } });
  assert.equal(rig.engine.heat, 0); // 0, not the base Servo Actuators 1
});

test("Master Toolkit repairs +2 through the action pipeline", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "field-repair-suite" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.equipmentUpgrade = "master-toolkit"; // Field upgrade: Repair heals +2, not +1
  rig.hull.sp = 3;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "repair", loc: "hull", dice: { repair: 10 } } }); // 10+ = 2 SP roll
  assert.equal(rig.hull.sp, 7); // 3 + 2 (roll) + 2 (Master Toolkit)
});

test("overclock grants +2 actions this activation for Overclock Core", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "overclock-core" });
  activate(r, "a1");
  const maxBefore = r.game.turn.actionsMax;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "overclock" } });
  assert.equal(r.game.turn.actionsMax, maxBefore + 2);
  assert.equal(findRig(r, "a1").engine.heat, 3);
});

test("emergencypatch guarantees 2 SP with no roll for Field Repair Suite", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "field-repair-suite" });
  activate(r, "a1");
  const rig = findRig(r, "a1");
  rig.arms.sp = 2;
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "emergencypatch", loc: "arms" } });
  assert.equal(rig.arms.sp, 4);
  assert.equal(rig.engine.heat, 2);
});

test("jumpjets costs 1 slot + 2 heat for Servo Actuators", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "servo-actuators" });
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "jumpjets" } });
  assert.equal(findRig(r, "a1").engine.heat, 2);
});

test("a rig's next activation clears its own Harden", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "ablative-plating" });
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "harden" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "a1" } });
  // cycle everyone else, then come back to a1's next activation
  while (findRig(r, "a1").hardened && r.game.phase !== "finished") {
    if (r.game.phase === "recovery") applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [] } }), applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [] } });
    if (r.game.phase === "initiative") applyCommand(r, { verb: "initiative", attrs: {} });
    if (r.game.phase === "activation") {
      clearPendingAnswer(r);
      const active = r.rigs.find((x) => !x.activated && !x.destroyed && (x.owner || "a") === r.game.turn.side);
      if (!active) break;
      applyCommand(r, { verb: "activate", attrs: { name: active.name } });
      if (active.name === "a1") break;
      applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
    }
  }
  assert.equal(findRig(r, "a1").hardened, false);
});

test("a rig's next activation clears its own Pop Smoke", () => {
  const r = createRoom("X");
  readyThreeAndThree(r, { a1: "reactive-plating" });
  activate(r, "a1");
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "popsmoke" } });
  applyCommand(r, { verb: "endactivation", attrs: { name: "a1" } });
  // cycle everyone else, then come back to a1's next activation
  while (findRig(r, "a1").smokeNextActivation && r.game.phase !== "finished") {
    if (r.game.phase === "recovery") applyCommand(r, { verb: "vp", attrs: { side: "a", claims: [] } }), applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [] } });
    if (r.game.phase === "initiative") applyCommand(r, { verb: "initiative", attrs: {} });
    if (r.game.phase === "activation") {
      clearPendingAnswer(r);
      const active = r.rigs.find((x) => !x.activated && !x.destroyed && (x.owner || "a") === r.game.turn.side);
      if (!active) break;
      applyCommand(r, { verb: "activate", attrs: { name: active.name } });
      if (active.name === "a1") break;
      applyCommand(r, { verb: "endactivation", attrs: { name: active.name } });
    }
  }
  assert.equal(findRig(r, "a1").smokeNextActivation, false);
});

test("Systems Overload reduces the target's next activation budget by 1 and then clears", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.longRange = "Arc Gun";
  b1.weaponUpgrades.longRange = "systems-overload";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 1], impacts: [1], location: 1 },
  } });
  assert.equal(findRig(r, "a1").actionPenaltyNextActivation, 1);
  applyCommand(r, { verb: "endactivation", attrs: { name: "b1" } });
  applyCommand(r, { verb: "activate", attrs: { name: "a1" } });
  assert.equal(r.game.turn.actionsMax, 2); // base 3 − 1
  assert.equal(findRig(r, "a1").actionPenaltyNextActivation, 0);
});

test("Sunder reduces the struck location max SP once when the selected upgrade deals damage", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Circular Saw";
  b1.weaponUpgrades.melee = "sunder";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6, 6], impacts: [6, 6, 6], location: 1 },
  } });
  assert.equal(a1.hull.max, 5);
  assert.equal(a1.hull.sp <= a1.hull.max, true);
});

test("Dead Weight: a damaging Anchor hit blocks the target's next Disengage", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Anchor";
  b1.weaponUpgrades.melee = "dead-weight";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6], impacts: [6], location: 1 },
  } });
  assert.equal(a1.noDisengageNextActivation, true);
  assert.equal(a1.engagedWith, b1.id);
});

test("Dead Weight: a rig flagged noDisengageNextActivation cannot Disengage", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  __test.setEngagement(b1, a1);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  b1.noDisengageNextActivation = true;
  const used = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } });
  assert.equal(r.game.turn.actionsUsed, used); // refused, no slot spent
  assert.equal(b1.engagedWith, a1.id);          // still locked
});

test("createRoom seeds owner=null and a default 54x36 field with objectives", () => {
  const r = createRoom("F1");
  assert.equal(r.ownerSide, null);
  assert.equal(r.field.width, 54);
  assert.equal(r.field.height, 36);
  assert.equal(r.field.diagonal, "tlbr");
  assert.equal(r.field.locked, false);
  assert.deepEqual(r.field.terrain, []);
  assert.equal(r.game.objectives.length, 3);
  assert.deepEqual(r.game.objectives[0], { x: 27, y: 18, vp: 2 });
});

test("claimSide assigns ownerSide to the first claimant only", () => {
  const r = createRoom("F2");
  claimSide(r, { name: "Ana", side: "b" }); // owner can be side b
  assert.equal(r.ownerSide, "b");
  claimSide(r, { name: "Bo", side: "a" });
  assert.equal(r.ownerSide, "b"); // unchanged by later claims
});

test("publicState exposes field and ownerSide", () => {
  const r = createRoom("F3");
  claimSide(r, { name: "Ana", side: "a" });
  const view = publicState(r, "a");
  assert.equal(view.ownerSide, "a");
  assert.equal(view.field.width, 54);
});

// Deterministic RNG so terrain is reproducible in command tests.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("field set clamps dims, recomputes objectives, scatters terrain (owner only)", () => {
  const r = createRoom("C1");
  claimSide(r, { name: "Ana", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "set", width: 48, height: 32 } },
    { side: "a" }, { random: seededRandom(7) });
  assert.equal(r.field.width, 48);
  assert.equal(r.field.height, 32);
  assert.equal(r.game.objectives[0].x, 24); // new centre
  // The `set` command scatters terrain; the generator's count/variety/shape
  // contract is owned by field.test.js. Here we only confirm the command
  // produced an in-bounds scatter (robust to the generator implementation).
  assert.ok(r.field.terrain.length > 0, `expected a terrain scatter, got ${r.field.terrain.length}`);
  for (const t of r.field.terrain) {
    assert.ok(t.x > 0 && t.x < r.field.width && t.y > 0 && t.y < r.field.height);
  }
});

test("field command is ignored for non-owner and after start", () => {
  const r = createRoom("C2");
  claimSide(r, { name: "Ana", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "set", width: 40, height: 30 } },
    { side: "b" }); // side b is not the owner
  assert.equal(r.field.width, 54);
  r.game.started = true;
  applyCommand(r, { verb: "field", attrs: { action: "set", width: 40, height: 30 } },
    { side: "a" });
  assert.equal(r.field.width, 54);
});

test("field reroll changes terrain but not objectives", () => {
  const r = createRoom("C3");
  claimSide(r, { name: "Ana", side: "a" });
  applyCommand(r, { verb: "field", attrs: { action: "set", width: 60, height: 40 } },
    { side: "a" }, { random: seededRandom(3) });
  const objs = JSON.stringify(r.game.objectives);
  applyCommand(r, { verb: "field", attrs: { action: "reroll" } },
    { side: "a" }, { random: seededRandom(99) });
  assert.equal(JSON.stringify(r.game.objectives), objs); // unchanged
});

test("Ready is blocked until the owner locks the field", () => {
  const r = createRoom("C4");
  claimSide(r, { name: "Ana", side: "a" });
  const W2 = { lr: "Mini Gun", melee: "Sword", class: "light" };
  for (const name of ["r1", "r2", "r3"]) {
    applyCommand(r, { verb: "add", attrs: { name, owner: "a", ...W2 } }, { side: "a" });
  }
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, { side: "a" });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, false); // field not locked
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, { side: "a" });
  assert.equal(r.game.sides.find((s) => s.id === "a").ready, true);
});

test("prepare action places a facedown reaction of the chosen type", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "prepare", prep: "evasive" } });
  const rig = findRig(r, "b1");
  assert.deepEqual(rig.preparation, { type: "evasive", source: "action", faceUp: false });
});

test("answer token places a facedown reaction and spends a token", () => {
  const r = startedRoom(); // side "a" holds 1 answer token
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  const rig = findRig(r, "a1");
  assert.deepEqual(rig.preparation, { type: "brace", source: "answer", faceUp: false });
  assert.equal(r.game.answerTokens.a, 0);
});

test("publicState hides an opponent's facedown reaction but not the owner's", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "return", side: "a" } });
  const asOwner = publicState(r, "a").rigs.find((x) => x.name === "a1");
  const asFoe = publicState(r, "b").rigs.find((x) => x.name === "a1");
  assert.equal(asOwner.preparation.type, "return");           // owner sees the type
  assert.deepEqual(asFoe.preparation, { hidden: true });      // foe sees only "set"
});

test("publicState reveals a face-up reaction to everyone", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "brace", side: "a" } });
  findRig(r, "a1").preparation.faceUp = true;
  const asFoe = publicState(r, "b").rigs.find((x) => x.name === "a1");
  assert.equal(asFoe.preparation.type, "brace");
});

test("evasive react with evaded=true fails the attack and deals no damage", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  assert.equal(r.game.pendingReaction.kind, "evasive");
  const before = { ...findRig(r, "a1").hull };
  applyCommand(r, { verb: "react", attrs: { evaded: true, side: "a" } });
  assert.equal(r.game.pendingReaction, null);
  assert.equal(findRig(r, "a1").preparation, null);          // consumed
  assert.deepEqual(findRig(r, "a1").hull, before);            // undamaged
  assert.ok(findRig(r, "b1").engine.heat >= 1);              // attacker still ran hot
});

test("return-fire react lets the defender counter the attacker", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "return", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1, 1, 1, 1, 1, 1, 1] }, // all misses — target survives so Return triggers
  } });
  assert.equal(r.game.pendingReaction.kind, "return");
  const n = r.game.resolutions.length;
  applyCommand(r, { verb: "react", attrs: {
    side: "a", attack: { weapon: "longRange", arc: "front", range: "near" },
  } });
  assert.equal(r.game.pendingReaction, null);
  assert.equal(findRig(r, "a1").preparation, null);          // consumed
  assert.ok(r.game.resolutions.length > n);                  // a counter-attack was logged
});

test("an engaged reactor can still return ranged fire (engaged penalty path runs)", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "return", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1, 1, 1, 1, 1, 1, 1] }, // all misses — target survives so Return triggers
  } });
  assert.equal(r.game.pendingReaction.kind, "return");
  // Lock the reactor in melee — its return ranged fire must take the -2 engaged path.
  findRig(r, "a1").engagedWith = findRig(r, "b1").id;
  const n = r.game.resolutions.length;
  applyCommand(r, { verb: "react", attrs: {
    side: "a", attack: { weapon: "longRange", arc: "front", range: "near" },
  } });
  assert.equal(r.game.pendingReaction, null);
  assert.equal(findRig(r, "a1").preparation, null);          // consumed
  assert.ok(r.game.resolutions.length > n);                  // a counter-attack was logged
});

test("react is ignored from the wrong side", () => {
  const r = startedRoom();
  applyCommand(r, { verb: "answer", attrs: { name: "a1", prep: "evasive", side: "a" } });
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "brace", side: "a" } });
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
  } });
  applyCommand(r, { verb: "react", attrs: { evaded: true, side: "b" } }); // attacker can't answer
  assert.equal(r.game.pendingReaction.kind, "evasive");      // still parked
});

test("reset returns a mid/finished battle to a fresh pre-start state, keeping the same rigs", () => {
  const r = startedRoom(); // phase "activation", turn.side === "b"
  // Bang up a rig and drive some in-battle state before resetting.
  applyCommand(r, { verb: "damage", attrs: { name: "a1", loc: "hull", amount: "3" } });
  applyCommand(r, { verb: "damage", attrs: { name: "a1", loc: "arms", amount: "5" } }); // destroy arms -> cascade
  applyCommand(r, { verb: "heat", attrs: { name: "a1", amount: "3" } });
  applyCommand(r, { verb: "action", attrs: { name: "a1", action: "prepare", prep: "brace" } }); // no-op (not a1's turn) but exercise answer path
  applyCommand(r, { verb: "answer", attrs: { name: "a2", prep: "evasive", side: "a" } });
  const rig = findRig(r, "a1");
  assert.ok(rig.hull.sp < rig.hull.max || rig.arms.destroyed); // sanity: battle actually mutated
  const rigCountBefore = r.rigs.length;

  const versionBefore = r.version;
  applyCommand(r, { verb: "reset" }, { side: "a" });

  assert.ok(r.version > versionBefore); // version bumped per convention

  assert.equal(r.game.started, false);
  assert.equal(r.game.phase, "setup");
  assert.equal(r.game.round, 1);
  assert.equal(r.game.turn, null);
  assert.equal(r.game.resolutions.length, 0);
  assert.deepEqual(r.game.recoveryClaims, {});
  assert.equal(r.game.outcome, null);
  assert.equal(r.game.pendingBlast, null);
  assert.equal(r.game.pendingAnswer, null);
  assert.equal(r.game.pendingReaction, null);
  assert.deepEqual(r.game.answerTokens, { a: 0, b: 0 });

  assert.equal(r.rigs.length, rigCountBefore);
  assert.ok(r.rigs.length > 0);

  for (const rg of r.rigs) {
    for (const loc of ["hull", "arms", "legs", "engine"]) {
      assert.equal(rg[loc].sp, rg[loc].max, `${rg.name} ${loc} sp restored`);
      assert.equal(rg[loc].destroyed, false, `${rg.name} ${loc} not destroyed`);
    }
    assert.equal(rg.engine.heat, 0);
    assert.equal(rg.activated, false);
    assert.equal(rg.destroyed, false);
    assert.equal(rg.skipNextActivation, false);
    assert.equal(rg.immobilised, false);
    assert.equal(rg.hardened, false);
    assert.equal(rg.overclockCoreUsed, false);
    assert.equal(rg.actionPenaltyNextActivation, 0);
    assert.equal(rg.preparation, null);
    assert.deepEqual(rg.weaponsDestroyed, []);
    if (rg.loaded) {
      assert.equal(rg.loaded.longRange, true);
      assert.equal(rg.loaded.melee, true);
    }
  }

  for (const side of r.game.sides) {
    assert.equal(side.ready, false);
    assert.equal(side.vp, 0);
  }
});

test("makeRig exposes a parts map aliasing the four fixed component fields", () => {
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  assert.equal(rig.kind, "rig");
  assert.equal(rig.parts.hull, rig.hull);
  assert.equal(rig.parts.arms, rig.arms);
  assert.equal(rig.parts.legs, rig.legs);
  assert.equal(rig.parts.engine, rig.engine);
});

test("ensureRigShape backfills parts alias + kind on legacy rig objects", () => {
  const legacy = {
    id: 9, name: "Legacy", weightClass: "medium", owner: "a",
    hull: { sp: 7, max: 7, destroyed: false },
    arms: { sp: 6, max: 6, destroyed: false },
    legs: { sp: 6, max: 6, destroyed: false },
    engine: { sp: 5, max: 5, destroyed: false, heat: 0 },
    weapons: { longRange: "Autocannon", melee: "Sword" },
  };
  const room = createRoom("R"); claimSide(room, { name: "u", side: "a" });
  room.rigs = [legacy];
  __test.ensureRigShape(legacy);
  assert.equal(legacy.kind, "rig");
  assert.equal(legacy.parts.hull, legacy.hull);
  assert.equal(legacy.parts.engine, legacy.engine);
});

test("makeUnit('rig', ...) returns a rig identical to makeRig", () => {
  const a = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  const b = makeUnit("rig", 1, "Alpha", "a", {
    weightClass: "medium", longRange: "Autocannon", melee: "Sword",
  });
  assert.ok(b, "makeUnit returned a rig");
  assert.equal(b.kind, "rig");
  assert.equal(b.weightClass, "medium");
  assert.equal(b.name, "Alpha");
  // Every top-level scalar / component matches.
  assert.deepEqual({ ...a, parts: undefined }, { ...b, parts: undefined });
  // parts alias is fresh but points at the correct new component objects.
  assert.equal(b.parts.hull, b.hull);
  assert.equal(b.parts.engine, b.engine);
});

test("makeUnit forwards equipmentUpgrade to the rig", () => {
  const rig = makeUnit("rig", "u1", "U", "a", {
    weightClass: "light", longRange: "Crossbow", melee: "Talon",
    equipment: "ablative-plating", equipmentUpgrade: "reinforced-plating",
  });
  assert.equal(rig.equipmentUpgrade, "reinforced-plating");
});

test("makeUnit rejects unknown kinds", () => {
  assert.equal(makeUnit("banana", 1, "X", "a", {}), null);
});

test("UNIT_WEAPONS holds the strawman flat catalogue", () => {
  const ids = Object.keys(UNIT_WEAPONS).sort();
  assert.deepEqual(ids, [
    "Autocannon Mount", "Coaxial MG", "Dozer Blade", "Ram Spike", "Rocket Pod", "Sidearm", "Tank Cannon",
  ]);
  for (const [name, w] of Object.entries(UNIT_WEAPONS)) {
    assert.equal(typeof w.rof, "number");
    assert.equal(typeof w.str, "number");
    if (w.melee) {
      assert.ok(Array.isArray(w.acc), `${name} melee keeps acc[]`);
      assert.ok(Array.isArray(w.rng), `${name} melee keeps rng[]`);
    } else {
      assert.equal(typeof w.sweet, "number", `${name} has sweet`);
      assert.equal(typeof w.peak, "number", `${name} has peak`);
      assert.equal(typeof w.dropoff, "number", `${name} has dropoff`);
      assert.equal(typeof w.minRange, "number", `${name} has minRange`);
      assert.equal(typeof w.maxRange, "number", `${name} has maxRange`);
    }
    assert.equal(w.perks, undefined, `${name} is stat-only, no perks`);
    assert.equal(w.flatPick, true, `${name} carries flatPick marker`);
  }
});

test("every chassis carries a whole-inch speed", () => {
  for (const c of CHASSIS) {
    assert.equal(typeof c.speed, "number", `${c.id} has speed`);
    assert.ok(Number.isInteger(c.speed), `${c.id} speed is a whole inch`);
  }
});

test("speed bands reinforce the weight ladder (fastest medium < slowest light)", () => {
  const lights = CHASSIS.filter((c) => c.class === "light").map((c) => c.speed);
  const mediums = CHASSIS.filter((c) => c.class === "medium").map((c) => c.speed);
  assert.ok(
    Math.max(...mediums) < Math.min(...lights),
    "fastest medium must be strictly slower than slowest light",
  );
});

test("chassis speeds match the tuned table", () => {
  const byId = Object.fromEntries(CHASSIS.map((c) => [c.id, c.speed]));
  assert.deepEqual(byId, {
    "light-claw-autocannon": 5,
    "light-missile-flamethrower": 5,
    "light-saw-minigun": 6,
    "light-wreckingball-double": 6,
    "light-sword-arc": 5,
    "light-harpoon-anchor": 5,
    "light-rivet-pressureclaw": 6,
    "medium-lance-mortar": 3,
    "medium-shield-siege": 3,
    "medium-sniper-chainsaw": 4,
    "medium-crossbow-talon": 4,
  });
});

test("normalizeUnitWeapon is case-insensitive and rejects unknown names", () => {
  assert.equal(normalizeUnitWeapon("tank cannon"), "Tank Cannon");
  assert.equal(normalizeUnitWeapon(""), null);
  assert.equal(normalizeUnitWeapon("Chainsaw"), null);
});

test("makeUnit('tank', ...) returns a valid tank with the four parts", () => {
  const t = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  assert.ok(t);
  assert.equal(t.kind, "tank");
  assert.equal(t.owner, "a");
  assert.equal(t.parts.hull.sp, 8);
  assert.equal(t.parts.tracks.sp, 7);
  assert.equal(t.parts.turret.sp, 6);
  assert.equal(t.parts.engine.sp, 6);
  assert.equal(t.weapons.unit, "Tank Cannon");
  assert.equal(t.equipment, null);
  assert.equal(t.destroyed, false);
});

test("makeUnit('tank', ...) rejects a weapon not in the flat catalogue", () => {
  const t = makeUnit("tank", 1, "Bulwark", "a", { unit: "Not A Weapon" });
  assert.equal(t, null);
});

test("makeUnit('walker', ...) uses the walker part table", () => {
  const w = makeUnit("walker", 1, "Sentinel", "a", { unit: "Autocannon Mount" });
  assert.ok(w);
  assert.equal(w.kind, "walker");
  assert.equal(w.parts.legs.sp, 6);
  assert.equal(w.parts.mount.sp, 5);
});

test("activation reads actionBudget from the unit registry (rig = 3)", () => {
  // There is no `start` verb in this codebase — the startedRoom() dance
  // (claim + add rigs + field lock + both sides ready) is the setup that gets
  // the game into activation phase with a live turn. Regression-pin the
  // Rig's registry-derived budget of 3 by running an actual `activate`.
  const r = startedRoom(); // turn.side === "b" after ready-order dance
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.actionsMax, 3);
});

test("add command commissions a Tank", () => {
  const clean = createRoom("R2"); claimSide(clean, { name: "u", side: "a" });
  applyCommand(clean, { verb: "add", attrs: { name: "Bulwark", kind: "tank", owner: "a", unit: "Tank Cannon" } });
  const tank = clean.rigs.find((r) => r.name === "Bulwark");
  assert.ok(tank);
  assert.equal(tank.kind, "tank");
  assert.equal(tank.weapons.unit, "Tank Cannon");
});

test("add command commissions a Walker", () => {
  const clean = createRoom("R3"); claimSide(clean, { name: "u", side: "a" });
  applyCommand(clean, { verb: "add", attrs: { name: "Sentinel-1", kind: "walker", owner: "a", unit: "Autocannon Mount" } });
  const w = clean.rigs.find((r) => r.name === "Sentinel-1");
  assert.ok(w);
  assert.equal(w.kind, "walker");
});

test("add command ignores an unknown kind", () => {
  const clean = createRoom("R4"); claimSide(clean, { name: "u", side: "a" });
  applyCommand(clean, { verb: "add", attrs: { name: "Ghost", kind: "banana", owner: "a", unit: "Tank Cannon" } });
  assert.equal(clean.rigs.find((r) => r.name === "Ghost"), undefined);
});

test("add command with no kind defaults to rig (regression)", () => {
  const clean = createRoom("R5"); claimSide(clean, { name: "u", side: "a" });
  applyCommand(clean, { verb: "add", attrs: { name: "Alpha", class: "medium", owner: "a", longRange: "Autocannon", melee: "Sword" } });
  const rig = clean.rigs.find((r) => r.name === "Alpha");
  assert.ok(rig);
  assert.equal(rig.kind, "rig");
  assert.equal(rig.weightClass, "medium");
});

test("Tank turret 0 SP: weapon destroyed, munition cook-off (1 hull + 1 engine)", () => {
  const room = createRoom("Rt"); claimSide(room, { name: "u", side: "a" });
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  const hullBefore = tank.parts.hull.sp;
  const engineBefore = tank.parts.engine.sp;
  tank.parts.turret.sp = 1;
  __test.applyDamage(room, tank, "turret", 1, {});
  assert.ok(tank.weaponsDestroyed.includes("Tank Cannon"));
  assert.equal(tank.parts.hull.sp, hullBefore - 1);
  assert.equal(tank.parts.engine.sp, engineBefore - 1);
});

test("Tank engine 0 SP: skipNextActivation (no equipment escape)", () => {
  const room = createRoom("Rt2"); claimSide(room, { name: "u", side: "a" });
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  tank.parts.engine.sp = 1;
  __test.applyDamage(room, tank, "engine", 1, {});
  assert.equal(tank.skipNextActivation, true);
});

test("Tank endActivation skips the overheat roll (cold kind)", () => {
  const room = createRoom("Rt3"); claimSide(room, { name: "u", side: "a" });
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  // Force the room into activation phase with this tank active. Simplest path:
  // set the turn shape directly since Tank pre-battle setup isn't wired yet.
  room.game.phase = "activation";
  room.game.turn = { activeRigId: tank.id, side: "a", actionsUsed: 0, actionsMax: 2, longRangeShots: 0 };
  // Would have exploded if overheat routing ran — cold kinds must skip it.
  applyCommand(room, { verb: "endactivation", attrs: { name: "Bulwark", dice: { overheat: 12 } } });
  assert.equal(tank.destroyed, false);
});

test("Tank activation sets actionsMax = 2 (registry actionBudget)", () => {
  const room = createRoom("Rt4"); claimSide(room, { name: "u", side: "a" });
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  // Force activation phase without needing a Ready dance.
  room.game.phase = "activation";
  room.game.turn = { activeRigId: null, side: "a", actionsUsed: 0, actionsMax: 0 };
  applyCommand(room, { verb: "activate", attrs: { name: "Bulwark" } }, { side: "a" });
  assert.equal(room.game.turn.actionsMax, 2);
});

test("a cold kind (Tank/Walker) can Move but not Sprint — no heat to redline", () => {
  const room = createRoom("Rmv"); claimSide(room, { name: "u", side: "a" });
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  room.game.phase = "activation";
  room.game.turn = { activeRigId: tank.id, side: "a", actionsUsed: 0, actionsMax: 2, longRangeShots: 0 };
  applyCommand(room, { verb: "action", attrs: { name: "Bulwark", action: "sprint" } });
  assert.equal(room.game.turn.actionsUsed, 0);   // sprint refused, no slot spent
  applyCommand(room, { verb: "action", attrs: { name: "Bulwark", action: "move" } });
  assert.equal(room.game.turn.actionsUsed, 1);   // move allowed
});

test("formatBattleState renders a Tank without heat and with a single unit weapon", () => {
  const room = createRoom("Rfmt"); claimSide(room, { name: "u", side: "a" });
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  const view = formatBattleState(room, "a");
  assert.ok(view.includes("Bulwark (Tank, owner a)"));
  assert.ok(view.includes("hull 8/8"));
  assert.ok(view.includes("tracks 7/7"));
  assert.ok(view.includes("turret 6/6"));
  assert.ok(view.includes("engine 6/6")); // no "heat" suffix — cold kind
  assert.ok(!/engine 6\/6 heat/.test(view));
  assert.ok(view.includes("weapon Tank Cannon"));
});

test("formatBattleState surfaces a support unit's modules in its line", () => {
  const room = createRoom("Rmod"); claimSide(room, { name: "u", side: "a" });
  const walker = makeUnit("walker", 1, "Welder", "a", { modules: ["repair", "recon"] });
  room.rigs.push(walker);
  const view = formatBattleState(room, "a");
  assert.match(view, /modules repair, recon/);
});

test("formatBattleState flags a painted enemy [PAINTED] only while its painter is alive", () => {
  const room = createRoom("Rpaint"); claimSide(room, { name: "u", side: "a" });
  const painter = makeUnit("walker", 1, "Spotter", "a", { modules: ["repair", "recon"] });
  const foe = makeUnit("tank", 2, "Foe", "b", { unit: "Tank Cannon" });
  foe.painted = { by: "a", painterId: 1 };
  room.rigs.push(painter, foe);
  const alive = formatBattleState(room, "b");
  assert.match(alive, /Foe \(Tank, owner b\).*\[PAINTED\]/);

  painter.destroyed = true;
  const dead = formatBattleState(room, "b");
  assert.doesNotMatch(dead, /\[PAINTED\]/);
});

test("__test.setRigSp sets skipNextActivation via power-role, not literal 'engine'", () => {
  const room = createRoom("Rp"); claimSide(room, { name: "u", side: "a" });
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  __test.setRigSp(tank, "engine", 0); // tank's engine IS its power part (name matches by design)
  assert.equal(tank.skipNextActivation, true);
});

test("performAction 'prepare' is refused for cold kinds (reactions: false)", () => {
  const room = createRoom("Rq"); claimSide(room, { name: "u", side: "a" });
  const tank = makeUnit("tank", 1, "Bulwark", "a", { unit: "Tank Cannon" });
  room.rigs.push(tank);
  room.game.phase = "activation";
  room.game.turn = { activeRigId: tank.id, side: "a", actionsUsed: 0, actionsMax: 2, longRangeShots: 0 };
  applyCommand(room, { verb: "action", attrs: { name: "Bulwark", action: "prepare", prep: "brace" } });
  assert.equal(tank.preparation, null);
  assert.equal(room.game.turn.actionsUsed, 0);
});

test("randomRigWeapons returns a valid lr+melee pair with upgrade ids", () => {
  const seq = [0, 0, 0, 0]; let i = 0;
  const rng = () => seq[i++ % seq.length];
  const w = randomRigWeapons(rng);
  assert.ok(Object.keys(WEAPONS.longRange).includes(w.longRange));
  assert.ok(Object.keys(WEAPONS.melee).includes(w.melee));
  if (w.longRangeUpgrade) {
    assert.ok((WEAPON_UPGRADES[w.longRange] || []).some((u) => u.id === w.longRangeUpgrade));
  }
});

test("randomEquipment returns a valid EQUIPMENT key", () => {
  const eq = randomEquipment(() => 0);
  assert.ok(Object.keys(EQUIPMENT).includes(eq));
});

test("randomize verb rebuilds a rig in place, preserving id/name/owner", () => {
  const r = createRoom("RND1");
  applyCommand(r, { verb: "add", attrs: { name: "Alpha", class: "medium", owner: "a", lr: "Mini Gun", melee: "Sword" } });
  const before = findRig(r, "Alpha");
  const beforeId = before.id;
  applyCommand(r, { verb: "randomize", attrs: { name: "Alpha" } }, {}, { random: () => 0.99 });
  const after = findRig(r, "Alpha");
  assert.equal(after.id, beforeId);
  assert.equal(after.name, "Alpha");
  assert.equal(after.owner, "a");
  assert.equal(after.kind, "rig");
  assert.ok(after.weapons.longRange && after.weapons.melee);
  assert.equal(after.hull.sp, after.hull.max);
});

test("setEngagement links both ends symmetrically", () => {
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  assert.equal(__test.setEngagement(a, b), true);
  assert.equal(a.engagedWith, 2);
  assert.equal(b.engagedWith, 1);
});

test("setEngagement is one-to-one: refuses if either rig already engaged", () => {
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  const c = makeRig(3, "b2", "light", "b", W);
  assert.equal(__test.setEngagement(a, b), true);
  assert.equal(__test.setEngagement(a, c), false); // a already engaged
  assert.equal(c.engagedWith, null);
});

test("clearEngagement clears both ends", () => {
  const room = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  room.rigs = [a, b];
  __test.setEngagement(a, b);
  __test.clearEngagement(room, a);
  assert.equal(a.engagedWith, null);
  assert.equal(b.engagedWith, null);
});

test("maybeEngage refuses friendlies and dead rigs", () => {
  const a = makeRig(1, "a1", "light", "a", W);
  const friend = makeRig(2, "a2", "light", "a", W);
  const enemyDead = makeRig(3, "b1", "light", "b", W);
  enemyDead.destroyed = true;
  assert.equal(__test.maybeEngage(null, a, friend), false); // same side
  assert.equal(__test.maybeEngage(null, a, enemyDead), false); // dead
  assert.equal(a.engagedWith, null);
});

test("makeRig and makeUnit default engagedWith to null", () => {
  assert.equal(makeRig(1, "a1", "light", "a", W).engagedWith, null);
  const tank = makeUnit("tank", 2, "t1", "b", { unit: "Tank Cannon" });
  assert.equal(tank.engagedWith, null);
});

test("destroying an engaged rig clears the link on both ends", () => {
  const room = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  room.rigs = [a, b];
  room.game.started = true;
  __test.setEngagement(a, b);
  // Zero every location (already destroyed), then one more hit exercises the cascade.
  for (const p of ["hull", "arms", "legs", "engine"]) __test.setRigSp(b, p, 0);
  __test.applyDamage(room, b, "hull", 1, { random: () => 0 });
  assert.equal(b.destroyed, true);
  assert.equal(b.engagedWith, null);
  assert.equal(a.engagedWith, null); // partner freed too
});

test("immobilising an engaged rig clears the link", () => {
  const room = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  room.rigs = [a, b];
  __test.setEngagement(a, b);
  __test.setRigSp(b, "legs", 0);            // legs to 0 (first time — not yet immobile)
  __test.applyDamage(room, b, "legs", 1, {}); // additional damage to 0-SP legs → immobilised
  assert.equal(b.immobilised, true);
  assert.equal(b.engagedWith, null);
  assert.equal(a.engagedWith, null);
});

test("a catastrophic overheat clears the engaged rig's lock", () => {
  const room = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  room.rigs = [a, b];
  room.game.started = true;
  __test.setEngagement(a, b);
  __test.applyOverheat(room, b, 17, { random: () => 0 }); // 17 = catastrophic row
  assert.equal(b.destroyed, true);
  assert.equal(b.engagedWith, null);
  assert.equal(a.engagedWith, null);
});

test("engagement survives Recovery (unlike preparation)", () => {
  const room = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  room.rigs = [a, b];
  __test.setEngagement(a, b);
  a.preparation = { type: "brace", faceUp: false };
  __test.runRecovery(room);
  assert.equal(a.preparation, null);   // prep cleared as before
  assert.equal(a.engagedWith, 2);      // engagement persists
  assert.equal(b.engagedWith, 1);
});

test("a legal melee attack engages attacker and target", () => {
  const r = startedRoom(); // b's turn
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1], impacts: [1, 1], location: 1 },
  } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  assert.equal(b1.engagedWith, a1.id);
  assert.equal(a1.engagedWith, b1.id);
});

test("an out-of-reach melee attack does not engage", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "out",
  } });
  assert.equal(findRig(r, "b1").engagedWith, null);
  assert.equal(findRig(r, "a1").engagedWith, null);
});

test("a ranged attack does not engage", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", distance: 7,
    dice: { toHit: [1, 1, 1, 1, 1, 1, 1, 1], location: 1 },
  } });
  assert.equal(findRig(r, "b1").engagedWith, null);
});

test("an engaged rig cannot Move or Sprint", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  __test.setEngagement(b1, a1); // lock b1 to a1
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(r.game.turn.actionsUsed, 0);   // move rejected — no slot spent
  assert.equal(b1.engine.heat, heatBefore);   // no heat added
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } });
  assert.equal(r.game.turn.actionsUsed, 0);   // sprint rejected too
});

test("an unengaged rig moves normally", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(r.game.turn.actionsUsed, 1);   // still works when not engaged
});

test("Disengage frees both rigs and costs 1 slot + 1 heat", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  __test.setEngagement(b1, a1);
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } });
  assert.equal(b1.engagedWith, null);
  assert.equal(a1.engagedWith, null);          // mutual — partner freed
  assert.equal(r.game.turn.actionsUsed, 1);    // one slot
  assert.equal(b1.engine.heat, heatBefore + 1); // +1 heat
});

test("Disengage then Move works in the same activation", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  __test.setEngagement(b1, findRig(r, "a1"));
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } }); // now unlocked
  assert.equal(r.game.turn.actionsUsed, 2);
});

test("Disengage is a no-op when the rig is not engaged", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } });
  assert.equal(r.game.turn.actionsUsed, 0); // nothing spent
});

test("Move with an engage declaration forms the pair", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move", engage: "a1" } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  assert.equal(r.game.turn.actionsUsed, 1); // the move still spends its slot
  assert.equal(b1.engagedWith, a1.id);      // and forms the lock
  assert.equal(a1.engagedWith, b1.id);
});

test("Move engage declaration against a friendly is ignored but the move still happens", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move", engage: "b2" } });
  const b1 = findRig(r, "b1");
  assert.equal(r.game.turn.actionsUsed, 1); // move resolves
  assert.equal(b1.engagedWith, null);       // no engagement (same side)
});

test("remove clears the removed rig's engagement on its partner", () => {
  const r = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  r.rigs = [a, b];
  __test.setEngagement(a, b);
  applyCommand(r, { verb: "remove", attrs: { name: "b1" } });
  assert.equal(findRig(r, "a1").engagedWith, null); // partner freed, no dangling link
});

test("randomize clears engagement so no asymmetric link remains", () => {
  const r = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  r.rigs = [a, b];
  __test.setEngagement(a, b);
  applyCommand(r, { verb: "randomize", attrs: { name: "b1" } });
  assert.equal(findRig(r, "a1").engagedWith, null); // partner freed
  assert.equal(findRig(r, "b1").engagedWith, null); // fresh rig unengaged (symmetric)
});

test("reset clears engagement between matches", () => {
  const r = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  r.rigs = [a, b];
  __test.setEngagement(a, b);
  applyCommand(r, { verb: "reset", attrs: {} });
  assert.equal(findRig(r, "a1").engagedWith, null);
  assert.equal(findRig(r, "b1").engagedWith, null);
});

test("reset clears every transient combat status so nothing leaks into the next match", () => {
  const r = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  r.rigs = [a, b];
  // Simulate mid-match marks/stacks/counters/maps that outlive the match.
  b.anchoredBy = a.id;
  b.skeweredBy = a.id;
  a.rivetTarget = b.id; a.rivetLoc = "arms"; a.rivetStacks = 2;
  b.rivetSeized = { arms: 5 };
  b.burning = 3;
  a.suppressTarget = b.id; a.suppressStacks = 3; b.suppressImmobile = true;
  a.autocannonShots = 2; a.autocannonSlowNext = true; a.enfiladeShots = 2;
  a.arcLockedNext = true; b.noPrepNextActivation = true; b.noActivesNextActivation = true;
  a.lockedTarget = b.id; a.lockExpiresRound = 9;
  b.cracked = { hull: 5 }; b.crippled = { arms: true }; b.noRepair = { arms: true };
  b.kneecapped = { legs: true }; b.armsSuppressed = true;
  applyCommand(r, { verb: "reset", attrs: {} });
  const a1 = findRig(r, "a1");
  const b1 = findRig(r, "b1");
  // Anchor/skewer/rivet marks.
  assert.equal(b1.anchoredBy, null);
  assert.equal(b1.skeweredBy, null);
  assert.equal(a1.rivetTarget, null);
  assert.equal(a1.rivetLoc, null);
  assert.equal(a1.rivetStacks, 0);
  assert.deepEqual(b1.rivetSeized, {});
  // Every other transient status.
  assert.equal(b1.burning, 0);
  assert.equal(a1.suppressTarget, null);
  assert.equal(a1.suppressStacks, 0);
  assert.equal(b1.suppressImmobile, false);
  assert.equal(a1.autocannonShots, 0);
  assert.equal(a1.autocannonSlowNext, false);
  assert.equal(a1.enfiladeShots, 0);
  assert.equal(a1.arcLockedNext, false);
  assert.equal(b1.noPrepNextActivation, false);
  assert.equal(b1.noActivesNextActivation, false);
  assert.equal(a1.lockedTarget, null);
  assert.equal(a1.lockExpiresRound, 0);
  assert.deepEqual(b1.cracked, {});
  assert.deepEqual(b1.crippled, {});
  assert.deepEqual(b1.noRepair, {});
  assert.deepEqual(b1.kneecapped, {});
  assert.equal(b1.armsSuppressed, false); // re-derived by recompute (arms back at max)
});

test("set-to-destroyed clears the dead rig's engagement", () => {
  const r = createRoom("X");
  const a = makeRig(1, "a1", "light", "a", W);
  const b = makeRig(2, "b1", "light", "b", W);
  r.rigs = [a, b];
  __test.setEngagement(a, b);
  for (const loc of ["hull", "arms", "legs", "engine"]) {
    applyCommand(r, { verb: "set", attrs: { name: "b1", loc, sp: "0" } });
  }
  assert.equal(findRig(r, "b1").destroyed, true);
  assert.equal(findRig(r, "b1").engagedWith, null);
  assert.equal(findRig(r, "a1").engagedWith, null); // partner freed too
});

test("an engaged rig cannot Jump Jets out (must Disengage first)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.equipment = "servo-actuators"; // grant the Jump Jets active
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  __test.setEngagement(b1, findRig(r, "a1"));
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "jumpjets" } });
  assert.equal(r.game.turn.actionsUsed, 0);   // rejected — no slot spent
  assert.equal(b1.engine.heat, heatBefore);   // no heat
});

test("an engaged rig can still use a non-movement active (Harden)", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.equipment = "ablative-plating"; // grants Harden (not movement)
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  __test.setEngagement(b1, findRig(r, "a1"));
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "harden" } });
  assert.equal(r.game.turn.actionsUsed, 1);   // allowed
  assert.equal(b1.hardened, true);
});

// ── §13 Anvil Boss (Bulwark Shield) ──────────────────────────────────────────
// A rig holding Raise Shield with the Anvil Boss upgrade answers the first melee
// attacker each round with a free STR-6 counter-hit. Melee only, once per round.
function anvilRoom(defUpgrade = "anvil-boss") {
  const r = createRoom("ANVIL");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "add", attrs: {
    name: "a1", class: "medium", owner: "a",
    longRange: "Autocannon", melee: "Bulwark Shield", meleeUpgrade: defUpgrade,
  } });
  applyCommand(r, { verb: "add", attrs: {
    name: "b1", class: "medium", owner: "b", longRange: "Autocannon", melee: "Sword",
  } });
  // Each side needs >=3 rigs before it can ready up (§ ready gate).
  for (let i = 2; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `a${i}`, class: "light", owner: "a", ...W } });
    applyCommand(r, { verb: "add", attrs: { name: `b${i}`, class: "light", owner: "b", ...W } });
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  clearPendingAnswer(r);
  return r;
}

const raiseShield = () => ({ type: "raise-shield", source: "action", faceUp: false });
const countRiposte = (r) => r.game.resolutions.filter((x) => x.kind === "riposte").length;

// A melee attack that lands (toHit 6s = hits) vs one that whiffs (toHit 1s).
const meleeLand = { toHit: [6, 6], impacts: [1, 1], location: 1 };
const meleeMiss = { toHit: [1, 1], impacts: [1, 1], location: 1 };
const fireMelee = (r, dice, options) => applyCommand(r, { verb: "action", attrs: {
  name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near", dice,
} }, {}, options);

test("Anvil Boss ripostes the first melee attacker that lands a hit while Raise Shield is up", () => {
  const r = anvilRoom("anvil-boss");
  assert.equal(r.game.turn.side, "b");
  findRig(r, "a1").preparation = raiseShield();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const spSum = (rig) => rig.hull.sp + rig.arms.sp + rig.legs.sp + rig.engine.sp;
  const attackerSpBefore = spSum(findRig(r, "b1"));
  // Incoming melee lands (toHit 6s); the counter uses the raw RNG, forced high so
  // the free STR-6 blow lands back on the attacker.
  fireMelee(r, meleeLand, { random: () => 0.999 });
  assert.equal(findRig(r, "a1").ripostedThisRound, true);
  assert.equal(countRiposte(r), 1);
  assert.ok(spSum(findRig(r, "b1")) < attackerSpBefore, "attacker took counter damage");
});

test("a melee whiff (0 hits) provokes no riposte and does not consume the round", () => {
  const r = anvilRoom("anvil-boss");
  findRig(r, "a1").preparation = raiseShield();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  fireMelee(r, meleeMiss);                          // misses — no hit landed
  assert.equal(findRig(r, "a1").ripostedThisRound, false);
  assert.equal(countRiposte(r), 0);
  fireMelee(r, meleeLand);                          // a later attack that DOES land
  assert.equal(findRig(r, "a1").ripostedThisRound, true);
  assert.equal(countRiposte(r), 1);                // the riposte was still available
});

test("Anvil Boss only ripostes once per round (second landing melee gets nothing)", () => {
  const r = anvilRoom("anvil-boss");
  findRig(r, "a1").preparation = raiseShield();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  fireMelee(r, meleeLand);
  fireMelee(r, meleeLand);
  assert.equal(countRiposte(r), 1);                // second landing hit did not add a counter
  assert.equal(findRig(r, "a1").ripostedThisRound, true);
});

test("Anvil Boss does not riposte a ranged attack", () => {
  const r = anvilRoom("anvil-boss");
  findRig(r, "a1").preparation = raiseShield();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", distance: 7,
    dice: { toHit: [6, 6, 6], location: 1 },   // lands hits, but ranged never ripostes
  } });
  assert.equal(findRig(r, "a1").ripostedThisRound, false);
  assert.equal(countRiposte(r), 0);
});

test("Raise Shield without Anvil Boss does not riposte", () => {
  const r = anvilRoom("tower-shield");
  findRig(r, "a1").preparation = raiseShield();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  fireMelee(r, meleeLand);                          // lands, but no anvil-boss upgrade
  assert.equal(findRig(r, "a1").ripostedThisRound, false);
  assert.equal(countRiposte(r), 0);
});

// ── §13 Skewer (Lance) ───────────────────────────────────────────────────────
// A Lance with the Skewer prototype impales the rig it pins: while the mark holds,
// Disengaging from the skewerer costs the fleeing rig a free STR-11 Lance strike.
function skewerRoom() {
  const r = createRoom("SKEWER");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "add", attrs: {
    name: "a1", class: "medium", owner: "a", longRange: "Autocannon", melee: "Lance", meleeUpgrade: "skewer",
  } });
  applyCommand(r, { verb: "add", attrs: {
    name: "b1", class: "medium", owner: "b", longRange: "Autocannon", melee: "Lance", meleeUpgrade: "skewer",
  } });
  for (let i = 2; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `a${i}`, class: "light", owner: "a", ...W } });
    applyCommand(r, { verb: "add", attrs: { name: `b${i}`, class: "light", owner: "b", ...W } });
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  clearPendingAnswer(r);
  return r;
}

const countSkewer = (r) => r.game.resolutions.filter((x) => x.kind === "skewer").length;
const spSum = (rig) => rig.hull.sp + rig.arms.sp + rig.legs.sp + rig.engine.sp;
const lanceLand = { toHit: [6], impacts: [6], location: 1 };

test("a Lance-skewer hit marks the engaged target as skewered", () => {
  const r = skewerRoom(); // b's turn
  assert.equal(r.game.turn.side, "b");
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near", dice: lanceLand,
  } });
  const b1 = findRig(r, "b1");
  const a1 = findRig(r, "a1");
  assert.equal(b1.engagedWith, a1.id);
  assert.equal(a1.engagedWith, b1.id);
  assert.equal(a1.skeweredBy, b1.id); // the pinned target remembers its skewerer
});

test("disengaging from a Skewer provokes a free STR-11 lance strike, then clears", () => {
  const r = skewerRoom();
  const a1 = findRig(r, "a1"); // the skewerer
  const b1 = findRig(r, "b1"); // the victim — disengages on b's turn
  __test.setEngagement(b1, a1);
  b1.skeweredBy = a1.id;
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const spBefore = spSum(b1);
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } }, {}, { random: () => 0.999 });
  assert.equal(countSkewer(r), 1);                 // a skewer strike was resolved
  assert.ok(spSum(b1) < spBefore, "victim took the free lance strike");
  assert.equal(b1.skeweredBy, null);               // mark cleared
  assert.equal(b1.engagedWith, null);              // engagement broken
  assert.equal(a1.engagedWith, null);
});

test("a non-skewered engaged rig disengages with no free strike", () => {
  const r = skewerRoom();
  const a1 = findRig(r, "a1");
  const b1 = findRig(r, "b1");
  __test.setEngagement(b1, a1); // engaged but NOT skewered
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const spBefore = spSum(b1);
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } }, {}, { random: () => 0.999 });
  assert.equal(countSkewer(r), 0);       // no skewer strike
  assert.equal(spSum(b1), spBefore);     // no damage
  assert.equal(b1.engagedWith, null);    // still disengages normally
});

test("if the skewerer is gone, the victim disengages with no strike and no crash", () => {
  const r = skewerRoom();
  const a1 = findRig(r, "a1");
  const b1 = findRig(r, "b1");
  __test.setEngagement(b1, a1);
  b1.skeweredBy = a1.id;
  a1.destroyed = true; // skewerer knocked out before the victim tears free
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const spBefore = spSum(b1);
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } }, {}, { random: () => 0.999 });
  assert.equal(countSkewer(r), 0);       // dead skewerer can't strike
  assert.equal(spSum(b1), spBefore);     // no damage
  assert.equal(b1.skeweredBy, null);     // mark cleared anyway
  assert.equal(b1.engagedWith, null);    // and the rig disengages
});

// ── §13 Ground Anchor (Anchor) ───────────────────────────────────────────────
// An Anchor with the Ground Anchor prototype pins the rig it locks: while the
// mark holds, Disengaging from the anchorer costs the fleeing rig a free
// Anchor strike at its NATURAL STR (not a flat override, unlike Skewer).
function groundAnchorRoom() {
  const r = createRoom("ANCHOR");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "add", attrs: {
    name: "a1", class: "medium", owner: "a", longRange: "Autocannon", melee: "Anchor", meleeUpgrade: "ground-anchor",
  } });
  applyCommand(r, { verb: "add", attrs: {
    name: "b1", class: "medium", owner: "b", longRange: "Autocannon", melee: "Anchor", meleeUpgrade: "ground-anchor",
  } });
  for (let i = 2; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `a${i}`, class: "light", owner: "a", ...W } });
    applyCommand(r, { verb: "add", attrs: { name: `b${i}`, class: "light", owner: "b", ...W } });
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  clearPendingAnswer(r);
  return r;
}

const countAnchor = (r) => r.game.resolutions.filter((x) => x.kind === "anchor").length;

test("Ground Anchor: a damaging Anchor hit marks the target; Disengage provokes a free strike", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Anchor";
  b1.weaponUpgrades.melee = "ground-anchor";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6], impacts: [6], location: 1 },
  } });
  assert.equal(a1.anchoredBy, b1.id);
  assert.equal(a1.engagedWith, b1.id);
});

test("Ground Anchor: Disengaging off the anchor provokes a free Anchor strike then clears", () => {
  const r = groundAnchorRoom();
  const a1 = findRig(r, "a1"); // the anchorer
  const b1 = findRig(r, "b1"); // the victim — disengages on b's turn
  __test.setEngagement(b1, a1);
  b1.anchoredBy = a1.id;
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const spBefore = spSum(b1);
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "disengage" } }, {}, { random: () => 0.999 });
  assert.equal(countAnchor(r), 1);                 // an anchor strike was resolved
  assert.ok(spSum(b1) < spBefore, "victim took the free anchor strike");
  assert.equal(b1.anchoredBy, null);               // mark cleared
  assert.equal(b1.engagedWith, null);              // engagement broken
  assert.equal(a1.engagedWith, null);
});

// --- Group E: per-location tracking (Breach Grip + Dismember) -----------------

test("makeRig seeds cracked/crippled/noRepair maps and per-location origMax", () => {
  const rig = makeRig(1, "r", "medium", "a", W);
  assert.deepEqual(rig.cracked, {});
  assert.deepEqual(rig.crippled, {});
  assert.deepEqual(rig.noRepair, {});
  assert.deepEqual(rig.origMax, { hull: 7, arms: 6, legs: 6, engine: 5 });
});

test("ensureRigShape back-fills origMax and the Group-E maps on a legacy rig", () => {
  const rig = makeRig(1, "r", "medium", "a", W);
  delete rig.cracked; delete rig.crippled; delete rig.noRepair; delete rig.origMax;
  rig.hull.max = 4; // legacy rig already sundered — origMax should track current max
  __test.ensureRigShape(rig);
  assert.deepEqual(rig.cracked, {});
  assert.deepEqual(rig.crippled, {});
  assert.deepEqual(rig.noRepair, {});
  assert.equal(rig.origMax.hull, 4);
});

test("crackLocation covers a 2-round window (N, N+1) and is gone by N+2", () => {
  const target = makeRig(2, "a1", "medium", "b", W);
  const room = { game: { round: 3, resolutions: [], nextResolutionId: 1 }, rigs: [target] };
  __test.crackLocation(room, target, "hull");
  assert.equal(target.cracked.hull, 4); // round 3 (N) + 1 -> expiry N+1 = 4
  // Recovery at round 4 (N+1) keeps a still-live crack (4 >= 4)...
  room.game.round = 4;
  __test.runRecovery(room);
  assert.equal(target.cracked.hull, 4);
  // ...but it's gone by round 5 (N+2): the sweep drops it (4 < 5).
  room.game.round = 5;
  __test.runRecovery(room);
  assert.equal(target.cracked.hull, undefined);
});

test("a Breach Grip Claw hit cracks the struck location so any later attack gets +2", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Claw";
  b1.weaponUpgrades.melee = "breach-grip";
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6, 6], impacts: [6, 6, 6], location: 1 },
  } });
  assert.equal(a1.cracked.hull, r.game.round + 1);
});

test("Dismember cripples legs (immobilise) once ground to <= half original, not before", () => {
  const target = makeRig(2, "a1", "medium", "b", W); // legs max 6, origMax 6
  const room = { game: { round: 1, resolutions: [], nextResolutionId: 1 }, rigs: [target] };
  // Grind 6 -> 5 -> 4: still above half (3), no cripple.
  __test.dismemberLocation(room, target, "legs", { random: () => 0 });
  __test.dismemberLocation(room, target, "legs", { random: () => 0 });
  assert.equal(target.legs.max, 4);
  assert.equal(target.immobilised, false);
  assert.equal(target.crippled.legs, undefined);
  // One more grind: 4 -> 3 (<= half of 6) -> permanent immobilise.
  __test.dismemberLocation(room, target, "legs", { random: () => 0 });
  assert.equal(target.legs.max, 3);
  assert.equal(target.immobilised, true);
  assert.equal(target.crippled.legs, true);
});

test("Dismember on a weapon location destroys a weapon; on hull it blocks repair", () => {
  const armT = makeRig(2, "a1", "medium", "b", W); // arms max 6
  const room = { game: { round: 1, resolutions: [], nextResolutionId: 1 }, rigs: [armT] };
  armT.arms.max = 4; // simulate prior grinding to just above half
  __test.dismemberLocation(room, armT, "arms", { random: () => 0 }); // 4 -> 3 (<= 3) cripple
  assert.equal(armT.crippled.arms, true);
  assert.equal(armT.weaponsDestroyed.length, 1);

  const hullT = makeRig(3, "a2", "medium", "b", W); // hull max 7, half 3.5
  const room2 = { game: { round: 1, resolutions: [], nextResolutionId: 1 }, rigs: [hullT] };
  hullT.hull.max = 4;
  __test.dismemberLocation(room2, hullT, "hull", { random: () => 0 }); // 4 -> 3 (<= 3.5) cripple
  assert.equal(hullT.crippled.hull, true);
  assert.equal(hullT.noRepair.hull, true);
  const spBefore = hullT.hull.sp; // clamped to the new max 3 by the sunder
  __test.repairRig(hullT, "hull", 3);
  assert.equal(hullT.hull.sp, spBefore); // repair refused on a dismembered hull
});

// --- Rivet Lock (§13, Rivet Gun prototype) -----------------------------------

test("Rivet Lock: 3 volleys on one location seize it — no repair + long-range jammed", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const a1 = findRig(r, "a1");
  a1.weapons.longRange = "Rivet Gun";
  a1.weaponUpgrades.longRange = "rivet-lock";
  const b1 = findRig(r, "b1");
  for (let i = 0; i < 3; i++) __test.rivetHit(r, a1, b1, "arms");
  assert.equal(b1.rivetSeized.arms >= r.game.round, true); // seized (expiry in the future)
  b1.arms.sp = 2;
  __test.repairRig(b1, "arms", 3);
  assert.equal(b1.arms.sp, 2); // no repair while seized
});

test("Rivet Lock: switching location resets the rivet stack", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const a1 = findRig(r, "a1");
  a1.weapons.longRange = "Rivet Gun";
  a1.weaponUpgrades.longRange = "rivet-lock";
  const b1 = findRig(r, "b1");
  __test.rivetHit(r, a1, b1, "arms");
  __test.rivetHit(r, a1, b1, "legs"); // switch → resets to 1 on legs
  __test.rivetHit(r, a1, b1, "arms"); // switch back → resets to 1 on arms
  assert.equal(Object.keys(b1.rivetSeized).length, 0); // never reached 3 on one loc
});

test("Rivet Lock: a seized Arms location jams long-range fire but not melee", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1"); // b activates first in this suite
  const a1 = findRig(r, "a1");
  // Seize b1's weapon-role location (arms) directly.
  b1.rivetSeized = { arms: r.game.round + 1 };
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const usedBeforeLR = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", distance: 7,
    dice: { toHit: [1, 1, 1, 1, 1, 1, 1, 1], location: 1 },
  } });
  assert.equal(r.game.turn.actionsUsed, usedBeforeLR); // long-range fire refused (jammed)
  // Melee is unaffected: a melee swing still spends its slot.
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1], impacts: [1, 1], location: 1 },
  } });
  assert.equal(r.game.turn.actionsUsed, usedBeforeLR + 1); // melee went through
});

// --- Emplacement (§13, Bulwark Shield prototype) -----------------------------
// A rooted fortress stance: permanent Raise Shield, a 3→2 action budget, no
// movement, +2 heat to un-plant, and a 3-round cooldown from when it's entered.
function emplaceRoom() {
  const r = createRoom("EMP");
  claimSide(r, { name: "Owner", side: "a" });
  // b1 carries the emplacement Bulwark Shield; b2 a Bulwark Shield with a
  // different (non-emplacement) upgrade; the rest are filler.
  applyCommand(r, { verb: "add", attrs: { name: "b1", class: "medium", owner: "b",
    longRange: "Autocannon", melee: "Bulwark Shield", meleeUpgrade: "emplacement" } });
  applyCommand(r, { verb: "add", attrs: { name: "b2", class: "medium", owner: "b",
    longRange: "Autocannon", melee: "Bulwark Shield", meleeUpgrade: "anvil-boss" } });
  applyCommand(r, { verb: "add", attrs: { name: "b3", class: "light", owner: "b", ...W } });
  for (let i = 1; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `a${i}`, class: "light", owner: "a", ...W } });
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  clearPendingAnswer(r); // b activates first; lift the answer gate
  return r;
}

test("emplace raises the shield, roots the rig, and sets a 3-round cooldown", () => {
  const r = emplaceRoom();
  assert.equal(r.game.round, 1);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "emplace" } });
  const b1 = findRig(r, "b1");
  assert.equal(b1.emplaced, true);
  assert.equal(b1.preparation.type, "raise-shield");
  assert.equal(b1.emplaceCooldownUntil, 4); // round 1 + 3
  assert.equal(r.game.turn.actionsUsed, 1); // emplace spent one slot
});

test("a rig can't re-emplace before its cooldown round", () => {
  const r = emplaceRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "emplace" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "unplant" } });
  const b1 = findRig(r, "b1");
  assert.equal(b1.emplaced, false);
  const used = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "emplace" } });
  assert.equal(b1.emplaced, false);              // still round 1 < cooldownUntil 4
  assert.equal(r.game.turn.actionsUsed, used);   // refused — no slot spent
});

test("an emplaced rig activates with a 2-action budget and a free raised shield", () => {
  const r = emplaceRoom();
  const b1 = findRig(r, "b1");
  b1.emplaced = true;    // already rooted from a prior round
  b1.preparation = null; // Recovery cleared last round's shield
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  assert.equal(r.game.turn.actionsMax, 2);           // base 3 − 1
  assert.equal(b1.preparation.type, "raise-shield"); // auto-raised
  assert.equal(r.game.turn.actionsUsed, 0);          // without spending an action
});

test("an emplaced rig can't Move or Sprint", () => {
  const r = emplaceRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "emplace" } });
  const used = r.game.turn.actionsUsed;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  assert.equal(r.game.turn.actionsUsed, used); // move refused
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } });
  assert.equal(r.game.turn.actionsUsed, used); // sprint refused
});

test("un-planting clears the stance and adds 2 heat", () => {
  const r = emplaceRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "emplace" } });
  const b1 = findRig(r, "b1");
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "unplant" } });
  assert.equal(b1.emplaced, false);
  assert.equal(b1.engine.heat, heatBefore + 2);
});

test("a shield rig without the emplacement upgrade can't emplace", () => {
  const r = emplaceRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b2" } });
  const b2 = findRig(r, "b2");
  applyCommand(r, { verb: "action", attrs: { name: "b2", action: "emplace" } });
  assert.equal(b2.emplaced, false);
  assert.equal(r.game.turn.actionsUsed, 0); // refused — no slot spent
});

// --- Barrage (§13, Mortar prototype) -----------------------------------------
// The Barrage action commits the Mortar to a 2-round shelled zone: the tube is
// locked (no direct fire), each Recovery adds +1 heat and emits the apply-SP
// prompt, then counts down; after 2 Recoveries the mortar unlocks.
function barrageRoom() {
  const r = createRoom("BAR");
  claimSide(r, { name: "Owner", side: "a" });
  // b1: Mortar with the barrage prototype; b2: Mortar with a non-barrage upgrade.
  applyCommand(r, { verb: "add", attrs: { name: "b1", class: "medium", owner: "b",
    longRange: "Mortar", melee: "Sword", longRangeUpgrade: "barrage" } });
  applyCommand(r, { verb: "add", attrs: { name: "b2", class: "medium", owner: "b",
    longRange: "Mortar", melee: "Sword", longRangeUpgrade: "cluster-shells" } });
  applyCommand(r, { verb: "add", attrs: { name: "b3", class: "light", owner: "b", ...W } });
  for (let i = 1; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `a${i}`, class: "light", owner: "a", ...W } });
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  clearPendingAnswer(r); // b activates first; lift the answer gate
  return r;
}

test("barrage commits the tube for 2 rounds and emits the place instruction", () => {
  const r = barrageRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "barrage" } });
  const b1 = findRig(r, "b1");
  assert.equal(b1.barrageRoundsLeft, 2);
  assert.equal(r.game.turn.actionsUsed, 1); // barrage spent one slot
  const placed = r.game.resolutions.find((x) => /Barrage — place a shelled-zone marker/.test(x.summary));
  assert.ok(placed, "expected the barrage place instruction in the log");
});

test("a Mortar committed to a barrage can't fire a direct shot", () => {
  const r = barrageRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "barrage" } });
  const used = r.game.turn.actionsUsed; // 1
  const a1 = findRig(r, "a1");
  const spBefore = a1.hull.sp + a1.arms.sp + a1.legs.sp + a1.engine.sp;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1",
    arc: "front", range: "near", distance: 18, dice: { toHit: [6], impacts: [6], location: 1 },
  } });
  assert.equal(r.game.turn.actionsUsed, used); // fire refused — mortar locked
  const a1b = findRig(r, "a1");
  assert.equal(a1b.hull.sp + a1b.arms.sp + a1b.legs.sp + a1b.engine.sp, spBefore); // target untouched
});

test("Recovery applies +1 barrage upkeep heat, emits the apply-SP prompt, and counts down", () => {
  const r = barrageRoom();
  const b1 = findRig(r, "b1");
  b1.barrageRoundsLeft = 2;
  b1.noCool = true;      // isolate the +1 upkeep from the usual −1 Recovery cooling
  b1.engine.heat = 0;
  __test.runRecovery(r);
  assert.equal(b1.barrageRoundsLeft, 1);   // decremented
  assert.equal(b1.engine.heat, 1);         // +1 upkeep
  const p1 = r.game.resolutions.find((x) => /Barrage active — apply 1 SP/.test(x.summary));
  assert.ok(p1, "expected the per-round apply-SP prompt");
  assert.match(p1.summary, /2 round\(s\) left/); // count shown before the decrement

  __test.runRecovery(r);
  assert.equal(b1.barrageRoundsLeft, 0);   // reaches 0 after the second tick
  assert.equal(b1.engine.heat, 2);         // +1 more

  __test.runRecovery(r);
  assert.equal(b1.barrageRoundsLeft, 0);   // no underflow once finished
  assert.equal(b1.engine.heat, 2);         // and no further upkeep
});

test("a Mortar whose barrage has finished can fire again", () => {
  const r = barrageRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.barrageRoundsLeft = 0; // barrage ended — tube unlocked
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1",
    arc: "front", range: "near", distance: 18, dice: { toHit: [6], impacts: [6], location: 1 },
  } });
  assert.equal(r.game.turn.actionsUsed, 1); // fire went through
});

test("a non-barrage Mortar rig can't use the barrage action", () => {
  const r = barrageRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b2" } });
  const b2 = findRig(r, "b2");
  applyCommand(r, { verb: "action", attrs: { name: "b2", action: "barrage" } });
  assert.equal(b2.barrageRoundsLeft, 0);     // refused
  assert.equal(r.game.turn.actionsUsed, 0);  // no slot spent
});

// --- Tow Chain (§13, Wrecking Ball prototype) --------------------------------
// A damaging Wrecking Ball hit flings the target (narrated), roots the attacker
// for the rest of its activation, adds +2 heat, and goes on a 3-round cooldown.
function towRoom() {
  const r = createRoom("TOW");
  claimSide(r, { name: "Owner", side: "a" });
  applyCommand(r, { verb: "add", attrs: { name: "b1", class: "medium", owner: "b",
    longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "tow-chain" } });
  applyCommand(r, { verb: "add", attrs: { name: "b2", class: "light", owner: "b", ...W } });
  applyCommand(r, { verb: "add", attrs: { name: "b3", class: "light", owner: "b", ...W } });
  for (let i = 1; i <= 3; i++) {
    applyCommand(r, { verb: "add", attrs: { name: `a${i}`, class: "light", owner: "a", ...W } });
  }
  applyCommand(r, { verb: "field", attrs: { action: "lock" } }, { side: "a" });
  applyCommand(r, { verb: "ready", attrs: { side: "a" } }, {}, { random: () => 0 });
  applyCommand(r, { verb: "ready", attrs: { side: "b" } }, {}, { random: () => 0 });
  clearPendingAnswer(r);
  return r;
}

test("a damaging Tow Chain hit flings, adds +2 heat, roots the attacker, and sets a 3-round cooldown", () => {
  const r = towRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1",
    arc: "front", range: "near", dice: { toHit: [6], impacts: [6], location: 1 },
  } });
  assert.equal(b1.towChainCooldownUntil, 4);          // round 1 + 3
  assert.equal(b1.towedThisActivation, true);          // rooted for the rest of the activation
  assert.equal(b1.engine.heat - heatBefore, 3);        // +1 melee fire heat, +2 tow
  const fling = r.game.resolutions.find((x) => /Tow Chain — fling/.test(x.summary));
  assert.ok(fling, "expected a Tow Chain fling instruction");
  assert.equal(fling.summary,
    'Tow Chain — fling a1 up to 4" in a direction you choose (move the mini). You are rooted until end of activation; +2 heat.');
});

test("a rig rooted by a tow can't Move or Sprint for the rest of the activation", () => {
  const r = towRoom();
  const b1 = findRig(r, "b1");
  b1.towedThisActivation = true; // simulates a tow already landed this activation
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  // Re-set: activate() clears the flag at activation start (fresh each activation).
  b1.towedThisActivation = true;
  const used = r.game.turn.actionsUsed;
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "move" } });
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "sprint" } });
  assert.equal(r.game.turn.actionsUsed, used);  // both movement actions refused
  assert.equal(b1.engine.heat, heatBefore);     // no heat spent on the refusals
});

test("a second Tow Chain hit within 3 rounds doesn't fling or add the +2 heat", () => {
  const r = towRoom();
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.towChainCooldownUntil = 5; // recharging — current round (1) is below the cooldown
  const heatBefore = b1.engine.heat;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1",
    arc: "front", range: "near", dice: { toHit: [6], impacts: [6], location: 1 },
  } });
  assert.ok(!r.game.resolutions.some((x) => /Tow Chain — fling/.test(x.summary))); // no fling
  assert.equal(b1.towedThisActivation, false);   // not rooted while recharging
  assert.equal(b1.engine.heat - heatBefore, 1);  // only the melee fire heat, no +2 tow
});

test("new weapons each expose three correctly-natured upgrades", () => {
  for (const w of ["Harpoon", "Anchor", "Rivet Gun", "Pressure Claw"]) {
    const ups = WEAPON_UPGRADES[w];
    assert.ok(ups, `${w} has upgrades`);
    assert.deepEqual(ups.map((u) => u.nature).sort(), ["field", "prototype", "tuned"], `${w} natures`);
  }
  assert.equal(WEAPON_UPGRADES["Harpoon"].find((u) => u.nature === "tuned").effect.vsPinned, true);
  assert.equal(WEAPON_UPGRADES["Pressure Claw"].find((u) => u.nature === "tuned").effect.onDamage, "sunder");
});

test("the two new light chassis resolve by id and by combo", () => {
  const ha = chassisById("light-harpoon-anchor");
  assert.equal(ha.class, "light");
  assert.equal(ha.longRange, "Harpoon");
  assert.equal(ha.melee, "Anchor");
  assert.deepEqual(ha.sp, { hull: 12, arms: 11, legs: 11, engine: 8 });

  const rp = resolveChassis({ class: "light", longRange: "Rivet Gun", melee: "Pressure Claw" });
  assert.equal(rp.id, "light-rivet-pressureclaw");
  assert.deepEqual(rp.sp, { hull: 13, arms: 11, legs: 10, engine: 9 });
});

test("seed builds a started 3v3 with 6 distinct chassis and turn=first", () => {
  const r = createRoom("SEED-T1");
  applyCommand(r, { verb: "seed", attrs: { first: "b" } });

  assert.equal(r.seeded, true);
  assert.equal(r.game.started, true);
  assert.equal(r.game.phase, "activation");
  assert.equal(r.game.round, 1);
  assert.equal(r.field.locked, true);
  assert.equal(r.game.turn.side, "b");

  const rigs = r.rigs.filter((rig) => rig.kind === "rig");
  const a = rigs.filter((rig) => rig.owner === "a");
  const b = rigs.filter((rig) => rig.owner === "b");
  assert.equal(a.length, 3);
  assert.equal(b.length, 3);
  const chassisIds = rigs.map((rig) => rig.chassis);
  assert.equal(new Set(chassisIds).size, 6);

  // Default seed also fields support units: one tank + two walkers per side, the
  // two walkers of different types (one damage, one support).
  const support = r.rigs.filter((rig) => rig.kind === "tank" || rig.kind === "walker");
  assert.equal(support.length, 6);
  for (const side of ["a", "b"]) {
    const sideSupport = support.filter((u) => u.owner === side);
    assert.equal(sideSupport.filter((u) => u.kind === "tank").length, 1);
    assert.equal(sideSupport.filter((u) => u.kind === "walker").length, 2);
  }

  // Each rig carries exactly one Prototype-nature weapon upgrade.
  for (const rig of rigs) {
    const n =
      (upgradeNature(rig.weapons.longRange, rig.weaponUpgrades.longRange) === "prototype" ? 1 : 0) +
      (upgradeNature(rig.weapons.melee, rig.weaponUpgrades.melee) === "prototype" ? 1 : 0);
    assert.equal(n, 1);
  }
});

test("seed first defaults to 'a' and is idempotent (re-seed resets)", () => {
  const r = createRoom("SEED-T2");
  applyCommand(r, { verb: "seed", attrs: {} });
  assert.equal(r.game.turn.side, "a");
  const firstIds = r.rigs.map((rig) => rig.id);

  applyCommand(r, { verb: "seed", attrs: { first: "b" } });
  assert.equal(r.rigs.length, 12); // 6 rigs + 6 support units
  assert.equal(r.game.turn.side, "b");
  // A fresh build re-numbers from 1, not appends.
  assert.deepEqual(r.rigs.map((rig) => rig.id), firstIds);
});

test("seed with a roster that can't fill 3 per side does not lock/flag/start", () => {
  const r = createRoom("SEED-BAD");
  applyCommand(r, { verb: "seed", attrs: { first: "a", roster: [
    { name: "A1", owner: "a", chassis: "light-sword-arc" },
    { name: "B1", owner: "b", chassis: "medium-lance-mortar" },
  ] } });
  assert.equal(r.game.started, false);
  assert.equal(r.seeded, false);
  assert.equal(r.field.locked, false);
  assert.equal(r.rigs.length, 2); // rigs were still built, just no start
});

test("seed marks both sides ready and populates deployOrder consistent with first", () => {
  const r = createRoom("SEED-RDY");
  applyCommand(r, { verb: "seed", attrs: { first: "b" } });
  assert.equal(r.game.sides.every((s) => s.ready), true);
  assert.equal(r.game.deployOrder[0], "a"); // other = a is first-to-deploy, activates second
  assert.equal(r.game.turn.side, "b");
});

test("SEED_ROSTER is 6 entries, 3 per side, all chassis distinct", () => {
  assert.equal(SEED_ROSTER.length, 6);
  assert.equal(SEED_ROSTER.filter((e) => e.owner === "a").length, 3);
  assert.equal(SEED_ROSTER.filter((e) => e.owner === "b").length, 3);
  assert.equal(new Set(SEED_ROSTER.map((e) => e.chassis)).size, 6);
  for (const e of SEED_ROSTER) assert.ok(resolveChassis({ chassis: e.chassis }), e.chassis);
});

test("publicState exposes seeded and skips enemy face-down prep redaction when seeded", () => {
  const r = createRoom("SEED-T3");
  applyCommand(r, { verb: "seed", attrs: { first: "a" } });
  // Give an enemy (b) rig a hidden face-down preparation.
  const enemy = r.rigs.find((rig) => rig.owner === "b");
  enemy.preparation = { type: "brace", faceUp: false };

  const asA = publicState(r, "a");
  assert.equal(asA.seeded, true);
  const enemyView = asA.rigs.find((rig) => rig.id === enemy.id);
  // Not redacted to { hidden: true } because the room is seeded.
  assert.equal(enemyView.preparation.faceUp, false);
  assert.equal(enemyView.preparation.type, "brace");
});

test("publicState still redacts enemy face-down prep in a normal room", () => {
  const r = createRoom("NORMAL-T");
  claimSide(r, { side: "a" });
  applyCommand(r, { verb: "add", attrs: { name: "E1", owner: "b", chassis: "light-sword-arc", class: "light", longRange: "Arc Gun", melee: "Sword" } });
  const enemy = r.rigs.find((rig) => rig.owner === "b");
  enemy.preparation = { type: "brace", faceUp: false };

  const asA = publicState(r, "a");
  assert.equal(asA.seeded, false);
  const enemyView = asA.rigs.find((rig) => rig.id === enemy.id);
  assert.deepEqual(enemyView.preparation, { hidden: true });
});

test("Blast Furnace Core raises the safe heat margin", () => {
  const mk = (equip, up) => {
    const r = makeRig("r", "R", "medium", "a",
      { longRange: "Autocannon", melee: "Sword" }, equip, up);
    r.engine.heat = 6; // Medium cap 5 → 1 over normally
    return r;
  };
  assert.equal(heatMeter(mk(null, null)).over, 1);
  // Blast furnace: base cap 5 + margin 1 → effCap 6, so heat 6 is safe (over 0)
  // and the returned cap/zone reflect the raised threshold (6 >= effCap → redline).
  const bfc = heatMeter(mk("blast-furnace-core", null));
  assert.equal(bfc.over, 0);
  assert.equal(bfc.cap, 6);
  assert.equal(bfc.zone, "redline");
  const insulated = mk("blast-furnace-core", "insulated-core");
  insulated.engine.heat = 7;
  const ins = heatMeter(insulated);
  assert.equal(ins.over, 0);
  assert.equal(ins.cap, 7); // cap 5 + margin 2
  assert.equal(ins.zone, "redline"); // heat 7 >= effCap 7
});
