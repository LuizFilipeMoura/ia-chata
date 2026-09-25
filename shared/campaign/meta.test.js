import test from "node:test";
import assert from "node:assert/strict";
import { newProfile, buyUnlock, unlockedPools, creditRun, renownFor } from "./meta.js";
import { STARTING, UNLOCKS } from "./catalog.js";

test("new profile starts with the starting pools", () => {
  const p = newProfile();
  assert.equal(p.renown, 0);
  assert.equal(p.notorietyMax, 0);
  const pools = unlockedPools(p);
  assert.deepEqual(pools.chassis.sort(), [...STARTING.chassis].sort());
  assert.deepEqual(pools.equipment.sort(), [...STARTING.equipment].sort());
  assert.deepEqual(pools.natures, ["field"]);
  assert.equal(pools.relics.length, 4);
  assert.equal(pools.perkKits, false);
  assert.deepEqual(pools.workshop, { startSalvage: 0, cards: 3, freeRecovery: false, fieldStart: false });
  assert.deepEqual(pools.banners, []);
});

test("unlock table: 7 chassis, 4 equipment, 3 relic packs", () => {
  assert.equal(UNLOCKS.filter((u) => u.kind === "chassis").length, 7);
  assert.equal(UNLOCKS.filter((u) => u.kind === "equipment").length, 4);
  assert.equal(UNLOCKS.filter((u) => u.kind === "relics").length, 3);
});

test("buyUnlock spends renown and widens the pool", () => {
  const p = { ...newProfile(), renown: 10 };
  const r = buyUnlock(p, "chassis:light-sword-arc");
  assert.ok(r.profile);
  assert.equal(r.profile.renown, 6);
  assert.ok(unlockedPools(r.profile).chassis.includes("light-sword-arc"));
  assert.equal(p.renown, 10, "input not mutated");
  assert.equal(buyUnlock(r.profile, "chassis:light-sword-arc").error, "owned");
});

test("buyUnlock rejects unknown, unaffordable and missing requirement", () => {
  const p = { ...newProfile(), renown: 20 };
  assert.equal(buyUnlock(p, "nope").error, "unknown");
  assert.equal(buyUnlock(newProfile(), "nature:tuned").error, "renown");
  assert.equal(buyUnlock(p, "nature:prototype").error, "requires");
  const t = buyUnlock(p, "nature:tuned").profile;
  const pr = buyUnlock(t, "nature:prototype").profile;
  assert.deepEqual(unlockedPools(pr).natures, ["field", "tuned", "prototype"]);
  assert.equal(pr.renown, 4);
});

test("workshop unlocks feed the pools", () => {
  let p = { ...newProfile(), renown: 100 };
  for (const id of ["workshop:salvage1", "workshop:salvage2", "workshop:cards4", "workshop:freerecovery", "workshop:fieldstart", "perkkits", "relics:2"]) {
    p = buyUnlock(p, id).profile;
  }
  const pools = unlockedPools(p);
  assert.deepEqual(pools.workshop, { startSalvage: 20, cards: 4, freeRecovery: true, fieldStart: true });
  assert.equal(pools.perkKits, true);
  assert.equal(pools.relics.length, 8);
  assert.ok(pools.relics.includes("lucky-charm"));
});

test("renown: partial success counts", () => {
  assert.equal(renownFor({ contractsWon: 3, reachedBoss: false, bossWon: false, notoriety: 0 }), 6);
  assert.equal(renownFor({ contractsWon: 4, reachedBoss: true, bossWon: false, notoriety: 2 }), 11);
  assert.equal(renownFor({ contractsWon: 5, reachedBoss: true, bossWon: true, notoriety: 2 }), 10 + 3 + 8);
  assert.equal(renownFor({ contractsWon: 0, reachedBoss: false, bossWon: false, notoriety: 4 }), 0);
});

test("creditRun: loss adds renown only", () => {
  const r = creditRun(newProfile(), { won: false, contractsWon: 2, reachedBoss: false, bossWon: false, bossFaction: "krim", notoriety: 0 });
  assert.equal(r.earned, 4);
  assert.equal(r.profile.renown, 4);
  assert.equal(r.profile.totalRenown, 4);
  assert.equal(r.profile.notorietyMax, 0);
  assert.deepEqual(r.profile.factionPerks, []);
  assert.equal(r.profile.runs, 1);
  assert.equal(r.profile.history.length, 1);
});

test("creditRun: boss win unlocks the faction banner and notoriety N+1", () => {
  const r = creditRun(newProfile(), { won: true, contractsWon: 5, reachedBoss: true, bossWon: true, bossFaction: "nox", notoriety: 0 });
  assert.equal(r.earned, 10 + 3 + 6);
  assert.deepEqual(r.profile.factionPerks, ["nox"]);
  assert.equal(r.profile.notorietyMax, 1);
  assert.deepEqual(unlockedPools(r.profile).banners, ["nox"]);
  assert.deepEqual(r.unlocked.sort(), ["banner:nox", "notoriety:1"]);
  // Winning a lower level doesn't lower the max; top out at 5.
  const r2 = creditRun({ ...r.profile, notorietyMax: 5 }, { won: true, contractsWon: 5, reachedBoss: true, bossWon: true, bossFaction: "nox", notoriety: 5 });
  assert.equal(r2.profile.notorietyMax, 5);
  assert.deepEqual(r2.profile.factionPerks, ["nox"]);
  assert.deepEqual(r2.unlocked, []);
});
