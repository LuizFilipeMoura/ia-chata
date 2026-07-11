import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const { send, playAction } = vi.hoisted(() => ({ send: vi.fn(), playAction: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => send }));
vi.mock("../audio/actionAudio", () => ({ playAction }));

import { useV2Commands } from "./useV2Commands";

test("fires playAction for action verbs and always delegates", () => {
  send.mockClear(); playAction.mockClear();
  const { result } = renderHook(() => useV2Commands());
  result.current("action", { name: "R1", action: "fire" });
  expect(playAction).toHaveBeenCalledWith("fire", { name: "R1", action: "fire" });
  expect(send).toHaveBeenCalledWith("action", { name: "R1", action: "fire" });
});

test("does not fire playAction on dispatch for move/sprint (cued at selection instead)", () => {
  send.mockClear(); playAction.mockClear();
  const { result } = renderHook(() => useV2Commands());
  result.current("action", { name: "R1", action: "move" });
  expect(playAction).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith("action", { name: "R1", action: "move" });
});

test("does not fire playAction for non-action verbs", () => {
  send.mockClear(); playAction.mockClear();
  const { result } = renderHook(() => useV2Commands());
  result.current("react", { evaded: true });
  expect(playAction).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith("react", { evaded: true });
});
