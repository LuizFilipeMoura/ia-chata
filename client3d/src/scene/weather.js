// Weather over the table (themes.js weatherFor picks it per battle). Rain is
// one draw call of falling streaks moved entirely on the GPU, a wet darkening
// over the table and the floor round it (puddle patches with a faint lighter
// rim, a sheen painted in, never a reflection: nothing here is glossy, so the
// sun can't glint off it into a bloom blob), and rings rippling in the
// puddles. Visual only; rules never read it.
import * as THREE from "three";

const hasDOM = typeof document !== "undefined";

function wetTexture() {
  if (!hasDOM) return null;
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(8,7,6,0.3)"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 18 + Math.random() * 46;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(6,6,6,0.34)"); grd.addColorStop(0.8, "rgba(6,6,6,0.26)");
    grd.addColorStop(0.9, "rgba(150,140,120,0.08)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const RAIN_VERT = /* glsl */`
  attribute float aEnd;
  attribute float aSeed;
  uniform float uTime, uH, uSpeed, uLen;
  uniform vec2 uWind;
  varying float vEnd;
  void main() {
    vec3 p = position;
    float fall = uSpeed * (0.8 + 0.4 * aSeed);
    p.y = mod(p.y - uTime * fall, uH);
    p.xz += uWind * (p.y / uH);
    if (aEnd > 0.5) { p.y += uLen; p.xz += uWind * (uLen / uH); } // trail back along the slant
    vEnd = aEnd;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const RAIN_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vEnd;
  void main() { gl_FragColor = vec4(uColor, uOpacity * mix(1.0, 0.15, vEnd)); }`;

// `field` = { width, height }; `fog` = the scene's Fog (rain closes it in).
export function buildWeather(kind, field, ctx, fog) {
  if (kind !== "rain") return null;
  const g = new THREE.Group(); g.userData.weather = kind;
  const { width: w, height: h } = field, H = 32, N = 1600, pad = 14;
  // Streaks: two vertices each, the top one flagged aEnd.
  const pos = new Float32Array(N * 6), end = new Float32Array(N * 2), seed = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = -pad + Math.random() * (w + pad * 2), y = Math.random() * H, z = -pad + Math.random() * (h + pad * 2), s = Math.random();
    pos.set([x, y, z, x, y, z], i * 6); end.set([0, 1], i * 2); seed.set([s, s], i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const uni = { uTime: { value: 0 }, uH: { value: H }, uSpeed: { value: 24 }, uLen: { value: 1.1 }, uWind: { value: new THREE.Vector2(-5, 2.5) }, uColor: { value: new THREE.Color(0xa8a090) }, uOpacity: { value: 0.28 } };
  const streaks = new THREE.LineSegments(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false }));
  streaks.frustumCulled = false; g.add(streaks);
  // Wet ground: the table, then the floor round it.
  const tex = wetTexture();
  if (tex) tex.repeat.set(w / 18, h / 18);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, color: tex ? 0xffffff : 0x080706, transparent: true, opacity: tex ? 1 : 0.3, roughness: 0.9, depthWrite: false }));
  wet.rotation.x = -Math.PI / 2; wet.position.set(w / 2, 0.008, h / 2); wet.receiveShadow = true; g.add(wet);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(w / 2, -0.79, h / 2); g.add(floor);
  // Ripples: a small pool of rings, each blooming and fading, respawned.
  const ringGeo = new THREE.RingGeometry(0.85, 1, 20); ringGeo.rotateX(-Math.PI / 2);
  const ripples = Array.from({ length: 28 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xb0a898, transparent: true, opacity: 0, depthWrite: false }));
    g.add(m);
    return { m, t: Math.random() };
  });
  // Rain closes the air in a little.
  if (fog) { fog.near *= 0.8; fog.far *= 0.85; }
  ctx.anim((dt, now) => {
    uni.uTime.value = now;
    for (const r of ripples) {
      r.t += dt * 1.6;
      if (r.t >= 1) { r.t = 0; r.m.position.set(Math.random() * w, 0.02, Math.random() * h); }
      r.m.scale.setScalar(0.05 + r.t * 0.35);
      r.m.material.opacity = 0.22 * (1 - r.t);
    }
  });
  return g;
}
