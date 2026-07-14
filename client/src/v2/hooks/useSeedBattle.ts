import { useCallback } from "react";
import { useCommands } from "../../hooks/useCommands";
import type { SeedPreset } from "../screens/seedPreset";

/** Seed a full test battle. `first` is the side whose turn opens ("a" = your
 *  turn, "b" = enemy). `preset` chooses the roster composition. Callable without
 *  a browser. */
export function useSeedBattle() {
  const send = useCommands();
  return useCallback(
    (first: "a" | "b", preset: SeedPreset) => send("seed", { first, preset }),
    [send],
  );
}
