import { beforeEach, expect, test, vi } from "vitest";

const { play, startLoop, stopLoop } = vi.hoisted(() => ({
  play: vi.fn(),
  startLoop: vi.fn(),
  stopLoop: vi.fn(),
}));
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

test("registry covers the mapped action keys", () => {
  expect(Object.keys(ACTION_AUDIO).sort()).toEqual(
    ["aimed","disengage","emergencypatch","fire","move","overclock","prepare","purge","reload","repair","shutdown","sprint"].sort(),
  );
});

test("repair and emergencypatch play the console beep", () => {
  for (const key of ["repair", "emergencypatch"]) {
    play.mockClear();
    playAction(key);
    const [voices, sfx] = play.mock.calls[0];
    expect(voices).toEqual([]);
    expect(sfx).toEqual(["url:old_panel_beep"]);
  }
});
