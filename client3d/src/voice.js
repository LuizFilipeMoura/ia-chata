// Pilot voices. A bark is "spoken" as a string of little vowel-shaped notes: the
// line is chopped into rough English syllables (so a longer line talks longer),
// punctuation becomes breath, the pitch drifts down across a phrase, lifts on
// "!" and rises at the end of a "?". Each syllable steps its pitch by at most
// the voice's `spread` semitones. Pure: audio.js turns the notes into sound.

// f0 = base pitch (Hz), syl = seconds per syllable, chip = square-wave buzz and
// choppiness (0..1), spread = max pitch step between syllables (semitones).
export const MALE = { f0: 70, syl: 0.1, chip: 0.15, spread: 0.2 };
export const FEMALE = { ...MALE, f0: 160 };
export const M = (o = {}) => ({ ...MALE, ...o });
export const F = (o = {}) => ({ ...FEMALE, ...o });
export const ROBOT = { f0: 220, syl: 0.07, chip: 0.6, spread: 0 };

// Mouth shapes: the first two formants of each vowel (Hz).
export const FORMANTS = { a: [730, 1090], e: [530, 1840], i: [300, 2200], o: [570, 840], u: [320, 870] };
// The thin vowels come out of the formant filters quieter; lift them to match.
const VOWEL_LEVEL = { a: 1, e: 1, i: 1.2, o: 0.95, u: 1.15 };
const STEPS = [-3, -2, 0, 0, 2, 3, 5];
const PLOSIVE = /[bdgkpqtcx]/, FRIC = /[sfhzjv]/;
const PAUSE = { ",": 0.14, ";": 0.18, ":": 0.18, ".": 0.26, "!": 0.24, "?": 0.26, "…": 0.4, "...": 0.4 };

// Vowel groups are syllables, a trailing silent "e" is dropped, and the letter
// before a group decides the onset: plosive pop, fricative hiss, or soft.
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return [];
  let groups = [...w.matchAll(/[aeiouy]+/g)];
  if (groups.length > 1 && /[^aeiouy]e$/.test(w) && !/le$/.test(w)) groups = groups.slice(0, -1);
  if (!groups.length) return [{ vowel: "u", onset: "soft" }];
  return groups.map((m) => {
    const before = w[m.index - 1];
    const onset = !before ? "none" : PLOSIVE.test(before) ? "plosive" : FRIC.test(before) ? "fric" : "soft";
    return { vowel: m[0][0] === "y" ? "i" : m[0][0], onset };
  });
}

// Timed syllables, offsets in seconds from the start of the line.
export function plan(line, syl = MALE.syl, rand = Math.random) {
  const rnd = (a, b) => a + rand() * (b - a);
  const toks = line.match(/[A-Za-z']+|\.\.\.|…|[.,!?;:]/g) || [];
  const excl = line.includes("!");
  const ev = [];
  let t = 0, phrase = [];
  const closePhrase = (p) => {
    if (!phrase.length) return;
    const last = phrase[phrase.length - 1];
    last.dur *= 1.45;
    if (p === "?") last.rise = true;
    phrase.forEach((e, i) => { e.pitch *= 1.07 - 0.15 * (i / Math.max(1, phrase.length - 1)); });
    phrase = [];
  };
  for (const tok of toks) {
    if (tok in PAUSE) {
      closePhrase(tok);
      if (ev.length) ev[ev.length - 1].endGap = PAUSE[tok];
      t += PAUSE[tok];
      continue;
    }
    const ss = syllables(tok);
    ss.forEach((s, i) => {
      const dur = syl * rnd(0.82, 1.18) * (s.onset === "fric" ? 1.1 : 1);
      const e = { t, dur, ...s, pitch: rnd(0.96, 1.04) * (i === 0 ? 1.05 : 1) * (excl ? 1.12 : 1), wordEnd: i === ss.length - 1 };
      ev.push(e); phrase.push(e);
      t += dur;
    });
    t += 0.035;
  }
  closePhrase(".");
  const end = ev.at(-1);
  return { ev, total: end ? end.t + end.dur : 0.2 };
}

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The notes to play for `line` in voice `v`: { t, dur, freq, semis, vowel,
// onset, level }. The step pattern comes from the text, so a line always has
// the same tune; only the timing jitters.
export function notes(line, v, rand = Math.random) {
  const { ev } = plan(line, v.syl, rand);
  const s = v.spread;
  let prev = 0;
  return ev.map((e, i) => {
    const semis = clamp(clamp(STEPS[hash(line + i) % STEPS.length], prev - s, prev + s), -s, s);
    prev = semis;
    const contour = 1 + (e.pitch - 1) * 0.5;
    const freq = v.f0 * 1.1 * contour * 2 ** (semis / 12) * (e.rise ? 1.12 : 1);
    return { t: e.t, dur: e.dur, freq, semis, vowel: e.vowel, onset: e.onset, level: VOWEL_LEVEL[e.vowel] || 1 };
  });
}
