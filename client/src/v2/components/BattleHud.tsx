import { useRoomState } from "../../state/RoomStateContext";
import { useMySide } from "../../hooks/useMySide";
import { phaseSummary } from "/shared/battle-view.js";
import "../styles/battle.css";

export function BattleHud() {
  const { rigs, game } = useRoomState();
  const mySide = useMySide();
  if (!game?.started) return null;
  const sum = phaseSummary(game, rigs);
  const tok = sum.answerTokens[mySide] || 0;
  const pr = game.pendingReaction;
  const opponentReacting = Boolean(pr && pr.defender !== mySide);
  return (
    <div className="v2-bh">
      <div className="v2-bh-phase">
        <span className="v2-bh-label">{sum.label}</span>
        <span className="v2-bh-round">R{sum.round}</span>
      </div>
      <div className="v2-bh-turn">
        {sum.turnSide ? (<>Turn: <b className={sum.turnSide === mySide ? "v2-bh-mine" : "v2-bh-foe"}>{sum.turnName}</b>{sum.activeName ? ` — ${sum.activeName}` : ""}</>) : ""}
      </div>
      <div className="v2-bh-tokens">{tok ? `⟡ ${tok} Answer` : ""}</div>
      {opponentReacting && <div className="v2-bh-reacting">↩️ Opponent is reacting…</div>}
    </div>
  );
}
