// Dieselpunk set dressing with idle life: every terrain piece and backdrop
// set-piece is built here, and each registers small animators (fans, blinking
// lamps, steam valves, swaying banners, drifting airships) through ctx.anim.
// Pure visuals: footprints stay inside the terrain rect the rules measure.
//
// ctx = { theme, win, fx, anim(fn(dt, now)), rand(), chimney(obj3d, opts) }
import * as THREE from "three";

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const glow = (color, i = 1.5) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: i });
const shadow = (m) => { m.castShadow = m.receiveShadow = true; return m; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A lamp that blinks on a period (aircraft warning, hazard beacon).
function blinker(ctx, parent, pos, color, { period = 1.6, duty = 0.25, size = 0.16, phase = ctx.rand() * 3 } = {}) {
  const mat = glow(color, 0);
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), mat); m.position.copy(pos); parent.add(m);
  ctx.anim((dt, now) => { mat.emissiveIntensity = ((now + phase) % period) / period < duty ? 3.5 : 0.15; });
  return m;
}

// A relief valve: every few seconds, a hiss of steam from `obj`.
function steamValve(ctx, obj, { every = 4, color = 0xd8d4cc, dir = V(0, 2.2, 0), size = 0.7 } = {}) {
  let next = ctx.rand() * every;
  ctx.anim((dt, now) => {
    if (now < next) return;
    next = now + every * (0.6 + ctx.rand() * 0.8);
    const p = obj.getWorldPosition(V(0, 0, 0));
    for (let i = 0; i < 7; i++) {
      ctx.fx.particle(p, { color, size: size * (0.6 + ctx.rand() * 0.6), life: 1.4, grow: 3, additive: false, opacity: 0.5,
        vel: dir.clone().add(V((ctx.rand() - 0.5) * 0.8, ctx.rand() * 0.8, (ctx.rand() - 0.5) * 0.8)) });
    }
  });
}

// A flame that licks and flickers (flare stacks, burners): additive sparks plus
// a pulsing emissive core. `light` adds a real flickering point light.
function flame(ctx, parent, pos, { size = 1, light = false, rate = 18 } = {}) {
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.35 * size, 1.4 * size, 8), glow(0xff8a2a, 2.5));
  core.position.copy(pos).add(V(0, 0.6 * size, 0)); parent.add(core);
  const pl = light ? new THREE.PointLight(0xff8a3a, 20, 30) : null;
  if (pl) { pl.position.copy(core.position); parent.add(pl); }
  ctx.anim((dt, now) => {
    const f = 0.8 + 0.25 * Math.sin(now * 17 + pos.x) + 0.15 * Math.sin(now * 31);
    core.scale.set(1, f, 1);
    if (pl) pl.intensity = 16 + 10 * f;
    if (Math.random() < dt * rate) {
      const p = core.getWorldPosition(V(0, 0, 0)).add(V(0, 0.5 * size, 0));
      ctx.fx.particle(p, { color: Math.random() < 0.5 ? 0xffb040 : 0xff5a1a, size: 0.9 * size, life: 0.7, grow: 1.6,
        vel: V((Math.random() - 0.5) * 0.8, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 0.8) });
    }
  });
}

// Windows that live: the lit panes flicker as if someone's working late.
function flickerWindows(ctx, mat, lamp) {
  mat.emissive = new THREE.Color(lamp); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.6;
  const phase = ctx.rand() * 10;
  ctx.anim((dt, now) => { mat.emissiveIntensity = 0.55 + 0.2 * Math.sin(now * 1.3 + phase) + (Math.sin(now * 23 + phase) > 0.97 ? -0.4 : 0); });
}

// ---- Buildings (fill the terrain rect t.w × t.h, centred) -----------------

function factory(t, ctx) {
  const g = new THREE.Group();
  const hgt = 4 + ((t.w * 7 + t.h * 3) % 3);
  const tex = ctx.win.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, t.w / 3), Math.max(1, hgt / 3));
  const m = std(0xffffff, { map: tex });
  flickerWindows(ctx, m, ctx.theme.lamp);
  const b = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w, hgt, t.h), m)); b.position.y = hgt / 2; g.add(b);
  const roof = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.3, 0.3, t.h + 0.3), std(0x3a3a3f))); roof.position.y = hgt + 0.15; g.add(roof);
  const tank = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12), std(0x7a5a3a, { metalness: 0.5 })));
  tank.position.set(t.w * 0.25, hgt + 0.9, 0); g.add(tank);
  const valve = new THREE.Object3D(); valve.position.set(t.w * 0.25, hgt + 1.6, 0); g.add(valve);
  steamValve(ctx, valve, { every: 5 });
  // Smokestack (belches smoke) with a warning lamp on the lip.
  const stackH = 3 + (t.w % 2);
  const stack = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, stackH, 10), std(0x6b3a26, { roughness: 0.9 })));
  stack.position.set(-t.w * 0.28, hgt + stackH / 2, -t.h * 0.2); g.add(stack);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10), std(0x1a1512)); band.position.set(stack.position.x, hgt + stackH - 0.2, stack.position.z); g.add(band);
  const mouth = new THREE.Object3D(); mouth.position.set(stack.position.x, hgt + stackH + 0.2, stack.position.z); g.add(mouth);
  ctx.chimney(mouth);
  blinker(ctx, g, V(stack.position.x + 0.4, hgt + stackH - 0.1, stack.position.z), 0xff3322);
  // A roof ventilation fan, always turning.
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.35, 16, 1, true), std(0x2a2a2e, { side: THREE.DoubleSide, metalness: 0.6 }));
  housing.position.set(t.w * -0.02, hgt + 0.45, t.h * 0.22); g.add(housing);
  const rotor = new THREE.Group(); rotor.position.copy(housing.position);
  for (let i = 0; i < 4; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.28), std(0x8a8478, { metalness: 0.7 })); blade.rotation.y = (i * Math.PI) / 4; rotor.add(blade); }
  g.add(rotor);
  const spin = 2 + ctx.rand() * 2;
  ctx.anim((dt) => { rotor.rotation.y += dt * spin; });
  return g;
}

function tank(t, ctx) {
  const g = new THREE.Group();
  const n = t.w / t.h >= 1.6 ? 2 : 1;
  const r = Math.min(t.h / 2, t.w / (2 * n)) * 0.9;
  const skin = std(0xa89a82, { metalness: 0.45, roughness: 0.55 });
  const tops = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i === 0 ? -1 : 1) * t.w / 4;
    const hgt = 3.2 + ((i + t.w) % 2) * 1.2;
    const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, 20), skin)); body.position.set(x, hgt / 2, 0); g.add(body);
    const dome = shadow(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin)); dome.position.set(x, hgt, 0); g.add(dome);
    for (const y of [0.8, hgt - 0.6]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.06, 6, 24), std(0x3a2e24)); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, 0); g.add(ring); }
    // Hazard band and a pulsing pressure gauge.
    const hz = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.35, 20, 1, true), std(0xd8a21c)); hz.position.set(x, hgt * 0.45, 0); g.add(hz);
    const gaugeMat = glow(0x6aff9a, 1);
    const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), gaugeMat); gauge.position.set(x, hgt * 0.6, r + 0.02); g.add(gauge);
    const ph = ctx.rand() * 5;
    ctx.anim((dt, now) => { gaugeMat.emissiveIntensity = 0.6 + 0.8 * Math.max(0, Math.sin(now * 2.2 + ph)); });
    const valve = new THREE.Object3D(); valve.position.set(x, hgt + r * 0.9, 0); g.add(valve); tops.push(valve);
    steamValve(ctx, valve, { every: 3.5 + i });
  }
  if (n === 2) {
    const pipe = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, t.w / 2, 8), std(0x5a4636, { metalness: 0.5 })));
    pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 1.4, 0); g.add(pipe);
  }
  // A little flare pipe on the corner, always burning.
  const fp = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 6), std(0x2f2a26)));
  fp.position.set(t.w / 2 - 0.25, 1.6, t.h / 2 - 0.25); g.add(fp);
  flame(ctx, g, V(t.w / 2 - 0.25, 3.2, t.h / 2 - 0.25), { size: 0.6, rate: 10 });
  return g;
}

function watertower(t, ctx) {
  const g = new THREE.Group();
  const baseH = 2.2;
  const tex = ctx.win.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, t.w / 3), 1);
  const bm = std(0xffffff, { map: tex }); flickerWindows(ctx, bm, ctx.theme.lamp);
  const base = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w, baseH, t.h), bm)); base.position.y = baseH / 2; g.add(base);
  const r = Math.min(t.w, t.h) * 0.36, legTop = baseH + 3.2;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const leg = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, legTop - baseH, 6), std(0x2e2a26, { metalness: 0.6 })));
    leg.position.set(sx * r * 0.7, (baseH + legTop) / 2, sz * r * 0.7); g.add(leg);
  }
  const tk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2.2, 18), std(0x6a4a30, { roughness: 0.7 }))); tk.position.y = legTop + 1.1; g.add(tk);
  const cap = shadow(new THREE.Mesh(new THREE.ConeGeometry(r * 1.08, 1, 18), std(0x3a3a3f))); cap.position.y = legTop + 2.7; g.add(cap);
  blinker(ctx, g, V(0, legTop + 3.3, 0), 0xff3322, { period: 2 });
  // A wind pump beside it, turning in the smog.
  const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3, 6), std(0x2e2a26))); pole.position.set(-t.w / 2 + 0.4, baseH + 1.5, t.h / 2 - 0.4); g.add(pole);
  const rotor = new THREE.Group(); rotor.position.set(pole.position.x, baseH + 3, pole.position.z + 0.15);
  for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.03), std(0x9a8a6a)); b.position.y = 0.45; const arm = new THREE.Group(); arm.rotation.z = (i * Math.PI) / 4; arm.add(b); rotor.add(arm); }
  g.add(rotor);
  ctx.anim((dt, now) => { rotor.rotation.z += dt * (1.4 + 0.6 * Math.sin(now * 0.3)); });
  return g;
}

function shed(t, ctx) {
  const g = new THREE.Group();
  const wallH = 2.6;
  const tex = ctx.win.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, t.w / 3), 1);
  const wm = std(0xffffff, { map: tex }); flickerWindows(ctx, wm, ctx.theme.lamp);
  const walls = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w, wallH, t.h), wm)); walls.position.y = wallH / 2; g.add(walls);
  // Arched corrugated roof along the long axis.
  // A half cylinder (theta 0..PI is its +x half) laid along x, curve up.
  const roofGeo = new THREE.CylinderGeometry(t.h / 2, t.h / 2, t.w, 20, 1, false, 0, Math.PI);
  roofGeo.rotateZ(Math.PI / 2);
  const roof = shadow(new THREE.Mesh(roofGeo, std(0x5a3a2a, { metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide })));
  roof.position.y = wallH; g.add(roof);
  // Glowing engine-house door, a furnace breathing inside.
  const doorMat = glow(0xff8a3a, 1.2);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.2, t.w * 0.4), 2), doorMat); door.position.set(0, 1, t.h / 2 + 0.01); g.add(door);
  const ph = ctx.rand() * 5;
  ctx.anim((dt, now) => { doorMat.emissiveIntensity = 1 + 0.5 * Math.sin(now * 3 + ph) + 0.3 * Math.sin(now * 11); });
  // Roof vents puffing locomotive steam.
  for (const s of [-0.3, 0.25]) {
    const vent = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8), std(0x2a2522))); vent.position.set(t.w * s, wallH + t.h / 2 + 0.2, 0); g.add(vent);
    const mouth = new THREE.Object3D(); mouth.position.set(t.w * s, wallH + t.h / 2 + 0.7, 0); g.add(mouth);
    steamValve(ctx, mouth, { every: 2.5, color: 0xeeeeea, dir: V(0.3, 2.6, 0), size: 0.9 });
  }
  return g;
}

function cooling(t, ctx) {
  const g = new THREE.Group();
  const R = Math.min(t.w, t.h) / 2 * 0.95, H = 5.5 + (t.w % 2);
  const prof = [];
  for (let i = 0; i <= 12; i++) { const y = (i / 12) * H; const k = (y / H - 0.62); prof.push(new THREE.Vector2(R * (0.62 + 1.1 * k * k), y)); }
  const shell = shadow(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), std(0x8a847a, { side: THREE.DoubleSide, roughness: 0.95 }))); g.add(shell);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(prof[11].x + 0.02, prof[12].x + 0.02, H / 12, 28, 1, true), std(0xa8321e)); stripe.position.y = H - H / 24; g.add(stripe);
  blinker(ctx, g, V(prof[12].x, H + 0.1, 0), 0xff3322, { period: 1.8 });
  const mouth = new THREE.Object3D(); mouth.position.y = H; g.add(mouth);
  ctx.anim((dt) => {
    if (Math.random() > dt * 8) return;
    const p = mouth.getWorldPosition(V(0, 0, 0)).add(V((Math.random() - 0.5) * R, 0, (Math.random() - 0.5) * R));
    ctx.fx.particle(p, { color: 0xe8e4dc, size: 1.6, life: 5, grow: 4, additive: false, opacity: 0.45, vel: V(0.5, 1.6 + Math.random(), 0.2) });
  });
  return g;
}

function mast(t, ctx) {
  const g = new THREE.Group();
  const base = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w, 1.6, t.h), std(0x4a4036, { metalness: 0.3 }))); base.position.y = 0.8; g.add(base);
  const H = 7.5;
  const m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, H, 8), std(0x3a342c, { metalness: 0.7, roughness: 0.4 }))); m.position.y = 1.6 + H / 2; g.add(m);
  for (let y = 2.4; y < H + 1.6; y += 1.3) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 16), std(0xc9a14a, { metalness: 0.9, roughness: 0.3 })); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); }
  // Rotating beacon on the masthead.
  const head = new THREE.Group(); head.position.y = H + 1.8; g.add(head);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.25), glow(ctx.theme.lamp, 3)); lamp.position.x = 0.2; head.add(lamp);
  ctx.anim((dt) => { head.rotation.y += dt * 2.5; });
  // A small tethered blimp bobbing at the mast.
  const blimp = new THREE.Group();
  const env = shadow(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), std(0xb8a888, { roughness: 0.6 }))); env.scale.set(2.2, 0.8, 0.8); blimp.add(env);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.05), std(ctx.theme.banner)); fin.position.x = -2; blimp.add(fin);
  blimp.position.set(1.6, H + 1.2, 0); g.add(blimp);
  const ph = ctx.rand() * 6;
  ctx.anim((dt, now) => { blimp.position.y = H + 1.2 + Math.sin(now * 0.7 + ph) * 0.25; blimp.rotation.y = Math.sin(now * 0.25 + ph) * 0.3; blimp.rotation.z = Math.sin(now * 0.9 + ph) * 0.05; });
  return g;
}

const BUILDINGS = { factory, tank, watertower, shed, cooling, mast };

export function buildingProp(t, ctx) {
  const list = ctx.theme.buildings;
  const pick = list[Math.floor(((t.x * 13 + t.y * 7) % list.length + list.length) % list.length)];
  return (BUILDINGS[pick] || factory)(t, ctx);
}

// ---- Small terrain ---------------------------------------------------------

export function barricadeProp(t, ctx) {
  const g = new THREE.Group();
  const wall = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w, 1.1, t.h), std(0x8b8578, { roughness: 0.9 }))); wall.position.y = 0.55; g.add(wall);
  for (let x = -t.w / 2 + 0.5; x < t.w / 2; x += 1.2) {
    const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.15), std(0x4d3b28))); post.position.set(x, 0.75, t.h / 2 + 0.1); g.add(post);
  }
  // A tattered banner on a pole, flapping.
  const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), std(0x2e2a26))); pole.position.set(t.w / 2 - 0.3, 1.5, 0); g.add(pole);
  const pivot = new THREE.Group(); pivot.position.set(t.w / 2 - 0.3, 2.55, 0); g.add(pivot);
  const flagGeo = new THREE.PlaneGeometry(1.4, 0.8, 8, 1); flagGeo.translate(0.7, 0, 0);
  const flag = new THREE.Mesh(flagGeo, std(ctx.theme.banner, { side: THREE.DoubleSide, roughness: 1 })); flag.castShadow = true; pivot.add(flag);
  const base = flagGeo.attributes.position.array.slice();
  const ph = ctx.rand() * 6;
  ctx.anim((dt, now) => {
    pivot.rotation.y = Math.sin(now * 0.9 + ph) * 0.45;
    const p = flagGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.array[i * 3 + 2] = Math.sin(now * 5 + x * 3 + ph) * 0.12 * x; }
    p.needsUpdate = true;
  });
  // A hanging work lamp on the other end, swinging on its hook.
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.7), std(0x2e2a26)); arm.position.set(-t.w / 2 + 0.3, 1.5, 0.3); g.add(arm);
  const swing = new THREE.Group(); swing.position.set(-t.w / 2 + 0.3, 1.5, 0.62); g.add(swing);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.45, 4), std(0x111111)); wire.position.y = -0.22; swing.add(wire);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glow(ctx.theme.lamp, 2.5)); bulb.position.y = -0.5; swing.add(bulb);
  ctx.anim((dt, now) => { swing.rotation.x = Math.sin(now * 2.1 + ph) * 0.35; swing.rotation.z = Math.sin(now * 1.3 + ph) * 0.15; });
  return g;
}

export function crateProp(t, ctx) {
  const g = new THREE.Group();
  const s = Math.min(t.w, t.h) * 0.8;
  const c = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w, s, t.h), std(0x8a6a3c, { roughness: 0.8 }))); c.position.y = s / 2; g.add(c);
  const band = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.02, 0.12, t.h + 0.02), std(0x3a3a3a, { metalness: 0.6 })); band.position.y = s / 2; g.add(band);
  // A stenciled hazard lamp that blinks, and sometimes a smaller crate on top.
  if (t.w > 1.9) {
    const top = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w * 0.5, s * 0.5, t.h * 0.5), std(0x6a5030))); top.position.set(t.w * 0.18, s + s * 0.25, -t.h * 0.1); top.rotation.y = 0.4; g.add(top);
  }
  blinker(ctx, g, V(-t.w * 0.3, s + 0.12, t.h * 0.3), 0xffa020, { period: 1.1, duty: 0.5, size: 0.11 });
  return g;
}

export function rubbleProp(t, ctx) {
  const g = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(1, 0); geo.scale(t.w / 2, Math.min(t.w, t.h) * 0.45, t.h / 2);
  const r = shadow(new THREE.Mesh(geo, std(0x6f6a62, { roughness: 1, flatShading: true }))); r.position.y = Math.min(t.w, t.h) * 0.3; g.add(r);
  // Still smouldering: a wisp now and then (embers in the Ashfields).
  const top = new THREE.Object3D(); top.position.y = Math.min(t.w, t.h) * 0.7; g.add(top);
  const hot = ctx.theme.ambient === "embers";
  ctx.anim((dt) => {
    if (Math.random() > dt * (hot ? 3 : 1.2)) return;
    const p = top.getWorldPosition(V(0, 0, 0));
    ctx.fx.particle(p, hot
      ? { color: 0xff6a1a, size: 0.25, life: 1.5, vel: V((Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4) }
      : { color: 0x2a2420, size: 0.6, life: 2.5, grow: 3, additive: false, opacity: 0.35, vel: V(0.2, 0.9, 0.1) });
  });
  return g;
}

// ---- Beyond the table ------------------------------------------------------

// `c` = table centre, `R` = a radius comfortably outside the table.
export function backdrop(kind, i, c, R, ctx) {
  const g = new THREE.Group();
  const ang = ctx.rand() * Math.PI * 2;
  const at = (a, r) => V(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
  if (kind === "skyline") {
    const dark = std(0x16130f, { roughness: 1 });
    for (let k = 0; k < 9; k++) {
      const a = ang + (k / 9) * Math.PI * 2 + ctx.rand() * 0.3, r = R + ctx.rand() * 30;
      const h = 18 + ctx.rand() * 30, w = 9 + ctx.rand() * 12;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), dark); b.position.copy(at(a, r)).setY(h / 2 - 1); b.lookAt(c.x, h / 2, c.z); g.add(b);
      const top = V(b.position.x, h - 1, b.position.z);
      if (k % 2 === 0) {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 16, 8), dark); st.position.copy(top).add(V(2, 8, 0)); g.add(st);
        const mouth = new THREE.Object3D(); mouth.position.copy(top).add(V(2, 16.6, 0)); g.add(mouth);
        ctx.chimney(mouth, { big: true });
        blinker(ctx, g, top.clone().add(V(2, 16.2, 1.4)), 0xff2a1a, { period: 2.2, size: 0.9 });
      } else blinker(ctx, g, top.clone().add(V(0, 0.8, 0)), 0xff2a1a, { period: 2.6, size: 0.8 });
    }
  } else if (kind === "zeppelin") {
    const ship = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), std(0x9a8a6e, { roughness: 0.55, metalness: 0.2 })); env.scale.set(9, 2.3, 2.3); ship.add(env);
    for (let k = -3; k <= 3; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(2.32 * Math.sqrt(1 - (k / 3.6) ** 2), 0.05, 4, 20), std(0x3a2e24)); rib.rotation.y = Math.PI / 2; rib.position.x = k * 2.2; ship.add(rib); }
    const gond = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 1), std(0x4a3a2a)); gond.position.y = -2.6; ship.add(gond);
    const glowWin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 1.02), glow(ctx.theme.lamp, 1.5)); glowWin.position.y = -2.55; ship.add(glowWin);
    for (const [y, z, rx] of [[1.6, 0, 0], [-1.6, 0, 0], [0, 1.6, Math.PI / 2], [0, -1.6, Math.PI / 2]]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 0.08), std(ctx.theme.banner)); fin.position.set(-8, y, z); fin.rotation.x = rx; ship.add(fin); }
    const props = [];
    for (const z of [-1.2, 1.2]) { const p = new THREE.Group(); p.position.set(-1.8, -2.5, z); for (let b = 0; b < 3; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.12), std(0x2a2a2a)); bl.rotation.x = (b * Math.PI * 2) / 3; p.add(bl); } ship.add(p); props.push(p); }
    blinker(ctx, ship, V(9, 0, 0), 0x40ff70, { period: 1.4, size: 0.3 });
    blinker(ctx, ship, V(-9, 0.4, 0), 0xff3030, { period: 1.4, size: 0.3, phase: 0.7 });
    ship.scale.setScalar(1.8);
    g.add(ship);
    const r = R * (0.75 + ctx.rand() * 0.35), hgt = 48 + ctx.rand() * 20, speed = (0.012 + ctx.rand() * 0.01) * (i % 2 ? -1 : 1), a0 = ang;
    ctx.anim((dt, now) => {
      const a = a0 + now * speed;
      ship.position.set(c.x + Math.cos(a) * r, hgt + Math.sin(now * 0.3 + a0) * 0.8, c.z + Math.sin(a) * r);
      ship.rotation.y = -a + (speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      ship.rotation.z = Math.sin(now * 0.4 + a0) * 0.03;
      for (const p of props) p.rotation.x += dt * 14;
    });
  } else if (kind === "crane") {
    const iron = std(0x5a3a22, { metalness: 0.5, roughness: 0.6 });
    // Built at the origin, then placed and scaled up: it stands far off.
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 22, 1.2), iron); tower.position.y = 11; g.add(tower);
    const head = new THREE.Group(); head.position.y = 22; g.add(head);
    g.position.copy(at(ang, R)); g.scale.setScalar(2);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(18, 0.8, 0.8), iron); jib.position.x = 6; head.add(jib);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.6), std(0x2a2a2a)); counter.position.x = -3; head.add(counter);
    const hookPivot = new THREE.Group(); hookPivot.position.x = 13; head.add(hookPivot);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 9, 4), std(0x111111)); cable.position.y = -4.5; hookPivot.add(cable);
    const load = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.2), std(0x7a5a3a)); load.position.y = -9.4; hookPivot.add(load);
    blinker(ctx, head, V(15, 0.6, 0), 0xff3322, { period: 1.5, size: 0.3 });
    const ph = ctx.rand() * 6;
    ctx.anim((dt, now) => { head.rotation.y = ph + Math.sin(now * 0.07 + ph) * 1.4; hookPivot.rotation.z = Math.sin(now * 0.9) * 0.06; hookPivot.rotation.x = Math.sin(now * 0.7) * 0.05; });
  } else if (kind === "flares") {
    for (let k = 0; k < 2; k++) {
      const p = at(ang + k * 0.2, R + k * 10);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 34, 8), std(0x2a2622)); stack.position.copy(p).setY(17); g.add(stack);
      flame(ctx, g, p.clone().setY(34), { size: 5, light: k === 0, rate: 30 });
    }
  } else if (kind === "cooling") {
    const concrete = std(0x5a544c, { roughness: 1, side: THREE.DoubleSide });
    for (let k = 0; k < 3; k++) {
      const p = at(ang + k * 0.22, R + 10 + k * 8), Rr = 12 + ctx.rand() * 4, H = 42 + ctx.rand() * 10;
      const prof = []; for (let s = 0; s <= 12; s++) { const y = (s / 12) * H, kk = y / H - 0.62; prof.push(new THREE.Vector2(Rr * (0.62 + 1.1 * kk * kk), y)); }
      const tw = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), concrete); tw.position.copy(p).setY(-1); g.add(tw);
      const mouth = new THREE.Object3D(); mouth.position.copy(p).setY(H - 1); g.add(mouth);
      ctx.anim((dt) => {
        if (Math.random() > dt * 6) return;
        const q = mouth.getWorldPosition(V(0, 0, 0)).add(V((Math.random() - 0.5) * Rr, 0, (Math.random() - 0.5) * Rr));
        ctx.fx.particle(q, { color: 0xd8d0c4, size: 9, life: 8, grow: 3, additive: false, opacity: 0.35, vel: V(1.5, 3.2, 0.4) });
      });
    }
  }
  return g;
}
