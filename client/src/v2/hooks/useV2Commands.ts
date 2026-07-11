import { useCallback } from "react";
import { useCommands } from "../../hooks/useCommands";
import { playAction } from "../audio/actionAudio";

// Wraps the shared command dispatcher so a player's own action also fires its
// battle-audio cue. Same signature as useCommands, so call sites swap the import.
export function useV2Commands() {
  const send = useCommands();
  return useCallback(
    (verb: string, attrs: Record<string, unknown> = {}) => {
      if (verb === "action" && typeof attrs.action === "string") {
        playAction(attrs.action);
      }
      return send(verb, attrs);
    },
    [send],
  );
}
