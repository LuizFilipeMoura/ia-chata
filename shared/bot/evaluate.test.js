import { test } from "node:test";
import assert from "node:assert/strict";
import { rawExpectedHits, expectedDamage } from "./evaluate.js";
import { makeRig, effectiveWeaponProfile } from "../game-state.js";
import { rollToHit, resolveAttack } from "../combat.js";

// Rigs MUST be built through makeRig(id, name, cls, owner, weapons).
// normalizeWeaponUpgrade forces the field upgrade for a null id, so a
// hand-assembled weapon is a loadout the game cannot commission — a fixture
// built that way tests something that does not exist.
const atk = (lr = "Autocannon") => makeRig(1, "Atk", "medium", "a", { longRange: lr, melee: "Sword" });
const def = () => makeRig(2, "Def", "medium", "b", { longRange: "Autocannon", melee: "Sword" });

test("expectedDamage is zero for an earned zero — a rake into a front arc", () => {
  const a = atk("Mini Gun");   // Mini Gun carries Raking Fire
  assert.equal(expectedDamage(a, def(), "longRange", { arc: "front", distance: 7, cover: 0, round: 1 }), 0);
});

test("a rake still scores into the side and rear", () => {
  const a = atk("Mini Gun");
  const opts = { distance: 7, cover: 0, round: 1 };
  assert.ok(expectedDamage(a, def(), "longRange", { ...opts, arc: "side" }) > 0);
  assert.ok(expectedDamage(a, def(), "longRange", { ...opts, arc: "rear" }) > 0);
});

test("flanking beats a frontal shot — rear ≥ side ≥ front, rear > front", () => {
  const a = atk();
  const opts = { distance: 12, cover: 0, round: 1 };
  const front = expectedDamage(a, def(), "longRange", { ...opts, arc: "front" });
  const side  = expectedDamage(a, def(), "longRange", { ...opts, arc: "side" });
  const rear  = expectedDamage(a, def(), "longRange", { ...opts, arc: "rear" });
  // rear and side can TIE: past a point the extra effective Penetration is wasted
  // against the wound-TN floor (the 3–7 band's "waste the excess" by design). The
  // robust signal is that flanking is never worse and the rear beats the front.
  assert.ok(rear >= side && side >= front && rear > front, `expected rear≥side≥front & rear>front, got ${rear}/${side}/${front}`);
});

test("expectedDamage falls off away from the weapon's sweet spot", () => {
  const a = atk();   // Autocannon: sweet 12
  const at = (d) => expectedDamage(a, def(), "longRange", { arc: "front", distance: d, cover: 0, round: 1 });
  assert.ok(at(12) > at(24), "sweet spot beats long range");
  assert.ok(at(12) > at(2), "sweet spot beats point blank");
});

test("expectedDamage drops with cover", () => {
  const a = atk();
  const opts = { arc: "front", distance: 12, round: 1 };
  assert.ok(expectedDamage(a, def(), "longRange", { ...opts, cover: 0 })
          > expectedDamage(a, def(), "longRange", { ...opts, cover: 2 }));
});

test("a natural 6 always hits — expectedDamage never falls to zero on a legal shot", () => {
  const a = atk();
  // Absurd penalties: max cover at a terrible range. A natural 6 still lands.
  const h = expectedDamage(a, def(), "longRange", { arc: "front", distance: 26, cover: 2, round: 1 });
  assert.ok(h > 0, "a legal shot can never score zero expected hits");
});

test("a raised shield that negates the arc is an earned zero", () => {
  const a = atk();
  const target = def();
  target.preparation = { type: "raise-shield", source: "action", faceUp: false };
  // Default shield negates the front arc; side/rear are only blunted, so they
  // still land. (shieldCoverage in rules.js.)
  const opts = { distance: 12, cover: 0, round: 1 };
  assert.equal(expectedDamage(a, target, "longRange", { ...opts, arc: "front" }), 0, "front negated");
  assert.ok(expectedDamage(a, target, "longRange", { ...opts, arc: "side" }) > 0, "side only blunted");
});

// --- Validation against the real engine (Task 1.2) --------------------------
// A green analytic score that never touches the dice is a score that is asserted,
// not verified. Sample rollToHit and confirm rawExpectedHits (ROF × P(hit), no
// arc preference — the engine's to-hit step ignores arc) matches its mean.

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleMeanHits(attacker, target, slot, opts, trials, seed) {
  const rand = mulberry32(seed);
  let total = 0;
  for (let i = 0; i < trials; i++) {
    // Clone BOTH: rollToHit mutates the target (Point-Defense) and the attacker
    // (Penetrator Rounds' shot counter). A fresh pair per trial is exactly the
    // "one shot from full" the analytic model prices.
    const a = structuredClone(attacker);
    const t = structuredClone(target);
    const profile = effectiveWeaponProfile(slot, a.weapons[slot], a);
    total += rollToHit(a, profile, { ...opts, target: t }, undefined, rand).hits;
  }
  return total / trials;
}

test("analytic rawExpectedHits matches the real engine's sampled mean", () => {
  const cases = [
    { lr: "Autocannon", arc: "side", distance: 12 },
    { lr: "Autocannon", arc: "rear", distance: 24 },
    { lr: "Arc Gun",    arc: "side", distance: 20 },
    { lr: "Mini Gun",   arc: "rear", distance: 7  },
  ];
  const report = [];
  for (const c of cases) {
    const a = atk(c.lr);
    const b = def();
    const opts = { arc: c.arc, distance: c.distance, cover: 0, round: 1 };
    const predicted = rawExpectedHits(a, b, "longRange", opts);
    const observed = sampleMeanHits(a, b, "longRange", opts, 5000, 42);
    const tol = Math.max(0.08, observed * 0.05);
    report.push(`${c.lr} ${c.arc}@${c.distance}": analytic ${predicted.toFixed(3)} vs sampled ${observed.toFixed(3)} (tol ${tol.toFixed(3)})`);
    assert.ok(Math.abs(predicted - observed) <= tol,
      `${c.lr} ${c.arc}@${c.distance}": analytic ${predicted.toFixed(3)} vs sampled ${observed.toFixed(3)} (tol ${tol.toFixed(3)})`);
  }
  console.log("  [1.2] " + report.join("\n         "));
});

// --- Validation of the FULL damage term against the real engine --------------
// The deferred damage term's acceptance test: sample resolveAttack's actual SP
// (the same ctx.applyDamage tap scripts/balance/weapon-sweep.mjs uses) and
// confirm analytic expectedDamage matches the empirical mean. If ROF × P(hit) ×
// P(wound) × D disagrees with the engine, one of them is wrong.

function sampleMeanDamage(attacker, target, slot, opts, trials, seed) {
  const rnd = mulberry32(seed);
  const ROOM = { game: { round: 1 } };
  let total = 0, n = 0;
  for (let i = 0; i < trials; i++) {
    const a = structuredClone(attacker);
    const t = structuredClone(target);
    let sp = 0;
    const ctx = {
      pushResolution() {}, bumpHeat() {}, spendHeat() {},
      sunderLocation() {}, crackLocation() {}, rivetHit() {}, dismemberLocation() {}, breachHull() {}, engage() {},
      applyDamage(room, rig, loc, amount) { if (rig === t) sp += amount; },
      profileFor: (s, name, atk) => effectiveWeaponProfile(s, name, atk),
    };
    const o = { weapon: slot, arc: opts.arc, cover: opts.cover ?? 0, distance: opts.distance };
    const r = resolveAttack(ROOM, a, t, o, rnd, ctx);
    if (!r.ok) continue;
    total += sp; n++;
  }
  return n ? total / n : 0;
}

test("analytic expectedDamage matches the real engine's sampled SP", () => {
  const cases = [
    { lr: "Autocannon", arc: "side", distance: 12 },
    { lr: "Autocannon", arc: "rear", distance: 24 },
    { lr: "Arc Gun",    arc: "side", distance: 20 },
    { lr: "Mini Gun",   arc: "rear", distance: 7  },
  ];
  const report = [];
  for (const c of cases) {
    const a = atk(c.lr);
    const b = def();
    const opts = { arc: c.arc, distance: c.distance, cover: 0, round: 1 };
    const predicted = expectedDamage(a, b, "longRange", opts);
    const observed = sampleMeanDamage(a, b, "longRange", opts, 5000, 1234);
    const tol = Math.max(0.15, observed * 0.08);
    report.push(`${c.lr} ${c.arc}@${c.distance}": analytic ${predicted.toFixed(3)} vs sampled ${observed.toFixed(3)} (tol ${tol.toFixed(3)})`);
    assert.ok(Math.abs(predicted - observed) <= tol,
      `${c.lr} ${c.arc}@${c.distance}": analytic ${predicted.toFixed(3)} vs sampled ${observed.toFixed(3)} (tol ${tol.toFixed(3)})`);
  }
  console.log("  [damage] " + report.join("\n           "));
});
