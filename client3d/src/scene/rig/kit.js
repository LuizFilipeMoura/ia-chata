// Shared primitives for every procedural model: a cached material helper, the
// stock metals and one-liner mesh builders. Works headless (node tests): the
// canvas helper just returns null when there is no DOM.
import * as THREE from "three";

export { THREE };
export const DEG = Math.PI / 180;
export const hasDOM = typeof document !== "undefined";

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts, (k, v) => (v && v.isTexture ? v.uuid : v));
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45, ...opts }));
  return matCache.get(key);
}
export const STEEL = () => mat(0x4a4d55, { metalness: 0.8, roughness: 0.35 });
export const DARK = () => mat(0x1b1c20, { metalness: 0.6, roughness: 0.6 });
export const BRASS = () => mat(0xb08d3c, { metalness: 0.9, roughness: 0.3 });
export const GUNMETAL = () => mat(0x34383e, { metalness: 0.75, roughness: 0.4 });
export const RUBBER = () => mat(0x151515, { metalness: 0.1, roughness: 0.9 });
export const CANVAS = () => mat(0x6b6448, { metalness: 0, roughness: 0.95 });
export const GLOW = (color, emissive = color, emissiveIntensity = 1.4) => mat(color, { emissive, emissiveIntensity, metalness: 0.2, roughness: 0.3 });

// Place a mesh (three's position/rotation are read-only props, copy into them).
export function at(o, x, y, z, rz = 0) { o.position.set(x, y, z); if (rz) o.rotation.z = rz; return o; }
export function rot(o, x = 0, y = 0, z = 0) { o.rotation.set(x, y, z); return o; }
export function box(w, h, d, m) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = o.receiveShadow = true; return o; }
export function cyl(rt, rb, h, m, seg = 12) { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.castShadow = true; return o; }
export function sph(r, m, seg = 12) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m); o.castShadow = true; return o; }
export function cone(r, h, m, seg = 10) { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); o.castShadow = true; return o; }
export function torus(r, t, m, arc = Math.PI * 2, seg = 16) { const o = new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, seg, arc), m); o.castShadow = true; return o; }
// A dome (upper hemisphere, or less with `cut` < 1).
export function dome(r, m, cut = 1, seg = 14) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg, 0, Math.PI * 2, 0, (Math.PI / 2) * cut), m); o.castShadow = true; return o; }
// A barrel pointing along +x.
export function barrel(r, len, m) { const o = cyl(r, r, len, m); o.rotation.z = -Math.PI / 2; o.position.x = len / 2; return o; }
// A cylinder lying along x (drums, boilers) or z (axles, rollers).
export function drumX(r, len, m, seg = 16) { const o = cyl(r, r, len, m, seg); o.rotation.z = Math.PI / 2; return o; }
export function drumZ(r, len, m, seg = 16) { const o = cyl(r, r, len, m, seg); o.rotation.x = Math.PI / 2; return o; }
// A ring of rivet heads around a circle (in the plane given by axis).
export function rivetRing(parent, r, n, axis, m, size = 0.035, offset = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p = sph(size, m, 5);
    const u = Math.cos(a) * r, v = Math.sin(a) * r;
    if (axis === "x") p.position.set(offset, u, v); else if (axis === "y") p.position.set(u, offset, v); else p.position.set(u, v, offset);
    parent.add(p);
  }
}
// A row of rivets from a to b.
export function rivetRow(parent, a, b, n, m, size = 0.03) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    parent.add(at(sph(size, m, 5), a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t));
  }
}

// A canvas-backed texture, or null headless. draw(ctx2d, size).
export function canvasTexture(size, draw, { repeat = false } = {}) {
  if (!hasDOM) return null;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Small deterministic PRNG (mulberry32) seeded from a string.
export function rngFrom(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
