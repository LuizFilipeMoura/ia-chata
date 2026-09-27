// Scenery variants for the organic terrain pieces: rock and ruin blobs, woods
// and craters. Each kind keeps its footprint (the blob / ellipse the rules
// measure) and never rises above the original piece's height (SCENERY_CAP);
// the battle's dressing seed and the piece's position pick the variant, so a
// layout looks different battle to battle but the same for both players. Dieselpunk throughout: slag, scrap, coal, oil,
// brick, wire and pipe.
import * as THREE from "three";
import { std, glow, shadow, V } from "./dress-kit.js";
import { rngFrom } from "./rig/kit.js";

// Original heights: rock and ruin blobs were 1.5 tall slabs, woods a 0.3 mat,
// craters a flat disc (their new rims stay under the woods' 0.3).
export const SCENERY_CAP = { rock: 1.5, ruin: 1.5, wood: 0.3, crater: 0.3 };

// ---- Footprint geometry (x, z in the piece's local frame) ----
// Poly points [x, y] map to local (x, z = y); an ellipse becomes a 32-gon.
export function outline(t) {
  if (t.shape === "ellipse") return Array.from({ length: 32 }, (_, i) => { const a = (i / 32) * Math.PI * 2; return [Math.cos(a) * t.rx, Math.sin(a) * t.ry]; });
  return t.points;
}
export function inside(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function edgeDist(pts, x, z) {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    d = Math.min(d, Math.hypot(x - ax - dx * k, z - az - dz * k));
  }
  return d;
}
// Clearance to the outline: positive inside, negative outside.
const room = (pts, x, z) => (inside(pts, x, z) ? edgeDist(pts, x, z) : -edgeDist(pts, x, z));
function centroid(pts) { let x = 0, z = 0; for (const [a, b] of pts) { x += a; z += b; } return [x / pts.length, z / pts.length]; }
function meanR(pts) { const [cx, cz] = centroid(pts); return pts.reduce((s, [x, z]) => s + Math.hypot(x - cx, z - cz), 0) / pts.length; }
// n spots with at least `r` clearance to the edge and `gap` between them.
function scatter(rng, pts, n, r, gap = r) {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const out = [];
  for (let tries = 0; tries < n * 60 && out.length < n; tries++) {
    const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
    if (room(pts, x, z) < r) continue;
    if (out.some(([a, b]) => Math.hypot(a - x, b - z) < gap)) continue;
    out.push([x, z]);
  }
  return out;
}
// The longest w-wide strip through the centroid that fits: { len, angle, cx, cz }.
function longestStrip(pts, w, margin = 0.08) {
  const [cx, cz] = centroid(pts);
  let best = { len: 0, angle: 0, cx, cz };
  for (let s = 0; s < 12; s++) {
    const a = (s / 12) * Math.PI, ux = Math.cos(a), uz = Math.sin(a);
    for (let L = meanR(pts) * 2.4; L > 0.3; L -= 0.1) {
      const ok = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]].every(([p, q]) => room(pts, cx + ux * p * L / 2 - uz * q * w / 2, cz + uz * p * L / 2 + ux * q * w / 2) >= margin);
      if (ok) { if (L > best.len) best = { len: L, angle: a, cx, cz }; break; }
    }
  }
  return best;
}
// A flat footprint decal (the outline, optionally shrunk toward the centre).
function ground(pts, mat, y = 0.02, shrink = 1) {
  const [cx, cz] = centroid(pts);
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * shrink, -(cz + (z - cz) * shrink))));
  const geo = new THREE.ShapeGeometry(s); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.y = y; m.receiveShadow = true;
  return m;
}
const mesh = (geo, m) => shadow(new THREE.Mesh(geo, m));
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const lump = (r, m) => mesh(new THREE.DodecahedronGeometry(r, 0), m);
// Lie a cylinder along the ground at angle a (radians about y).
function lying(r, len, m, a, seg = 12) { const o = mesh(new THREE.CylinderGeometry(r, r, len, seg), m); o.rotation.set(0, a, Math.PI / 2); return o; }

// ---- Rock blobs (r 1 to 2, cap 1.5) ----
const ROCK = {
  classic(t) {
    const s = new THREE.Shape(t.points.map(([x, y]) => new THREE.Vector2(x, -y)));
    const geo = new THREE.ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
    return mesh(geo, std(0x6f6a62, { roughness: 1, flatShading: true }));
  },
  // Slag heap: glassy black lumps with ember cracks that breathe.
  slag(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t), R = meanR(pts);
    g.add(ground(pts, std(0x1a1614, { roughness: 1 })));
    const slag = std(0x221e1c, { roughness: 0.25, metalness: 0.7, flatShading: true }), vein = glow(0xff5a1a, 1.4);
    for (const [x, z] of scatter(rng, pts, 6, R * 0.3, R * 0.35)) {
      const r = R * (0.24 + rng() * 0.14);
      const l = at(lump(r, slag), x, r * 0.5, z); l.scale.y = 0.8; l.rotation.set(rng() * 3, rng() * 3, rng() * 3); g.add(l);
      const c = at(mesh(new THREE.BoxGeometry(r * 1.1, 0.03, 0.04), vein), x, r * 0.5 + r * 0.72, z); c.rotation.y = rng() * 3; g.add(c);
    }
    const ph = rng() * 6;
    ctx.anim((dt, now) => { vein.emissiveIntensity = 1 + 0.6 * Math.sin(now * 1.3 + ph); });
    return g;
  },
  // Scrap pile: girders, plates and a gear heaped up.
  scrap(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t), R = meanR(pts);
    g.add(ground(pts, std(0x3a2e24, { roughness: 1 })));
    const rust = std(0x7a3a1e, { roughness: 0.85, metalness: 0.4 }), iron = std(0x3a3632, { metalness: 0.6, roughness: 0.6 });
    const girder = (len) => { const h = new THREE.Group(); h.add(mesh(new THREE.BoxGeometry(len, 0.04, 0.22), rust)); h.add(at(mesh(new THREE.BoxGeometry(len, 0.04, 0.22), rust), 0, 0.22, 0)); h.add(at(mesh(new THREE.BoxGeometry(len, 0.22, 0.04), rust), 0, 0.11, 0)); return h; };
    for (const [x, z] of scatter(rng, pts, 3, R * 0.45, R * 0.3)) {
      const len = R * 0.8, b = girder(len); b.position.set(x, 0.05 + rng() * 0.2, z); b.rotation.set(0, rng() * 3, (rng() - 0.5) * 0.5); g.add(b);
    }
    for (const [x, z] of scatter(rng, pts, 3, R * 0.3, R * 0.25)) { const p = at(mesh(new THREE.BoxGeometry(R * 0.5, 0.04, R * 0.4), iron), x, 0.2, z); p.rotation.set(rng() - 0.5, rng() * 3, rng() - 0.5); g.add(p); }
    const [gx, gz] = scatter(rng, pts, 1, 0.45)[0] ?? centroid(pts);
    const gear = new THREE.Group(); gear.position.set(gx, 0.42, gz); gear.rotation.set(0.3, rng() * 3, 0.15);
    gear.add(mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 16), iron));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const tooth = at(mesh(new THREE.BoxGeometry(0.09, 0.09, 0.08), iron), Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0); tooth.rotation.z = a; gear.add(tooth); }
    g.add(gear);
    return g;
  },
  // Broken concrete: tilted slabs, bent rebar, one hazard-striped kerb.
  concrete(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t), R = meanR(pts);
    g.add(ground(pts, std(0x4a4640, { roughness: 1 })));
    const conc = std(0x8a857c, { roughness: 1, flatShading: true }), rebar = std(0x5a3a26, { metalness: 0.5, roughness: 0.7 });
    const spots = scatter(rng, pts, 4, R * 0.35, R * 0.35);
    spots.forEach(([x, z], i) => {
      const w = R * 0.6, d = R * 0.45;
      const s = at(mesh(new THREE.BoxGeometry(w, 0.18, d), conc), x, 0.25, z); s.rotation.set((rng() - 0.5) * 0.7, rng() * 3, (rng() - 0.5) * 0.7); g.add(s);
      for (let k = 0; k < 2; k++) { const r = at(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), rebar), w * 0.4, 0.2, (k - 0.5) * d * 0.5); r.rotation.z = -0.8 - rng() * 0.5; s.add(r); }
      if (i === 0) for (let k = 0; k < 4; k++) s.add(at(mesh(new THREE.BoxGeometry(w / 4, 0.01, 0.12), std(k % 2 ? 0x141414 : 0xd8a21c)), -w / 2 + w / 8 + (k * w) / 4, 0.095, d / 2 - 0.08));
    });
    return g;
  },
  // Coal mound with a tipped mine cart on a stub of track.
  coal(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t), R = meanR(pts);
    g.add(ground(pts, std(0x14120f, { roughness: 1 })));
    const coal = std(0x151412, { roughness: 0.5, metalness: 0.3, flatShading: true });
    const [cx, cz] = centroid(pts), mr = Math.max(0.3, room(pts, cx, cz) * 0.9);
    g.add(at(mesh(new THREE.ConeGeometry(mr, Math.min(1.1, mr * 1.1), 9), coal), cx, Math.min(1.1, mr * 1.1) / 2, cz));
    for (const [x, z] of scatter(rng, pts, 6, 0.15, 0.2)) g.add(at(lump(0.1 + rng() * 0.06, coal), x, 0.08, z));
    const strip = longestStrip(pts, 0.7);
    if (strip.len > 1.1) {
      const u = V(Math.cos(strip.angle), 0, Math.sin(strip.angle)), along = strip.len * 0.3;
      const cart = new THREE.Group(); cart.position.set(strip.cx + u.x * along, 0.22, strip.cz + u.z * along); cart.rotation.set(0, -strip.angle, 0.55);
      cart.add(mesh(new THREE.BoxGeometry(0.55, 0.3, 0.4), std(0x6b3a26, { metalness: 0.4, roughness: 0.7 })));
      for (const [wx, wz] of [[-0.18, -0.2], [0.18, -0.2], [-0.18, 0.2], [0.18, 0.2]]) { const w = at(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10), std(0x2a2622, { metalness: 0.6 })), wx, -0.17, wz); w.rotation.x = Math.PI / 2; cart.add(w); }
      g.add(cart);
      for (const s of [-1, 1]) g.add(at(lying(0.02, strip.len * 0.55, std(0x4a4640, { metalness: 0.7 }), -strip.angle, 5), strip.cx + u.x * along * 0.4 - u.z * s * 0.18, 0.03, strip.cz + u.z * along * 0.4 + u.x * s * 0.18));
    }
    return g;
  },
  // Boulders round a rusted boiler, half buried.
  boiler(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t), R = meanR(pts);
    g.add(ground(pts, std(0x2e2a24, { roughness: 1 })));
    const rock = std(0x6f6a62, { roughness: 1, flatShading: true });
    const strip = longestStrip(pts, R * 0.7);
    const br = Math.min(0.5, R * 0.32), bl = Math.min(strip.len * 0.8, R * 1.3);
    if (bl > 0.6) {
      const b = at(lying(br, bl, std(0x7a3a1e, { roughness: 0.8, metalness: 0.4 }), -strip.angle, 16), strip.cx, br * 0.35, strip.cz); g.add(b);
      const cap = at(lying(br * 1.05, 0.06, std(0x4a2a18, { metalness: 0.5 }), -strip.angle, 16), strip.cx + Math.cos(strip.angle) * bl * 0.3, br * 0.35, strip.cz + Math.sin(strip.angle) * bl * 0.3); g.add(cap);
    }
    for (const [x, z] of scatter(rng, pts, 4, R * 0.25, R * 0.3)) { const r = R * (0.18 + rng() * 0.12); const l = at(lump(r, rock), x, r * 0.55, z); l.rotation.set(rng() * 3, rng() * 3, 0); g.add(l); }
    return g;
  },
};

// ---- Ruin blobs (r 2.4 to 3.8, cap 1.5) ----
const RUIN = {
  classic: ROCK.classic,
  // Broken brick walls tracing the outline, window gaps, rubble at the foot.
  brickwalls(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t);
    g.add(ground(pts, std(0x3a3026, { roughness: 1 })));
    const brick = std(0x7a3a28, { roughness: 0.95 }), mortar = std(0x5a2a1c, { roughness: 1 });
    const [cx, cz] = centroid(pts);
    const inset = pts.map(([x, z]) => { const d = Math.hypot(x - cx, z - cz) || 1, k = Math.max(0, (d - 0.35) / d); return [cx + (x - cx) * k, cz + (z - cz) * k]; });
    inset.forEach(([ax, az], i) => {
      if (rng() < 0.3) return;
      const [bx, bz] = inset[(i + 1) % inset.length];
      const len = Math.hypot(bx - ax, bz - az), a = Math.atan2(bz - az, bx - ax);
      const pieces = len > 1.6 ? [[0, 0.4], [0.6, 1]] : [[0, 1]]; // a window gap in long walls
      for (const [p0, p1] of pieces) {
        const l = len * (p1 - p0), h = 0.5 + rng() * 0.8, mx = ax + (bx - ax) * (p0 + p1) / 2, mz = az + (bz - az) * (p0 + p1) / 2;
        const w = at(mesh(new THREE.BoxGeometry(l, h, 0.22), brick), mx, h / 2, mz); w.rotation.y = -a; g.add(w);
        const top = at(mesh(new THREE.BoxGeometry(l * 0.5, 0.18, 0.23), mortar), mx, h + 0.09, mz); top.rotation.y = -a; top.position.x += Math.cos(a) * l * (rng() - 0.5) * 0.4; top.position.z += Math.sin(a) * l * (rng() - 0.5) * 0.4; g.add(top);
      }
    });
    for (const [x, z] of scatter(rng, pts, 10, 0.2, 0.25)) { const b = at(mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), brick), x, 0.05, z); b.rotation.y = rng() * 3; g.add(b); }
    return g;
  },
  // A factory chimney snapped off, its fallen drums lying about.
  chimney(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t);
    g.add(ground(pts, std(0x2a2420, { roughness: 1 })));
    const brick = std(0x6b3a26, { roughness: 0.95 }), band = std(0x1a1512);
    const [cx, cz] = scatter(rng, pts, 1, 0.8)[0] ?? centroid(pts);
    g.add(at(mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.2, 14), brick), cx, 0.6, cz));
    g.add(at(mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.12, 14), band), cx, 0.95, cz));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(at(mesh(new THREE.BoxGeometry(0.25, 0.1 + rng() * 0.2, 0.18), brick), cx + Math.cos(a) * 0.45, 1.25, cz + Math.sin(a) * 0.45)); }
    const dark = at(mesh(new THREE.CircleGeometry(0.4, 12), std(0x0a0806)), cx, 1.21, cz); dark.rotation.x = -Math.PI / 2; g.add(dark);
    for (const [x, z] of scatter(rng, pts, 3, 0.7, 1.1).filter(([x, z]) => Math.hypot(x - cx, z - cz) > 1.2)) g.add(at(lying(0.45, 1.0, brick, rng() * 3, 14), x, 0.45, z));
    for (const [x, z] of scatter(rng, pts, 8, 0.2, 0.25)) { const b = at(mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), brick), x, 0.05, z); b.rotation.y = rng() * 3; g.add(b); }
    ctx.anim((dt) => { if (Math.random() < dt * 0.8) ctx.fx.particle(dark.getWorldPosition(V(0, 0, 0)), { color: 0x2a2420, size: 0.5, life: 2.5, grow: 3, additive: false, opacity: 0.3, vel: V(0.2, 0.8, 0.1) }); });
    return g;
  },
  // A burnt-out tram shell on its bogies, windows blown.
  tram(t, ctx, rng) {
    const pts = outline(t), strip = longestStrip(pts, 1.0);
    if (strip.len < 2) return RUIN.foundation(t, ctx, rng);
    const g = new THREE.Group();
    g.add(ground(pts, std(0x2a2420, { roughness: 1 })));
    const L = strip.len * 0.92, shell = std(0x3a2e26, { roughness: 0.9, metalness: 0.4 }), scorch = std(0x151210, { roughness: 1 });
    const car = new THREE.Group(); car.position.set(strip.cx, 0, strip.cz); car.rotation.y = -strip.angle; g.add(car);
    car.add(at(mesh(new THREE.BoxGeometry(L, 0.12, 0.9), scorch), 0, 0.3, 0));
    for (const s of [-1, 1]) {
      car.add(at(mesh(new THREE.BoxGeometry(L, 0.35, 0.05), shell), 0, 0.55, s * 0.43));
      const n = Math.max(2, Math.floor(L / 0.6));
      for (let i = 0; i <= n; i++) car.add(at(mesh(new THREE.BoxGeometry(0.06, 0.55, 0.05), shell), -L / 2 + (i / n) * L, 1.0, s * 0.43));
      car.add(at(mesh(new THREE.BoxGeometry(L * (0.4 + rng() * 0.4), 0.06, 0.06), shell), -L * 0.1, 1.3, s * 0.43));
    }
    for (const s of [-1, 1]) car.add(at(mesh(new THREE.BoxGeometry(0.05, 0.8, 0.9), shell), s * L / 2, 0.75, 0));
    for (const s of [-1, 1]) { const bog = at(mesh(new THREE.BoxGeometry(0.6, 0.18, 0.7), std(0x1a1614, { metalness: 0.6 })), s * L * 0.3, 0.12, 0); car.add(bog); }
    for (const s of [-1, 1]) car.add(at(mesh(new THREE.BoxGeometry(L * 1.02, 0.04, 0.05), std(0x4a4640, { metalness: 0.7 })), 0, 0.02, s * 0.32));
    return g;
  },
  // A factory floor: cracked slab, pillar stumps, a run of pipe.
  foundation(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t);
    g.add(ground(pts, std(0x3a3630, { roughness: 1 })));
    const conc = std(0x7a756c, { roughness: 1 });
    const [cx, cz] = centroid(pts);
    const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * 0.82, -(cz + (z - cz) * 0.82))));
    const slabGeo = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false }); slabGeo.rotateX(-Math.PI / 2);
    g.add(mesh(slabGeo, conc));
    pts.forEach(([x, z], i) => { if (i % 2) return; const px = cx + (x - cx) * 0.62, pz = cz + (z - cz) * 0.62, h = 0.4 + rng() * 0.9; g.add(at(mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 8), conc), px, 0.18 + h / 2, pz)); });
    const strip = longestStrip(pts, 0.4);
    if (strip.len > 1) {
      const pipe = std(0x5a4636, { metalness: 0.5, roughness: 0.6 });
      g.add(at(lying(0.12, strip.len * 0.7, pipe, -strip.angle), strip.cx, 0.3, strip.cz));
      const u = [Math.cos(strip.angle), Math.sin(strip.angle)];
      for (const k of [-0.25, 0.25]) { const f = at(mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 12), pipe), strip.cx + u[0] * strip.len * k, 0.3, strip.cz + u[1] * strip.len * k); f.rotation.y = -strip.angle + Math.PI / 2; g.add(f); }
    }
    return g;
  },
};

// ---- Woods (r 3.4 to 5.4, cap 0.3): low, wide area cover ----
const WOOD = {
  classic(t) {
    const s = new THREE.Shape(t.points.map(([x, y]) => new THREE.Vector2(x, -y)));
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
    return mesh(geo, std(0x2f4a24, { roughness: 1, flatShading: true }));
  },
  // Dead scrub: stumps, dry brush and fallen trunks on sooty earth.
  scrub(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t);
    g.add(ground(pts, std(0x3a3420, { roughness: 1 })));
    const bark = std(0x3a2a1c, { roughness: 1 }), brush = std(0x5a5230, { roughness: 1, flatShading: true });
    for (const [x, z] of scatter(rng, pts, 14, 0.25, 0.6)) { const h = 0.1 + rng() * 0.18; g.add(at(mesh(new THREE.CylinderGeometry(0.1, 0.16, h, 7), bark), x, h / 2, z)); }
    for (const [x, z] of scatter(rng, pts, 18, 0.25, 0.4)) { const b = at(lump(0.2, brush), x, 0.1, z); b.scale.set(1, 0.5, 1); b.rotation.y = rng() * 3; g.add(b); }
    for (const [x, z] of scatter(rng, pts, 3, 1.0, 1.5)) g.add(at(lying(0.1, 1.6, bark, rng() * 3, 7), x, 0.1, z));
    return g;
  },
  // Oily marsh: black pools with a sheen, reeds, a half-sunk drum, bubbles.
  marsh(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t), R = meanR(pts);
    g.add(ground(pts, std(0x2a2a1c, { roughness: 1 })));
    const oil = std(0x0c0e0c, { roughness: 0.35, metalness: 0.3 }), reed = std(0x5a5a2a, { roughness: 1 });
    const pools = scatter(rng, pts, 4, R * 0.3, R * 0.45);
    for (const [x, z] of pools) { const p = at(new THREE.Mesh(new THREE.CircleGeometry(R * 0.26, 16), oil), x, 0.04, z); p.rotation.x = -Math.PI / 2; p.scale.set(1, 0.6 + rng() * 0.4, 1); g.add(p); }
    for (const [x, z] of scatter(rng, pts, 12, 0.3, 0.5)) for (let k = 0; k < 5; k++) { const h = 0.16 + rng() * 0.12; const r = at(mesh(new THREE.ConeGeometry(0.02, h, 4), reed), x + (rng() - 0.5) * 0.3, h / 2, z + (rng() - 0.5) * 0.3); r.rotation.z = (rng() - 0.5) * 0.3; g.add(r); }
    if (pools[0]) g.add(at(lying(0.2, 0.55, std(0x6a2a1c, { metalness: 0.4 }), rng() * 3), pools[0][0], 0.06, pools[0][1]));
    ctx.anim((dt) => {
      if (!pools.length || Math.random() > dt * 1.2) return;
      const [x, z] = pools[Math.floor(Math.random() * pools.length)];
      ctx.fx.particle(g.localToWorld(V(x, 0.06, z)), { color: 0x3a3a2a, size: 0.12, life: 0.8, grow: 1.5, additive: false, opacity: 0.6, vel: V(0, 0.3, 0) });
    });
    return g;
  },
  // Wire field: rows of pickets strung with barbed wire.
  wire(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t);
    g.add(ground(pts, std(0x3a3024, { roughness: 1 })));
    const post = std(0x3a2a1c, { roughness: 1 }), wire = std(0x5a5550, { metalness: 0.7, roughness: 0.5 });
    const a = rng() * Math.PI, ux = Math.cos(a), uz = Math.sin(a);
    const [cx, cz] = centroid(pts), R = meanR(pts);
    for (let row = -2; row <= 2; row++) {
      const ox = cx - uz * row * 0.9, oz = cz + ux * row * 0.9;
      let prev = null;
      for (let s = -R * 1.3; s <= R * 1.3; s += 0.7) {
        const x = ox + ux * s, z = oz + uz * s;
        if (room(pts, x, z) < 0.15) { prev = null; continue; }
        g.add(at(mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), post), x, 0.14, z));
        if (prev) for (const y of [0.12, 0.24]) { const w = at(lying(0.008, 0.7, wire, -a, 4), (x + prev[0]) / 2, y, (z + prev[1]) / 2); g.add(w); }
        if (prev && rng() < 0.5) { const c = at(mesh(new THREE.TorusGeometry(0.08, 0.008, 4, 10), wire), (x + prev[0]) / 2, 0.18, (z + prev[1]) / 2); c.rotation.y = -a + Math.PI / 2; g.add(c); }
        prev = [x, z];
      }
    }
    return g;
  },
  // A fallen pipe run: long pipes, flanges, valve wheels, puddles.
  pipes(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t);
    g.add(ground(pts, std(0x2e2a22, { roughness: 1 })));
    const pipe = std(0x6b4a30, { metalness: 0.5, roughness: 0.6 }), iron = std(0x2e2a26, { metalness: 0.6 });
    const main = longestStrip(pts, 0.5);
    const runs = [main, { ...main, angle: main.angle + 0.35 + rng() * 0.3 }];
    runs.forEach((s, i) => {
      const len = (i ? 0.55 : 0.85) * (i ? longestStrip(pts, 0.5).len : s.len), u = [Math.cos(s.angle), Math.sin(s.angle)], off = i ? 0.8 : 0;
      const x = s.cx - u[1] * off, z = s.cz + u[0] * off;
      if (room(pts, x + u[0] * len / 2, z + u[1] * len / 2) < 0.2 || room(pts, x - u[0] * len / 2, z - u[1] * len / 2) < 0.2) return;
      g.add(at(lying(0.12, len, pipe, -s.angle), x, 0.12, z));
      for (let k = -2; k <= 2; k++) { const f = at(mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 12), iron), x + u[0] * len * k * 0.2, 0.12, z + u[1] * len * k * 0.2); f.rotation.y = -s.angle + Math.PI / 2; g.add(f); }
      const vw = at(mesh(new THREE.TorusGeometry(0.1, 0.018, 5, 12), std(0xa8321e)), x, 0.27, z); vw.rotation.x = Math.PI / 2; g.add(vw);
    });
    for (const [x, z] of scatter(rng, pts, 3, 0.5, 1)) { const p = at(new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), std(0x0c0a08, { roughness: 0.35, metalness: 0.3 })), x, 0.03, z); p.rotation.x = -Math.PI / 2; g.add(p); }
    return g;
  },
};

// ---- Craters (ellipse, cap 0.3) ----
// A low rim: a lathe ring on the unit circle, stretched to the ellipse.
function rim(t, m, height = 0.24, inner = 0.55) {
  const prof = [[inner, 0.01], [(inner + 0.8) / 2, height * 0.6], [0.8, height], [0.9, height * 0.5], [0.97, 0.01]].map(([r, y]) => new THREE.Vector2(r, y));
  const o = mesh(new THREE.LatheGeometry(prof, 32), m); o.scale.set(t.rx, 1, t.ry);
  return o;
}
function disc(t, k, m, y) { const o = new THREE.Mesh(new THREE.CircleGeometry(1, 28), m); o.rotation.x = -Math.PI / 2; o.scale.set(t.rx * k, t.ry * k, 1); o.position.y = y; o.receiveShadow = true; return o; }
const CRATER = {
  classic(t) { return disc(t, 1, std(0x3a3226, { roughness: 1 }), 0.02); },
  // Fresh shell crater: scorched bowl, raised lip, shrapnel, a wisp of smoke.
  shell(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t);
    g.add(disc(t, 1, std(0x2a2218, { roughness: 1 }), 0.015)); g.add(disc(t, 0.55, std(0x0e0c0a, { roughness: 1 }), 0.02));
    g.add(rim(t, std(0x4a3c2b, { roughness: 1, flatShading: true })));
    for (const [x, z] of scatter(rng, pts, 8, 0.2, 0.3)) { const s = at(mesh(new THREE.BoxGeometry(0.16, 0.03, 0.08), std(0x3a3632, { metalness: 0.7 })), x, 0.04, z); s.rotation.set(rng(), rng() * 3, rng()); g.add(s); }
    const mouth = new THREE.Object3D(); mouth.position.y = 0.1; g.add(mouth);
    ctx.anim((dt) => { if (Math.random() < dt * 1.2) ctx.fx.particle(mouth.getWorldPosition(V(0, 0, 0)), { color: 0x2a2420, size: 0.6, life: 2.5, grow: 3, additive: false, opacity: 0.3, vel: V(0.2, 0.8, 0.1) }); });
    return g;
  },
  // Flooded with oil: a black mirror in the bowl, a drum adrift.
  flooded(t, ctx, rng) {
    const g = new THREE.Group();
    g.add(disc(t, 1, std(0x2a2a1c, { roughness: 1 }), 0.015));
    g.add(rim(t, std(0x3a3424, { roughness: 1, flatShading: true }), 0.2, 0.62));
    const oil = std(0x06080a, { roughness: 0.35, metalness: 0.3 });
    g.add(disc(t, 0.62, oil, 0.05));
    const drum = at(lying(0.16, 0.45, std(0x7a2a1c, { metalness: 0.4 }), rng() * 3), t.rx * 0.2, 0.08, -t.ry * 0.1); g.add(drum);
    const ph = rng() * 6;
    ctx.anim((dt, now) => { drum.position.y = 0.08 + Math.sin(now * 1.2 + ph) * 0.02; drum.rotation.y += dt * 0.05; });
    return g;
  },
  // Unexploded bomb: tail fins jutting from the bowl, plates thrown about.
  bomb(t, ctx, rng) {
    const g = new THREE.Group(), pts = outline(t);
    g.add(disc(t, 1, std(0x2e2418, { roughness: 1 }), 0.015)); g.add(disc(t, 0.5, std(0x14100c, { roughness: 1 }), 0.02));
    g.add(rim(t, std(0x4a3a28, { roughness: 1, flatShading: true }), 0.22, 0.5));
    const b = new THREE.Group(); b.rotation.set(0.5, rng() * 3, 0.3); g.add(b);
    const shell = std(0x3a4a2a, { metalness: 0.5, roughness: 0.6 });
    b.add(at(mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.6, 12), shell), 0, -0.2, 0));
    for (let i = 0; i < 4; i++) { const f = at(mesh(new THREE.BoxGeometry(0.02, 0.22, 0.2), shell), 0, 0.1, 0); f.rotation.y = (i * Math.PI) / 2; b.add(f); }
    b.add(at(mesh(new THREE.TorusGeometry(0.1, 0.015, 4, 12), std(0xd8a21c)), 0, 0.16, 0));
    for (const [x, z] of scatter(rng, pts, 5, 0.35, 0.5)) { const p = at(mesh(new THREE.BoxGeometry(0.4, 0.03, 0.3), std(0x3a3632, { metalness: 0.6 })), x, 0.1, z); p.rotation.set(rng() - 0.5, rng() * 3, rng() - 0.5); g.add(p); }
    return g;
  },
  // Sinkhole: the ground fell into a buried main; broken pipes jut out.
  sinkhole(t, ctx, rng) {
    const g = new THREE.Group();
    g.add(disc(t, 1, std(0x2e2820, { roughness: 1 }), 0.015));
    g.add(rim(t, std(0x3e3428, { roughness: 1, flatShading: true }), 0.16, 0.45));
    g.add(disc(t, 0.42, std(0x040303, { roughness: 1 }), 0.025));
    const pipe = std(0x6b4a30, { metalness: 0.5, roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2, r = 0.5;
      const p = at(lying(0.09, Math.min(t.rx, t.ry) * 0.5, pipe, -a), Math.cos(a) * t.rx * r, 0.1, Math.sin(a) * t.ry * r); g.add(p);
    }
    const mouth = new THREE.Object3D(); mouth.position.y = 0.05; g.add(mouth);
    ctx.anim((dt) => { if (Math.random() < dt * 0.6) ctx.fx.particle(mouth.getWorldPosition(V(0, 0, 0)), { color: 0xd8d4cc, size: 0.5, life: 1.8, grow: 2.5, additive: false, opacity: 0.35, vel: V(0, 0.9, 0) }); });
    return g;
  },
};

export const SCENERY = { rock: ROCK, ruin: RUIN, wood: WOOD, crater: CRATER };
export const SCENERY_VARIANTS = Object.fromEntries(Object.entries(SCENERY).map(([k, v]) => [k, Object.keys(v)]));

// Which slot a terrain piece dresses as.
export function scenerySlot(t) {
  if (t.shape === "ellipse") return "crater";
  return t.kind === "wood" || t.kind === "ruin" ? t.kind : "rock";
}
function pickVariant(slot, t, ctx) {
  const list = SCENERY_VARIANTS[slot];
  if (ctx?.pick) return ctx.pick(`scenery-${slot}`, t, list);
  const h = Math.abs(Math.sin((t.x || 0) * 91.345 + (t.y || 0) * 47.853) * 24634.6345);
  return list[Math.floor((h - Math.floor(h)) * list.length)];
}
// One specific variant (the dev room, tests).
export function sceneryVariant(slot, variant, t, ctx) {
  const rng = rngFrom(`${slot}|${variant}|${t.x}|${t.y}`);
  const g = new THREE.Group();
  g.add(SCENERY[slot][variant](t, ctx, rng));
  g.userData.variant = variant;
  return g;
}
export function sceneryProp(t, ctx) {
  const slot = scenerySlot(t);
  return sceneryVariant(slot, pickVariant(slot, t, ctx), t, ctx);
}
