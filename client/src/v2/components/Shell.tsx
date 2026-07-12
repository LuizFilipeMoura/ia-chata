import { useEffect, useState, type ReactNode } from "react";
import "../styles/shell.css";
import { useRoomState, useRoomDispatch } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";

type Channel = "yard";

export function Shell({
  children, onRulebook, onGlossary, chatUnread,
}: {
  channel: Channel;
  children: ReactNode;
  onRulebook?: () => void;
  onGlossary?: () => void;
  chatUnread?: boolean;
}) {
  const { game, session } = useRoomState();
  const dispatch = useRoomDispatch();
  const sendCommand = useCommands();
  const mySide = useMySide();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const canUndo = !!game?.canUndo;

  useEffect(() => {
    if (!confirmLeave) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmLeave(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmLeave]);

  const doLeave = () => { localStorage.clear(); dispatch({ type: "clearSession" }); };

  return (
    <div className="v2-root">
      <div aria-hidden="true" className="v2-crt v2-crt--vignette" />
      <div aria-hidden="true" className="v2-crt v2-crt--scan" />
      <div aria-hidden="true" className="v2-crt v2-crt--grain" />
      <div aria-hidden="true" className="v2-crt v2-crt--flick" />

      <header className="v2-strip">
        <div className="v2-brand-badge v2-badge" aria-hidden="true"><div className="v2-brand-core" /></div>
        <div className="v2-strip-spacer" />
        <div className="v2-strip-rm">RM <span>{session?.room}</span></div>
        <button type="button" className="v2-gloss-btn" aria-label="Glossary" onClick={() => onGlossary?.()}>ⓘ</button>
      </header>

      <main className="v2-screen">{children}</main>

      <footer className="v2-dock">
        <div className="v2-dock-label v2-eyebrow">CMD DOCK</div>
        <div className="v2-strip-spacer" />
        <button type="button" className="v2-dock-btn" title="Rulebook" onClick={() => onRulebook?.()}>
          <span>🛠</span>Rulebook
          {chatUnread && <span className="v2-dock-dot" aria-hidden="true" />}
        </button>
        {canUndo && (
          <button type="button" className="v2-dock-btn"
            onClick={() => sendCommand("undo", { side: mySide })}>
            <span>↺</span>Revert
          </button>
        )}
        <button type="button" className="v2-dock-btn v2-dock-btn--danger"
          onClick={() => setConfirmLeave(true)}>
          <span>⎋</span>Leave
        </button>
        <button type="button" className="v2-dock-gear" aria-label="Settings">⚙</button>
      </footer>

      {confirmLeave && (
        <div className="v2-leave-scrim v2-scrim" onClick={() => setConfirmLeave(false)}>
          <section className="v2-leave v2-panel" role="dialog" aria-modal="true"
            aria-labelledby="v2LeaveTitle" onClick={(e) => e.stopPropagation()}>
            <div id="v2LeaveTitle" className="v2-leave-title">Leave room</div>
            <p className="v2-leave-copy">
              This clears local storage on this device and returns you to the join screen.
            </p>
            <div className="v2-leave-actions">
              <button type="button" className="v2-btn v2-btn--ghost" onClick={() => setConfirmLeave(false)}>Stay</button>
              <button type="button" className="v2-btn v2-btn--danger" onClick={doLeave}>Erase and leave</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
