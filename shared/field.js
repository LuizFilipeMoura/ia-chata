// Pure battlefield geometry. Given a field's dimensions + diagonal, derive the
// deterministic objective markers and a re-rollable terrain scatter. No imports
// from game-state.js so it stays dependency-free and testable on server + client.

export const FIELD_MIN = { width: 24, height: 18 };
export const FIELD_MAX = { width: 96, height: 72 };
export const FIELD_DEFAULT = { width: 54, height: 36 };

// Reference table the rulebook (§10-11) is written for. Objective distance and
// the deployment setback are stored as a fraction of this table's half-diagonal
// so they scale to any size instead of using literal inches.
const REF = { width: 54, height: 36 };
export function halfDiag(w, h) { return Math.hypot(w / 2, h / 2); }
export const REF_HALF_DIAG = halfDiag(REF.width, REF.height);
export const OBJ_FRACTION = 18 / REF_HALF_DIAG; // ~0.5547
const SETBACK_REF = 4;
const DEPLOY_RADIUS_REF = 8; // deploy within 8in of your corner on the reference table

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function clampDimensions(w, h) {
  return {
    width: clampInt(w, FIELD_MIN.width, FIELD_MAX.width, FIELD_DEFAULT.width),
    height: clampInt(h, FIELD_MIN.height, FIELD_MAX.height, FIELD_DEFAULT.height),
  };
}

function corners(field) {
  const { width: w, height: h } = field;
  return {
    tl: { x: 0, y: 0 }, tr: { x: w, y: 0 },
    br: { x: w, y: h }, bl: { x: 0, y: h },
  };
}

// The no-deploy diagonal's endpoints are the empty corners (objectives sit
// toward them); the other pair are the deployment corners (owner is index 0).
export function emptyCorners(field) {
  const c = corners(field);
  return field.diagonal === "trbl" ? [c.tr, c.bl] : [c.tl, c.br];
}
export function deploymentCorners(field) {
  const c = corners(field);
  return field.diagonal === "trbl" ? [c.tl, c.br] : [c.tr, c.bl];
}

export function fieldCenter(field) {
  return { x: field.width / 2, y: field.height / 2 };
}

export function computeObjectives(field) {
  const c = fieldCenter(field);
  const markers = [{ x: c.x, y: c.y, vp: 2 }];
  for (const corner of emptyCorners(field)) {
    markers.push({
      x: c.x + OBJ_FRACTION * (corner.x - c.x),
      y: c.y + OBJ_FRACTION * (corner.y - c.y),
      vp: 1,
    });
  }
  return markers;
}

export function setback(field) {
  return SETBACK_REF * (halfDiag(field.width, field.height) / REF_HALF_DIAG);
}

// Rigs deploy within this radius of their deployment corner. 8in on the
// reference table, scaled to the field like every other distance here.
export function deployRadius(field) {
  return DEPLOY_RADIUS_REF * (halfDiag(field.width, field.height) / REF_HALF_DIAG);
}

const distp = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round2 = (n) => Math.round(n * 100) / 100;
const rrange = (rand, lo, hi) => lo + rand() * (hi - lo);

// An organic footprint: `n` vertices around the origin at radius `rBase`, each
// nudged in/out by up to `jitter` and swivelled a little off its spoke. Points
// are in inches, relative to the piece centre, so they scale with the field.
function polyBlob(rand, rBase, jitter, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * (Math.PI / n) * 0.9;
    const rr = rBase * (1 - jitter + rand() * jitter * 2);
    pts.push([round2(Math.cos(a) * rr), round2(Math.sin(a) * rr)]);
  }
  return pts;
}

// Terrain vocabulary, mirroring how skirmish wargames dress a table: a few big
// area/blocking anchors (woods, buildings, craters, ruins), then linear cover
// (barricades) and small scatter (rocks, crates). Each `make` returns the shape
// geometry plus `fp`, the footprint radius in inches used for spacing. `min/max`
// are the per-roll counts before the field-size multiplier.
const TERRAIN_KINDS = [
  { kind: "wood", min: 1, max: 2, make(rand) {
    const r = rrange(rand, 3.4, 5.4);
    return { shape: "poly", points: polyBlob(rand, r, 0.22, 9), fp: r * 1.05 };
  } },
  { kind: "building", min: 1, max: 2, make(rand) {
    const w = rrange(rand, 4, 7.5), h = rrange(rand, 3, 5.5);
    return { shape: "rect", w: round2(w), h: round2(h), rot: round2(rrange(rand, -18, 18)), fp: Math.hypot(w, h) / 2 };
  } },
  { kind: "crater", min: 1, max: 2, make(rand) {
    const rx = rrange(rand, 2.2, 3.6), ry = rx * rrange(rand, 0.62, 0.9);
    return { shape: "ellipse", rx: round2(rx), ry: round2(ry), rot: round2(rrange(rand, 0, 180)), fp: rx };
  } },
  { kind: "ruin", min: 1, max: 2, make(rand) {
    const r = rrange(rand, 2.4, 3.8);
    return { shape: "poly", points: polyBlob(rand, r, 0.5, 6), fp: r };
  } },
  { kind: "barricade", min: 1, max: 3, make(rand) {
    const w = rrange(rand, 5, 9), h = rrange(rand, 0.7, 1.1);
    return { shape: "rect", w: round2(w), h: round2(h), rot: round2(rrange(rand, 0, 180)), fp: w / 2 };
  } },
  { kind: "rock", min: 2, max: 4, make(rand) {
    const r = rrange(rand, 1, 2);
    return { shape: "poly", points: polyBlob(rand, r, 0.42, 5), fp: r };
  } },
  { kind: "crate", min: 1, max: 3, make(rand) {
    const w = rrange(rand, 1.4, 2.4), h = w * rrange(rand, 0.8, 1.1);
    return { shape: "rect", w: round2(w), h: round2(h), rot: round2(rrange(rand, -30, 30)), fp: Math.hypot(w, h) / 2 };
  } },
];

// The terrain vocabulary a digital room scatters. wood / crater / ruin are
// excluded: the 3-ray cover model (geometry.js) grades by pure geometry, and
// those three lie about themselves under it — a wood is a 3.4-5.4in blob that
// eats all three rays and reads as a WALL, and a crater is a hole that would do
// the same. Every kind kept here reads correctly with no cover-class table.
// A physical room is unaffected — you adjudicate a wood yourself at the table.
export const DIGITAL_TERRAIN_KINDS = new Set(["building", "barricade", "rock", "crate"]);

// Dress the field with a varied terrain scatter — several shapes and sizes,
// clear of objectives and the deployment corners, roughly wargame density.
// Piece count scales with field area. Deterministic under `random` (matches rollD).
// `opts.digital` restricts the vocabulary to DIGITAL_TERRAIN_KINDS (see above);
// physical callers omit it and keep the full 7-kind vocabulary unchanged.
export function scatterTerrain(field, random = Math.random, opts = {}) {
  const rand = typeof random === "function" ? random : Math.random;
  const kinds = opts.digital ? TERRAIN_KINDS.filter((k) => DIGITAL_TERRAIN_KINDS.has(k.kind)) : TERRAIN_KINDS;
  const objectives = computeObjectives(field);
  const dcorners = deploymentCorners(field);
  const hd = halfDiag(field.width, field.height);
  const objClear = 0.10 * hd;
  const cornerClear = 0.18 * hd;
  const minGap = 0.03 * hd;
  const margin = Math.min(field.width, field.height) * 0.05;
  const areaMul = Math.sqrt((field.width * field.height) / (REF.width * REF.height));

  // Roll a count per kind, then instantiate each piece's geometry.
  const built = [];
  for (const spec of kinds) {
    const n = Math.max(spec.min, Math.round(rrange(rand, spec.min, spec.max + 0.999) * areaMul));
    for (let i = 0; i < n; i++) built.push({ kind: spec.kind, ...spec.make(rand) });
  }
  // Pack biggest first so the area anchors claim space before the scatter.
  built.sort((a, b) => b.fp - a.fp);

  const placed = [];
  for (const piece of built) {
    const availX = field.width - 2 * (margin + piece.fp);
    const availY = field.height - 2 * (margin + piece.fp);
    if (availX <= 1 || availY <= 1) continue; // too big for this field — drop it
    for (let attempts = 0; attempts < 80; attempts++) {
      const p = {
        x: round2(margin + piece.fp + rand() * availX),
        y: round2(margin + piece.fp + rand() * availY),
      };
      if (objectives.some((o) => distp(o, p) < objClear + piece.fp)) continue;
      if (dcorners.some((c) => distp(c, p) < cornerClear + piece.fp)) continue;
      if (placed.some((q) => distp(q, p) < minGap + piece.fp + q.fp)) continue;
      placed.push({ ...piece, x: p.x, y: p.y });
      break;
    }
  }
  // `fp` was only needed for spacing; keep the wire payload to the geometry.
  return placed.map(({ fp, ...rest }) => rest);
}
