import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, makeRig, makeUnit, claimSide, applyCommand, findRig,
  normalizeWeapon, WEAPONS, formatBattleState, publicState, __test,
  EQUIPMENT, normalizeEquipment, WEAPON_UPGRADES,
  normalizeWeaponUpgrade, upgradeForWeapon, defaultWeaponUpgrade,
  effectiveWeaponProfile, normalizePrep, hasBulwarkShield, shieldCoverage,
  UNIT_WEAPONS, normalizeUnitWeapon,
  randomRigWeapons, randomEquipment,
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
  assert.equal(Object.keys(WEAPONS.longRange).length, 8);
  assert.equal(Object.keys(WEAPONS.melee).length, 8);
});

test("WEAPONS carries full combat profiles keyed by canonical name", () => {
  assert.equal(Object.keys(WEAPONS.longRange).length, 8);
  assert.equal(Object.keys(WEAPONS.melee).length, 8);
  assert.equal(WEAPONS.longRange["Mini Gun"].rof, 8);
  assert.equal(WEAPONS.longRange["Mini Gun"].str, 4);
  assert.equal(WEAPONS.longRange["Mini Gun"].sweet, 7);
  assert.equal(WEAPONS.longRange["Mini Gun"].peak, 2);
  assert.equal(WEAPONS.longRange["Mini Gun"].dropoff, 0.35);
  assert.equal(WEAPONS.longRange["Mini Gun"].minRange, 0);
  assert.equal(WEAPONS.longRange["Mini Gun"].maxRange, 18);
  assert.equal(WEAPONS.longRange["Mini Gun"].acc, undefined);
  assert.equal(WEAPONS.longRange["Mini Gun"].rng, undefined);
  // Base weapons are stat-only; no perks. Ranged weapons carry no melee flag.
  assert.equal(WEAPONS.longRange["Mini Gun"].perks, undefined);
  assert.equal(WEAPONS.longRange["Mini Gun"].melee, undefined);
  assert.equal(WEAPONS.melee["Lance"].str, 11);
  assert.equal(WEAPONS.melee["Sword"].melee, true);
  assert.equal(WEAPONS.melee["Sword"].perks, undefined);
});

test("new weapons: Siege Maul and Bulwark Shield are in the universal list", () => {
  const maul = WEAPONS.longRange["Siege Maul"];
  assert.deepEqual(maul, { rof: 1, str: 13, sweet: 8, peak: 1, dropoff: 0.30, minRange: 0, maxRange: 16 });

  const shield = WEAPONS.melee["Bulwark Shield"];
  assert.deepEqual(shield, { rof: 1, str: 6, acc: [0, 0], rng: [2, 2], melee: true });

  // The list is now 8 + 8.
  assert.equal(Object.keys(WEAPONS.longRange).length, 8);
  assert.equal(Object.keys(WEAPONS.melee).length, 8);
});

test("new weapon upgrades resolve through effectiveWeaponProfile", () => {
  assert.equal(WEAPON_UPGRADES["Siege Maul"].length, 2);
  assert.equal(WEAPON_UPGRADES["Bulwark Shield"].length, 2);

  // Extended Barrel: +4 maxRange (16 -> 20) and +2 sweet (8 -> 10), reusing effect.range.
  const barrel = makeRig(1, "Breaker", "medium", "a",
    { longRange: "Siege Maul", melee: "Sword", lrUpgrade: "extended-barrel" });
  const barrelProfile = effectiveWeaponProfile("longRange", "Siege Maul", barrel);
  assert.equal(barrelProfile.maxRange, 20);
  assert.equal(barrelProfile.sweet, 10);

  // Breaching Round is the default (first) Siege Maul upgrade and marks onDamage.
  const breach = makeRig(2, "Breaker2", "medium", "a",
    { longRange: "Siege Maul", melee: "Sword" });
  assert.equal(breach.weaponUpgrades.longRange, "breaching-round");
  assert.equal(effectiveWeaponProfile("longRange", "Siege Maul", breach).upgradeEffect.onDamage, "breaching-round");

  // Boss Spike grants Staggering; Tower Shield is the default shield upgrade.
  const spike = makeRig(3, "Guard", "medium", "a",
    { longRange: "Autocannon", melee: "Bulwark Shield", meleeUpgrade: "boss-spike" });
  assert.equal(effectiveWeaponProfile("melee", "Bulwark Shield", spike).perks.includes("Staggering"), true);
  assert.equal(makeRig(4, "Guard2", "medium", "a",
    { longRange: "Autocannon", melee: "Bulwark Shield" }).weaponUpgrades.melee, "tower-shield");
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

test("shieldCoverage depends on the Tower Shield upgrade", () => {
  const base = { weapons: { melee: "Bulwark Shield" }, weaponUpgrades: { melee: "boss-spike" } };
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

test("both ready starts game and assigns private random bounties", () => {
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
  assert.equal(r.game.bounties.a, findRig(r, "b3").id);
  assert.equal(r.game.bounties.b, findRig(r, "a1").id);
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

  assert.deepEqual(Object.keys(publicState(r, "a").game.bounties), ["a"]);
  assert.deepEqual(Object.keys(publicState(r, "b").game.bounties), ["b"]);
  assert.equal(publicState(r, "a").game.bounties.b, undefined);
  assert.equal(publicState(r, "b").game.bounties.a, undefined);
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
  assert.equal(b1.engine.heat, 3);             // 0 + round(9 · 1/3) — cooled proportionally
});

test("Shutdown cools proportionally to slots already used and ends the activation", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.engine.heat = 6;              // floor is 0 for a fresh engine
  r.game.turn.actionsUsed = 2;     // of 3 slots → keeps 2/3 of the heat
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "shutdown" } });
  assert.equal(b1.engine.heat, 4); // 0 + round(6 · 2/3)
  assert.equal(b1.activated, true);
});

test("Shutdown as the first action cools fully to the floor", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const b1 = findRig(r, "b1");
  b1.engine.heat = 6;
  applyCommand(r, { verb: "action", attrs: { name: "b1", action: "shutdown" } });
  assert.equal(b1.engine.heat, 0); // 0 slots used → full cool
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

test("after round 5 the higher VP wins", () => {
  const r = startedRoom();
  for (let round = 1; round <= 5; round++) {
    if (round >= 2) applyCommand(r, { verb: "initiative", attrs: { dice: { a: 9, b: 4 } } });
    runFullRound(r);
    applyCommand(r, { verb: "vp", attrs: { side: "a", claims: round === 1 ? [0, 1] : [] } });
    applyCommand(r, { verb: "vp", attrs: { side: "b", claims: [] } });
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
// the upgrade that grants it: Tracer Rounds → Incendiary, Suppressive Fire → Shock.
test("Incendiary (via Tracer Rounds) adds 1 heat to the target", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.longRange = "Double MG";
  b1.weaponUpgrades.longRange = "tracer-rounds";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  const heatBefore = a1.engine.heat;
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "longRange", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6, 6, 6, 6, 6, 6, 6, 6], impacts: [1, 1, 1, 1, 1, 1, 1, 1], location: 1 },
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

test("Impale (via Spearpoint) immobilises on a D12 of 8+", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Lance";
  b1.weaponUpgrades.melee = "spearpoint";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  const a1 = findRig(r, "a1");
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [6], impacts: [6], location: 1, impale: 9 },
  } });
  assert.equal(a1.immobilised, true);
});

test("EQUIPMENT has the 5 catalogue pieces with passive + active shape", () => {
  const ids = Object.keys(EQUIPMENT).sort();
  assert.deepEqual(ids, ["ablative-plating", "field-repair-suite", "overclock-core", "radiator-array", "servo-actuators"]);
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

test("normalizeEquipment is case-insensitive and rejects unknown ids", () => {
  assert.equal(normalizeEquipment("Ablative-Plating"), "ablative-plating");
  assert.equal(normalizeEquipment("nonsense"), null);
  assert.equal(normalizeEquipment(null), null);
});

test("WEAPON_UPGRADES has exactly 2 upgrades for all 16 weapons", () => {
  const all = [...Object.keys(WEAPONS.longRange), ...Object.keys(WEAPONS.melee)];
  assert.equal(all.length, 16);
  for (const name of all) {
    const ups = WEAPON_UPGRADES[name];
    assert.equal(Array.isArray(ups), true, `${name} missing upgrades`);
    assert.equal(ups.length, 2, `${name} must have exactly 2 upgrades`);
    for (const u of ups) {
      assert.equal(typeof u.name, "string");
      assert.equal(typeof u.tag, "string");
    }
  }
});

test("WEAPON_UPGRADES has stable ids and effect objects for every option", () => {
  const all = [...Object.keys(WEAPONS.longRange), ...Object.keys(WEAPONS.melee)];
  for (const name of all) {
    const ups = WEAPON_UPGRADES[name];
    assert.equal(ups.length, 2, `${name} must have exactly 2 upgrades`);
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
  assert.equal(defaultWeaponUpgrade("Mini Gun"), "extended-belt");
  assert.equal(normalizeWeaponUpgrade("Mini Gun", "suppressive-fire"), "suppressive-fire");
  assert.equal(normalizeWeaponUpgrade("Mini Gun", ""), "extended-belt");
  assert.equal(normalizeWeaponUpgrade("Mini Gun", "not-real"), "extended-belt");
  assert.equal(normalizeWeaponUpgrade("Not A Weapon", "extended-belt"), null);
  assert.equal(upgradeForWeapon("Mini Gun", "suppressive-fire").name, "Suppressive Fire");
});

test("makeRig stores default and explicit selected weapon upgrades", () => {
  const fallback = makeRig(1, "Warden", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  assert.deepEqual(fallback.weaponUpgrades, { longRange: "extended-belt", melee: "duelist-balance" });

  const explicit = makeRig(2, "Reaver", "medium", "a", {
    longRange: "Mini Gun",
    melee: "Sword",
    longRangeUpgrade: "suppressive-fire",
    meleeUpgrade: "keen-edge",
  });
  assert.deepEqual(explicit.weaponUpgrades, { longRange: "suppressive-fire", melee: "keen-edge" });
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
  assert.deepEqual(legacy.rigs[0].weaponUpgrades, { longRange: "tracer-rounds", melee: "high-rev-motor" });
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

test("ensureRigShape backfills equipment/hardened/overclockCoreUsed on legacy rig objects", () => {
  const r = createRoom("X");
  applyCommand(r, { verb: "add", attrs: { name: "Bastion", class: "medium", owner: "a", lr: "Autocannon", melee: "Claw" } });
  const rig = findRig(r, "Bastion");
  delete rig.equipment; delete rig.hardened; delete rig.overclockCoreUsed;
  findRig(r, "Bastion"); // findRig calls ensureGameShape -> ensureRigShape internally
  assert.equal(rig.equipment, null);
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

test("High-Rev Motor adds attack heat in addition to base fire heat", () => {
  const r = startedRoom();
  clearPendingAnswer(r);
  const b1 = findRig(r, "b1");
  b1.weapons.melee = "Chainsaw";
  b1.weaponUpgrades.melee = "high-rev-motor";
  applyCommand(r, { verb: "activate", attrs: { name: "b1" } });
  applyCommand(r, { verb: "action", attrs: {
    name: "b1", action: "fire", weapon: "melee", target: "a1", arc: "front", range: "near",
    dice: { toHit: [1, 1, 1] },
  } });
  assert.equal(b1.engine.heat, 2);
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

test("makeUnit rejects unknown kinds", () => {
  assert.equal(makeUnit("banana", 1, "X", "a", {}), null);
});

test("UNIT_WEAPONS holds the strawman flat catalogue", () => {
  const ids = Object.keys(UNIT_WEAPONS).sort();
  assert.deepEqual(ids, [
    "Autocannon Mount", "Coaxial MG", "Dozer Blade", "Ram Spike", "Rocket Pod", "Tank Cannon",
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
