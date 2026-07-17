import type { ReactNode } from "react";
import type { FieldState, Rig } from "../../state/types";
import { makeProjection } from "./fieldProjection";
import "../styles/field.css";

export interface BattleMapProps {
  field: FieldState;
  rigs: Rig[];
  mySide: string;
  ownerSide: string | null;
  priorityTargetId: number | null;
  selectedId: number | null;
  onSelect: (rig: Rig) => void;
  onActivate: (rig: Rig) => void;
  activatable: (rig: Rig) => boolean;
  /** L3 overlay slot — the move-target layer renders here when arming a move. */
  overlay?: ReactNode;
}

// Inner presentational layer: renders inside a parent <svg> so it can be unit
// tested without a wrapping SVG element. Consumers use <BattleMap> (below).
export function BattleMapLayers(props: BattleMapProps) {
  const { field, rigs, mySide, priorityTargetId, selectedId, onSelect, onActivate, activatable } = props;
  const proj = makeProjection(field);
  const living = rigs.filter((r) => !r.destroyed && r.pos);

  return (
    <>
      <rect x={proj.pad} y={proj.pad} width={proj.fw} height={proj.fh} rx={8} className="v2-fm-field" />
      {living.map((r) => {
        const cx = proj.sx(r.pos!.x);
        const cy = proj.sy(r.pos!.y);
        const mine = (r.owner || "a") === mySide;
        const facing = (r.facing ?? 0) * (Math.PI / 180);
        const ax = cx + Math.cos(facing) * 12;
        const ay = cy + Math.sin(facing) * 12;
        return (
          <g
            key={r.id}
            data-testid="rig-token"
            data-activated={r.activated ? "true" : "false"}
            data-mine={mine ? "true" : "false"}
            data-selected={selectedId === r.id ? "true" : "false"}
            className={
              "v2-bm-token" +
              (mine ? " is-mine" : " is-foe") +
              (r.activated ? " is-spent" : "") +
              (selectedId === r.id ? " is-selected" : "")
            }
            onClick={() => {
              if (activatable(r)) onActivate(r);
              else onSelect(r);
            }}
          >
            {priorityTargetId === r.id && (
              <circle data-testid="priority-ring" cx={cx} cy={cy} r={16} className="v2-bm-priority" fill="none" />
            )}
            <circle cx={cx} cy={cy} r={12} className="v2-bm-dot" />
            <line x1={cx} y1={cy} x2={ax} y2={ay} className="v2-bm-facing" />
            <text x={cx} y={cy + 3} textAnchor="middle" className="v2-bm-label">{r.name[0]}</text>
          </g>
        );
      })}
      {props.overlay}
    </>
  );
}

export function BattleMap(props: BattleMapProps) {
  const proj = makeProjection(props.field);
  return (
    <svg className="v2-bm" viewBox={`0 0 ${proj.canvasW} ${proj.canvasH}`} role="img" aria-label="Battlefield">
      <BattleMapLayers {...props} />
    </svg>
  );
}
