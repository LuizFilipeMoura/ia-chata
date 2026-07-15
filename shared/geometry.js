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
