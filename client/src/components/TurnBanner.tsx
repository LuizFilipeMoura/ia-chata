import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRoomState } from "../state/RoomStateContext";
import { useWizard } from "../state/WizardContext";
import { useBattleActions } from "../state/BattleActionsContext";
import { useCommands } from "../hooks/useCommands";
import { computeFocus, type FocusCtaKind } from "../lib/computeFocus";

// The one thing this player should do right now, pinned above everything and
// independent of scroll — plus a whole-screen border while it's actually their
// move (battle.js:165-196).
export function TurnBanner() {
  const { rigs, game, session } = useRoomState();
  const mySide = session?.side || "a";
  const focus = computeFocus(game, rigs, mySide);

  const { openCommission, openScore } = useWizard();
  const { rollInitiative, resolveBlast, endActivation } = useBattleActions();
  const sendCommand = useCommands();

  const cardRef = useRef<HTMLDivElement>(null);
  const lastPrimary = useRef<string | null>(null);
  const [changed, setChanged] = useState(false);

  // Whole-screen border while it's actually the player's move.
  useEffect(() => {
    document.body.classList.toggle("my-turn-glow", focus?.tone === "act");
  }, [focus?.tone]);

  // When there is no focus, hide the banner and collapse its height var.
  useEffect(() => {
    if (!focus) {
      document.body.classList.remove("my-turn-glow");
      lastPrimary.current = null;
      document.documentElement.style.setProperty("--turn-banner-h", "0px");
    }
  }, [focus]);

  // Flash once when the duty actually changes (battle.js:188-193).
  useEffect(() => {
    if (!focus) return;
    if (focus.primary !== lastPrimary.current) {
      setChanged(false);
      // Restart the animation on the next frame.
      const id = requestAnimationFrame(() => setChanged(true));
      lastPrimary.current = focus.primary;
      return () => cancelAnimationFrame(id);
    }
  }, [focus, focus?.primary]);

  // Publish the floating card's height so the layout can offset for it
  // (battle.js:195). The outer .turn-banner is just a centering wrapper with
  // top padding for the floating offset, so we measure the card itself —
  // otherwise the stage would be pushed down by the offset twice over.
  useLayoutEffect(() => {
    if (focus && cardRef.current) {
      document.documentElement.style.setProperty(
        "--turn-banner-h",
        `${cardRef.current.offsetHeight}px`,
      );
    }
  });

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
    <div id="turnBanner" className="turn-banner" data-tone={focus.tone}>
      <div ref={cardRef} className={"tb-card" + (changed ? " changed" : "")}>
        <span id="tbIcon" className="tb-icon">{focus.icon || "◈"}</span>
        <div className="tb-text">
          <span id="tbPrimary" className="tb-primary">{focus.primary}</span>
          <span id="tbSecondary" className="tb-secondary">{focus.secondary || ""}</span>
        </div>
        <div id="tbCta" className="tb-cta">
          {focus.cta ? (
            <button type="button"
              className={"btn " + (focus.tone === "act" ? "btn--primary" : "btn--ghost")}
              onClick={() => onCta(focus.cta!.kind)}>
              {focus.cta.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
