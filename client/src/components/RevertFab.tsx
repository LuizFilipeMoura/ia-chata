import { useRoomState } from "../state/RoomStateContext";
import { useCommands } from "../hooks/useCommands";

// Floating "revert last action" button. The server exposes game.canUndo only to
// the side that made the last turn-scoped move, so this simply mirrors that flag
// and pops the server's snapshot when tapped.
export function RevertFab() {
  const { game, session } = useRoomState();
  const sendCommand = useCommands();

  if (!game?.canUndo) return null;

  return (
    <button
      type="button"
      className="revert-fab"
      title="Revert last action"
      aria-label="Revert last action"
      onClick={() => sendCommand("undo", { side: session?.side })}
    >
      <span className="revert-fab-ic" aria-hidden="true">↺</span>
      <span className="revert-fab-label">Revert</span>
    </button>
  );
}
