import { useRoomState } from "../state/RoomStateContext";
import { useBattleActions } from "../state/BattleActionsContext";
import { outcomeText } from "/shared/battle-view.js";

export function OutcomeBanner() {
  const { game } = useRoomState();
  const { resetBattle } = useBattleActions();

  if (game?.phase !== "finished") return null;

  return (
    <div id="outcomeBanner" className="outcome-banner">
      {outcomeText(game.outcome, game.sides)}
      <button type="button" className="outcome-new" onClick={resetBattle}>
        ↻ New Battle
      </button>
    </div>
  );
}
