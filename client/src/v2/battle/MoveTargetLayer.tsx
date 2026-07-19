import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { moveBudget, rigEffects } from "/shared/game-state.js";
import type { FieldState, Rig } from "../../state/types";
import type { FieldProjection } from "./fieldProjection";
import { clampToPivot, placeDrag, type Placed } from "./dragMove";

// Re-export so existing importers (BattleScreen) keep their `Placed` source.
export type { Placed };

// Convert a DOM pointer position into field inches against the surface <rect>,
// which spans the field region EXACTLY — so the fraction across it is the
// fraction across the field. Ratio-based, so it's CSS-scale invariant.
function pointToInches(clientX: number, clientY: number, rect: DOMRect, field: FieldState) {
  const fx = rect.width ? (clientX - rect.left) / rect.width : 0;
  const fy = rect.height ? (clientY - rect.top) / rect.height : 0;
  return { x: fx * field.width, y: fy * field.height };
}

interface OverlayProps {
  proj: FieldProjection;
  field: FieldState;
  rigs: Rig[];
  rig: Rig;
  sprintAllowed: boolean;
  placed: Placed | null;
  onPlaced: (p: Placed | null) => void;
}

// SVG overlay rendered inside BattleMap's <svg>: two reach rings (inner move,
// outer sprint), a grab handle on the active rig that drags a clamped ghost to a
// destination, and — once placed — the routed path and a facing handle to re-aim.
export function MoveTargetOverlay({ proj, field, rigs, rig, sprintAllowed, placed, onPlaced }: OverlayProps) {
  const [dragging, setDragging] = useState(false);
  const [aiming, setAiming] = useState(false);
  const surfaceRef = useRef<SVGRectElement>(null);
  if (!rig.pos) return null;

  const cx = proj.sx(rig.pos.x);
  const cy = proj.sy(rig.pos.y);
  const moveR = moveBudget(rig as never, "move") * proj.scale;
  const sprintR = moveBudget(rig as never, "sprint") * proj.scale;

  const surfaceRect = () => surfaceRef.current!.getBoundingClientRect();

  // --- Drag the rig to a destination -------------------------------------
  const updateFromPointer = (clientX: number, clientY: number) => {
    const raw = pointToInches(clientX, clientY, surfaceRect(), field);
    onPlaced(placeDrag(field, rigs, rig, raw, sprintAllowed));
  };
  const startDrag = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    updateFromPointer(e.clientX, e.clientY);
  };
  const onDragMove = (e: ReactPointerEvent<SVGCircleElement>) => {
    if (dragging) updateFromPointer(e.clientX, e.clientY);
  };
  const endDrag = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };

  // --- Re-aim after release ----------------------------------------------
  const startAim = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setAiming(true);
  };
  const onAimMove = (e: ReactPointerEvent<SVGCircleElement>) => {
    if (!aiming || !placed) return;
    const p = pointToInches(e.clientX, e.clientY, surfaceRect(), field);
    const ang = (Math.atan2(p.y - placed.dest.y, p.x - placed.dest.x) * 180) / Math.PI;
    const { facing, pivot } = clampToPivot(ang, rig.facing ?? 0);
    onPlaced({ ...placed, facing, pivot });
  };
  const endAim = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setAiming(false);
  };

  const gcx = placed ? proj.sx(placed.dest.x) : cx;
  const gcy = placed ? proj.sy(placed.dest.y) : cy;
  const fr = ((placed?.facing ?? rig.facing ?? 0) * Math.PI) / 180;
  const hx = gcx + Math.cos(fr) * 22;
  const hy = gcy + Math.sin(fr) * 22;

  return (
    <g className="v2-mt">
      {sprintAllowed && (
        <circle cx={cx} cy={cy} r={sprintR} className="v2-mt-ring is-sprint" fill="none" data-testid="sprint-ring" />
      )}
      <circle cx={cx} cy={cy} r={moveR} className="v2-mt-ring" fill="none" data-testid="reach-ring" />

      {/* Coordinate reference only; never intercepts pointers. */}
      <rect
        ref={surfaceRef}
        data-testid="field-surface"
        x={proj.pad}
        y={proj.pad}
        width={proj.fw}
        height={proj.fh}
        fill="transparent"
        style={{ pointerEvents: "none" }}
      />

      {placed && (
        <>
          <polyline
            className="v2-mt-path"
            points={placed.path.map((pt) => `${proj.sx(pt.x)},${proj.sy(pt.y)}`).join(" ")}
            fill="none"
          />
          <circle cx={gcx} cy={gcy} r={12} className="v2-mt-ghost" />
        </>
      )}

      {/* Grab the active rig and drag it. Rendered above the surface so a
          pointer-down on the token starts the drag session. */}
      <circle
        cx={cx}
        cy={cy}
        r={14}
        className="v2-mt-grab"
        data-testid="drag-handle"
        fill="transparent"
        style={{ cursor: "grab", touchAction: "none" }}
        onPointerDown={startDrag}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
      />

      {placed && (
        <>
          <line x1={gcx} y1={gcy} x2={hx} y2={hy} className="v2-mt-facing" />
          <circle
            cx={hx}
            cy={hy}
            r={6}
            className="v2-mt-handle"
            data-testid="facing-handle"
            style={{ cursor: "grab", touchAction: "none" }}
            onPointerDown={startAim}
            onPointerMove={onAimMove}
            onPointerUp={endAim}
          />
        </>
      )}
    </g>
  );
}

interface ControlsProps {
  rig: Rig;
  placed: Placed | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// HTML controls docked below the map: a live readout of the placed move and the
// Cancel / Confirm actions. Confirm stays disabled until a destination is placed.
// The action shown is whatever the drag picked (`placed.action`); before a drop
// the readout is a static prompt, so no action is needed.
export function MoveTargetControls({ rig, placed, onConfirm, onCancel }: ControlsProps) {
  const act = placed?.action ?? "move";
  const heat = act === "sprint" ? (rigEffects(rig as never).actionHeat?.sprint ?? 2) : 1;
  return (
    <div className="v2-mt-controls">
      <div className="v2-mt-readout">
        {placed
          ? `${act} ${placed.length.toFixed(1)}″ · pivot ${Math.round(placed.pivot)}° · +${heat}🔥`
          : `Drag ${rig.name} to a destination`}
      </div>
      <div className="v2-mt-buttons">
        <button type="button" className="v2-mt-btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="v2-mt-btn primary" disabled={!placed} onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  );
}
