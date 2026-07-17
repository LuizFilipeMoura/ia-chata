import { moveBudget, spatial } from "/shared/game-state.js";
import { findPath } from "/shared/pathfind.js";
import { terrainPolygons, radiusOf } from "/shared/geometry.js";
import type { FieldState, Rig } from "../../state/types";

export interface MovePreview {
  reachable: boolean;
  path: Array<{ x: number; y: number }>;
  length: number;
  facing: number;
  pivot: number;
}

// Compute a move preview using the SAME geometry the engine validates with, so
// the on-map affordance can never disagree with the server's ruling. `dest` is
// in field inches. Facing defaults to the heading toward dest; callers may
// override and clamp to ±90° before dispatch.
export function computeMovePreview(
  field: FieldState,
  allRigs: Rig[],
  mover: Rig,
  action: "move" | "sprint",
  dest: { x: number; y: number },
): MovePreview {
  const from = mover.pos ?? { x: 0, y: 0 };
  const polys = terrainPolygons(field as never);
  const blockers = allRigs
    .filter((r) => r.id !== mover.id && !r.destroyed && r.pos)
    .map((r) => spatial(r as never));
  const budget = moveBudget(mover as never, action);
  const route = findPath(field as never, polys, blockers, radiusOf(mover as never), from, dest) as
    | { path: Array<{ x: number; y: number }>; length: number }
    | null;

  const dx = dest.x - from.x;
  const dy = dest.y - from.y;
  const moved = Math.hypot(dx, dy);
  const heading = moved < 1e-6 ? (mover.facing ?? 0) : (Math.atan2(dy, dx) * 180) / Math.PI;
  const cur = mover.facing ?? 0;
  const pivot = Math.abs(((heading - cur + 540) % 360) - 180);

  if (!route || route.length > budget + 1e-6) {
    return { reachable: false, path: route?.path ?? [from, dest], length: route?.length ?? Infinity, facing: heading, pivot };
  }
  return { reachable: true, path: route.path, length: route.length, facing: heading, pivot };
}
