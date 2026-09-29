// Buildings for the newer locales: a Polish timber barn (Rozalski Fields), a
// whitewashed Karnaca villa, a Rapture deco tower (Sunken Deco), a trench
// blockhouse (No-Man's-Land) and a Hugh Ferriss setback monolith (Ferriss
// City). Same contract as works.js: each fills its rect t.w x t.h and stays
// under the original height range (SET_ENVELOPE, props.test.js).
import * as THREE from "three";
import { std, glow, shadow, V, blinker, flickerWindows } from "./dress-kit.js";
import { paintTexture } from "./facades.js";

const box = (w, h, d, m) => shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
const cyl = (rt, rb, h, m, seg = 12) => shadow(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m));
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
function windowsMat(ctx, w, h) {
  const tex = ctx.win.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, w / 3), Math.max(1, h / 3));
  const m = std(0xffffff, { map: tex }); flickerWindows(ctx, m, ctx.theme.lamp);
  return m;
}
// A roof prism along x: a profile [z, y] extruded over length L.
function roofPrism(profile, L, m) {
  const s = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2); geo.rotateY(Math.PI / 2);
  return shadow(new THREE.Mesh(geo, m));
}
// Hipped roof: a four-sided pyramid w x d, h tall, its base at y = 0.
function hipRoof(w, d, h, m) {
  const geo = new THREE.CylinderGeometry(0.02, Math.SQRT1_2, h, 4, 1); geo.rotateY(Math.PI / 4); geo.scale(w, 1, d); geo.translate(0, h / 2, 0);
  return shadow(new THREE.Mesh(geo, m));
}

// Gas-attack warning board: a masked head and GAS! stencilled on tin.
let gasTex;
export function gasSignTexture() {
  return gasTex ??= paintTexture(128, 160, (g, w, h) => {
    g.fillStyle = "#c8a830"; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(40,30,10,0.25)"; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 16, 1 + Math.random() * 3);
    g.strokeStyle = "#1a1408"; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = "#1a1408";
    g.beginPath(); g.ellipse(w / 2, 62, 30, 36, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#c8a830"; for (const x of [-12, 12]) { g.beginPath(); g.arc(w / 2 + x, 54, 9, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#1a1408"; g.fillRect(w / 2 - 8, 80, 16, 20); g.beginPath(); g.arc(w / 2, 104, 11, 0, Math.PI * 2); g.fill();
    g.font = "900 34px 'Big Shoulders Stencil Display', Impact, sans-serif"; g.textAlign = "center"; g.fillText("GAS!", w / 2, 148);
  });
}
export function gasSign(h = 1.2) {
  const g = new THREE.Group();
  g.add(at(cyl(0.035, 0.04, h, std(0x3a2a1c), 5), 0, h / 2, 0));
  const tex = gasSignTexture();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.03), [std(0x5a4a24), std(0x5a4a24), std(0x5a4a24), std(0x5a4a24), std(tex ? 0xffffff : 0xc8a830, { map: tex }), std(0x5a4a24)]);
  board.castShadow = true; board.rotation.z = 0.06;
  g.add(at(board, 0, h - 0.1, 0.03));
  return g;
}

// ---- Barn: dark timber under a gambrel roof, a haystack by the door ----
function barn(t, ctx) {
  const g = new THREE.Group();
  const W = t.w * 0.7, D = t.h * 0.82, H = 2.8, cx = -t.w * 0.12;
  const timber = std(0x4a2a1a, { roughness: 1 }), batten = std(0x2e1c12, { roughness: 1 });
  g.add(at(box(W, H, D, timber), cx, H / 2, 0));
  const n = Math.max(3, Math.round(W / 0.5));
  for (let i = 0; i <= n; i++) for (const s of [-1, 1]) g.add(at(box(0.06, H, 0.04, batten), cx - W / 2 + (i / n) * W, H / 2, s * (D / 2 + 0.01)));
  const shingle = std(0x3a3228, { roughness: 1 });
  const e = D / 2 + 0.15;
  g.add(at(roofPrism([[-e, 0], [-e * 0.62, 1.2], [0, 1.9], [e * 0.62, 1.2], [e, 0], [e * 0.9, 0], [e * 0.55, 1.08], [0, 1.72], [-e * 0.55, 1.08], [-e * 0.9, 0]], W + 0.2, shingle), cx, H, 0));
  // Gable ends: fill the roof triangle.
  for (const s of [-1, 1]) {
    const gs = new THREE.Shape([[-D / 2, 0], [-D / 2 * 0.6, 1.15], [0, 1.8], [D / 2 * 0.6, 1.15], [D / 2, 0]].map(([z, y]) => new THREE.Vector2(z, y)));
    const gm = shadow(new THREE.Mesh(new THREE.ShapeGeometry(gs), timber)); gm.rotation.y = s * Math.PI / 2; gm.position.set(cx + s * W / 2, H, 0); g.add(gm);
  }
  // Big double door with its white X brace, a lit hayloft hatch above.
  const door = at(box(1.4, 2.0, 0.06, std(0x3a2016, { roughness: 1 })), cx, 1.0, D / 2 + 0.04); g.add(door);
  const white = std(0xb8ac98, { roughness: 1 });
  for (const s of [-1, 1]) { const b = box(1.6, 0.08, 0.03, white); b.rotation.z = s * 0.95; g.add(at(b, cx, 1.0, D / 2 + 0.08)); }
  const loft = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), glow(ctx.theme.lamp, 0.6)); loft.rotation.y = Math.PI / 2;
  g.add(at(loft, cx + W / 2 + 0.02, H + 0.5, 0));
  // Haystack and a pitchfork against it.
  const hay = std(0xa08a44, { roughness: 1, flatShading: true });
  const hr = Math.min(0.75, t.w * 0.12, t.h * 0.3), hx = t.w / 2 - hr - 0.05, hz = t.h / 2 - hr - 0.1;
  g.add(at(cyl(hr, hr * 1.05, hr * 1.1, hay, 10), hx, hr * 0.55, hz));
  g.add(at(shadow(new THREE.Mesh(new THREE.ConeGeometry(hr * 1.02, hr * 1.2, 10), hay)), hx, hr * 1.7, hz));
  const fork = cyl(0.02, 0.02, 1.3, std(0x5a4028), 5); fork.rotation.z = 0.35; g.add(at(fork, hx - hr * 0.8, 0.62, hz));
  // Weathervane rooster on the ridge.
  const vane = new THREE.Group(); vane.position.set(cx, H + 1.9, 0); g.add(vane);
  vane.add(at(cyl(0.02, 0.02, 0.6, std(0x2a2622), 5), 0, 0.3, 0));
  vane.add(at(box(0.36, 0.2, 0.02, std(0x2a2622)), 0.06, 0.62, 0));
  const ph = ctx.rand() * 6;
  ctx.anim((dt, now) => { vane.rotation.y = Math.sin(now * 0.2 + ph) * 1.2; });
  return g;
}

// ---- Villa: whitewash, terracotta, slatted shutters, arched windows ----
function villa(t, ctx) {
  const g = new THREE.Group();
  const W = t.w * 0.86, D = t.h * 0.8, H = 4.2;
  const wash = std(0xcbbd9f, { roughness: 1 }), terra = std(0x9a4a2a, { roughness: 1 }), shutter = std(0x5a7466, { roughness: 1 }), dark = std(0x1c1814, { roughness: 1 });
  g.add(at(box(W, H, D, wash), 0, H / 2, 0));
  g.add(at(box(W + 0.16, 0.14, D + 0.16, std(0xa89878, { roughness: 1 })), 0, 2.1, 0)); // string course
  g.add(at(hipRoof(W + 0.5, D + 0.5, 1.3, terra), 0, H, 0));
  const lit = glow(ctx.theme.lamp, 0.55);
  const arch = new THREE.TorusGeometry(0.22, 0.04, 4, 10, Math.PI);
  const cols = Math.max(2, Math.floor(W / 1.2));
  for (const s of [-1, 1]) for (const y of [0.95, 3.0]) for (let i = 0; i < cols; i++) {
    const x = -W / 2 + (W / cols) * (i + 0.5), z = s * (D / 2 + 0.01), on = ((i * 3 + (y > 2 ? 1 : 0) + (s > 0 ? 2 : 0)) % 4) === 0;
    if (s > 0 && y < 2 && Math.abs(x) < 1.0) continue; // the front door is here
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.8), on ? lit : dark); pane.rotation.y = s > 0 ? 0 : Math.PI; g.add(at(pane, x, y, z + s * 0.005));
    const mull = shadow(new THREE.Mesh(arch, wash)); mull.rotation.y = s > 0 ? 0 : Math.PI; g.add(at(mull, x, y + 0.4, z + s * 0.02)); // curved mullion
    for (const k of [-1, 1]) { const sh = box(0.2, 0.84, 0.03, shutter); sh.rotation.y = k * s * 0.5; g.add(at(sh, x + k * 0.34, y, z + s * 0.06)); }
  }
  // Wrought-iron balcony over the door, a striped awning, a chimney.
  const iron = std(0x1e1a18, { metalness: 0.5 });
  g.add(at(box(1.4, 0.06, 0.5, iron), 0, 2.4, D / 2 + 0.25));
  for (let i = 0; i <= 6; i++) g.add(at(box(0.025, 0.42, 0.025, iron), -0.7 + i * (1.4 / 6), 2.64, D / 2 + 0.48));
  g.add(at(box(1.4, 0.03, 0.025, iron), 0, 2.85, D / 2 + 0.48));
  for (let i = 0; i < 5; i++) { const a = box(0.28, 0.03, 0.44, std(i % 2 ? 0xb0482a : 0xc8b89a, { roughness: 1 })); a.rotation.x = 0.35; g.add(at(a, -0.56 + i * 0.28, 1.95, D / 2 + 0.2)); }
  g.add(at(box(0.9, 1.5, 0.04, std(0x3a2a1c)), 0, 0.75, D / 2 + 0.02));
  g.add(at(box(0.36, 0.9, 0.36, wash), W * 0.28, H + 0.9, -D * 0.2));
  return g;
}

// ---- Deco tower: gold and verdigris setbacks, portholes, a leaking seam ----
function decotower(t, ctx) {
  const g = new THREE.Group();
  const verd = std(0x3e5e52, { roughness: 0.9 }), gold = std(0x9a7a3a, { metalness: 0.6 }), stone = std(0x2a2a28, { roughness: 1 });
  const W = t.w * 0.8, D = t.h * 0.8;
  const tiers = [[1, 4.0], [0.74, 2.6], [0.5, 2.0]];
  let y = 0;
  tiers.forEach(([k, h], i) => {
    const w = W * k, d = D * k;
    g.add(at(box(w, h, d, i === 0 ? windowsMat(ctx, w, h) : verd), 0, y + h / 2, 0));
    g.add(at(box(w + 0.12, 0.14, d + 0.12, gold), 0, y + h, 0));
    // Gold pinstripes up the faces.
    const n = Math.max(2, Math.floor(w / 0.8));
    for (let j = 1; j < n; j++) for (const s of [-1, 1]) g.add(at(box(0.05, h * 0.9, 0.04, gold), -w / 2 + (j / n) * w, y + h / 2, s * (d / 2 + 0.02)));
    y += h;
  });
  // Crown fins and a spire with a warm lamp.
  for (let i = 0; i < 4; i++) { const f = box(0.08, 1.1, W * 0.3, gold); f.rotation.y = (i * Math.PI) / 4; g.add(at(f, 0, y + 0.55, 0)); }
  g.add(at(cyl(0.02, 0.12, 0.9, gold, 6), 0, y + 1.55, 0));
  blinker(ctx, g, V(0, y + 2.05, 0), 0xffb050, { period: 2.2, duty: 0.5, size: 0.09 });
  // Bulkhead portholes on the base, dim bluish-green water light behind.
  const water = glow(0x2a6a60, 0.35), rim = new THREE.TorusGeometry(0.26, 0.05, 6, 16);
  const cols = Math.max(1, Math.floor(W / 1.4));
  for (const s of [-1, 1]) for (let i = 0; i < cols; i++) {
    const x = -W / 2 + (W / cols) * (i + 0.5), z = s * (D / 2 + 0.02);
    const pane = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), water); pane.rotation.y = s > 0 ? 0 : Math.PI; g.add(at(pane, x, 1.1, z));
    const r = shadow(new THREE.Mesh(rim, gold)); g.add(at(r, x, 1.1, z));
  }
  g.add(at(box(W + 0.1, 0.5, D + 0.1, stone), 0, 0.25, 0));
  // A seam that weeps: drips off a pipe down one corner.
  const pipe = cyl(0.07, 0.07, 3.6, std(0x5a4a36, { metalness: 0.5 }), 8); g.add(at(pipe, W / 2 + 0.08, 2.0, D / 2 - 0.2));
  const drip = new THREE.Object3D(); drip.position.set(W / 2 + 0.08, 0.2, D / 2 - 0.2); g.add(drip);
  ctx.anim((dt) => { if (Math.random() < dt * 1.5) ctx.fx.particle(drip.getWorldPosition(V(0, 0, 0)).add(V(0, 3.2, 0)), { color: 0x6a8a84, size: 0.06, life: 0.6, additive: false, opacity: 0.6, vel: V(0, -5, 0) }); });
  return g;
}

// ---- Blockhouse: a trench command post, sandbagged, gas board by the door ----
function blockhouse(t, ctx) {
  const g = new THREE.Group();
  const W = t.w * 0.8, D = t.h * 0.7, H = 2.0;
  const conc = std(0x6a665e, { roughness: 1 }), mud = std(0x3a3024, { roughness: 1 }), timber = std(0x4a3420, { roughness: 1 });
  g.add(at(box(W, H, D, conc), 0, H / 2, -t.h * 0.08));
  // Sandbag roof and berm.
  const sand = std(0x8a7a58, { roughness: 1 });
  const bag = new THREE.SphereGeometry(0.5, 8, 5);
  for (let x = -W / 2 + 0.3; x < W / 2; x += 0.55) for (let z = -D / 2 + 0.25; z < D / 2; z += 0.45) { const b = shadow(new THREE.Mesh(bag, sand)); b.scale.set(0.55, 0.2, 0.36); g.add(at(b, x, H + 0.1, z - t.h * 0.08)); }
  g.add(at(box(W + 0.4, 0.5, D + 0.3, mud), 0, 0.25, -t.h * 0.08));
  // Firing slit, a shored doorway with a lantern, duckboards leading out.
  g.add(at(box(W * 0.6, 0.14, 0.05, glow(ctx.theme.lamp, 0.4)), 0, H * 0.72, D / 2 - t.h * 0.08 + 0.01));
  const dz = D / 2 - t.h * 0.08;
  for (const s of [-1, 1]) g.add(at(box(0.12, 1.5, 0.12, timber), W * 0.28 + s * 0.45, 0.75, dz + 0.08));
  g.add(at(box(1.1, 0.12, 0.14, timber), W * 0.28, 1.52, dz + 0.08));
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), glow(ctx.theme.lamp, 0.5)), W * 0.28, 0.72, dz + 0.02));
  const planks = Math.max(2, Math.floor((t.h / 2 - dz) / 0.22));
  for (let i = 0; i < planks; i++) g.add(at(box(0.7, 0.04, 0.14, timber), W * 0.28, 0.03, dz + 0.2 + i * 0.22));
  const sign = gasSign(1.3); sign.position.set(-W * 0.3, 0, Math.min(t.h / 2 - 0.2, dz + 0.45)); g.add(sign);
  // Periscope and a trench-lamp that swings.
  g.add(at(cyl(0.04, 0.04, 0.9, std(0x2a2622), 6), -W * 0.3, H + 0.55, -t.h * 0.08));
  g.add(at(box(0.12, 0.12, 0.2, std(0x2a2622)), -W * 0.3, H + 1.0, -t.h * 0.08 + 0.06));
  return g;
}

// ---- Setback: a Ferriss monolith, deep piers, a lamp at the crown ----
function setback(t, ctx) {
  const g = new THREE.Group();
  const stone = std(0x2c2a26, { roughness: 1 }), pier = std(0x221f1c, { roughness: 1 });
  const W = t.w * 0.92, D = t.h * 0.92;
  let y = 0;
  [[1, 4.0], [0.74, 2.8], [0.5, 2.0], [0.3, 0.9]].forEach(([k, h], i) => {
    const w = W * k, d = D * k;
    g.add(at(box(w, h, d, i < 2 ? windowsMat(ctx, w, h) : stone), 0, y + h / 2, 0));
    const n = Math.max(2, Math.floor(w / 1.1));
    for (let j = 0; j <= n; j++) for (const s of [-1, 1]) g.add(at(box(0.22, h, 0.14, pier), -w / 2 + (j / n) * w, y + h / 2, s * (d / 2 + 0.06)));
    y += h;
  });
  g.add(at(cyl(0.03, 0.1, 0.4, stone, 6), 0, y + 0.2, 0));
  blinker(ctx, g, V(0, y + 0.45, 0), 0xff7a3a, { period: 1.8, duty: 0.3, size: 0.1 });
  return g;
}

export const ESTATES = { barn, villa, decotower, blockhouse, setback };
