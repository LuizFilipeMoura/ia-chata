import { test } from "node:test";
import assert from "node:assert/strict";
import { CHASSIS } from "../../shared/game-state.js";
import { THEMES } from "./scene/themes.js";
import { TAKES, CUES, BEDS, bedFor, idleFor, clockworkNotes } from "./audio-recipes.js";
import { CLOCKWORK } from "./voice.js";
import { barkFor, pilotOf } from "./game/barks.js";
import { LOGS, logFor, sentences } from "./game/logs.js";

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
function sane(name, calls) {
  assert.ok(calls.length > 0, `${name} is silent`);
  for (const [, t, dur, o] of calls) {
    for (const v of [t, dur, o.freq ?? 1, o.to ?? 1, o.sweepTo ?? 1, o.peak ?? 0.1]) assert.ok(Number.isFinite(v), `${name}: non-finite param`);
    assert.ok(t >= 0 && dur > 0, `${name}: bad timing`);
    for (const f of [o.freq, o.to, o.sweepTo]) if (f !== undefined) assert.ok(f > 0 && f < 20000, `${name}: freq ${f} out of range`);
    if (o.peak !== undefined) assert.ok(o.peak > 0 && o.peak <= 1, `${name}: peak ${o.peak}`);
  }
}

test("the cues other screens call all exist", () => {
  for (const n of ["engineStart", "whistle", "siren", "klaxon", "posterSlam", "stamp", "coin", "tapeHiss", "projector", "distantThud", "groan"]) assert.equal(typeof CUES[n], "function", n);
});

test("every take of every cue plays something sane, and the takes differ", () => {
  for (const [name, r] of Object.entries(CUES)) {
    for (const k of TAKES) sane(name, record(r, k));
    const distinct = new Set(TAKES.map((k) => JSON.stringify(record(r, k))));
    assert.equal(distinct.size, TAKES.length, `${name} has duplicate takes`);
  }
});

test("every ambient bed has a continuous layer and sane far-off events", () => {
  for (const [id, bed] of Object.entries(BEDS)) {
    assert.ok(bed.loops.length > 0, `${id} has no bed`);
    for (const l of bed.loops) assert.ok(l.gain > 0 && l.gain < 1, `${id}: loop gain`);
    for (const e of bed.events) {
      assert.ok(e.every[0] > 0 && e.every[1] >= e.every[0], `${id}: event cadence`);
      sane(id, record((P, t) => e.play(P, t), TAKES[0]));
    }
  }
});

test("every theme finds its own bed; new and unknown ids fall back sensibly", () => {
  for (const id of Object.keys(THEMES)) assert.ok(BEDS[bedFor(THEMES[id].ambience || id)], id);
  for (const id of ["foundry", "refinery", "railyard", "skyport", "ashfields"]) assert.equal(bedFor(id), id);
  assert.equal(bedFor("rozalski-fields"), "rozalski");
  assert.equal(bedFor("karnaca-port"), "karnaca");
  assert.equal(bedFor("sunken-deco"), "sunken");
  assert.equal(bedFor("no-mans-land"), "nomansland");
  assert.equal(bedFor("skyport-docks"), "skyport");
  assert.ok(BEDS[bedFor("somewhere new")]);
  assert.ok(BEDS[bedFor(undefined)]);
});

test("a hotter engine idles faster, higher and rougher", () => {
  for (const c of CHASSIS) {
    const cold = idleFor(c.id, 0), hot = idleFor(c.id, 1.2);
    assert.ok(hot.f0 > cold.f0 && hot.rate > cold.rate && hot.rough > cold.rough, c.id);
    for (const v of [cold.f0, cold.rate, cold.rough, cold.lp]) assert.ok(Number.isFinite(v) && v > 0);
  }
  assert.ok(Number.isFinite(idleFor("tank", NaN).f0));
});

test("a clockwork ticks instead of talking; a longer line ticks longer", () => {
  const still = () => 0.5;
  const short = clockworkNotes("*tick*", still), long = clockworkNotes("*tick-tick-CLACK* whirr whirr whirr", still);
  assert.ok(long.total > short.total);
  assert.ok(short.ev.some((e) => e.kind === "tick"));
  assert.ok(clockworkNotes("*pfweet!*", still).ev.some((e) => e.kind === "whistle"));
  for (const e of long.ev) assert.ok(e.t >= 0 && e.freq > 0 && e.freq < 20000);
});

test("clockworks bark with the clockwork voice, pilots never do", () => {
  assert.equal(pilotOf({ kind: "drone" }).voice, CLOCKWORK);
  let b = null;
  for (let i = 0; i < 50 && !b; i++) b = barkFor({ kind: "drone", id: 1, owner: "a" }, "kill");
  assert.ok(b?.voice.clockwork);
  for (const c of CHASSIS) assert.ok(!pilotOf({ kind: "rig", longRange: c.longRange }).voice.clockwork, c.id);
});

// Diaries are optional flavour: a new chassis without one just shows no reel.
test("every audio diary is short, has a pilot voice and names a real chassis", () => {
  const oldNames = /\b(Blue|Green|Purple|Pumpkin|Zebra)\b/;
  for (const c of CHASSIS.filter((ch) => LOGS[ch.id])) {
    const log = logFor(c.id);
    const n = sentences(log.text).length;
    assert.ok(n >= 2 && n <= 5, `${c.id}: ${n} sentences`);
    assert.ok(log.pilot && log.voice && Number.isFinite(log.voice.f0), c.id);
    assert.ok(!oldNames.test(log.text + log.title), `${c.id} uses an old nickname`);
    assert.ok(!/[\u2013\u2014]/.test(log.text + log.title), `${c.id} has a dash`);
  }
  assert.equal(logFor("no-such-rig"), null);
  assert.ok(Object.keys(LOGS).every((id) => CHASSIS.some((c) => c.id === id)), "a log for a chassis that doesn't exist");
});

test("sentences split on stops and keep every word", () => {
  const s = sentences("One. Two, still two! Three?");
  assert.deepEqual(s, ["One.", "Two, still two!", "Three?"]);
});
