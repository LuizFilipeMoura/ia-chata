import { useEffect, useState } from "react";
import { useRoomDispatch } from "../state/RoomStateContext";

export function LeaveRoomFab() {
  const dispatch = useRoomDispatch();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  const confirmLeave = () => {
    localStorage.clear();
    dispatch({ type: "clearSession" });
  };

  return (
    <>
      <button
        type="button"
        className="leave-fab"
        title="Leave room"
        aria-label="Leave room"
        onClick={() => setConfirmOpen(true)}
      >
        <span className="leave-fab-ic">⎋</span>
      </button>
      {confirmOpen ? (
        <div className="leave-dialog-scrim" onClick={() => setConfirmOpen(false)}>
          <section
            className="leave-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leaveDialogTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="leave-dialog-head">
              <div id="leaveDialogTitle" className="leave-dialog-title">
                Leave room
              </div>
              <button
                type="button"
                className="leave-dialog-close"
                aria-label="Close leave room dialog"
                onClick={() => setConfirmOpen(false)}
              >
                ×
              </button>
            </div>
            <p className="leave-dialog-copy">
              This clears local storage on this device and returns you to the join screen.
            </p>
            <div className="leave-dialog-actions">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmOpen(false)}>
                Stay
              </button>
              <button type="button" className="btn btn--danger" onClick={confirmLeave}>
                Erase and leave
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
