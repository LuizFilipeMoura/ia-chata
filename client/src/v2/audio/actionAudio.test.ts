import { beforeEach, expect, test, vi } from "vitest";

const { play, startIdle, stopIdle } = vi.hoisted(() => ({
  play: vi.fn(),
  startIdle: vi.fn(),
  stopIdle: vi.fn(),
}));
vi.mock("./audioMixer", () => ({ play, startIdle, stopIdle, SFX_GAIN: 0.5 }));
vi.mock("./soundAssets", () => ({
  // echo the stem back as its "URL" so assertions read clearly; unknowns → null
  soundUrl: (s: string) => (s === "missing" ? null : `url:${s}`),
}));

import { playAction, playDamage, playHeat, playEngineStart, startEngineLoop, stopEngineLoop, ACTION_AUDIO } from "./actionAudio";

beforeEach(() => { play.mockClear(); startIdle.mockClear(); stopIdle.mockClear(); });

test("fire without weapon info plays barks + the default cannon bed", () => {
  playAction("fire");
  const [voices, sfx] = play.mock.calls[0];
  expect(voices).toHaveLength(4);
  expect(sfx).toEqual(["url:cannon_fire"]);
  expect(voices[0]).toBe("url:fire_firing");
});

test("gun bed is weapon-aware: MG rattles, cannon booms, melee clanks", () => {
  play.mockClear();
  playAction("fire", { weapon: "longRange", weaponName: "Mini Gun" });
  expect(play.mock.calls[0][1]).toEqual(["url:mg_50cal", "url:mg_machine_gun"]);

  play.mockClear();
  playAction("fire", { weapon: "longRange", weaponName: "Autocannon" });
  expect(play.mock.calls[0][1]).toEqual(["url:cannon_fire"]);

  play.mockClear();
  playAction("aimed", { weapon: "melee", weaponName: "Sword" });
  expect(play.mock.calls[0][1]).toEqual([
    "url:massive_mechanical_1", "url:massive_mechanical_2", "url:massive_mechanical_3",
  ]);
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

test("playHeat plays the furnace clip as sfx at a third volume", () => {
  play.mockClear();
  playHeat();
  const [voices, sfx, gain] = play.mock.calls[0];
  expect(voices).toEqual([]);
  expect(sfx).toEqual(["url:heat_furnace"]);
  expect(gain).toBeCloseTo(0.5 / 3);
});

test("engine loop resolves both engine stems", () => {
  startEngineLoop();
  expect(startIdle).toHaveBeenCalledWith(["url:engine_idle"]);
  stopEngineLoop();
  expect(stopIdle).toHaveBeenCalled();
});

test("playEngineStart plays the engine_start clip as sfx", () => {
  play.mockClear();
  playEngineStart();
  const [voices, sfx] = play.mock.calls[0];
  expect(voices).toEqual([]);
  expect(sfx).toEqual(["url:engine_start"]);
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
