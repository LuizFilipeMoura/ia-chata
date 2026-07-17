import { useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { moveBudget, rigEffects } from "/shared/game-state.js";
import type { FieldState, Rig } from "../../state/types";
import type { FieldProjection } from "./fieldProjection";
import { computeMovePreview } from "./movePreview";

export interface Placed {
  dest: { x: number; y: number };
  facing: number;
  pivot: number;
  length: number;
  path: Array<{ x: number; y: number }>;
}

// Clamp a desired heading to the engine's ±90° pivot budget from the rig's
// current facing, and report the resulting pivot magnitude. The digital-move
// handler rejects a facing that pivots more than 90°, so the affordance can
// never offer one it can't dispatch.
function clampToPivot(target: number, cur: number): { facing: number; pivot: number } {
  const delta = ((target - cur + 540) % 360) - 180;
  const clamped = Math.max(-90, Math.min(90, delta));
  return { facing: cur + clamped, pivot: Math.abs(clamped) };
}

// Convert a DOM pointer position into field inches. The surface <rect> spans the
// field region EXACTLY, so the fraction across it is the fraction across the
// field in inches — no canvas padding is involved (subtracting `pad` here, as an
// earlier version did via proj.toInches on a canvas-scaled point, double-counted
// it: 0" error at centre, ±3" at the edges). Ratio-based, so it's CSS-scale
// invariant.
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
  action: "move" | "sprint";
  placed: Placed | null;
  onPlaced: (p: Placed | null) => void;
}

// SVG-namespaced overlay rendered inside BattleMap's <svg> (via its `overlay`
// slot): a reach ring, a transparent click surface, and once a destination is
// placed, the routed path, a ghost token, and a draggable facing handle.
export function MoveTargetOverlay({ proj, field, rigs, rig, action, placed, onPlaced }: OverlayProps) {
  const [drag, setDrag] = useState(false);
  const surfaceRef = useRef<SVGRectElement>(null);
  if (!rig.pos) return null;

  const cx = proj.sx(rig.pos.x);
  const cy = proj.sy(rig.pos.y);
  const ringR = moveBudget(rig as never, action) * proj.scale;

  const place = (e: ReactMouseEvent<SVGRectElement>) => {
    const dest = pointToInches(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), field);
    const preview = computeMovePreview(field, rigs, rig, action, dest);
    if (!preview.reachable) return; // out of reach / blocked — ignore the tap
    const { facing, pivot } = clampToPivot(preview.facing, rig.facing ?? 0);
    onPlaced({ dest, facing, pivot, length: preview.length, path: preview.path });
  };

  // Facing drag. The handle captures the pointer on down, so pointermove/up keep
  // firing on it even after the cursor leaves the tiny handle (or the whole
  // field). Convert against the SURFACE rect (the field box), not the handle's.
  const startDrag = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(true);
  };
  const onDragMove = (e: ReactPointerEvent<SVGCircleElement>) => {
    if (!drag || !placed || !surfaceRef.current) return;
    const p = pointToInches(e.clientX, e.clientY, surfaceRef.current.getBoundingClientRect(), field);
    const ang = (Math.atan2(p.y - placed.dest.y, p.x - placed.dest.x) * 180) / Math.PI;
    const { facing, pivot } = clampToPivot(ang, rig.facing ?? 0);
    onPlaced({ ...placed, facing, pivot });
  };
  const endDrag = (e: ReactPointerEvent<SVGCircleElement>) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDrag(false);
  };

  const gcx = placed ? proj.sx(placed.dest.x) : cx;
  const gcy = placed ? proj.sy(placed.dest.y) : cy;
  const fr = ((placed?.facing ?? rig.facing ?? 0) * Math.PI) / 180;
  const hx = gcx + Math.cos(fr) * 22;
  const hy = gcy + Math.sin(fr) * 22;

  return (
    <g className="v2-mt">
      <circle cx={cx} cy={cy} r={ringR} className="v2-mt-ring" fill="none" data-testid="reach-ring" />
      <rect
        ref={surfaceRef}
        data-testid="field-surface"
        x={proj.pad}
        y={proj.pad}
        width={proj.fw}
        height={proj.fh}
        fill="transparent"
        style={{ cursor: "crosshair", touchAction: "none" }}
        onClick={place}
      />
      {placed && (
        <>
          <polyline
            className="v2-mt-path"
            points={placed.path.map((pt) => `${proj.sx(pt.x)},${proj.sy(pt.y)}`).join(" ")}
            fill="none"
          />
          <circle cx={gcx} cy={gcy} r={12} className="v2-mt-ghost" />
          <line x1={gcx} y1={gcy} x2={hx} y2={hy} className="v2-mt-facing" />
          <circle
            cx={hx}
            cy={hy}
            r={6}
            className="v2-mt-handle"
            data-testid="facing-handle"
            style={{ cursor: "grab", touchAction: "none" }}
            onPointerDown={startDrag}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
          />
        </>
      )}
    </g>
  );
}

interface ControlsProps {
  rig: Rig;
  action: "move" | "sprint";
  placed: Placed | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// HTML controls docked below the map: a live readout of the placed move and the
// Cancel / Confirm actions. Confirm stays disabled until a reachable
// destination has been placed.
export function MoveTargetControls({ rig, action, placed, onConfirm, onCancel }: ControlsProps) {
  const heat = action === "sprint" ? (rigEffects(rig as never).actionHeat?.sprint ?? 2) : 1;
  const verb = action === "sprint" ? "sprint" : "move";
  return (
    <div className="v2-mt-controls">
      <div className="v2-mt-readout">
        {placed
          ? `${verb} ${placed.length.toFixed(1)}″ · pivot ${Math.round(placed.pivot)}° · +${heat}🔥`
          : `Tap the field to place ${rig.name}'s destination`}
      </div>
      <div className="v2-mt-buttons">
        <button type="button" className="v2-mt-btn ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="v2-mt-btn primary" disabled={!placed} onClick={onConfirm}>Confirm</button>
      </div>
    </div>
  );
}
