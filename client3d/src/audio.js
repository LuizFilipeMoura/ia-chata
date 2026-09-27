// Synthesized sound, no asset files. Every effect is a few oscillators and a
// noise buffer through envelopes: cannon thumps, minigun rattles, missile
// whooshes, arc-gun zaps, clanky footsteps, overheat klaxons, a victory fanfare.
// Lazily unlocked on the first user gesture (browsers block audio before one).
import { settings } from "./settings.js";
import { notes, FORMANTS } from "./voice.js";
import { TAKES, pickTake, shotRecipe, swingRecipe, CORE, footFor, stepRecipe, servoRecipe } from "./audio-recipes.js";
let ctx = null, master = null, voices = null, noiseBuf = null;
const vol = () => settings.get("volume") ?? 0.5;
const voiceVol = () => settings.get("voiceVolume") ?? 0.35;
settings.on((k) => {
  if (k === "volume" && master) master.gain.value = muted ? 0 : vol();
  if (k === "voiceVolume" && voices) voices.gain.value = muted ? 0 : voiceVol();
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
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}
window.addEventListener("pointerdown", () => { init(); ctx?.resume?.(); }, { once: false });

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem("oi3d-muted", m ? "1" : "0"); } catch {}
  if (master) master.gain.value = m ? 0 : vol();
  if (voices) voices.gain.value = m ? 0 : voiceVol();
}

function env(node, t, a, peak, dur) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(peak, t + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function noise(t, dur, { freq = 1000, q = 1, type = "lowpass", peak = 0.6, attack = 0.005, sweepTo } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); env(g, t, attack, peak, dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
}
function tone(t, dur, { freq = 440, to, type = "sine", peak = 0.3, attack = 0.005 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain(); env(g, t, attack, peak, dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
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
  voice(line, v) {
    if (!init() || muted) return 0;
    const ns = notes(line, v);
    if (!ns.length) return 0;
    const t0 = ctx.currentTime + 0.03, end = ns.at(-1).t + ns.at(-1).dur;
    const vca = ctx.createGain(); vca.gain.value = 0; vca.connect(voices);
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
        s.connect(f).connect(g).connect(voices); s.start(t); s.stop(t + 0.07);
      }
    }
    for (const o of [sq, sw]) { o.start(t0); o.stop(t0 + end + 0.1); }
    sq.onended = () => vca.disconnect();
    return end + 0.03;
  },
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
  // Heat Purge Wave / Meltdown burst: a deep whoomp and a rolling roar.
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

// The battlefield idles: two detuned diesel oscillators through a low-pass,
// throbbing on a slow LFO. Very quiet, it's texture, not a soundtrack.
let amb = null;
export const ambience = {
  start() {
    if (!init() || amb) return;
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(master);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180; lp.connect(out);
    const oscs = [42, 43.3, 84.5].map((f, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? "triangle" : "sawtooth"; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = i === 2 ? 0.2 : 0.5; o.connect(g).connect(lp); o.start(); return o; });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 3.1; const lg = ctx.createGain(); lg.gain.value = 0.02; lfo.connect(lg).connect(out.gain); lfo.start();
    out.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 3);
    amb = { out, oscs, lfo };
  },
  stop() {
    if (!amb) return;
    const a = amb; amb = null;
    a.out.gain.cancelScheduledValues(ctx.currentTime);
    a.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    setTimeout(() => { a.oscs.forEach((o) => o.stop()); a.lfo.stop(); a.out.disconnect(); }, 1500);
  },
};
