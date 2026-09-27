// Five more dieselpunk buildings so a theme's building mix really varies from
// battle to battle: a sawtooth mill, an oil derrick with its pumpjack, a blast
// furnace, a rail depot and a tenement block. Each fills its terrain rect
// t.w x t.h and stays under the original height range (SET_ENVELOPE).
import * as THREE from "three";
import { std, glow, shadow, V, blinker, steamValve, flame, flickerWindows } from "./dress-kit.js";

const box = (w, h, d, m) => shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
const cyl = (rt, rb, h, m, seg = 12) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m));
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
function beam(p, q, r, m) {
  const d = q.clone().sub(p), len = d.length();
  const o = cyl(r, r, len, m, 6);
  o.position.copy(p).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return o;
}
function windowsMat(ctx, w, h) {
  const tex = ctx.win.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, w / 3), Math.max(1, h / 3));
  const m = std(0xffffff, { map: tex }); flickerWindows(ctx, m, ctx.theme.lamp);
  return m;
}
const IRON = () => std(0x2e2a26, { metalness: 0.6, roughness: 0.5 });

// Sawtooth mill: a long weaving shed under north-light roof teeth, glazed.
function sawtooth(t, ctx) {
  const g = new THREE.Group();
  const W = t.w, D = t.h, H = 3.2;
  g.add(at(box(W, H, D, windowsMat(ctx, W, H)), 0, H / 2, 0));
  const n = Math.max(2, Math.round(W / 1.6)), step = W / n;
  const slate = std(0x3a3430, { roughness: 0.8 }), glass = glow(ctx.theme.lamp, 0.6);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + step * (i + 0.5);
    const slope = box(step * 1.08, 0.1, D, slate); slope.position.set(x - step * 0.05, H + 0.55, 0); slope.rotation.z = 0.62; g.add(slope);
    g.add(at(box(0.06, 1.0, D * 0.96, glass), x + step / 2 - 0.05, H + 0.5, 0));
  }
  const stackH = 3.4;
  g.add(at(cyl(0.3, 0.42, stackH, std(0x6b3a26, { roughness: 0.9 }), 10), -W / 2 + 0.6, H + stackH / 2, -D / 2 + 0.6));
  const mouth = new THREE.Object3D(); mouth.position.set(-W / 2 + 0.6, H + stackH + 0.1, -D / 2 + 0.6); g.add(mouth); ctx.chimney(mouth);
  // Loading door with a hoist beam.
  g.add(at(box(Math.min(1.6, W * 0.3), 1.8, 0.05, glow(0xff8a3a, 0.8)), W * 0.2, 0.9, D / 2 + 0.03));
  g.add(at(box(0.12, 0.12, 0.8, IRON()), W * 0.2, 2.4, D / 2));
  return g;
}

// Oil derrick: a lattice derrick over the well and a nodding pumpjack.
function derrick(t, ctx) {
  const g = new THREE.Group();
  const iron = IRON(), timber = std(0x4a3420, { roughness: 0.9 });
  g.add(at(box(t.w * 0.95, 0.3, t.h * 0.95, std(0x3a342c, { roughness: 1 })), 0, 0.15, 0));
  // Derrick tower on one side.
  const a = Math.min(t.w * 0.2, t.h * 0.35), top = 8.6, dx = -t.w * 0.22;
  const C = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const corner = (y, sx, sz) => { const k = a + (0.2 - a) * (y / top); return V(dx + sx * k, y, sz * k); };
  for (const [sx, sz] of C) g.add(beam(corner(0.3, sx, sz), corner(top, sx, sz), 0.06, timber));
  for (let i = 1; i < 6; i++) { const y = (i / 6) * top; C.forEach(([sx, sz], j) => { const [nx, nz] = C[(j + 1) % 4]; g.add(beam(corner(y, sx, sz), corner(y, nx, nz), 0.03, timber)); g.add(beam(corner(y - top / 6, sx, sz), corner(y, nx, nz), 0.02, timber)); }); }
  g.add(at(box(0.6, 0.2, 0.6, iron), dx, top, 0));
  blinker(ctx, g, V(dx, top + 0.25, 0), 0xff3a2a, { period: 1.5, duty: 0.3, size: 0.12 });
  // Pumpjack: A-frame, walking beam, horse head, counterweight crank.
  const px = t.w * 0.22;
  for (const z of [-0.3, 0.3]) { g.add(beam(V(px - 0.5, 0.3, z), V(px, 2.1, z), 0.06, iron)); g.add(beam(V(px + 0.5, 0.3, z), V(px, 2.1, z), 0.06, iron)); }
  const walk = new THREE.Group(); walk.position.set(px, 2.2, 0); g.add(walk);
  const L = Math.min(t.w * 0.45, 3);
  walk.add(box(L, 0.18, 0.2, std(0x7a3a1e, { metalness: 0.4 })));
  const head = box(0.25, 0.7, 0.24, std(0x7a3a1e, { metalness: 0.4 })); head.position.set(-L / 2, -0.2, 0); walk.add(head);
  const crank = new THREE.Group(); crank.position.set(px + L * 0.4, 0.9, 0); g.add(crank);
  crank.add(box(0.9, 0.25, 0.18, iron));
  const ph = ctx.rand() * 6;
  ctx.anim((dt, now) => { const k = now * 1.4 + ph; walk.rotation.z = Math.sin(k) * 0.28; crank.rotation.z = -k; });
  const valve = new THREE.Object3D(); valve.position.set(dx, 1.2, 0); g.add(valve);
  steamValve(ctx, valve, { every: 5, color: 0x2a2420, dir: V(0, 1.5, 0) });
  return g;
}

// Blast furnace: a tall riveted stove with hot-blast pipes and a slag glow.
function furnace(t, ctx) {
  const g = new THREE.Group();
  const R = Math.min(t.w, t.h) * 0.28, H = 7.8;
  const shell = std(0x4a3a30, { metalness: 0.5, roughness: 0.6 }), iron = IRON();
  g.add(at(box(t.w * 0.95, 0.6, t.h * 0.95, std(0x3a342c, { roughness: 1 })), 0, 0.3, 0));
  const prof = [[R * 0.9, 0], [R, 1.2], [R * 1.15, H * 0.45], [R * 0.8, H * 0.85], [R * 0.55, H]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(shadow(new THREE.Mesh(new THREE.LatheGeometry(prof, 20), shell)));
  for (const y of [1.5, 3, 4.5]) { const ring = shadow(new THREE.Mesh(new THREE.TorusGeometry(R * 1.12, 0.06, 6, 24), iron)); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
  // Two hot-blast stoves beside it, piped across.
  const sx = t.w / 2 - Math.min(0.9, t.w * 0.15);
  for (const z of [-t.h * 0.25, t.h * 0.25]) {
    g.add(at(cyl(0.55, 0.6, 5.2, std(0x5a4a3c, { metalness: 0.4 }), 14), sx, 3.2, z));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x5a4a3c)), sx, 5.8, z));
    g.add(beam(V(sx, 4.2, z), V(0, 4.2, 0), 0.14, iron));
  }
  // Tap hole: glowing slag run on the ground.
  const slag = glow(0xff5a1a, 2);
  const runL = Math.min(1.8, t.h * 0.3);
  g.add(at(box(0.5, 0.05, runL, slag), -R * 0.5, 0.63, Math.min(R + 0.6, t.h / 2 - runL / 2 - 0.1)));
  flame(ctx, g, V(0, H, 0), { size: 0.7, rate: 8 });
  const ph = ctx.rand() * 6;
  ctx.anim((dt, now) => { slag.emissiveIntensity = 1.6 + 0.6 * Math.sin(now * 2.3 + ph); });
  return g;
}

// Rail depot: an engine shed with arched doors, rails running in, a signal lamp.
function depot(t, ctx) {
  const g = new THREE.Group();
  const W = t.w * 0.95, D = t.h * 0.8, H = 3.4;
  g.add(at(box(W, H, D, windowsMat(ctx, W, H)), 0, H / 2, -t.h * 0.08));
  const roofGeo = new THREE.CylinderGeometry(D / 2, D / 2, W, 20, 1, false, 0, Math.PI); roofGeo.rotateZ(Math.PI / 2);
  g.add(at(shadow(new THREE.Mesh(roofGeo, std(0x4a3a30, { metalness: 0.4, side: THREE.DoubleSide }))), 0, H, -t.h * 0.08));
  const n = Math.max(1, Math.floor(W / 2.2)), doorW = Math.min(1.5, W / n - 0.4);
  const rail = std(0x5a5550, { metalness: 0.8, roughness: 0.4 }), tie = std(0x3a2a1c, { roughness: 1 });
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (W / n) * (i + 0.5);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, 2.2), glow(ctx.theme.lamp, 0.7)); door.position.set(x, 1.1, D / 2 - t.h * 0.08 + 0.02); g.add(door);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(doorW / 2, 12, 0, Math.PI), glow(ctx.theme.lamp, 0.7)); arch.position.set(x, 2.2, D / 2 - t.h * 0.08 + 0.02); g.add(arch);
    for (const s of [-0.35, 0.35]) g.add(at(box(0.06, 0.06, t.h * 0.3, rail), x + s, 0.03, t.h / 2 - t.h * 0.15));
    for (let k = 0; k < 4; k++) g.add(at(box(1.0, 0.04, 0.14, tie), x, 0.02, t.h / 2 - 0.1 - k * (t.h * 0.3) / 4));
  }
  g.add(at(cyl(0.05, 0.07, 2.4, IRON(), 6), W / 2 - 0.2, 1.2, t.h / 2 - 0.2));
  blinker(ctx, g, V(W / 2 - 0.2, 2.5, t.h / 2 - 0.2), 0x3aff6a, { period: 3, duty: 0.8, size: 0.1 });
  const vent = new THREE.Object3D(); vent.position.set(0, H + D / 2 + 0.1, -t.h * 0.08); g.add(vent);
  steamValve(ctx, vent, { every: 3, color: 0xeeeeea, dir: V(0.3, 2.4, 0), size: 0.9 });
  return g;
}

// Tenement: a narrow brick block with iron balconies, washing lines and a
// flickering sign.
function tenement(t, ctx) {
  const g = new THREE.Group();
  const W = t.w * 0.85, D = t.h * 0.85, H = 6.4;
  g.add(at(box(W, H, D, windowsMat(ctx, W, H)), 0, H / 2, 0));
  g.add(at(box(W + 0.2, 0.25, D + 0.2, std(0x3a3430)), 0, H + 0.12, 0));
  const iron = IRON();
  for (const y of [2.2, 3.8, 5.4]) {
    g.add(at(box(W * 0.5, 0.06, 0.5, iron), -W * 0.15, y, D / 2 + 0.25));
    g.add(at(box(W * 0.5, 0.35, 0.03, iron), -W * 0.15, y + 0.2, D / 2 + 0.49));
  }
  // Washing line between the balconies, a few sheets on it.
  const cloth = [0xd8d0b8, 0x8a2a1c, 0x5a6a7a];
  for (let i = 0; i < 3; i++) g.add(at(box(0.3, 0.4, 0.02, std(cloth[i], { roughness: 1 })), -W * 0.3 + i * 0.4, 3.45, D / 2 + 0.45));
  // Rooftop water tank and a sign that stutters.
  g.add(at(cyl(0.5, 0.5, 1.1, std(0x6a4a30), 12), W * 0.25, H + 0.8, -D * 0.2));
  const signMat = glow(0xff4a8a, 2);
  g.add(at(box(0.08, 1.8, 0.5, signMat), W / 2 + 0.05, 3.6, 0));
  const ph = ctx.rand() * 9;
  ctx.anim((dt, now) => { const k = (now + ph) % 7; signMat.emissiveIntensity = k < 0.15 || (k > 0.3 && k < 0.4) ? 0.2 : 2; });
  const mouth = new THREE.Object3D(); mouth.position.set(-W * 0.3, H + 0.4, -D * 0.3); g.add(mouth);
  g.add(at(cyl(0.18, 0.2, 0.6, std(0x5a3a26), 8), -W * 0.3, H + 0.3, -D * 0.3));
  ctx.chimney(mouth);
  return g;
}

export const WORKS = { sawtooth, derrick, furnace, depot, tenement };
