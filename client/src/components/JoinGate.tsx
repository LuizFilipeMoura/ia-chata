import { useMemo, useState } from "react";

interface Props {
  onJoin: (room: string, name: string, side: string) => Promise<void> | void;
  error?: string;
  /** Dev-only: when provided, renders a button that opens the /test debug harness. */
  onOpenTest?: () => void;
}

export function JoinGate({ onJoin, error, onOpenTest }: Props) {
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [side, setSide] = useState<string | null>(null);

  const hint = useMemo(() => {
    if (!room.trim()) return "Enter a room code.";
    if (!name.trim()) return "Enter your name.";
    if (!side) return "Pick a side to continue.";
    return "Ready — tap Enter room.";
  }, [room, name, side]);
  const ready = Boolean(room.trim() && side);

  return (
    <div className="join-gate">
      <div className="join-card">
        <h1 className="join-title">OIL <i>&amp;</i> IRON</h1>
        <p className="join-sub">Enter a battle room</p>
        <input className="join-input" placeholder="Room code (e.g. IRON42)" autoComplete="off"
          value={room} onChange={(e) => setRoom(e.target.value)} />
        <input className="join-input" placeholder="Your name" autoComplete="off"
          value={name} onChange={(e) => setName(e.target.value)} />
        <div className="join-sides">
          <button className={`join-side${side === "a" ? " active" : ""}`} type="button"
            onClick={() => setSide("a")}>You (Side A)</button>
          <button className={`join-side${side === "b" ? " active" : ""}`} type="button"
            onClick={() => setSide("b")}>Enemy (Side B)</button>
        </div>
        <button className="join-btn btn btn--primary" type="button" disabled={!ready}
          onClick={() => onJoin(room.trim().toUpperCase(), name.trim() || "Player", side!)}>
          Enter room
        </button>
        <p className={`join-hint${hint.startsWith("Ready") ? " join-hint--go" : ""}`}>{hint}</p>
        <p className="join-err">{error ?? ""}</p>
        {onOpenTest && (
          <button className="join-test-btn btn" type="button" onClick={onOpenTest}>
            🛠 Debug Harness
          </button>
        )}
      </div>
    </div>
  );
}
