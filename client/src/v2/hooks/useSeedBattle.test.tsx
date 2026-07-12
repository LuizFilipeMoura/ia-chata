import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../../hooks/useCommands", () => ({ useCommands: () => send }));

import { useSeedBattle } from "./useSeedBattle";

test("sends the seed verb with the chosen first side", () => {
  const { result } = renderHook(() => useSeedBattle());
  result.current("b");
  expect(send).toHaveBeenCalledWith("seed", { first: "b" });
});
