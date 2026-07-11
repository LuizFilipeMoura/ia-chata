import { useRoomState } from "../../state/RoomStateContext";
import { useWizard } from "../../state/WizardContext";
import { useBattleActions } from "../../state/BattleActionsContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import { computeFocus, type FocusCtaKind } from "../../lib/computeFocus";
import "../styles/battle.css";

// The one thing this player should do right now. V2 renders it in normal flow —
// no fixed positioning, no document.body class toggling, no --turn-banner-h var
// (the whole-screen my-turn glow is a scoped ::before instead).
export function TurnBanner() {
  const { rigs, game } = useRoomState();
  const mySide = useMySide();
  const focus = computeFocus(game, rigs, mySide);

  const { openCommission, openScore } = useWizard();
  const { rollInitiative, resolveBlast, endActivation } = useBattleActions();
  const sendCommand = useCommands();

  if (!focus) return null;

  const onCta = (kind: FocusCtaKind) => {
    switch (kind) {
      case "commission": openCommission(); break;
      case "ready": sendCommand("ready", { side: mySide }); break;
      case "initiative": rollInitiative(); break;
      case "blast": resolveBlast(); break;
      case "score": openScore(); break;
      case "endTurn": {
        const rig = rigs.find((r) => r.id === game?.turn?.activeRigId);
        if (rig) endActivation(rig);
        break;
      }
    }
  };

  return (
    <div className="v2-tb" data-tone={focus.tone} data-myturn={focus.tone === "act"}>
      <div className="v2-tb-card">
        <span className="v2-tb-icon">{focus.icon || "◈"}</span>
        <div className="v2-tb-text">
          <span className="v2-tb-primary">{focus.primary}</span>
          <span className="v2-tb-secondary">{focus.secondary || ""}</span>
        </div>
        <div className="v2-tb-cta">
          {focus.cta ? (
            <button type="button"
              className={"v2-tb-btn " + (focus.tone === "act" ? "v2-tb-btn--primary" : "v2-tb-btn--ghost")}
              onClick={() => onCta(focus.cta!.kind)}>
              {focus.cta.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
