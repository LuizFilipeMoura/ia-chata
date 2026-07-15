import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, HEAT_THRESHOLDS, heatThreshold } from "./rules.js";
import { AIM, WEIGHT_PEN_MOD, HEAT_CAPACITY, hitLocation, woundTarget, strOvermatchD } from "./rules.js";
import { WEAPONS, SUPPORTED_RIG_CLASSES } from "./game-state.js";

test("ACTIONS carry the rulebook heat and slot costs (§5)", () => {
  assert.equal(ACTIONS.move.heat, 1);
  assert.equal(ACTIONS.sprint.heat, 2);
  assert.equal(ACTIONS.fire.heat, 1);
  assert.equal(ACTIONS.aimed.heat, 1);
  assert.equal(ACTIONS.ram, undefined); // ram removed — melee covers close combat
  assert.equal(ACTIONS.prepare.heat, 1);
  assert.equal(ACTIONS.reload.heat, 1);
  assert.equal(ACTIONS.repair.heat, 1);
  assert.equal(ACTIONS.shutdown.heat, 0);
  assert.equal(ACTIONS.shutdown.slot, 0);
  assert.equal(ACTIONS.move.slot, 1);
  assert.equal(ACTIONS.reload.slot, 1);
});

test("support module actions are registered, cold (0 heat), 1 slot each", () => {
  for (const key of ["fieldweld", "vent", "paint"]) {
    assert.ok(ACTIONS[key], `${key} registered`);
    assert.equal(ACTIONS[key].heat, 0);
    assert.equal(ACTIONS[key].slot, 1);
  }
});

test("heatThreshold maps a D12+bonus total to the right band (§6)", () => {
  assert.equal(heatThreshold(1).key, "safe");
  assert.equal(heatThreshold(5).key, "safe");
  assert.equal(heatThreshold(6).key, "stall");
  assert.equal(heatThreshold(7).key, "stall");
  assert.equal(heatThreshold(8).key, "detonation");
  assert.equal(heatThreshold(9).key, "detonation");
  assert.equal(heatThreshold(10).key, "blowout");
  assert.equal(heatThreshold(11).key, "blowout");
  assert.equal(heatThreshold(12).key, "buckling");
  assert.equal(heatThreshold(13).key, "buckling");
  assert.equal(heatThreshold(14).key, "engine-failure");
  assert.equal(heatThreshold(16).key, "engine-failure");
  assert.equal(heatThreshold(17).key, "catastrophic");
  assert.equal(heatThreshold(99).key, "catastrophic");
  assert.equal(HEAT_THRESHOLDS.length, 7);
});

test("hitLocation maps the D12 bands (§7)", () => {
  assert.equal(hitLocation("rig", 1), "hull");
  assert.equal(hitLocation("rig", 4), "hull");
  assert.equal(hitLocation("rig", 5), "arms");
  assert.equal(hitLocation("rig", 7), "arms");
  assert.equal(hitLocation("rig", 8), "legs");
  assert.equal(hitLocation("rig", 10), "legs");
  assert.equal(hitLocation("rig", 11), "engine");
  assert.equal(hitLocation("rig", 12), "engine");
});

test("weight-class and aim scalars are correct (§2)", () => {
  assert.equal(WEIGHT_PEN_MOD.light, -1);
  assert.equal(WEIGHT_PEN_MOD.medium, 0);
  assert.equal(AIM.light, 4);
  assert.equal(AIM.medium, 4);
});

test("the weight-class maps carry exactly the buildable classes", () => {
  // Heavy and Colossal were deleted 2026-07-16. makeRig had always rejected them
  // (SUPPORTED_RIG_CLASSES), so every heavy/colossal branch in these maps existed
  // only to be read as if it were real — and it was, twice, by a spec author and
  // its reviewer during the penetration rework.
  for (const [name, map] of Object.entries({ WEIGHT_PEN_MOD, AIM, HEAT_CAPACITY })) {
    assert.deepEqual(Object.keys(map), [...SUPPORTED_RIG_CLASSES], `${name} drifted from SUPPORTED_RIG_CLASSES`);
  }
});

test("woundTarget — TN is 6 + T - S", () => {
  assert.equal(woundTarget(5, 5), 6);  // even match
  assert.equal(woundTarget(7, 5), 4);  // stronger
  assert.equal(woundTarget(3, 5), 8);  // weaker
});

test("woundTarget — clamps to 2..10 so no matchup is ever hopeless", () => {
  // A natural 10 must ALWAYS wound. This is the guarantee that kills the
  // 69 dead zones of the impact-total model; do not relax it.
  assert.equal(woundTarget(1, 20), 10);
  // A natural 1 must NEVER wound.
  assert.equal(woundTarget(20, 1), 2);

  // The clamp must engage on real inputs, not just absurd ones. NOTE: T7 was a
  // colossal hull, and Heavy/Colossal were deleted 2026-07-16 — so this is now a
  // unit test of woundTarget's arithmetic, not an in-domain matchup. No rig board
  // reaches T7 any more; see combat.test.js's "nothing needs the clamp's upper
  // rail any more", which pins that the whole game's worst raw TN is 9.
  assert.equal(woundTarget(2, 7), 10);   // raw 11, clamped
  // These two pin 10 and 2 as legitimate target numbers in their own right,
  // not merely artifacts of the clamp.
  assert.equal(woundTarget(1, 5), 10);   // raw 10, NOT clamped
  assert.equal(woundTarget(5, 1), 2);    // raw 2,  NOT clamped
});

test("woundTarget — the original bug case is possible, not impossible", () => {
  // The light Circular Saw vs a medium hull is the matchup that motivated this
  // rewrite: under the impact-total model it was mathematically 0 damage at any
  // roll. Derived from the live stats, not hardcoded, so a future retune of the
  // Saw or the weight ladder cannot silently send it back to hopeless.
  const pen = WEAPONS.melee["Circular Saw"].pen + WEIGHT_PEN_MOD.light;
  assert.equal(woundTarget(pen, 5), 7); // medium hull T5 => 40%
});

test("woundTarget — junk Penetration coerces (fails safe), junk T throws (fails loud)", () => {
  // The asymmetry is the point. A junk Penetration floors to 0 and drives the TN toward
  // 10 — a 10% wound, the safe direction. A junk T would coerce to 0 and drive
  // the TN to 2 — a 90% wound, making the location the softest thing on the
  // table. That is the mathematically-wrong matchup this whole rewrite exists
  // to eliminate, so T must never be guessed at.
  assert.equal(woundTarget(undefined, 5), 10);

  // Every one of these must throw. The five falsy non-numbers are the sharp
  // ones: Number(null), Number(""), Number(false) and Number([]) are all 0, so
  // a guard that coerces before checking (`Number.isFinite(Number(t))`) lets
  // them through to TN 2 and reintroduces the bug. `null` matters most — it is
  // what a failed toughnessOf lookup used to return.
  for (const junk of [undefined, null, "", " ", false, [], {}, NaN, Infinity, "soft", "5"]) {
    assert.throws(
      () => woundTarget(5, junk),
      /toughness must be a number/,
      `woundTarget(5, ${JSON.stringify(junk) ?? String(junk)}) must throw, not guess`,
    );
  }
});

test("strOvermatchD — STR that only just reaches the TN-2 floor wastes nothing", () => {
  // The floor is reached at pen = T + 4 (raw 6+T-pen == 2). Reaching it is not
  // waste: that point bought the last 10% of wound chance. Only points PAST it
  // are discarded by the clamp, and only those convert.
  assert.equal(strOvermatchD(8, 4), 0);   // raw 2 — exactly the floor
  assert.equal(strOvermatchD(9, 4), 0);   // raw 1 — 1 wasted, under the 3-point rate
  assert.equal(strOvermatchD(10, 4), 0);  // raw 0 — 2 wasted, still under
});

test("strOvermatchD — converts at +1 D per 3 wasted points", () => {
  assert.equal(strOvermatchD(11, 4), 1);  // 3 wasted
  assert.equal(strOvermatchD(13, 4), 1);  // 5 wasted — floors, no partial credit
  assert.equal(strOvermatchD(14, 4), 2);  // 6 wasted
});

test("strOvermatchD — caps at +2 D", () => {
  // Uncapped, a rear-arc Siege Maul (effPen 16) into an engine (T3) would add
  // +3 to a D5 weapon = D8 against an engine SP pool of 8-11: a one-shot kill,
  // which would make the engine the only rational aim point (see unit-kinds.js:11).
  assert.equal(strOvermatchD(17, 4), 2);  // 9 wasted → 3, capped
  assert.equal(strOvermatchD(30, 3), 2);  // absurd STR still capped
});

test("strOvermatchD — weak weapons never overmatch", () => {
  // Rivet Gun STR 3 against every rig toughness in the game.
  for (const t of [3, 4, 5]) assert.equal(strOvermatchD(3, t), 0);
});

test("strOvermatchD — junk T throws, exactly as woundTarget does", () => {
  // The asymmetry INVERTS relative to woundTarget, which is why it's pinned:
  // there a junk STR fails toward TN 10 (10%), here it fails toward zero
  // Overmatch — both the safe direction, but for opposite-looking reasons.
  assert.equal(strOvermatchD(undefined, 5), 0);  // junk STR floors to 0 → no Overmatch

  // Same guard, same reason, opposite direction of the same hazard: a null T
  // coercing to 0 reads as MAXIMUM Overmatch here. It must never be guessed at.
  for (const junk of [undefined, null, "", false, [], {}, NaN, Infinity, "5"]) {
    assert.throws(
      () => strOvermatchD(10, junk),
      /toughness must be a number/,
      `strOvermatchD(10, ${JSON.stringify(junk) ?? String(junk)}) must throw, not guess`,
    );
  }
});

test("strOvermatchD — the design's worked examples", () => {
  assert.equal(strOvermatchD(10, 4), 0);  // Wrecking Ball, front arc, arms
  assert.equal(strOvermatchD(13, 4), 1);  // Wrecking Ball, rear arc (+3), arms
  assert.equal(strOvermatchD(16, 3), 2);  // Siege Maul + Reinforced Head, rear, engine (capped from 3)
  assert.equal(strOvermatchD(7, 5), 0);   // Autocannon, front, hull — never overmatches
});
