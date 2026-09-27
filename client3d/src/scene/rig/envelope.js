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
