import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRoomState } from "../../state/RoomStateContext";
import { useMySide } from "../../hooks/useMySide";
import { playThreatAlarm } from "../audio/actionAudio";
import "../styles/overlay.css";

// Loud, blocking "incoming fire" telegraph. Shown to the defender whose Rig an
// enemy has just opened an attack on (game.pendingThreat.defender === mySide).
// Cosmetic only — the defender takes no action here; reactions are pre-placed.
export function ThreatOverlay() {
  const { rigs, game } = useRoomState();
  const mySide = useMySide();
  const th = game?.pendingThreat ?? null;
  const active = Boolean(th && th.defender === mySide);

  // Klaxon once per threat session (keyed on attacker, not target — a live
  // re-point keeps the same attacker and must not re-fire the alarm).
  const alarmedFor = useRef<number | null>(null);
  useEffect(() => {
    if (active && th && alarmedFor.current !== th.attackerId) {
      alarmedFor.current = th.attackerId;
      playThreatAlarm();
    }
    if (!active) alarmedFor.current = null;
  }, [active, th?.attackerId]);

  // Always dismissable: the telegraph is cosmetic, so the defender is never
  // held hostage by it. A fresh threat (new attacker) re-arms the overlay.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(false); }, [active, th?.attackerId]);

  if (!active || !th || dismissed) return null;

  const attacker = rigs.find((r) => r.id === th.attackerId);
  const target = rigs.find((r) => r.id === th.targetId);
  const attackerName = (attacker?.name || "Enemy").toUpperCase();
  const targetName = (target?.name || "your Rig").toUpperCase();
  const painting = th.mode === "lock";
  const weaponLine = painting
    ? "Fire Control Lock — painting for a strike"
    : `${(th.weapon || "Weapon").toUpperCase()} — locked and ranging`;

  return createPortal(
    <div className="v2-threat" role="alertdialog" aria-live="assertive">
      <div className="v2-threat-hazard top" />
      <div className="v2-threat-hazard bot" />
      <div className="v2-threat-siren" />
      <div className="v2-threat-reticle"><span className="h" /><span className="v" /></div>
      <div className="v2-threat-card">
        <button
          type="button"
          className="v2-threat-close"
          aria-label="Close"
          onClick={() => setDismissed(true)}
        >
          ✕
        </button>
        <div className="v2-threat-klaxon">⚠ ◤ INCOMING FIRE ◥ ⚠</div>
        <div className="v2-threat-title">
          Enemy <em>{attackerName}</em> targets your <b>{targetName}</b>
        </div>
        <div className="v2-threat-weapon">{weaponLine}</div>
        <button type="button" className="v2-threat-dismiss" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>,
    document.body,
  );
}
