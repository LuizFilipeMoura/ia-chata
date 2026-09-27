// Shared set-dressing helpers: materials, blinking lamps, steam valves,
// flames and lit windows. Used by props.js and dressing.js.
import * as THREE from "three";

export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
export const glow = (color, i = 1.5) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: i });
export const shadow = (m) => { m.castShadow = m.receiveShadow = true; return m; };
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A lamp that blinks on a period (aircraft warning, hazard beacon).
export function blinker(ctx, parent, pos, color, { period = 1.6, duty = 0.25, size = 0.16, phase = ctx.rand() * 3 } = {}) {
  const mat = glow(color, 0);
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), mat); m.position.copy(pos); parent.add(m);
  ctx.anim((dt, now) => { mat.emissiveIntensity = ((now + phase) % period) / period < duty ? 3.5 : 0.15; });
  return m;
}

// A relief valve: every few seconds, a hiss of steam from `obj`.
export function steamValve(ctx, obj, { every = 4, color = 0xd8d4cc, dir = V(0, 2.2, 0), size = 0.7 } = {}) {
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
export function flame(ctx, parent, pos, { size = 1, light = false, rate = 18 } = {}) {
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
      ctx.fx.particle(p, { tile: "flame", glow: 2, color: Math.random() < 0.5 ? 0xffb040 : 0xff5a1a, color2: 0xff2a06, size: 0.9 * size, life: 0.7, grow: 1.6,
        vel: V((Math.random() - 0.5) * 0.8, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 0.8) });
    }
  });
}

// Lit windows: a steady glow on the lit panes only (the mask matches the
// facade texture's repeat), so the facade itself never pulses.
export function flickerWindows(ctx, mat, lamp) {
  const e = ctx.win.glow.clone(); e.needsUpdate = true; e.repeat.copy(mat.map.repeat);
  mat.emissive = new THREE.Color(lamp); mat.emissiveMap = e; mat.emissiveIntensity = 0.9;
}

