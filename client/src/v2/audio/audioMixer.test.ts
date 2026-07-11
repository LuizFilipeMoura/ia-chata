import { beforeEach, expect, test, vi } from "vitest";
import {
  getEnabled, setEnabled, subscribe, _resetForTest,
  configureAudio, play, startIdle, stopIdle,
} from "./audioMixer";

beforeEach(() => { vi.useRealTimers(); localStorage.clear(); _resetForTest(); });

// Deterministic rng returning 0, 0.99, 0, 0.99, … so "random" pick alternates.
function mkSeqRng() {
  const seq = [0, 0.99, 0, 0.99];
  let i = 0;
  return () => seq[i++ % seq.length];
}
class FakeGain { gain = { value: -1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }; connect = vi.fn(); }
class FakeSource {
  buffer: unknown = null; loop = false; onended: (() => void) | null = null;
  connect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class FakeCtx {
  state = "running"; destination = {}; currentTime = 0;
  gains: FakeGain[] = []; sources: FakeSource[] = [];
  createGain = () => { const g = new FakeGain(); this.gains.push(g); return g; };
  createBufferSource = () => { const s = new FakeSource(); this.sources.push(s); return s; };
  decodeAudioData = async () => ({ duration: 2 } as unknown as AudioBuffer);
  resume = vi.fn(async () => { this.state = "running"; });
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const cfg = (ctx: FakeCtx, rng?: () => number) =>
  configureAudio({ ctxFactory: () => ctx as unknown as AudioContext, fetchAudio: async () => new ArrayBuffer(8), ...(rng ? { rng } : {}) });

test("defaults enabled to true", () => { expect(getEnabled()).toBe(true); });

test("setEnabled persists and notifies subscribers", () => {
  const cb = vi.fn(); const unsub = subscribe(cb);
  setEnabled(false);
  expect(getEnabled()).toBe(false);
  expect(cb).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("v2BattleAudioOn")).toBe("false");
  unsub(); setEnabled(true);
  expect(cb).toHaveBeenCalledTimes(1);
});

test("reads persisted false on reset", () => {
  localStorage.setItem("v2BattleAudioOn", "false"); _resetForTest();
  expect(getEnabled()).toBe(false);
});

test("play mixes voice at 1.0 and sfx at 0.5", async () => {
  const ctx = new FakeCtx(); cfg(ctx);
  play(["v"], ["s"]); await flush();
  expect(ctx.sources.length).toBe(2);
  expect(ctx.gains.map((g) => g.gain.value).sort()).toEqual([0.5, 1]);
  expect(ctx.sources[0].start).toHaveBeenCalled();
});

test("play skips a null/empty layer", async () => {
  const ctx = new FakeCtx(); cfg(ctx);
  play(["v"], []); await flush();
  expect(ctx.sources.length).toBe(1);
});

test("play is a no-op when disabled", async () => {
  const ctx = new FakeCtx(); cfg(ctx);
  setEnabled(false);
  play(["v"], ["s"]); await flush();
  expect(ctx.sources.length).toBe(0);
});

test("no immediate repeat across two plays of a 2-item category", async () => {
  const ctx = new FakeCtx(); cfg(ctx, mkSeqRng());
  play(["a", "b"], []); await flush();
  play(["a", "b"], []); await flush();
  expect(ctx.sources[0].buffer).not.toBe(ctx.sources[1].buffer);
});

test("startIdle plays a non-looping clip with a fade envelope, idempotent", async () => {
  const ctx = new FakeCtx(); cfg(ctx);
  startIdle(["e"]); await flush();
  expect(ctx.sources.length).toBe(1);
  expect(ctx.sources[0].loop).toBe(false);
  const ramps = ctx.gains[0].gain.linearRampToValueAtTime.mock.calls.map((c: unknown[]) => c[0]);
  expect(ramps).toContain(0.3); // fade in to idle gain
  expect(ramps).toContain(0);   // fade out
  startIdle(["e"]); await flush();
  expect(ctx.sources.length).toBe(1); // idempotent — no second clip
});

test("stopIdle stops the current clip and allows a fresh start", async () => {
  const ctx = new FakeCtx(); cfg(ctx);
  startIdle(["e"]); await flush();
  stopIdle();
  expect(ctx.sources[0].stop).toHaveBeenCalled();
  startIdle(["e"]); await flush();
  expect(ctx.sources.length).toBe(2);
});

test("setEnabled(false) stops the idle", async () => {
  const ctx = new FakeCtx(); cfg(ctx);
  startIdle(["e"]); await flush();
  setEnabled(false);
  expect(ctx.sources[0].stop).toHaveBeenCalled();
});

test("stopIdle during an in-flight startIdle cancels it (no orphaned clip)", async () => {
  const ctx = new FakeCtx(); cfg(ctx);
  startIdle(["e"]); stopIdle(); await flush();
  expect(ctx.sources.length).toBe(0);
});

test("rapid start/stop/start leaves exactly one stoppable idle", async () => {
  const ctx = new FakeCtx(); cfg(ctx);
  startIdle(["e"]); stopIdle();
  startIdle(["e"]); await flush();
  const running = () => ctx.sources.filter((s) => s.start.mock.calls.length > 0 && s.stop.mock.calls.length === 0);
  expect(running().length).toBe(1);
  stopIdle();
  expect(running().length).toBe(0);
});

test("idle repeats after the clip duration plus a 5s gap", async () => {
  vi.useFakeTimers();
  const ctx = new FakeCtx(); cfg(ctx);
  startIdle(["e"]);
  await vi.advanceTimersByTimeAsync(0);                    // flush async load + first cycle
  expect(ctx.sources.length).toBe(1);
  await vi.advanceTimersByTimeAsync((2 + 15) * 1000 + 50);  // dur 2 + gap 15
  expect(ctx.sources.length).toBe(2);
  stopIdle();
  vi.useRealTimers();
});
