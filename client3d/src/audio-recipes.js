// Sound recipes, kept apart from the Web Audio plumbing in audio.js so they can
// be exercised in node. A recipe is `(P, t, k)`: P is the synth kit
// ({ noise, tone, jit, rand }), t the start time, k one of six TAKES. Every
// sound has six audibly different takes (pitch, length, brightness, plus an
// echo tail / metal grit / double transient switched on per take), and the
// player never plays the same take twice in a row, so a Mini Gun burst or a long
// walk stops sounding like one sample on loop.

// p: pitch, d: length, b: filter brightness, tail: echo, grit: metal clinks,
// dbl: a flam (the transient fires twice).
export const TAKES = [
  { p: 1.00, d: 1.00, b: 1.00, tail: false, grit: false, dbl: false },
  { p: 0.88, d: 1.15, b: 0.85, tail: true, grit: false, dbl: false },
  { p: 1.12, d: 0.85, b: 1.20, tail: false, grit: true, dbl: false },
  { p: 0.94, d: 1.05, b: 1.10, tail: false, grit: true, dbl: true },
  { p: 1.06, d: 0.92, b: 0.90, tail: true, grit: false, dbl: true },
  { p: 0.80, d: 1.30, b: 0.75, tail: true, grit: true, dbl: false },
];

// A random take index for `key`, never the one it played last.
const lastTake = new Map();
export function pickTake(key, rand = Math.random) {
  const prev = lastTake.get(key);
  let i;
  if (prev === undefined) i = Math.floor(rand() * TAKES.length);
  else { i = Math.floor(rand() * (TAKES.length - 1)); if (i >= prev) i++; }
  lastTake.set(key, i);
  return i;
}

// ---- Shared flourishes a take can switch on ----
const tail = (P, t, k, freq = 900, peak = 0.08) => { if (k.tail) P.noise(t, 0.55 * k.d, { freq: freq * k.b, sweepTo: 120, peak, attack: 0.04 }); };
const grit = (P, t, k, n = 3, peak = 0.1) => { if (k.grit) for (let i = 0; i < n; i++) P.noise(t + 0.04 + i * 0.05 + P.rand() * 0.03, 0.025, { freq: P.jit(4200 * k.b, 0.3), type: "bandpass", q: 7, peak }); };
const flam = (k) => (k.dbl ? [0, 0.028] : [0]);
const clinks = (P, t, n, freq, peak = 0.2, gap = 0.06) => { for (let i = 0; i < n; i++) P.noise(t + i * gap + P.rand() * 0.02, 0.03, { freq: P.jit(freq, 0.25), type: "bandpass", q: 8, peak }); };
const zaps = (P, t, k, n, lo = 900, hi = 2000, peak = 0.12) => { for (let i = 0; i < n; i++) P.tone(t + i * 0.03, 0.05, { freq: P.jit(lo * k.p, 0.5), to: P.jit(hi * k.p, 0.5), type: "sawtooth", peak }); };
const swish = (P, t, k, peak = 0.25) => P.noise(t, 0.14 * k.d, { freq: 1600 * k.b, sweepTo: 420, type: "bandpass", q: 1, peak, attack: 0.04 });

// ---- Long-range weapons (one call per visual shot, so bursts stay short) ----
const LONG = {
  "Mini Gun": (P, t, k) => {
    P.noise(t, 0.05 * k.d, { freq: P.jit(3400 * k.b), type: "bandpass", q: 2, peak: 0.3 });
    P.tone(t, 0.04, { freq: P.jit(200 * k.p), to: 100, type: "square", peak: 0.1 });
    if (k.dbl) P.tone(t, 0.06, { freq: P.jit(1100 * k.p), to: 900, type: "sawtooth", peak: 0.03 }); // barrel whir
    grit(P, t, k, 1, 0.08);
  },
  "Double MG": (P, t, k) => {
    for (const d of flam(k)) P.noise(t + d, 0.06 * k.d, { freq: P.jit(2400 * k.b), type: "bandpass", q: 3, peak: 0.32 });
    P.tone(t, 0.06, { freq: P.jit(150 * k.p), to: 80, type: "square", peak: 0.12 });
    tail(P, t + 0.05, k, 1400, 0.05);
  },
  "Autocannon": (P, t, k) => {
    for (const d of flam(k)) P.noise(t + d, 0.3 * k.d, { freq: P.jit(1100 * k.b), sweepTo: 150, peak: 0.7 });
    P.tone(t, 0.28 * k.d, { freq: P.jit(130 * k.p), to: 45, type: "triangle", peak: 0.45 });
    grit(P, t + 0.15, k, 2, 0.12); // spent casing
    tail(P, t + 0.2, k);
  },
  "Arc Gun": (P, t, k) => {
    zaps(P, t, k, k.dbl ? 7 : 4, 1000, 2200, 0.11);
    P.noise(t, 0.22 * k.d, { freq: 4200 * k.b, type: "highpass", peak: 0.2 });
    if (k.tail) P.tone(t, 0.35 * k.d, { freq: 120 * k.p, type: "sawtooth", peak: 0.05 }); // coil hum
    grit(P, t, k, 3, 0.08);
  },
  "Mortar": (P, t, k) => {
    for (const d of flam(k)) P.tone(t + d, 0.3 * k.d, { freq: P.jit(150 * k.p), to: 55, type: "sine", peak: 0.6 });
    P.noise(t, 0.22 * k.d, { freq: 500 * k.b, peak: 0.4 });
    if (k.tail) P.tone(t + 0.15, 0.55, { freq: 1800 * k.p, to: 900, type: "sine", peak: 0.04 }); // shell whistle
    grit(P, t, k, 2);
  },
  "Sniper Cannon": (P, t, k) => {
    P.noise(t, 0.06, { freq: 5500 * k.b, type: "highpass", peak: 0.5 });
    P.tone(t, 0.35 * k.d, { freq: P.jit(2600 * k.p), to: 250, type: "sawtooth", peak: 0.16 });
    P.noise(t, 0.5 * k.d, { freq: 900 * k.b, sweepTo: 120, peak: 0.35 });
    P.noise(t + 0.25, 0.8 * k.d, { freq: 600 * k.b, sweepTo: 100, peak: 0.1, attack: 0.05 }); // the long echo off the hills
    if (k.tail) P.noise(t + 0.6, 0.9 * k.d, { freq: 450 * k.b, sweepTo: 90, peak: 0.05, attack: 0.08 });
    grit(P, t + 0.3, k, 2);
  },
  "Siege Maul": (P, t, k) => {
    for (const d of flam(k)) P.noise(t + d, 0.6 * k.d, { freq: P.jit(700 * k.b), sweepTo: 80, peak: 0.8 });
    P.tone(t, 0.5 * k.d, { freq: P.jit(90 * k.p), to: 30, type: "triangle", peak: 0.6 });
    grit(P, t + 0.1, k, 4, 0.12);
    tail(P, t + 0.3, k, 700, 0.1);
  },
  "Missile Barrage": (P, t, k) => {
    P.tone(t, 0.05, { freq: P.jit(240 * k.p), to: 120, type: "square", peak: 0.12 }); // ignition pop
    P.noise(t, 0.55 * k.d, { freq: 600 * k.b, sweepTo: 3200 * k.b, type: "bandpass", q: 3, peak: 0.28, attack: 0.06 });
    if (k.dbl) P.noise(t + 0.08, 0.4 * k.d, { freq: 900 * k.b, sweepTo: 2600 * k.b, type: "bandpass", q: 4, peak: 0.12, attack: 0.05 });
    tail(P, t + 0.3, k, 1200, 0.05);
  },
  "Harpoon": (P, t, k) => {
    P.noise(t, 0.1, { freq: 2000 * k.b, type: "bandpass", q: 4, peak: 0.32 });
    P.tone(t, 0.3 * k.d, { freq: P.jit(800 * k.p), to: 180, type: "triangle", peak: 0.2 });
    if (k.grit) clinks(P, t + 0.15, 5, 3000 * k.b, 0.12, 0.04); // cable paying out
    if (k.tail) P.tone(t + 0.05, 0.5, { freq: 330 * k.p, to: 300, type: "sine", peak: 0.05 }); // cable zing
  },
  "Rivet Gun": (P, t, k) => {
    P.noise(t, 0.04 * k.d, { freq: 3000 * k.b, type: "highpass", peak: 0.3 }); // air
    for (const d of flam(k)) P.noise(t + d, 0.05, { freq: P.jit(2600 * k.b), type: "bandpass", q: 6, peak: 0.4 });
    P.tone(t, 0.05, { freq: P.jit(1300 * k.p), type: "square", peak: 0.07 });
    grit(P, t, k, 1, 0.1);
  },
  "Crossbow": (P, t, k) => {
    P.noise(t, 0.06, { freq: 1600 * k.b, type: "bandpass", q: 3, peak: 0.35 });
    P.tone(t, 0.35 * k.d, { freq: P.jit(220 * k.p), to: 200, type: "triangle", peak: 0.16 }); // string
    P.tone(t, 0.25 * k.d, { freq: P.jit(440 * k.p), type: "sine", peak: 0.05 });
    if (k.grit) clinks(P, t + 0.2, 3, 2400 * k.b, 0.1, 0.05); // winch ratchet
    tail(P, t + 0.1, k, 1800, 0.04);
  },
  "Steam Cannon": (P, t, k) => {
    P.noise(t, 0.7 * k.d, { freq: 3500 * k.b, sweepTo: 1200, type: "highpass", peak: 0.45, attack: 0.02 });
    for (const d of flam(k)) P.tone(t + d, 0.25 * k.d, { freq: P.jit(90 * k.p), to: 45, type: "triangle", peak: 0.45 });
    if (k.tail) P.noise(t + 0.4, 0.8 * k.d, { freq: 6000 * k.b, sweepTo: 3000, type: "highpass", peak: 0.12, attack: 0.1 });
    grit(P, t + 0.2, k, 3, 0.08); // valve rattle
  },
  "Flare Launcher": (P, t, k) => {
    P.tone(t, 0.08, { freq: P.jit(300 * k.p), to: 120, type: "square", peak: 0.2 });
    P.noise(t + 0.05, 0.6 * k.d, { freq: 5000 * k.b, type: "highpass", peak: 0.18, attack: 0.05 });
    if (k.grit) for (let i = 0; i < 6; i++) P.noise(t + 0.15 + P.rand() * 0.5, 0.02, { freq: P.jit(6000, 0.3), type: "highpass", peak: 0.1 }); // fizzle
    if (k.tail) P.tone(t + 0.1, 0.6, { freq: 900 * k.p, to: 1500 * k.p, type: "sine", peak: 0.03 }); // arcing up
  },
  "Tesla Coil": (P, t, k) => {
    P.tone(t, 0.18, { freq: 300 * k.p, to: 2400 * k.p, type: "sine", peak: 0.06 }); // charge
    zaps(P, t + 0.15, k, k.dbl ? 8 : 5, 800, 2400, 0.12);
    P.noise(t + 0.15, 0.3 * k.d, { freq: 3800 * k.b, type: "highpass", peak: 0.22 });
    P.tone(t + 0.15, 0.4 * k.d, { freq: 60 * k.p, type: "sawtooth", peak: 0.05 });
    tail(P, t + 0.35, k, 4000, 0.04);
  },
  // Support-unit guns.
  "Tank Cannon": (P, t, k) => {
    P.noise(t, 0.7 * k.d, { freq: P.jit(800 * k.b), sweepTo: 70, peak: 0.85 });
    P.tone(t, 0.55 * k.d, { freq: P.jit(75 * k.p), to: 28, type: "sine", peak: 0.7 });
    for (const d of flam(k)) P.noise(t + d, 0.05, { freq: 3000 * k.b, type: "highpass", peak: 0.3 });
    grit(P, t + 0.3, k, 3, 0.12); // breech clank
    tail(P, t + 0.35, k, 600, 0.1);
  },
  "Autocannon Mount": (P, t, k) => {
    P.noise(t, 0.25 * k.d, { freq: P.jit(1300 * k.b), sweepTo: 180, peak: 0.6 });
    P.tone(t, 0.22 * k.d, { freq: P.jit(150 * k.p), to: 55, type: "triangle", peak: 0.4 });
    for (const d of flam(k)) P.tone(t + d, 0.03, { freq: 900 * k.p, type: "square", peak: 0.05 });
    grit(P, t + 0.12, k, 2);
    tail(P, t + 0.15, k);
  },
  "Coaxial MG": (P, t, k) => {
    P.noise(t, 0.045 * k.d, { freq: P.jit(2900 * k.b), type: "bandpass", q: 2.5, peak: 0.28 });
    P.tone(t, 0.045, { freq: P.jit(170 * k.p), to: 95, type: "square", peak: 0.1 });
    if (k.dbl) P.noise(t + 0.025, 0.03, { freq: 2200 * k.b, type: "bandpass", q: 3, peak: 0.15 });
    grit(P, t, k, 1, 0.07);
  },
  "Rocket Pod": (P, t, k) => {
    P.noise(t, 0.04, { freq: 1500 * k.b, type: "bandpass", q: 2, peak: 0.3 });
    P.noise(t + 0.02, 0.45 * k.d, { freq: 800 * k.b, sweepTo: 2600 * k.b, type: "bandpass", q: 2, peak: 0.25, attack: 0.04 });
    if (k.dbl) P.tone(t, 0.4 * k.d, { freq: 400 * k.p, to: 1200 * k.p, type: "sawtooth", peak: 0.03 });
    tail(P, t + 0.25, k, 1000, 0.05);
  },
  "Sidearm": (P, t, k) => {
    for (const d of flam(k)) P.noise(t + d, 0.05, { freq: P.jit(2000 * k.b), type: "bandpass", q: 2, peak: 0.28 });
    P.tone(t, 0.05, { freq: P.jit(260 * k.p), to: 130, type: "square", peak: 0.08 });
    tail(P, t + 0.05, k, 1600, 0.04);
    grit(P, t + 0.1, k, 1, 0.08);
  },
  "Drone Carbine": (P, t, k) => {
    P.noise(t, 0.04 * k.d, { freq: P.jit(4200 * k.b), type: "bandpass", q: 3, peak: 0.22 });
    P.tone(t, 0.05, { freq: P.jit(640 * k.p), to: 320, type: "square", peak: 0.06 });
    if (k.dbl) P.tone(t, 0.05, { freq: 1800 * k.p, to: 1200, type: "sine", peak: 0.04 }); // servo tick
    grit(P, t, k, 1, 0.06);
  },
};

// ---- Melee: the wind-up at t, the strike ~0.25s later (the director waits
// ~0.38s before showing the impact) ----
const MELEE = {
  "Sword": (P, t, k) => {
    swish(P, t, k, 0.3);
    if (k.dbl) swish(P, t + 0.1, k, 0.15);
    P.noise(t + 0.25, 0.12, { freq: 3200 * k.b, type: "highpass", peak: 0.35 });
    P.tone(t + 0.25, 0.5 * k.d, { freq: P.jit(1400 * k.p), to: 1350 * k.p, type: "sine", peak: 0.09 }); // blade ring
    grit(P, t + 0.27, k, 3);
  },
  "Circular Saw": (P, t, k) => {
    P.tone(t, 0.45 * k.d, { freq: 1800 * k.p, to: 2400 * k.p, type: "sawtooth", peak: 0.06 });
    P.noise(t + 0.15, 0.4 * k.d, { freq: 3600 * k.b, type: "bandpass", q: 2, peak: 0.2, attack: 0.03 });
    clinks(P, t + 0.2, k.grit ? 6 : 3, 5000 * k.b, 0.1, 0.035); // sparks off plate
    tail(P, t + 0.5, k, 2000, 0.05);
  },
  "Chainsaw": (P, t, k) => {
    for (let i = 0; i < (k.dbl ? 14 : 10); i++) P.tone(t + i * 0.035, 0.03, { freq: P.jit(70 * k.p, 0.1), type: "square", peak: 0.15 });
    P.noise(t + 0.1, 0.45 * k.d, { freq: 1400 * k.b, type: "bandpass", q: 1.5, peak: 0.22, attack: 0.03 });
    grit(P, t + 0.25, k, 4, 0.1);
    tail(P, t + 0.4, k, 700, 0.05);
  },
  "Claw": (P, t, k) => {
    swish(P, t, k, 0.2);
    for (const d of flam(k)) P.noise(t + 0.22 + d, 0.15 * k.d, { freq: 1200 * k.b, type: "bandpass", q: 2, peak: 0.45 });
    P.tone(t + 0.22, 0.2 * k.d, { freq: P.jit(180 * k.p), to: 60, type: "square", peak: 0.25 });
    grit(P, t + 0.25, k, 3);
  },
  "Lance": (P, t, k) => {
    P.noise(t, 0.18 * k.d, { freq: 800 * k.b, sweepTo: 2800 * k.b, type: "bandpass", q: 1.5, peak: 0.25, attack: 0.1 });
    P.tone(t + 0.22, 0.25 * k.d, { freq: P.jit(300 * k.p), to: 80, type: "triangle", peak: 0.3 });
    P.noise(t + 0.22, 0.1, { freq: 3500 * k.b, type: "highpass", peak: 0.3 });
    if (k.tail) P.tone(t + 0.22, 0.6, { freq: 520 * k.p, to: 500 * k.p, type: "sine", peak: 0.05 });
    grit(P, t + 0.25, k, 2);
  },
  "Wrecking Ball": (P, t, k) => {
    clinks(P, t, k.grit ? 8 : 5, 3200 * k.b, 0.15, 0.045); // chain paying out
    P.tone(t + 0.3, 0.6 * k.d, { freq: P.jit(60 * k.p), to: 28, type: "sine", peak: 0.8 });
    P.noise(t + 0.3, 0.5 * k.d, { freq: 600 * k.b, sweepTo: 80, peak: 0.7 });
    if (k.dbl) P.tone(t + 0.3, 0.3, { freq: 140 * k.p, to: 60, type: "square", peak: 0.2 });
    tail(P, t + 0.5, k, 500, 0.1);
  },
  "Bulwark Shield": (P, t, k) => {
    P.noise(t, 0.12, { freq: 700 * k.b, sweepTo: 300, peak: 0.15, attack: 0.05 });
    for (const d of flam(k)) P.noise(t + 0.15 + d, 0.2 * k.d, { freq: 900 * k.b, type: "bandpass", q: 1, peak: 0.5 });
    P.tone(t + 0.15, 0.3 * k.d, { freq: P.jit(110 * k.p), to: 50, type: "square", peak: 0.35 });
    P.tone(t + 0.15, 0.6 * k.d, { freq: P.jit(620 * k.p), to: 600 * k.p, type: "sine", peak: 0.08 }); // plate clang
    grit(P, t + 0.2, k, 3);
  },
  "Flamethrower": (P, t, k) => {
    P.tone(t, 0.06, { freq: P.jit(180 * k.p), to: 90, type: "square", peak: 0.12 }); // igniter pop
    P.noise(t, 0.9 * k.d, { freq: 700 * k.b, type: "bandpass", q: 0.7, peak: 0.45, attack: 0.1 });
    if (k.dbl) P.noise(t + 0.1, 0.7 * k.d, { freq: 250 * k.b, peak: 0.3, attack: 0.1 }); // roar
    if (k.grit) for (let i = 0; i < 8; i++) P.noise(t + 0.15 + P.rand() * 0.6, 0.02, { freq: P.jit(3000, 0.3), type: "bandpass", q: 4, peak: 0.12 }); // crackle
    tail(P, t + 0.6, k, 500, 0.08);
  },
  "Anchor": (P, t, k) => {
    clinks(P, t, k.grit ? 7 : 4, 2600 * k.b, 0.18, 0.05);
    for (const d of flam(k)) P.tone(t + 0.3 + d, 0.35 * k.d, { freq: P.jit(140 * k.p), to: 55, type: "square", peak: 0.35 });
    P.tone(t + 0.3, 0.7 * k.d, { freq: P.jit(380 * k.p), to: 360 * k.p, type: "sine", peak: 0.07 });
    tail(P, t + 0.4, k, 600);
  },
  "Pressure Claw": (P, t, k) => {
    P.noise(t, 0.3 * k.d, { freq: 4500 * k.b, sweepTo: 2000, type: "highpass", peak: 0.2 }); // hydraulics
    for (const d of flam(k)) P.noise(t + 0.25 + d, 0.2 * k.d, { freq: 1000 * k.b, type: "bandpass", q: 2, peak: 0.5 });
    P.tone(t + 0.25, 0.3 * k.d, { freq: P.jit(120 * k.p), to: 50, type: "square", peak: 0.3 });
    grit(P, t + 0.3, k, 4, 0.12); // plate crumpling
    if (k.tail) P.noise(t + 0.5, 0.4, { freq: 5000 * k.b, sweepTo: 2500, type: "highpass", peak: 0.08 }); // release
  },
  "Talon": (P, t, k) => {
    swish(P, t, k, 0.18);
    P.tone(t + 0.15, 0.25 * k.d, { freq: 2200 * k.p, to: 1400 * k.p, type: "sawtooth", peak: 0.07 }); // screech on plate
    P.noise(t + 0.15, 0.2 * k.d, { freq: 3000 * k.b, type: "bandpass", q: 5, peak: 0.25 });
    for (const d of flam(k)) P.tone(t + 0.25 + d, 0.15, { freq: P.jit(400 * k.p), to: 120, type: "triangle", peak: 0.25 });
    grit(P, t + 0.2, k, 2);
  },
  "Piston Hammer": (P, t, k) => {
    P.noise(t, 0.25 * k.d, { freq: 5000 * k.b, type: "highpass", peak: 0.25, attack: 0.02 }); // steam charge
    P.tone(t + 0.28, 0.45 * k.d, { freq: P.jit(70 * k.p), to: 30, type: "sine", peak: 0.7 });
    for (const d of flam(k)) P.noise(t + 0.28 + d, 0.3 * k.d, { freq: 1500 * k.b, sweepTo: 150, peak: 0.6 });
    grit(P, t + 0.3, k, 3, 0.12);
    if (k.tail) P.noise(t + 0.5, 0.6, { freq: 6000 * k.b, sweepTo: 3000, type: "highpass", peak: 0.1 }); // exhaust
  },
  "Bayonet": (P, t, k) => {
    P.noise(t, 0.1 * k.d, { freq: 1200 * k.b, sweepTo: 3000 * k.b, type: "bandpass", q: 1.5, peak: 0.22, attack: 0.03 });
    for (const d of flam(k)) P.noise(t + 0.18 + d, 0.06, { freq: 4000 * k.b, type: "highpass", peak: 0.3 });
    P.tone(t + 0.18, 0.12 * k.d, { freq: P.jit(900 * k.p), to: 300, type: "triangle", peak: 0.1 });
    grit(P, t + 0.2, k, 2);
    tail(P, t + 0.22, k, 1500, 0.04);
  },
  "Shock Glove": (P, t, k) => {
    swish(P, t, k, 0.15);
    P.tone(t + 0.2, 0.2 * k.d, { freq: P.jit(150 * k.p), to: 60, type: "square", peak: 0.3 });
    zaps(P, t + 0.2, k, k.dbl ? 6 : 4, 1100, 2600, 0.1);
    P.noise(t + 0.2, 0.2 * k.d, { freq: 4000 * k.b, type: "highpass", peak: 0.2 });
    if (k.tail) P.tone(t + 0.25, 0.35, { freq: 100 * k.p, type: "sawtooth", peak: 0.05 });
  },
  // Support-unit melee.
  "Dozer Blade": (P, t, k) => {
    P.noise(t, 0.35 * k.d, { freq: 400 * k.b, sweepTo: 900 * k.b, peak: 0.3, attack: 0.08 }); // blade scraping dirt
    P.tone(t + 0.25, 0.35 * k.d, { freq: P.jit(95 * k.p), to: 40, type: "square", peak: 0.35 });
    P.noise(t + 0.25, 0.2, { freq: 1100 * k.b, type: "bandpass", q: 1, peak: 0.4 });
    grit(P, t + 0.3, k, 4);
  },
  "Ram Spike": (P, t, k) => {
    P.noise(t, 0.2 * k.d, { freq: 300 * k.b, sweepTo: 1200 * k.b, peak: 0.25, attack: 0.12 }); // engine surge
    for (const d of flam(k)) P.noise(t + 0.24 + d, 0.12, { freq: 2600 * k.b, type: "bandpass", q: 3, peak: 0.45 });
    P.tone(t + 0.24, 0.3 * k.d, { freq: P.jit(160 * k.p), to: 50, type: "triangle", peak: 0.4 });
    tail(P, t + 0.3, k, 700);
  },
  "Demo Charge": (P, t, k) => {
    for (let i = 0; i < 3; i++) P.tone(t + i * 0.07, 0.04, { freq: 1600 * k.p, type: "square", peak: 0.06 }); // arming beeps
    P.tone(t + 0.25, 0.6 * k.d, { freq: P.jit(80 * k.p), to: 25, type: "sine", peak: 0.8 });
    P.noise(t + 0.25, 0.8 * k.d, { freq: 1200 * k.b, sweepTo: 60, peak: 0.9 });
    grit(P, t + 0.4, k, 4, 0.12);
  },
};

// Fallbacks by projectile kind, for any gun without its own voice.
const KIND = {
  bullet: LONG["Double MG"], cannon: LONG["Autocannon"], missile: LONG["Missile Barrage"], lob: LONG["Mortar"],
  rail: LONG["Sniper Cannon"], arc: LONG["Arc Gun"], harpoon: LONG["Harpoon"], bolt: LONG["Crossbow"],
  rivet: LONG["Rivet Gun"], steam: LONG["Steam Cannon"], flare: LONG["Flare Launcher"], flame: MELEE["Flamethrower"],
  default: (P, t, k) => { P.noise(t, 0.08 * k.d, { freq: 2000 * k.b, peak: 0.3 }); tail(P, t + 0.05, k); },
};

export const WEAPON_SFX = { ...LONG, ...MELEE };
export const shotRecipe = (weapon, kind) => LONG[weapon] || KIND[kind] || KIND.default;
export const swingRecipe = (weapon, heavy) => MELEE[weapon] || (heavy ? CORE.meleeHeavy : CORE.melee);
export const KIND_SFX = KIND;

// ---- Everything else that repeats a lot ----
export const CORE = {
  melee: (P, t, k) => {
    swish(P, t, k);
    P.tone(t + 0.25, 0.25 * k.d, { freq: P.jit(160 * k.p), to: 40, type: "square", peak: 0.35 });
    for (const d of flam(k)) P.noise(t + 0.25 + d, 0.2, { freq: 3000 * k.b, type: "highpass", peak: 0.4 });
    grit(P, t + 0.3, k);
  },
  meleeHeavy: (P, t, k) => {
    swish(P, t, k);
    P.tone(t + 0.25, 0.4 * k.d, { freq: P.jit(90 * k.p), to: 35, type: "square", peak: 0.35 });
    for (const d of flam(k)) P.noise(t + 0.25 + d, 0.2, { freq: 2600 * k.b, type: "highpass", peak: 0.4 });
    grit(P, t + 0.3, k);
    tail(P, t + 0.35, k);
  },
  // `sp` rides on the take: a bigger bite is louder and longer.
  hit: (P, t, k, sp = 1) => {
    if (sp <= 0) { P.tone(t, 0.08 * k.d, { freq: P.jit(2200 * k.p), type: "sine", peak: 0.08 }); if (k.dbl) P.tone(t + 0.04, 0.06, { freq: 2900 * k.p, type: "sine", peak: 0.04 }); return; }
    for (const d of flam(k)) P.noise(t + d, (0.15 + sp * 0.03) * k.d, { freq: 2500 * k.b, sweepTo: 600, type: "bandpass", q: 2, peak: Math.min(0.8, 0.3 + sp * 0.08) });
    P.tone(t, 0.2 * k.d, { freq: P.jit(300 * k.p), to: 120, type: "square", peak: 0.12 });
    grit(P, t + 0.05, k, 2 + Math.min(4, sp), 0.12); // shrapnel off the plate
    if (k.tail) P.tone(t, 0.4, { freq: P.jit(700 * k.p), to: 650 * k.p, type: "sine", peak: 0.05 });
  },
  explosion: (P, t, k, big = false) => {
    const L = (big ? 1.8 : 0.9) * k.d;
    P.noise(t, L, { freq: 1200 * k.b, sweepTo: 60, peak: 1, attack: 0.01 });
    P.tone(t, (big ? 1.2 : 0.6) * k.d, { freq: 70 * k.p, to: 25, type: "sine", peak: 0.9 });
    if (k.dbl) P.noise(t + 0.12, L * 0.7, { freq: 800 * k.b, sweepTo: 50, peak: 0.6 }); // secondary cook-off
    grit(P, t + 0.2, k, big ? 6 : 3, 0.15); // debris raining down
    if (k.tail) P.noise(t + L * 0.6, L, { freq: 400 * k.b, sweepTo: 60, peak: 0.15, attack: 0.1 }); // rumble rolling off
  },
  land: (P, t, k) => {
    for (const d of flam(k)) P.tone(t + d, 0.25 * k.d, { freq: P.jit(80 * k.p), to: 35, type: "triangle", peak: 0.45 });
    P.noise(t, 0.3 * k.d, { freq: 700 * k.b, sweepTo: 150, peak: 0.35 });
    grit(P, t + 0.05, k, 3);
    if (k.tail) P.noise(t + 0.1, 0.5, { freq: 4000 * k.b, sweepTo: 1500, type: "highpass", peak: 0.08 }); // leg dampers venting
  },
  clank: (P, t, k) => {
    const hits = k.dbl ? [0, 0.1, 0.2] : [0, 0.12];
    for (const d of hits) { P.tone(t + d, 0.18 * k.d, { freq: P.jit(180 * k.p), to: 70, type: "square", peak: 0.25 }); P.noise(t + d, 0.08, { freq: 2600 * k.b, type: "bandpass", q: 4, peak: 0.35 }); }
    P.tone(t + hits.at(-1), 0.7 * k.d, { freq: P.jit(760 * k.p), to: 720 * k.p, type: "sine", peak: 0.08 });
    grit(P, t + 0.15, k);
  },
  breakPart: (P, t, k) => {
    P.noise(t, 0.5 * k.d, { freq: 3000 * k.b, sweepTo: 300, type: "bandpass", q: 3, peak: 0.6, attack: 0.01 });
    P.tone(t + 0.05, 0.5 * k.d, { freq: P.jit(140 * k.p), to: 35, type: "square", peak: 0.35 });
    for (const d of flam(k)) P.tone(t + 0.3 + d, 0.2, { freq: P.jit(90 * k.p), to: 50, type: "triangle", peak: 0.3 });
    grit(P, t + 0.35, k, 5, 0.14); // bolts pinging off
    if (k.tail) P.noise(t + 0.2, 0.8, { freq: 5000 * k.b, sweepTo: 2000, type: "highpass", peak: 0.1 }); // ruptured line hissing
  },
};

// ---- Per-chassis feet and servos ----
// f: thump pitch, w: thump weight, c: foot-plate click, sv: servo whine range,
// wave: servo timbre, layer: what this body adds on top of every footfall.
const FOOT = {
  "light-claw-autocannon": { f: 115, w: 0.2, c: 1900, sv: [320, 560], wave: "sawtooth", layer: "scrape" },
  "light-missile-flamethrower": { f: 120, w: 0.18, c: 1700, sv: [280, 500], wave: "sawtooth", layer: "slosh" },
  "light-saw-minigun": { f: 110, w: 0.2, c: 2100, sv: [360, 640], wave: "sawtooth", layer: "rattle" },
  "light-wreckingball-double": { f: 100, w: 0.24, c: 1800, sv: [260, 460], wave: "square", layer: "chain" },
  "light-sword-arc": { f: 125, w: 0.17, c: 2300, sv: [400, 720], wave: "triangle", layer: "crackle" },
  "light-harpoon-anchor": { f: 105, w: 0.23, c: 1600, sv: [240, 440], wave: "square", layer: "chain" },
  "light-rivet-pressureclaw": { f: 112, w: 0.21, c: 2000, sv: [300, 540], wave: "sawtooth", layer: "hiss" },
  "medium-lance-mortar": { f: 72, w: 0.34, c: 1500, sv: [200, 360], wave: "sawtooth", layer: "clang" },
  "medium-shield-siege": { f: 62, w: 0.4, c: 1300, sv: [170, 300], wave: "square", layer: "clang" },
  "medium-sniper-chainsaw": { f: 78, w: 0.32, c: 1700, sv: [220, 400], wave: "sawtooth", layer: "rattle" },
  "medium-crossbow-talon": { f: 85, w: 0.28, c: 2400, sv: [260, 480], wave: "triangle", layer: "scrape" },
  "medium-steam-piston": { f: 68, w: 0.36, c: 1400, sv: [180, 320], wave: "sawtooth", layer: "hiss" },
  "medium-flare-bayonet": { f: 80, w: 0.3, c: 1800, sv: [230, 420], wave: "sawtooth", layer: "slosh" },
  "medium-tesla-shockglove": { f: 74, w: 0.33, c: 1600, sv: [210, 380], wave: "triangle", layer: "crackle" },
  // Support bodies and the generic fallbacks.
  tank: { f: 55, w: 0.25, c: 1200, sv: [120, 200], wave: "sawtooth", layer: "tread" },
  walker: { f: 65, w: 0.36, c: 1300, sv: [160, 280], wave: "square", layer: "clang" },
  drone: { f: 160, w: 0.1, c: 2600, sv: [500, 900], wave: "triangle", layer: "whir" },
  light: { f: 110, w: 0.2, c: 1800, sv: [300, 520], wave: "sawtooth", layer: null },
  medium: { f: 70, w: 0.35, c: 1600, sv: [200, 360], wave: "sawtooth", layer: null },
};
export const FOOT_PROFILES = FOOT;
export const footFor = (chassisId, fallback = "light") => FOOT[chassisId] || FOOT[fallback] || FOOT.light;

const LAYER = {
  hiss: (P, t, k) => P.noise(t + 0.03, 0.25 * k.d, { freq: 5000 * k.b, sweepTo: 2500, type: "highpass", peak: 0.07 }),
  crackle: (P, t, k) => { for (let i = 0; i < 3; i++) P.noise(t + i * 0.03 + P.rand() * 0.02, 0.015, { freq: P.jit(5000, 0.3), type: "highpass", peak: 0.06 }); },
  chain: (P, t, k) => clinks(P, t + 0.04, 3, 3200 * k.b, 0.06, 0.04),
  scrape: (P, t, k) => P.noise(t + 0.02, 0.08 * k.d, { freq: 3000 * k.b, type: "bandpass", q: 6, peak: 0.06 }),
  clang: (P, t, k) => P.tone(t, 0.3 * k.d, { freq: P.jit(420 * k.p), to: 400 * k.p, type: "sine", peak: 0.05 }),
  rattle: (P, t, k) => clinks(P, t + 0.03, 2, 2200 * k.b, 0.07, 0.03),
  slosh: (P, t, k) => P.noise(t + 0.04, 0.15 * k.d, { freq: 500 * k.b, sweepTo: 900 * k.b, type: "bandpass", q: 3, peak: 0.07 }),
  tread: (P, t, k) => clinks(P, t, 4, 1500 * k.b, 0.08, 0.03),
  whir: (P, t, k) => P.tone(t, 0.12, { freq: 900 * k.p, to: 1100 * k.p, type: "sine", peak: 0.03 }),
};

export const stepRecipe = (P, t, k, foot) => {
  P.tone(t, 0.12 * k.d, { freq: P.jit(foot.f * k.p, 0.15), to: 40, type: "triangle", peak: foot.w });
  for (const d of flam(k)) P.noise(t + d, 0.05, { freq: P.jit(foot.c * k.b, 0.3), type: "bandpass", q: 5, peak: 0.08 });
  if (foot.layer) LAYER[foot.layer](P, t, k);
  grit(P, t, k, 1, 0.05); // loose gravel
  if (k.tail) P.noise(t + 0.02, 0.18, { freq: 500 * k.b, sweepTo: 150, peak: 0.05 }); // dust settling
};

export const servoRecipe = (P, t, k, foot) => {
  const [a, b] = foot.sv;
  P.tone(t, 0.25 * k.d, { freq: P.jit(a * k.p), to: P.jit(b * k.p), type: foot.wave, peak: 0.05 });
  if (k.dbl) P.tone(t + 0.12, 0.2 * k.d, { freq: b * k.p, to: a * k.p, type: foot.wave, peak: 0.03 }); // settle back
  if (k.grit) P.noise(t + 0.2, 0.03, { freq: foot.c * k.b, type: "bandpass", q: 6, peak: 0.05 }); // gear seat
  if (k.tail && foot.layer === "hiss") LAYER.hiss(P, t + 0.1, k);
};
