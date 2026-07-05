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

const distp = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Scatter 4-6 terrain pieces in the central band, clear of objectives and the
// deployment corners. Deterministic under the injected `random` (matches rollD).
export function scatterTerrain(field, random = Math.random) {
  const rand = typeof random === "function" ? random : Math.random;
  const objectives = computeObjectives(field);
  const dcorners = deploymentCorners(field);
  const hd = halfDiag(field.width, field.height);
  const objClear = 0.12 * hd;
  const cornerClear = 0.22 * hd;
  const minGap = 0.10 * hd;
  const margin = Math.min(field.width, field.height) * 0.08;
  const target = 4 + Math.floor(rand() * 3); // 4, 5, or 6
  const placed = [];
  let attempts = 0;
  while (placed.length < target && attempts < 400) {
    attempts++;
    const x = margin + rand() * (field.width - 2 * margin);
    const y = margin + rand() * (field.height - 2 * margin);
    const p = { x, y };
    if (objectives.some((o) => distp(o, p) < objClear)) continue;
    if (dcorners.some((c) => distp(c, p) < cornerClear)) continue;
    if (placed.some((q) => distp(q, p) < minGap)) continue;
    placed.push({ x, y, size: rand() < 0.5 ? "sm" : "md" });
  }
  return placed;
}
