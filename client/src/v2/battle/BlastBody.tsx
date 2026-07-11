import { useState } from "react";
import type { Rig } from "../../state/types";
import "../styles/overlay.css";

// Checkbox list for blast resolution: the controller ticks the Rigs standing
// within 12" of the wreck. Owns a local version counter so ticking re-renders;
// mirrors each pick into the caller's `picked` Set for the Confirm handler.
export default function BlastBody({
  candidates, picked,
}: {
  candidates: Rig[];
  picked: Set<string>;
}) {
  const [, force] = useState(0);
  return (
    <>
      <p className="v2-dwr-hint">
        Select every Rig within 12" of the wreck — each takes a D6 + STR 10 blast hit.
      </p>
      <div className="v2-blast-list">
        {candidates.map((r) => {
          const on = picked.has(r.name);
          return (
            <button
              key={r.id}
              type="button"
              className={"v2-blast-opt" + (on ? " sel" : "")}
              aria-pressed={on}
              onClick={() => {
                if (on) picked.delete(r.name);
                else picked.add(r.name);
                force((n) => n + 1);
              }}
            >
              <span className="v2-blast-opt-check" aria-hidden="true">{on ? "☑" : "☐"}</span>
              <span className="v2-blast-opt-name">{r.name}</span>
              <span className="v2-blast-opt-cls">{r.weightClass}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
