import { useRoomState } from "../../state/RoomStateContext";
import { useMySide } from "../../hooks/useMySide";
import { useImpersonation } from "../state/ImpersonationContext";

// Only rendered in seeded test rooms. Toggling flips the app-wide acting side
// (view + every command's `side`), letting a tester drive the enemy's turn.
export function ImpersonateChip() {
  const { seeded } = useRoomState();
  const { setActingSide } = useImpersonation();
  const active = useMySide();
  if (!seeded) return null;
  return (
    <div className="v2-impersonate" role="group" aria-label="Impersonate side">
      <span className="v2-impersonate-label v2-eyebrow">Acting as</span>
      <button
        type="button"
        className="v2-impersonate-btn"
        aria-pressed={active === "a"}
        onClick={() => setActingSide("a")}
      >
        A
      </button>
      <button
        type="button"
        className="v2-impersonate-btn"
        aria-pressed={active === "b"}
        onClick={() => setActingSide("b")}
      >
        B
      </button>
    </div>
  );
}
