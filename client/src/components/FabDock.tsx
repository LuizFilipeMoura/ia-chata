import { useEffect, useState } from "react";
import { useRoomState, useRoomDispatch } from "../state/RoomStateContext";
import { useCommands } from "../hooks/useCommands";

interface Props {
  chatOpen: boolean;
  hasUnread: boolean;
  onToggleChat: () => void;
}

/**
 * FabDock — a single corner launcher that expands into the floating actions
 * (Rulebook / Revert / Leave). Collapsed it is one button; tapping it fans the
 * available actions upward. Revert only appears when the server allows an undo.
 */
export function FabDock({ chatOpen, hasUnread, onToggleChat }: Props) {
  const { game, session } = useRoomState();
  const dispatch = useRoomDispatch();
  const sendCommand = useCommands();
  const [open, setOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const canUndo = !!game?.canUndo;

  useEffect(() => {
    if (!open && !confirmLeave) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmLeave) setConfirmLeave(false);
      else setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, confirmLeave]);

  const doLeave = () => {
    localStorage.clear();
    dispatch({ type: "clearSession" });
  };

  return (
    <>
      <div className={"fab-dock" + (open ? " is-open" : "")}>
        {open && <div className="fab-scrim" onClick={() => setOpen(false)} />}

        {open && (
          <div className="fab-items" role="menu">
            <button
              type="button"
              role="menuitem"
              className={"fab-item" + (chatOpen ? " is-active" : "")}
              onClick={() => {
                onToggleChat();
                setOpen(false);
              }}
            >
              <span className="fab-item-ic" aria-hidden="true">🛠</span>
              <span className="fab-item-label">Rulebook</span>
              {hasUnread && <span className="fab-item-dot" aria-hidden="true" />}
            </button>

            {canUndo && (
              <button
                type="button"
                role="menuitem"
                className="fab-item"
                onClick={() => {
                  sendCommand("undo", { side: session?.side });
                  setOpen(false);
                }}
              >
                <span className="fab-item-ic" aria-hidden="true">↺</span>
                <span className="fab-item-label">Revert</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              className="fab-item fab-item--danger"
              onClick={() => {
                setOpen(false);
                setConfirmLeave(true);
              }}
            >
              <span className="fab-item-ic" aria-hidden="true">⎋</span>
              <span className="fab-item-label">Leave</span>
            </button>
          </div>
        )}

        <button
          type="button"
          className={"fab-main" + (hasUnread && !open ? " has-unread" : "")}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="fab-main-ic" aria-hidden="true">{open ? "✕" : "⚙"}</span>
        </button>
      </div>

      {confirmLeave && (
        <div className="leave-dialog-scrim" onClick={() => setConfirmLeave(false)}>
          <section
            className="leave-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leaveDialogTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="leave-dialog-head">
              <div id="leaveDialogTitle" className="leave-dialog-title">Leave room</div>
              <button
                type="button"
                className="leave-dialog-close"
                aria-label="Close leave room dialog"
                onClick={() => setConfirmLeave(false)}
              >
                ×
              </button>
            </div>
            <p className="leave-dialog-copy">
              This clears local storage on this device and returns you to the join screen.
            </p>
            <div className="leave-dialog-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmLeave(false)}>
                Stay
              </button>
              <button type="button" className="btn btn--danger" onClick={doLeave}>
                Erase and leave
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
