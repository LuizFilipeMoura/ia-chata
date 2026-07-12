# V2 Action Battle Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play layered screamed-voice + SFX on player actions, a damage SFX when a rig loses Structure Points, and a looping engine idle bed during your turn — all in the native V2 frontend, driven client-side with no AI model.

**Architecture:** Three pure-ish audio modules under `client/src/v2/audio/` (asset loader, Web Audio mixer singleton, action registry), a `useV2Commands` wrapper that fires audio on `verb:"action"`, a `useBattleAudio` hook bound to the mixer's external store, plus small edits to `useV2BattleWatchers` (damage + engine loop) and `BattleHud` (mute toggle). All new imports are V2-internal or allowed shared logic/assets, so `no-v1-imports.test.ts` stays green.

**Tech Stack:** React 18, TypeScript, Vite `import.meta.glob`, Web Audio API, Vitest + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-11-action-battle-audio-design.md`

---

## Conventions

- **Run one test file:** `npx vitest run <path-substring>` (e.g. `npx vitest run soundAssets`).
- **Run the whole suite:** `npm test`.
- Tests are colocated (`foo.ts` → `foo.test.ts[x]`), use `expect/test/vi` from `vitest`.
- jsdom has **no** `AudioContext` and **no** `fetch` for audio — the mixer takes injected dependencies via `configureAudio(...)` so tests never touch real audio.

## File Structure

- Create `client/src/v2/audio/soundAssets.ts` — stem → bundled URL resolver.
- Create `client/src/v2/audio/audioMixer.ts` — Web Audio singleton: enabled store, `play`, `startLoop`/`stopLoop`.
- Create `client/src/v2/audio/actionAudio.ts` — registry + `playAction`/`playDamage`/`startEngineLoop`/`stopEngineLoop`.
- Create `client/src/v2/audio/useBattleAudio.ts` — `{ on, toggle }` hook via `useSyncExternalStore`.
- Create `client/src/v2/hooks/useV2Commands.ts` — command wrapper firing `playAction`.
- Modify `client/src/v2/battle/ActionConsole.tsx`, `client/src/v2/state/V2BattleActionsContext.tsx`, `client/src/v2/overlays/AttackWizard.tsx` — swap `useCommands` → `useV2Commands`.
- Modify `client/src/v2/hooks/useV2BattleWatchers.tsx` — damage effect + engine-loop effect.
- Modify `client/src/v2/components/BattleHud.tsx` — mute button.
- Rename the two engine `.mp3` assets.

---

## Task 0: Rename the engine assets

**Files:**
- Rename: `client/src/assets/sounds/old_tank_engine_runn_#4-1783782719259.mp3` → `engine_idle_1.mp3`
- Rename: `client/src/assets/sounds/old_tank_engine_runn_#2-1783782725509.mp3` → `engine_idle_2.mp3`

The `#` is a URL-fragment char and the timestamp is volatile — both break `import.meta.glob` `?url` and stable stems.

- [ ] **Step 1: Rename via git**

```bash
git mv "client/src/assets/sounds/old_tank_engine_runn_#4-1783782719259.mp3" client/src/assets/sounds/engine_idle_1.mp3
git mv "client/src/assets/sounds/old_tank_engine_runn_#2-1783782725509.mp3" client/src/assets/sounds/engine_idle_2.mp3
```

- [ ] **Step 2: Verify the folder**

Run: `ls client/src/assets/sounds/`
Expected: `engine_idle_1.mp3` and `engine_idle_2.mp3` present; no `#`-named files.

- [ ] **Step 3: Commit**

```bash
git add -A client/src/assets/sounds
git commit -m "chore(v2): rename engine idle sounds to safe stems"
```

---

## Task 1: Sound asset loader

**Files:**
- Create: `client/src/v2/audio/soundAssets.ts`
- Test: `client/src/v2/audio/soundAssets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { soundUrl } from "./soundAssets";

test("resolves a known stem to a URL string", () => {
  const url = soundUrl("fire_firing");
  expect(typeof url).toBe("string");
  expect(url).toMatch(/fire_firing/);
});

test("resolves the renamed engine stems", () => {
  expect(soundUrl("engine_idle_1")).toBeTruthy();
  expect(soundUrl("engine_idle_2")).toBeTruthy();
});

test("returns null for an unknown stem", () => {
  expect(soundUrl("does_not_exist")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run soundAssets`
Expected: FAIL — cannot resolve `./soundAssets`.

- [ ] **Step 3: Write the implementation**

```ts
// Eagerly import every clip in the shared assets folder as a bundled, hashed URL.
// Vite rewrites each to its final asset path; the key is the source path, which we
// reduce to a bare stem (filename without extension) for lookup.
const urls = import.meta.glob("../../assets/sounds/*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const byStem: Record<string, string> = {};
for (const [path, url] of Object.entries(urls)) {
  const stem = path.split("/").pop()!.replace(/\.mp3$/, "");
  byStem[stem] = url;
}

/** Map a bare stem ("fire_firing") to its bundled URL, or null if absent. */
export function soundUrl(stem: string): string | null {
  return byStem[stem] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run soundAssets`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/audio/soundAssets.ts client/src/v2/audio/soundAssets.test.ts
git commit -m "feat(v2): sound asset stem->URL loader"
```

---

## Task 2: Mixer — enabled store + persistence

**Files:**
- Create: `client/src/v2/audio/audioMixer.ts`
- Test: `client/src/v2/audio/audioMixer.test.ts`

This task builds only the external-store + persistence surface. `play`/loop come next.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, expect, test, vi } from "vitest";
import { getEnabled, setEnabled, subscribe, _resetForTest } from "./audioMixer";

beforeEach(() => {
  localStorage.clear();
  _resetForTest();
});

test("defaults enabled to true", () => {
  expect(getEnabled()).toBe(true);
});

test("setEnabled persists and notifies subscribers", () => {
  const cb = vi.fn();
  const unsub = subscribe(cb);
  setEnabled(false);
  expect(getEnabled()).toBe(false);
  expect(cb).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("v2BattleAudioOn")).toBe("false");
  unsub();
  setEnabled(true);
  expect(cb).toHaveBeenCalledTimes(1); // unsubscribed — no further calls
});

test("reads persisted false on reset", () => {
  localStorage.setItem("v2BattleAudioOn", "false");
  _resetForTest();
  expect(getEnabled()).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run audioMixer`
Expected: FAIL — cannot resolve `./audioMixer`.

- [ ] **Step 3: Write the implementation**

```ts
const STORAGE_KEY = "v2BattleAudioOn";

let enabled = readEnabled();
const listeners = new Set<() => void>();

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
  if (!v) stopLoop();
  notify();
}

// stopLoop is defined in Task 4; declare a no-op placeholder until then so this
// task compiles and tests independently.
export function stopLoop(): void { /* replaced in Task 4 */ }

/** Test-only: reset module state between tests. */
export function _resetForTest(): void {
  listeners.clear();
  enabled = readEnabled();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run audioMixer`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/audio/audioMixer.ts client/src/v2/audio/audioMixer.test.ts
git commit -m "feat(v2): audio mixer enabled store + persistence"
```

---

## Task 3: Mixer — layered `play`

**Files:**
- Modify: `client/src/v2/audio/audioMixer.ts`
- Test: `client/src/v2/audio/audioMixer.test.ts` (add cases)

`play(voiceUrls, sfxUrls)` picks one URL per category (no immediate repeat), decodes+caches buffers, and plays each through its own gain node (voice 1.0, sfx 0.5). Dependencies are injected so tests use a fake context.

- [ ] **Step 1: Write the failing test (append to audioMixer.test.ts)**

```ts
import { configureAudio, play } from "./audioMixer";

class FakeGain {
  gain = { value: -1 };
  connect = vi.fn();
}
class FakeSource {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class FakeCtx {
  state = "running";
  destination = {};
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  createGain = () => { const g = new FakeGain(); this.gains.push(g); return g; };
  createBufferSource = () => { const s = new FakeSource(); this.sources.push(s); return s; };
  decodeAudioData = async () => ({} as AudioBuffer);
  resume = vi.fn(async () => { this.state = "running"; });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test("play mixes voice at 1.0 and sfx at 0.5", async () => {
  const ctx = new FakeCtx();
  configureAudio({ ctxFactory: () => ctx as unknown as AudioContext, fetchAudio: async () => new ArrayBuffer(8) });
  play(["v"], ["s"]);
  await flush();
  expect(ctx.sources.length).toBe(2);
  const gainValues = ctx.gains.map((g) => g.gain.value).sort();
  expect(gainValues).toEqual([0.5, 1]);
  expect(ctx.sources[0].start).toHaveBeenCalled();
});

test("play skips a null/empty layer", async () => {
  const ctx = new FakeCtx();
  configureAudio({ ctxFactory: () => ctx as unknown as AudioContext, fetchAudio: async () => new ArrayBuffer(8) });
  play(["v"], []);
  await flush();
  expect(ctx.sources.length).toBe(1);
});

test("play is a no-op when disabled", async () => {
  const ctx = new FakeCtx();
  configureAudio({ ctxFactory: () => ctx as unknown as AudioContext, fetchAudio: async () => new ArrayBuffer(8) });
  setEnabled(false);
  play(["v"], ["s"]);
  await flush();
  expect(ctx.sources.length).toBe(0);
});

test("no immediate repeat across two plays of a 2-item category", async () => {
  const ctx = new FakeCtx();
  configureAudio({
    ctxFactory: () => ctx as unknown as AudioContext,
    fetchAudio: async () => new ArrayBuffer(8),
    rng: mkSeqRng(),
  });
  const picks: unknown[] = [];
  play(["a", "b"], []); await flush();
  play(["a", "b"], []); await flush();
  // buffers keyed by URL; assert the two picks differ via the cache access order
  picks.push(ctx.sources[0].buffer, ctx.sources[1].buffer);
  expect(picks[0]).not.toBe(picks[1]);
});
```

Add this helper near the top of the test file:

```ts
// Deterministic rng returning 0, 0.99, 0, 0.99, … so "random" pick alternates.
function mkSeqRng() {
  const seq = [0, 0.99, 0, 0.99];
  let i = 0;
  return () => seq[i++ % seq.length];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run audioMixer`
Expected: FAIL — `configureAudio`/`play` not exported.

- [ ] **Step 3: Extend the implementation**

Add to `audioMixer.ts` (above `_resetForTest`, and update `_resetForTest`):

```ts
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

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const lastPick = new Map<string, number>(); // category key -> last index

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
  if (c.state === "suspended") void c.resume();
  const voice = pick(voiceUrls);
  const sfx = pick(sfxUrls);
  if (voice) void playOne(c, voice, 1.0);
  if (sfx) void playOne(c, sfx, 0.5);
}
```

Update `_resetForTest` to also clear audio state and restore default deps:

```ts
export function _resetForTest(): void {
  listeners.clear();
  enabled = readEnabled();
  deps = { ...defaultDeps };
  ctx = null;
  buffers.clear();
  lastPick.clear();
  stopLoopState();
}
```

Add a private `stopLoopState()` no-op for now (Task 4 fills it):

```ts
function stopLoopState(): void { /* replaced in Task 4 */ }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run audioMixer`
Expected: PASS (all Task 2 + Task 3 cases).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/audio/audioMixer.ts client/src/v2/audio/audioMixer.test.ts
git commit -m "feat(v2): audio mixer layered play with no-repeat + gains"
```

---

## Task 4: Mixer — engine loop channel

**Files:**
- Modify: `client/src/v2/audio/audioMixer.ts`
- Test: `client/src/v2/audio/audioMixer.test.ts` (add cases)

- [ ] **Step 1: Write the failing test (append)**

```ts
import { startLoop, stopLoop } from "./audioMixer";

test("startLoop plays a looping source at low gain and is idempotent", async () => {
  const ctx = new FakeCtx();
  configureAudio({ ctxFactory: () => ctx as unknown as AudioContext, fetchAudio: async () => new ArrayBuffer(8) });
  startLoop(["e1", "e2"]);
  await flush();
  expect(ctx.sources.length).toBe(1);
  expect(ctx.sources[0].loop).toBe(true);
  expect(ctx.gains[0].gain.value).toBe(0.3);
  startLoop(["e1", "e2"]); // already looping — no new source
  await flush();
  expect(ctx.sources.length).toBe(1);
});

test("stopLoop stops the loop and allows a fresh start", async () => {
  const ctx = new FakeCtx();
  configureAudio({ ctxFactory: () => ctx as unknown as AudioContext, fetchAudio: async () => new ArrayBuffer(8) });
  startLoop(["e1"]);
  await flush();
  stopLoop();
  expect(ctx.sources[0].stop).toHaveBeenCalled();
  startLoop(["e1"]);
  await flush();
  expect(ctx.sources.length).toBe(2);
});

test("setEnabled(false) stops the loop", async () => {
  const ctx = new FakeCtx();
  configureAudio({ ctxFactory: () => ctx as unknown as AudioContext, fetchAudio: async () => new ArrayBuffer(8) });
  startLoop(["e1"]);
  await flush();
  setEnabled(false);
  expect(ctx.sources[0].stop).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run audioMixer`
Expected: FAIL — `startLoop` not exported / no-op behavior.

- [ ] **Step 3: Extend the implementation**

Replace the `stopLoop` placeholder (from Task 2) and the `stopLoopState` placeholder (from Task 3) with real loop state. Add near the play code:

```ts
let loopSource: AudioBufferSourceNode | null = null;
let loopStarting = false;

/** Start the engine idle loop (idempotent). Picks one URL at random. */
export function startLoop(urls: string[]): void {
  if (!enabled) return;
  if (loopSource || loopStarting) return; // already running / starting
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const url = pick(urls);
  if (!url) return;
  loopStarting = true;
  void (async () => {
    const buf = await loadBuffer(c, url);
    loopStarting = false;
    if (!buf || !enabled) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = c.createGain();
    gain.gain.value = 0.3;
    src.connect(gain);
    gain.connect(c.destination);
    src.start();
    loopSource = src;
  })();
}
```

Now delete the placeholder `export function stopLoop()` and the private
`function stopLoopState()` and replace both with a single real implementation
(keep it exported, since `setEnabled` and callers use it):

```ts
export function stopLoop(): void {
  loopStarting = false;
  if (loopSource) {
    try { loopSource.stop(); } catch { /* already stopped */ }
    loopSource = null;
  }
}
```

Update `_resetForTest` to call `stopLoop()` instead of `stopLoopState()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run audioMixer`
Expected: PASS (all mixer cases).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/audio/audioMixer.ts client/src/v2/audio/audioMixer.test.ts
git commit -m "feat(v2): audio mixer engine loop channel"
```

---

## Task 5: Action registry

**Files:**
- Create: `client/src/v2/audio/actionAudio.ts`
- Test: `client/src/v2/audio/actionAudio.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, expect, test, vi } from "vitest";

const play = vi.fn();
const startLoop = vi.fn();
const stopLoop = vi.fn();
vi.mock("./audioMixer", () => ({ play, startLoop, stopLoop }));
vi.mock("./soundAssets", () => ({
  // echo the stem back as its "URL" so assertions read clearly; unknowns → null
  soundUrl: (s: string) => (s === "missing" ? null : `url:${s}`),
}));

import { playAction, playDamage, startEngineLoop, stopEngineLoop, ACTION_AUDIO } from "./actionAudio";

beforeEach(() => { play.mockClear(); startLoop.mockClear(); stopLoop.mockClear(); });

test("fire plays 4 voice barks + 3 mechanical beds", () => {
  playAction("fire");
  const [voices, sfx] = play.mock.calls[0];
  expect(voices).toHaveLength(4);
  expect(sfx).toHaveLength(3);
  expect(voices[0]).toBe("url:fire_firing");
});

test("move plays sfx only (no voice)", () => {
  playAction("move");
  const [voices, sfx] = play.mock.calls[0];
  expect(voices).toEqual([]);
  expect(sfx.length).toBeGreaterThan(0);
});

test("unmapped action is a no-op", () => {
  playAction("harden");
  expect(play).not.toHaveBeenCalled();
});

test("playDamage plays tank_getting_shot as sfx", () => {
  playDamage();
  const [voices, sfx] = play.mock.calls[0];
  expect(voices).toEqual([]);
  expect(sfx).toContain("url:tank_getting_shot_1");
});

test("engine loop resolves both engine stems", () => {
  startEngineLoop();
  expect(startLoop).toHaveBeenCalledWith(["url:engine_idle_1", "url:engine_idle_2"]);
  stopEngineLoop();
  expect(stopLoop).toHaveBeenCalled();
});

test("registry covers the 10 v1 action keys", () => {
  expect(Object.keys(ACTION_AUDIO).sort()).toEqual(
    ["aimed","disengage","fire","move","overclock","prepare","purge","reload","shutdown","sprint"].sort(),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run actionAudio`
Expected: FAIL — cannot resolve `./actionAudio`.

- [ ] **Step 3: Write the implementation**

```ts
import { play, startLoop, stopLoop } from "./audioMixer";
import { soundUrl } from "./soundAssets";

interface Layers { voices: string[]; sfx: string[]; }

const FIRE_BARKS = ["fire_firing", "fire_eat_this", "fire_rounds_downrange", "fire_light_em_up"];
const MECH = ["massive_mechanical_1", "massive_mechanical_2", "massive_mechanical_3"];

// action key -> layer stems. Keys absent here play nothing (safe default).
export const ACTION_AUDIO: Record<string, Layers> = {
  fire: { voices: FIRE_BARKS, sfx: MECH },
  aimed: { voices: FIRE_BARKS, sfx: MECH },
  overclock: { voices: ["overclock_redline_it"], sfx: MECH },
  move: { voices: [], sfx: MECH },
  sprint: { voices: [], sfx: MECH },
  disengage: { voices: ["disengage_fall_back", "disengage_breaking_off", "disengage_get_out"], sfx: [] },
  purge: { voices: ["purge_venting_clear", "purge_dumping_heat"], sfx: [] },
  reload: { voices: [], sfx: ["old_panel_beep"] },
  prepare: { voices: [], sfx: ["old_panel_beep"] },
  shutdown: { voices: [], sfx: ["old_panel_beep"] },
};

const DAMAGE_SFX = ["tank_getting_shot_1", "tank_getting_shot_2"];
const ENGINE_LOOP = ["engine_idle_1", "engine_idle_2"];

// Resolve stems to URLs, dropping any that are absent.
function urls(stems: string[]): string[] {
  return stems.map(soundUrl).filter((u): u is string => u !== null);
}

export function playAction(key: string): void {
  const layers = ACTION_AUDIO[key];
  if (!layers) return;
  play(urls(layers.voices), urls(layers.sfx));
}

export function playDamage(): void {
  play([], urls(DAMAGE_SFX));
}

export function startEngineLoop(): void {
  startLoop(urls(ENGINE_LOOP));
}

export function stopEngineLoop(): void {
  stopLoop();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run actionAudio`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/audio/actionAudio.ts client/src/v2/audio/actionAudio.test.ts
git commit -m "feat(v2): action audio registry + play helpers"
```

---

## Task 6: `useV2Commands` wrapper

**Files:**
- Create: `client/src/v2/hooks/useV2Commands.ts`
- Test: `client/src/v2/hooks/useV2Commands.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const send = vi.fn();
const playAction = vi.fn();
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => send }));
vi.mock("../audio/actionAudio", () => ({ playAction }));

import { useV2Commands } from "./useV2Commands";

test("fires playAction for action verbs and always delegates", () => {
  send.mockClear(); playAction.mockClear();
  const { result } = renderHook(() => useV2Commands());
  result.current("action", { name: "R1", action: "fire" });
  expect(playAction).toHaveBeenCalledWith("fire");
  expect(send).toHaveBeenCalledWith("action", { name: "R1", action: "fire" });
});

test("does not fire playAction for non-action verbs", () => {
  send.mockClear(); playAction.mockClear();
  const { result } = renderHook(() => useV2Commands());
  result.current("react", { evaded: true });
  expect(playAction).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith("react", { evaded: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run useV2Commands`
Expected: FAIL — cannot resolve `./useV2Commands`.

- [ ] **Step 3: Write the implementation**

```ts
import { useCallback } from "react";
import { useCommands } from "../../hooks/useCommands";
import { playAction } from "../audio/actionAudio";

// Wraps the shared command dispatcher so a player's own action also fires its
// battle-audio cue. Same signature as useCommands, so call sites swap the import.
export function useV2Commands() {
  const send = useCommands();
  return useCallback(
    (verb: string, attrs: Record<string, unknown> = {}) => {
      if (verb === "action" && typeof attrs.action === "string") {
        playAction(attrs.action);
      }
      return send(verb, attrs);
    },
    [send],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run useV2Commands`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/hooks/useV2Commands.ts client/src/v2/hooks/useV2Commands.test.tsx
git commit -m "feat(v2): useV2Commands wrapper firing action audio"
```

---

## Task 7: Wire `useV2Commands` into the action sites

**Files:**
- Modify: `client/src/v2/battle/ActionConsole.tsx:6`
- Modify: `client/src/v2/state/V2BattleActionsContext.tsx:12`
- Modify: `client/src/v2/overlays/AttackWizard.tsx` (its `useCommands` import + call)

No behavior change beyond audio — existing tests must stay green. Each site currently does `import { useCommands } from "../../hooks/useCommands";` (or `"../../hooks/useCommands"` relative to its folder) and `const sendCommand = useCommands();`.

- [ ] **Step 1: Update ActionConsole**

In `client/src/v2/battle/ActionConsole.tsx`, replace:

```ts
import { useCommands } from "../../hooks/useCommands";
```
with
```ts
import { useV2Commands } from "../hooks/useV2Commands";
```
and replace `const sendCommand = useCommands();` with `const sendCommand = useV2Commands();`.

- [ ] **Step 2: Update V2BattleActionsContext**

In `client/src/v2/state/V2BattleActionsContext.tsx`, replace:

```ts
import { useCommands } from "../../hooks/useCommands";
```
with
```ts
import { useV2Commands } from "../hooks/useV2Commands";
```
and replace `const sendCommand = useCommands();` with `const sendCommand = useV2Commands();`.

- [ ] **Step 3: Update AttackWizard**

In `client/src/v2/overlays/AttackWizard.tsx`, replace:

```ts
import { useCommands } from "../../hooks/useCommands";
```
with
```ts
import { useV2Commands } from "../hooks/useV2Commands";
```
and replace `const sendCommand = useCommands();` with `const sendCommand = useV2Commands();`.

- [ ] **Step 4: Confirm the AttackWizard import path**

Run: `grep -n "useCommands" client/src/v2/overlays/AttackWizard.tsx`
Expected: no remaining reference to `hooks/useCommands`; one import of `../hooks/useV2Commands`.
(If AttackWizard also destructures `sendReact` from `useV2BattleActions`, leave that untouched — only the `useCommands` line changes.)

- [ ] **Step 5: Run the affected suites + guard**

Run: `npx vitest run ActionConsole V2BattleActionsContext AttackWizard no-v1-imports`
Expected: PASS — behavior unchanged; guard still green (new import is V2-internal).

- [ ] **Step 6: Commit**

```bash
git add client/src/v2/battle/ActionConsole.tsx client/src/v2/state/V2BattleActionsContext.tsx client/src/v2/overlays/AttackWizard.tsx
git commit -m "feat(v2): route action dispatch through useV2Commands for audio"
```

---

## Task 8: `useBattleAudio` hook

**Files:**
- Create: `client/src/v2/audio/useBattleAudio.ts`
- Test: `client/src/v2/audio/useBattleAudio.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { _resetForTest, getEnabled } from "./audioMixer";
import { useBattleAudio } from "./useBattleAudio";

beforeEach(() => { localStorage.clear(); _resetForTest(); });

test("reflects mixer enabled state and toggles it", () => {
  const { result } = renderHook(() => useBattleAudio());
  expect(result.current.on).toBe(true);
  act(() => result.current.toggle());
  expect(result.current.on).toBe(false);
  expect(getEnabled()).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run useBattleAudio`
Expected: FAIL — cannot resolve `./useBattleAudio`.

- [ ] **Step 3: Write the implementation**

```ts
import { useSyncExternalStore } from "react";
import { getEnabled, setEnabled, subscribe } from "./audioMixer";

/** Bind a component to the mixer's enabled flag. */
export function useBattleAudio(): { on: boolean; toggle: () => void } {
  const on = useSyncExternalStore(subscribe, getEnabled, getEnabled);
  return { on, toggle: () => setEnabled(!getEnabled()) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run useBattleAudio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/audio/useBattleAudio.ts client/src/v2/audio/useBattleAudio.test.tsx
git commit -m "feat(v2): useBattleAudio toggle hook"
```

---

## Task 9: Mute button in BattleHud

**Files:**
- Modify: `client/src/v2/components/BattleHud.tsx`
- Test: `client/src/v2/components/BattleHud.test.tsx` (add a case)

- [ ] **Step 1: Write the failing test (append to BattleHud.test.tsx)**

```tsx
import userEvent from "@testing-library/user-event";
import { _resetForTest, getEnabled } from "../audio/audioMixer";

test("audio mute button toggles battle audio", async () => {
  localStorage.clear(); _resetForTest();
  const user = userEvent.setup();
  const state: ServerState = { version:1, ownerSide:"a", field:null, rigs:[rig(1,"a"),rig(2,"b")],
    game:{ round:1, phase:"activation", started:true,
      sides:[{id:"a",name:"Kostov",vp:0,ready:true},{id:"b",name:"Rival",vp:0,ready:true}],
      turn:{ side:"a", activeRigId:null, actionsUsed:0, actionsMax:0 } } };
  render(<AppProviders><Seed state={state}/><BattleHud/></AppProviders>);
  const btn = await screen.findByRole("button", { name: /audio/i });
  expect(getEnabled()).toBe(true);
  await user.click(btn);
  expect(getEnabled()).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run BattleHud`
Expected: FAIL — no button matching `/audio/i`.

- [ ] **Step 3: Update BattleHud**

In `client/src/v2/components/BattleHud.tsx`, add the import:

```ts
import { useBattleAudio } from "../audio/useBattleAudio";
```

Inside the component, after `const mySide = useMySide();`, add:

```ts
const audio = useBattleAudio();
```

Then add the button as the last child inside the `<div className="v2-bh">` wrapper, just before its closing tag:

```tsx
      <button
        type="button"
        className="v2-bh-audio"
        aria-label={audio.on ? "Mute battle audio" : "Unmute battle audio"}
        aria-pressed={!audio.on}
        onClick={audio.toggle}
      >
        {audio.on ? "🔊" : "🔇"}
      </button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run BattleHud`
Expected: PASS (existing 2 + new case).

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/components/BattleHud.tsx client/src/v2/components/BattleHud.test.tsx
git commit -m "feat(v2): battle audio mute toggle in HUD"
```

---

## Task 10: Damage SFX in `useV2BattleWatchers`

**Files:**
- Modify: `client/src/v2/hooks/useV2BattleWatchers.tsx`
- Test: `client/src/v2/hooks/useV2BattleWatchers.test.tsx` (add a case; check existing mocks first)

The effect tracks each rig's total Structure Points; when a total drops, play the damage SFX. Total SP is summed over the rig's kind-specific part names via `partNamesOf`/`kindOf` from `/shared/unit-kinds.js`. The existing test file already defines `mk`, `wrap`, and `Harness` (which mounts the hook, sets `session.side = "a"`, and applies one `ServerState`); the new tests reuse them and re-render with a bumped `version` to apply a second state.

- [ ] **Step 1: Add the actionAudio mock + failing test (append to useV2BattleWatchers.test.tsx)**

Add the mock near the existing `vi.mock("../../hooks/useCommands", …)` (top level), then append the test. Also add `waitFor` to the `@testing-library/react` import.

```tsx
import { waitFor } from "@testing-library/react";
import { playDamage, startEngineLoop, stopEngineLoop } from "../audio/actionAudio";

vi.mock("../audio/actionAudio", () => ({
  playDamage: vi.fn(), startEngineLoop: vi.fn(), stopEngineLoop: vi.fn(),
}));

const gameBase = {
  round: 1, phase: "activation", started: true,
  sides: [{ id: "a", name: "K", vp: 0, ready: true }, { id: "b", name: "R", vp: 0, ready: true }],
  turn: { side: "b", activeRigId: 2, actionsUsed: 0, actionsMax: 3 },
};

test("plays damage sfx when a rig's total SP drops", async () => {
  vi.mocked(playDamage).mockClear();
  const full = { version: 1, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")], game: gameBase } as unknown as ServerState;
  const hurtRig = { ...mk(1, "a"), hull: { sp: 3, max: 6, destroyed: false } } as unknown as Rig;
  const hurt = { version: 2, ownerSide: "a", field: null, rigs: [hurtRig, mk(2, "b")], game: gameBase } as unknown as ServerState;
  const { rerender } = render(wrap(<Harness state={full} />));
  await waitFor(() => expect(vi.mocked(playDamage)).not.toHaveBeenCalled());
  rerender(wrap(<Harness state={hurt} />));
  await waitFor(() => expect(vi.mocked(playDamage)).toHaveBeenCalledTimes(1));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run useV2BattleWatchers`
Expected: FAIL — `playDamage` not called (effect absent).

- [ ] **Step 3: Add the effect**

In `client/src/v2/hooks/useV2BattleWatchers.tsx`:

Add imports at the top:

```ts
import { partNamesOf, kindOf } from "/shared/unit-kinds.js";
import { playDamage } from "../audio/actionAudio";
```

Add a helper above the hook:

```ts
function totalSp(rig: Rig): number {
  return partNamesOf(kindOf(rig)).reduce(
    (sum, part) => sum + ((rig as unknown as Record<string, { sp?: number }>)[part]?.sp ?? 0),
    0,
  );
}
```

Inside `useV2BattleWatchers`, add (near the other refs/effects):

```ts
  // ---- Damage SFX: play when any rig's total Structure Points drops ----
  const spBaseline = useRef<Map<number, number> | null>(null);
  useEffect(() => {
    const prev = spBaseline.current;
    const next = new Map<number, number>();
    let dropped = false;
    for (const r of rigs) {
      const t = totalSp(r);
      next.set(r.id, t);
      if (prev && prev.has(r.id) && t < prev.get(r.id)!) dropped = true;
    }
    spBaseline.current = next;
    if (prev && dropped) playDamage(); // skip the first render (prev === null)
  }, [rigs]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run useV2BattleWatchers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/hooks/useV2BattleWatchers.tsx client/src/v2/hooks/useV2BattleWatchers.test.tsx
git commit -m "feat(v2): damage sfx on structure-point loss"
```

---

## Task 11: Engine idle loop in `useV2BattleWatchers`

**Files:**
- Modify: `client/src/v2/hooks/useV2BattleWatchers.tsx`
- Test: `client/src/v2/hooks/useV2BattleWatchers.test.tsx` (add a case)

Loop while it's the local player's turn during the activation phase; stop otherwise and on unmount. "Your turn" = `phaseSummary(game, rigs).turnSide === mySide`.

The `startEngineLoop`/`stopEngineLoop` mocks and `waitFor`/`gameBase` from Task 10 are already in this file — reuse them.

- [ ] **Step 1: Write the failing test (append)**

```tsx
test("starts engine loop on your turn, stops on opponent turn", async () => {
  vi.mocked(startEngineLoop).mockClear();
  vi.mocked(stopEngineLoop).mockClear();
  const mine = { version: 10, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")],
    game: { ...gameBase, turn: { side: "a", activeRigId: 1, actionsUsed: 0, actionsMax: 3 } } } as unknown as ServerState;
  const foe = { version: 11, ownerSide: "a", field: null, rigs: [mk(1, "a"), mk(2, "b")],
    game: { ...gameBase, turn: { side: "b", activeRigId: 2, actionsUsed: 0, actionsMax: 3 } } } as unknown as ServerState;
  const { rerender } = render(wrap(<Harness state={mine} />));
  await waitFor(() => expect(vi.mocked(startEngineLoop)).toHaveBeenCalled());
  rerender(wrap(<Harness state={foe} />));
  await waitFor(() => expect(vi.mocked(stopEngineLoop)).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run useV2BattleWatchers`
Expected: FAIL — engine loop functions never called.

- [ ] **Step 3: Add the effect**

In `client/src/v2/hooks/useV2BattleWatchers.tsx`:

Add imports:

```ts
import { phaseSummary } from "/shared/battle-view.js";
import { useMySide } from "../../hooks/useMySide";
import { startEngineLoop, stopEngineLoop } from "../audio/actionAudio";
```

Inside the hook, add near the top (with the other hook calls):

```ts
  const mySide = useMySide();
```

Add the effect:

```ts
  // ---- Engine idle loop: rumble while it's your turn during activation ----
  const myTurn =
    game?.phase === "activation" && phaseSummary(game, rigs).turnSide === mySide;
  useEffect(() => {
    if (myTurn) startEngineLoop();
    else stopEngineLoop();
    return () => stopEngineLoop();
  }, [myTurn]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run useV2BattleWatchers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/v2/hooks/useV2BattleWatchers.tsx client/src/v2/hooks/useV2BattleWatchers.test.tsx
git commit -m "feat(v2): looping engine idle bed on your turn"
```

---

## Task 12: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole client suite + guard**

Run: `npx vitest run`
Expected: PASS — all V2 audio suites plus existing suites; `no-v1-imports` green.

- [ ] **Step 2: Run the full project test script**

Run: `npm test`
Expected: PASS (client vitest + shared/server node tests).

- [ ] **Step 3: Build to confirm the glob + assets bundle**

Run: `npm run build`
Expected: build succeeds; the `.mp3` clips (including `engine_idle_1/2`) emit as hashed assets.

- [ ] **Step 4: Manual smoke test in the browser**

Start the dev server (`npm run dev`), join a battle, start an activation:
- On your turn, a low engine rumble loops; it stops when the opponent activates.
- Tapping Fire plays a screamed bark layered over machinery; Move plays machinery only.
- Taking damage plays the tank-hit SFX.
- The HUD 🔊 button mutes/unmutes everything and the choice survives a reload.

- [ ] **Step 5: Commit any final touch-ups**

```bash
git add -A
git commit -m "chore(v2): battle audio verification pass"
```

---

## Notes / known gaps (from the spec)

- Return-Fire dispatches `sendReact` (`verb:"react"`), so it does not bark in v1 — intentional.
- Weapon-ability barks (Harpoon Winch, Rivet Lock, …), per-rig voice variation, spatial audio, and opponent-action audio are out of scope; the registry grows to add them later.
