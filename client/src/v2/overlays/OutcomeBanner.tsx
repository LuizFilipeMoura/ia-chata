import "../styles/battle.css";
import { useRoomState } from "../../state/RoomStateContext";
import { useV2BattleActions } from "../state/V2BattleActionsContext";
import { outcomeText } from "/shared/battle-view.js";

export function OutcomeBanner() {
  const { game } = useRoomState();
  const { resetBattle } = useV2BattleActions();
  if (game?.phase !== "finished") return null;
  return (
    <div className="v2-outcome v2-scrim v2-scrim--oil">
      <div className="v2-outcome-card">
        <div className="v2-outcome-text v2-title">{outcomeText(game.outcome, game.sides)}</div>
        <button type="button" className="v2-outcome-new v2-panel" onClick={resetBattle}>↻ New Battle</button>
      </div>
    </div>
  );
}
