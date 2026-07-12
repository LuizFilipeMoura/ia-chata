import { useCallback } from "react";
import { useCommands } from "../../hooks/useCommands";

/** Seed a full 3v3 test battle. `first` is the side whose turn opens the game
 *  ("a" = your turn, "b" = the enemy's turn). Callable without a browser. */
export function useSeedBattle() {
  const send = useCommands();
  return useCallback((first: "a" | "b") => send("seed", { first }), [send]);
}
