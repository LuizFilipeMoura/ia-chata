import { useCallback } from "react";
import { useCommands } from "../../hooks/useCommands";
import { playAction } from "../audio/actionAudio";

// Actions whose audio is cued when the player SELECTS them (the move wizard
// opens), not when the command dispatches — so the engine spools up as you
// choose to move, not after the move resolves. Their selection cue lives in
// V2BattleActionsContext.openMove; skip the dispatch-time cue here to avoid
// double-playing.
const SELECT_CUED_ACTIONS = new Set(["move", "sprint"]);

// Wraps the shared command dispatcher so a player's own action also fires its
// battle-audio cue. Same signature as useCommands, so call sites swap the import.
export function useV2Commands() {
  const send = useCommands();
  return useCallback(
    (verb: string, attrs: Record<string, unknown> = {}) => {
      if (verb === "action" && typeof attrs.action === "string" && !SELECT_CUED_ACTIONS.has(attrs.action)) {
        playAction(attrs.action, attrs);
      }
      return send(verb, attrs);
    },
    [send],
  );
}
