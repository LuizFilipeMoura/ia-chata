// Integrity (§8a): one whole-rig pool. Every SP a location loses also drains
// the pool, and a rig whose pool hits 0 is destroyed, however the damage was
// spread across its locations. Locations still decide *what breaks* (§8);
// Integrity decides *when it dies*.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom, makeRig, claimSide, applyCommand, findRig, CHASSIS, chassisById,
  integrityTier, INTEGRITY_RATIO, formatBattleState, __test,
} from "./game-state.js";
import { rigModifiers } from "./battle-view.js";
import { mulberry32 } from "./sim/match.js";

const W = { longRange: "Mini Gun", melee: "Sword" };

function startedRoom() {
  const r = createRoom("INT");
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

const chassisRig = (id, owner = "a", equipment = null) => {
  const c = chassisById(id);
  return makeRig(1, c.name, c.class, owner, { longRange: c.longRange, melee: c.melee, sp: c.sp, chassis: c.id }, equipment);
};

const total = (sp) => sp.hull + sp.arms + sp.legs + sp.engine;

test("every chassis carries an explicit Integrity near its class ratio", () => {
  const expected = {
    "light-sword-arc": 19, "light-missile-flamethrower": 20, "light-wreckingball-double": 21,
    "light-harpoon-anchor": 21, "light-rivet-pressureclaw": 22, "light-claw-autocannon": 22,
    "light-saw-minigun": 22, "medium-sniper-chainsaw": 28, "medium-crossbow-talon": 29,
    "medium-lance-mortar": 31, "medium-shield-siege": 34,
  };
  for (const c of CHASSIS) {
    assert.ok(Number.isInteger(c.integrity), `${c.id} has an integrity`);
    if (expected[c.id] != null) assert.equal(c.integrity, expected[c.id], c.id);
    const ratio = c.integrity / total(c.sp);
    assert.ok(Math.abs(ratio - INTEGRITY_RATIO[c.class]) < 0.1, `${c.id} ratio ${ratio.toFixed(2)}`);
  }
  assert.ok(INTEGRITY_RATIO.light < INTEGRITY_RATIO.medium, "lights run a thinner pool than mediums");
});

test("a commissioned rig starts at full Integrity from its chassis", () => {
  const rig = chassisRig("medium-shield-siege");
  assert.equal(rig.integrityMax, 34);
  assert.equal(rig.integrity, 34);
});

test("a free-combo rig (no chassis) derives Integrity from its class ratio", () => {
  const rig = makeRig(1, "X", "light", "a", W, null);
  const sp = { hull: rig.hull.max, arms: rig.arms.max, legs: rig.legs.max, engine: rig.engine.max };
  assert.equal(rig.integrityMax, Math.round(total(sp) * INTEGRITY_RATIO.light));
});

test("extra max SP (Ablative Plating) scales Integrity with it", () => {
  const plain = chassisRig("medium-shield-siege");
  const plated = chassisRig("medium-shield-siege", "a", "ablative-plating");
  assert.equal(plated.hull.max, plain.hull.max + 1);
  assert.equal(plated.integrityMax, Math.round(34 * 53 / 52));
});

test("damage to any location drains Integrity 1:1", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  const start = b1.integrity;
  __test.applyDamage(r, b1, "arms", 2, { random: () => 0 });
  __test.applyDamage(r, b1, "legs", 1, { random: () => 0 });
  assert.equal(b1.integrity, start - 3);
});

test("spread damage kills: Integrity 0 destroys the rig with every location still standing", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.integrity = 3;
  __test.applyDamage(r, b1, "arms", 1, { random: () => 0, dice: { destruction: 1 } });
  __test.applyDamage(r, b1, "legs", 1, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(b1.destroyed, false);
  __test.applyDamage(r, b1, "engine", 1, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(b1.integrity, 0);
  assert.equal(b1.destroyed, true);
  assert.ok(["hull", "arms", "legs", "engine"].every((l) => b1[l].sp > 0));
  assert.equal(r.game.sides.find((s) => s.id === "a").vp >= 1, true, "the wreck scores kill VP");
  assert.ok(r.game.resolutions.some((e) => e.kind === "destruction" && e.rigId === b1.id));
});

test("Integrity never goes below 0", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.integrity = 1;
  __test.applyDamage(r, b1, "hull", 4, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(b1.integrity, 0);
});

test("an extra hit on a 0-SP Hull or Engine drains 2 Integrity instead of killing outright", () => {
  for (const loc of ["hull", "engine"]) {
    const r = startedRoom();
    const b1 = findRig(r, "b1");
    b1.integrityMax = b1.integrity = 40; // plenty of pool: the location rule alone must not kill
    const zero = b1[loc].sp;
    __test.applyDamage(r, b1, loc, zero, { random: () => 0 });
    assert.equal(b1[loc].sp, 0);
    const before = b1.integrity;
    __test.applyDamage(r, b1, loc, 1, { random: () => 0 });
    assert.equal(b1.destroyed, false, `${loc}: no instant kill`);
    assert.equal(b1.integrity, before - 2, `${loc}: 2 Integrity`);
  }
});

test("overflow off a 0-SP limb still drains exactly 1 Integrity per point", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.integrityMax = b1.integrity = 40;
  b1.legs.sp = 0;
  const before = b1.integrity;
  __test.applyDamage(r, b1, "legs", 1, { random: () => 0 });
  assert.equal(b1.integrity, before - 1);
});

test("Repair restores location SP but never Integrity", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  __test.applyDamage(r, b1, "arms", 3, { random: () => 0 });
  const after = b1.integrity;
  __test.repairRig(b1, "arms", 3);
  assert.equal(b1.arms.sp, b1.arms.max);
  assert.equal(b1.integrity, after);
});

test("Kneecapper damage (noSpill) cripples but can't take Integrity below 1", () => {
  const room = createRoom("R"); claimSide(room, { name: "u", side: "a" });
  const rig = makeRig(1, "Alpha", "medium", "a", { longRange: "Autocannon", melee: "Sword" }, null);
  room.rigs.push(rig);
  rig.integrity = 2;
  __test.applyDamage(room, rig, "legs", 5, { random: () => 0, noSpill: true });
  assert.equal(rig.integrity, 1);
  assert.equal(rig.destroyed, false);
});

test("a catastrophic overheat empties Integrity", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  __test.applyOverheat(r, b1, 99, { random: () => 0, dice: { destruction: 1 } });
  assert.equal(b1.integrity, 0);
  assert.equal(b1.destroyed, true);
});

test("the `set` verb corrects Integrity directly (clamped), and can revive", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.integrity = 0; __test.ensureRigShape(b1); b1.destroyed = true;
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "integrity", sp: 4 } }, { side: "b" });
  assert.equal(b1.integrity, 4);
  assert.equal(b1.destroyed, false);
  applyCommand(r, { verb: "set", attrs: { name: "b1", loc: "integrity", sp: 999 } }, { side: "b" });
  assert.equal(b1.integrity, b1.integrityMax);
});

test("integrityTier: ok above half, bloodied at ≤ half, critical at ≤ a quarter (rounded up), wrecked at 0", () => {
  const t = (cur, max) => integrityTier({ integrity: cur, integrityMax: max });
  assert.equal(t(34, 34), "ok");
  assert.equal(t(18, 34), "ok");
  assert.equal(t(17, 34), "bloodied");
  assert.equal(t(10, 34), "bloodied");
  assert.equal(t(9, 34), "critical");
  assert.equal(t(5, 19), "critical");
  assert.equal(t(6, 19), "bloodied");
  assert.equal(t(0, 19), "wrecked");
  assert.equal(integrityTier({ destroyed: true, integrity: 5, integrityMax: 19 }), "wrecked");
});

test("crossing a tier adds a log line to the resolution that caused it", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  b1.integrityMax = 20; b1.integrity = 11;
  applyCommand(r, { verb: "damage", attrs: { name: "b1", loc: "arms", amount: 1 } }, { side: "a" });
  const bloodied = r.game.resolutions.at(-1);
  assert.match(bloodied.summary + (bloodied.effects || []).join(" "), /b1 is BLOODIED \(10\/20\)/);
  applyCommand(r, { verb: "damage", attrs: { name: "b1", loc: "arms", amount: 5 } }, { side: "a" });
  const crit = r.game.resolutions.at(-1);
  assert.match(crit.summary + (crit.effects || []).join(" "), /b1 is CRITICAL \(5\/20\)/);
});

test("rigModifiers shows a Bloodied / Critical chip", () => {
  const rig = makeRig(1, "X", "light", "a", W, null);
  rig.integrityMax = 20;
  rig.integrity = 10;
  assert.ok(rigModifiers(rig).some((m) => m.key === "integrity" && /Bloodied/.test(m.tag)));
  rig.integrity = 4;
  assert.ok(rigModifiers(rig).some((m) => m.key === "integrity" && /Critical/.test(m.tag) && m.tone === "crit"));
  rig.integrity = 20;
  assert.ok(!rigModifiers(rig).some((m) => m.key === "integrity"));
});

test("the chat battle-state block lists Integrity", () => {
  const r = startedRoom();
  const b1 = findRig(r, "b1");
  assert.match(formatBattleState(r, "a"), new RegExp(`integrity ${b1.integrity}/${b1.integrityMax}`));
});

test("campaign: carried damage and the commander multiplier carry into Integrity", () => {
  const room = createRoom("CAMP-I");
  applyCommand(room, { verb: "mission", attrs: { type: "assassinate", seed: 7, squads: {
    a: [{ uid: "u1", name: "Gold", chassis: "light-claw-autocannon", sp: { hull: 5, arms: 11, legs: 2, engine: 9 } }],
    b: [{ name: "Red", chassis: "medium-sniper-chainsaw", commander: true, spMult: 1.5 }],
  }, mods: { a: { sp: { legs: 1 } }, b: {} } } }, { side: "a" }, { random: mulberry32(7) });
  const gold = findRig(room, "Gold");
  assert.equal(gold.integrityMax, 23);            // 22 × 45/44, rounded
  assert.equal(gold.integrity, 23 - 8 - 9);       // hull −8, legs −9 carried
  const red = findRig(room, "Red");
  assert.equal(red.integrityMax, Math.round(28 * 66 / 43));
  assert.equal(red.integrity, red.integrityMax);
});
