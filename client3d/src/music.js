// The gramophone: plays music-score.js songs on industrial timbres (bowed
// metal, a reed organ, a detuned upright, pipe clanks for drums) through a
// worn-record chain: a narrow horn band, wow and flutter, crackle and pops.
// Menu/lobby track and a quieter, tenser battle track. During battle the set
// drifts off the station into static as the player's rig runs hot (setHeat).
// Nothing starts before the first click or key press.
import { audioCore, onUnlock, isMuted } from "./audio.js";
import { settings } from "./settings.js";
import { compose, styleFor, radioTuning } from "./music-score.js";

const LEVEL = { menu: 1, battle: 0.5 };
const LOOKAHEAD = 1.0, TICK_MS = 200, GAP = 2.2;

let core = null, chain = null, want = null, cur = null, timer = null, seed = Math.floor(Math.random() * 1e6);

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// Crackle: a looping few seconds of sparse clicks and the odd louder pop.
function crackleBuffer(ctx) {
  const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const r = Math.random();
    if (r < 0.0009) d[i] = (Math.random() - 0.5) * 0.6;
    else if (r < 0.00095) for (let j = 0; j < 40 && i + j < d.length; j++) d[i + j] = (Math.random() - 0.5) * (1 - j / 40);
    else d[i] = (Math.random() - 0.5) * 0.015;
  }
  return b;
}

// The record player, built once: input -> horn band -> valve -> out, with a
// shared pitch-wobble bus every note's detune listens to.
function buildChain() {
  const { ctx, loopBuf } = core;
  const input = ctx.createGain();
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 240;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3500;
  const horn = ctx.createBiquadFilter(); horn.type = "peaking"; horn.frequency.value = 1100; horn.Q.value = 1.2; horn.gain.value = 4;
  const valve = ctx.createWaveShaper();
  const c = new Float32Array(512); for (let i = 0; i < c.length; i++) { const x = (i / 511) * 2 - 1; c[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
  valve.curve = c;
  const clean = ctx.createGain(); clean.gain.value = 1;
  input.connect(hp).connect(lp).connect(horn).connect(valve).connect(clean).connect(core.music);
  // Wow (slow platter wobble) + flutter (fast) + a tuning offset, in cents.
  const wobble = ctx.createGain(); wobble.gain.value = 1;
  const wow = ctx.createOscillator(); wow.frequency.value = 0.55; const wowG = ctx.createGain(); wowG.gain.value = 6; wow.connect(wowG).connect(wobble);
  const flut = ctx.createOscillator(); flut.frequency.value = 6.8; const flutG = ctx.createGain(); flutG.gain.value = 2.5; flut.connect(flutG).connect(wobble);
  const tune = ctx.createConstantSource(); tune.offset.value = 0; tune.connect(wobble);
  // Surface noise, and the static a hot boiler tunes in.
  const cr = ctx.createBufferSource(); cr.buffer = crackleBuffer(ctx); cr.loop = true;
  const crF = ctx.createBiquadFilter(); crF.type = "highpass"; crF.frequency.value = 900;
  const crG = ctx.createGain(); crG.gain.value = 0.0001; cr.connect(crF).connect(crG).connect(core.music);
  const st = ctx.createBufferSource(); st.buffer = loopBuf; st.loop = true;
  const stF = ctx.createBiquadFilter(); stF.type = "bandpass"; stF.frequency.value = 1800; stF.Q.value = 0.6;
  const stG = ctx.createGain(); stG.gain.value = 0; st.connect(stF).connect(stG).connect(core.music);
  for (const s of [wow, flut, tune, cr, st]) s.start();
  return { input, clean, wobble, wowG, tune, crG, stG };
}

// One oscillator into `dest` on the pitch-wobble bus; cleaned up when done.
function osc(t, end, type, freq, dest) {
  const o = core.ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  chain.wobble.connect(o.detune);
  o.connect(dest); o.start(t); o.stop(end);
  o.onended = () => { try { chain.wobble.disconnect(o.detune); } catch {} o.disconnect(); };
  return o;
}
function envGain(t, a, peak, hold, rel, dest) {
  const g = core.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  g.connect(dest);
  return g;
}
function burst(t, dur, { type = "bandpass", freq = 1000, q = 1, peak = 0.1 }, dest) {
  const s = core.ctx.createBufferSource(); s.buffer = core.noiseBuf;
  const f = core.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = envGain(t, 0.002, peak, 0, dur, dest);
  s.connect(f).connect(g); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

// The band. `e` a score event, t its start, spb seconds per beat, S the song's
// buses ({ bus, reed, bass }: the reed organ and the bass have their own tone).
function playNote(e, t, spb, S) {
  const bus = S.bus;
  const d = e.dur * spb, f = mtof(e.midi), v = e.vel;
  switch (e.inst) {
    case "lead": { // bowed metal: slow swell, inharmonic partials
      const g = envGain(t, Math.min(0.25, d * 0.4), v * 0.09, Math.max(0, d - 0.25), 0.5, bus);
      const end = t + d + 0.6;
      osc(t, end, "sine", f, g);
      const g2 = core.ctx.createGain(); g2.gain.value = 0.35; g2.connect(g); osc(t, end, "triangle", f * 2.76, g2);
      const g3 = core.ctx.createGain(); g3.gain.value = 0.12; g3.connect(g); osc(t, end, "sine", f * 5.4, g3);
      break;
    }
    case "melody": { // a detuned upright: two strings a few cents apart
      const g = envGain(t, 0.004, v * 0.12, 0, Math.max(0.4, d * 1.6), bus);
      const end = t + Math.max(0.45, d * 1.6) + 0.05;
      osc(t, end, "triangle", f * 1.005, g); osc(t, end, "triangle", f * 0.995, g);
      const g2 = core.ctx.createGain(); g2.gain.value = 0.25; g2.connect(g); osc(t, end, "sine", f * 2, g2);
      break;
    }
    case "pad": case "stab": { // reed organ: a buzzy pair through the reed filter
      const stab = e.inst === "stab";
      const g = envGain(t, stab ? 0.02 : 0.18, v * (stab ? 0.045 : 0.028), stab ? d * 0.6 : Math.max(0, d - 0.2), stab ? 0.12 : 0.35, S.reed);
      const end = t + d + 0.45;
      osc(t, end, "sawtooth", f * 1.003, g);
      if (!stab) osc(t, end, "square", f * 0.997, g);
      break;
    }
    case "bass": { // plucked string bass, through the bass filter
      const g = envGain(t, 0.006, v * 0.22, 0, Math.max(0.35, d * 0.8), S.bass);
      const end = t + Math.max(0.4, d * 0.8) + 0.05;
      osc(t, end, "sawtooth", f, g);
      break;
    }
    case "pluck": { // the battle ostinato: a dull, detuned upright
      const g = envGain(t, 0.004, v * 0.1, 0, 0.35, bus);
      const end = t + 0.4;
      osc(t, end, "triangle", f * 1.006, g); osc(t, end, "triangle", f * 0.994, g);
      break;
    }
    case "clank": { // pipe struck with a spanner
      burst(t, 0.1, { freq: 1700 + Math.random() * 400, q: 14, peak: v * 0.4 }, bus);
      const g = envGain(t, 0.002, v * 0.05, 0, 0.25, bus);
      osc(t, t + 0.3, "sine", 1130, g); osc(t, t + 0.3, "sine", 1870, g);
      break;
    }
    case "kick": { // a thump through the horn
      const g = envGain(t, 0.003, v * 0.3, 0, 0.22, bus);
      const o = osc(t, t + 0.3, "sine", 120, g); o.frequency.exponentialRampToValueAtTime(48, t + 0.2);
      burst(t, 0.05, { type: "lowpass", freq: 500, peak: v * 0.15 }, bus);
      break;
    }
    case "brush":
      burst(t, 0.07, { freq: 3000, q: 0.8, peak: v * 0.1 }, bus);
      break;
  }
}

// Start a new song on the current track, `delay` seconds from now.
function nextSong(delay = GAP) {
  const { ctx } = core;
  seed++;
  const style = styleFor(cur.track, seed);
  const song = compose(seed, style);
  const bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(chain.input);
  const reed = ctx.createBiquadFilter(); reed.type = "lowpass"; reed.frequency.value = 1500; reed.connect(bus);
  const bass = ctx.createBiquadFilter(); bass.type = "lowpass"; bass.frequency.value = 650; bass.connect(bus);
  const start = ctx.currentTime + delay;
  bus.gain.setValueAtTime(0.0001, start - 0.05);
  bus.gain.exponentialRampToValueAtTime(LEVEL[cur.track] ?? 1, start + 0.4);
  // Needle drop.
  burst(start - 0.6, 0.12, { type: "lowpass", freq: 300, peak: 0.25 }, chain.input);
  burst(start - 0.55, 0.4, { type: "highpass", freq: 2000, peak: 0.05 }, core.music);
  if (cur.bus) retire(cur.bus);
  Object.assign(cur, { song, bus, S: { bus, reed, bass }, start, idx: 0, spb: 60 / song.bpm });
}
function retire(bus) {
  const { ctx } = core;
  bus.gain.cancelScheduledValues(ctx.currentTime);
  bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
  setTimeout(() => { try { bus.disconnect(); } catch {} }, 3000);
}

function tick() {
  if (!cur?.song) return;
  const { ctx } = core, now = ctx.currentTime;
  const quiet = isMuted() || (settings.get("musicVolume") ?? 0.3) <= 0 || ctx.state !== "running";
  const { song, spb } = cur;
  while (cur.idx < song.events.length) {
    const e = song.events[cur.idx], t = cur.start + e.beat * spb;
    if (t > now + LOOKAHEAD) break;
    if (!quiet && t >= now - 0.05) playNote(e, Math.max(t, now), spb, cur.S);
    cur.idx++;
  }
  if (cur.idx >= song.events.length && now > cur.start + song.lengthBeats * spb + 0.5) nextSong();
}

function begin() {
  if (!want || cur?.track === want) return;
  core ||= audioCore();
  if (!core) return;
  chain ||= buildChain();
  const first = !cur;
  chain.crG.gain.setTargetAtTime(0.05, core.ctx.currentTime, 0.5);
  cur ||= { track: want };
  cur.track = want;
  nextSong(first ? 0.8 : 1.4);
  timer ||= setInterval(tick, TICK_MS);
}
onUnlock(() => begin());

export const music = {
  // "menu" (title, lobby) or "battle". Queued until audio is unlocked.
  play(track) {
    want = track;
    if (track !== "battle") this.setHeat(0);
    begin();
  },
  stop() {
    want = null;
    if (!cur) return;
    if (cur.bus) retire(cur.bus);
    clearInterval(timer); timer = null;
    chain?.crG.gain.setTargetAtTime(0.0001, core.ctx.currentTime, 0.4);
    cur = null;
  },
  // 0..1+: the player's active rig's heat over its capacity. The set drifts
  // off the station and static creeps in.
  setHeat(frac) {
    if (!chain) return;
    const r = radioTuning(frac), t = core.ctx.currentTime;
    chain.tune.offset.setTargetAtTime(r.detune, t, 0.8);
    chain.wowG.gain.setTargetAtTime(r.wobble, t, 0.8);
    chain.stG.gain.setTargetAtTime(r.static * 0.1, t, 0.6);
    chain.clean.gain.setTargetAtTime(r.clean, t, 0.6);
  },
};
