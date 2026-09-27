// More dieselpunk set dressing: five building kinds and the small-terrain
// variants, each inside the footprint and height range of the originals
// (rig/envelope.js SET_ENVELOPE, props.test.js). Same ctx and idle-life
// conventions as props.js.
import * as THREE from "three";
import { std, glow, shadow, V, blinker, steamValve, flickerWindows } from "./dress-kit.js";
import { buildRigBody } from "./rig/body.js";
import { RECIPES } from "./rig/recipes.js";
import { skinMaterials } from "./rig/skins.js";
import { PAINT } from "./mechs.js";

const box = (w, h, d, m) => shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
const cyl = (rt, rb, h, m, seg = 12) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m));
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
// A beam (cylinder) from p to q.
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
// One sandbag, long along x.
const SAND = () => std(0x9a8660, { roughness: 1 });
function sandbag(len, m) { const o = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), m)); o.scale.set(len, 0.2, 0.34); return o; }

// ---- Buildings ----

// Pump house: a brick engine house with a rocking beam engine on the roof.
function pumphouse(t, ctx) {
  const g = new THREE.Group();
  const W = t.w * 0.9, D = t.h * 0.9, H = 3.6;
  g.add(at(box(W, H, D, windowsMat(ctx, W, H)), 0, H / 2, 0));
  // Gable roof: two tilted slabs.
  const slate = std(0x3a3430, { roughness: 0.8 });
  for (const s of [-1, 1]) { const r = box(W + 0.2, 0.14, D * 0.56, slate); r.position.set(0, H + 0.45, s * D * 0.24); r.rotation.x = s * 0.5; g.add(r); }
  // Beam engine: A-frame, rocking beam, piston rod and a flywheel.
  const iron = std(0x2e2a26, { metalness: 0.6, roughness: 0.5 });
  const top = H + 2.3;
  for (const z of [-0.35, 0.35]) { g.add(beam(V(-0.6, H + 0.6, z), V(0, top, z), 0.07, iron)); g.add(beam(V(0.6, H + 0.6, z), V(0, top, z), 0.07, iron)); }
  const rock = new THREE.Group(); rock.position.set(0, top, 0); g.add(rock);
  rock.add(box(Math.min(W * 0.75, 4), 0.22, 0.2, std(0x6b3a26, { metalness: 0.4 })));
  const rodL = cyl(0.05, 0.05, 1.4, iron); rodL.position.set(-Math.min(W * 0.75, 4) / 2 + 0.1, -0.7, 0); rock.add(rodL);
  const fly = new THREE.Group(); fly.position.set(W * 0.3, H + 1.3, D * 0.3); g.add(fly);
  const rim = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.07, 8, 24), iron)); fly.add(rim);
  for (let i = 0; i < 3; i++) { const sp = box(0.05, 1.4, 0.05, iron); sp.rotation.z = (i * Math.PI) / 3; fly.add(sp); }
  const ph = ctx.rand() * 6;
  ctx.anim((dt, now) => { const a = Math.sin(now * 1.6 + ph); rock.rotation.z = a * 0.18; fly.rotation.z -= dt * 2; });
  // Outflow pipe down the side, hissing now and then.
  g.add(at(cyl(0.18, 0.18, H, std(0x5a4636, { metalness: 0.5 })), W / 2 + 0.2, H / 2, -D * 0.3));
  const valve = new THREE.Object3D(); valve.position.set(W / 2 + 0.2, 0.4, -D * 0.3); g.add(valve);
  steamValve(ctx, valve, { every: 4, dir: V(1.2, 1.2, 0) });
  return g;
}

// Gas holder: telescoping lifts inside a column guide frame, slowly breathing.
function gasholder(t, ctx) {
  const g = new THREE.Group();
  const R = Math.min(t.w, t.h) / 2 * 0.88, H = 7.2;
  const iron = std(0x3a332c, { metalness: 0.6, roughness: 0.5 }), red = std(0x7a3424, { metalness: 0.4, roughness: 0.6 });
  const n = 8;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.add(at(cyl(0.1, 0.13, H, iron, 6), Math.cos(a) * R, H / 2, Math.sin(a) * R)); }
  for (const y of [H * 0.5, H]) { const ring = shadow(new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 6, 32), iron)); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
  // Lattice ties between neighbouring columns.
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2;
    g.add(beam(V(Math.cos(a) * R, 0.3, Math.sin(a) * R), V(Math.cos(b) * R, H * 0.5, Math.sin(b) * R), 0.03, iron));
    g.add(beam(V(Math.cos(a) * R, H * 0.5, Math.sin(a) * R), V(Math.cos(b) * R, H, Math.sin(b) * R), 0.03, iron));
  }
  const lifts = [0.86, 0.8, 0.74].map((k, i) => {
    const l = cyl(R * k, R * k, 2.2, i === 0 ? std(0x5a5048, { metalness: 0.4 }) : red, 28); g.add(l);
    const band = shadow(new THREE.Mesh(new THREE.TorusGeometry(R * k + 0.02, 0.05, 5, 28), iron)); band.rotation.x = Math.PI / 2; l.add(at(band, 0, 1.08, 0));
    return l;
  });
  const crown = shadow(new THREE.Mesh(new THREE.SphereGeometry(R * 0.74, 24, 8, 0, Math.PI * 2, 0, 0.35), red)); g.add(crown);
  const vent = new THREE.Object3D(); g.add(vent);
  steamValve(ctx, vent, { every: 6, size: 0.6 });
  const ph = ctx.rand() * 6;
  ctx.anim((dt, now) => {
    const f = 0.5 + 0.5 * Math.sin(now * 0.15 + ph); // how full it is
    lifts.forEach((l, i) => { l.position.y = 1.1 + i * (1.0 + f * 1.0); });
    const topY = lifts[2].position.y + 1.1;
    crown.position.y = topY - R * 0.74 * Math.cos(0.35); vent.position.y = topY + 0.2;
  });
  lifts.forEach((l, i) => { l.position.y = 1.1 + i * 1.5; });
  crown.position.y = lifts[2].position.y + 1.1 - R * 0.74 * Math.cos(0.35);
  return g;
}

// Signal box: a brick base under a glazed timber cabin, a semaphore post beside.
function signalbox(t, ctx) {
  const g = new THREE.Group();
  const W = t.w * 0.7, D = t.h * 0.7, baseH = 2.4, cabH = 1.6;
  g.add(at(box(W, baseH, D, windowsMat(ctx, W, baseH)), -t.w * 0.08, baseH / 2, 0));
  const timber = std(0x5a3a22, { roughness: 0.8 });
  const cab = new THREE.Group(); cab.position.set(-t.w * 0.08, baseH, 0); g.add(cab);
  cab.add(at(box(W + 0.2, 0.5, D + 0.2, timber), 0, 0.25, 0));
  const pane = glow(ctx.theme.lamp, 0.9);
  cab.add(at(box(W + 0.18, 0.8, D + 0.18, pane), 0, 0.9, 0));
  for (let i = 0; i <= 6; i++) { const x = -W / 2 + (i / 6) * W; for (const s of [-1, 1]) cab.add(at(box(0.06, 0.8, 0.06, timber), x, 0.9, s * (D / 2 + 0.1))); }
  cab.add(at(box(W + 0.2, 0.3, D + 0.2, timber), 0, cabH - 0.15 + 0.05, 0));
  const roofGeo = new THREE.CylinderGeometry(0.02, Math.SQRT1_2, 1.1, 4, 1); roofGeo.rotateY(Math.PI / 4); roofGeo.scale(W + 0.5, 1, D + 0.5);
  cab.add(at(shadow(new THREE.Mesh(roofGeo, std(0x2e2a28))), 0, cabH + 0.55, 0));
  // External stair up the side.
  for (let i = 0; i < 7; i++) g.add(at(box(0.36, 0.1, 0.7, timber), -t.w * 0.08 + W / 2 - 0.3 - i * 0.02, 0.3 + i * 0.32, D / 2 + 0.45 - Math.min(0.1, i * 0.01)));
  // Semaphore: a post with an arm that drops every few seconds.
  const px = t.w / 2 - 0.3, pz = -t.h / 2 + 0.3;
  const iron = std(0x2e2a26, { metalness: 0.6 });
  g.add(at(cyl(0.07, 0.1, 5.6, iron, 6), px, 2.8, pz));
  const arm = new THREE.Group(); arm.position.set(px, 5.0, pz + 0.12); g.add(arm);
  const blade = box(0.9, 0.16, 0.04, std(0xc0282d)); blade.position.x = -0.45; arm.add(blade);
  arm.add(at(box(0.12, 0.16, 0.05, std(0xf0ece0)), -0.75, 0, 0.01));
  const lampMat = glow(0xff3a2a, 2);
  arm.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lampMat), 0.12, 0, 0));
  const ph = ctx.rand() * 8;
  ctx.anim((dt, now) => {
    const clear = Math.floor((now + ph) / 5) % 2 === 1;
    arm.rotation.z += ((clear ? -0.7 : 0) - arm.rotation.z) * Math.min(1, dt * 4);
    lampMat.emissive.setHex(clear ? 0x3aff6a : 0xff3a2a);
  });
  return g;
}

// Radio pylon: a tapering lattice tower with a blinking warning lamp and a hut.
function pylon(t, ctx) {
  const g = new THREE.Group();
  const a = Math.min(t.w, t.h) * 0.36, top = 9.4, tipA = 0.28;
  const iron = std(0x2e2a26, { metalness: 0.7, roughness: 0.45 });
  const corner = (y, sx, sz) => { const k = a + (tipA - a) * (y / top); return V(sx * k, y, sz * k); };
  const C = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (const [sx, sz] of C) g.add(beam(corner(0, sx, sz), corner(top, sx, sz), 0.07, iron));
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const y0 = (i / segs) * top, y1 = ((i + 1) / segs) * top;
    C.forEach(([sx, sz], j) => {
      const [nx, nz] = C[(j + 1) % 4];
      g.add(beam(corner(y0, sx, sz), corner(y1, nx, nz), 0.025, iron));
      g.add(beam(corner(y1, sx, sz), corner(y0, nx, nz), 0.025, iron));
    });
  }
  g.add(at(box(tipA * 2.4, 0.12, tipA * 2.4, iron), 0, top, 0));
  g.add(at(cyl(0.04, 0.06, 1.0, iron, 6), 0, top + 0.5, 0));
  for (const y of [top - 0.8, top - 2.2]) for (const s of [-1, 1]) g.add(at(cyl(0.05, 0.05, 0.18, std(0xf0ece0, { roughness: 0.3 }), 8), s * 0.4, y, 0));
  blinker(ctx, g, V(0, top + 1.05, 0), 0xff3a2a, { period: 1.4, duty: 0.3, size: 0.13 });
  // The operators' hut at the foot.
  const hx = -t.w / 2 + 0.95, hz = t.h / 2 - 0.85;
  g.add(at(box(1.6, 1.4, 1.4, std(0x6a6258, { roughness: 0.9 })), hx, 0.7, hz));
  g.add(at(box(1.8, 0.12, 1.6, std(0x2e2a28)), hx, 1.46, hz));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), glow(ctx.theme.lamp, 1.1)); door.position.set(hx + 0.81, 0.45, hz); door.rotation.y = Math.PI / 2; g.add(door);
  return g;
}

// Pillbox: a hexagonal concrete bunker ringed with sandbags, its searchlight sweeping.
function pillbox(t, ctx) {
  const g = new THREE.Group();
  const R = Math.min(t.w, t.h) * 0.36;
  const concrete = std(0x8a857c, { roughness: 1 });
  g.add(at(cyl(R, R * 1.08, 1.8, concrete, 6), 0, 0.9, 0));
  g.add(at(cyl(R * 1.14, R * 1.14, 0.35, concrete, 6), 0, 1.97, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const slit = box(0.16, 0.18, R * 0.7, glow(ctx.theme.lamp, 0.4));
    slit.position.set(Math.cos(a) * R * 0.94, 1.25, Math.sin(a) * R * 0.94); slit.rotation.y = -a; g.add(slit);
  }
  // Sandbag ring round the base.
  const sand = SAND();
  const ringR = Math.min(R * 1.35, Math.min(t.w, t.h) / 2 - 0.2);
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; const b = sandbag(0.8, sand); b.position.set(Math.cos(a) * ringR, 0.12 + (i % 2) * 0.16, Math.sin(a) * ringR); b.rotation.y = -a + Math.PI / 2; g.add(b); }
  // Searchlight on the roof, sweeping.
  const head = new THREE.Group(); head.position.y = 2.3; g.add(head);
  head.add(at(cyl(0.08, 0.1, 0.3, std(0x2e2a26), 8), 0, 0, 0));
  const lamp = cyl(0.22, 0.22, 0.34, std(0x3a3a3f, { metalness: 0.6 }), 12); lamp.rotation.z = Math.PI / 2; lamp.position.set(0.1, 0.3, 0); head.add(lamp);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), glow(ctx.theme.search ?? 0xfff0c8, 2.5)); lens.rotation.y = Math.PI / 2; lens.position.set(0.28, 0.3, 0); head.add(lens);
  const ph = ctx.rand() * 6;
  ctx.anim((dt, now) => { head.rotation.y = Math.sin(now * 0.5 + ph) * 1.4; });
  return g;
}

export const NEW_BUILDINGS_MAP = { pumphouse, gasholder, signalbox, pylon, pillbox };
export const NEW_BUILDINGS = Object.keys(NEW_BUILDINGS_MAP);

// ---- Small terrain variants (t = the rect, built centred) ----

// Sandbag wall: staggered courses along the rect with a coil of wire on top.
function sandbags(t, ctx) {
  const g = new THREE.Group();
  const sand = SAND(), dark = std(0x7a6a4a, { roughness: 1 });
  const bagL = 0.7, rows = 3;
  for (let r = 0; r < rows; r++) {
    const n = Math.max(1, Math.floor((t.w - (r % 2) * bagL * 0.5) / bagL));
    const x0 = -((n - 1) * bagL) / 2;
    for (let i = 0; i < n; i++) for (const z of t.h > 0.8 ? [-t.h * 0.22, t.h * 0.22] : [0]) {
      const b = sandbag(bagL * 0.98, (i + r) % 3 ? sand : dark); b.position.set(x0 + i * bagL, 0.14 + r * 0.3, z); b.scale.z = Math.min(0.34, t.h * 0.9); g.add(b);
    }
  }
  const wire = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 4, 10), std(0x5a5550, { metalness: 0.7 }));
  const coil = new THREE.Group(); coil.position.y = 1.02; g.add(coil);
  for (let x = -t.w / 2 + 0.25; x < t.w / 2 - 0.1; x += 0.12) { const w = wire.clone(); w.position.x = x; w.rotation.y = Math.PI / 2 + 0.3; coil.add(w); }
  // A trench periscope and a signal lamp on a stake.
  g.add(at(box(0.08, 0.5, 0.08, std(0x2e2a26)), -t.w / 2 + 0.3, 1.1, 0));
  blinker(ctx, g, V(t.w / 2 - 0.3, 1.2, 0), ctx.theme.lamp, { period: 2.4, duty: 0.5, size: 0.08 });
  g.add(at(cyl(0.02, 0.02, 1.1, std(0x2e2a26), 5), t.w / 2 - 0.3, 0.6, 0));
  return g;
}

// Fuel drum cluster: standing drums in the rect, one on its side, a stacked one.
function drums(t, ctx) {
  const g = new THREE.Group();
  const cols = [0x7a2a1c, 0x4a5a2a, 0x6a4a2a, 0x2a3a4a];
  const r = Math.min(0.3, Math.min(t.w, t.h) / 4), h = r * 2.9;
  const nx = Math.max(1, Math.floor(t.w / (r * 2.2))), nz = Math.max(1, Math.floor(t.h / (r * 2.2)));
  let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (nx * nz > 2 && (i + j * 3) % 5 === 4) continue; // a gap here and there
    const m = std(cols[(k++ + Math.floor(t.x)) % cols.length], { metalness: 0.4, roughness: 0.6 });
    const x = -t.w / 2 + r * 1.1 + i * r * 2.2 + (t.w - nx * r * 2.2) / 2, z = -t.h / 2 + r * 1.1 + j * r * 2.2 + (t.h - nz * r * 2.2) / 2;
    const d = cyl(r, r, h, m, 14); d.position.set(x, h / 2, z); g.add(d);
    for (const y of [0.3, 0.7]) { const hoop = at(shadow(new THREE.Mesh(new THREE.TorusGeometry(r + 0.01, 0.018, 4, 16), std(0x2a2622))), x, h * y, z); hoop.rotation.x = Math.PI / 2; g.add(hoop); }
  }
  if (Math.min(t.w, t.h) >= 1.9) { const top = cyl(r, r, h, std(cols[0], { metalness: 0.4 }), 14); top.position.set(0, h * 1.5, 0); g.add(top); }
  // A leaking drum's puddle.
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(Math.min(t.w, t.h) * 0.3, 16), std(0x0c0a08, { roughness: 0.35, metalness: 0.3 }));
  puddle.rotation.x = -Math.PI / 2; puddle.position.set(t.w * 0.15, 0.01, t.h * 0.15); g.add(puddle);
  blinker(ctx, g, V(-t.w * 0.3, h + 0.1, -t.h * 0.3), 0xffa020, { period: 1.3, duty: 0.4, size: 0.07 });
  return g;
}

// Cable spools: big wooden reels lying about, one with loose cable.
function spools(t, ctx) {
  const g = new THREE.Group();
  const wood = std(0x6a4a2a, { roughness: 0.9 }), cable = std(0x1a1a1a, { roughness: 0.6 });
  const R = Math.min(t.w, t.h) * 0.36, L = Math.min(t.h, t.w) * 0.5;
  const reel = (x, z, rot, s) => {
    const r = new THREE.Group(); r.position.set(x, R * s, z); r.rotation.y = rot; g.add(r);
    for (const k of [-1, 1]) { const d = cyl(R * s, R * s, 0.08, wood, 18); d.rotation.x = Math.PI / 2; d.position.z = k * L * s / 2; r.add(d); }
    const core = cyl(R * s * 0.7, R * s * 0.7, L * s * 0.9, cable, 16); core.rotation.x = Math.PI / 2; r.add(core);
    return r;
  };
  reel(-t.w * 0.18, 0, 0.2, 1);
  if (t.w > 1.6) reel(t.w * 0.28, -t.h * 0.1, 1.2, 0.7);
  const loose = shadow(new THREE.Mesh(new THREE.TorusGeometry(Math.min(t.w, t.h) * 0.22, 0.03, 5, 20), cable)); loose.rotation.x = -Math.PI / 2; loose.position.set(t.w * 0.2, 0.03, t.h * 0.2); g.add(loose);
  void ctx;
  return g;
}

// Czech hedgehog tank traps: three crossed girders, a few scattered.
function hedgehogs(t, ctx) {
  const g = new THREE.Group();
  const steel = std(0x4a3a30, { metalness: 0.6, roughness: 0.7 });
  const s = Math.min(t.w, t.h) * 0.62;
  const one = (x, z, rot) => {
    const h = new THREE.Group(); h.position.set(x, s * 0.354, z); h.rotation.y = rot; g.add(h);
    const a = box(s, 0.1, 0.1, steel); a.rotation.z = Math.PI / 4; h.add(a);
    const b = box(s, 0.1, 0.1, steel); b.rotation.z = -Math.PI / 4; h.add(b);
    const c = box(0.1, 0.1, s, steel); c.rotation.x = Math.PI / 4; c.position.y = 0; h.add(c);
  };
  const n = t.w / t.h > 1.6 ? 3 : t.w * t.h > 3 ? 2 : 1;
  for (let i = 0; i < n; i++) one(n === 1 ? 0 : -t.w / 2 + s / 2 + 0.05 + i * ((t.w - s - 0.1) / (n - 1)), (i % 2 ? 1 : -1) * Math.max(0, t.h / 2 - s / 2 - 0.05) * 0.5, ctx.rand() * 3);
  return g;
}

// A burnt-out rig carcass on its side, built from a real chassis recipe.
const carcassMats = new Map();
function carcass(t, ctx) {
  const g = new THREE.Group();
  const names = Object.keys(RECIPES);
  const name = names[Math.abs(Math.floor(t.x * 7 + t.y * 13)) % names.length];
  const cls = ["Copper", "Black", "Red", "Silver", "Brass", "Ivory", "Jade"].includes(name) ? "medium" : "light";
  if (!carcassMats.has(name)) {
    const m = skinMaterials("worn", { color: new THREE.Color(PAINT[name] ?? 0x777777).multiplyScalar(0.35).getHex(), trim: RECIPES[name].trim });
    carcassMats.set(name, m);
  }
  const dead = std(0x1a1614, { roughness: 0.9 });
  const built = buildRigBody({ cls, recipe: RECIPES[name], mats: carcassMats.get(name), glass: dead, vent: dead, baseScale: 0.5 });
  const wreck = new THREE.Group(); wreck.add(built.pelvis); g.add(wreck);
  built.pelvis.position.y = 0;
  built.pelvis.rotation.set(0.15, 0.3, Math.PI / 2 - 0.25); // toppled onto its side
  built.legs[0].hip.rotation.z = -0.9; built.legs[1].knee.rotation.z = 1.2;
  // Fit it inside the rect and under the rubble height.
  wreck.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(wreck), sz = b.getSize(V(0, 0, 0));
  const k = Math.min((t.w * 0.95) / sz.x, (t.h * 0.95) / sz.z, (0.72 * Math.min(t.w, t.h)) / sz.y);
  wreck.scale.setScalar(k);
  wreck.position.set(-(b.min.x + b.max.x) / 2 * k, -b.min.y * k, -(b.min.z + b.max.z) / 2 * k);
  // Still smouldering.
  const top = new THREE.Object3D(); top.position.y = sz.y * k * 0.8; g.add(top);
  ctx.anim((dt) => {
    if (Math.random() > dt * 1.5) return;
    ctx.fx.particle(top.getWorldPosition(V(0, 0, 0)), { color: 0x2a2420, size: 0.5, life: 2.5, grow: 3, additive: false, opacity: 0.35, vel: V(0.2, 0.9, 0.1) });
  });
  g.userData.carcassOf = name;
  return g;
}

export const SMALL_BUILDERS = { barricade: { sandbags }, crate: { drums, spools }, rubble: { hedgehogs, carcass } };
