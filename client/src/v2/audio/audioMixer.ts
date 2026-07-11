const STORAGE_KEY = "v2BattleAudioOn";

interface AudioDeps {
  ctxFactory: () => AudioContext;
  fetchAudio: (url: string) => Promise<ArrayBuffer>;
  rng: () => number;
}

const defaultDeps: AudioDeps = {
  ctxFactory: () => new AudioContext(),
  fetchAudio: (url) => fetch(url).then((r) => r.arrayBuffer()),
  rng: Math.random,
};
let deps: AudioDeps = { ...defaultDeps };

let enabled = readEnabled();
const listeners = new Set<() => void>();

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const lastPick = new Map<string, number>(); // category key -> last index

const IDLE_GAIN = 0.3;
const IDLE_FADE_S = 1.5;
const IDLE_GAP_S = 15;

let idleActive = false;
let idleGen = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idleSource: AudioBufferSourceNode | null = null;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function notify(): void {
  for (const cb of listeners) cb();
}

export function getEnabled(): boolean {
  return enabled;
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setEnabled(v: boolean): void {
  if (v === enabled) return;
  enabled = v;
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch { /* storage unavailable — in-memory only */ }
  if (!v) stopIdle();
  notify();
}

export function configureAudio(opts: Partial<AudioDeps>): void {
  deps = { ...defaultDeps, ...opts };
  ctx = null;
  buffers.clear();
  lastPick.clear();
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = deps.ctxFactory();
  } catch {
    ctx = null; // no Web Audio support — feature silently off
  }
  return ctx;
}

async function loadBuffer(c: AudioContext, url: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(url);
  if (cached) return cached;
  try {
    const data = await deps.fetchAudio(url);
    const buf = await c.decodeAudioData(data);
    buffers.set(url, buf);
    return buf;
  } catch {
    return null; // failed clip disabled for the session
  }
}

// Pick one URL from a list, avoiding the immediately-previous index for that
// category (the joined URL list is the category key).
function pick(urls: string[]): string | null {
  if (urls.length === 0) return null;
  if (urls.length === 1) return urls[0];
  const key = urls.join("|");
  const prev = lastPick.get(key);
  let idx = Math.floor(deps.rng() * urls.length);
  if (idx === prev) idx = (idx + 1) % urls.length;
  lastPick.set(key, idx);
  return urls[idx];
}

async function playOne(c: AudioContext, url: string, gainValue: number): Promise<void> {
  const buf = await loadBuffer(c, url);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.value = gainValue;
  src.connect(gain);
  gain.connect(c.destination);
  src.start();
}

/** Play one voice + one sfx (either may be empty) layered at set volumes. */
export function play(voiceUrls: string[], sfxUrls: string[]): void {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  const voice = pick(voiceUrls);
  const sfx = pick(sfxUrls);
  if (voice) void playOne(c, voice, 1.0);
  if (sfx) void playOne(c, sfx, 0.5);
}

// One fade-in / play / fade-out cycle, then schedule the next after a gap.
function playIdleCycle(c: AudioContext, url: string, gen: number): void {
  void (async () => {
    const buf = await loadBuffer(c, url);
    if (gen !== idleGen || !idleActive || !buf || !enabled) return; // superseded/stopped
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    const now = c.currentTime;
    const dur = buf.duration || 0;
    const fade = Math.min(IDLE_FADE_S, dur / 2);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(IDLE_GAIN, now + fade);
    gain.gain.setValueAtTime(IDLE_GAIN, Math.max(now + fade, now + dur - fade));
    gain.gain.linearRampToValueAtTime(0, now + dur);
    src.connect(gain);
    gain.connect(c.destination);
    src.start();
    idleSource = src;
    idleTimer = setTimeout(() => {
      if (gen === idleGen && idleActive) playIdleCycle(c, url, gen);
    }, (dur + IDLE_GAP_S) * 1000);
  })();
}

/** Start the engine idle bed: a non-looping clip that fades in/out and repeats
 *  after a 5s gap. Idempotent; cancelled cleanly by stopIdle. */
export function startIdle(urls: string[]): void {
  if (!enabled) return;
  if (idleActive) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  const url = pick(urls);
  if (!url) return;
  idleActive = true;
  playIdleCycle(c, url, ++idleGen);
}

export function stopIdle(): void {
  idleGen++; // invalidate any in-flight cycle
  idleActive = false;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (idleSource) {
    try { idleSource.stop(); } catch { /* already stopped */ }
    idleSource = null;
  }
}

/** Test-only: reset module state between tests. */
export function _resetForTest(): void {
  listeners.clear();
  enabled = readEnabled();
  deps = { ...defaultDeps };
  ctx = null;
  buffers.clear();
  lastPick.clear();
  stopIdle();
}
