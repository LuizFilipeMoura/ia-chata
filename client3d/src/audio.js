// Synthesized sound, no asset files. Every effect is a few oscillators and a
// noise buffer through envelopes: cannon thumps, minigun rattles, missile
// whooshes, arc-gun zaps, clanky footsteps, overheat klaxons, a victory fanfare.
// Lazily unlocked on the first user gesture (browsers block audio before one).
import { settings } from "./settings.js";
import { notes, FORMANTS } from "./voice.js";
import { TAKES, pickTake, shotRecipe, swingRecipe, CORE, footFor, stepRecipe, servoRecipe, CUES, idleFor, clockworkNotes, BEDS, bedFor } from "./audio-recipes.js";
let ctx = null, master = null, voices = null, radio = null, musicBus = null, noiseBuf = null, loopBuf = null;
const vol = () => settings.get("volume") ?? 0.5;
const voiceVol = () => settings.get("voiceVolume") ?? 0.35;
const musicVol = () => settings.get("musicVolume") ?? 0.3;
settings.on((k) => {
  if (k === "volume" && master) master.gain.value = muted ? 0 : vol();
  if (k === "voiceVolume" && voices) voices.gain.value = muted ? 0 : voiceVol();
  if (k === "musicVolume" && musicBus) musicBus.gain.value = muted ? 0 : musicVol();
});
let muted = (() => { try { return localStorage.getItem("oi3d-muted") === "1"; } catch { return false; } })();
let lastStep = 0;

function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : vol(); master.connect(ctx.destination);
  // Pilot voices have their own bus and slider, independent of the effects.
  voices = ctx.createGain(); voices.gain.value = muted ? 0 : voiceVol(); voices.connect(ctx.destination);
  // Every pilot is on the radio: a narrow band, a little valve distortion.
  radio = ctx.createBiquadFilter(); radio.type = "highpass"; radio.frequency.value = 320;
  const rlp = ctx.createBiquadFilter(); rlp.type = "lowpass"; rlp.frequency.value = 3200;
  const valve = ctx.createWaveShaper(); valve.curve = softClip(2.2); valve.oversample = "2x";
  const makeup = ctx.createGain(); makeup.gain.value = 1.5;
  radio.connect(rlp).connect(valve).connect(makeup).connect(voices);
  // The gramophone (music.js) has its own slider.
  musicBus = ctx.createGain(); musicBus.gain.value = muted ? 0 : musicVol(); musicBus.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // A longer noise loop for continuous beds, so the repeat isn't audible.
  loopBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const L = loopBuf.getChannelData(0);
  for (let i = 0; i < L.length; i++) L[i] = Math.random() * 2 - 1;
  return ctx;
}
function softClip(k) {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) { const x = (i / (c.length - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
const unlockers = new Set();
let unlocked = false;
function unlock() {
  init(); ctx?.resume?.();
  if (!unlocked) { unlocked = true; unlockers.forEach((f) => f()); unlockers.clear(); }
}
window.addEventListener("pointerdown", unlock, { once: false });
window.addEventListener("keydown", unlock, { once: false });
// `fn` runs once audio may play (after the first click or key press).
export function onUnlock(fn) { if (unlocked) fn(); else unlockers.add(fn); }
// The raw context and buses for music.js, or null before a gesture.
export function audioCore() {
  if (!unlocked || !init()) return null;
  return { ctx, noiseBuf, loopBuf, music: musicBus };
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem("oi3d-muted", m ? "1" : "0"); } catch {}
  if (master) master.gain.value = m ? 0 : vol();
  if (voices) voices.gain.value = m ? 0 : voiceVol();
  if (musicBus) musicBus.gain.value = m ? 0 : musicVol();
}

function env(node, t, a, peak, dur) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function noise(t, dur, { freq = 1000, q = 1, type = "lowpass", peak = 0.6, attack = 0.005, sweepTo, out = master } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); env(g, t, attack, peak, dur);
  s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.05);
}
function tone(t, dur, { freq = 440, to, type = "sine", peak = 0.3, attack = 0.005, out = master } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); env(g, t, attack, peak, dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}

// Distance attenuation is overkill for a tabletop; a little random pitch keeps
// repeated sounds from machine-gunning identically.
const jit = (v, p = 0.08) => v * (1 + (Math.random() - 0.5) * p * 2);

// Recipes live in audio-recipes.js; `play` hands one the synth kit and a take
// (never the same take twice in a row per key).
const kit = { noise, tone, jit, rand: Math.random };
function play(key, recipe, ...args) {
  if (!init() || muted) return;
  recipe(kit, ctx.currentTime, TAKES[pickTake(key)], ...args);
}
// The kit with every peak scaled (a quieter or louder take of a recipe), and
// optionally routed to another bus.
function scaled(P, level = 1, out) {
  const o = (x) => ({ ...x, peak: Math.max(0.0002, Math.min(1, (x.peak ?? 0.3) * level)), ...(out ? { out } : {}) });
  return { ...P, noise: (t, d, x = {}) => P.noise(t, d, o(x)), tone: (t, d, x = {}) => P.tone(t, d, o(x)) };
}
// Radio squelch: a click and a breath of static opening the channel at t0,
// crackle under the line, a hiss tail closing it at t1.
function squelch(t0, t1) {
  noise(t0, 0.05, { freq: 2600, type: "bandpass", q: 3, peak: 0.1, out: voices });
  tone(t0, 0.02, { freq: 1900, type: "square", peak: 0.03, out: voices });
  for (let t = t0 + 0.1; t < t1; t += 0.12 + Math.random() * 0.35) noise(t, 0.012, { freq: jit(3800, 0.4), type: "bandpass", q: 2, peak: 0.04, out: voices });
  noise(t1, 0.14, { freq: 2200, sweepTo: 1200, type: "bandpass", q: 1.5, peak: 0.08, out: voices });
  tone(t1 + 0.12, 0.02, { freq: 1500, type: "square", peak: 0.025, out: voices });
}
// A Clockwork's "voice": escapement ticks, ratchet runs, a little whistle.
function clockwork(line) {
  const { ev, total } = clockworkNotes(line);
  const t0 = ctx.currentTime + 0.03;
  for (const e of ev) {
    const t = t0 + e.t;
    if (e.kind === "tick") { noise(t, 0.012, { freq: e.freq, type: "bandpass", q: 12, peak: 0.3, out: voices }); tone(t, 0.03, { freq: e.freq / 2.7, type: "sine", peak: 0.03, out: voices }); }
    else if (e.kind === "ratchet") noise(t, 0.01, { freq: e.freq, type: "bandpass", q: 8, peak: 0.2, out: voices });
    else { tone(t, 0.12, { freq: e.freq, to: e.freq * 1.3, type: "sine", peak: 0.06, out: voices }); tone(t + 0.12, 0.16, { freq: e.freq * 1.3, to: e.freq * 1.1, type: "sine", peak: 0.05, out: voices }); }
  }
  return total + 0.03;
}

export const sfx = {
  // A gun going off: its own voice when it has one, else its projectile kind's.
  shot(kind, weapon) { play(`shot:${weapon || kind}`, shotRecipe(weapon, kind)); },
  melee(heavy = false, weapon) { play(`melee:${weapon || heavy}`, swingRecipe(weapon, heavy)); },
  hit(sp) { play(sp <= 0 ? "ping" : "hit", CORE.hit, sp); },
  explosion(big = false) { play(`boom:${big}`, CORE.explosion, big); },
  // Footfalls and servos sound like the chassis making them.
  step(heavy, chassis) {
    const now = performance.now(); if (now - lastStep < 110) return; lastStep = now;
    play(`step:${chassis || heavy}`, (P, t, k) => stepRecipe(P, t, k, footFor(chassis, heavy ? "medium" : "light")));
  },
  servo(chassis) { play(`servo:${chassis}`, (P, t, k) => servoRecipe(P, t, k, footFor(chassis))); },
  overheat(bad) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    noise(t, 1.2, { freq: 5000, type: "highpass", peak: 0.3, attack: 0.05 });
    if (bad) for (let i = 0; i < 3; i++) { tone(t + i * 0.28, 0.14, { freq: 880, type: "square", peak: 0.12 }); tone(t + i * 0.28 + 0.14, 0.14, { freq: 660, type: "square", peak: 0.12 }); }
  },
  click() { if (!init() || muted) return; tone(ctx.currentTime, 0.04, { freq: 1400, type: "square", peak: 0.05 }); },
  bad() { if (!init() || muted) return; const t = ctx.currentTime; tone(t, 0.12, { freq: 220, type: "square", peak: 0.1 }); tone(t + 0.12, 0.18, { freq: 160, type: "square", peak: 0.1 }); },
  turn(mine) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    const notes = mine ? [523, 659, 784] : [392, 330];
    notes.forEach((f, i) => tone(t + i * 0.09, 0.18, { freq: f, type: "triangle", peak: 0.15 }));
  },
  // Radio chatter: a burst of band-passed static with a squelch click.
  bark() { if (!init() || muted) return; const t = ctx.currentTime; noise(t, 0.35, { freq: 1800, type: "bandpass", q: 4, peak: 0.08, attack: 0.01 }); tone(t, 0.03, { freq: 2400, type: "square", peak: 0.05 }); tone(t + 0.34, 0.03, { freq: 1900, type: "square", peak: 0.05 }); },
  // A pilot speaking `line` (see voice.js): a square+saw buzz stepped per
  // syllable through two formant filters that jump between vowel shapes, each
  // syllable gated like a blip. Returns how long the line takes, in seconds.
  // Clockworks tick instead (see clockwork below). Every spoken line goes out
  // over the radio: squelch in, crackle under it, squelch out.
  voice(line, v) {
    if (!init() || muted) return 0;
    if (v?.clockwork) return clockwork(line);
    const ns = notes(line, v);
    if (!ns.length) return 0;
    const t0 = ctx.currentTime + 0.09, end = ns.at(-1).t + ns.at(-1).dur;
    squelch(t0 - 0.08, t0 + end + 0.04);
    const vca = ctx.createGain(); vca.gain.value = 0; vca.connect(radio);
    const f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.Q.value = 9;
    const g1 = ctx.createGain(); g1.gain.value = 3; const g2 = ctx.createGain(); g2.gain.value = 2;
    const body = ctx.createBiquadFilter(); body.type = "lowpass"; body.frequency.value = 380; const gb = ctx.createGain(); gb.gain.value = 0.35;
    const mouth = ctx.createGain();
    mouth.connect(f1).connect(g1).connect(vca); mouth.connect(f2).connect(g2).connect(vca); mouth.connect(body).connect(gb).connect(vca);
    const sq = ctx.createOscillator(); sq.type = "square";
    const sw = ctx.createOscillator(); sw.type = "sawtooth";
    const gs = ctx.createGain(); gs.gain.value = 0.25 + 0.35 * v.chip; const gw = ctx.createGain(); gw.gain.value = 0.55 - 0.3 * v.chip;
    sq.connect(gs).connect(mouth); sw.connect(gw).connect(mouth);
    for (const n of ns) {
      const t = t0 + n.t, lvl = 0.5 * n.level, hold = n.dur * (0.75 - 0.3 * v.chip);
      sq.frequency.setValueAtTime(n.freq, t); sw.frequency.setValueAtTime(n.freq, t);
      const [F1, F2] = FORMANTS[n.vowel] || FORMANTS.a;
      f1.frequency.setValueAtTime(F1, t); f2.frequency.setValueAtTime(F2, t);
      vca.gain.setValueAtTime(0, t); vca.gain.linearRampToValueAtTime(lvl, t + 0.006);
      vca.gain.setValueAtTime(lvl, t + hold); vca.gain.linearRampToValueAtTime(0, t + hold + 0.03);
      if (n.onset === "plosive") {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2200;
        const g = ctx.createGain(); env(g, t, 0.005, 0.12, 0.02);
        s.connect(f).connect(g).connect(radio); s.start(t); s.stop(t + 0.07);
      }
    }
    for (const o of [sq, sw]) { o.start(t0); o.stop(t0 + end + 0.1); }
    sq.onended = () => vca.disconnect();
    return end + 0.12;
  },
  // ---- Dieselpunk cues (recipes in audio-recipes.js CUES) ----
  engineStart() { play("engineStart", CUES.engineStart); },
  whistle() { play("whistle", CUES.whistle); },
  siren() { play("siren", CUES.siren); },
  klaxon() { play("klaxon", CUES.klaxon); },
  posterSlam() { play("posterSlam", CUES.posterSlam); },
  stamp() { play("stamp", CUES.stamp); },
  coin() { play("coin", CUES.coin); },
  tapeHiss() { play("tapeHiss", CUES.tapeHiss); },
  projector() { play("projector", CUES.projector); },
  // An enemy acting somewhere else: a far-off footfall. `level` < 1 when it's in view.
  distantThud(level = 1) { play("thud", (P, t, k) => CUES.distantThud(scaled(P, level), t, k)); },
  // A medium's hull groaning (on activation, and when it's hurt).
  groan(level = 1) { play("groan", (P, t, k) => CUES.groan(scaled(P, level), t, k)); },
  // Beacon payout: a bright cash-register ding (lower and darker for the enemy).
  score(mine = true) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    (mine ? [784, 1175, 1568] : [392, 311]).forEach((f, i) => tone(t + i * 0.07, 0.35, { freq: f, type: "triangle", peak: 0.18 }));
    noise(t, 0.08, { freq: 6000, type: "highpass", peak: 0.15 });
  },
  // A part gives way: tearing metal and a heavy clunk.
  breakPart() { play("break", CORE.breakPart); },
  // Dice tumbling in a tin tray.
  dice(n = 3) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    for (let i = 0; i < Math.min(8, n + 2); i++) noise(t + i * 0.045 + Math.random() * 0.02, 0.03, { freq: jit(3500, 0.4), type: "bandpass", q: 6, peak: 0.18 });
  },
  // Stagger: a shot rings the armour like a bell.
  stagger() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    tone(t, 0.6, { freq: jit(520), to: 480, type: "sine", peak: 0.15 });
    tone(t, 0.4, { freq: jit(1330), to: 1200, type: "sine", peak: 0.07 });
  },
  thrusters() { if (!init() || muted) return; noise(ctx.currentTime, 1.6, { freq: 400, sweepTo: 1500, type: "bandpass", q: 1, peak: 0.35, attack: 0.3 }); },
  // Campaign: the reinforcement klaxon (two falling whoops) and the extraction
  // lift-off (a rising thruster roar).
  alarm() { if (!init() || muted) return; const t = ctx.currentTime; for (let i = 0; i < 2; i++) { tone(t + i * 0.45, 0.4, { freq: 760, to: 420, type: "sawtooth", peak: 0.12 }); tone(t + i * 0.45, 0.4, { freq: 1140, to: 630, type: "square", peak: 0.04 }); } },
  // Integrity Critical (§8a): a fast warbling master-caution, three short pulses.
  critical() { if (!init() || muted) return; const t = ctx.currentTime; for (let i = 0; i < 3; i++) { tone(t + i * 0.22, 0.16, { freq: 980, to: 1240, type: "square", peak: 0.1 }); tone(t + i * 0.22 + 0.08, 0.08, { freq: 620, type: "sawtooth", peak: 0.06 }); } },
  liftoff() { if (!init() || muted) return; const t = ctx.currentTime; noise(t, 2.2, { freq: 250, sweepTo: 2200, type: "bandpass", q: 0.8, peak: 0.4, attack: 0.5 }); tone(t, 2, { freq: 60, to: 140, type: "sawtooth", peak: 0.12, attack: 0.4 }); },
  // ---- Equipment ----
  // Harden: plates slam shut, two heavy clanks and a ring.
  clank() { play("clank", CORE.clank); },
  // Purge / steam venting: a long high hiss.
  hiss(long = false) { if (!init() || muted) return; noise(ctx.currentTime, long ? 1.6 : 1.0, { freq: 6000, sweepTo: 2500, type: "highpass", peak: 0.4, attack: 0.03 }); },
  // Jump jets / grapnel yank: a short thruster roar and a landing thump.
  jet() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    noise(t, 0.8, { freq: 500, sweepTo: 2200, type: "bandpass", q: 0.8, peak: 0.45, attack: 0.05 });
    tone(t, 0.7, { freq: 90, to: 160, type: "sawtooth", peak: 0.08 });
  },
  land() { play("land", CORE.land); },
  // Grapnel: the hook's crack, then a ratcheting winch.
  grapnel() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    noise(t, 0.1, { freq: 2200, type: "bandpass", q: 4, peak: 0.4 });
    tone(t, 0.3, { freq: 900, to: 250, type: "triangle", peak: 0.18 });
    for (let i = 0; i < 9; i++) noise(t + 0.3 + i * 0.07, 0.03, { freq: jit(3000, 0.2), type: "bandpass", q: 8, peak: 0.25 });
    tone(t + 0.3, 0.7, { freq: 110, to: 190, type: "sawtooth", peak: 0.06 });
  },
  // Overclock: a rising whine with a pulse.
  overclock() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    tone(t, 0.8, { freq: 200, to: 1400, type: "sawtooth", peak: 0.09, attack: 0.05 });
    for (let i = 0; i < 4; i++) tone(t + 0.1 + i * 0.16, 0.08, { freq: 120, type: "square", peak: 0.15 });
  },
  // Welding / nanites: crackling arc buzz.
  weld() {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 10; i++) noise(t + i * 0.06 + Math.random() * 0.03, 0.04, { freq: jit(4200, 0.3), type: "bandpass", q: 3, peak: 0.2 });
    tone(t, 0.6, { freq: 120, type: "sawtooth", peak: 0.04 });
  },
  // Heat Purge Wave / Scuttle burst: a deep whoomp and a rolling roar.
  wave(big = false) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    tone(t, big ? 1.1 : 0.7, { freq: 110, to: 30, type: "sine", peak: 0.8 });
    noise(t, big ? 1.4 : 1.0, { freq: 300, sweepTo: 2400, type: "bandpass", q: 0.7, peak: 0.5, attack: 0.04 });
    if (big) for (let i = 0; i < 3; i++) tone(t + 0.2 + i * 0.22, 0.12, { freq: 520, type: "square", peak: 0.08 });
  },
  // Lock Sight: rising target-acquired beeps.
  lockon() { if (!init() || muted) return; const t = ctx.currentTime; [880, 1175, 1568].forEach((f, i) => tone(t + i * 0.1, 0.08, { freq: f, type: "square", peak: 0.08 })); tone(t + 0.32, 0.3, { freq: 1760, type: "sine", peak: 0.1 }); },
  // Pop Smoke: launcher thump, then the canister's hiss.
  smoke() { if (!init() || muted) return; const t = ctx.currentTime; tone(t, 0.18, { freq: 140, to: 60, type: "triangle", peak: 0.4 }); noise(t + 0.1, 1.2, { freq: 1800, type: "bandpass", q: 0.6, peak: 0.25, attack: 0.1 }); },
  // Chaff: a burst of tinkling foil.
  chaff() { if (!init() || muted) return; const t = ctx.currentTime; noise(t, 0.12, { freq: 1200, peak: 0.3 }); for (let i = 0; i < 8; i++) tone(t + 0.05 + Math.random() * 0.4, 0.06, { freq: jit(3500, 0.4), type: "sine", peak: 0.05 }); },
  // Cryo: a frosty crackle over a glassy chime.
  cryo() { if (!init() || muted) return; const t = ctx.currentTime; noise(t, 0.9, { freq: 7000, type: "highpass", peak: 0.3, attack: 0.02 }); tone(t, 0.6, { freq: 1980, to: 1760, type: "sine", peak: 0.08 }); tone(t + 0.08, 0.5, { freq: 2640, type: "sine", peak: 0.05 }); },
  // Point-defense / ablative intercept: a sharp ping and zap.
  intercept() { if (!init() || muted) return; const t = ctx.currentTime; tone(t, 0.12, { freq: 2600, to: 1200, type: "square", peak: 0.08 }); noise(t, 0.08, { freq: 5000, type: "highpass", peak: 0.3 }); },
  fanfare(win) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    const seq = win ? [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.45], [784, 0.7], [1047, 0.85]] : [[392, 0], [349, 0.3], [311, 0.6], [262, 0.9]];
    for (const [f, d] of seq) { tone(t + d, win ? 0.3 : 0.45, { freq: f, type: "triangle", peak: 0.2 }); tone(t + d, win ? 0.3 : 0.45, { freq: f / 2, type: "square", peak: 0.05 }); }
  },
};

// The battlefield's ambient bed, per theme (BEDS in audio-recipes.js): a
// quiet diesel drone under the theme's continuous layers, plus far-off events
// (drop hammers, gulls, a church bell...) fired now and then. `id` is the
// theme's `ambience` id or its theme id; unknown ids fall back to the foundry.
let amb = null;
const lfo = (target, rate, depth) => {
  const o = ctx.createOscillator(); o.frequency.value = rate * (0.85 + Math.random() * 0.3);
  const g = ctx.createGain(); g.gain.value = depth; o.connect(g).connect(target); o.start(); return o;
};
function buildLoop(l, into, nodes) {
  const g = ctx.createGain(); g.gain.value = l.gain; g.connect(into);
  if (l.kind === "drone") {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = l.lp || 200; lp.connect(g);
    for (const f of l.freqs) { const o = ctx.createOscillator(); o.type = l.wave || "sawtooth"; o.frequency.value = f; o.connect(lp); o.start(); nodes.push(o); }
  } else {
    const s = ctx.createBufferSource(); s.buffer = loopBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = l.filter || "lowpass"; f.frequency.value = l.freq; f.Q.value = l.q ?? 0.7;
    s.connect(f).connect(g); s.start(0, Math.random() * 3); nodes.push(s);
    if (l.sweep) nodes.push(lfo(f.frequency, l.sweep[0], l.sweep[1]));
  }
  if (l.swell) nodes.push(lfo(g.gain, l.swell[0], l.gain * l.swell[1]));
}
export const ambience = {
  start(id) {
    if (!init()) return;
    const bedId = bedFor(id);
    if (amb?.bedId === bedId) return;
    if (amb) this.stop();
    const bed = BEDS[bedId];
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(master);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = bed.lp || 2500; lp.connect(out);
    const nodes = [];
    buildLoop({ kind: "drone", freqs: [42, 43.3], wave: "sawtooth", lp: 180, gain: 0.025, swell: [3.1, 0.4] }, lp, nodes);
    for (const l of bed.loops) buildLoop(l, lp, nodes);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 3);
    const P = scaled(kit, 1, lp);
    const next = bed.events.map((e) => ctx.currentTime + e.every[0] * Math.random());
    const timer = setInterval(() => {
      if (muted || ctx.state !== "running") return;
      const now = ctx.currentTime;
      bed.events.forEach((e, i) => {
        if (now < next[i]) return;
        e.play(P, now + 0.05);
        next[i] = now + e.every[0] + Math.random() * (e.every[1] - e.every[0]);
      });
    }, 400);
    amb = { bedId, out, nodes, timer };
  },
  stop() {
    if (!amb) return;
    const a = amb; amb = null;
    clearInterval(a.timer);
    a.out.gain.cancelScheduledValues(ctx.currentTime);
    a.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => { a.nodes.forEach((o) => { try { o.stop(); } catch {} }); a.out.disconnect(); }, 1500);
  },
};

// The active unit's diesel idling: a firing buzz chugging on an LFO, plus
// exhaust roughness, pitch and grit rising with heat (idleFor). One engine at
// a time; `level` < 1 for units further from the player's attention.
let eng = null;
export const engine = {
  idle(chassis, heat = 0, { level = 1 } = {}) {
    if (!init() || muted) { this.stop(); return; }
    const p = idleFor(chassis, heat);
    if (eng && eng.chassis !== chassis) this.stop();
    const now = ctx.currentTime;
    if (!eng) {
      const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(master);
      const amp = ctx.createGain(); amp.gain.value = 0.6; amp.connect(out);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = p.lp; lp.connect(amp);
      const o1 = ctx.createOscillator(); o1.type = p.wave; o1.frequency.value = p.f0;
      const o2 = ctx.createOscillator(); o2.type = "square"; o2.frequency.value = p.f0 * 0.5; o2.detune.value = 7;
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      o1.connect(lp); o2.connect(g2).connect(lp);
      const n = ctx.createBufferSource(); n.buffer = loopBuf; n.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 220; nf.Q.value = 1;
      const ng = ctx.createGain(); ng.gain.value = p.rough * 0.8;
      n.connect(nf).connect(ng).connect(lp);
      const chug = ctx.createOscillator(); chug.frequency.value = p.rate;
      const cg = ctx.createGain(); cg.gain.value = 0.4; chug.connect(cg).connect(amp.gain);
      for (const s of [o1, o2, n, chug]) s.start();
      // A diesel never idles perfectly: nudge the firing pitch now and then.
      const timer = setInterval(() => { if (eng) eng.o1.frequency.setTargetAtTime(eng.p.f0 * (1 + (Math.random() - 0.5) * 0.08 * eng.p.rough), ctx.currentTime, 0.05); }, 180);
      eng = { chassis, out, lp, o1, o2, ng, chug, cg, srcs: [o1, o2, n, chug], timer, p };
    }
    eng.p = p;
    eng.o1.frequency.setTargetAtTime(p.f0, now, 0.3);
    eng.o2.frequency.setTargetAtTime(p.f0 * 0.5, now, 0.3);
    eng.lp.frequency.setTargetAtTime(p.lp, now, 0.3);
    eng.chug.frequency.setTargetAtTime(p.rate, now, 0.3);
    eng.ng.gain.setTargetAtTime(p.rough * 0.8, now, 0.3);
    eng.cg.gain.setTargetAtTime(0.25 + 0.25 * p.rough, now, 0.3);
    eng.out.gain.setTargetAtTime(0.07 * level, now, 0.4);
  },
  stop() {
    if (!eng) return;
    const e = eng; eng = null;
    clearInterval(e.timer);
    e.out.gain.cancelScheduledValues(ctx.currentTime);
    e.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
    setTimeout(() => { e.srcs.forEach((o) => { try { o.stop(); } catch {} }); e.out.disconnect(); }, 1200);
  },
};
