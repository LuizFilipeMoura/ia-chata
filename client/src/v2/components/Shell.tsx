import { useEffect, useState, type ReactNode } from "react";
import "../styles/shell.css";
import { useRoomState, useRoomDispatch } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";

type Channel = "yard";
const CHANNELS: { id: string; num: string; label: string; enabled: boolean }[] = [
  { id: "join", num: "01", label: "Enlist", enabled: false },
  { id: "yard", num: "02", label: "Yard", enabled: true },
  { id: "commission", num: "03", label: "Forge", enabled: true },
  { id: "rulebook", num: "04", label: "Rules", enabled: true },
  { id: "outcome", num: "05", label: "Verdict", enabled: false },
];

export function Shell({
  channel, children, onForge, onRulebook, onGlossary, chatUnread,
}: {
  channel: Channel;
  children: ReactNode;
  onForge?: () => void;
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
        <div className="v2-brand">
          <div className="v2-brand-badge"><div className="v2-brand-core" /></div>
          <div className="v2-brand-txt">
            <div className="v2-brand-name">OIL &amp; IRON</div>
            <div className="v2-brand-sub">RIG CONTROL TERMINAL · MK.IV</div>
          </div>
        </div>
        <div className="v2-strip-spacer" />
        <div className="v2-strip-meta">
          <div className="v2-link"><span className="v2-lamp v2-lamp--ok" />LINK ·LOCAL</div>
          <div className="v2-room">RM// {session?.room}</div>
          <button type="button" className="v2-gloss-btn" aria-label="Glossary" onClick={() => onGlossary?.()}>ⓘ</button>
        </div>
      </header>

      <nav className="v2-channels">
        {CHANNELS.map((ch) => (
          <button
            key={ch.id} type="button" disabled={!ch.enabled}
            aria-current={ch.id === channel ? "page" : undefined}
            onClick={
              ch.id === "commission" ? () => onForge?.()
              : ch.id === "rulebook" ? () => onRulebook?.()
              : undefined
            }
            className={"v2-channel" + (ch.id === channel ? " is-active" : "")}
          >
            <span className="v2-channel-num">{ch.num}</span>{ch.label}
          </button>
        ))}
      </nav>

      <main className="v2-screen">{children}</main>

      <footer className="v2-dock">
        <div className="v2-dock-label">CMD DOCK</div>
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
        <div className="v2-leave-scrim" onClick={() => setConfirmLeave(false)}>
          <section className="v2-leave" role="dialog" aria-modal="true"
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
