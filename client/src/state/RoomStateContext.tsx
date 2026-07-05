import { createContext, useContext, useReducer, useEffect, type ReactNode } from "react";
import { roomReducer, initialRoomState, type RoomState, type RoomAction } from "./roomReducer";
import { loadSession, saveSession } from "./session";

const StateCtx = createContext<RoomState | null>(null);
const DispatchCtx = createContext<React.Dispatch<RoomAction> | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(roomReducer, initialRoomState, (base) => ({
    ...base, session: loadSession(),
  }));

  useEffect(() => {
    if (state.session) saveSession(state.session);
  }, [state.session]);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useRoomState(): RoomState {
  const v = useContext(StateCtx);
  if (!v) throw new Error("useRoomState outside RoomProvider");
  return v;
}
export function useRoomDispatch(): React.Dispatch<RoomAction> {
  const v = useContext(DispatchCtx);
  if (!v) throw new Error("useRoomDispatch outside RoomProvider");
  return v;
}
