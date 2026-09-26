// Movement routing for digital rooms. An occupancy grid over the field with
// obstacles inflated by the mover's base radius, so the mover is a POINT
// against fat obstacles, the standard trick, and it makes the swept-corridor
// check free (a point that never enters an inflated obstacle is a circle that
// never touches the real one).
//
// Pure and deterministic: same inputs, same grid, always. Depends only on
// geometry.js. A* runs on top of this grid in a later task.
import { distToPolygon } from "./geometry.js";

export const CELL = 0.25; // inches per grid cell

// An occupancy grid for ONE mover. `polys` are terrain (geometry.terrainPolygons),
// `blockers` are the other rigs ({ pos, radius }), the mover itself must not be
// in that list. Objectives are never passed: they are markers, not obstacles.
// Terrain-only occupancy is identical for every call that shares (terrain, size,
// radius), which is every probe of a whole game. Cache it keyed on the polys'
// geometry so the bot's thousands of path queries pay the rasterisation once.
const terrainCache = new Map();
function terrainMask(field, polys, radius, cols, rows) {
  const key = `${field.width}x${field.height}|${radius}|` + polys.map((p) => p.points.map((q) => q.join(",")).join(";")).join("|");
  const hit = terrainCache.get(key);
  if (hit) return hit;
  const mask = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL, y = r * CELL;
      // The base must sit wholly on the table.
      if (x < radius || y < radius || x > field.width - radius || y > field.height - radius) mask[r * cols + c] = 1;
    }
  }
  // Only the cells inside each polygon's radius-inflated bounding box can be
  // within `radius` of it, test those, not the whole table.
  for (const poly of polys) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly.points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const c0 = Math.max(0, Math.floor((minX - radius) / CELL)), c1 = Math.min(cols - 1, Math.ceil((maxX + radius) / CELL));
    const r0 = Math.max(0, Math.floor((minY - radius) / CELL)), r1 = Math.min(rows - 1, Math.ceil((maxY + radius) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (!mask[i] && distToPolygon({ x: c * CELL, y: r * CELL }, poly.points) <= radius) mask[i] = 1;
      }
    }
  }
  if (terrainCache.size > 64) terrainCache.clear();
  terrainCache.set(key, mask);
  return mask;
}

// An occupancy grid for ONE mover. `polys` are terrain (geometry.terrainPolygons),
// `blockers` are the other rigs ({ pos, radius }), the mover itself must not be
// in that list. Objectives are never passed: they are markers, not obstacles.
// `from` (optional): where the mover stands now. A base it's already touching
// (or, after a shove or a drop-in, overlapping) is inflated only up to the
// current gap, so the mover can always back away from it, but never get
// closer or pass through it.
export function buildGrid(field, polys, blockers, radius, from = null) {
  const cols = Math.ceil(field.width / CELL) + 1;
  const rows = Math.ceil(field.height / CELL) + 1;
  const blocked = terrainMask(field, polys, radius, cols, rows).slice();
  for (const b of blockers) {
    let reach = radius + b.radius;
    if (from) reach = Math.min(reach, Math.hypot(from.x - b.pos.x, from.y - b.pos.y) - CELL);
    const c0 = Math.max(0, Math.floor((b.pos.x - reach) / CELL)), c1 = Math.min(cols - 1, Math.ceil((b.pos.x + reach) / CELL));
    const r0 = Math.max(0, Math.floor((b.pos.y - reach) / CELL)), r1 = Math.min(rows - 1, Math.ceil((b.pos.y + reach) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (Math.hypot(c * CELL - b.pos.x, r * CELL - b.pos.y) <= reach) blocked[r * cols + c] = 1;
      }
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

// True when the straight segment a->b crosses no blocked cell. Used to
// string-pull the jagged grid path back to real straight runs.
function clearLine(grid, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 2));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    if (isBlocked(grid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

// Greedy string-pulling: keep the farthest waypoint still reachable in a
// straight line. A raw 8-connected path zig-zags, and its length would
// OVERSTATE the real travel, which matters, because length is what gets
// checked against Speed.
function simplify(grid, pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    // Floor of i + 1 keeps the adjacent hop even if clearLine rejects it, so
    // `i` strictly increases and the loop always terminates.
    let j = pts.length - 1;
    while (j > i + 1 && !clearLine(grid, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function pathLength(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

// Route `from` -> `to` across an ALREADY-BUILT grid. Returns { path, length } in
// inches, or null when the destination is unreachable or off the table. Split
// out from findPath because the hover preview re-routes on every mousemove
// against an unchanged grid, rebuilding ~31k cells each time would stutter.
// Deterministic: the open set is drained in a fixed order, so ties always break
// the same way.
export function findPathOnGrid(grid, from, to) {
  const start = cellOf(from);
  const goal = cellOf(to);
  const idx = (c, r) => r * grid.cols + c;
  if (isBlocked(grid, to)) return null;

  const startI = idx(start.c, start.r);
  const goalI = idx(goal.c, goal.r);
  // A 0-inch move is legal (pivot in place). Still return two points, so every
  // caller can draw a path and read path[0]/path[at end] without a special case.
  if (startI === goalI) return { path: [{ ...from }, { ...to }], length: pathLength([from, to]) };

  const g = new Float64Array(grid.cols * grid.rows).fill(Infinity);
  const came = new Int32Array(grid.cols * grid.rows).fill(-1);
  const done = new Uint8Array(grid.cols * grid.rows);
  const h = (c, r) => Math.hypot(c - goal.c, r - goal.r);
  g[startI] = 0;

  // Simple binary heap keyed on f = g + h.
  const heap = [{ i: startI, f: h(start.c, start.r) }];
  const push = (n) => {
    heap.push(n);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p].f <= heap[k].f) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r2 = l + 1;
        let s = k;
        if (l < heap.length && heap[l].f < heap[s].f) s = l;
        if (r2 < heap.length && heap[r2].f < heap[s].f) s = r2;
        if (s === k) break;
        [heap[s], heap[k]] = [heap[k], heap[s]];
        k = s;
      }
    }
    return top;
  };

  while (heap.length) {
    const { i } = pop();
    if (done[i]) continue;
    done[i] = 1;
    if (i === goalI) break;
    const c = i % grid.cols;
    const r = (i - c) / grid.cols;
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const ni = idx(nc, nr);
      if (grid.blocked[ni] || done[ni]) continue;
      // No corner-cutting: a diagonal needs both orthogonal neighbours open.
      if (dc && dr && (grid.blocked[idx(c + dc, r)] || grid.blocked[idx(c, r + dr)])) continue;
      const tentative = g[i] + cost;
      if (tentative >= g[ni]) continue;
      g[ni] = tentative;
      came[ni] = i;
      push({ i: ni, f: tentative + h(nc, nr) });
    }
  }

  // Settled, not merely discovered: only a popped goal has a finished path.
  if (!done[goalI]) return null;

  const cells = [];
  for (let i = goalI; i !== -1; i = came[i]) {
    const c = i % grid.cols;
    cells.push({ x: c * CELL, y: ((i - c) / grid.cols) * CELL });
    if (i === startI) break;
  }
  cells.reverse();
  // Snap the ends to the true request so the preview matches the click exactly.
  cells[0] = { ...from };
  cells[cells.length - 1] = { ...to };
  const path = simplify(grid, cells);
  return { path, length: pathLength(path) };
}

// Route `from` -> `to` for a mover of `radius`, building the grid first.
export function findPath(field, polys, blockers, radius, from, to) {
  return findPathOnGrid(buildGrid(field, polys, blockers, radius, from), from, to);
}
