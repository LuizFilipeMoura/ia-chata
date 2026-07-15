// Movement routing for digital rooms. An occupancy grid over the field with
// obstacles inflated by the mover's base radius, so the mover is a POINT
// against fat obstacles — the standard trick, and it makes the swept-corridor
// check free (a point that never enters an inflated obstacle is a circle that
// never touches the real one).
//
// Pure and deterministic: same inputs, same grid, always. Depends only on
// geometry.js. A* runs on top of this grid in a later task.
import { distToPolygon } from "./geometry.js";

export const CELL = 0.25; // inches per grid cell

// An occupancy grid for ONE mover. `polys` are terrain (geometry.terrainPolygons),
// `blockers` are the other rigs ({ pos, radius }) — the mover itself must not be
// in that list. Objectives are never passed: they are markers, not obstacles.
export function buildGrid(field, polys, blockers, radius) {
  const cols = Math.ceil(field.width / CELL) + 1;
  const rows = Math.ceil(field.height / CELL) + 1;
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { x: c * CELL, y: r * CELL };
      let bad = false;
      // The base must sit wholly on the table.
      if (p.x < radius || p.y < radius || p.x > field.width - radius || p.y > field.height - radius) bad = true;
      if (!bad) for (const poly of polys) {
        if (distToPolygon(p, poly.points) <= radius) { bad = true; break; }
      }
      if (!bad) for (const b of blockers) {
        if (Math.hypot(p.x - b.pos.x, p.y - b.pos.y) <= radius + b.radius) { bad = true; break; }
      }
      if (bad) blocked[r * cols + c] = 1;
    }
  }
  return { cols, rows, blocked, field };
}

export function cellOf(p) {
  return { c: Math.round(p.x / CELL), r: Math.round(p.y / CELL) };
}

export function isBlocked(grid, p) {
  const { c, r } = cellOf(p);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return true;
  return grid.blocked[r * grid.cols + c] === 1;
}
