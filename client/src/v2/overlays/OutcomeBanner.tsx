import "../styles/battle.css";
import { useRoomState } from "../../state/RoomStateContext";
import { useBattleActions } from "../../state/BattleActionsContext";
import { outcomeText } from "/shared/battle-view.js";

export function OutcomeBanner() {
  const { game } = useRoomState();
  const { resetBattle } = useBattleActions();
  if (game?.phase !== "finished") return null;
  return (
    <div className="v2-outcome">
      <div className="v2-outcome-card">
        <div className="v2-outcome-text">{outcomeText(game.outcome, game.sides)}</div>
        <button type="button" className="v2-outcome-new" onClick={resetBattle}>↻ New Battle</button>
      </div>
    </div>
  );
}
