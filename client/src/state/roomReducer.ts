import type { Rig, GameState, Session, ServerState } from "./types";

export interface RoomState {
  rigs: Rig[];
  game: GameState | null;
  stateVersion: number;
  session: Session | null;
}

export const initialRoomState: RoomState = {
  rigs: [], game: null, stateVersion: -1, session: null,
};

export type RoomAction =
  | { type: "applyServerState"; state: ServerState | null | undefined }
  | { type: "setSession"; session: Session };

export function roomReducer(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "applyServerState": {
      const s = action.state;
      if (!s) return state;
      return {
        ...state,
        rigs: Array.isArray(s.rigs) ? s.rigs : [],
        game: s.game ?? null,
        stateVersion: s.version ?? state.stateVersion,
      };
    }
    case "setSession":
      return { ...state, session: action.session };
    default:
      return state;
  }
}

export function findRig(rigs: Rig[], name?: string | null): Rig | null {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  return rigs.find((r) => r.name.toLowerCase() === n) ?? null;
}
