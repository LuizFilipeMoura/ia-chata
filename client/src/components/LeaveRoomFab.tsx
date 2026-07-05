import { useRoomDispatch } from "../state/RoomStateContext";

const CONFIRM_LEAVE =
  "Leave this room? This clears local storage on this device and returns you to the join screen.";

export function LeaveRoomFab() {
  const dispatch = useRoomDispatch();

  const leaveRoom = () => {
    if (!window.confirm(CONFIRM_LEAVE)) return;
    localStorage.clear();
    dispatch({ type: "clearSession" });
  };

  return (
    <button
      type="button"
      className="leave-fab"
      title="Leave room"
      aria-label="Leave room"
      onClick={leaveRoom}
    >
      <span className="leave-fab-ic">⎋</span>
    </button>
  );
}
