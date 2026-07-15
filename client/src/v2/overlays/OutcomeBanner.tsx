import { useEffect, useState } from "react";
import "../styles/battle.css";
import { useRoomState } from "../../state/RoomStateContext";
import { useV2BattleActions } from "../state/V2BattleActionsContext";
import { outcomeText } from "/shared/battle-view.js";

export function OutcomeBanner() {
  const { game } = useRoomState();
  const { resetBattle } = useV2BattleActions();
  const finished = game?.phase === "finished";

  // Dismissable so the player can read the final board instead of being pinned
  // behind the result. Re-arms whenever a battle leaves the finished phase, so
  // the next outcome telegraphs again.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { if (!finished) setDismissed(false); }, [finished]);

  if (!finished || dismissed) return null;
  return (
    <div className="v2-outcome v2-scrim v2-scrim--oil">
      <div className="v2-outcome-card">
        <button
          type="button"
          className="v2-outcome-close v2-close"
          aria-label="Close"
          onClick={() => setDismissed(true)}
        >
          ✕
        </button>
        <div className="v2-outcome-text v2-title">{outcomeText(game.outcome, game.sides)}</div>
        <button type="button" className="v2-outcome-new v2-panel" onClick={resetBattle}>↻ New Battle</button>
      </div>
    </div>
  );
}
