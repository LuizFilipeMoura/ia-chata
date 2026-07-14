import { useState, type CSSProperties } from "react";
import "../styles/join.css";
import { SEED_PRESETS, type SeedPreset } from "./seedPreset";

interface Props {
  onJoin: (room: string, name: string, side: string) => void;
  error: string;
  onSeed?: (first: "a" | "b", preset: SeedPreset) => void;
}

export function Join({ onJoin, error, onSeed }: Props) {
  const [room, setRoom] = useState("");
  const [name, setName] = useState("");
  const [side, setSide] = useState("a");
  const [seeding, setSeeding] = useState(false);
  const [preset, setPreset] = useState<SeedPreset>("support");

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
          <div className="v2-rivet v2-join-rivet v2-join-rivet--l" aria-hidden="true" />
          <div className="v2-rivet v2-join-rivet v2-join-rivet--r" aria-hidden="true" />
          <div
            className="v2-join-hazard v2-hazard"
            aria-hidden="true"
            style={{ "--v2-hazard-w": "11px", "--v2-hazard-accent": "var(--v2-oil-deep)" } as CSSProperties}
          />

          <div className="v2-join-head">
            <div className="v2-join-title v2-title">
              OIL<span>&amp;</span>IRON
            </div>
            <div className="v2-join-tagline v2-eyebrow">ENLIST · COMMISSION · DEPLOY</div>
          </div>

          <div className="v2-join-rule" aria-hidden="true" />

          <label className="v2-join-label v2-eyebrow" htmlFor="v2Room">
            Battle Room Code
          </label>
          <div className="v2-join-field v2-well">
            <span className="v2-join-ic" aria-hidden="true">◈</span>
            <input
              id="v2Room"
              className="v2-join-input v2-join-input--code"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
          </div>

          <label className="v2-join-label v2-eyebrow" htmlFor="v2Name">
            Commander Designation
          </label>
          <div className="v2-join-field v2-well">
            <span className="v2-join-ic" aria-hidden="true">▸</span>
            <input
              id="v2Name"
              className="v2-join-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="v2-join-label v2-eyebrow">Declare Allegiance</div>
          <div className="v2-join-sides">
            <button
              type="button"
              className={"v2-side v2-side--a" + (side === "a" ? " is-sel" : "")}
              aria-pressed={side === "a"}
              onClick={() => setSide("a")}
            >
              <div className="v2-side-tag v2-eyebrow">SIDE · A</div>
              <div className="v2-side-name">FRIENDLY</div>
            </button>
            <button
              type="button"
              className={"v2-side v2-side--b" + (side === "b" ? " is-sel" : "")}
              aria-pressed={side === "b"}
              onClick={() => setSide("b")}
            >
              <div className="v2-side-tag v2-eyebrow">SIDE · B</div>
              <div className="v2-side-name">HOSTILE</div>
            </button>
          </div>

          <button
            type="button"
            className="v2-join-cta v2-cta"
            disabled={!ready}
            onClick={submit}
          >
            Enter The Yard ▸
          </button>

          {onSeed && !seeding && (
            <button
              type="button"
              className="v2-join-seed"
              onClick={() => setSeeding(true)}
            >
              Seed Test Battle ▸
            </button>
          )}

          {onSeed && seeding && (
            <div className="v2-join-seedpick" role="group" aria-label="Seed a test battle">
              <div className="v2-join-label v2-eyebrow">Roster preset</div>
              <div className="v2-join-presets">
                {SEED_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={"v2-join-seedbtn v2-join-preset" + (preset === p.id ? " is-sel" : "")}
                    aria-pressed={preset === p.id}
                    onClick={() => setPreset(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="v2-join-label v2-eyebrow">Who acts first?</div>
              <button type="button" className="v2-join-seedbtn" onClick={() => onSeed("a", preset)}>
                Your turn
              </button>
              <button type="button" className="v2-join-seedbtn" onClick={() => onSeed("b", preset)}>
                Enemies turn
              </button>
              <button type="button" className="v2-join-seedcancel" onClick={() => setSeeding(false)}>
                Cancel
              </button>
            </div>
          )}

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
