import type { FieldState } from "../../state/types";

// One source of truth for inches↔px on the battlefield SVG. Both the pre-battle
// FieldMap and the battle BattleMap render through this so their coordinates
// can never drift. Extracted verbatim from FieldMap's original constants.
export const PAD = 26;
export const CANVAS_W = 520;

export interface FieldProjection {
  pad: number;
  scale: number;
  canvasW: number;
  canvasH: number;
  fw: number;
  fh: number;
  sx: (xIn: number) => number;
  sy: (yIn: number) => number;
  toInches: (px: number, py: number) => { x: number; y: number };
}

export function makeProjection(field: FieldState): FieldProjection {
  const scale = (CANVAS_W - PAD * 2) / field.width;
  const fw = field.width * scale;
  const fh = field.height * scale;
  return {
    pad: PAD,
    scale,
    canvasW: CANVAS_W,
    canvasH: fh + PAD * 2,
    fw,
    fh,
    sx: (xIn: number) => PAD + xIn * scale,
    sy: (yIn: number) => PAD + yIn * scale,
    toInches: (px: number, py: number) => ({ x: (px - PAD) / scale, y: (py - PAD) / scale }),
  };
}
