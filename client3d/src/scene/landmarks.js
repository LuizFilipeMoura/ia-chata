// Set pieces beyond the table for the deeper dieselpunk locales: Arc Pylons
// and a Wall of Light checkpoint (Dunwall), Hugh Ferriss setback towers raked
// by searchlights, Rozalski's fields with a windmill and a village church, the
// Karnaca harbour with seaplanes and a whitewashed hill town, Rapture's
// bulkheads and deco towers in dark water, and the trench line of No-Man's-
// Land. Same contract as props.js backdrop(): built round the table centre `c`
// at radius `R` (beyond the camera's reach), idle life through ctx.anim, and
// every light warm and dim (no point lights, shafts are faint additive cones)
// so nothing blooms into a white blob. Repeated bits are instanced.
import * as THREE from "three";
import { std, glow, V } from "./dress-kit.js";
import { gasSign } from "./estates.js";

const Q = new THREE.Quaternion(), E = new THREE.Euler();
const TRS = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(V(x, y, z), Q.clone().setFromEuler(E.set(rx, ry, rz)), V(sx, sy, sz));
function instanced(geo, mat, list, shadowCast = false) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((x, i) => m.setMatrixAt(i, x));
  m.count = list.length; m.instanceMatrix.needsUpdate = true; m.castShadow = shadowCast; m.receiveShadow = true;
  return m;
}
const mesh = (geo, m) => new THREE.Mesh(geo, m);
const put = (o, x, y, z) => { o.position.set(x, y, z); return o; };
// A faint warm shaft of light, apex at the origin, pointing up +y.
function shaft(color, len, spread, opacity = 0.05) {
  const geo = new THREE.CylinderGeometry(0.4, spread, len, 18, 1, true); geo.translate(0, len / 2, 0);
  return mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
}
const GROUND = -0.8; // the floor round the table (world.js `outer`)

// ---- Arc Pylons: iron towers with coil crowns, a warm arc now and then ----
function arcpylons(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const iron = std(0x1e1c1a, { metalness: 0.6 }), brass = std(0x6a5430, { metalness: 0.6 });
  const tops = [];
  for (let k = 0; k < 3; k++) {
    const p = around(ang + k * 0.16, R + 6 + k * 5), H = 34 + ctx.rand() * 8;
    const t = new THREE.Group(); t.position.copy(p).setY(GROUND); g.add(t);
    t.add(put(mesh(new THREE.CylinderGeometry(1.2, 2.2, H, 6), iron), 0, H / 2, 0));
    for (let f = 0; f < 4; f++) { const fin = mesh(new THREE.BoxGeometry(0.5, H * 0.8, 3.2), iron); fin.rotation.y = (f * Math.PI) / 2; t.add(put(fin, 0, H * 0.4, 0)); }
    for (let r = 0; r < 3; r++) { const ring = mesh(new THREE.TorusGeometry(2.4 - r * 0.4, 0.3, 6, 18), brass); ring.rotation.x = Math.PI / 2; t.add(put(ring, 0, H + 0.8 + r * 1.1, 0)); }
    const cap = mesh(new THREE.SphereGeometry(1, 12, 8), glow(0xffb060, 0.7)); t.add(put(cap, 0, H + 4.2, 0));
    tops.push({ cap, at: p.clone().setY(GROUND + H + 4.2) });
  }
  // The arc: a jagged warm line between neighbouring crowns, flickering on
  // for a beat every few seconds. A line, not a light: it can't glare.
  const pts = 14, arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(pts * 3 * 2), 3));
  const arcMat = new THREE.LineBasicMaterial({ color: 0xffc890, transparent: true, opacity: 0 });
  const arc = new THREE.Line(arcGeo, arcMat); arc.frustumCulled = false; g.add(arc);
  let next = 2 + ctx.rand() * 4, until = 0;
  ctx.anim((dt, now) => {
    if (now > next) { until = now + 0.35; next = now + 3 + Math.random() * 5; }
    const on = now < until;
    arcMat.opacity = on ? 0.9 : 0;
    for (const t of tops) t.cap.material.emissiveIntensity = on ? 1.2 : 0.6 + 0.1 * Math.sin(now * 2);
    if (!on) return;
    const a = arcGeo.attributes.position;
    for (let s = 0; s < 2; s++) {
      const p = tops[s].at, q = tops[s + 1].at;
      for (let j = 0; j < pts; j++) {
        const k = j / (pts - 1), jit = j === 0 || j === pts - 1 ? 0 : 1.2;
        a.setXYZ(s * pts + j, p.x + (q.x - p.x) * k + (Math.random() - 0.5) * jit, p.y + (q.y - p.y) * k + (Math.random() - 0.5) * jit - Math.sin(Math.PI * k) * 2, p.z + (q.z - p.z) * k + (Math.random() - 0.5) * jit);
      }
    }
    a.needsUpdate = true;
  });
  return g;
}

// ---- Wall of Light: a checkpoint gate between two pylons, an amber curtain ----
function curtainTexture() {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas"); cv.width = 8; cv.height = 128;
  const x = cv.getContext("2d");
  for (let y = 0; y < 128; y++) { x.fillStyle = `rgba(255,255,255,${0.25 + 0.35 * (Math.sin(y * 0.45) * 0.5 + 0.5) * (y % 16 < 2 ? 1.6 : 1)})`; x.fillRect(0, y, 8, 1); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
  return t;
}
function walloflight(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const p = around(ang, R + 4); g.position.copy(p).setY(GROUND); g.lookAt(c.x, GROUND, c.z);
  const iron = std(0x1c1a18, { metalness: 0.6 }), brick = std(0x3a2a22, { roughness: 1 }), brass = std(0x6a5430, { metalness: 0.6 });
  const span = 22, H = 18;
  for (const s of [-1, 1]) {
    g.add(put(mesh(new THREE.BoxGeometry(2.6, H + 3, 2.6), iron), s * span / 2, (H + 3) / 2, 0));
    for (let r = 0; r < 3; r++) { const ring = mesh(new THREE.TorusGeometry(1.8, 0.22, 6, 16), brass); ring.rotation.x = Math.PI / 2; g.add(put(ring, s * span / 2, H + 3.6 + r * 0.8, 0)); }
    g.add(put(mesh(new THREE.SphereGeometry(0.8, 10, 8), glow(0xffa860, 0.6)), s * span / 2, H + 6, 0));
    // The street wall it bars, running off either side.
    g.add(put(mesh(new THREE.BoxGeometry(34, 7, 2), brick), s * (span / 2 + 18.3), 3.5, 0));
  }
  g.add(put(mesh(new THREE.BoxGeometry(span + 2.6, 1.6, 2), iron), 0, H + 0.8, 0));
  // The curtain itself: faint, warm, scanlines drifting up.
  const tex = curtainTexture();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffa860, map: tex, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  g.add(put(mesh(new THREE.PlaneGeometry(span - 2.6, H), mat), 0, H / 2, 0));
  ctx.anim((dt, now) => { if (tex) tex.offset.y -= dt * 0.25; mat.opacity = 0.13 + 0.03 * Math.sin(now * 3.1) + (Math.random() < 0.01 ? -0.08 : 0); });
  return g;
}

// ---- Hugh Ferriss: setback ziggurats in the fog, searchlights raking it ----
function ferriss(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const stone = std(0x15130f, { roughness: 1 }), lit = glow(ctx.theme.lamp, 0.3);
  const tiers = new THREE.BoxGeometry(1, 1, 1), strips = [], blocks = [];
  const shafts = [];
  const n = 5;
  for (let k = 0; k < n; k++) {
    const p = around(ang + (k - n / 2) * 0.32 + (ctx.rand() - 0.5) * 0.1, R + 25 + ctx.rand() * 55);
    let w = 16 + ctx.rand() * 10, y = GROUND, H = 55 + ctx.rand() * 55;
    const rot = ctx.rand() * Math.PI;
    const steps = [0.42, 0.22, 0.18, 0.12];
    for (const f of steps) {
      const h = H * f;
      blocks.push(TRS(p.x, y + h / 2, p.z, rot, w, h, w));
      // A few lit window strips per face, very dim.
      // (a thin band through the block, showing on two faces)
      if (ctx.rand() < 0.8) strips.push(TRS(p.x, y + h * (0.3 + ctx.rand() * 0.5), p.z, rot, w * 1.004, 0.5, w * 0.3));
      y += h; w *= 0.72;
    }
    blocks.push(TRS(p.x, y + 4, p.z, rot, 1.2, 8, 1.2));
    if (k % 2 === 0) {
      const s = shaft(ctx.theme.search, 120, 9, 0.045);
      s.position.set(p.x, y, p.z); s.rotation.z = 0.35; g.add(s);
      shafts.push({ s, ph: ctx.rand() * 6, sp: 0.08 + ctx.rand() * 0.08 });
    }
  }
  g.add(instanced(tiers, stone, blocks));
  g.add(instanced(tiers, lit, strips));
  ctx.anim((dt, now) => { for (const { s, ph, sp } of shafts) { s.rotation.y = now * sp + ph; s.rotation.z = 0.3 + 0.15 * Math.sin(now * 0.21 + ph); } });
  return g;
}

// ---- Rozalski Fields: strips of crop, haystacks, fences, birches ----
function fields(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const cols = [0x6a5a2a, 0x8a7a3a, 0x4a4a24, 0x5a3e24, 0x7a6a34];
  const mats = cols.map((cc) => std(cc, { roughness: 1 }));
  const byMat = cols.map(() => []);
  // Crop strips in a ring round the table, each a long thin patch.
  for (let k = 0; k < 44; k++) {
    const a = (k / 44) * Math.PI * 2 + ctx.rand() * 0.05, r = R * 0.48 + ctx.rand() * R * 0.88;
    const p = around(a, r);
    byMat[k % cols.length].push(TRS(p.x, GROUND + 0.02 + (k % 3) * 0.01, p.z, -a + Math.PI / 2 + (ctx.rand() - 0.5) * 0.4, 30 + ctx.rand() * 30, 1, 8 + ctx.rand() * 8));
  }
  const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
  byMat.forEach((list, k) => g.add(instanced(plane, mats[k], list)));
  // Low rolling hills far out.
  const hills = [];
  for (let k = 0; k < 9; k++) { const a = ang + (k / 9) * Math.PI * 2, p = around(a, R + 30 + ctx.rand() * 40); hills.push(TRS(p.x, GROUND - 4, p.z, a, 60 + ctx.rand() * 40, 10 + ctx.rand() * 8, 30 + ctx.rand() * 20)); }
  g.add(instanced(new THREE.SphereGeometry(1, 16, 8), std(0x4e4a2a, { roughness: 1 }), hills));
  // Haystacks.
  const stacks = [], caps = [];
  for (let k = 0; k < 36; k++) { const p = around(ctx.rand() * Math.PI * 2, R * 0.48 + ctx.rand() * R * 0.68); const s = 1.2 + ctx.rand() * 0.6; stacks.push(TRS(p.x, GROUND + s * 0.6, p.z, 0, s, s, s)); caps.push(TRS(p.x, GROUND + s * 1.75, p.z, 0, s, s, s)); }
  const hay = std(0x9a8440, { roughness: 1, flatShading: true });
  g.add(instanced(new THREE.CylinderGeometry(1, 1.05, 1.2, 9), hay, stacks));
  g.add(instanced(new THREE.ConeGeometry(1.02, 1.1, 9), hay, caps));
  // Split-rail fences along a few field edges.
  const posts = [], rails = [];
  for (let f = 0; f < 7; f++) {
    const a = ctx.rand() * Math.PI * 2, r = R * 0.4 + ctx.rand() * R * 0.48, dir = a + Math.PI / 2 + (ctx.rand() - 0.5) * 0.6, len = 20 + ctx.rand() * 20;
    const p0 = around(a, r);
    for (let s = 0; s <= len; s += 3) {
      const x = p0.x + Math.cos(dir) * s, z = p0.z + Math.sin(dir) * s;
      posts.push(TRS(x, GROUND + 0.6, z, 0, 1, 1, 1));
      if (s + 3 <= len) for (const y of [0.5, 1.0]) rails.push(TRS(x + Math.cos(dir) * 1.5, GROUND + y, z + Math.sin(dir) * 1.5, -dir, 3.1, 1, 1));
    }
  }
  const wood = std(0x4a3a26, { roughness: 1 });
  g.add(instanced(new THREE.BoxGeometry(0.14, 1.2, 0.14), wood, posts));
  g.add(instanced(new THREE.BoxGeometry(1, 0.08, 0.08), wood, rails));
  // Birch clumps: pale trunks, gold-green crowns.
  const trunks = [], crowns = [];
  for (let k = 0; k < 8; k++) {
    const a = ctx.rand() * Math.PI * 2, r = R * 0.56 + ctx.rand() * R * 0.56;
    for (let j = 0; j < 5; j++) {
      const p = around(a + (ctx.rand() - 0.5) * 0.06, r + (ctx.rand() - 0.5) * 6), h = 7 + ctx.rand() * 5;
      trunks.push(TRS(p.x, GROUND + h / 2, p.z, 0, 1, h, 1, (ctx.rand() - 0.5) * 0.1, (ctx.rand() - 0.5) * 0.1));
      crowns.push(TRS(p.x, GROUND + h * 0.8, p.z, ctx.rand() * 3, 1.8 + ctx.rand(), 2.6 + ctx.rand() * 1.5, 1.8 + ctx.rand()));
    }
  }
  g.add(instanced(new THREE.CylinderGeometry(0.14, 0.2, 1, 6), std(0xa8a294, { roughness: 1 }), trunks));
  g.add(instanced(new THREE.DodecahedronGeometry(1, 0), std(0x7a8034, { roughness: 1, flatShading: true }), crowns));
  return g;
}

// ---- A timber post mill on a rise, sails turning slowly ----
function windmill(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const p = around(ang, R + 8); g.position.copy(p).setY(GROUND); g.lookAt(c.x, GROUND, c.z); g.scale.setScalar(2.2);
  const timber = std(0x4a3422, { roughness: 1 }), dark = std(0x2a1e14, { roughness: 1 }), sailM = std(0x8a7c64, { roughness: 1, side: THREE.DoubleSide });
  const rise = put(mesh(new THREE.SphereGeometry(8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x4e4a2a, { roughness: 1 })), 0, -2, 0); rise.scale.set(1, 0.5, 1); g.add(rise);
  g.add(put(mesh(new THREE.CylinderGeometry(0.4, 0.6, 4, 6), dark), 0, 2, 0));
  const body = put(mesh(new THREE.BoxGeometry(3.2, 4.6, 3.6), timber), 0, 5.8, 0); g.add(body);
  const roof = mesh(new THREE.CylinderGeometry(0.1, 2.6, 2, 4, 1), dark); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 1.1); g.add(put(roof, 0, 9.1, 0));
  const hub = new THREE.Group(); hub.position.set(0, 7, 2.1); g.add(hub);
  for (let s = 0; s < 4; s++) {
    const arm = new THREE.Group(); arm.rotation.z = (s * Math.PI) / 2; hub.add(arm);
    arm.add(put(mesh(new THREE.BoxGeometry(0.2, 7, 0.2), dark), 0, 3.5, 0));
    arm.add(put(mesh(new THREE.PlaneGeometry(1.4, 5.6), sailM), 0.8, 4, 0.05));
  }
  ctx.anim((dt) => { hub.rotation.z -= dt * 0.35; });
  return g;
}

// ---- The village church on the ridge, a few cottages round it ----
function church(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const p = around(ang + 0.5, R + 20); g.position.copy(p).setY(GROUND); g.lookAt(c.x, GROUND, c.z); g.scale.setScalar(2);
  const wash = std(0x9a9282, { roughness: 1 }), roof = std(0x3a3028, { roughness: 1 }), shingle = std(0x2a2420, { roughness: 1 });
  const ridge = put(mesh(new THREE.SphereGeometry(14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x4e4a2a, { roughness: 1 })), 0, -3, 0); ridge.scale.set(1.4, 0.5, 1); g.add(ridge);
  g.add(put(mesh(new THREE.BoxGeometry(4, 4, 9), wash), 0, 2, 0));
  const nave = mesh(new THREE.CylinderGeometry(0.05, 3.3, 2.6, 4, 1), roof); nave.rotation.y = Math.PI / 4; nave.scale.set(0.9, 1, 2); g.add(put(nave, 0, 5.3, 0));
  g.add(put(mesh(new THREE.BoxGeometry(3, 9, 3), wash), 0, 4.5, 5.5));
  // Onion dome on the tower, a cross above.
  const onion = put(mesh(new THREE.SphereGeometry(1.6, 12, 10), shingle), 0, 10.2, 5.5); onion.scale.set(1, 1.2, 1); g.add(onion);
  g.add(put(mesh(new THREE.ConeGeometry(0.6, 2.2, 10), shingle), 0, 12.4, 5.5));
  g.add(put(mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), std(0x6a5a34, { metalness: 0.5 })), 0, 14, 5.5));
  g.add(put(mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), std(0x6a5a34, { metalness: 0.5 })), 0, 14.2, 5.5));
  g.add(put(mesh(new THREE.PlaneGeometry(0.6, 1.2), glow(ctx.theme.lamp, 0.4)), 0, 6.5, 7.01));
  const houses = [], roofs = [];
  for (let k = 0; k < 9; k++) {
    const x = (ctx.rand() - 0.5) * 30, z = -6 - ctx.rand() * 14, a = ctx.rand() * 0.6;
    houses.push(TRS(x, 1.2, z, a, 3, 2.4, 4)); roofs.push(TRS(x, 3.2, z, a + Math.PI / 4, 3, 1.6, 3.4));
  }
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), wash, houses));
  g.add(instanced(new THREE.CylinderGeometry(0.05, 0.75, 1, 4, 1), roof, roofs));
  return g;
}

// ---- Karnaca harbour: the sea, a quay, gantry cranes, a lighthouse ----
function harbour(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  // Laid flat, the ring's angle t lands at world angle -t, so sweep round -ang.
  const water = new THREE.Mesh(new THREE.RingGeometry(R * 0.95, R * 3.2, 64, 1, -ang - 1.1, 2.2), std(0x2e4a4a, { roughness: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.set(c.x, GROUND + 0.05, c.z); g.add(water);
  const stone = std(0x8a7a60, { roughness: 1 });
  const quay = [];
  for (let k = -10; k <= 10; k++) { const a = ang + k * 0.1, p = around(a, R * 0.94); quay.push(TRS(p.x, GROUND + 0.6, p.z, -a, 3, 2.4, R * 0.94 * 0.105)); }
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), stone, quay));
  // Gantry cranes along the quay.
  const iron = std(0x6a3a22, { metalness: 0.5 });
  for (let k = 0; k < 3; k++) {
    const a = ang - 0.5 + k * 0.45, p = around(a, R * 0.92);
    const cr = new THREE.Group(); cr.position.copy(p).setY(GROUND); cr.rotation.y = -a; g.add(cr);
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) cr.add(put(mesh(new THREE.BoxGeometry(0.6, 20, 0.6), iron), x, 10, z));
    cr.add(put(mesh(new THREE.BoxGeometry(7, 1.4, 7), iron), 0, 20, 0));
    const jib = new THREE.Group(); jib.position.y = 21; cr.add(jib);
    jib.add(put(mesh(new THREE.BoxGeometry(26, 1, 1), iron), 8, 0, 0));
    jib.add(put(mesh(new THREE.BoxGeometry(3, 2, 2), std(0x3a2a1c)), -5, 0.5, 0));
    const ph = ctx.rand() * 6;
    ctx.anim((dt, now) => { jib.rotation.y = Math.sin(now * 0.05 + ph) * 0.8; });
  }
  // Lighthouse on a mole, its lamp warm and a faint beam turning.
  const lp = around(ang + 0.9, R + 30);
  const lh = new THREE.Group(); lh.position.copy(lp).setY(GROUND); g.add(lh);
  lh.add(put(mesh(new THREE.CylinderGeometry(2.2, 3.2, 22, 12), std(0xb0a288, { roughness: 1 })), 0, 11, 0));
  for (const y of [6, 14]) lh.add(put(mesh(new THREE.CylinderGeometry(2.9 - y * 0.04, 3 - y * 0.04, 2, 12), std(0x8a3a24, { roughness: 1 })), 0, y, 0));
  lh.add(put(mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 10), glow(0xffc070, 0.8)), 0, 23.2, 0));
  lh.add(put(mesh(new THREE.ConeGeometry(2.2, 2, 10), std(0x2a2420)), 0, 25.4, 0));
  const beam = shaft(0xffd8a0, 90, 7, 0.035); beam.rotation.z = Math.PI / 2 - 0.05; beam.position.y = 23.2; lh.add(beam);
  ctx.anim((dt) => { beam.rotation.y += dt * 0.4; });
  // Moored boats bobbing.
  const hull = std(0x3a2a20, { roughness: 1 });
  for (let k = 0; k < 5; k++) {
    const p = around(ang + (ctx.rand() - 0.5) * 1.6, R * 1.02 + ctx.rand() * 20);
    const b = new THREE.Group(); b.position.copy(p).setY(GROUND); b.rotation.y = ctx.rand() * 3; g.add(b);
    b.add(put(mesh(new THREE.BoxGeometry(9, 1.6, 3), hull), 0, 0.6, 0));
    b.add(put(mesh(new THREE.BoxGeometry(3, 2, 2.4), std(0xb0a288, { roughness: 1 })), -1.5, 2.2, 0));
    b.add(put(mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 5), hull), 1.5, 4.5, 0));
    const ph = ctx.rand() * 6;
    ctx.anim((dt, now) => { b.position.y = GROUND + Math.sin(now * 0.8 + ph) * 0.2; b.rotation.z = Math.sin(now * 0.6 + ph) * 0.03; });
  }
  return g;
}

// ---- Seaplanes circling the bay, one moored on its floats ----
function seaplane(color) {
  const s = new THREE.Group();
  const body = std(color, { roughness: 0.9 }), dark = std(0x2a2420);
  const fus = mesh(new THREE.CylinderGeometry(0.7, 0.4, 9, 10), body); fus.rotation.z = Math.PI / 2; s.add(fus);
  for (const y of [0.9, -0.4]) s.add(put(mesh(new THREE.BoxGeometry(2.2, 0.15, 14), body), 0.8, y, 0));
  for (const z of [-2.2, 2.2]) s.add(put(mesh(new THREE.BoxGeometry(5, 0.6, 0.7), dark), 0.6, -2.1, z));
  s.add(put(mesh(new THREE.BoxGeometry(1.4, 1.6, 0.12), body), -4.2, 0.8, 0));
  s.add(put(mesh(new THREE.BoxGeometry(1.4, 0.12, 4), body), -4.2, 0.2, 0));
  const prop = new THREE.Group(); prop.position.x = 4.7; s.add(prop);
  prop.add(mesh(new THREE.BoxGeometry(0.1, 3, 0.25), dark));
  return { s, prop };
}
function seaplanes(i, c, R, ctx, ang) {
  const g = new THREE.Group();
  const cols = [0x8a6a44, 0x6a5a4a, 0x9a8a6a];
  for (let k = 0; k < 2; k++) {
    const { s, prop } = seaplane(cols[k]); s.scale.setScalar(1.4); g.add(s);
    const r = R * (0.8 + k * 0.25), hgt = 30 + k * 12, sp = (0.03 + ctx.rand() * 0.01) * (k ? -1 : 1), a0 = ang + k * 2;
    ctx.anim((dt, now) => {
      const a = a0 + now * sp;
      s.position.set(c.x + Math.cos(a) * r, hgt + Math.sin(now * 0.4 + a0) * 1.5, c.z + Math.sin(a) * r);
      s.rotation.set(sp > 0 ? 0.25 : -0.25, -a + (sp > 0 ? -Math.PI / 2 : Math.PI / 2), 0);
      prop.rotation.x += dt * 20;
    });
  }
  const { s } = seaplane(cols[2]); s.scale.setScalar(1.4);
  s.position.set(c.x + Math.cos(ang + 0.3) * (R + 5), GROUND + 3.4, c.z + Math.sin(ang + 0.3) * (R + 5)); s.rotation.y = ang; g.add(s);
  return g;
}

// ---- The hill town: tiers of whitewash under terracotta, a bell tower ----
function villas(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const base = ang + Math.PI; // across the table from the bay
  const hill = mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x6a5a40, { roughness: 1 }));
  hill.position.copy(around(base, R + 45)).setY(GROUND - 8); hill.scale.set(90, 40, 60); hill.rotation.y = -base; g.add(hill);
  const walls = [], roofs = [], lit = [];
  for (let k = 0; k < 60; k++) {
    const a = base + (ctx.rand() - 0.5) * 1.0, r = R + 10 + ctx.rand() * 50;
    const p = around(a, r), rise = Math.max(0, (r - R - 5)) * 0.45, w = 4 + ctx.rand() * 4, h = 3 + ctx.rand() * 4, d = 4 + ctx.rand() * 3;
    walls.push(TRS(p.x, GROUND + rise + h / 2, p.z, -a, w, h, d));
    roofs.push(TRS(p.x, GROUND + rise + h + 0.8, p.z, -a + Math.PI / 4, w * 0.75, 1.6, d * 0.75));
    if (ctx.rand() < 0.35) lit.push(TRS(p.x - Math.cos(a) * (w / 2 + 0.05), GROUND + rise + h * 0.6, p.z - Math.sin(a) * (w / 2 + 0.05), -a, 0.1, 1.1, 0.8));
  }
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), std(0xb0a288, { roughness: 1 }), walls));
  g.add(instanced(new THREE.CylinderGeometry(0.05, 0.75, 1, 4, 1), std(0x8a4428, { roughness: 1 }), roofs));
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), glow(ctx.theme.lamp, 0.45), lit));
  const tp = around(base + 0.15, R + 40);
  g.add(put(mesh(new THREE.BoxGeometry(5, 22, 5), std(0xb0a288, { roughness: 1 })), tp.x, GROUND + 18 + 11, tp.z));
  g.add(put(mesh(new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x8a4428, { roughness: 1 })), tp.x, GROUND + 40, tp.z));
  return g;
}

// ---- Rapture: bulkheads round the table, portholes onto dark water ----
function bulkheads(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const plate = std(0x2a2e2a, { metalness: 0.5, roughness: 0.9 }), rib = std(0x6a5a2a, { metalness: 0.6 }), sea = glow(0x1e5a54, 0.3);
  const segs = 7, arc = (Math.PI * 1.25) / segs, H = 34, walls = [], ribs = [], ports = [], rims = [];
  const r0 = R + 2;
  for (let k = 0; k < segs; k++) {
    const a = ang + (k - segs / 2) * arc, p = around(a, r0), w = 2 * r0 * Math.sin(arc / 2) + 0.5;
    walls.push(TRS(p.x, GROUND + H / 2, p.z, -a + Math.PI / 2, w, H, 2));
    const e = around(a + arc / 2, r0 - 1.2); ribs.push(TRS(e.x, GROUND + H / 2, e.z, -a, 2.4, H, 2.4));
    for (const f of [-0.25, 0.25]) {
      const q = around(a + arc * f, r0 - 1.05);
      for (const y of [8, 20]) {
        ports.push(TRS(q.x, GROUND + y, q.z, -(a + arc * f) - Math.PI / 2, 6, 6, 1));
        rims.push(TRS(q.x, GROUND + y, q.z, -(a + arc * f) - Math.PI / 2, 1, 1, 1));
      }
    }
  }
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), plate, walls));
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), rib, ribs));
  // Porthole glass: faces the table after the -PI/2 turn (a circle faces +z).
  g.add(instanced(new THREE.CircleGeometry(0.5, 24), sea, ports));
  g.add(instanced(new THREE.TorusGeometry(3.1, 0.45, 6, 24), rib, rims));
  // Leaks: drips off the seams, now and then a spray.
  const seams = Array.from({ length: segs }, (_, k) => around(ang + (k - segs / 2) * arc + arc / 2, r0 - 2.6));
  ctx.anim((dt) => {
    if (Math.random() > dt * 6) return;
    const s = seams[Math.floor(Math.random() * seams.length)];
    ctx.fx.particle(V(s.x, GROUND + 6 + Math.random() * 24, s.z), { color: 0x5a7a74, size: 0.35, life: 1.6, additive: false, opacity: 0.45, vel: V(0, -9, 0) });
  });
  // One deco sign over the seam: warm neon, dim.
  const sp = around(ang, r0 - 1.3);
  const sign = new THREE.Group(); sign.position.set(sp.x, GROUND + 28, sp.z); sign.lookAt(c.x, GROUND + 28, c.z); g.add(sign);
  sign.add(mesh(new THREE.BoxGeometry(14, 3.2, 0.4), std(0x1a1612, { metalness: 0.4 })));
  const neon = glow(0xff9a50, 0.9);
  for (let k = 0; k < 7; k++) sign.add(put(mesh(new THREE.BoxGeometry(1.1, 1.8, 0.1), neon), -5.4 + k * 1.8, 0, 0.25));
  for (let k = 0; k < 9; k++) { const ray = mesh(new THREE.BoxGeometry(0.15, 3, 0.1), neon); ray.rotation.z = (k - 4) * 0.28; sign.add(put(ray, 0, 3.4, 0.25)); }
  ctx.anim((dt, now) => { const t = now % 13; neon.emissiveIntensity = t < 0.1 || (t > 0.2 && t < 0.28) ? 0.25 : 0.9; });
  return g;
}

// ---- Deco towers standing in dark water, gold crowns, lit bands ----
function decotowers(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const verd = std(0x24403a, { roughness: 1 }), gold = std(0x6a5428, { metalness: 0.6 }), band = glow(ctx.theme.lamp, 0.4);
  const blocks = [], crowns = [], bands = [];
  const base = ang + Math.PI + (i % 2 ? 0.6 : -0.6);
  for (let k = 0; k < 5; k++) {
    const p = around(base + (k - 2) * 0.28, R + 30 + ctx.rand() * 50);
    let w = 12 + ctx.rand() * 8, y = GROUND - 2;
    const H = 50 + ctx.rand() * 40, rot = ctx.rand() * Math.PI;
    for (const f of [0.5, 0.25, 0.15]) {
      const h = H * f;
      blocks.push(TRS(p.x, y + h / 2, p.z, rot, w, h, w));
      bands.push(TRS(p.x, y + h - 1.4, p.z, rot, w * 1.01, 0.7, w * 1.01));
      y += h; w *= 0.7;
    }
    crowns.push(TRS(p.x, y + 5, p.z, rot, w * 0.9, 10, w * 0.9));
  }
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), verd, blocks));
  g.add(instanced(new THREE.BoxGeometry(1, 1, 1), band, bands));
  g.add(instanced(new THREE.ConeGeometry(0.6, 1, 4), gold, crowns));
  // Slow bubbles rising past them.
  ctx.anim((dt) => {
    if (Math.random() > dt * 3) return;
    const p = around(base + (Math.random() - 0.5) * 1.4, R + 20 + Math.random() * 60);
    ctx.fx.particle(V(p.x, GROUND + Math.random() * 10, p.z), { color: 0x4a6a64, size: 0.8, life: 6, additive: false, opacity: 0.35, vel: V(0, 4, 0), turb: 1 });
  });
  return g;
}

// ---- The trench line: parapet, wire, duckboards, gas boards ----
function trenchline(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const bags = [], pickets = [], coils = [], boards = [];
  for (let k = 0; k < 140; k++) {
    const a = ang + (k / 140) * Math.PI * 2, r = R * 0.86 + Math.sin(k * 0.7) * 2;
    const p = around(a, r);
    for (let y = 0; y < 3; y++) bags.push(TRS(p.x, GROUND + 0.25 + y * 0.45, p.z, -a + Math.PI / 2 + (y % 2) * 0.2, 1.6, 0.45, 0.9));
    const w = around(a + 0.01, r - 5);
    pickets.push(TRS(w.x, GROUND + 0.8, w.z, 0, 1, 1, 1, (ctx.rand() - 0.5) * 0.3, (ctx.rand() - 0.5) * 0.3));
    coils.push(TRS(w.x, GROUND + 0.9, w.z, -a, 1, 1, 1));
    const d = around(a, r + 2.5); boards.push(TRS(d.x, GROUND + 0.05, d.z, -a + Math.PI / 2, 1, 1, 1));
  }
  g.add(instanced(new THREE.SphereGeometry(0.5, 8, 5), std(0x6a5a40, { roughness: 1 }), bags));
  g.add(instanced(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 5), std(0x3a2a1c, { roughness: 1 }), pickets));
  g.add(instanced(new THREE.TorusGeometry(0.7, 0.03, 4, 14), std(0x4a4640, { metalness: 0.6 }), coils));
  g.add(instanced(new THREE.BoxGeometry(2.6, 0.08, 0.9), std(0x4a3a24, { roughness: 1 }), boards));
  for (let k = 0; k < 6; k++) {
    const a = ang + (k / 6) * Math.PI * 2 + 0.2, p = around(a, R * 0.83);
    const s = gasSign(2.4); s.scale.setScalar(2); s.position.copy(p).setY(GROUND); s.lookAt(c.x, GROUND, c.z); g.add(s);
  }
  return g;
}

// ---- Blasted trees and shell holes out past the wire ----
function deadwood(i, c, R, ctx, ang, around) {
  const g = new THREE.Group();
  const trunks = [], limbs = [], holes = [];
  for (let k = 0; k < 40; k++) {
    const p = around(ang + ctx.rand() * Math.PI * 2, R * 0.92 + ctx.rand() * R * 0.56), h = 4 + ctx.rand() * 9;
    const tx = (ctx.rand() - 0.5) * 0.3, tz = (ctx.rand() - 0.5) * 0.3;
    trunks.push(TRS(p.x, GROUND + h / 2, p.z, 0, 1, h, 1, tx, tz));
    if (ctx.rand() < 0.6) limbs.push(TRS(p.x + 0.8, GROUND + h * 0.7, p.z, ctx.rand() * 3, 1, 2 + ctx.rand() * 2, 1, 0, 0.9 + ctx.rand() * 0.5));
    holes.push(TRS(p.x + 6, GROUND + 0.03, p.z + 3, 0, 3 + ctx.rand() * 4, 1, 2 + ctx.rand() * 3));
  }
  const char = std(0x1e1a14, { roughness: 1 });
  g.add(instanced(new THREE.CylinderGeometry(0.2, 0.4, 1, 6), char, trunks));
  g.add(instanced(new THREE.CylinderGeometry(0.06, 0.12, 1, 5), char, limbs));
  const disc = new THREE.CircleGeometry(1, 16); disc.rotateX(-Math.PI / 2);
  g.add(instanced(disc, std(0x1a1610, { roughness: 1 }), holes));
  return g;
}

// ---- Star shells drifting down on parachutes, a warm dim glow ----
function starshells(i, c, R, ctx) {
  const g = new THREE.Group();
  const shells = Array.from({ length: 3 }, (_, k) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), glow(0xffd08a, 1.1));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.add(halo); g.add(m);
    return { m, t: k * 5 + ctx.rand() * 3, a: 0, r: 0 };
  });
  ctx.anim((dt) => {
    for (const s of shells) {
      s.t += dt;
      if (s.t > 14 || !s.r) { s.t = 0; s.a = Math.random() * Math.PI * 2; s.r = R * (0.7 + Math.random() * 0.4); }
      s.m.position.set(c.x + Math.cos(s.a) * s.r + s.t * 0.4, 70 - s.t * 3.5, c.z + Math.sin(s.a) * s.r);
      s.m.visible = s.t < 13;
    }
  });
  return g;
}

const LANDMARKS = { arcpylons, walloflight, ferriss, fields, windmill, church, harbour, seaplanes, villas, bulkheads, decotowers, trenchline, deadwood, starshells };
export const LANDMARK_KINDS = Object.keys(LANDMARKS);

// Pieces that belong together (the bay and the hill town across from it, the
// bulkheads and the towers past their open side) share one heading per battle.
const SHARED = new Set(["harbour", "seaplanes", "villas", "bulkheads", "decotowers"]);
export function landmark(kind, i, c, R, ctx) {
  const own = ctx.rand() * Math.PI * 2;
  if (SHARED.has(kind)) ctx.heading ??= own;
  const ang = SHARED.has(kind) ? ctx.heading : own;
  const around = (a, r) => V(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
  const g = LANDMARKS[kind](i, c, R, ctx, ang, around);
  g.userData.landmark = kind;
  return g;
}
