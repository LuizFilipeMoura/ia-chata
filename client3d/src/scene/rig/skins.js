// Skins: the service history a rig wears. Same body, different finish and
// kit bolted to its sockets. A skin is a material transform (skinMaterials,
// applied before the body is built) plus add-ons (applySkin, after). Add-on
// placement is seeded from the rig id so two rigs in one skin never match.
import { THREE, mat, at, rot, box, cyl, sph, torus, drumZ, rivetRow, canvasTexture, rngFrom, GLOW, STEEL, BRASS, GUNMETAL, DARK, RUBBER, CANVAS } from "./kit.js";

export const SKINS = {
  factory: { id: "factory", name: "Factory Fresh", blurb: "Glossy enamel, polished trim, stencilled serial." },
  refit: { id: "refit", name: "Field Refit", blurb: "Faded paint, mud to the knees, sandbags, spare track, tarp and jerry cans." },
  ace: { id: "ace", name: "Ace", blurb: "Deep lacquer, chrome trim, shark-mouth nose art, kill tallies, pennant." },
  worn: { id: "worn", name: "Battle-Worn", blurb: "Scorched and dented, welded patch plates, a bent stack, sparking cable." },
  rust: { id: "rust", name: "Rust Bucket", blurb: "Rust bloom, oil streaks, mismatched primer panels, wire-lashed repairs." },
};
export const SKIN_IDS = Object.keys(SKINS);

const TRIMS = { brass: BRASS, steel: STEEL, gunmetal: GUNMETAL };
const tint = (hex, toward, k) => new THREE.Color(hex).lerp(new THREE.Color(toward), k).getHex();

// ---- Canvas overlays (null headless: the plain material stands in) ----
let rustTex, stencilTex, sharkTex;
function rustTexture() {
  return rustTex ??= canvasTexture(128, (g, n) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, n, n);
    const r = rngFrom("rust");
    for (let i = 0; i < 70; i++) {
      const x = r() * n, y = r() * n, s = 3 + r() * 14;
      g.fillStyle = `rgba(${120 + r() * 40},${50 + r() * 20},${20 + r() * 10},${0.35 + r() * 0.4})`;
      g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r()), r() * 3, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 10; i++) { g.fillStyle = "rgba(30,24,18,0.35)"; g.fillRect(r() * n, r() * n * 0.5, 2, 30 + r() * 60); }
  }, { repeat: true });
}
function stencilTexture() {
  return stencilTex ??= canvasTexture(128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = "rgba(240,236,220,0.92)"; g.font = "700 30px monospace"; g.textAlign = "center";
    g.fillText("No 7", 64, 52); g.font = "700 20px monospace"; g.fillText("OI-27", 64, 84);
  });
}
function sharkTexture() {
  return sharkTex ??= canvasTexture(128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = "#1a0d0d"; g.beginPath(); g.moveTo(0, 26); g.quadraticCurveTo(64, 146, 128, 26); g.lineTo(128, 104); g.quadraticCurveTo(64, 158, 0, 104); g.fill();
    g.fillStyle = "#b8222a"; g.beginPath(); g.moveTo(0, 30); g.quadraticCurveTo(64, 140, 128, 30); g.lineTo(128, 98); g.quadraticCurveTo(64, 150, 0, 98); g.fill();
    g.fillStyle = "#f4f0e4";
    for (let i = 0; i < 9; i++) { const x = 8 + i * 14; g.beginPath(); g.moveTo(x - 6, 40 + Math.sin(i / 8 * Math.PI) * 26); g.lineTo(x, 62 + Math.sin(i / 8 * Math.PI) * 26); g.lineTo(x + 6, 40 + Math.sin(i / 8 * Math.PI) * 26); g.fill(); }
    g.fillStyle = "#f4f0e4"; g.beginPath(); g.arc(22, 20, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#000"; g.beginPath(); g.arc(24, 20, 3, 0, Math.PI * 2); g.fill();
  });
}

// ---- Materials: { paint, trim, dark, steel, rubber } for a skin ----
const zebraCache = new Map();
export function skinMaterials(skinId, { color, trim = "steel", stripe = null }) {
  const trimMat = (TRIMS[trim] || STEEL)();
  const paintOf = (c, opts) => {
    if (!stripe) return mat(c, opts);
    const key = `${skinId}|${c}`;
    if (!zebraCache.has(key)) zebraCache.set(key, new THREE.MeshStandardMaterial({ map: stripe, color: c, roughness: 0.6, metalness: 0.3, ...opts }));
    return zebraCache.get(key);
  };
  const base = stripe ? 0xffffff : color;
  switch (skinId) {
    case "refit": return { paint: paintOf(tint(base, 0x8a8272, 0.28), { roughness: 0.85, metalness: 0.2 }), trim: mat(tint(trimMat.color.getHex(), 0x5a5448, 0.4), { roughness: 0.7, metalness: 0.5 }), dark: DARK(), steel: STEEL(), rubber: RUBBER() };
    case "ace": return { paint: paintOf(base, { roughness: 0.16, metalness: 0.62 }), trim: mat(0xdde2e8, { metalness: 1, roughness: 0.1 }), dark: mat(0x141418, { metalness: 0.7, roughness: 0.35 }), steel: mat(0x8a9098, { metalness: 0.95, roughness: 0.2 }), rubber: RUBBER() };
    case "worn": return { paint: paintOf(tint(base, 0x1a1612, 0.35), { roughness: 0.8, metalness: 0.35 }), trim: mat(tint(trimMat.color.getHex(), 0x222018, 0.45), { roughness: 0.6, metalness: 0.6 }), dark: DARK(), steel: mat(0x3a3c40, { metalness: 0.7, roughness: 0.55 }), rubber: RUBBER() };
    case "rust": {
      const map = rustTexture();
      return {
        paint: paintOf(tint(base, 0x7a3a1e, 0.32), { roughness: 0.95, metalness: 0.2, ...(map && !stripe ? { map } : {}) }),
        trim: mat(tint(trimMat.color.getHex(), 0x7a3a1e, 0.55), { roughness: 0.9, metalness: 0.3 }),
        dark: mat(0x2a1a14, { metalness: 0.4, roughness: 0.85 }), steel: mat(0x5a3a2a, { metalness: 0.5, roughness: 0.8 }), rubber: RUBBER(),
      };
    }
    default: return { paint: paintOf(base, { roughness: 0.3, metalness: 0.5 }), trim: trimMat, dark: DARK(), steel: STEEL(), rubber: RUBBER() };
  }
}

// ---- Add-on helpers ----
function decal(tex, w, h, fallback) {
  const m = tex ? new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, metalness: 0.2, depthWrite: false }) : mat(fallback, { roughness: 0.6 });
  const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  o.rotation.y = Math.PI / 2; // face +x
  return o;
}
function eachLegPart(built, fn) {
  for (const l of built.legs) l.knee.traverse((o) => { if (o.isMesh) fn(o); });
}
const MUD = 0x4a3a26;
const mudCache = new Map();
function muddy(m) {
  if (!m?.color) return m;
  if (!mudCache.has(m)) { const c = m.clone(); c.color.lerp(new THREE.Color(MUD), 0.55); c.roughness = 0.95; c.metalness = 0.1; mudCache.set(m, c); }
  return mudCache.get(m);
}

// Scale an add-on group to the class so medium kit is not dwarfed.
const kOf = (built) => built.ctx.k;

const ADDONS = {
  factory(built) {
    const f = built.frame, s = built.sockets;
    // White stencilled serial on the chest's flank.
    const plate = decal(stencilTexture(), 0.34 * kOf(built), 0.34 * kOf(built), 0xe8e4d8);
    plate.rotation.y = 0; plate.position.set(0, 0.02, f.halfW + 0.012); built.torso.add(plate);
    if (!plate.material.map) plate.scale.set(0.5, 0.25, 1);
    s.chestFront.add(at(box(0.02, 0.03, 0.2 * kOf(built), BRASS()), 0.01, -0.15, 0));
  },
  refit(built, rng) {
    const k = kOf(built), s = built.sockets;
    // Mud up the legs.
    eachLegPart(built, (o) => { o.material = muddy(o.material); });
    // Sandbags on the hip.
    const sand = mat(0x9a8660, { roughness: 1, metalness: 0 });
    const bags = new THREE.Group(); s.hip.add(bags); bags.scale.setScalar(k);
    const nb = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < nb; i++) { const b = sph(0.1, sand, 8); b.scale.set(1.5, 0.7, 0.9); b.position.set(-0.12 + i * 0.13, -0.05 + (i % 2) * 0.05, -0.02); b.rotation.y = rng() - 0.5; bags.add(b); }
    // Spare track links across the chest front.
    const links = new THREE.Group(); s.chestFront.add(links); links.scale.setScalar(k); links.position.y = -0.05 - rng() * 0.08;
    for (let i = 0; i < 4; i++) links.add(at(box(0.03, 0.08, 0.12, DARK()), 0.02, 0, -0.2 + i * 0.13));
    // Rolled tarp on the back, lashed with straps.
    const tarp = drumZ(0.08, 0.5, CANVAS(), 10); tarp.position.set(-0.08, 0.2 + rng() * 0.1, 0); tarp.scale.setScalar(k); s.back.add(tarp);
    for (const z of [-0.15, 0.15]) s.back.add(at(rot(torus(0.085 * k, 0.012, DARK(), Math.PI * 2, 10), 0, 0, 0), -0.08, tarp.position.y, z * k));
    // Jerry can on the shin.
    const can = box(0.06, 0.2, 0.14, mat(0x5a6a3a, { roughness: 0.75 })); can.position.set(0.02, 0, 0); can.scale.setScalar(k); s.shin.add(can);
  },
  ace(built, rng) {
    const k = kOf(built), s = built.sockets, f = built.frame;
    // Shark-mouth nose art on the chest front.
    const art = decal(sharkTexture(), 0.56 * k, 0.4 * k, 0xb8222a); art.position.set(0.015, -0.12 * k, 0); s.chestFront.add(art);
    // Kill tallies on the gun shoulder.
    const n = 3 + Math.floor(rng() * 5);
    const white = mat(0xf4f0e4, { roughness: 0.4 });
    for (let i = 0; i < n; i++) s.shoulderR.add(at(box(0.012, 0.07, 0.015, white), 0.02 - (i % 5) * 0.035, -0.08 - Math.floor(i / 5) * 0.09, -0.05));
    // Checkered band on the melee arm.
    for (let i = 0; i < 8; i++) s.shoulderL.add(at(box(0.05, 0.035, 0.02, i % 2 ? white : DARK()), -0.14 + i * 0.04, -0.12, 0.04));
    // Pennant on the back.
    const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.22, -0.05, 0), new THREE.Vector3(0, -0.12, 0)]), mat(0xd9a520, { side: THREE.DoubleSide, roughness: 0.8, metalness: 0 }));
    flag.geometry.computeVertexNormals();
    const pole = cyl(0.012, 0.012, 0.26, mat(0xdde2e8, { metalness: 1, roughness: 0.1 }), 6);
    const holder = new THREE.Group(); holder.position.set(-0.04, 0.08, 0.14 * k); holder.rotation.y = Math.PI / 2; holder.scale.setScalar(k);
    holder.add(at(pole, 0, 0.13, 0)); holder.add(at(flag, 0, 0.25, 0)); s.back.add(holder);
    // Red-tipped stacks.
    const red = mat(0xc0282d, { roughness: 0.4, metalness: 0.4 });
    for (const st of built.stacks) {
      const h = st.geometry.parameters.height, r = st.geometry.parameters.radiusTop;
      st.add(at(cyl(r * 1.08, r * 1.08, h * 0.18, red, 10), 0, h * 0.38, 0));
    }
    void f;
  },
  worn(built, rng) {
    const k = kOf(built), s = built.sockets, f = built.frame;
    const soot = mat(0x0e0c0a, { roughness: 1, metalness: 0, transparent: true, opacity: 0.7, depthWrite: false });
    // Scorch halos + bullet pocks on the chest.
    for (let i = 0; i < 2; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.12 * k * (0.7 + rng() * 0.6), 12), soot); d.rotation.y = Math.PI / 2; d.position.set(0.012 + i * 0.002, (rng() - 0.5) * 0.3 * k, (rng() - 0.5) * 0.5 * k); s.chestFront.add(d); }
    for (let i = 0; i < 7; i++) { const p = sph(0.022 * k, DARK(), 5); p.position.set(0.005, (rng() - 0.5) * 0.4 * k, (rng() - 0.5) * 0.6 * k); s.chestFront.add(p); }
    // Welded patch plate in an odd colour.
    const patch = box(0.26 * k, 0.2 * k, 0.02, mat(rng() < 0.5 ? 0x8a3a2a : 0x6a6e70, { roughness: 0.75, metalness: 0.4 }));
    patch.position.set(0.02 - rng() * 0.15, (rng() - 0.5) * 0.2 * k, f.halfW + 0.012); built.torso.add(patch);
    rivetRow(built.torso, [patch.position.x - 0.1 * k, patch.position.y + 0.08 * k, f.halfW + 0.025], [patch.position.x + 0.1 * k, patch.position.y + 0.08 * k, f.halfW + 0.025], 4, BRASS(), 0.015);
    // One shoulder plate missing: the paint shell on that side is gone.
    const side = rng() < 0.5 ? built.armL : built.armR;
    side.children[0]?.traverse((o) => { if (o.isMesh && o.material === built.ctx.paint) o.visible = false; });
    // A bent stack.
    const st = built.stacks[Math.floor(rng() * built.stacks.length)];
    st.rotation.x += 0.3; st.rotation.z += 0.2;
    // Sparking cable stub off the back.
    const cable = cyl(0.015, 0.015, 0.22, RUBBER(), 6); cable.position.set(-0.05, -0.1, -0.18 * k); cable.rotation.z = 0.9; s.back.add(cable);
    const spark = sph(0.03, GLOW(0xbfe8ff, 0x88ccff, 2.4), 6); spark.position.set(-0.14, -0.17, -0.18 * k); s.back.add(spark);
    built.flickers.push(spark);
    // A strap binding one leg.
    s.shin.add(at(rot(torus(0.14 * k, 0.018, CANVAS(), Math.PI * 2, 10), Math.PI / 2, 0, 0), -0.12 * k, 0.1, 0));
  },
  rust(built, rng) {
    const k = kOf(built), s = built.sockets, f = built.frame;
    const oil = mat(0x0d0b09, { roughness: 0.2, metalness: 0.6 });
    // Oil streaks down the back from the stacks.
    for (let i = 0; i < 3; i++) s.back.add(at(box(0.012, 0.25 + rng() * 0.25, 0.03, oil), -0.005, -0.1 - rng() * 0.1, (rng() - 0.5) * 0.6 * k));
    // Mismatched primer panels.
    const primer = mat(0x8a3a2a, { roughness: 0.95, metalness: 0.1 }), grey = mat(0x6e6e68, { roughness: 0.95, metalness: 0.1 });
    const pa = box(0.3 * k, 0.24 * k, 0.02, primer); pa.position.set(-0.05, 0.05, f.halfW + 0.012); built.torso.add(pa);
    const pb = box(0.02, 0.18 * k, 0.24 * k, grey); pb.position.set(0.012, 0.1 * k * (rng() - 0.5), (rng() - 0.5) * 0.2 * k); s.chestFront.add(pb);
    // Soot-black stack tops + tin-can mufflers.
    const soot = mat(0x0a0908, { roughness: 1, metalness: 0 });
    for (const st of built.stacks) {
      const h = st.geometry.parameters.height, r = st.geometry.parameters.radiusTop;
      st.add(at(cyl(r * 1.05, r * 1.05, h * 0.25, soot, 10), 0, h * 0.4, 0));
    }
    if (built.stacks.length) { const st = built.stacks[0], h = st.geometry.parameters.height, r = st.geometry.parameters.radiusTop; st.add(at(cyl(r * 1.4, r * 1.4, h * 0.2, mat(0x9a9a92, { roughness: 0.5, metalness: 0.8 }), 8), 0, h * 0.15, 0)); }
    // Wire lashing round the gun arm.
    for (let i = 0; i < 3; i++) built.armR.add(at(rot(torus(0.1 * k, 0.008, STEEL(), Math.PI * 2, 8), 0, Math.PI / 2, 0), 0.08 + i * 0.05, -0.05, 0));
    // Dangling chain off the hip.
    for (let i = 0; i < 4; i++) { const l = torus(0.03, 0.009, STEEL(), Math.PI * 2, 6); l.position.set(0.1, -0.08 - i * 0.05, 0); l.rotation.y = i % 2 ? Math.PI / 2 : 0; s.hip.add(l); }
    // Cracked glass: dark hairlines over the front.
    for (let i = 0; i < 2; i++) s.chestFront.add(at(box(0.01, 0.01, 0.2 * k, DARK()), 0.02, 0.1 * k + i * 0.03, 0, (rng() - 0.5) * 1.2));
  },
};

// Bolt the skin's add-ons onto a built body (after the materials swap).
export function applySkin(built, skinId, seed) {
  const fn = ADDONS[skinId] || ADDONS.factory;
  fn(built, rngFrom(`${seed}|${skinId}`));
  built.pelvis.traverse((o) => { if (o.isMesh && !o.userData.part) o.userData.part = "skin"; });
}

// Which skin a rig wears, from the per-browser setting.
// mode: "side" (A factory, B refit) | "fixed" | "chassis" (map) | "random" (per battle seed).
export function skinFor({ mode = "side", fixed = "factory", map = {}, side = "a", codename = "", seed = "" } = {}) {
  if (mode === "fixed") return SKINS[fixed] ? fixed : "factory";
  if (mode === "chassis") return SKINS[map[codename]] ? map[codename] : "factory";
  if (mode === "random") { const r = rngFrom(`${seed}|${codename}|${side}`); return SKIN_IDS[Math.floor(r() * SKIN_IDS.length)]; }
  return side === "b" ? "refit" : "factory";
}
