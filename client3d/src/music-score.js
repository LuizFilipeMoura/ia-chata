// The gramophone's sheet music: seeded 1930s/40s tunes (foxtrot, waltz, torch
// song, and a tense minor vamp for battle) as plain note events. Pure, so the
// songwriting runs in node; music.js plays the events on industrial timbres
// through a worn-record chain.
//
// A song is 32 bars in AABA form, one chord per bar. The A tune is written
// once and sung three times; the bridge gets its own. Every seed writes a
// different song, but always from the same period chord book.

// A small deterministic RNG (mulberry32).
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];

// Chord shapes, semitones above the chord root. The sixth and the diminished
// seventh are what make a tune sound like a dance band in 1936.
export const QUALITY = {
  maj: [0, 4, 7], maj6: [0, 4, 7, 9], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10],
  min: [0, 3, 7], min6: [0, 3, 7, 9], min7: [0, 3, 7, 10], dim7: [0, 3, 6, 9], hdim: [0, 3, 6, 10],
};
export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 11] };

// Roman numerals: [root above the key, quality].
const I = [0, "maj6"], vi = [9, "min7"], ii = [2, "min7"], V7 = [7, "dom7"], VI7 = [9, "dom7"], II7 = [2, "dom7"],
  IV = [5, "maj6"], iv6 = [5, "min6"], iii = [4, "min7"], sIdim = [1, "dim7"], III7 = [4, "dom7"];
const i = [0, "min6"], iv = [5, "min7"], bVI = [8, "maj7"], iio = [2, "hdim"], bII = [1, "maj"], bVII = [10, "dom7"], bIII = [3, "maj7"];

// meter: beats per bar. comp: how the band keeps time. leads: which timbres
// may carry the tune. rhythm: note lengths (beats) the tune is written in.
export const STYLES = {
  foxtrot: {
    meter: 4, bpm: [104, 124], mode: "major", keys: [53, 55, 56, 58, 60], swing: 0.16, comp: "stride", leads: ["pluck", "lead"], rhythm: [0.5, 0.5, 1, 1, 1, 1.5, 2], rest: 0.12,
    A: [[I, I, VI7, VI7, II7, II7, V7, V7], [I, vi, ii, V7, I, vi, ii, V7], [I, sIdim, ii, V7, iii, VI7, ii, V7], [I, IV, iv6, I, VI7, II7, V7, I]],
    B: [[III7, III7, VI7, VI7, II7, II7, V7, V7], [IV, IV, I, I, II7, II7, V7, V7]],
  },
  waltz: {
    meter: 3, bpm: [126, 150], mode: "major", keys: [53, 55, 57, 58], swing: 0, comp: "waltz", leads: ["lead", "pluck"], rhythm: [1, 1, 1, 2, 3], rest: 0.08,
    A: [[I, I, IV, IV, V7, V7, I, I], [I, vi, ii, V7, I, vi, ii, V7], [I, I, ii, V7, V7, V7, I, I]],
    B: [[vi, vi, II7, II7, V7, V7, I, V7], [IV, iv6, I, VI7, II7, V7, I, I]],
  },
  torch: {
    meter: 4, bpm: [66, 78], mode: "minor", keys: [50, 52, 53, 55], swing: 0.1, comp: "torch", leads: ["lead"], rhythm: [1, 1, 1.5, 2, 2, 3], rest: 0.15,
    A: [[i, i, iv, iv, V7, V7, i, i], [i, bVI, iio, V7, i, bVI, iio, V7], [i, iv, bVII, bIII, bVI, iio, V7, i]],
    B: [[iv, iv, i, i, bVI, bVI, V7, V7], [bIII, bIII, bVI, bVI, iio, iio, V7, V7]],
  },
  // Battle: slower, lower, darker; an ostinato under a sparse bowed line.
  tense: {
    meter: 4, bpm: [72, 84], mode: "minor", keys: [45, 47, 48, 50], swing: 0, comp: "ostinato", leads: ["lead"], rhythm: [1, 2, 2, 3, 4], rest: 0.3,
    A: [[i, i, bII, bII, i, i, V7, V7], [i, bVI, iv, V7, i, bVI, iv, V7], [i, i, bVI, bVI, iv, iv, V7, V7]],
    B: [[bVI, bVI, iv, iv, bII, bII, V7, V7], [iv, iv, bVI, bVI, iio, iio, V7, V7]],
  },
};

// Which styles each track shuffles through.
export const TRACKS = { menu: ["foxtrot", "waltz", "torch"], battle: ["tense", "torch"] };
export function styleFor(track, seed) {
  const list = TRACKS[track] || TRACKS.menu;
  return list[Math.floor(rng(seed * 7 + 3)() * list.length)];
}

const tonesOf = ([root, q], key) => QUALITY[q].map((s) => key + root + s);

// The note in `pool` (pitch classes, any octave) nearest `from`, inside [lo, hi].
function nearestIn(pool, from, lo, hi, r) {
  const cands = [];
  for (let m = lo; m <= hi; m++) if (pool.includes(((m % 12) + 12) % 12)) cands.push(m);
  cands.sort((a, b) => Math.abs(a - from) - Math.abs(b - from) || (r() - 0.5));
  return cands[Math.min(cands.length - 1, r() < 0.7 ? 0 : 1)] ?? from;
}

// One 8-bar tune over `prog`: a 2-bar rhythm motif repeated, pitches chosen per
// chord (chord tones on strong beats, stepwise scale tones between), landing
// on the root at the end.
function writeTune(r, st, prog, key, lo, hi) {
  const m = st.meter, scale = SCALES[st.mode].map((s) => (s + key) % 12);
  const motif = [];
  for (let b = 0; b < m * 2;) {
    let d = pick(r, st.rhythm);
    if (b + d > m * 2) d = m * 2 - b;
    motif.push({ b, d, rest: b > 0 && r() < st.rest });
    b += d;
  }
  const notes = [];
  let prev = Math.round((lo + hi) / 2);
  for (let bar = 0; bar < prog.length; bar += 2) {
    const last = bar + 2 >= prog.length;
    for (const n of motif) {
      const barIn = bar + Math.floor(n.b / m), beatIn = n.b % m;
      if (barIn >= prog.length || n.rest) continue;
      const chord = tonesOf(prog[barIn], key).map((x) => ((x % 12) + 12) % 12);
      const strong = beatIn === 0 || (m === 4 && beatIn === 2);
      const finalNote = last && n.b + n.d >= m * 2;
      const pool = finalNote ? [chord[0]] : strong ? chord : scale;
      let target = prev + (strong ? 0 : pick(r, [-2, -1, 1, 2, 3, -3]));
      const midi = nearestIn(pool, target, lo, hi, r);
      notes.push({ beat: bar * m + n.b, dur: n.d, midi });
      prev = midi;
    }
  }
  return notes;
}

// The band under one bar of `chord`.
function compBar(st, chord, key, bar, r, evs) {
  const m = st.meter, b0 = bar * m, root = key + chord[0] - 12, tones = tonesOf(chord, key);
  const fifth = root + 7;
  if (st.comp === "stride") {
    evs.push({ beat: b0, dur: 0.9, midi: root, inst: "bass", vel: 0.8 });
    evs.push({ beat: b0 + 2, dur: 0.9, midi: bar % 2 ? root : fifth, inst: "bass", vel: 0.7 });
    for (const b of [1, 3]) for (const t of tones) evs.push({ beat: b0 + b, dur: 0.45, midi: t, inst: "stab", vel: 0.45 });
    for (const b of [1, 3]) evs.push({ beat: b0 + b, dur: 0.2, midi: 0, inst: "clank", vel: 0.35 });
    for (let e = 0; e < 8; e++) if (r() < 0.8) evs.push({ beat: b0 + e / 2, dur: 0.1, midi: 0, inst: "brush", vel: e % 2 ? 0.2 : 0.3 });
  } else if (st.comp === "waltz") {
    evs.push({ beat: b0, dur: 0.9, midi: bar % 2 ? fifth : root, inst: "bass", vel: 0.8 });
    evs.push({ beat: b0, dur: 0.3, midi: 0, inst: "kick", vel: 0.4 });
    for (const b of [1, 2]) {
      for (const t of tones) evs.push({ beat: b0 + b, dur: 0.5, midi: t, inst: "stab", vel: 0.4 });
      evs.push({ beat: b0 + b, dur: 0.15, midi: 0, inst: "clank", vel: 0.25 });
    }
  } else if (st.comp === "torch") {
    for (const t of tones) evs.push({ beat: b0, dur: m, midi: t, inst: "pad", vel: 0.5 });
    evs.push({ beat: b0, dur: 1.8, midi: root, inst: "bass", vel: 0.7 });
    evs.push({ beat: b0 + 2, dur: 1.8, midi: fifth, inst: "bass", vel: 0.55 });
    for (const b of [1, 3]) evs.push({ beat: b0 + b, dur: 0.12, midi: 0, inst: "brush", vel: 0.25 });
    if (bar % 4 === 3) evs.push({ beat: b0 + 3.5, dur: 0.3, midi: 0, inst: "clank", vel: 0.3 });
  } else {
    // ostinato: a low detuned-piano figure, a pad, a heartbeat kick.
    for (const t of tones.slice(0, 3)) evs.push({ beat: b0, dur: m, midi: t - 12, inst: "pad", vel: 0.35 });
    const fig = [root, root + 12, fifth, root + 12, root, fifth, root + 12, fifth];
    fig.forEach((n, e) => evs.push({ beat: b0 + e / 2, dur: 0.4, midi: n, inst: "pluck", vel: e % 2 ? 0.3 : 0.45 }));
    evs.push({ beat: b0, dur: 0.3, midi: 0, inst: "kick", vel: 0.55 });
    evs.push({ beat: b0 + 0.75, dur: 0.3, midi: 0, inst: "kick", vel: 0.35 });
    if (bar % 8 === 7 || r() < 0.12) evs.push({ beat: b0 + 3, dur: 0.4, midi: 0, inst: "clank", vel: 0.4 });
  }
}

// A whole song for `seed` in `styleId`: { style, bpm, meter, key, bars,
// lengthBeats, lead, chords: [{ bar, tones }], events: [{ beat, dur, midi,
// inst, vel }] } sorted by beat. Percussion carries midi 0.
export function compose(seed, styleId = "foxtrot") {
  const st = STYLES[styleId] || STYLES.foxtrot;
  const r = rng(seed * 2654435761 + styleId.length);
  const key = pick(r, st.keys);
  const bpm = Math.round(st.bpm[0] + r() * (st.bpm[1] - st.bpm[0]));
  const lead = pick(r, st.leads);
  const A = pick(r, st.A), B = pick(r, st.B);
  const lo = key + 12, hi = key + 26;
  const tuneA = writeTune(r, st, A, key, lo, hi), tuneB = writeTune(r, st, B, key, lo, hi);
  const form = [[A, tuneA], [A, tuneA], [B, tuneB], [A, tuneA]];
  const m = st.meter, events = [], chords = [];
  form.forEach(([prog, tune], sec) => {
    const off = sec * 8;
    prog.forEach((c, bi) => {
      chords.push({ bar: off + bi, root: c[0], quality: c[1], tones: tonesOf(c, key) });
      compBar(st, c, key, off + bi, r, events);
    });
    for (const n of tune) events.push({ beat: off * m + n.beat, dur: n.dur, midi: n.midi, inst: lead === "lead" ? "lead" : "melody", vel: 0.6 });
  });
  // Swing the off-beat eighths.
  if (st.swing) for (const e of events) if (Math.abs((e.beat % 1) - 0.5) < 1e-6) e.beat += st.swing * 0.5;
  events.sort((a, b) => a.beat - b.beat);
  return { style: styleId in STYLES ? styleId : "foxtrot", bpm, meter: m, key, bars: 32, lengthBeats: 32 * m, lead, chords, scale: SCALES[st.mode].map((s) => (s + key) % 12), events };
}

// Task 57: the music is a radio, and a hot boiler knocks it off the station.
// heat: the player's active rig's heat as a fraction of capacity (can exceed 1).
// detune: cents the tuning drifts; wobble: extra wow depth (cents); static:
// 0..1 how much hiss is mixed in; clean: 0..1 how much of the music survives.
export function radioTuning(heat) {
  const h = Math.max(0, Math.min(1.5, Number(heat) || 0));
  const x = Math.max(0, h - 0.25) / 1.25; // the first quarter of the boiler is harmless
  return { detune: -x * 90, wobble: 6 + x * 40, static: Math.min(1, x * 1.1), clean: 1 - Math.min(0.7, x * 0.7) };
}
