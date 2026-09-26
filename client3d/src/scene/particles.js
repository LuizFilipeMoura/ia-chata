// GPU billboard particles. Every particle lives in flat typed arrays (CPU sim,
// dense, swap-remove) and is drawn by one instanced quad mesh per blend layer:
// additive (glow: sparks, flame, embers) and alpha (smoke, dust, flakes). A
// texture atlas gives each particle a shape; the vertex shader billboards the
// quad, spins it, or stretches it along its screen-space velocity (streaks).
import * as THREE from "three";

export const TILE = { soft: 0, smoke: 1, spark: 2, ember: 3, flame: 4, star: 5, flake: 6, ring: 7 };
const COLS = 4, ROWS = 2, CELL = 128;

// A small seeded stream so the atlas looks the same every load.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function radial(g, x, y, r, stops) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [k, a] of stops) grd.addColorStop(k, `rgba(255,255,255,${a})`);
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

// Lumpy cloud: overlapping soft blobs, then a round falloff so no edge shows.
function puff(g, rand, blobs, spread, alpha, core) {
  const c = CELL / 2;
  for (let i = 0; i < blobs; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * spread;
    radial(g, c + Math.cos(a) * d, c + Math.sin(a) * d, 14 + rand() * 22, [[0, alpha], [1, 0]]);
  }
  if (core) radial(g, c, c, 34, [[0, core], [1, 0]]);
  g.globalCompositeOperation = "destination-in";
  radial(g, c, c, 60, [[0, 1], [0.55, 0.9], [1, 0]]);
  g.globalCompositeOperation = "source-over";
}

const DRAW = [
  (g) => radial(g, 64, 64, 60, [[0, 1], [0.35, 0.6], [1, 0]]),
  (g) => puff(g, rng(7), 18, 30, 0.45, 0.45),
  (g) => { g.save(); g.translate(64, 64); g.scale(1, 0.16); radial(g, 0, 0, 60, [[0, 1], [0.25, 0.9], [1, 0]]); g.restore(); },
  (g) => radial(g, 64, 64, 40, [[0, 1], [0.18, 1], [0.35, 0.45], [1, 0]]),
  // Flame tongue: a soft ellipse along x (the stretch axis) with faint licks.
  (g) => {
    g.save(); g.translate(64, 64); g.scale(1, 0.62); radial(g, 0, 0, 60, [[0, 0.9], [0.35, 0.55], [0.7, 0.18], [1, 0]]); g.restore();
    const r = rng(19);
    for (let i = 0; i < 8; i++) radial(g, 64 + (r() - 0.5) * 56, 64 + (r() - 0.5) * 30, 10 + r() * 12, [[0, 0.18], [1, 0]]);
  },
  (g) => {
    g.save(); g.translate(64, 64);
    for (let i = 0; i < 6; i++) {
      const len = i % 2 ? 36 : 58, w = i % 2 ? 5 : 8;
      g.rotate(Math.PI / 3);
      const grd = g.createLinearGradient(0, 0, len, 0);
      grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.beginPath(); g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w); g.fill();
    }
    g.restore();
    radial(g, 64, 64, 30, [[0, 1], [0.4, 0.8], [1, 0]]);
  },
  (g) => {
    const rand = rng(31), n = 7;
    g.fillStyle = "rgba(255,255,255,1)"; g.beginPath();
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = 22 + rand() * 30; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r * 0.7); }
    g.fill();
  },
  (g) => { g.strokeStyle = "rgba(255,255,255,1)"; g.shadowColor = "white"; g.shadowBlur = 8; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.stroke(); },
];

function atlasTexture() {
  const c = document.createElement("canvas"); c.width = CELL * COLS; c.height = CELL * ROWS;
  const g = c.getContext("2d");
  DRAW.forEach((draw, i) => {
    g.save();
    g.translate((i % COLS) * CELL, Math.floor(i / COLS) * CELL);
    g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip();
    draw(g);
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return t;
}

const VERT = /* glsl */`
  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iColor;
  attribute vec4 iParams; // size, rotation, stretch, tile
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    float size = iParams.x, ang = iParams.y, stretch = iParams.z, tile = iParams.w;
    vec2 scale = vec2(size);
    if (stretch > 0.0) {
      vec2 d = (modelViewMatrix * vec4(iVel, 0.0)).xy;
      float len = length(d);
      if (len > 1e-4) { ang = atan(d.y, d.x); scale.x = size + len * stretch; }
    }
    float c = cos(ang), s = sin(ang);
    vec2 p = position.xy * scale;
    mvPosition.xy += vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    gl_Position = projectionMatrix * mvPosition;
    float col = mod(tile, ${COLS}.0), row = floor(tile / ${COLS}.0);
    vUv = vec2((col + uv.x) / ${COLS}.0, 1.0 - (row + 1.0 - uv.y) / ${ROWS}.0);
    vColor = iColor;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = texture2D(map, vUv);
    gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
    if (gl_FragColor.a < 0.004) discard;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #ifdef USE_FOG
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #ifdef ADDITIVE
        gl_FragColor.rgb *= 1.0 - fogFactor;
      #else
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
      #endif
    #endif
  }`;

const FIELDS = ["px", "py", "pz", "vx", "vy", "vz", "age", "life", "size", "grow", "r0", "g0", "b0", "r1", "g1", "b1", "a0", "grav", "drag", "rot", "spin", "stretch", "tile", "fadeIn", "turb", "seed", "floor", "layer"];

class Layer {
  constructor(tex, additive, cap) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute("position", quad.getAttribute("position")); geo.setAttribute("uv", quad.getAttribute("uv"));
    const attr = (n) => new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n).setUsage(THREE.DynamicDrawUsage);
    this.pos = attr(3); this.vel = attr(3); this.color = attr(4); this.params = attr(4);
    geo.setAttribute("iPos", this.pos); geo.setAttribute("iVel", this.vel); geo.setAttribute("iColor", this.color); geo.setAttribute("iParams", this.params);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), map: { value: tex } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: additive ? { ADDITIVE: "" } : {},
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 4 : 3;
    this.geo = geo; this.n = 0;
  }
}

const tmp = new THREE.Color();

export class ParticleSystem {
  constructor(scene, cap = 12000) {
    this.cap = cap; this.n = 0;
    for (const f of FIELDS) this[f] = new Float32Array(cap);
    this.tex = atlasTexture();
    this.layers = [new Layer(this.tex, true, cap), new Layer(this.tex, false, cap)];
    for (const l of this.layers) scene.add(l.mesh);
    this.order = new Uint32Array(cap); this.depth = new Float32Array(cap);
  }

  get count() { return this.n; }

  // pos: Vector3. Options mirror FX.particle() plus: tile (TILE key or index),
  // color2 (end colour), glow (HDR multiplier: > 1 blooms), stretch (streak
  // length per unit of screen speed), spin / rot, drag, turb (wander), floor
  // (bounce off the table), fadeIn (seconds), delay (seconds before it shows).
  spawn(pos, o = {}) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    const additive = o.additive ?? true;
    const vel = o.vel;
    this.px[i] = pos.x; this.py[i] = pos.y; this.pz[i] = pos.z;
    this.vx[i] = vel ? vel.x : 0; this.vy[i] = vel ? vel.y : 0; this.vz[i] = vel ? vel.z : 0;
    this.life[i] = Math.max(0.01, o.life ?? 0.6);
    this.age[i] = -(o.delay ?? 0);
    this.size[i] = o.size ?? 0.6; this.grow[i] = o.grow ?? 1;
    const glow = o.glow ?? 1;
    tmp.set(o.color ?? 0xffaa33); this.r0[i] = tmp.r * glow; this.g0[i] = tmp.g * glow; this.b0[i] = tmp.b * glow;
    if (o.color2 != null) tmp.set(o.color2);
    this.r1[i] = tmp.r * glow; this.g1[i] = tmp.g * glow; this.b1[i] = tmp.b * glow;
    this.a0[i] = o.opacity ?? 1;
    this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 0;
    const tile = typeof o.tile === "string" ? TILE[o.tile] : o.tile ?? (additive ? TILE.soft : TILE.smoke);
    this.tile[i] = tile;
    const tumbles = tile === TILE.smoke || tile === TILE.flame || tile === TILE.flake || tile === TILE.star;
    this.rot[i] = o.rot ?? (tumbles ? Math.random() * Math.PI * 2 : 0);
    this.spin[i] = o.spin ?? (tumbles ? (Math.random() - 0.5) * 1.2 : 0);
    this.stretch[i] = o.stretch ?? 0;
    this.fadeIn[i] = o.fadeIn ?? (additive ? 0 : 0.12 * this.life[i]);
    this.turb[i] = o.turb ?? 0; this.seed[i] = Math.random() * 100;
    this.floor[i] = o.floor ? 1 : 0;
    this.layer[i] = additive ? 0 : 1;
    return i;
  }

  kill(i) {
    const last = --this.n;
    if (i !== last) for (const f of FIELDS) this[f][i] = this[f][last];
  }

  clear() { this.n = 0; for (const l of this.layers) l.geo.instanceCount = 0; }

  step(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      const age = (this.age[i] += dt);
      if (age < 0) continue;
      if (age >= this.life[i]) { this.kill(i); continue; }
      const d = this.drag[i];
      if (d) { const k = Math.max(0, 1 - d * dt); this.vx[i] *= k; this.vy[i] *= k; this.vz[i] *= k; }
      this.vy[i] += this.grav[i] * dt;
      const tb = this.turb[i];
      if (tb) { const s = this.seed[i]; this.vx[i] += Math.sin(age * 2.3 + s) * tb * dt; this.vz[i] += Math.cos(age * 1.9 + s * 1.7) * tb * dt; this.vy[i] += Math.sin(age * 3.1 + s * 0.6) * tb * 0.4 * dt; }
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.floor[i] && this.py[i] < 0.04) { this.py[i] = 0.04; this.vy[i] = Math.abs(this.vy[i]) * 0.3; this.vx[i] *= 0.55; this.vz[i] *= 0.55; }
      this.rot[i] += this.spin[i] * dt;
    }
  }

  update(dt, camera) {
    this.step(dt);
    const [add, alpha] = this.layers;
    add.n = 0; alpha.n = 0;
    // Smoke draws back to front; glow order doesn't matter (additive).
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    let na = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] < 0) continue;
      if (this.layer[i] === 0) this.write(add, i);
      else { this.order[na] = i; this.depth[i] = (this.px[i] - cx) * fwd.x + (this.py[i] - cy) * fwd.y + (this.pz[i] - cz) * fwd.z; na++; }
    }
    const idx = this.order.subarray(0, na);
    const depth = this.depth;
    idx.sort((a, b) => depth[b] - depth[a]);
    for (let k = 0; k < na; k++) this.write(alpha, idx[k]);
    for (const l of this.layers) {
      l.geo.instanceCount = l.n;
      for (const a of [l.pos, l.vel, l.color, l.params]) { a.clearUpdateRanges(); a.addUpdateRange(0, l.n * a.itemSize); a.needsUpdate = true; }
    }
  }

  write(l, i) {
    const j = l.n++;
    const f = 1 - this.age[i] / this.life[i];      // 1 → 0 over life
    const u = 1 - f;
    const fi = this.fadeIn[i];
    const a = this.a0[i] * f * (fi > 0 ? Math.min(1, this.age[i] / fi) : 1);
    l.pos.array[j * 3] = this.px[i]; l.pos.array[j * 3 + 1] = this.py[i]; l.pos.array[j * 3 + 2] = this.pz[i];
    l.vel.array[j * 3] = this.vx[i]; l.vel.array[j * 3 + 1] = this.vy[i]; l.vel.array[j * 3 + 2] = this.vz[i];
    const c = l.color.array;
    c[j * 4] = this.r0[i] + (this.r1[i] - this.r0[i]) * u;
    c[j * 4 + 1] = this.g0[i] + (this.g1[i] - this.g0[i]) * u;
    c[j * 4 + 2] = this.b0[i] + (this.b1[i] - this.b0[i]) * u;
    c[j * 4 + 3] = a;
    const p = l.params.array;
    p[j * 4] = this.size[i] * (1 + u * (this.grow[i] - 1));
    p[j * 4 + 1] = this.rot[i]; p[j * 4 + 2] = this.stretch[i]; p[j * 4 + 3] = this.tile[i];
  }
}
