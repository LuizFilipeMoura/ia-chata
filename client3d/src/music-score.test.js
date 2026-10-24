import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, STYLES, TRACKS, styleFor, radioTuning, rng } from "./music-score.js";

const melodic = (e) => e.inst === "lead" || e.inst === "melody";

test("a seed always writes the same song; another seed writes another", () => {
  for (const s of Object.keys(STYLES)) {
    assert.deepEqual(compose(11, s), compose(11, s));
    assert.notDeepEqual(compose(11, s).events, compose(12, s).events, s);
  }
});

test("every style writes a playable 32-bar song", () => {
  for (const s of Object.keys(STYLES)) for (let seed = 1; seed < 20; seed++) {
    const song = compose(seed, s);
    assert.equal(song.bars, 32);
    assert.ok(song.events.length > 32, `${s} is nearly silent`);
    assert.ok(song.events.some(melodic), `${s} has no tune`);
    let prev = -1;
    for (const e of song.events) {
      assert.ok(e.beat >= prev, "events are sorted");
      prev = e.beat;
      assert.ok(e.beat >= 0 && e.beat < song.lengthBeats, `${s}: note outside the song`);
      assert.ok(e.dur > 0 && Number.isFinite(e.dur));
      assert.ok(e.vel > 0 && e.vel <= 1);
      if (e.midi) assert.ok(e.midi >= 20 && e.midi <= 100, `${s}: midi ${e.midi}`);
    }
  }
});

test("the tune only sings chord tones or notes of the key", () => {
  for (const s of Object.keys(STYLES)) for (let seed = 1; seed < 15; seed++) {
    const song = compose(seed, s);
    for (const e of song.events.filter(melodic)) {
      const bar = Math.floor(e.beat / song.meter), pc = e.midi % 12;
      const chord = song.chords[bar].tones.map((t) => t % 12);
      assert.ok(song.scale.includes(pc) || chord.includes(pc), `${s} seed ${seed}: stray note ${e.midi} in bar ${bar}`);
    }
  }
});

test("AABA: the second A sings the first A's tune again", () => {
  const song = compose(5, "foxtrot"), m = song.meter;
  const inBars = (a, b) => song.events.filter((e) => melodic(e) && e.beat >= a * m && e.beat < b * m);
  const a1 = inBars(0, 8).map((e) => [+e.beat.toFixed(6), e.midi]);
  const a2 = inBars(8, 16).map((e) => [+(e.beat - 8 * m).toFixed(6), e.midi]);
  assert.deepEqual(a2, a1);
});

test("a waltz is in three, a foxtrot in four", () => {
  assert.equal(compose(3, "waltz").meter, 3);
  assert.equal(compose(3, "foxtrot").meter, 4);
});

test("each track picks from its own styles", () => {
  for (const [track, list] of Object.entries(TRACKS)) for (let s = 0; s < 30; s++) assert.ok(list.includes(styleFor(track, s)));
  assert.ok(TRACKS.menu.includes(styleFor("nonsense", 1)));
});

test("a hot boiler knocks the radio off the station", () => {
  const cold = radioTuning(0), warm = radioTuning(0.7), hot = radioTuning(1.2);
  assert.equal(cold.static, 0);
  assert.ok(warm.static > cold.static && hot.static > warm.static);
  assert.ok(Math.abs(hot.detune) > Math.abs(warm.detune));
  assert.ok(hot.clean < cold.clean);
  for (const v of [NaN, -3, 99]) for (const x of Object.values(radioTuning(v))) assert.ok(Number.isFinite(x));
});

test("rng is deterministic and in [0, 1)", () => {
  const a = rng(9), b = rng(9);
  for (let i = 0; i < 50; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});
