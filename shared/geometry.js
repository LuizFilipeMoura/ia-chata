// Pure battlefield spatial predicates for digital rooms. Given positions,
// facings, radii, and terrain, derive the distance / arc / cover that a
// physical-room player would otherwise declare with a tape measure. No imports
// from game-state.js so it stays dependency-free and testable on server +
// client, exactly like field.js.
//
// This file starts with just terrain -> polygon conversion: every terrain
// kind (poly / rect / ellipse) becomes one polygon in absolute field inches,
// so later ray-casting / arc / distance code has a single shape to intersect
// against instead of three per-shape branches scattered everywhere.

const DEG = Math.PI / 180;

// A rect's 4 corners, spun about its own centre, in absolute inches. `rot` is
// degrees, matching how field.js already stores rotation on terrain pieces.
function rectCorners(t) {
  const w = t.w ?? 0;
  const h = t.h ?? 0;
  const r = (t.rot ?? 0) * DEG;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([dx, dy]) => [t.x + dx * cos - dy * sin, t.y + dx * sin + dy * cos]);
}

// Every terrain piece as one absolute-inch polygon. `poly` points are stored
// relative to (x,y) and just get translated; `rect` becomes its 4 corners;
// `ellipse` is approximated by its bounding rect's corners (ray-casting
// against an ellipse is a later task's problem, not this conversion's).
export function terrainPolygons(field) {
  return (field?.terrain || []).map((t) => {
    if (t.shape === "poly") {
      return { kind: t.kind, points: t.points.map(([dx, dy]) => [t.x + dx, t.y + dy]) };
    }
    if (t.shape === "ellipse") {
      return { kind: t.kind, points: rectCorners({ ...t, w: t.rx * 2, h: t.ry * 2 }) };
    }
    return { kind: t.kind, points: rectCorners(t) };
  });
}

// Standard orientation test. Returns >0 / <0 / 0 for ccw / cw / collinear.
function cross(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function onSegment(ax, ay, bx, by, px, py) {
  return Math.min(ax, bx) - 1e-9 <= px && px <= Math.max(ax, bx) + 1e-9
    && Math.min(ay, by) - 1e-9 <= py && py <= Math.max(ay, by) + 1e-9;
}

// True when segment a1-a2 crosses segment b1-b2, touching included.
export function segmentsIntersect(a1, a2, b1, b2) {
  const d1 = cross(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
  const d2 = cross(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
  const d3 = cross(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
  const d4 = cross(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  // Collinear-touch cases.
  if (Math.abs(d1) < 1e-9 && onSegment(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y)) return true;
  if (Math.abs(d2) < 1e-9 && onSegment(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y)) return true;
  if (Math.abs(d3) < 1e-9 && onSegment(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y)) return true;
  if (Math.abs(d4) < 1e-9 && onSegment(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y)) return true;
  return false;
}

// Ray-casting parity test.
export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    const straddles = (yi > p.y) !== (yj > p.y);
    if (straddles && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// True when the segment crosses any edge of the polygon, OR lies wholly inside
// it (no edge crossed, but both endpoints within — a rig standing in terrain).
// Checking endpoint `a` alone is sufficient: if no edge of the polygon is
// crossed by the segment, the segment cannot pass from inside to outside (or
// vice versa) anywhere along its length, so both endpoints share the same
// inside/outside status as `a` — testing one stands in for both.
export function segmentHitsPolygon(a, b, poly) {
  const pts = poly.points;
  for (let i = 0; i < pts.length; i++) {
    const [cx, cy] = pts[i];
    const [dx, dy] = pts[(i + 1) % pts.length];
    if (segmentsIntersect(a, b, { x: cx, y: cy }, { x: dx, y: dy })) return true;
  }
  return pointInPolygon(a, pts);
}

// The 3-ray sight corridor. Take the centre line A->B, then offset
// perpendicular to it by each unit's OWN radius to get three parallel rays:
// top->top, centre->centre, bottom->bottom. Offsetting perpendicular to the
// shot (rather than along a fixed map axis) is what makes the read
// rotation-invariant — a flanking shot and a frontal shot are graded alike.
//
// Bases differ in radius, so the outer rays converge or diverge slightly. That
// is correct: a light rig shooting a medium gets a wider corridor at the target
// end.
//
// Every ray is tested against EVERY terrain kind — kind matters in exactly one
// place, the buildingRays check. That is the whole content of "everything is
// solid; only buildings block sight". A 1in rock can never obstruct all three,
// so small scatter naturally reads as cover 1 and a long barricade as cover 2.
// Geometry grades cover; there is no cover-class table.
export function sightCorridor(attacker, target, polys) {
  const dx = target.pos.x - attacker.pos.x;
  const dy = target.pos.y - attacker.pos.y;
  const len = Math.hypot(dx, dy);
  // Coincident bases can't happen (rigs block each other) — degrade, don't throw.
  if (len < 1e-9) return { obstructed: 0, buildingRays: 0, cover: 0, los: true };

  const nx = -dy / len; // unit perpendicular to the shot
  const ny = dx / len;

  let obstructed = 0;
  let buildingRays = 0;
  for (const side of [1, 0, -1]) { // top, centre, bottom
    const a = { x: attacker.pos.x + nx * attacker.radius * side, y: attacker.pos.y + ny * attacker.radius * side };
    const b = { x: target.pos.x + nx * target.radius * side, y: target.pos.y + ny * target.radius * side };
    let hit = false;
    let building = false;
    for (const poly of polys) {
      if (!segmentHitsPolygon(a, b, poly)) continue;
      hit = true;
      if (poly.kind === "building") building = true;
    }
    if (hit) obstructed++;
    if (building) buildingRays++;
  }
  return {
    obstructed,
    buildingRays,
    // Lands exactly on combat.js's existing opts.cover clamp of 0-2.
    cover: Math.min(2, obstructed),
    los: buildingRays < 3,
  };
}
