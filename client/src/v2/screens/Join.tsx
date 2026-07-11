import { useState } from "react";
import "../styles/join.css";

interface Props {
  onJoin: (room: string, name: string, side: string) => void;
  error: string;
}

export function Join({ onJoin, error }: Props) {
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [side, setSide] = useState("a");

  const ready = room.trim().length > 0 && !!side;
  const status = ready
    ? "◈ ALL SYSTEMS NOMINAL — READY TO ENLIST"
    : "Enter a room code to enlist.";

  const submit = () => {
    if (ready) onJoin(room.trim().toUpperCase(), name.trim(), side);
  };

  return (
    <div className="v2-root">
      <section className="v2-join">
        <div className="v2-join-card">
          <div className="v2-join-rivet v2-join-rivet--l" aria-hidden="true" />
          <div className="v2-join-rivet v2-join-rivet--r" aria-hidden="true" />
          <div className="v2-join-hazard" aria-hidden="true" />

          <div className="v2-join-head">
            <div className="v2-join-title">
              OIL<span>&amp;</span>IRON
            </div>
            <div className="v2-join-tagline">ENLIST · COMMISSION · DEPLOY</div>
          </div>

          <div className="v2-join-rule" aria-hidden="true" />

          <label className="v2-join-label" htmlFor="v2Room">
            Battle Room Code
          </label>
          <div className="v2-join-field">
            <span className="v2-join-ic" aria-hidden="true">◈</span>
            <input
              id="v2Room"
              className="v2-join-input v2-join-input--code"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
          </div>

          <label className="v2-join-label" htmlFor="v2Name">
            Commander Designation
          </label>
          <div className="v2-join-field">
            <span className="v2-join-ic" aria-hidden="true">▸</span>
            <input
              id="v2Name"
              className="v2-join-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="v2-join-label">Declare Allegiance</div>
          <div className="v2-join-sides">
            <button
              type="button"
              className={"v2-side v2-side--a" + (side === "a" ? " is-sel" : "")}
              aria-pressed={side === "a"}
              onClick={() => setSide("a")}
            >
              <div className="v2-side-tag">SIDE · A</div>
              <div className="v2-side-name">FRIENDLY</div>
            </button>
            <button
              type="button"
              className={"v2-side v2-side--b" + (side === "b" ? " is-sel" : "")}
              aria-pressed={side === "b"}
              onClick={() => setSide("b")}
            >
              <div className="v2-side-tag">SIDE · B</div>
              <div className="v2-side-name">HOSTILE</div>
            </button>
          </div>

          <button
            type="button"
            className="v2-join-cta"
            disabled={!ready}
            onClick={submit}
          >
            Enter The Yard ▸
          </button>

          {error ? (
            <p className="v2-join-status v2-join-status--err">{error}</p>
          ) : (
            <p className="v2-join-status">{status}</p>
          )}
        </div>
      </section>
    </div>
  );
}
