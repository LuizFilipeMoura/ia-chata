import { useContext } from "react";
import { ViewSideContext } from "../state/ViewSideContext";
import { useRoomState } from "../state/RoomStateContext";

/** The side "I" am acting as: an explicit ViewSideContext override wins,
 *  else the joined session's side, else "a". */
export function useMySide(): string {
  const override = useContext(ViewSideContext);
  const { session } = useRoomState();
  return override ?? session?.side ?? "a";
}
