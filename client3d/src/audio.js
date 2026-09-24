// Synthesized sound — no asset files. Every effect is a few oscillators and a
// noise buffer through envelopes: cannon thumps, minigun rattles, missile
// whooshes, arc-gun zaps, clanky footsteps, overheat klaxons, a victory fanfare.
// Lazily unlocked on the first user gesture (browsers block audio before one).
import { settings } from "./settings.js";
let ctx = null, master = null, noiseBuf = null;
const vol = () => settings.get("volume") ?? 0.5;
settings.on((k) => { if (k === "volume" && master) master.gain.value = muted ? 0 : vol(); });
let muted = (() => { try { return localStorage.getItem("oi3d-muted") === "1"; } catch { return false; } })();
let lastStep = 0;

function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : vol(); master.connect(ctx.destination);
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

export const sfx = {
  shot(kind) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    switch (kind) {
      case "bullet": noise(t, 0.07, { freq: jit(3000), type: "bandpass", q: 2, peak: 0.35 }); tone(t, 0.05, { freq: jit(180), to: 90, type: "square", peak: 0.1 }); break;
      case "cannon": noise(t, 0.35, { freq: jit(900), sweepTo: 120, peak: 0.8 }); tone(t, 0.3, { freq: jit(110), to: 40, type: "triangle", peak: 0.5 }); break;
      case "missile": noise(t, 0.6, { freq: 600, sweepTo: 3000, type: "bandpass", q: 3, peak: 0.3, attack: 0.08 }); break;
      case "lob": tone(t, 0.25, { freq: jit(160), to: 60, type: "sine", peak: 0.6 }); noise(t, 0.2, { freq: 500, peak: 0.4 }); break;
      case "rail": tone(t, 0.4, { freq: 2400, to: 300, type: "sawtooth", peak: 0.18 }); noise(t, 0.15, { freq: 5000, type: "highpass", peak: 0.3 }); break;
      case "arc": for (let i = 0; i < 5; i++) tone(t + i * 0.03, 0.05, { freq: jit(900, 0.5), to: jit(2000, 0.5), type: "sawtooth", peak: 0.12 }); noise(t, 0.25, { freq: 4000, type: "highpass", peak: 0.2 }); break;
      case "harpoon": case "bolt": noise(t, 0.12, { freq: 2000, type: "bandpass", q: 4, peak: 0.3 }); tone(t, 0.25, { freq: 700, to: 200, type: "triangle", peak: 0.2 }); break;
      case "rivet": noise(t, 0.05, { freq: 2500, type: "bandpass", q: 6, peak: 0.4 }); tone(t, 0.06, { freq: 1200, type: "square", peak: 0.08 }); break;
      case "flame": noise(t, 0.9, { freq: 700, type: "bandpass", q: 0.7, peak: 0.45, attack: 0.1 }); break;
      default: noise(t, 0.08, { freq: 2000, peak: 0.3 });
    }
  },
  melee(heavy = false) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    noise(t, 0.12, { freq: 1500, sweepTo: 400, type: "bandpass", q: 1, peak: 0.25, attack: 0.04 });
    tone(t + 0.25, heavy ? 0.4 : 0.25, { freq: jit(heavy ? 90 : 160), to: 40, type: "square", peak: 0.35 });
    noise(t + 0.25, 0.2, { freq: 3000, type: "highpass", peak: 0.4 });
  },
  hit(sp) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    if (sp <= 0) { tone(t, 0.08, { freq: jit(2200), type: "sine", peak: 0.08 }); return; }
    noise(t, 0.15 + sp * 0.03, { freq: 2500, sweepTo: 600, type: "bandpass", q: 2, peak: Math.min(0.8, 0.3 + sp * 0.08) });
    tone(t, 0.2, { freq: jit(300), to: 120, type: "square", peak: 0.12 });
  },
  explosion(big = false) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    noise(t, big ? 1.8 : 0.9, { freq: 1200, sweepTo: 60, peak: 1, attack: 0.01 });
    tone(t, big ? 1.2 : 0.6, { freq: 70, to: 25, type: "sine", peak: 0.9 });
  },
  step(heavy) {
    if (!init() || muted) return;
    const now = performance.now(); if (now - lastStep < 110) return; lastStep = now;
    const t = ctx.currentTime;
    tone(t, 0.12, { freq: jit(heavy ? 70 : 110, 0.15), to: 40, type: "triangle", peak: heavy ? 0.35 : 0.2 });
    noise(t, 0.05, { freq: jit(1800, 0.3), type: "bandpass", q: 5, peak: 0.08 });
  },
  servo() { if (!init() || muted) return; tone(ctx.currentTime, 0.25, { freq: jit(300), to: jit(520), type: "sawtooth", peak: 0.05 }); },
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
  bark() { if (!init() || muted) return; const t = ctx.currentTime; for (let i = 0; i < 3; i++) tone(t + i * 0.06, 0.05, { freq: jit(500, 0.4), type: "square", peak: 0.04 }); },
  thrusters() { if (!init() || muted) return; noise(ctx.currentTime, 1.6, { freq: 400, sweepTo: 1500, type: "bandpass", q: 1, peak: 0.35, attack: 0.3 }); },
  fanfare(win) {
    if (!init() || muted) return;
    const t = ctx.currentTime;
    const seq = win ? [[523, 0], [659, 0.15], [784, 0.3], [1047, 0.45], [784, 0.7], [1047, 0.85]] : [[392, 0], [349, 0.3], [311, 0.6], [262, 0.9]];
    for (const [f, d] of seq) { tone(t + d, win ? 0.3 : 0.45, { freq: f, type: "triangle", peak: 0.2 }); tone(t + d, win ? 0.3 : 0.45, { freq: f / 2, type: "square", peak: 0.05 }); }
  },
};
