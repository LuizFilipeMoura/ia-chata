import { test } from "node:test";
import assert from "node:assert/strict";
import { CHASSIS, WEAPONS, UNIT_WEAPONS } from "../../shared/game-state.js";
import { TAKES, pickTake, WEAPON_SFX, KIND_SFX, CORE, FOOT_PROFILES, stepRecipe, servoRecipe } from "./audio-recipes.js";

// A fake synth kit that records every voice a recipe asks for.
function record(recipe, k, ...args) {
  const calls = [];
  const P = {
    noise: (t, dur, o = {}) => calls.push(["n", t, dur, o]),
    tone: (t, dur, o = {}) => calls.push(["t", t, dur, o]),
    jit: (v) => v,
    rand: () => 0.5,
  };
  recipe(P, 0, k, ...args);
  return calls;
}

// Every recipe, labelled, as (k) => calls.
const all = [
  ...Object.entries(WEAPON_SFX).map(([n, r]) => [n, (k) => record(r, k)]),
  ...Object.entries(KIND_SFX).map(([n, r]) => [`kind:${n}`, (k) => record(r, k)]),
  ...Object.entries(CORE).map(([n, r]) => [n, (k) => record(r, k)]),
  ["hit sp4", (k) => record(CORE.hit, k, 4)],
  ["explosion big", (k) => record(CORE.explosion, k, true)],
  ...Object.entries(FOOT_PROFILES).flatMap(([id, f]) => [[`step ${id}`, (k) => record(stepRecipe, k, f)], [`servo ${id}`, (k) => record(servoRecipe, k, f)]]),
];

test("there are six takes", () => assert.equal(TAKES.length, 6));

test("every rig and support weapon has its own voice", () => {
  const names = [...Object.keys(WEAPONS.longRange), ...Object.keys(WEAPONS.melee), ...Object.keys(UNIT_WEAPONS), ...CHASSIS.flatMap((c) => [c.longRange, c.melee])];
  for (const n of names) assert.ok(WEAPON_SFX[n], `no sound for ${n}`);
});

test("every chassis has its own footsteps", () => {
  for (const c of CHASSIS) assert.ok(FOOT_PROFILES[c.id], `no feet for ${c.id}`);
});

test("every take of every sound plays something with sane synth params", () => {
  for (const [name, run] of all) for (const k of TAKES) {
    const calls = run(k);
    assert.ok(calls.length > 0, `${name} is silent`);
    for (const [, t, dur, o] of calls) {
      for (const v of [t, dur, o.freq ?? 1, o.to ?? 1, o.sweepTo ?? 1, o.peak ?? 0.1]) assert.ok(Number.isFinite(v), `${name}: non-finite param`);
      assert.ok(t >= 0 && dur > 0, `${name}: bad timing`);
      for (const f of [o.freq, o.to, o.sweepTo]) if (f !== undefined) assert.ok(f > 0 && f < 20000, `${name}: freq ${f} out of range`);
      if (o.peak !== undefined) assert.ok(o.peak > 0 && o.peak <= 1, `${name}: peak ${o.peak}`);
    }
  }
});

test("the six takes of a sound are six different sounds", () => {
  for (const [name, run] of all) {
    const distinct = new Set(TAKES.map((k) => JSON.stringify(run(k))));
    assert.equal(distinct.size, TAKES.length, `${name} has duplicate takes`);
  }
});

test("a sound never plays the same take twice in a row, and uses them all", () => {
  let prev = pickTake("probe"), seen = new Set([prev]);
  for (let i = 0; i < 300; i++) {
    const n = pickTake("probe");
    assert.notEqual(n, prev);
    seen.add(n); prev = n;
  }
  assert.equal(seen.size, TAKES.length);
});
