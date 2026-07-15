import { test } from "node:test";
import assert from "node:assert/strict";
import { computeModifiedAim, aimBreakdown, weaponAccuracyAt, rollToHit, computePen, penBreakdown, arcBonus, rollWounds, resolveAttack, applyDefensiveReactions } from "./combat.js";
import { WEAPONS, makeRig, makeUnit, UNIT_WEAPONS, effectiveWeaponProfile, HEAT_CAPACITY } from "./game-state.js";
import { WEIGHT_PEN_MOD, WOUND_DIE, woundTarget, toughnessOf } from "./rules.js";
import { partNamesOf } from "./unit-kinds.js";

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

test("computeModifiedAim applies weapon Accuracy, cover, aim and hull penalties", () => {
  const claw = WEAPONS.melee["Claw"]; // accuracy [1,1]
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

test("weaponAccuracyAt peaks at the sweet spot and falls off with distance", () => {
  const mg = WEAPONS.longRange["Mini Gun"]; // sweet 7, peak 2, dropoff 0.35
  assert.equal(weaponAccuracyAt(mg, 7), 2);            // at sweet spot
  assert.equal(weaponAccuracyAt(mg, 2), 0);            // |2-7|*0.35 = 1.75 -> 2 penalty
  assert.equal(weaponAccuracyAt(mg, 18), -2);          // |18-7|*0.35 = 3.85 -> 4 penalty
  assert.equal(weaponAccuracyAt(mg, undefined), 2);    // no distance -> peak (legacy fallback)
  const claw = WEAPONS.melee["Claw"];                  // melee: scalar accuracy, distance-independent
  assert.equal(weaponAccuracyAt(claw, 99), 1);
});

test("computeModifiedAim uses distance-based accuracy for ranged weapons", () => {
  const mg = WEAPONS.longRange["Mini Gun"];
  assert.equal(computeModifiedAim(attacker, mg, { distance: 7, cover: 0 }), 2);  // 4 - 2
  assert.equal(computeModifiedAim(attacker, mg, { distance: 2, cover: 0 }), 4);  // 4 - 0
  assert.equal(computeModifiedAim(attacker, mg, { distance: 18, cover: 0 }), 6); // 4 - (-2)
});

test("aimBreakdown — reports the base aim and the weapon's Accuracy at range", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] }, { distance: 12 });
  assert.deepEqual(b.terms, [
    { label: "base aim", value: 4 },
    { label: "weapon Accuracy at 12\"", value: 1 },
  ]);
  assert.equal(b.value, 3);
});

test("aimBreakdown — cover and smoke each emit a named term", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] },
    { distance: 12, cover: 2, targetSmoke: true });
  assert.ok(b.terms.some((t) => t.label === "cover" && t.value === -2));
  assert.ok(b.terms.some((t) => t.label === "target in smoke" && t.value === -2));
});

test("aimBreakdown — a modifier that does not fire emits no term", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] }, { distance: 12 });
  assert.ok(!b.terms.some((t) => t.label === "cover"));
});

test("computeModifiedAim — still returns a bare number, callers unchanged", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  assert.equal(computeModifiedAim(attacker, { ...WEAPONS.longRange["Autocannon"] }, { distance: 12 }), 3);
});

// The cancellation seam. A cancelled penalty must NOT appear (there is no cover
// penalty — it was ignored), but the CANCELLER must, as a zero-valued term: it
// is the only thing explaining why a player looking at real cover on the table
// sees no cover term. See the matching comment in aimBreakdown.
test("aimBreakdown — targeting computer's first fire cancels cover and says so", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] },
    { distance: 12, cover: 2, fireControlFirst: true });
  assert.ok(!b.terms.some((t) => t.label === "cover"));
  assert.ok(b.terms.some((t) => t.label === "targeting computer (ignores cover)" && t.value === 0));
  assert.equal(b.value, 3); // cover never reached the maths
});

test("aimBreakdown — a canceller stays silent when there was no cover to cancel", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] },
    { distance: 12, cover: 0, fireControlFirst: true });
  assert.ok(!b.terms.some((t) => t.label.startsWith("targeting computer")));
});

test("aimBreakdown — first fire cancels the melee-lock penalty and says so", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const engaged = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] },
    { distance: 12, engaged: true });
  assert.ok(engaged.terms.some((t) => t.label === "locked in melee" && t.value === -2));
  const first = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] },
    { distance: 12, engaged: true, fireControlFirst: true });
  assert.ok(!first.terms.some((t) => t.label === "locked in melee"));
  assert.ok(first.terms.some((t) => t.label === "targeting computer (ignores melee lock)" && t.value === 0));
});

test("aimBreakdown — Airburst Fuze and a Piledriver guard-break each name their cover cancel", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const fuze = aimBreakdown(attacker,
    { ...WEAPONS.longRange["Autocannon"], upgradeEffect: { ignoreCover: true } },
    { distance: 12, cover: 2 });
  assert.ok(!fuze.terms.some((t) => t.label === "cover"));
  assert.ok(fuze.terms.some((t) => t.label === "airburst fuze (ignores cover)" && t.value === 0));
  const smash = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] },
    { distance: 12, cover: 2, guardBreak: true });
  assert.ok(!smash.terms.some((t) => t.label === "cover"));
  assert.ok(smash.terms.some((t) => t.label === "piledriver guard-break (ignores cover)" && t.value === 0));
});

// Recon paint and Predictive Tracking each do TWO things: cancel cover AND grant
// Accuracy. Both facts get their own term — the bonus is not a substitute for the
// explanation of the missing cover.
test("aimBreakdown — recon paint emits both its bonus and its cover cancel", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] },
    { distance: 12, cover: 2, painted: true });
  assert.ok(b.terms.some((t) => t.label === "recon paint" && t.value === 1));
  assert.ok(b.terms.some((t) => t.label === "recon paint (ignores cover)" && t.value === 0));
  assert.ok(!b.terms.some((t) => t.label === "cover"));
  assert.equal(b.value, 2); // 4 - (1 + 1)
});

test("aimBreakdown — predictive tracking emits its bonus and its cover cancel", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" },
    "targeting-computer", "predictive-tracking");
  const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] },
    { distance: 12, cover: 2, targetPinned: true });
  assert.ok(b.terms.some((t) => t.label === "predictive tracking" && t.value === 2));
  assert.ok(b.terms.some((t) => t.label === "predictive tracking (ignores cover)" && t.value === 0));
  assert.ok(!b.terms.some((t) => t.label === "cover"));
});

test("aimBreakdown — aimed shot, wrecked hull and ballistic processor each name themselves", () => {
  const aimed = aimBreakdown({ weightClass: "medium", hull: { sp: 7 } },
    { ...WEAPONS.longRange["Autocannon"] }, { distance: 12, aimed: true });
  assert.ok(aimed.terms.some((t) => t.label === "aimed shot" && t.value === -2));
  const wrecked = aimBreakdown({ weightClass: "medium", hull: { sp: 0 } },
    { ...WEAPONS.longRange["Autocannon"] }, { distance: 12 });
  assert.ok(wrecked.terms.some((t) => t.label === "hull wrecked" && t.value === -1));
  const ballistic = aimBreakdown(
    { weightClass: "medium", hull: { sp: 7 }, equipment: "targeting-computer", equipmentUpgrade: "ballistic-processor" },
    { ...WEAPONS.longRange["Autocannon"] }, { distance: 12 });
  assert.ok(ballistic.terms.some((t) => t.label === "ballistic processor" && t.value === 1));
});

// The terms are a LEDGER, not decoration: they must always reconcile to the
// value the engine actually used, or the panel lies about the shot it explains.
test("aimBreakdown — the terms always sum back to the reported target number", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" },
    "targeting-computer", "ballistic-processor");
  for (const opts of [
    { distance: 12 },
    { distance: 12, cover: 2, aimed: true },
    { distance: 20, cover: 1, engaged: true, targetSmoke: true },
    { distance: 12, cover: 2, painted: true, aimed: true },
    { distance: 12, cover: 2, engaged: true, fireControlFirst: true },
    { distance: 12, cover: 2, guardBreak: true, targetSmoke: true },
  ]) {
    const b = aimBreakdown(attacker, { ...WEAPONS.longRange["Autocannon"] }, opts);
    const base = b.terms.find((t) => t.label === "base aim").value;
    const accuracy = b.terms.filter((t) => t.label !== "base aim").reduce((s, t) => s + t.value, 0);
    assert.equal(base - accuracy, b.value, `terms do not reconcile for ${JSON.stringify(opts)}`);
  }
});

test("Pop Smoke worsens an attacker's modified Aim by 2", () => {
  const mg = WEAPONS.longRange["Mini Gun"];
  const clear = computeModifiedAim(attacker, mg, { distance: 12, cover: 0, targetSmoke: false });
  const smoked = computeModifiedAim(attacker, mg, { distance: 12, cover: 0, targetSmoke: true });
  assert.equal(smoked - clear, 2);
});

test("Predictive Tracking: +2 Accuracy and ignores cover vs a pinned target", () => {
  const attacker = { weightClass: "medium", hull: { sp: 7 }, equipment: "targeting-computer", equipmentUpgrade: "predictive-tracking" };
  const mg = WEAPONS.longRange["Mini Gun"];
  // distance:12 is chosen (not the plan's distance:7) because Mini Gun's own
  // `sweet` is 7 — at that distance Ballistic Processor's unrelated sweetBandAccuracy
  // bonus would also fire and confound the "wrong upgrade" check below. 12 is
  // outside Mini Gun's sweet band (|12-7| > 2), isolating Predictive Tracking.
  const openField = computeModifiedAim(attacker, mg, { distance: 12, cover: 2, targetPinned: false });
  const pinned    = computeModifiedAim(attacker, mg, { distance: 12, cover: 2, targetPinned: true });
  // +2 Accuracy lowers the aim number by 2, and the 2 points of cover are ignored
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
  const dbl = { ...WEAPONS.longRange["Double MG"], perks: ["Full Auto"] }; // rof 8, accuracy [1,0]
  const dice = [1, 2, 3, 4, 5, 6, 1, 1, 6, 2]; // 8 base + 2 full auto = 10 dice; modAim near = 4 - 1 = 3
  const res = rollToHit(attacker, dbl, { range: "near", cover: 0, fullAuto: true }, dice, () => 0);
  assert.equal(res.rof, 10);
  assert.equal(res.hits, 5);          // dice >=3 or ==6: 3,4,5,6,6
  assert.equal(res.fireModeHeat, 3);  // three 1s under Full Auto
});

test("applyDefensiveReactions is an identity pass-through for a wound hit (no reactive gear)", () => {
  const target = { weightClass: "medium" }; // no equipment, no equipState
  const hit = { die: 5, target: 4, pen: 7, toughness: 5, sp: 2, kind: "wound" };
  const out = applyDefensiveReactions(target, hit, { location: "hull", spendHeat: () => {} });
  assert.deepEqual(out, hit); // unchanged
});

test("applyDefensiveReactions is an identity pass-through for a to-hit tally (no reactive gear)", () => {
  const target = { weightClass: "medium" };
  const hit = { kind: "tohit", ranged: true, hits: 4 };
  const out = applyDefensiveReactions(target, hit, { location: null, row: null, spendHeat: () => {} });
  assert.equal(out.hits, 4); // hit count untouched by the pass-through seam
});

test("rollWounds is byte-unchanged by the wound seam for a plain target", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 7 medium, D2
  const plain = { weightClass: "medium", hardened: false, preparation: null };
  const out = rollWounds({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].pen, 7); // 7(Penetration) + 0(front) — no dock, seam is a no-op
  assert.equal(out[0].target, 4); // 6 + 5(medium hull T) - 7
  assert.equal(out[0].sp, 2); // Autocannon D2
  assert.equal(out[0].kind, "wound"); // seam stamps the discriminator
});

test("rollToHit hit count is unchanged by the to-hit seam for a plain target", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // rof 2, medium
  const plain = { weightClass: "medium" };
  const res = rollToHit({ weightClass: "medium", hull: { sp: 7 } }, auto,
    { range: "near", cover: 0, target: plain }, [6, 6], () => 0);
  assert.equal(res.hits, 2); // both dice hit; the pass-through seam leaves the tally alone
});

test("computePen applies weight and Charged Shot", () => {
  assert.equal(computePen({ weightClass: "light" }, WEAPONS.longRange["Sniper Cannon"], {}), 9); // 10-1
  const arcGun = { ...WEAPONS.longRange["Arc Gun"], perks: ["Charged Shot"] };
  assert.equal(computePen({ weightClass: "medium" }, arcGun, { charged: true }), 10); // 8+0+2
});

test("penBreakdown — reports the base weapon Penetration and the weight modifier", () => {
  const attacker = makeRig(1, "A", "light", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = penBreakdown(attacker, { ...WEAPONS.melee["Sword"] }, {});
  assert.equal(b.value, 4);                       // Sword 5, light -1
  assert.deepEqual(b.terms, [
    { label: "weapon Penetration", value: 5 },
    { label: "light chassis", value: -1 },
  ]);
});

test("penBreakdown — a modifier that does not fire emits no term", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const b = penBreakdown(attacker, { ...WEAPONS.melee["Sword"] }, {});
  // medium weight mod is 0 — it must not appear as a term at all.
  assert.deepEqual(b.terms, [{ label: "weapon Penetration", value: 5 }]);
  assert.equal(b.value, 5);
});

test("penBreakdown — a live upgrade emits a named term", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  attacker.reactorOverdriveActive = true;
  const b = penBreakdown(attacker, { ...WEAPONS.melee["Sword"] }, {});
  assert.equal(b.value, 7);
  assert.ok(b.terms.some((t) => t.label === "Reactor Overdrive" && t.value === 2));
});

test("computePen — still returns a bare number, callers unchanged", () => {
  const attacker = makeRig(1, "A", "light", "a", { longRange: "Autocannon", melee: "Sword" });
  assert.equal(computePen(attacker, { ...WEAPONS.melee["Sword"] }, {}), 4);
});

test("Kickstart Pistons: first melee after charging into contact hits +2 Penetration", () => {
  const claw = WEAPONS.melee["Claw"];
  const charged = { weightClass: "medium", equipment: "servo-actuators", equipmentUpgrade: "kickstart-pistons", chargedIntoContact: true,  kickstartUsed: false };
  const idle    = { weightClass: "medium", equipment: "servo-actuators", equipmentUpgrade: "kickstart-pistons", chargedIntoContact: false, kickstartUsed: false };
  const spent   = { weightClass: "medium", equipment: "servo-actuators", equipmentUpgrade: "kickstart-pistons", chargedIntoContact: true,  kickstartUsed: true  };
  assert.equal(computePen(charged, claw, {}) - computePen(idle, claw, {}), 2); // charged → +2
  assert.equal(computePen(spent, claw, {}), computePen(idle, claw, {}));       // charge already spent → no bonus
  // The wrong Mobility upgrade (Field) never triggers, even when charged.
  const wrong = { ...charged, equipmentUpgrade: "reinforced-servos" };
  assert.equal(computePen(wrong, claw, {}), computePen(idle, claw, {}));
});

test("arcBonus: ranged +0/+2/+3, Raking Fire overrides", () => {
  const auto = WEAPONS.longRange["Autocannon"];
  assert.equal(arcBonus(auto, "front"), 0);
  assert.equal(arcBonus(auto, "side"), 2);
  assert.equal(arcBonus(auto, "rear"), 3);
  const mini = { ...WEAPONS.longRange["Mini Gun"], perks: ["Raking Fire"] };
  assert.equal(arcBonus(mini, "front"), null); // front auto-fails
  assert.equal(arcBonus(mini, "side"), 3);
  assert.equal(arcBonus(mini, "rear"), 6);
});

test("arcBonus — melee gets the same side/rear ladder as ranged", () => {
  // Melee returning 0 here was the root cause of the old model's 69 dead zones:
  // ranged could climb into heavy armour and melee could not.
  const melee = { melee: true, accuracy: [0, 0] };
  assert.equal(arcBonus(melee, "front"), 0);
  assert.equal(arcBonus(melee, "side"), 2);
  assert.equal(arcBonus(melee, "rear"), 3);
});

test("arcBonus — Raking Fire still replaces the ladder and auto-fails the front", () => {
  const rake = { perks: ["Raking Fire"] };
  assert.equal(arcBonus(rake, "front"), null);
  assert.equal(arcBonus(rake, "side"), 3);
  assert.equal(arcBonus(rake, "rear"), 6);
});

test("rollWounds computes a per-hit wound roll and honours Brace on the front arc", () => {
  const target = { weightClass: "medium", preparation: { type: "brace" } };
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 7 medium, D2
  // 2 hits -> effPen 7 + 0(front) - 2(brace) = 5 vs medium hull T5 -> TN 6+5-5 = 6.
  const out = rollWounds({ weightClass: "medium" }, target, auto, "hull",
    { arc: "front", hits: 2 }, { wounds: [10, 10] }, () => 0);
  assert.equal(out.length, 2);
  assert.equal(out[0].pen, 5);
  assert.equal(out[0].target, 6);
  assert.equal(out[0].sp, 2); // Autocannon D2
});

test("rollWounds applies Harden's -1 Penetration alongside Brace, stacking", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 7 medium
  const hardened = { weightClass: "medium", hardened: true, preparation: null };
  // 1 hit -> 7 + 0(front) - 1(harden) = 6 effective Penetration.
  const out = rollWounds({ weightClass: "medium" }, hardened, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].pen, 6);

  const both = { weightClass: "medium", hardened: true, preparation: { type: "brace" } };
  const out2 = rollWounds({ weightClass: "medium" }, both, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out2[0].pen, 4); // 7 - 2(brace) - 1(harden)
  assert.equal(out2[0].target, 7); // 6 + 5 - 4 — the dock moves the TN, not the roll
});

test("Reinforced Plating deepens Harden to −2 effective Penetration", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 7 medium
  const hardened = { weightClass: "medium", hardened: true, preparation: null };
  const reinforced = { weightClass: "medium", hardened: true, preparation: null, equipment: "ablative-plating", equipmentUpgrade: "reinforced-plating" };
  // plain: 7 + 0(front) - 1(harden) = 6; reinforced: 7 + 0 - 2(harden) = 5
  const out = rollWounds({ weightClass: "medium" }, hardened, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  const out2 = rollWounds({ weightClass: "medium" }, reinforced, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].pen, 6);
  assert.equal(out2[0].pen, 5);
  assert.equal(out[0].pen - out2[0].pen, 1); // −2 vs −1 = 1 lower
});

test("Reactive Plating docks side/rear attacker Penetration; Angled Plates doubles it", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 8 medium
  const plain = { weightClass: "medium", hardened: false, preparation: null, equipmentUpgrade: null, equipment: null };
  const reactive = { weightClass: "medium", hardened: false, preparation: null, equipmentUpgrade: null, equipment: "reactive-plating" };
  const angled = { weightClass: "medium", hardened: false, preparation: null, equipmentUpgrade: "angled-plates", equipment: "reactive-plating" };
  // side arc -> 7 + 2(side bonus) = 9 effective Penetration for plain; reactive docks -1; angled docks -2.
  const outPlain = rollWounds({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "side", hits: 1 }, { wounds: [10] }, () => 0);
  const outReactive = rollWounds({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "side", hits: 1 }, { wounds: [10] }, () => 0);
  const outAngled = rollWounds({ weightClass: "medium" }, angled, auto, "hull",
    { arc: "side", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(outPlain[0].pen, 9);
  assert.equal(outPlain[0].pen - outReactive[0].pen, 1);
  assert.equal(outPlain[0].pen - outAngled[0].pen, 2);

  // Rear arc docks identically to side.
  const rearPlain = rollWounds({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  const rearReactive = rollWounds({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  const rearAngled = rollWounds({ weightClass: "medium" }, angled, auto, "hull",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(rearPlain[0].pen - rearReactive[0].pen, 1);
  assert.equal(rearPlain[0].pen - rearAngled[0].pen, 2);

  // Front arc is unaffected: a reactive-plating target takes no dock.
  const frontPlain = rollWounds({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  const frontReactive = rollWounds({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(frontReactive[0].pen, frontPlain[0].pen);
});

test("Raking Fire against the front arc deals no damage", () => {
  const mini = { ...WEAPONS.longRange["Mini Gun"], perks: ["Raking Fire"] };
  const out = rollWounds({ weightClass: "medium" }, { weightClass: "light" }, mini, "hull",
    { arc: "front", hits: 3 }, { wounds: [10, 10, 10] }, () => 0);
  assert.equal(out.every((h) => h.sp === 0), true);
});

test("Raise Shield negates the front arc and blunts side/rear by 3", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 7 medium
  const base = {
    weightClass: "medium",
    weapons: { melee: "Bulwark Shield" },
    weaponUpgrades: { melee: "anvil-boss" }, // base coverage (no Tower Shield)
    preparation: { type: "raise-shield" },
  };

  // Front: fully negated regardless of the roll — natural 10s included.
  const front = rollWounds({ weightClass: "medium" }, base, auto, "hull",
    { arc: "front", hits: 2 }, { wounds: [10, 10] }, () => 0);
  assert.equal(front.every((h) => h.sp === 0 && h.negated === true), true);

  // Side: only blunted -> 7 + 2(side) - 3(shield) = 6 effective Penetration, TN 6+5-6 = 5.
  const side = rollWounds({ weightClass: "medium" }, base, auto, "hull",
    { arc: "side", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(side[0].pen, 6);
  assert.equal(side[0].target, 5);
  assert.equal(side[0].sp, 2); // Autocannon D2 — blunted, not negated
});

test("Tower Shield extends Raise Shield negation to the side arc", () => {
  const auto = WEAPONS.longRange["Autocannon"];
  const tower = {
    weightClass: "medium",
    weapons: { melee: "Bulwark Shield" },
    weaponUpgrades: { melee: "tower-shield" },
    preparation: { type: "raise-shield" },
  };
  // Side negated; rear only blunted: 7 + 3(rear) - 3(shield) = 7 effective Penetration.
  const side = rollWounds({ weightClass: "medium" }, tower, auto, "hull",
    { arc: "side", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(side[0].sp, 0);
  assert.equal(side[0].negated, true);
  const rear = rollWounds({ weightClass: "medium" }, tower, auto, "hull",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(rear[0].pen, 7);
  assert.equal(rear[0].sp, 2); // blunted only — the rear still wounds
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
      dice: { toHit: [6], location: 1, wounds: [10], ap: [1] } }, () => 0, ctx);
  assert.equal(res.location, "hull");
  assert.equal(hullBreached, target);
  assert.equal(target.hullRepairLock, 2);
});

test("effectiveWeaponProfile applies selected ROF, Penetration, perk, and range upgrades", () => {
  const mini = makeRig(1, "Belt", "medium", "a", { longRange: "Mini Gun", melee: "Sword", longRangeUpgrade: "extended-belt" });
  assert.equal(effectiveWeaponProfile("longRange", "Mini Gun", mini).rof, 10);

  const auto = makeRig(2, "Core", "medium", "a", { longRange: "Autocannon", melee: "Sword", longRangeUpgrade: "depleted-core" });
  assert.equal(computePen(auto, effectiveWeaponProfile("longRange", "Autocannon", auto), {}), 9); // 7 base + 2 (Depleted Core)

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
  const ranged = { peak: 0, dropoff: 0, sweet: 6 }; // flat Accuracy 0
  const plain   = computeModifiedAim(attacker, ranged, { distance: 6, cover: 2 });
  const painted = computeModifiedAim(attacker, ranged, { distance: 6, cover: 2, painted: true });
  // cover 2 removed (+2 to accuracyTotal) AND +1 Aim ⇒ modAim drops by 3.
  assert.equal(plain - painted, 3);
});

test("painted does not help melee weapons", () => {
  const attacker = { weightClass: "medium", hull: { sp: 8 } };
  const melee = { melee: true, accuracy: [0, 0] };
  const a = computeModifiedAim(attacker, melee, { distance: 2, cover: 0 });
  const b = computeModifiedAim(attacker, melee, { distance: 2, cover: 0, painted: true });
  assert.equal(a, b);
});

test("resolveAttack emits a per-die roll for each hit-die plus a location d12, each with a tone", () => {
  // Autocannon: rof 4, accuracy [0,-1], no Full Auto requested here. Medium
  // attacker, full hull, near range, front arc, cover 0, fire (not aimed) ->
  // modAim = BASE_AIM(4) - (accuracy[0]=0 - cover=0 + aimedPenalty=0 + hullPenalty=0) = 4.
  // ap-shells (tuned) carries no Penetration bonus, so the expected Penetration below stays the
  // bare base+weight-class value — the default upgrade (depleted-core, field)
  // would add +2 Penetration and throw off the comparison.
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

  // Structured breakdown mirrors the summary. The hits count and the weapon
  // Penetration that used to sit in one flat `terms` array now live on the steps they
  // belong to: hits on the hit step, weapon Penetration on the wound step. Same
  // behaviour, moved shape.
  const b = attackRes.breakdown;
  assert.ok(b, "expected a breakdown on the attack resolution");
  assert.equal(b.weapon, "Autocannon");
  assert.equal(b.location, "hull");

  const hit = b.steps.find((s) => s.kind === "hit");
  assert.match(hit.out, /3 of 4 hit/);
  assert.equal(hit.dice.filter((d) => d.ok).length, 3);

  const wound = b.steps.find((s) => s.kind === "wound");
  const penTerm = wound.terms.find((t) => t.label === "weapon Penetration");
  assert.equal(penTerm.value, computePen(attacker, WEAPONS.longRange.Autocannon, {}));

  // The location the d12 picked is its own step now, not a bare field.
  const loc = b.steps.find((s) => s.kind === "location");
  assert.equal(loc.die, 3);
  assert.equal(loc.out, "hull");
});

test("computePen skips weight-class modifier for flat-pick weapons", () => {
  // A tank has no weightClass at all; this double carries one anyway to prove
  // flatPick ignores it rather than merely lacking one to read.
  const attackerWithClass = { kind: "tank", weightClass: "light" };
  const profile = { pen: 12, perks: [], flatPick: true };
  assert.equal(computePen(attackerWithClass, profile, { charged: false }), 12);
});

test("computePen still applies weight-class modifier for rig-catalog weapons", () => {
  const attacker = { kind: "rig", weightClass: "light" };
  const profile = { pen: 8, perks: [] };
  assert.equal(computePen(attacker, profile, { charged: false }), 8 - 1); // light is -1 on the d10 ladder
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

test("Ballistic Processor: +1 Accuracy in the sweet band (lower modAim)", () => {
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
  // cover 2 and engaged −2 both feed accuracyTotal (+2 and +2 to the target number);
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

test("Cold Bore adds +3 Penetration only when the target is at full SP", () => {
  const sniper = makeRig(1, "S", "medium", "a", { longRange: "Sniper Cannon", melee: "Chainsaw", lrUpgrade: "cold-bore" });
  const fresh = makeRig(2, "F", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const hurt = makeRig(3, "H", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  hurt.arms.sp -= 1;
  const p = effectiveWeaponProfile("longRange", "Sniper Cannon", sniper);
  assert.equal(computePen(sniper, p, { target: fresh }), p.pen + 3);
  assert.equal(computePen(sniper, p, { target: hurt }), p.pen);
});

test("Reactor Overdrive: computePen adds +2 Penetration to every attack while active", () => {
  const profile = { pen: 6, sweet: 0 };
  const base = { weightClass: "medium" };
  const overdriven = { weightClass: "medium", reactorOverdriveActive: true };
  const plain = computePen(base, profile, {});
  const boosted = computePen(overdriven, profile, {});
  assert.equal(boosted, plain + 2);
});

test("Steady Aim grants +3 Penetration within 2\" of the sweet spot, nothing off-band", () => {
  const rig = makeRig("r1", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "steady-aim", melee: "honed-talons" };
  const prof = effectiveWeaponProfile("longRange", "Crossbow", rig); // base Penetration 8, sweet 18
  assert.equal(computePen(rig, prof, { distance: 18 }), 11); // at sweet: 8 + 3
  assert.equal(computePen(rig, prof, { distance: 20 }), 11); // +2" edge: still in band
  assert.equal(computePen(rig, prof, { distance: 16 }), 11); // -2" edge: still in band
  assert.equal(computePen(rig, prof, { distance: 21 }), 8);  // off-band: no bonus
  assert.equal(computePen(rig, prof, {}), 8);                // no distance: no bonus
});

test("Exploit Wound grants +3 Penetration only against an already-damaged struck location", () => {
  const rig = makeRig("r2", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "fletched-bolts", melee: "exploit-wound" };
  const prof = effectiveWeaponProfile("melee", "Talon", rig); // base Penetration 6
  const wounded = { weightClass: "medium", hull: { sp: 3, max: 7 } };
  const fresh = { weightClass: "medium", hull: { sp: 7, max: 7 } };
  assert.equal(computePen(rig, prof, { target: wounded, location: "hull" }), 9); // 6 + 3
  assert.equal(computePen(rig, prof, { target: fresh, location: "hull" }), 6);   // no bonus
  assert.equal(computePen(rig, prof, { target: wounded }), 6);                   // no location: no bonus
});

test("Evisceration adds +1 D on a location at or below half max SP", () => {
  const rig = makeRig("r3", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "fletched-bolts", melee: "evisceration" };
  const prof = effectiveWeaponProfile("melee", "Talon", rig); // Penetration 6, D3
  // Hull 3/7 -> 3 <= 3.5 half-dead, so a landed wound deals D3 +1 = 4.
  const halfDead = { weightClass: "medium", hull: { sp: 3, max: 7 } };
  const out = rollWounds(rig, halfDead, prof, "hull", { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].sp, 4);
  // Hull 4/7 -> 4 > 3.5 NOT half-dead: the same wound deals the bare D3.
  const above = { weightClass: "medium", hull: { sp: 4, max: 7 } };
  const out2 = rollWounds(rig, above, prof, "hull", { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out2[0].sp, 3);
});

test("Evisceration downside: -1 Penetration against a fully-undamaged struck location", () => {
  const rig = makeRig("r4", "Shrike", "medium", "A", { longRange: "Crossbow", melee: "Talon" });
  rig.weaponUpgrades = { longRange: "fletched-bolts", melee: "evisceration" };
  const prof = effectiveWeaponProfile("melee", "Talon", rig); // base Penetration 6
  const fresh = { weightClass: "medium", hull: { sp: 7, max: 7 } };
  const hurt = { weightClass: "medium", hull: { sp: 5, max: 7 } };
  assert.equal(computePen(rig, prof, { target: fresh, location: "hull" }), 5); // 6 - 1
  assert.equal(computePen(rig, prof, { target: hurt, location: "hull" }), 6);  // damaged: no downside
});

test("Full Tilt adds +3 Penetration only when the attacker moved this activation", () => {
  const lance = makeRig(1, "L", "medium", "a", { longRange: "Mini Gun", melee: "Lance", meleeUpgrade: "full-tilt" });
  const p = effectiveWeaponProfile("melee", "Lance", lance);
  assert.equal(computePen(lance, p, {}), p.pen); // stationary — no bonus
  lance.movedThisActivation = true;
  assert.equal(computePen(lance, p, {}), p.pen + 3);
});

test("Momentum Swing reuses the charge gate for +2 Penetration (generalised charge key)", () => {
  const ball = makeRig(1, "WB", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball", meleeUpgrade: "momentum-swing" });
  const p = effectiveWeaponProfile("melee", "Wrecking Ball", ball);
  assert.equal(computePen(ball, p, {}), p.pen); // stationary — no bonus
  ball.movedThisActivation = true;
  assert.equal(computePen(ball, p, {}), p.pen + 2);
});

test("Piledriver Protocol spends Momentum for +Penetration and ignores a braced front arc", () => {
  const ram = makeRig(1, "Ram", "medium", "a", { longRange: "Siege Maul", melee: "Bulwark Shield", lrUpgrade: "piledriver-protocol" });
  const wall = makeRig(2, "Wall", "medium", "b", { longRange: "Autocannon", melee: "Sword" });
  wall.preparation = { type: "brace" }; // braced on the front arc
  const p = effectiveWeaponProfile("longRange", "Siege Maul", ram); // Penetration 11, medium (+0)

  // computePen: the threaded momentum spend adds +1 Penetration per point.
  assert.equal(computePen(ram, p, { target: wall, momentum: 3 }), p.pen + 3);

  // These assert effective Penetration, NOT the wound TN, deliberately: the Siege Maul is
  // strong enough that both cases below clamp to TN 2 against a medium hull, so a
  // TN assertion would pass identically whether or not the guard-break worked.
  // Without a guard-break, the brace's -2 applies: 11 + 0(front) - 2 = 9.
  const normal = rollWounds(ram, wall, p, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(normal[0].pen, 9);

  // Piledriver guard-break skips the brace AND adds +3 Penetration: 11 + 3 + 0 = 14.
  const smash = rollWounds(ram, wall, p, "hull",
    { arc: "front", hits: 1, momentum: 3, guardBreak: true }, { wounds: [10] }, () => 0);
  assert.equal(smash[0].pen, 14);
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
      dice: { toHit: [4], location: 1, wounds: [10] } }, () => 0, ctx);
  assert.equal(res.ok, true);
  assert.equal(res.hits, 1);          // cover ignored → the shot lands
  assert.equal(ram.momentum, 0);      // all Momentum unloaded by the shot
});

test("A Siege Maul rig without Piledriver never spends or reads Momentum", () => {
  const ram = makeRig(1, "Plain", "medium", "a", { longRange: "Siege Maul", melee: "Sword", lrUpgrade: "breaching-round" });
  const p = effectiveWeaponProfile("longRange", "Siege Maul", ram);
  // A stray momentum in opts must NOT add Penetration without the piledriver effect.
  assert.equal(computePen(ram, p, { target: {}, momentum: 3 }), p.pen);
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
  assert.equal(computePen(sniper, cb, { target: pristineTank }), cb.pen + 3); // pristine tank IS undamaged → +3
});

test("Opportunist adds +3 Penetration vs an overheated or action-penalised target", () => {
  const sword = makeRig(1, "S", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "opportunist" });
  const p = effectiveWeaponProfile("melee", "Sword", sword);
  const healthy = makeRig(2, "H", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  assert.equal(computePen(sword, p, { target: healthy }), p.pen);

  const overheated = makeRig(3, "O", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  overheated.engine.heat = HEAT_CAPACITY[overheated.weightClass] + 1;
  assert.equal(computePen(sword, p, { target: overheated }), p.pen + 3);

  const disrupted = makeRig(4, "D", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  disrupted.actionPenaltyNextActivation = 1;
  assert.equal(computePen(sword, p, { target: disrupted }), p.pen + 3);
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
    dice: { toHit: [6], clusterLocation: 9, wounds: [10] },
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

test("Redline Governor adds Penetration from attacker heat over cap, capped at +3", () => {
  const rig = makeRig(1, "R", "medium", "a", { longRange: "Mini Gun", melee: "Chainsaw", meleeUpgrade: "redline-governor" });
  const p = effectiveWeaponProfile("melee", "Chainsaw", rig);
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass]; // at cap -> no bonus
  assert.equal(computePen(rig, p, {}), p.pen);
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass] + 2; // +2 over cap
  assert.equal(computePen(rig, p, {}), p.pen + 2);
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass] + 10; // way over cap, still capped at +3
  assert.equal(computePen(rig, p, {}), p.pen + 3);
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

test("Superconductor Edge adds +2 Penetration when attacker heat is over half class cap", () => {
  const rig = makeRig(1, "S", "medium", "a", { longRange: "Mini Gun", melee: "Sword", meleeUpgrade: "superconductor-edge" });
  const p = effectiveWeaponProfile("melee", "Sword", rig);
  rig.engine.heat = Math.floor(HEAT_CAPACITY[rig.weightClass] / 2); // at/under half -> no bonus
  assert.equal(computePen(rig, p, {}), p.pen);
  rig.engine.heat = HEAT_CAPACITY[rig.weightClass]; // clearly over half
  assert.equal(computePen(rig, p, {}), p.pen + 2);
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

test("Penetrator Rounds forces the 3rd Autocannon volley's hits to wound, bypassing the wound roll", () => {
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
  // 3rd volley: 1 landed hit (die 6). The wound die is a natural 1 — Autocannon
  // Penetration 7 vs a medium hull (T5) is TN 4, so that die would FAIL on its own. The
  // upgrade skips the wound roll entirely, so it still deals the weapon's D2.
  // A failing die is the point: a 10 here would wound with or without the upgrade.
  const res = resolveAttack(room, attacker, target, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [6, 1, 1, 1], location: 1, wounds: [1] },
  }, () => 0, ctx);
  assert.equal(attacker.autocannonShots, 3);
  assert.equal(res.impacts.length, 1);
  assert.equal(res.impacts[0].die, 1);
  assert.equal(res.impacts[0].sp, 2); // wounded anyway — the roll was bypassed
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
    dice: { toHit: [6, 1], location: 1, wounds: [1] },
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
  // all four to land. Every WOUND die is a natural 1 (Missile Barrage Penetration 7 vs a
  // medium hull T5 is TN 4, so all four fail outright); only the AP reroll can
  // save them. Rerolling 10/1/1/1 proves Armour Piercing is applied per-die, not
  // to the volley as a whole.
  const res = resolveAttack(room, attacker, target, {
    weapon: "longRange", arc: "front", range: "near", cover: 0,
    dice: { toHit: [1, 1, 1, 1], location: 1, wounds: [1, 1, 1, 1], ap: [10, 1, 1, 1] },
  }, () => 0, ctx);
  assert.equal(res.hits, 4);                    // unmissable volley — all shots land
  assert.equal(res.impacts[0].sp, 2);           // AP reroll turned a failed wound into a D2
  assert.equal(res.impacts.filter((h) => h.sp > 0).length, 1); // only the rerolled 10 landed
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

test("Breach Grip — a cracked location adds +2 effective Penetration over its 2-round window, gone by N+2", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 7 medium
  // Applied at round N=4 stores expiry N+1=5: live at rounds 4 and 5, gone at 6.
  const cracked = { weightClass: "medium", cracked: { hull: 5 } };
  const plain = { weightClass: "medium" };
  // Penetration 7 + 0(front) = 7 effective with no crack.
  const base = rollWounds({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1, round: 5 }, { wounds: [10] }, () => 0);
  assert.equal(base[0].pen, 7);
  // Round N (4) and N+1 (5) are both live: 7 + 2 = 9.
  for (const round of [4, 5]) {
    const live = rollWounds({ weightClass: "medium" }, cracked, auto, "hull",
      { arc: "front", hits: 1, round }, { wounds: [10] }, () => 0);
    assert.equal(live[0].pen, 9, `round ${round} should still be cracked`);
  }
  // Gone by N+2 (round 6): the +2 is no longer applied (5 >= 6 is false).
  const stale = rollWounds({ weightClass: "medium" }, cracked, auto, "hull",
    { arc: "front", hits: 1, round: 6 }, { wounds: [10] }, () => 0);
  assert.equal(stale[0].pen, 7);
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
      dice: { toHit: [6, 6, 6], location: 1, wounds: [10, 10, 10] } }, () => 0, ctx);
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
    dice: { toHit: [6], location: [1], wounds: [10] },
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
      dice: { toHit: [6, 6, 6], location: 1, wounds: [10, 10, 10] } }, () => 0, ctx);
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
      dice: { toHit: [6], wounds: [10], ap: [1] } }, () => 0, ctx);
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
        dice: { toHit: [6], wounds: [10], ap: [1] } }, () => 0, ctx);
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
      dice: { toHit: [6], location: 1, wounds: [10], ap: [1] } }, () => 0, ctx3);
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
  const opts = { weapon: "melee", arc: "front", range: "near", dice: { toHit: [6], location: 1, wounds: [10] } };

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
  const shot = { weapon: "longRange", arc: "front", range: "near", cover: 0, dice: { toHit: [6], location: 1, wounds: [10] } };

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
      dice: { toHit: [6], location: 1, wounds: [10] } }, () => 0, ctx);
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
    "Enfilade — ricochet! Resolve a +2 Penetration hit on the next rig in line of sight behind T (player's choice).");

  // A non-aimed shot fires but must NOT advance the aimed-shot cadence.
  const c4 = fire({ ...aimed, aimed: false, aimedLoc: undefined });
  assert.equal(sniper.enfiladeShots, 3); // unchanged by the non-aimed shot
  assert.ok(!c4.resolutions.some((r) => /Enfilade — ricochet/.test(r.summary)));
});

test("Tow Chain emits the fling instruction, adds +2 heat, roots the attacker, and sets the cooldown — then no fling while recharging", () => {
  const opts = { weapon: "melee", arc: "front", range: "near", dice: { toHit: [6], location: 1, wounds: [10] } };

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
    dice: { toHit: [6], wounds: [10], location: 1 },
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
      dice: { toHit: [6], wounds: [10], ap: [1] } }, () => 0, ctx);
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
      dice: { toHit: [6], wounds: [10], ap: [1] } }, () => 0, ctx2);
  assert.deepEqual(target2.kneecapped, {}); // untagged by an ordinary weapon
});

test("Taut Cable: +3 Penetration vs an immobilised or engaged target, else nothing", () => {
  const harpoon = { ...WEAPONS.longRange["Harpoon"], upgradeEffect: { vsPinned: true } };
  const attacker = { weightClass: "medium" };
  // base Penetration 10, medium weight mod 0
  assert.equal(computePen(attacker, harpoon, { target: { weightClass: "light" } }), 10);
  assert.equal(computePen(attacker, harpoon, { target: { weightClass: "light", immobilised: true } }), 13);
  assert.equal(computePen(attacker, harpoon, { target: { weightClass: "light", engagedWith: 7 } }), 13);
});

test("Reactive Armor hardens the struck location on the first damaging hit each round (−2 effective Penetration)", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 7 medium
  const plain = { weightClass: "medium", hardened: false, preparation: null };
  const reactive = {
    weightClass: "medium", hardened: false, preparation: null,
    equipment: "ablative-plating", equipmentUpgrade: "reactive-armor",
    equipState: { reactiveArmorLocs: [] },
  };
  // The FIRST hit is not yet docked — the list is empty when its Penetration is computed;
  // the seam records "hull" only after that wound resolves. So both sides read
  // Penetration 7 here, and the dock shows up on the SECOND volley below.
  const outPlain = rollWounds({ weightClass: "medium" }, plain, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  const outReactive = rollWounds({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(outPlain[0].pen, 7);
  assert.equal(outReactive[0].pen, 7);
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull"]); // that location is now hardened

  // A second volley to the SAME hardened location is docked -2, and the location
  // is not re-recorded.
  const outReactive2 = rollWounds({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(outReactive2[0].pen, 5); // 7 - 2
  assert.equal(outReactive2[0].target, 6); // 6 + 5 - 5
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull"]); // no duplicate
});

test("Reactive Armor independently hardens a second, different location (reactiveArmorLocs holds multiple entries)", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 7 medium
  const reactive = {
    weightClass: "medium", hardened: false, preparation: null,
    equipment: "ablative-plating", equipmentUpgrade: "reactive-armor",
    equipState: { reactiveArmorLocs: [] },
  };
  // First damaging hit hardens "hull" only.
  rollWounds({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull"]);

  // A first damaging hit to a DIFFERENT location ("legs") is recorded
  // independently — proves reactiveArmorLocs is a per-location list, not a single
  // "already reacted this round" flag. Legs are undocked on this first hit (Penetration 7)
  // even though hull is already hardened.
  const firstLegs = rollWounds({ weightClass: "medium" }, reactive, auto, "legs",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(firstLegs[0].pen, 7);
  assert.deepEqual(reactive.equipState.reactiveArmorLocs, ["hull", "legs"]); // both tracked

  // Each hardened location now docks its own subsequent hits, independently.
  const secondLegs = rollWounds({ weightClass: "medium" }, reactive, auto, "legs",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  const secondHull = rollWounds({ weightClass: "medium" }, reactive, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(secondLegs[0].pen, 5);
  assert.equal(secondHull[0].pen, 5);
});

test("Reactive Armor does not fire for a rig carrying only the base Ablative Plating", () => {
  const auto = WEAPONS.longRange["Autocannon"]; // Penetration 7 medium
  const base = {
    weightClass: "medium", hardened: false, preparation: null,
    equipment: "ablative-plating", equipmentUpgrade: "reinforced-plating",
    equipState: { reactiveArmorLocs: [] },
  };
  rollWounds({ weightClass: "medium" }, base, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.deepEqual(base.equipState.reactiveArmorLocs, []);  // nothing hardened
  // A second hit is still undocked — nothing was ever recorded to dock against.
  const out = rollWounds({ weightClass: "medium" }, base, auto, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].pen, 7); // no reactive dock
});

// Ablative Cascade (Ablative Plating, Prototype). The seam is flat
// (`hit.sp`/`kind:"wound"`) and injects heat via `ctx.spendHeat(n)`. Under the
// wound model a charge negates a wound OUTRIGHT rather than softening it one
// severity step — there are no steps left to soften. The negate-outright and
// failed-wound cases are covered end-to-end through rollWounds in the §7.5 block
// below; these two exercise the seam directly.
test("Ablative Cascade: with no charges left, the wound lands full", () => {
  const target = {
    weightClass: "medium", equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
    equipState: { ablativeCharges: 0 },
  };
  let heated = 0;
  const hit = { die: 10, target: 4, pen: 7, toughness: 5, sp: 2, kind: "wound" };
  const out = applyDefensiveReactions(target, hit, { location: "hull", spendHeat: (n) => { heated += n; } });
  assert.equal(out.sp, 2);                                 // untouched
  assert.equal(out.negated, undefined);
  assert.equal(heated, 0);                                 // no heat when nothing spent
});

test("Ablative Cascade: a failed wound never spends a charge (gated on hit.sp > 0)", () => {
  const target = {
    weightClass: "medium", equipment: "ablative-plating", equipmentUpgrade: "ablative-cascade",
    equipState: { ablativeCharges: 2 },
  };
  let heated = 0;
  const hit = { die: 1, target: 4, pen: 7, toughness: 5, sp: 0, kind: "wound" };
  const out = applyDefensiveReactions(target, hit, { location: "hull", spendHeat: (n) => { heated += n; } });
  assert.equal(out.sp, 0);
  assert.equal(target.equipState.ablativeCharges, 2);      // charge untouched
  assert.equal(heated, 0);
});

// Point-Defense System (Reactive Plating, Prototype). NOTE: like Ablative
// Cascade above, the plan's fixtures were drafted against a hypothetical seam
// (`hit.rerollHits`, `ctx.bumpHeat`). The live Plan-2 to-hit seam has already
// COUNTED the landed dice into `hit.hits` and writes the returned `.hits` back
// into rollToHit's tally; heat is injected via `ctx.spendHeat(n)`. So the branch
// itself rerolls the landed dice and returns the new count. combat.js stays pure:
// the RNG (`random`) and any `providedDice.pd` reroll faces are threaded through
// ctx by rollToHit exactly like `spendHeat`. These tests target the real seam.
test("Point-Defense: a ranged hit spends 1 interceptor to reroll landed dice, at +1 heat", () => {
  const target = {
    kind: "rig", weightClass: "medium", equipment: "reactive-plating", equipmentUpgrade: "point-defense-system",
    engine: { heat: 0 }, equipState: { interceptors: 2, pdLocked: false },
  };
  let heated = 0;
  const ctx = {
    location: null, row: null, spendHeat: (n) => { heated += n; },
    random: () => 0, providedDice: { pd: [6, 1, 1] },     // 3 landed dice reroll to 6,1,1 vs modAim 4 → 1 survives
  };
  const hit = { kind: "tohit", ranged: true, hits: 3, modAim: 4 };
  const out = applyDefensiveReactions(target, hit, ctx);
  assert.equal(out.hits, 1);                              // reroll softened 3 landed hits down to 1
  assert.equal(target.equipState.interceptors, 1);        // one interceptor spent
  assert.equal(heated, 1);                                // +1 heat per charge spent
});

test("Point-Defense: no intercept on a melee hit, when spent out, or while fire-locked", () => {
  const base = {
    kind: "rig", weightClass: "medium", equipment: "reactive-plating",
    equipmentUpgrade: "point-defense-system", engine: { heat: 0 },
  };
  // pd reroll faces of all 1s would zero the tally IF a reroll fired — so an
  // unchanged hits===2 proves the branch did NOT engage.
  const mkCtx = () => ({ location: null, row: null, spendHeat: () => {}, random: () => 0, providedDice: { pd: [1, 1, 1] } });

  const meleeTarget = { ...base, equipState: { interceptors: 2, pdLocked: false } };
  const melee = applyDefensiveReactions(meleeTarget, { kind: "tohit", ranged: false, hits: 2, modAim: 4 }, mkCtx());
  assert.equal(melee.hits, 2);                            // melee is not intercepted
  assert.equal(meleeTarget.equipState.interceptors, 2);   // no charge spent

  const spentTarget = { ...base, equipState: { interceptors: 0, pdLocked: false } };
  const spent = applyDefensiveReactions(spentTarget, { kind: "tohit", ranged: true, hits: 2, modAim: 4 }, mkCtx());
  assert.equal(spent.hits, 2);                            // no charges → no reroll

  const lockedTarget = { ...base, equipState: { interceptors: 2, pdLocked: true } };
  const locked = applyDefensiveReactions(lockedTarget, { kind: "tohit", ranged: true, hits: 2, modAim: 4 }, mkCtx());
  assert.equal(locked.hits, 2);                          // locked the round after firing ranged
  assert.equal(lockedTarget.equipState.interceptors, 2);  // no charge spent
});

// ── §7.5 the wound roll (d10) ────────────────────────────────────────────────
// Fixture note: makeRig returns null unless BOTH weapon slots are filled — so the
// cases below use bare `{ weightClass }` doubles for the side whose class is the
// point, matching the plain-object style the older rollWounds tests in this file
// already use. rollWounds reads only weightClass/kind off those sides, so the
// doubles are faithful.
//
// The extreme cases below used a colossal target to reach the game's worst TN.
// Heavy and Colossal were deleted 2026-07-16, so the worst matchup is now
// Rivet Gun/light vs a medium hull at TN 9. Those fixtures moved to the Rivet Gun
// to keep testing the extreme they claim to, rather than swapping the class and
// quietly testing a mid-table matchup under an extreme-sounding name.

test("rollWounds — a wound deals the weapon's D, not 1", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const profile = { ...WEAPONS.melee["Wrecking Ball"] };
  // Penetration 10 + medium 0 + front 0 = 10 vs medium hull T5 => TN 6+5-10 = 1 -> clamp 2. A 9 wounds.
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [9] }, () => 0);
  assert.equal(out.length, 1);
  assert.equal(out[0].sp, 5); // Wrecking Ball dmg: 5
});

test("rollWounds — a natural 10 always wounds however hopeless the matchup", () => {
  // The guarantee the whole rewrite exists for. The old model gave 0 here, always.
  const attacker = makeRig(1, "A", "light", "a", { longRange: "Rivet Gun", melee: "Circular Saw" });
  const target = { weightClass: "medium" };
  const profile = { ...WEAPONS.longRange["Rivet Gun"] };
  // Penetration 3 + light -1 + front 0 = 2 vs medium hull T5 => TN 6+5-2 = 9. Only a 9-10 lands.
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].target, 9);
  assert.equal(out[0].sp, 1); // Rivet Gun dmg: 1
});

test("rollWounds — the wound test is `die >= TN`: rolling exactly the TN wounds", () => {
  // Pins the boundary itself. Every other fixture in this file rolls a 10 or a 1
  // to force an outcome, so an off-by-one here (`>` for `>=`) passes the whole
  // suite otherwise — verified by mutation. The TN is 10% per point of Penetration only
  // if the TN face itself is a hit.
  const attacker = makeRig(1, "A", "light", "a", { longRange: "Rivet Gun", melee: "Circular Saw" });
  const target = { weightClass: "medium" };
  const profile = { ...WEAPONS.longRange["Rivet Gun"] };
  // Penetration 3 + light -1 + front 0 = 2 vs medium hull T5 => TN 9.
  const atTn = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [9] }, () => 0);
  assert.equal(atTn[0].target, 9);
  assert.equal(atTn[0].sp, 1); // 9 >= 9 wounds

  const belowTn = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [8] }, () => 0);
  assert.equal(belowTn[0].sp, 0); // 8 < 9 does not
});

test("rollWounds — a natural 1 never wounds however lopsided", () => {
  const attacker = { weightClass: "medium" };
  const target = makeRig(2, "B", "light", "b", { longRange: "Autocannon", melee: "Claw" });
  const profile = { ...WEAPONS.melee["Wrecking Ball"] };
  // Penetration 10 + medium 0 + front 0 = 10 vs light hull T4 => TN 6+4-10 = 0 -> clamp 2.
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [1] }, () => 0);
  assert.equal(out[0].target, 2);
  assert.equal(out[0].sp, 0);
});

test("rollWounds — a raised shield still negates on a natural 10 (earned zero)", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Bulwark Shield" });
  target.preparation = { type: "raise-shield" };
  const profile = { ...WEAPONS.melee["Sword"] };
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].sp, 0);
  assert.equal(out[0].negated, true);
});

test("rollWounds — Raking Fire front arc still auto-fails on a natural 10", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  // Base weapons carry no perks; Raking Fire rides the Mini Gun profile itself.
  const profile = { ...WEAPONS.longRange["Mini Gun"] };
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].sp, 0);
  assert.equal(out[0].negated, true);
});

test("rollWounds — defender modifiers reduce effective Penetration, not the roll", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  target.preparation = { type: "brace" };
  const profile = { ...WEAPONS.melee["Sword"] };
  // Sword Penetration 5, medium mod 0, front arc 0, braced -2 => effPen 3 vs T5 => TN 8.
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1 }, { wounds: [7] }, () => 0);
  assert.equal(out[0].sp, 0);   // 7 < 8
  assert.equal(out[0].target, 8);
  assert.equal(out[0].die, 7);  // the roll is untouched; the TN moved
  assert.equal(out[0].pen, 3);
});

test("rollWounds — Overmatch converts wasted STR into damage", () => {
  const wb = WEAPONS.melee["Wrecking Ball"]; // Penetration 10, D5, ROF 1
  const target = { weightClass: "medium", hardened: false, preparation: null };
  // medium arms are T4, so the floor is pen 8. Penetration 10 wastes 2 — under the
  // 3-point rate, so a front-arc hit is still a plain D5.
  const front = rollWounds({ weightClass: "medium" }, target, wb, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(front[0].pen, 10);
  assert.equal(front[0].target, 2);      // clamped to the floor
  assert.equal(front[0].overmatch, 0);
  assert.equal(front[0].sp, 5);          // D5, nothing added
});

test("rollWounds — Overmatch revives the arc bonus on a saturated weapon", () => {
  // THE POINT OF THE WHOLE CHANGE. Before Overmatch, these two shots were
  // byte-identical: both clamped to TN 2, both dealt exactly D5, so flanking a
  // Wrecking Ball rig was worth literally nothing (sweep: rear/front ratio x1.00).
  const wb = WEAPONS.melee["Wrecking Ball"];
  const target = { weightClass: "medium", hardened: false, preparation: null };
  const front = rollWounds({ weightClass: "medium" }, target, wb, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  const rear = rollWounds({ weightClass: "medium" }, target, wb, "arms",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(rear[0].pen, 13);         // 10 + 3 (rear arc)
  assert.equal(front[0].target, rear[0].target); // both STILL clamped to 2...
  assert.equal(rear[0].overmatch, 1);            // ...but the arc now buys depth
  assert.equal(rear[0].sp - front[0].sp, 1);
});

test("rollWounds — Overmatch revives WEIGHT_PEN_MOD on a saturated weapon", () => {
  // Sweep measured the light↔medium delta as Δ0.00 for this weapon: both classes
  // clamped to TN 2, so the -1 was discarded entirely.
  //
  // The mod bites where Overmatch crosses a rate boundary. Siege Maul (STR 11)
  // into medium arms (T4, floor pen 8) wastes 3 → +1 D; the light -1 wastes 2 →
  // +0. Same shot, one weight class apart, one point of damage.
  const maul = WEAPONS.longRange["Siege Maul"]; // Penetration 11, D5
  const target = { weightClass: "medium", hardened: false, preparation: null };
  const med = rollWounds({ weightClass: "medium" }, target, maul, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  const light = rollWounds({ weightClass: "light" }, target, maul, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(med[0].pen, 11);
  assert.equal(light[0].pen, 10);           // WEIGHT_PEN_MOD light = -1
  assert.equal(med[0].target, light[0].target); // both STILL clamped to 2...
  assert.equal(med[0].overmatch, 1);            // ...but the mod now buys depth
  assert.equal(light[0].overmatch, 0);
  assert.equal(med[0].sp - light[0].sp, 1);
});

test("rollWounds — Overmatch stacks with Rend and respects its own cap", () => {
  // Overmatch, Rend and Evisceration all land in `sp`. The cap is on Overmatch
  // alone, not on the total — a Rend weapon still gets its +1 on top.
  //
  // The fixture has to OVERSHOOT the cap or it isn't testing one. pen 13 is a
  // real loadout: Siege Maul's base 11 plus Reinforced Head's +2. With the rear
  // arc that's effPen 16 into a T3 engine — 9 past the floor, which the 3-point
  // rate would pay out as +3. It resolves to 2 only because the cap bites, so
  // this goes red if the cap is raised or removed.
  const maul = { ...WEAPONS.longRange["Siege Maul"], perks: ["Rend"], pen: 13 };
  const target = { weightClass: "medium", hardened: false, preparation: null };
  const out = rollWounds({ weightClass: "medium" }, target, maul, "engine",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].pen, 16);
  assert.equal(out[0].overmatch, 2); // capped down from 3
  assert.equal(out[0].rend, 1);
  assert.equal(out[0].sp, 8); // D5 + 2 Overmatch + 1 rend
});

test("rollWounds — Overmatch reads the target's kind, not the rig toughness band", () => {
  // Every other Overmatch test targets a Rig. A Tank hull is T6, read off the
  // tank's own grid rather than a rig weight class — and Overmatch needs no
  // per-kind knowledge: it reads whatever toughnessOf returns for the TARGET's
  // kind. This pins that dispatch.
  //
  // (T6 is not "off the scale" — a tank hull is T6. It is simply not reachable on
  // a rig: T3-T5 is the whole rig board now that Heavy and Colossal are gone.)
  //
  // Siege Maul Penetration 11, medium attacker (WEIGHT_PEN_MOD 0), rear arc +3 =>
  // effPen 14 into a T6 hull. The floor is at pen T+4 = 10, so 4 points are
  // past it; at 3 points per D that pays out floor(4/3) = +1 D. D5 + 1 = 6 SP.
  const maul = WEAPONS.longRange["Siege Maul"];
  const tank = { kind: "tank", hardened: false, preparation: null };
  const out = rollWounds({ weightClass: "medium" }, tank, maul, "hull",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].toughness, 6);   // the tank grid, not a rig weight class
  assert.equal(out[0].pen, 14);
  assert.equal(out[0].target, 2);      // 6 + 6 - 14 = -2, clamped to the floor
  assert.equal(out[0].overmatch, 1);
  assert.equal(out[0].sp, 6);          // D5 + 1

  // The same shot into T4 rig arms wastes 6 and pays +2 — softer target, MORE
  // Overmatch, since a lower T puts the floor lower and leaves more STR past it.
  // Pins that T is actually read, not just tolerated.
  const rig = { weightClass: "medium", hardened: false, preparation: null };
  const vsRig = rollWounds({ weightClass: "medium" }, rig, maul, "arms",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(vsRig[0].toughness, 4);
  assert.equal(vsRig[0].overmatch, 2);
});

test("rollWounds — a weak weapon never overmatches", () => {
  const rivet = WEAPONS.longRange["Rivet Gun"]; // Penetration 3, D1
  const target = { weightClass: "medium", hardened: false, preparation: null };
  const out = rollWounds({ weightClass: "medium" }, target, rivet, "engine",
    { arc: "rear", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].overmatch, 0);
  assert.equal(out[0].sp, 1); // D1, untouched
});

test("rollWounds — the negated path carries overmatch: 0", () => {
  // Shape parity with rend/evisc. A shield-negated shot resolves no Overmatch,
  // but the rider must still expose the field the ledger reads.
  const wb = WEAPONS.melee["Wrecking Ball"];
  const shielded = {
    weightClass: "medium", hardened: false,
    preparation: { type: "raise-shield" },
    weaponUpgrades: {},
  };
  const out = rollWounds({ weightClass: "medium" }, shielded, wb, "arms",
    { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.equal(out[0].negated, true);
  assert.equal(out[0].overmatch, 0);
  assert.equal(out[0].sp, 0);
});

test("Reactive Armor — records the location; the dock lands in rollWounds", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  target.equipment = "ablative-plating";
  target.equipmentUpgrade = "reactive-armor";
  target.equipState = { reactiveArmorLocs: [] };
  const profile = { ...WEAPONS.melee["Sword"] };
  rollWounds(attacker, target, profile, "hull", { arc: "front", hits: 1 }, { wounds: [10] }, () => 0);
  assert.ok(target.equipState.reactiveArmorLocs.includes("hull"));
  // Now hardened: Sword Penetration 5 - 2 => effPen 3 vs T5 => TN 8, so a 7 fails.
  const out = rollWounds(attacker, target, profile, "hull", { arc: "front", hits: 1 }, { wounds: [7] }, () => 0);
  assert.equal(out[0].sp, 0);
  assert.equal(out[0].target, 8);
});

test("Ablative Cascade — a charge negates a wound outright (an earned zero)", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Mini Gun", melee: "Wrecking Ball" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  target.equipment = "ablative-plating";
  target.equipmentUpgrade = "ablative-cascade";
  target.equipState = { ablativeCharges: 2 };
  let heat = 0;
  const profile = { ...WEAPONS.melee["Wrecking Ball"] };
  const out = rollWounds(attacker, target, profile, "hull",
    { arc: "front", hits: 1, spendHeat: (n) => { heat += n; } }, { wounds: [10] }, () => 0);
  assert.equal(out[0].sp, 0);
  assert.equal(target.equipState.ablativeCharges, 1);
  assert.equal(heat, 1);
});

test("Ablative Cascade — spends nothing on a wound that already failed", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Mini Gun", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  target.equipment = "ablative-plating";
  target.equipmentUpgrade = "ablative-cascade";
  target.equipState = { ablativeCharges: 2 };
  const profile = { ...WEAPONS.melee["Sword"] };
  // Sword effPen 5 vs T5 => TN 6; a 1 fails, so no charge is burnt.
  rollWounds(attacker, target, profile, "hull", { arc: "front", hits: 1 }, { wounds: [1] }, () => 0);
  assert.equal(target.equipState.ablativeCharges, 2);
});

test("resolveAttack — wound dice are visible in rolls, one per landed hit", () => {
  // The impact dice were rolled and DISCARDED, which is why a player could not
  // answer "why 0 damage?". A wound die must reach the log.
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6, 6], wounds: [9, 1], location: 1 } },
    () => 0, ctx);
  const entry = ctx.resolutions.find((r) => r.kind === "attack");
  const wounds = entry.rolls.filter((r) => r.label?.startsWith("wound"));
  assert.equal(wounds.length, 2);
  assert.equal(wounds[0].sides, 10);
  assert.equal(wounds[0].tone, "ok");    // 9 wounds
  assert.equal(wounds[1].tone, "miss");  // 1 never wounds
});

// ---------------------------------------------------------------------------
// The resolution ledger (Plan 2). The flat one-equation breakdown could not
// answer "why 0 damage?" — it showed hits and Penetration and nothing about the die
// that actually decided it. `breakdown.steps` is the whole chain, in order,
// with every step's inputs, dice and outcome.
//
// The invariant that matters most: every number on a step is THREADED out of
// the engine, never recomputed for display. A ledger that is computed twice
// will drift, and a ledger that lies is worse than no ledger at all. See the
// reconciliation tests at the end of this block.

test("ledger — every step appears in resolution order", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6, 1], wounds: [10], location: 1 } },
    () => 0, ctx);
  const bd = ctx.resolutions.find((r) => r.kind === "attack").breakdown;
  // The ENGINE's order, which is the real one: the d12 lands before the wound
  // roll because Toughness is per-location — the struck part is what supplies
  // the T the wound roll tests against. Not the hit/wound/location sequence
  // 40k-style games use.
  assert.deepEqual(bd.steps.map((s) => s.kind), ["hit", "location", "wound", "damage"]);
  // The wound step's toughness must come from the location step ABOVE it, never
  // from a step the player hasn't been shown yet.
  const loc = bd.steps[1];
  const wound = bd.steps[2];
  assert.equal(loc.out, "hull");
  assert.equal(wound.toughness, toughnessOf("rig", "hull", "medium"));
  // The target NAME, not the wound TN. An earlier draft collided these two in
  // one object literal and a rig's name rendered as "→ 6" in RollConsole
  // (types.ts declares `target?: string`). The TN lives on the wound step.
  assert.equal(bd.target, "B");
});

test("ledger — the hit step shows the inputs that made the target number", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "longRange", arc: "front", distance: 12, cover: 2,
      dice: { toHit: [6, 6, 6, 6], wounds: [10, 10, 10, 10], location: 1 } },
    () => 0, ctx);
  const hit = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[0];
  assert.ok(hit.terms.some((t) => t.label === "cover" && t.value === -2));
  assert.equal(hit.dice.length, 4);             // Autocannon ROF 4
  assert.equal(hit.target, 5);                  // 4 - (Accuracy 1 - cover 2)
  assert.ok(hit.dice.every((d) => d.ok));
  assert.match(hit.out, /4 of 4 hit/);
});

test("ledger — the wound step shows effective Penetration against toughness", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6], wounds: [9], location: 1 } },
    () => 0, ctx);
  const w = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[2];
  assert.equal(w.pen, 5);          // Sword Penetration 5, medium mod 0, front arc 0
  assert.equal(w.toughness, 5);    // medium hull
  assert.equal(w.target, 6);       // 6 + 5 - 5
  assert.deepEqual(w.dice, [{ value: 9, ok: true }]);
});

test("ledger — an earned zero is a step that says so, not a missing step", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Bulwark Shield" });
  target.preparation = { type: "raise-shield" };
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6], wounds: [10], location: 1 } },
    () => 0, ctx);
  const w = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[2];
  assert.equal(w.kind, "wound");
  assert.equal(w.target, null);
  assert.match(w.out, /shield/i);
});

test("ledger — an earned zero still reports what the weapon would have dealt", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Bulwark Shield" });
  target.preparation = { type: "raise-shield" };
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6], wounds: [10], location: 1 } },
    () => 0, ctx);
  const d = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[3];
  // Regression: the negated path skips the damage branch, so it must still
  // carry the weapon's D — this rendered as a blank "weapon Damage" term with no
  // value, which is exactly the kind of hole this ledger exists to close.
  assert.deepEqual(d.terms, [
    { label: "wounds", value: 0 },
    { label: "weapon Damage", value: 3 },   // Sword D3, dealt nothing
  ]);
  assert.match(d.out, /0 SP/);
});

test("ledger — a volley that lands no hits still emits a wound step", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [1, 1], wounds: [10, 10], location: 1 } },
    () => 0, ctx);
  const bd = ctx.resolutions.find((r) => r.kind === "attack").breakdown;
  const w = bd.steps.find((s) => s.kind === "wound");
  assert.ok(w, "the chain must show where it stopped");
  assert.match(w.out, /no hits/i);
});

test("ledger — the damage step multiplies wounds by the weapon's D", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Wrecking Ball" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6], wounds: [10], location: 1 } },
    () => 0, ctx);
  const d = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[3];
  assert.ok(d.terms.some((t) => t.label === "weapon Damage" && t.value === 5));
  // 6, not 5: makeRig fits the melee slot with Haymaker (+3 Penetration), so this ball
  // swings at effPen 13 into a T5 hull — 4 STR past the floor, which Overmatch
  // now converts to +1 D. Haymaker was one of the upgrades the sweep measured at
  // +0.00; this total moving is that fix landing, not D changing.
  assert.match(d.out, /6 SP/);
});

test("ledger — the location step carries the d12 that picked the part", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6], wounds: [10], location: 5 } },
    () => 0, ctx);
  const loc = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[1];
  assert.equal(loc.die, 5);        // d12 5 -> arms
  assert.equal(loc.out, "arms");
});

test("ledger — arc and defender modifiers each earn a named wound term", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  target.preparation = { type: "brace" };
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  // Rear arc: Brace only bites on the front, so the rear bonus lands clean.
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "rear", dice: { toHit: [6], wounds: [9], location: 1 } },
    () => 0, ctx);
  const w = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[2];
  assert.ok(w.terms.some((t) => t.label === "weapon Penetration" && t.value === 5));
  assert.ok(w.terms.some((t) => t.label === "rear arc" && t.value === 3));
  assert.equal(w.pen, 8);          // 5 + 3
  assert.equal(w.target, 3);       // 6 + 5 - 8
});

// Reconciliation — the ledger must be the engine's own arithmetic, not a
// parallel re-derivation of it. Each step's terms must ADD UP to the number
// the step reports, using the same composition rule the engine used. If
// anyone ever recomputes a step for display, these fail.

test("ledger — the hit step's terms reconcile to its target number", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "longRange", arc: "front", distance: 12, cover: 2, aimed: true, aimedLoc: "hull",
      dice: { toHit: [6, 6, 6, 6], wounds: [10, 10, 10, 10] } },
    () => 0, ctx);
  const hit = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[0];
  // aimBreakdown reads in Accuracy space: value = base - (sum of every other term).
  const [base, ...mods] = hit.terms;
  assert.equal(base.label, "base aim");
  assert.equal(base.value - mods.reduce((s, t) => s + t.value, 0), hit.target);
  assert.equal(hit.target, computeModifiedAim(attacker, WEAPONS.longRange.Autocannon,
    { distance: 12, cover: 2, aimed: true }));
});

test("ledger — the wound step's terms reconcile to its effective Penetration", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "side", dice: { toHit: [6], wounds: [9], location: 1 } },
    () => 0, ctx);
  const w = ctx.resolutions.find((r) => r.kind === "attack").breakdown.steps[2];
  assert.equal(w.terms.reduce((s, t) => s + t.value, 0), w.pen);
  assert.equal(w.target, woundTarget(w.pen, w.toughness));
});

test("ledger — the damage step's terms reconcile to the SP dealt", () => {
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Autocannon", melee: "Sword" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  // Sword ROF 2, both hit, both wound: 2 wounds x D3 = 6 SP.
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", dice: { toHit: [6, 6], wounds: [10, 10], location: 1 } },
    () => 0, ctx);
  const bd = ctx.resolutions.find((r) => r.kind === "attack").breakdown;
  const d = bd.steps[3];
  const wounds = d.terms.find((t) => t.label === "wounds").value;
  const perWound = d.terms.filter((t) => t.label !== "wounds").reduce((s, t) => s + t.value, 0);
  assert.equal(wounds, 2);
  assert.equal(wounds * perWound, bd.sp);
  assert.equal(bd.sp, 6);
});

// ---------------------------------------------------------------------------
// No dead zones — the reason the combat model was rewritten.
//
// The impact-total model had 69 combos that could NEVER deal damage at any
// roll: its total capped at `6 + Penetration + arc`, and melee had no arc ladder, so a
// light Circular Saw (effective Penetration 4) topped out at 10 against a medium hull
// needing 11. The wound roll replaces it: d10 >= `clamp(6 + T - S, 2, 10)`.
//
// NOTE ON HOW THESE TESTS ARE BUILT. The obvious test — sweep the matrix and
// assert `woundTarget(...) > 10` never happens — is VACUOUS. woundTarget ends
// in `Math.min(WOUND_DIE, ...)`, so its output cannot exceed 10 by
// construction; the assertion is unreachable and would hold even if every stat
// in the game were retuned to nonsense. A test that cannot fail is worse than
// no test: it advertises a guarantee it never checks.
//
// So the guarantee is pinned as a PAIR:
//   1. the probability floor, off the clamped TN — the player-facing promise;
//   2. the RAW, unclamped `6 + T - S` gap stays in a sane band — the mechanism.
// (2) is the one with teeth. It is what fails if a stat retune drives a real
// matchup so far past the die that the clamp stops being a floor and starts
// being a crutch that hides a balance bug.
// ---------------------------------------------------------------------------

// The arc a weapon is WORST off attacking from, counting only arcs it may
// legally use. Read off the real arcBonus ladder rather than hardcoded, so a
// change to the ladder reaches these tests. Raking Fire returns null on the
// front (auto-fail), so its worst usable arc is the side — a subtlety that
// matters: assuming a flat front +0 for every weapon wrongly paints machine
// guns as the harshest matchup in the game when they cannot use that arc.
function worstUsableArc(profile) {
  const usable = ["front", "side", "rear"]
    .map((arc) => arcBonus(profile, arc))
    .filter((b) => b !== null);
  return Math.min(...usable);
}

// Every weapon (base profile, no upgrades) x attacker class x target class x
// location, at the worst arc it can legally use — the true floor of the game.
function woundMatrix() {
  const all = { ...WEAPONS.longRange, ...WEAPONS.melee, ...UNIT_WEAPONS };
  // Derived, never hardcoded: this list read ["light","medium","heavy","colossal"]
  // and kept asserting over two classes that makeRig had always rejected. Reading
  // the map means the matrix cannot drift from the game again.
  const classes = Object.keys(WEIGHT_PEN_MOD);
  const rows = [];
  for (const [name, w] of Object.entries(all)) {
    const arc = worstUsableArc(w);
    for (const aw of classes) {
      // flatPick weapons (Tank/Walker mounts) do not take the weight-class mod.
      const pen = w.pen + (w.flatPick ? 0 : WEIGHT_PEN_MOD[aw]) + arc;
      for (const tw of classes) {
        for (const loc of partNamesOf("rig")) {
          const t = toughnessOf("rig", loc, tw);
          rows.push({
            label: `${name}/${aw} vs ${tw}/${loc} (arc +${arc})`,
            raw: 6 + t - pen,          // unclamped TN the design intends
            tn: woundTarget(pen, t),   // clamped TN the game actually rolls
          });
        }
      }
    }
  }
  return rows;
}

test("no dead zones — every weapon can wound every location of every class", () => {
  // The player-facing guarantee: no matchup is mathematically hopeless. Stated
  // as a probability so the failure message is in the units a player cares
  // about. Backed by the clamp, so it is guarded by the raw-gap test below —
  // read the two together.
  const hopeless = woundMatrix()
    .map((r) => ({ ...r, chance: (WOUND_DIE - r.tn + 1) / WOUND_DIE }))
    .filter((r) => !(r.chance >= 1 / WOUND_DIE))
    .map((r) => `${r.label}: TN ${r.tn} = ${r.chance * 100}%`);
  assert.deepEqual(hopeless, []);
});

test("no dead zones — the clamp is a floor, not a crutch: raw TN stays in band", () => {
  // The test with teeth. `6 + T - S` unclamped, for every real matchup. The
  // clamp guarantees a natural 10 always wounds no matter how bad this gets,
  // which is exactly why it must be checked separately: if a retune pushed the
  // worst raw TN to, say, 15, the suite above would still pass while the clamp
  // quietly papered over a 5-point hole. One point past the die is a floor;
  // several points past it is a balance bug wearing the clamp as a disguise.
  const worst = woundMatrix().sort((a, b) => b.raw - a.raw)[0];
  assert.equal(worst.raw, 9, `worst raw TN moved: ${worst.label}`);
  assert.ok(worst.raw <= WOUND_DIE + 1, `raw TN ${worst.raw} leans on the clamp`);
});

test("no dead zones — nothing needs the clamp's upper rail any more", () => {
  // This test used to assert the opposite, and the flip is the interesting part.
  //
  // Exactly one matchup in the game was hopeless unclamped — Rivet Gun/light vs
  // a COLOSSAL hull, raw TN 11, unrollable on a d10. Deleting Heavy and Colossal
  // (2026-07-16) deleted that matchup. The worst raw TN is now 9, inside the die,
  // so `a natural 10 always wounds` is currently a guarantee about nothing: no
  // matchup is hopeless even with the clamp switched off.
  //
  // That is a STRONGER guarantee than the one this test used to make, so it is
  // asserted as such rather than deleted. Do NOT read it as "the clamp is dead" —
  // its other rail (TN floored at 2, the saturation ceiling) is very much live and
  // is what the penetration rework exists to address. Only the upper rail is idle.
  //
  // If this ever fails, someone has added a weapon or raised a toughness far
  // enough to reintroduce a hopeless matchup. That is a real design decision and
  // it should have to edit this test to land.
  const reliant = woundMatrix().filter((r) => r.raw > WOUND_DIE);
  assert.deepEqual(reliant.map((r) => r.label), []);

  // The worst matchup left, pinned so the margin is visible rather than implied.
  const pen = WEAPONS.longRange["Rivet Gun"].pen + WEIGHT_PEN_MOD.light; // 3 - 1 = 2
  const t = toughnessOf("rig", "hull", "medium");                        // 5
  assert.equal(6 + t - pen, 9);               // unclamped: a 9 or 10 lands it
  assert.equal(woundTarget(pen, t), 9);       // clamped: unchanged, the rail is idle
});

test("no dead zones — the light saw vs a medium hull, the case that started this", () => {
  // The combo that proved the impact-total model broken: it could never deal
  // damage at any roll. TN 7 sits clear of both clamp rails, so this exercises
  // the arithmetic rather than passing on a clamped edge.
  const w = WEAPONS.melee["Circular Saw"];
  const pen = w.pen + WEIGHT_PEN_MOD.light;          // 5 - 1 = 4
  const t = toughnessOf("rig", "hull", "medium");    // 5
  assert.equal(woundTarget(pen, t), 7);              // 40%, front arc, no upgrades
});

// The hit-location table is the TARGET's, not the attacker's. Regression: reading
// attacker.kind sent a Rig's arms/legs roll into a Tank/Walker part list and threw
// in toughnessOf, so every cross-kind shot crashed on a landed hit.
test("hit location comes from the target's kind, not the attacker's", () => {
  const rig = makeRig(1, "Warden", "medium", "a", { longRange: "Autocannon", melee: "Claw" });
  const tank = makeUnit("tank", 2, "Strawman", "b", { unit: "Tank Cannon" });
  const walker = makeUnit("walker", 3, "Strider", "b", { unit: "Rocket Pod" });
  const room = { game: { round: 1 } };
  const shot = (attacker, target, locDie) => {
    const a = structuredClone(attacker);
    return resolveAttack(room, a, structuredClone(target), {
      weapon: "longRange", arc: "side", distance: 12,
      dice: { toHit: [6, 6, 6, 6], location: locDie },
    }, () => 0.5, makeCtx());
  };
  // d12 5-7 is "arms" on the rig table; a Tank has a turret and a Walker a mount.
  assert.equal(shot(rig, tank, 6).location, "tracks");
  assert.equal(shot(rig, tank, 9).location, "turret");
  assert.equal(shot(rig, walker, 9).location, "mount");
  // ...and the tank's own table must not follow it onto a rig target.
  assert.equal(shot(tank, rig, 6).location, "arms");
  assert.equal(shot(walker, rig, 9).location, "legs");
});

test("ledger — Overmatch is named in the damage step when it fires", () => {
  // A crushing hit rendering "weapon Damage 5" with an unexplained +2 in the total is
  // exactly the readability failure this ledger exists to close.
  // Wrecking Ball Penetration 10 + Haymaker 3 + rear arc 3 = effPen 16 vs medium arms
  // T4 → 8 Penetration past the TN-2 floor → +2 D. Haymaker is pinned rather than left
  // to the default-upgrade rule: reordering WEAPON_UPGRADES would otherwise drop
  // effPen to 13 and fail a RENDERING test for a reason unrelated to rendering.
  // The rate and cap behind that 2 are rules.test.js's (strOvermatchD's) to pin;
  // what this asserts is that the rider reaches the ledger under its own name.
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Double MG", melee: "Wrecking Ball", meleeUpgrade: "haymaker" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "rear", range: "near", cover: 0,
      dice: { toHit: [6], location: 5, wounds: [10] } }, // location 5 → arms
    () => 0, ctx);
  const dmg = ctx.resolutions.find((r) => r.kind === "attack")
    .breakdown.steps.find((s) => s.kind === "damage");
  assert.deepEqual(dmg.terms, [
    { label: "wounds", value: 1 },
    { label: "weapon Damage", value: 5 },
    { label: "Overmatch", value: 2 },
  ]);
});

test("ledger — Overmatch is absent when it did not fire", () => {
  // A term worth 0 must push nothing — same rule as penBreakdown. With ~15
  // possible contributions, rendering the dead ones buries the live ones.
  // Sword is Penetration 5 and Duelist's Balance grants Precision, not Penetration, so a
  // front-arc swing reaches effPen 5 — nowhere near medium arms' T4 floor (8).
  // Asserted with deepEqual, not a `some(...)` absence check: the step now
  // pushes conditionally from three riders, so an accidental EXTRA term is a
  // live risk and only the full-array form catches it.
  const attacker = makeRig(1, "A", "medium", "a", { longRange: "Double MG", melee: "Sword", meleeUpgrade: "duelist-balance" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const room = { rigs: [attacker, target], game: { round: 1 } };
  const ctx = makeCtx();
  resolveAttack(room, attacker, target,
    { weapon: "melee", arc: "front", range: "near", cover: 0,
      dice: { toHit: [6], location: 5, wounds: [10] } },
    () => 0, ctx);
  const dmg = ctx.resolutions.find((r) => r.kind === "attack")
    .breakdown.steps.find((s) => s.kind === "damage");
  assert.deepEqual(dmg.terms, [
    { label: "wounds", value: 1 },
    { label: "weapon Damage", value: 3 },
  ]);
});

test("ledger — riders survive a volley whose first wound die missed", () => {
  // Riders are assigned only inside `if (wounded)`, so impacts[0] carries them as
  // 0 when the first die misses. Reading it blind renders `wounds 2, weapon Damage 2`
  // against an out of 8 SP — terms reconciling to 4. The `find` is what prevents it.
  // Chainsaw (ROF 3, Penetration 7, D2) + Ripper Teeth (Rend) + rear arc 3 = effPen 10 vs
  // a medium engine's T3 → wound TN 2, so only a natural 1 misses, and 3 past the
  // floor → Overmatch 1. Each landed wound deals 2 + 1 + 1 = 4.
  const attacker = makeRig(1, "A", "medium", "a",
    { longRange: "Double MG", melee: "Chainsaw", meleeUpgrade: "ripper-teeth" });
  const target = makeRig(2, "B", "medium", "b", { longRange: "Autocannon", melee: "Claw" });
  const ctx = makeCtx();
  resolveAttack({ rigs: [attacker, target], game: { round: 1 } }, attacker, target,
    { weapon: "melee", arc: "rear", range: "near", cover: 0,
      dice: { toHit: [6, 6, 6], location: 12, wounds: [1, 10, 10] } }, // die 1 misses; engine T3
    () => 0, ctx);
  const d = ctx.resolutions.find((r) => r.kind === "attack")
    .breakdown.steps.find((s) => s.kind === "damage");
  assert.deepEqual(d.terms, [
    { label: "wounds", value: 2 }, { label: "weapon Damage", value: 2 },
    { label: "Rend", value: 1 }, { label: "Overmatch", value: 1 },
  ]);
  // The invariant the `find` actually protects: a multi-rider volley's terms must
  // still reconcile to the SP it reports (2 wounds x (2+1+1) = 8), which is the
  // same failure Overmatch was named to close.
  const perWound = d.terms.slice(1).reduce((n, t) => n + t.value, 0);
  assert.equal(d.out, `${d.terms[0].value * perWound} SP → engine`);
});
