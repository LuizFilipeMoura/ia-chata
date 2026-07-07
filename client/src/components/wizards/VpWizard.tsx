import { useEffect, useRef, useState } from "react";
import { useRoomState } from "../../state/RoomStateContext";
import { useCommands } from "../../hooks/useCommands";
import { useMySide } from "../../hooks/useMySide";
import type { Objective } from "../../state/types";

// Label a marker for the picker: the 2-VP centre, or a corner tagged with a
// compass hint (NW/NE/SW/SE) from its offset off the centre marker, so the two
// 1-VP corners are distinguishable and line up with the FieldMap.
function markerLabel(objectives: Objective[], i: number): { name: string; hint: string } {
  const o = objectives[i];
  const centre = objectives.find((x) => x.vp >= 2) ?? objectives[0];
  if (o === centre || o.vp >= 2) return { name: "Centre", hint: "" };
  const vert = o.y < centre.y ? "N" : "S";
  const horiz = o.x < centre.x ? "W" : "E";
  return { name: "Corner", hint: `${vert}${horiz}` };
}

export function VpWizard({ onClose }: { onClose: () => void }) {
  const { game } = useRoomState();
  const sendCommand = useCommands();
  const mySide = useMySide();

  const objectives = game?.objectives ?? [];
  const conflict = new Set(game?.recoveryConflict ?? []);
  const round = game?.round ?? 1;

  // Prefill from any claim already submitted this Recovery (the re-check flow).
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(game?.recoveryClaims?.[mySide] ?? []),
  );

  const [show, setShow] = useState(false);
  const closing = useRef(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShow(false);
    setTimeout(onClose, 250);
  };

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const claims = [...selected].sort((x, y) => x - y);
  const total = claims.reduce((sum, i) => sum + (objectives[i]?.vp || 0), 0);

  const submit = () => {
    sendCommand("vp", { side: mySide, claims });
    close();
  };

  return (
    <div
      className={"aw-scrim" + (show ? " show" : "")}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="aw-card">
        <div className="aw-handle" />
        <div className="aw-title-row">
          <div className="aw-title">⟡ Score Objectives — Round {round}</div>
        </div>
        <p className="aw-field-desc">
          What points do you control? Tap each marker one of your Rigs holds
          (within 2", no enemy contesting).
        </p>

        <div className="vpw-list">
          {objectives.map((o, i) => {
            const { name, hint } = markerLabel(objectives, i);
            const sel = selected.has(i);
            const disputed = conflict.has(i);
            return (
              <button
                key={i}
                type="button"
                className={"vpw-opt" + (sel ? " sel" : "") + (disputed ? " disputed" : "")}
                onClick={() => toggle(i)}
              >
                <span className="vpw-vp">{o.vp}</span>
                <span className="vpw-name">{name}{hint ? ` · ${hint}` : ""}</span>
                <span className="vpw-state">{sel ? "You hold it" : "Not yours"}</span>
                {disputed ? (
                  <span className="vpw-warn">Both of you claimed this — one must change.</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="vpw-total">You'll score <b>{total}</b> VP</div>

        <button className="aw-go" onClick={submit}>Score {total} VP</button>
      </div>
    </div>
  );
}
