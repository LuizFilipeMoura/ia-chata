// What a rig picks up in the field, on top of its skin: the lamp eyes that
// show its state, the grime that builds as each hit location loses SP, the
// crew's McQue clutter, and the stencilled unit number + side insignia.
// All flush with the body or bolted to its sockets, inside the envelope.
import { THREE, mat, surfaceMat, at, rot, box, cyl, sph, torus, drumX, canvasTexture, rngFrom, BRASS, DARK, STEEL, CANVAS } from "./kit.js";
import { LAMP, GRIME_LOCS, SIDE_CSS } from "./look.js";

// ---- Lamp eyes (Big Daddy portholes) ----
// Twin round lamps in brass bezels on the hull front, one own material per rig
// so its colour can follow the rig's state. Returns the material.
export function addLampEyes(built) {
  const k = built.ctx.k, s = built.sockets.chestFront;
  const L = LAMP.amber;
  const lamp = new THREE.MeshStandardMaterial({ color: L.color, emissive: L.emissive, emissiveIntensity: L.intensity, roughness: 0.7, metalness: 0 });
  const eyes = new THREE.Group(); eyes.name = "lampEyes";
  eyes.position.set(0, 0.13 * k, 0);
  for (const z of [-0.13, 0.13]) {
    // A short housing reaching back into the hull hides any gap on a curved front.
    const house = drumX(0.058 * k, 0.12, DARK(), 12); house.position.set(-0.04, 0, z * k);
    const bezel = rot(torus(0.05 * k, 0.012 * k, BRASS(), Math.PI * 2, 14), 0, Math.PI / 2, 0); bezel.position.set(0.02, 0, z * k);
    const lens = sph(0.044 * k, lamp, 12); lens.scale.set(0.45, 1, 1); lens.position.set(0.018, 0, z * k);
    lens.userData.noTint = true;
    eyes.add(house, bezel, lens);
  }
  s.add(eyes);
  eyes.traverse((o) => { if (o.isMesh) o.userData.part = "lamp"; });
  return lamp;
}

// ---- Hit locations: which location each body mesh belongs to ----
// Tags userData.loc on every mesh (engine = stacks + backpack, arms = both arms
// with their weapons, legs = both legs, hull = the rest).
export function tagLocations(m) {
  const tag = (root, loc) => root?.traverse((o) => { if (o.isMesh && !o.userData.loc) o.userData.loc = loc; });
  for (const st of m.stacks || []) tag(st, "engine");
  m.body.traverse((o) => { if (o.isMesh && o.userData.part === "backpack" && !o.userData.loc) o.userData.loc = "engine"; });
  tag(m.armR, "arms"); tag(m.armL, "arms");
  for (const l of m.legs || []) tag(l.hip, "legs");
  tag(m.body, "hull");
}

// ---- Grime overlay bits ----
const GEO = {
  disc: new THREE.CircleGeometry(1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.SphereGeometry(1, 7, 5),
  collar: new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
};
const decalOpts = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 1, metalness: 0 };
const GRIME = {
  soot: () => mat(0x0e0c0a, { ...decalOpts, opacity: 0.72 }),
  rust: () => mat(0x7a3a1e, { ...decalOpts, opacity: 0.85 }),
  oil: () => mat(0x100c08, { roughness: 0.9, metalness: 0.1 }),
  rivet: () => mat(0x6e6a62, { roughness: 0.75, metalness: 0.6 }),
  scorch: () => mat(0x0a0908, { roughness: 1, metalness: 0, side: THREE.DoubleSide }),
};
const piece = (geo, m, [sx, sy, sz]) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.userData.noTint = true; o.userData.part = "grime"; return o; };
// A flat patch facing +x (chest front / back), +z or -z (flanks).
function patch(kind, size, face, r = Math.random) {
  const o = piece(GEO.disc, GRIME[kind](), [size, size * (0.6 + r() * 0.3), 1]);
  o.rotation.y = face === "x" ? Math.PI / 2 : face === "-x" ? -Math.PI / 2 : face === "-z" ? Math.PI : 0;
  o.rotation.z = r() * Math.PI;
  return o;
}

// Bit i of location `loc` on this mech. Each returns the object it added.
const BITS = {
  hull(m, i, r, k) {
    const f = m.built.frame, s = m.sockets;
    const y = (r() - 0.4) * 0.3 * k, z = (r() - 0.5) * 0.4 * k;
    switch (i % 4) {
      case 0: return [at(patch("soot", 0.13 * k, "x", r), 0.014, y, z), s.chestFront];
      case 1: { const o = piece(GEO.box, GRIME.oil(), [0.1 * k, 0.26 * k, 0.012]); return [at(o, (r() - 0.5) * 0.2, y - 0.08 * k, f.halfW + 0.008), m.torso]; }
      case 2: return [at(patch("rust", 0.08 * k, "-z", r), (r() - 0.5) * 0.2, y, -f.halfW - 0.012), m.torso];
      default: {
        const g = new THREE.Group(); g.position.set(0.012, y, z);
        for (let j = 0; j < 4; j++) g.add(at(piece(GEO.ball, GRIME.rivet(), [0.018 * k, 0.018 * k, 0.018 * k]), 0, 0, (j - 1.5) * 0.05 * k));
        g.add(at(patch("rust", 0.07 * k, "x", r), 0.002, 0, 0));
        return [g, s.chestFront];
      }
    }
  },
  arms(m, i, r, k) {
    // On the weapon housings (both arms), so it reads from across the table.
    const w = [m.lr, m.me][i % 2]?.group;
    if (!w) return null;
    const blob = (kind, sz) => { const o = piece(GEO.ball, GRIME[kind === "rust" ? "rust" : "soot"](), [sz, sz * 0.35, sz]); o.position.set(0.1 + r() * 0.2, 0.12 + r() * 0.06, (r() - 0.5) * 0.12); return o; };
    return [blob(i < 2 ? "soot" : "rust", (0.1 + r() * 0.05) * k), w];
  },
  legs(m, i, r, k) {
    const leg = m.legs[i % 2];
    if (!leg) return null;
    const x = 0.1 * k, y = -leg.shinLen * (0.3 + r() * 0.35);
    if (i < 2) return [at(piece(GEO.box, GRIME.oil(), [0.02, leg.shinLen * 0.35, 0.03]), x, y, (r() - 0.5) * 0.06), leg.knee];
    return [at(piece(GEO.ball, GRIME.rust(), [0.06 * k, 0.05 * k, 0.03]), x, y, 0), leg.knee];
  },
  engine(m, i, r, k) {
    const st = m.stacks[i % m.stacks.length];
    if (i < m.stacks.length && st?.geometry?.parameters) {
      // A soot collar round the stack mouth.
      const { height: h, radiusTop: rt } = st.geometry.parameters;
      return [at(piece(GEO.collar, GRIME.scorch(), [rt * 1.06, h * (0.18 + 0.1 * i), rt * 1.06]), 0, h * 0.38, 0), st];
    }
    const s = m.sockets.back;
    if (i % 2) return [at(piece(GEO.box, GRIME.oil(), [0.012, (0.22 + r() * 0.2) * k, 0.03]), -0.01, -0.12 * k, (r() - 0.5) * 0.4 * k), s];
    return [at(patch("soot", 0.1 * k, "-x", r), -0.012, (r() - 0.5) * 0.2 * k, (r() - 0.5) * 0.3 * k), s];
  },
};

// Grow (or trim back, after a repair) location `loc` to `n` overlay bits.
export function setGrimeBits(m, loc, n) {
  m.grime ||= Object.fromEntries(GRIME_LOCS.map((l) => [l, []]));
  const list = m.grime[loc];
  while (list.length < n) {
    const i = list.length;
    const r = rngFrom(`${m.id}|grime|${loc}|${i}`);
    const out = BITS[loc]?.(m, i, r, m.built.ctx.k);
    if (!out) { list.push(null); continue; }
    const [obj, parent] = out;
    parent.add(obj); list.push(obj);
  }
  list.forEach((o, i) => { if (o) o.visible = i < n; });
}

// ---- McQue clutter kit ----
const WOOD = () => mat(0x6e5236, { roughness: 0.95, metalness: 0 });
const OLIVE = () => mat(0x4e5a34, { roughness: 0.8, metalness: 0.2 });
const CLOTH = [0xd8cfb4, 0x8a6a4a, 0x9a3a2a, 0x6a7a86];
const CLUTTER_BUILD = {
  // A wooden ammo crate strapped low on the back.
  crate(b, k) {
    const g = new THREE.Group(); g.position.set(-0.07, -0.16, 0.12 * k); g.scale.setScalar(k);
    g.add(box(0.13, 0.12, 0.16, WOOD()));
    for (const x of [-0.045, 0.045]) g.add(at(box(0.016, 0.125, 0.165, DARK()), x, 0, 0));
    b.sockets.back.add(g);
  },
  // A jerry can on the far shin.
  jerryCan(b, k) {
    const leg = b.legs[1];
    const can = box(0.06, 0.2, 0.13, OLIVE()); can.scale.setScalar(k);
    can.position.set(0.12 * k, -leg.shinLen * 0.5, 0);
    can.add(at(cyl(0.014, 0.014, 0.04, DARK(), 6), 0, 0.11, 0.04));
    leg.knee.add(can);
  },
  // Washing strung between two stacks (or off a short mast).
  laundry(b, k, r) {
    const g = new THREE.Group(); const s = b.sockets.back; s.add(g);
    const y = Math.max(0.12, b.frame.top * 0.55), span = 0.22 * k;
    g.add(at(cyl(0.008, 0.008, y + 0.1, STEEL(), 5), -0.02, y / 2 - 0.05, -span));
    g.add(at(cyl(0.008, 0.008, y + 0.1, STEEL(), 5), -0.02, y / 2 - 0.05, span));
    g.add(at(rot(cyl(0.004, 0.004, span * 2, DARK(), 4), Math.PI / 2, 0, 0), -0.02, y, 0));
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const w = (0.07 + r() * 0.04) * k, h = (0.07 + r() * 0.05) * k;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h), surfaceMat('fabric', CLOTH[Math.floor(r() * CLOTH.length)], { roughness: 1, metalness: 0, side: THREE.DoubleSide }));
      cloth.position.set(-0.025, y - h / 2 - 0.005, -span + ((i + 0.5) / n) * span * 2);
      cloth.rotation.y = Math.PI / 2 + (r() - 0.5) * 0.4;
      g.add(cloth);
    }
  },
  // A whip antenna swept back, with a tiny pennant knob.
  antenna(b, k, r) {
    const g = new THREE.Group(); g.position.set(0.04, 0.05, -0.2 * k); g.rotation.z = 0.08 + r() * 0.08;
    const len = 0.32 * k;
    g.add(at(cyl(0.02, 0.025, 0.05, DARK(), 6), 0, 0.025, 0));
    g.add(at(cyl(0.004, 0.007, len, STEEL(), 4), 0, len / 2 + 0.05, 0));
    g.add(at(sph(0.012, mat(0xc0282d, { roughness: 0.8 }), 5), 0, len + 0.05, 0));
    b.sockets.back.add(g);
  },
  // A lashed tarp bundle.
  tarp(b, k) {
    const g = new THREE.Group(); g.position.set(-0.08, -0.06, -0.12 * k); g.scale.setScalar(k);
    const bun = sph(0.09, CANVAS(), 8); bun.scale.set(0.8, 0.7, 1.3); g.add(bun);
    for (const z of [-0.05, 0.05]) g.add(at(rot(torus(0.075, 0.008, DARK(), Math.PI * 2, 8), 0, 0, 0), 0, 0, z));
    b.sockets.back.add(g);
  },
  // A storm lantern on a hook off the melee shoulder: warm and dim.
  lantern(b) {
    const g = new THREE.Group(); g.position.set(0.02, -0.12, 0.1);
    g.add(at(cyl(0.004, 0.004, 0.06, DARK(), 4), 0, 0.03, 0));
    g.add(at(cyl(0.035, 0.035, 0.012, DARK(), 8), 0, -0.005, 0));
    g.add(at(cyl(0.035, 0.035, 0.012, DARK(), 8), 0, -0.085, 0));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; g.add(at(cyl(0.004, 0.004, 0.08, DARK(), 4), Math.cos(a) * 0.03, -0.045, Math.sin(a) * 0.03)); }
    const glow = sph(0.022, mat(0xffc27a, { emissive: 0xb86a1c, emissiveIntensity: 0.8, roughness: 0.8, metalness: 0 }), 8); glow.position.y = -0.045; g.add(glow);
    b.sockets.shoulderL.add(g);
  },
};
export const CLUTTER_PIECES = Object.keys(CLUTTER_BUILD);
export function addClutter(built, ids, seed) {
  const k = built.ctx.k;
  for (const id of ids) {
    const before = new Set(); built.pelvis.traverse((o) => before.add(o));
    CLUTTER_BUILD[id]?.(built, k, rngFrom(`${seed}|${id}`));
    built.pelvis.traverse((o) => { if (o.isMesh && !before.has(o)) o.userData.part = "skin"; });
  }
}

// ---- Stencil: unit number + side insignia, on the gun-side flank ----
const stencilCache = new Map();
function stencilTexture(num, side) {
  const key = `${num}|${side}`;
  if (stencilCache.has(key)) return stencilCache.get(key);
  const ink = SIDE_CSS[side] || SIDE_CSS.a;
  const t = canvasTexture(128, (g, n) => {
    g.clearRect(0, 0, n, n);
    // Insignia: side A a cog, side B a diamond with crossed hammers.
    g.save(); g.translate(64, 30); g.fillStyle = ink; g.strokeStyle = "rgba(10,8,6,0.6)"; g.lineWidth = 3;
    if (side === "b") {
      g.beginPath(); g.moveTo(0, -22); g.lineTo(22, 0); g.lineTo(0, 22); g.lineTo(-22, 0); g.closePath(); g.stroke(); g.fill();
      g.strokeStyle = "rgba(20,14,10,0.9)"; g.lineWidth = 4; g.beginPath(); g.moveTo(-10, -10); g.lineTo(10, 10); g.moveTo(10, -10); g.lineTo(-10, 10); g.stroke();
    } else {
      g.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 16 : 22; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.stroke(); g.fill();
      g.globalCompositeOperation = "destination-out"; g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // The number, cut as a stencil: a dark keyline, then the ink, then bridges.
    g.font = "900 58px 'Big Shoulders Stencil Display', Impact, 'Arial Black', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 5; g.strokeStyle = "rgba(10,8,6,0.55)"; g.strokeText(num, 64, 94);
    g.fillStyle = ink; g.fillText(num, 64, 94);
    g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
    for (const x of [44, 84]) g.fillRect(x, 70, 3, 48);
  });
  stencilCache.set(key, t);
  return t;
}
export function addStencil(built, num, side) {
  const tex = stencilTexture(num, side);
  if (!tex) return null; // headless: nothing to print
  const k = built.ctx.k, f = built.frame;
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * k, 0.3 * k), m);
  plate.rotation.y = Math.PI; plate.position.set(-0.04, -0.08 * k, -f.halfW - 0.013);
  plate.userData.part = "skin";
  built.torso.add(plate);
  return plate;
}
