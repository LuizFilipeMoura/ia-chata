import { useRoomState } from "../state/RoomStateContext";
import { useMySide } from "../hooks/useMySide";
import { phaseSummary } from "/shared/battle-view.js";

export function BattleHud() {
  const { rigs, game } = useRoomState();
  const mySide = useMySide();

  if (!game?.started) return null;

  const sum = phaseSummary(game, rigs);
  const tok = sum.answerTokens[mySide] || 0;
  const pr = game.pendingReaction;
  const opponentReacting = Boolean(pr && pr.defender !== mySide);

  return (
    <div id="battleHud" className="battle-hud">
      <div className="bh-phase">
        <span id="bhPhase" className="bh-phase-label">{sum.label}</span>
        <span id="bhRound" className="bh-round">R{sum.round}</span>
      </div>
      <div id="bhTurn" className="bh-turn">
        {sum.turnSide ? (
          <>
            Turn:{" "}
            <b className={sum.turnSide === mySide ? "bh-mine" : "bh-foe"}>{sum.turnName}</b>
            {sum.activeName ? ` — ${sum.activeName}` : ""}
          </>
        ) : (
          ""
        )}
      </div>
      <div id="bhTokens" className="bh-tokens">{tok ? `⟡ ${tok} Answer` : ""}</div>
      {opponentReacting ? (
        <div className="bh-reacting">↩️ Opponent is reacting…</div>
      ) : null}
      <div id="bhPrompt" className="bh-prompt" />
    </div>
  );
}
