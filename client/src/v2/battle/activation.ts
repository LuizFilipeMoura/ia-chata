import type { Rig, ServerState } from "../../state/types";

// The single source of truth for "can this rig be activated right now" — shared
// by V2Terminal (RigTerminal activation) and BattleScreen (click-to-activate)
// so the two gates can't drift.
export function canRigActivate(
  rig: Rig | null | undefined,
  game: ServerState["game"] | undefined,
  mySide: string | null | undefined,
): boolean {
  if (!rig || !game?.started) return false;
  if (game.phase !== "activation" || game.turn?.side !== mySide) return false;
  if ((rig.owner || "a") !== mySide) return false;
  if (game.turn?.activeRigId != null) return false;
  if (game.pendingAnswer || game.pendingReaction || game.pendingBlast) return false;
  return !rig.activated && !rig.destroyed;
}
