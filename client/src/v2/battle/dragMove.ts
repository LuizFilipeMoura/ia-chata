import { moveBudget } from "/shared/game-state.js";
import { computeMovePreview } from "./movePreview";
import type { FieldState, Rig } from "../../state/types";

export interface Placed {
  dest: { x: number; y: number };
  facing: number;
  pivot: number;
  length: number;
  path: Array<{ x: number; y: number }>;
  action: "move" | "sprint";
}

type Pt = { x: number; y: number };

// Clamp a desired heading to the engine's ±90° pivot budget from `cur`, and
// report the resulting pivot magnitude. The digital-move handler rejects a
// facing that pivots more than 90°, so the affordance never offers one.
export function clampToPivot(target: number, cur: number): { facing: number; pivot: number } {
  const delta = ((target - cur + 540) % 360) - 180;
  const clamped = Math.max(-90, Math.min(90, delta));
  return { facing: cur + clamped, pivot: Math.abs(clamped) };
}

// Which action a drop distance selects: sprint only once past the move ring, and
// only when the engine actually allows sprinting this activation.
export function actionForDistance(dist: number, moveB: number, sprintAllowed: boolean): "move" | "sprint" {
  return sprintAllowed && dist > moveB ? "sprint" : "move";
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// Walk inward from `dest` toward `origin` for the farthest point whose routed
// path is within budget — terrain can push the route past the ring even when the
// straight line fits. Bounded binary search; origin is always reachable (0").
function farthestReachable(field: FieldState, rigs: Rig[], rig: Rig, action: "move" | "sprint", origin: Pt, dest: Pt) {
  let lo = 0, hi = 1;
  let best = { dest: origin, preview: computeMovePreview(field, rigs, rig, action, origin) };
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const p = lerp(origin, dest, mid);
    const pv = computeMovePreview(field, rigs, rig, action, p);
    if (pv.reachable) { best = { dest: p, preview: pv }; lo = mid; } else hi = mid;
  }
  return best;
}

// Turn a raw cursor point (field inches) into a legal placed move: pick move vs
// sprint by ring, clamp to that action's reach radius, then clamp again to a
// terrain-routable point. Facing tracks the drag heading, pivot-clamped.
export function placeDrag(
  field: FieldState, rigs: Rig[], rig: Rig, rawDest: Pt, sprintAllowed: boolean,
): Placed {
  const origin: Pt = rig.pos ?? { x: 0, y: 0 };
  const moveB = moveBudget(rig as never, "move");
  const dx = rawDest.x - origin.x, dy = rawDest.y - origin.y;
  const dist = Math.hypot(dx, dy);
  // Action is chosen from the straight-line distance to the raw point, not the
  // routed length: the player picks move vs sprint by which ring they drop into,
  // and the live readout shows the clamped result — so terrain forcing a detour
  // clamps the move shorter rather than silently upgrading to a +heat sprint.
  const action = actionForDistance(dist, moveB, sprintAllowed);
  const maxR = moveBudget(rig as never, action);
  const ringDest = dist > maxR && dist > 1e-6
    ? { x: origin.x + (dx / dist) * maxR, y: origin.y + (dy / dist) * maxR }
    : rawDest;
  let dest = ringDest;
  let preview = computeMovePreview(field, rigs, rig, action, dest);
  if (!preview.reachable) {
    const best = farthestReachable(field, rigs, rig, action, origin, ringDest);
    dest = best.dest; preview = best.preview;
  }
  const { facing, pivot } = clampToPivot(preview.facing, rig.facing ?? 0);
  return { dest, facing, pivot, length: preview.length, path: preview.path, action };
}
