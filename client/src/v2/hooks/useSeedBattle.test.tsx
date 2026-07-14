import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => send }));

import { useSeedBattle } from "./useSeedBattle";

test("sends the seed verb with the chosen first side and preset", () => {
  const { result } = renderHook(() => useSeedBattle());
  result.current("b", "rigs4");
  expect(send).toHaveBeenCalledWith("seed", { first: "b", preset: "rigs4" });
});
