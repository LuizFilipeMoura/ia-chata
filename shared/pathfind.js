// Movement routing for digital rooms. An occupancy grid over the field with
// obstacles inflated by the mover's base radius, so the mover is a POINT
// against fat obstacles, the standard trick, and it makes the swept-corridor
// check free (a point that never enters an inflated obstacle is a circle that
// never touches the real one).
//
// Pure and deterministic: same inputs, same grid, always. Depends only on
// geometry.js.
//
// Friendly bases are pass-through: a blocker flagged `pass` never blocks the
// ROUTE, it only forbids ENDING the move on top of it (grid.stop).
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
// `blockers` are the other rigs ({ pos, radius, pass? }), the mover itself must
// not be in that list. Objectives are never passed: they are markers, not
// obstacles. A `pass` blocker (a friend) goes into `stop` instead of `blocked`:
// walk through it, just don't park on it.
// `from` (optional): where the mover stands now. A base it's already touching
// (or, after a shove or a drop-in, overlapping) is inflated only up to the
// current gap, so the mover can always back away from it, but never get
// closer or pass through it.
export function buildGrid(field, polys, blockers, radius, from = null) {
  const cols = Math.ceil(field.width / CELL) + 1;
  const rows = Math.ceil(field.height / CELL) + 1;
  const blocked = terrainMask(field, polys, radius, cols, rows).slice();
  const stop = new Uint8Array(cols * rows);
  for (const b of blockers) {
    const mask = b.pass ? stop : blocked;
    let reach = radius + b.radius;
    if (from) reach = Math.min(reach, Math.hypot(from.x - b.pos.x, from.y - b.pos.y) - CELL);
    const c0 = Math.max(0, Math.floor((b.pos.x - reach) / CELL)), c1 = Math.min(cols - 1, Math.ceil((b.pos.x + reach) / CELL));
    const r0 = Math.max(0, Math.floor((b.pos.y - reach) / CELL)), r1 = Math.min(rows - 1, Math.ceil((b.pos.y + reach) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (Math.hypot(c * CELL - b.pos.x, r * CELL - b.pos.y) <= reach) mask[r * cols + c] = 1;
      }
    }
  }
  return { cols, rows, blocked, stop, field };
}

export function cellOf(p) {
  return { c: Math.round(p.x / CELL), r: Math.round(p.y / CELL) };
}

export function isBlocked(grid, p) {
  const { c, r } = cellOf(p);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return true;
  return grid.blocked[r * grid.cols + c] === 1;
}

// True when the mover may not END here: blocked, or on top of a friendly base.
export function isStopBlocked(grid, p) {
  if (isBlocked(grid, p)) return true;
  const { c, r } = cellOf(p);
  return grid.stop?.[r * grid.cols + c] === 1;
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

export function pathLength(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return n;
}

// Binary min-heap keyed on `.f`. Ties pop in a fixed order, so every search
// over the same input drains the same way.
function minHeap() {
  const a = [];
  return {
    size: () => a.length,
    push(n) {
      a.push(n);
      let k = a.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (a[p].f <= a[k].f) break;
        [a[p], a[k]] = [a[k], a[p]];
        k = p;
      }
    },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let s = k;
          if (l < a.length && a[l].f < a[s].f) s = l;
          if (r < a.length && a[r].f < a[s].f) s = r;
          if (s === k) break;
          [a[s], a[k]] = [a[k], a[s]];
          k = s;
        }
      }
      return top;
    },
  };
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
  if (isStopBlocked(grid, to)) return null;

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

  const heap = minHeap();
  heap.push({ i: startI, f: h(start.c, start.r) });
  while (heap.size()) {
    const { i } = heap.pop();
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
      heap.push({ i: ni, f: tentative + h(nc, nr) });
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

// The point `dist` inches along a polyline (clamped to its end). Lets a mover
// advance along the REAL route toward a far goal instead of a straight line
// that may run into a wall.
export function walkPath(pts, dist) {
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg >= left && seg > 0) {
      const t = left / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= seg;
  }
  return { ...pts[pts.length - 1] };
}

// Travel distance to `goal` over terrain for a mover of `radius`, as a lookup
// p -> inches. One Dijkstra flood from the goal (rigs ignored: they move, and
// friends are pass-through anyway), cached per (terrain, radius, goal), so the
// bot can price "how close does this spot get me" around walls instead of
// through them. Every open cell within `seed` of the goal starts at its
// straight-line distance, so a goal sitting inside inflated terrain (a marker
// hugging a wall) still floods out. Points the flood never reached (sealed off,
// or inside terrain) fall back to straight-line distance.
const distCache = new Map();
export function pathDistance(field, polys, radius, goal, seed = 2) {
  const gx = Math.round(goal.x / CELL) * CELL, gy = Math.round(goal.y / CELL) * CELL;
  const key = `${field.width}x${field.height}|${radius}|${gx},${gy}|${seed}|` + polys.map((p) => p.points.map((q) => q.join(",")).join(";")).join("|");
  const hit = distCache.get(key);
  if (hit) return hit;

  const cols = Math.ceil(field.width / CELL) + 1;
  const rows = Math.ceil(field.height / CELL) + 1;
  const blocked = terrainMask(field, polys, radius, cols, rows);
  const d = new Float64Array(cols * rows).fill(Infinity);
  const heap = minHeap();
  const c0 = Math.max(0, Math.floor((goal.x - seed) / CELL)), c1 = Math.min(cols - 1, Math.ceil((goal.x + seed) / CELL));
  const r0 = Math.max(0, Math.floor((goal.y - seed) / CELL)), r1 = Math.min(rows - 1, Math.ceil((goal.y + seed) / CELL));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * cols + c;
      const e = Math.hypot(c * CELL - goal.x, r * CELL - goal.y);
      if (blocked[i] || e > seed) continue;
      d[i] = e;
      heap.push({ i, f: e });
    }
  }
  while (heap.size()) {
    const { i, f } = heap.pop();
    if (f > d[i]) continue;
    const c = i % cols, r = (i - c) / cols;
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (blocked[ni]) continue;
      if (dc && dr && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;
      const nd = f + cost * CELL;
      if (nd < d[ni]) { d[ni] = nd; heap.push({ i: ni, f: nd }); }
    }
  }

  const lookup = (p) => {
    const { c, r } = cellOf(p);
    const v = c >= 0 && r >= 0 && c < cols && r < rows ? d[r * cols + c] : Infinity;
    return Number.isFinite(v) ? v : Math.hypot(p.x - goal.x, p.y - goal.y);
  };
  if (distCache.size > 256) distCache.clear();
  distCache.set(key, lookup);
  return lookup;
}
