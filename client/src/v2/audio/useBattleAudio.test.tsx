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
