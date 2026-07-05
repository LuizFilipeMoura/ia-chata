import { useRoomState } from "../state/RoomStateContext";
import { outcomeText } from "/shared/battle-view.js";

export function OutcomeBanner() {
  const { game } = useRoomState();

  if (game?.phase !== "finished") return null;

  return (
    <div id="outcomeBanner" className="outcome-banner">
      {outcomeText(game.outcome, game.sides)}
    </div>
  );
}
