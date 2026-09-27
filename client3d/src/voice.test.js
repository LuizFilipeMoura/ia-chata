import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, notes, M, F, ROBOT } from "./voice.js";

const still = () => 0.5; // no random jitter

test("a longer line talks longer and has more syllables", () => {
  const short = plan("Copy.", 0.1, still), long = plan("That's the good fuel tank, you animal!", 0.1, still);
  assert.ok(long.total > short.total);
  assert.ok(long.ev.length > short.ev.length);
});

test("punctuation is breath: a comma adds time", () => {
  assert.ok(plan("Go, go", 0.1, still).total > plan("Go go", 0.1, still).total);
});

test("slower syllables make a longer line", () => {
  assert.ok(plan("Burn, baby.", 0.12, still).total > plan("Burn, baby.", 0.09, still).total);
});

test("a question rises at the end, a statement does not", () => {
  assert.equal(plan("Where'd they go?", 0.1, still).ev.at(-1).rise, true);
  assert.ok(!plan("They went home.", 0.1, still).ev.at(-1).rise);
});

test("lines with no words still give a short, finite plan", () => {
  for (const l of ["…", "", "*chirp*", "TARGET STRUCK."]) {
    const p = plan(l, 0.1, still);
    assert.ok(Number.isFinite(p.total) && p.total > 0, l);
  }
});

test("syllable pitch steps are clamped to the voice's spread", () => {
  const line = "Kneel, little machines. Your pilots will be spared if you run now.";
  for (const spread of [0, 0.2, 1.5]) {
    const ns = notes(line, M({ spread }), still);
    ns.forEach((n, i) => {
      assert.ok(Math.abs(n.semis) <= spread + 1e-9);
      if (i) assert.ok(Math.abs(n.semis - ns[i - 1].semis) <= spread + 1e-9);
    });
  }
});

test("female voices sit above male ones on every syllable", () => {
  const line = "Hang on, I'll light them up.";
  const m = notes(line, M(), still), f = notes(line, F(), still);
  m.forEach((n, i) => assert.ok(f[i].freq > n.freq));
});

test("every note is playable", () => {
  for (const v of [M(), F(), ROBOT]) {
    for (const n of notes("Pods are leaking fuel, uh oh.", v)) {
      assert.ok(n.freq > 0 && n.dur > 0 && n.t >= 0 && n.level > 0);
    }
  }
});
