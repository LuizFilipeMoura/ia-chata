// Size limits for every model, measured once (2026-09-26) from the original
// one-body-per-class models so new variants never grow a mini. Root space
// (after baseScale), rest pose, weapons excluded: `height` is the top of the
// body above the table, `radius` the farthest vertex from the base centre in
// the ground plane.
import { THREE } from "./kit.js";

export const ENVELOPE = {
  light: { height: 1.922, radius: 0.461 },
  medium: { height: 2.184, radius: 0.66 },
  walker: { height: 2.712, radius: 0.516 },
  drone: { height: 1.313, radius: 0.37 },
};

// Measure a Mech's body (weapons detached while measuring).
export function measureBody(m) {
  const detached = [];
  for (const w of [m.lr, m.me]) {
    const p = w?.group?.parent;
    if (p) { p.remove(w.group); detached.push([p, w.group]); }
  }
  m.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(m.root.matrixWorld).invert();
  const v = new THREE.Vector3();
  let height = -Infinity, bottom = Infinity, radius = 0;
  m.body.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      height = Math.max(height, v.y); bottom = Math.min(bottom, v.y);
      radius = Math.max(radius, Math.hypot(v.x, v.z));
    }
  });
  for (const [p, g] of detached) p.add(g);
  return { height, bottom, radius };
}

export function envelopeClass(m) {
  return m.kind === "walker" || m.kind === "drone" ? m.kind : m.weightClass;
}

// Tiny slack for float noise only.
const EPS = 1e-3;
export function fits(m) {
  const size = measureBody(m);
  const limit = ENVELOPE[envelopeClass(m)];
  return { ok: size.height <= limit.height + EPS && size.radius <= limit.radius + EPS, ...size, limit };
}

// Set dressing, measured the same day from the original kinds. Buildings stay
// under the tallest original (the water tower) and inside their terrain rect
// plus a small overhang; small terrain stays under its slot's original height
// for that rect (barricade banner pole, crate stack, rubble heap).
export const SET_ENVELOPE = {
  building: { height: () => 10.9, overhang: 0.5 },
  barricade: { height: () => 3.0, overhang: 0.35 },
  crate: { height: (w, h) => 1.2 * Math.min(w, h) + 0.25, overhang: 0.35 },
  rubble: { height: (w, h) => 0.72 * Math.min(w, h) + 0.05, overhang: 0.35 },
};

// Does a prop built for rect w x h (centred on the origin) fit its slot?
export function propFits(obj, slot, w, h) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const L = SET_ENVELOPE[slot];
  const height = b.max.y, limit = L.height(w, h), o = L.overhang;
  const inRect = b.min.x >= -w / 2 - o && b.max.x <= w / 2 + o && b.min.z >= -h / 2 - o && b.max.z <= h / 2 + o;
  return { ok: inRect && height <= limit + 1e-3, height, limit, box: b };
}
