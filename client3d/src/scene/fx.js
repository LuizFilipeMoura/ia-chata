// Battle effects: GPU particles (particles.js: sparks, flame, smoke, embers,
// flashes), physical debris and casings (debris.js), lasting scorch marks
// (decals.js), flying projectiles with per-weapon trails, beams, floating
// text, camera shake, and persistent emitters (burning wrecks). Everything is
// fire-and-forget; update(dt) ticks it.
import * as THREE from "three";
import { ParticleSystem } from "./particles.js";
import { Debris } from "./debris.js";
import { Decals } from "./decals.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
// A random unit vector, optionally biased upward (bias 0..1).
function randDir(up = 0) {
  const v = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
  v.y += up; return v.lengthSq() > 1e-6 ? v.normalize() : V(0, 1, 0);
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.ps = new ParticleSystem(scene);
    this.debris = new Debris(scene, (p, hot) => this.cooling(p, hot));
    this.decals = new Decals(scene);
    this.projectiles = [];
    this.beams = [];
    this.texts = [];
    this.shake = 0;
    this.lights = [];
    this.ephemerals = []; // timed meshes (rings, shells, reticles, tethers), each with its own step(k)
    this.emitters = new Set(); // persistent: step(dt, t) until stopped (burning wrecks)
  }

  // A timed scene object: step(k, obj) runs every frame with k = 0..1, then it's removed.
  timed(obj, dur, step) {
    this.scene.add(obj);
    this.ephemerals.push({ obj, t: 0, dur, step });
    return obj;
  }

  // One particle. Options: color, color2 (end colour), size, grow, life, vel,
  // grav, drag, additive, opacity, glow (HDR: > 1 blooms), tile (soft | smoke |
  // spark | ember | flame | star | flake | ring), stretch, spin, turb, floor, delay.
  particle(pos, opts = {}) { this.ps.spawn(pos, opts); }

  burst(pos, n, opts = {}) {
    const spread = opts.spread ?? 3;
    for (let i = 0; i < n; i++) {
      const v = V((Math.random() - 0.5) * spread, Math.random() * spread * (opts.up ?? 0.8), (Math.random() - 0.5) * spread);
      this.particle(pos, { ...opts, vel: v, size: (opts.size ?? 0.4) * (0.6 + Math.random() * 0.8), life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8) });
    }
  }

  flash(pos, color = 0xffcc66, intensity = 30, dist = 10) {
    const l = new THREE.PointLight(color, intensity, dist);
    l.position.copy(pos); this.scene.add(l);
    this.lights.push({ l, life: 0.15, max: 0.15, intensity });
  }

  // A brief star-shaped glare (muzzles, impacts, blasts).
  glare(pos, size = 1, color = 0xfff0c0, life = 0.08) {
    this.particle(pos, { tile: "star", color, size, life, glow: 3, rot: Math.random() * Math.PI });
    this.particle(pos, { color, size: size * 1.3, life: life * 1.4, glow: 1.3, opacity: 0.4 });
  }

  // dir (optional): the barrel's direction, so the flame tongue and smoke follow it.
  muzzle(pos, color = 0xffcc55, dir = null) {
    this.glare(pos, 0.9, color === 0xffcc55 ? 0xfff0c0 : color, 0.07);
    if (dir) {
      for (let i = 0; i < 5; i++) {
        this.particle(pos, { tile: "flame", color: 0xfff0b0, color2: color === 0xffcc55 ? 0xff6010 : color, glow: 2.4, size: rnd(0.25, 0.45), life: rnd(0.06, 0.12), vel: dir.clone().multiplyScalar(rnd(5, 11)).add(randDir().multiplyScalar(1.2)), drag: 10, stretch: 0.05 });
      }
      for (let i = 0; i < 3; i++) {
        this.particle(pos, { additive: false, color: 0x9a948a, color2: 0x6a665e, opacity: 0.4, size: 0.35, grow: 3.5, life: rnd(0.8, 1.4), vel: dir.clone().multiplyScalar(rnd(1, 2.5)).add(V(0, 0.5, 0)), drag: 2.5, turb: 0.6 });
      }
    } else this.burst(pos, 6, { color, size: 0.7, life: 0.12, spread: 1.5, glow: 2 });
    this.flash(pos, color, 25, 8);
  }

  smoke(pos, n = 4, dark = false) {
    for (let i = 0; i < n; i++) {
      this.particle(pos.clone().add(V((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5)), {
        color: dark ? 0x3a3632 : 0x8a8680, color2: dark ? 0x625d56 : 0xa8a49c, size: 0.8, life: 1.6 + Math.random(), vel: V((Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4),
        grow: 3, additive: false, opacity: dark ? 0.75 : 0.55, turb: 0.8,
      });
    }
  }

  steam(pos) {
    this.particle(pos, { color: 0xeeeeee, size: 0.4, life: 1.0, vel: V((Math.random() - 0.5) * 0.3, 2, (Math.random() - 0.5) * 0.3), grow: 3.5, additive: false, opacity: 0.4, turb: 1 });
  }

  // Streaking sparks that arc, bounce off the table and cool from white-hot to red.
  // opts: speed, dir (Vector3 bias), up.
  sparks(pos, n = 12, color = 0xffdd88, { speed = 7, dir = null, up = 0.6 } = {}) {
    const color2 = color === 0xffdd88 ? 0xff4a10 : color;
    for (let i = 0; i < n; i++) {
      const v = randDir(up).multiplyScalar(speed * rnd(0.35, 1));
      if (dir) v.addScaledVector(dir, speed * rnd(0.3, 0.9));
      this.particle(pos, { tile: "spark", color, color2, glow: 2.6, size: rnd(0.22, 0.34), life: rnd(0.3, 0.7), vel: v, grav: -16, drag: 1, stretch: 0.045, floor: true });
    }
    for (let i = 0; i < Math.ceil(n / 4); i++) {
      this.particle(pos, { tile: "ember", color, color2, glow: 3, size: 0.12, life: rnd(0.5, 1), vel: randDir(up).multiplyScalar(speed * 0.4), grav: -8, drag: 1.2, floor: true });
    }
  }

  // Lingering embers drifting up and wandering (after blasts, over fires).
  embers(pos, n = 10, spread = 3) {
    for (let i = 0; i < n; i++) {
      this.particle(pos, { tile: "ember", color: 0xffb050, color2: 0xff2a08, glow: 3, size: rnd(0.08, 0.16), life: rnd(1.4, 3), vel: randDir(0.8).multiplyScalar(spread).add(V(0, 1.5, 0)), grav: -1, drag: 1.4, turb: 3 });
    }
  }

  // A hot piece of debris cooling: an ember trail, then a smoke thread.
  cooling(p, hot) {
    if (hot > 0.35) this.particle(p, { tile: "ember", color: 0xffa040, color2: 0xff3010, glow: 3, size: 0.14, life: 0.5, vel: V(0, 1, 0), turb: 2 });
    if (Math.random() < 0.5) this.particle(p, { additive: false, color: 0x3a3632, color2: 0x625d56, opacity: 0.4 * hot + 0.15, size: 0.25, grow: 4, life: 1.4, vel: V(0.2, 1.2, 0), turb: 0.8 });
  }

  // A shot that wounds: a directional spark spray off the plating, a glare,
  // painted plates and chunks torn off, a smoke puff; big hits catch fire.
  // from: shooter position (spray kicks back toward it). color: target paint.
  impact(pos, sp, { from = null, color = 0x3a3632 } = {}) {
    const back = from ? from.clone().sub(pos).normalize() : V(0, 0.5, 0);
    this.glare(pos, 0.9 + sp * 0.12, 0xfff2c8, 0.09);
    this.sparks(pos, 10 + sp * 3, 0xffdd88, { speed: 7 + sp * 0.5, dir: back, up: 0.5 });
    this.flash(pos, 0xffaa44, 20 + sp * 8, 8);
    this.debris.burst(pos, Math.min(7, 1 + Math.floor(sp / 1.5)), { color, speed: 3, up: 4, scale: 0.18 + sp * 0.015, dir: back, hot: sp >= 4 ? 1.2 : 0, linger: 7 });
    for (let i = 0; i < 2 + Math.floor(sp / 3); i++) {
      this.particle(pos, { additive: false, color: 0x3a3632, color2: 0x6a665e, opacity: 0.6, size: 0.5, grow: 3, life: rnd(1, 1.8), vel: back.clone().multiplyScalar(rnd(0.6, 1.5)).add(V(0, 0.8, 0)), drag: 1.5, turb: 0.8 });
    }
    if (sp >= 5) this.fireball(pos, 0.6, 4);
  }

  // A shot that struck plating and didn't wound: a glancing spray and a chip.
  ricochet(pos, from = null) {
    const back = from ? from.clone().sub(pos).normalize() : V(0, 0.5, 0);
    const glance = V(-back.z, 0.4, back.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1).add(back.multiplyScalar(0.4)).normalize();
    this.particle(pos, { tile: "star", color: 0xe0e8ff, size: 0.6, life: 0.06, glow: 2.5 });
    this.sparks(pos, 7, 0xfff4d0, { speed: 9, dir: glance, up: 0.2 });
    this.debris.spawn("chunk", pos, glance.clone().multiplyScalar(4).add(V(0, 3, 0)), { color: 0x7a746c, scale: 0.08, linger: 3 });
  }

  // A rolling ball of flame: flame puffs pushed out and slowed by drag.
  fireball(pos, scale = 1, n = 10) {
    for (let i = 0; i < n; i++) {
      this.particle(pos.clone().add(randDir().multiplyScalar(0.3 * scale)), {
        tile: "flame", color: Math.random() < 0.4 ? 0xffd890 : 0xff9a38, color2: 0xa01800, glow: 1.7, size: rnd(0.7, 1.2) * scale, grow: 2, life: rnd(0.4, 0.8), opacity: 0.85,
        vel: randDir(0.4).multiplyScalar(rnd(1.5, 4.5) * scale), drag: 3.5,
      });
    }
  }

  explosion(pos, big = false) {
    const k = big ? 2 : 1;
    this.glare(pos, 1.6 * k, 0xfff2c0, 0.12);
    this.fireball(pos, big ? 1.5 : 1, big ? 16 : 10);
    this.sparks(pos, 18 * k, 0xffdd88, { speed: 9 * k, up: 0.7 });
    for (let i = 0; i < 8 * k; i++) {
      this.particle(pos.clone().add(randDir().multiplyScalar(0.5 * k)), {
        additive: false, color: 0x55504a, color2: 0x8e887e, opacity: 0.7, size: 1.1 * k, grow: 3, life: rnd(2.2, 3.8),
        vel: randDir(0.6).multiplyScalar(1.5 * k).add(V(0.3, 1.4, 0)), drag: 1.2, delay: rnd(0.06, 0.22), turb: 0.6,
      });
    }
    this.embers(pos, 10 * k, 3 * k);
    if (pos.y < 3) {
      const ground = pos.clone().setY(0.1);
      this.shockwave(ground, 2.2 * k, 0xffa050, 0.45, 0);
      this.decals.add(ground, 1.1 * k, "scorch", { hot: true });
    }
    this.debris.burst(pos, 3 * k, { speed: 4 * k, up: 5, scale: 0.2, hot: 1.2 });
    this.flash(pos, 0xff7722, 120 * k, 25);
    this.shake = Math.max(this.shake, big ? 1.2 : 0.5);
  }

  // A rig going up: the big blast, its plating flung across the table, a
  // couple of secondary cook-offs, and a wide scorch under the wreck.
  deathBlast(pos, color = 0x3a3632) {
    this.explosion(pos, true);
    this.debris.burst(pos, 12, { color, speed: 6, up: 8, scale: 0.35, hot: 2, linger: 12 });
    this.decals.add(pos.clone().setY(0), 3, "scorch", { hot: true });
    for (const [ms, dx, dz] of [[260, 0.7, -0.4], [620, -0.5, 0.6]]) {
      setTimeout(() => {
        const p = pos.clone().add(V(dx, -0.4, dz));
        this.fireball(p, 0.7, 6); this.sparks(p, 14); this.glare(p, 1.6); this.flash(p, 0xff7722, 60, 12);
        this.shake = Math.max(this.shake, 0.4);
      }, ms);
    }
  }

  // A burning wreck: flame tongues, embers, a black smoke column and a
  // flickering glow. Fierce at first, then burns low. Returns { stop() }.
  wreckFire(getPos, scale = 1) {
    const light = new THREE.PointLight(0xff7a2a, 0, 9 * scale);
    this.scene.add(light);
    const acc = { f: 0, t: 0, e: 0, s: 0 };
    return this.emitter((dt, t) => {
      const at = getPos();
      const fierce = t < 14 ? 1 : 0.45;
      light.position.copy(at).add(V(0, 1.4, 0));
      light.intensity = (10 + 8 * fierce) * scale * (0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7.3) + Math.random() * 0.2);
      acc.f += dt * 20 * fierce * scale; acc.t += dt * 9 * fierce * scale; acc.e += dt * 5 * fierce; acc.s += dt * (4 + 3 * fierce);
      // The body of the fire: tumbling puffs that shrink as they rise.
      for (; acc.f >= 1; acc.f--) {
        this.particle(at.clone().add(V(rnd(-0.7, 0.7) * scale, rnd(0.2, 0.8), rnd(-0.7, 0.7) * scale)), {
          tile: "flame", color: Math.random() < 0.3 ? 0xffc060 : 0xff7a20, color2: 0x901400, glow: 1.6, opacity: 0.9, size: rnd(0.5, 0.85) * scale, grow: 0.45, life: rnd(0.5, 0.9), vel: V(0, rnd(1, 2), 0), spin: rnd(-2, 2), turb: 2,
        });
      }
      // Tongues licking up out of it.
      for (; acc.t >= 1; acc.t--) {
        this.particle(at.clone().add(V(rnd(-0.5, 0.5) * scale, rnd(0.6, 1.1), rnd(-0.5, 0.5) * scale)), {
          tile: "flame", color: 0xffe0a0, color2: 0xff4a10, glow: 1.9, size: rnd(0.3, 0.45) * scale, grow: 0.5, life: rnd(0.3, 0.5), vel: V(rnd(-0.4, 0.4), rnd(2.5, 3.5), rnd(-0.4, 0.4)), stretch: 0.2, turb: 3,
        });
      }
      for (; acc.e >= 1; acc.e--) this.particle(at.clone().add(V(0, 1.2, 0)), { tile: "ember", color: 0xffb050, color2: 0xff2a08, glow: 3, size: 0.12, life: rnd(1.5, 2.6), vel: V(rnd(-0.6, 0.6), rnd(2, 4), rnd(-0.6, 0.6)), drag: 0.6, turb: 4 });
      for (; acc.s >= 1; acc.s--) {
        this.particle(at.clone().add(V(rnd(-0.4, 0.4), 1.8, rnd(-0.4, 0.4))), {
          additive: false, color: 0x4a4540, color2: 0x8a847c, opacity: 0.6, size: 0.9 * scale, grow: 4, life: rnd(3, 4.5), vel: V(0.5, rnd(1.4, 2), 0.15), turb: 1,
        });
      }
    }, () => this.scene.remove(light));
  }

  // A persistent effect: step(dt, t) every frame until stop(). onStop cleans up.
  emitter(step, onStop = null) {
    const e = { step, t: 0, onStop };
    e.stop = () => { if (this.emitters.delete(e)) onStop?.(); };
    this.emitters.add(e);
    return e;
  }

  // A foot coming down: a low ring of dust pushed out along the ground.
  footfall(pos, heavy = false) {
    const n = heavy ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = rnd(1.2, 2.4) * (heavy ? 1.3 : 1);
      this.particle(pos.clone().add(V(Math.cos(a) * 0.2, 0.08, Math.sin(a) * 0.2)), {
        additive: false, color: 0x8a7a60, color2: 0x9a8c74, opacity: 0.42, size: heavy ? 0.45 : 0.35, grow: 3, life: rnd(0.7, 1.1), vel: V(Math.cos(a) * sp, 0.35, Math.sin(a) * sp), drag: 3.5,
      });
    }
  }

  // A thruster plume pointing down (drops, jump jets, lift-off).
  jet(pos, power = 1) {
    this.particle(pos, { tile: "flame", color: 0xfff4d0, color2: 0xff5010, glow: 2.6, size: rnd(0.3, 0.45) * power, life: rnd(0.12, 0.22), vel: V(rnd(-0.8, 0.8), -rnd(6, 9), rnd(-0.8, 0.8)), stretch: 0.05, drag: 2 });
    this.particle(pos, { color: 0x9fd0ff, size: 0.35 * power, life: 0.06, glow: 2 });
    if (Math.random() < 0.5) this.particle(pos, { additive: false, color: 0x6a6258, opacity: 0.3, size: 0.5, grow: 3, life: 0.9, vel: V(rnd(-0.5, 0.5), -2, rnd(-0.5, 0.5)), drag: 2 });
  }

  // Heat rising off hot stacks: a faint warm wobble and the odd ember.
  heatHaze(pos, frac) {
    this.particle(pos, { additive: false, color: 0xb0a090, opacity: 0.05 + 0.05 * Math.min(1, frac), size: 0.3, grow: 3.5, life: 1.1, vel: V(0, 1.6, 0), turb: 3 });
    if (Math.random() < frac * 0.5) this.particle(pos, { tile: "ember", color: 0xffa040, color2: 0xff2a08, glow: 3, size: 0.1, life: rnd(0.6, 1.2), vel: V(rnd(-0.4, 0.4), rnd(1.5, 2.5), rnd(-0.4, 0.4)), turb: 3 });
  }

  // A shell casing kicked out of a gun's side.
  casing(pos, side, big = false) {
    const v = side.clone().multiplyScalar(rnd(2.5, 4)).add(V(0, rnd(3, 5), 0)).add(randDir().multiplyScalar(0.6));
    this.debris.spawn("casing", pos, v, { color: 0xc9953a, scale: big ? 1.9 : 1, linger: rnd(2.5, 4) });
  }

  // ---- Equipment effects ----

  // A flat ring racing out across the table to `radius` (Heat Purge Wave,
  // Meltdown burst): a bright rim over a faint scorched disc.
  shockwave(pos, radius, color = 0xff7a2a, dur = 0.9, motes = 28) {
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    rim.rotation.x = -Math.PI / 2; rim.position.set(pos.x, 0.2, pos.z);
    this.timed(rim, dur, (k, o) => { const e = 1 - Math.pow(1 - k, 3); o.scale.setScalar(0.2 + e * radius); o.material.opacity = 0.95 * (1 - k); });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(pos.x, 0.12, pos.z);
    this.timed(disc, dur * 1.4, (k, o) => { o.scale.setScalar(0.2 + Math.min(1, k * 1.6) * radius); o.material.opacity = 0.25 * (1 - k); });
    if (motes) this.flash(pos.clone().setY(1.5), color, 60, radius * 2.5);
    for (let i = 0; i < motes; i++) {
      const a = (i / motes) * Math.PI * 2;
      this.particle(pos.clone().setY(0.4), { color, size: 0.7, life: dur, vel: V(Math.cos(a) * radius / dur, 0.6, Math.sin(a) * radius / dur), grow: 2, glow: 1.6 });
    }
  }

  // A translucent shell around a mech that flares and fades: Harden (steel
  // shimmer), Overclock (red pulse).
  shell(pos, radius, height, color = 0x9fc8ff, dur = 0.8, pulses = 1) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 32, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(pos.x, height / 2, pos.z);
    this.timed(m, dur, (k, o) => { o.material.opacity = 0.45 * Math.abs(Math.sin(k * Math.PI * pulses)) * (1 - k * 0.5); o.scale.set(1 + k * 0.15, 1, 1 + k * 0.15); });
  }

  // Lock Sight: targeting brackets that spin down onto a point, then blink.
  reticle(pos, color = "#ff5a3c", dur = 1.2) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    g.strokeStyle = color; g.lineWidth = 7; g.lineCap = "round";
    g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke();
    for (const a of [0, 1, 2, 3]) { g.save(); g.translate(64, 64); g.rotate(a * Math.PI / 2); g.beginPath(); g.moveTo(0, -58); g.lineTo(0, -30); g.stroke(); g.restore(); }
    g.fillStyle = color; g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill();
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    s.position.copy(pos); s.renderOrder = 9;
    this.timed(s, dur, (k, o) => { const z = k < 0.5 ? 4 - k * 2 * 2.6 : 1.4; o.scale.setScalar(z); o.material.rotation = (1 - Math.min(1, k * 2)) * Math.PI; o.material.opacity = k < 0.5 ? 1 : (Math.sin(k * 40) > 0 ? 1 : 0.3) * (1 - k) * 2; });
  }

  // A cable between two moving points (grapnel): getA/getB return Vector3s.
  // A thin cylinder (GL lines are 1px), re-aimed every frame.
  tether(getA, getB, color = 0x9a8a60, dur = 1.2) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
    const aim = (o) => { const a = getA(), b = getB(); o.position.copy(a); o.lookAt(b); o.scale.set(1, 1, Math.max(0.01, a.distanceTo(b))); };
    aim(m);
    this.timed(m, dur, (k, o) => { aim(o); o.material.opacity = k > 0.8 ? (1 - k) * 5 : 1; });
  }

  // Cryo: a cold white-blue puff with ice glints.
  frost(pos, n = 18) {
    for (let i = 0; i < n; i++) this.particle(pos.clone().add(V((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)), {
      color: Math.random() < 0.5 ? 0xdff6ff : 0x9fdcff, size: 0.7, life: 1.2 + Math.random() * 0.6, grow: 3, additive: false, opacity: 0.55,
      vel: V((Math.random() - 0.5) * 2.4, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 2.4), drag: 1.5,
    });
    this.burst(pos, 14, { tile: "star", color: 0xc8f0ff, size: 0.3, life: 0.8, spread: 3, grav: -3, glow: 2 });
    this.flash(pos, 0x9fdcff, 25, 8);
  }

  // Chaff: a cloud of flickering foil flakes drifting down.
  glitter(pos, n = 36) {
    for (let i = 0; i < n; i++) this.particle(pos.clone().add(V((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)), {
      tile: "flake", color: [0xffffff, 0xd8d8e8, 0xf0cf7a][i % 3], size: 0.16 + Math.random() * 0.12, life: 1.2 + Math.random() * 0.8, grav: -1.2, glow: 1.6,
      vel: V((Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4), drag: 1.5, spin: (Math.random() - 0.5) * 20, turb: 3,
    });
  }

  // Welding: green-white sparks and a flicker (Emergency Patch, Nanite Swarm).
  weld(pos, n = 18) {
    this.sparks(pos, n, 0x8dff7a, { speed: 5 });
    this.glare(pos, 0.7, 0xeaffea, 0.18);
    this.flash(pos, 0x7fff6a, 30, 8);
  }

  // A projectile flying from → to. `kind` shapes its path and trail.
  shoot(from, to, kind, onHit) {
    const dist = from.distanceTo(to);
    const k = kind || "bullet";
    const speed = { bullet: 70, cannon: 45, missile: 24, lob: 20, bolt: 55, harpoon: 40, rail: 160, rivet: 50, steam: 26, flare: 22 }[k] ?? 60;
    const geo = k === "missile" || k === "harpoon" || k === "bolt"
      ? new THREE.CylinderGeometry(0.06, 0.1, 0.6, 6).rotateZ(Math.PI / 2)
      : new THREE.SphereGeometry(k === "cannon" || k === "lob" || k === "steam" ? 0.18 : k === "flare" ? 0.12 : 0.09, 8, 8);
    const color = new THREE.Color({ missile: 0xdddddd, harpoon: 0xb08d3c, bolt: 0xb08d3c, rail: 0x99ddff, steam: 0xf2efe8, flare: 0xff5a3a }[k] ?? 0xffdd66);
    // Hot rounds glow past white so the bloom picks them up.
    if (k === "bullet" || k === "cannon" || k === "rivet" || k === "rail" || k === "flare") color.multiplyScalar(3);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(from); this.scene.add(mesh);
    const wobble = k === "missile" ? V((Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6) : null;
    this.projectiles.push({ mesh, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.12, dist / speed), kind: k, wobble, onHit, trail: 0 });
    if (k === "rail") {
      this.beam(from, to, 0x99ddff, 0.25);
      for (let i = 0; i < 24; i++) this.particle(from.clone().lerp(to, Math.random()), { color: 0x99ddff, size: rnd(0.1, 0.22), life: rnd(0.3, 0.7), glow: 2.5, vel: randDir().multiplyScalar(0.8), turb: 2 });
    }
  }

  beam(from, to, color = 0x66ccff, life = 0.35, jagged = false) {
    const pts = [];
    const n = jagged ? 10 : 2;
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (jagged && i > 0 && i < n) p.add(V((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
      pts.push(p);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending }));
    this.scene.add(line);
    this.beams.push({ line, life, max: life });
    // Glow motes strung along the arc so it reads thicker than a 1px line.
    for (const p of pts) this.particle(p, { color, size: jagged ? 0.5 : 0.3, life: life * 0.8, glow: 2, opacity: 0.8 });
  }

  flame(from, to) {
    const dir = to.clone().sub(from);
    for (let i = 0; i < 40; i++) {
      const v = dir.clone().multiplyScalar(1.2 + Math.random() * 0.6).add(V((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2));
      setTimeout(() => {
        this.particle(from, { tile: "flame", color: 0xfff0b0, color2: 0xff2a06, glow: 2.2, size: 0.5, life: 0.7, vel: v, grow: 3, drag: 0.6 });
        if (i % 4 === 0) this.particle(from, { additive: false, color: 0x3a3632, color2: 0x625d56, opacity: 0.55, size: 0.6, grow: 4, life: 1.6, vel: v.clone().multiplyScalar(0.8).add(V(0, 1, 0)), drag: 1, delay: 0.3, turb: 1 });
      }, i * 12);
    }
  }

  // Floating "-3 ARMS" style text that rises and fades.
  text(pos, str, color = "#ffdd55") {
    const font = "bold 40px Rajdhani, Arial, sans-serif";
    const c = document.createElement("canvas");
    let g = c.getContext("2d");
    g.font = font;
    // Size the canvas to the words (plus the outline), so long tags like
    // "IMPROVED REACTION!" don't get sliced off at the edges.
    c.width = Math.max(256, Math.ceil(g.measureText(str).width) + 24); c.height = 64;
    g = c.getContext("2d");
    g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(str, c.width / 2, 32);
    g.fillStyle = color; g.fillText(str, c.width / 2, 32);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(c.width / 64, 1, 1); s.position.copy(pos); s.renderOrder = 10;
    this.scene.add(s);
    this.texts.push({ s, life: 1.8, max: 1.8 });
  }

  clear() {
    this.ps.clear(); this.debris.clear(); this.decals.clear();
    for (const e of [...this.emitters]) e.stop();
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const b of this.beams) this.scene.remove(b.line);
    for (const t of this.texts) this.scene.remove(t.s);
    for (const l of this.lights) this.scene.remove(l.l);
    for (const e of this.ephemerals) this.scene.remove(e.obj);
    this.ephemerals = [];
    this.projectiles = []; this.beams = []; this.texts = []; this.lights = [];
  }

  // A pilot's radio line over their mech: a dark riveted panel, the speaker
  // in the side's colour ("▸ OTTILIE"), the words in cream underneath.
  bubble(pos, str, accent = "#5fd3c0", speaker = null) {
    const c = document.createElement("canvas");
    const g = c.getContext("2d");
    const body = "600 30px Rajdhani, Arial, sans-serif", head = "700 20px Rajdhani, Arial, sans-serif";
    g.font = body;
    const tw = g.measureText(str).width;
    g.font = head;
    const hw = speaker ? g.measureText(`▸ ${speaker.toUpperCase()}`).width : 0;
    const w = Math.min(620, Math.ceil(Math.max(tw, hw)) + 44), top = speaker ? 26 : 0, h = 58 + top;
    c.width = w; c.height = h + 16;
    g.fillStyle = "rgba(22,18,14,0.94)"; g.strokeStyle = accent; g.lineWidth = 3;
    g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 10); g.fill(); g.stroke();
    // A tail down to the machine.
    g.beginPath(); g.moveTo(w / 2 - 10, h - 3); g.lineTo(w / 2, h + 13); g.lineTo(w / 2 + 10, h - 3); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 10, h - 2); g.lineTo(w / 2, h + 13); g.lineTo(w / 2 + 10, h - 2); g.stroke();
    // Brass rivets in the corners.
    g.fillStyle = "#c9a14a"; for (const [x, y] of [[9, 9], [w - 9, 9], [9, h - 9], [w - 9, h - 9]]) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
    g.textAlign = "center"; g.textBaseline = "middle";
    if (speaker) { g.font = head; g.fillStyle = accent; g.fillText(`▸ ${speaker.toUpperCase()}`, w / 2, 20); }
    g.font = body; g.fillStyle = "#f3e9d2"; g.fillText(str, w / 2, top + (h - top) / 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const k = 0.028; s.scale.set(c.width * k, c.height * k, 1); s.position.copy(pos); s.renderOrder = 11;
    this.scene.add(s);
    this.texts.push({ s, life: 2.8, max: 2.8, still: true, base: pos.y });
  }

  // Per-frame trail for a flying projectile.
  trail(p, pos, dir, dt) {
    p.trail += dt;
    if (p.kind === "bullet" || p.kind === "rivet" || p.kind === "bolt") {
      // A tracer streak left behind the round.
      if (p.trail > 0.012) { p.trail = 0; this.particle(pos, { tile: "spark", color: 0xffe6a0, color2: 0xff8030, glow: 2.8, size: 0.2, life: 0.07, vel: dir.clone().multiplyScalar(6), stretch: 0.12 }); }
    } else if (p.kind === "cannon") {
      if (p.trail > 0.015) { p.trail = 0; this.particle(pos, { tile: "spark", color: 0xffd080, color2: 0xff5010, glow: 2.6, size: 0.35, life: 0.1, vel: dir.clone().multiplyScalar(6), stretch: 0.12 }); this.particle(pos, { additive: false, color: 0x8a8680, opacity: 0.25, size: 0.3, grow: 3, life: 0.6, turb: 0.5 }); }
    } else if (p.kind === "steam") {
      if (p.trail > 0.015) { p.trail = 0; this.particle(pos, { color: 0xeeeae2, size: 0.9, life: 0.7, grow: 3.5, additive: false, opacity: 0.55, vel: V((Math.random() - 0.5) * 1.5, 0.8, (Math.random() - 0.5) * 1.5) }); }
    } else if (p.kind === "flare") {
      if (p.trail > 0.02) { p.trail = 0; this.particle(pos, { tile: "ember", color: Math.random() < 0.5 ? 0xff5a3a : 0xffb070, size: 0.35, life: 0.6, grow: 1.5, glow: 2.5 }); this.particle(pos, { color: 0x9a8a80, size: 0.4, life: 1, grow: 3, additive: false, opacity: 0.35 }); }
    } else if (p.kind === "missile" || p.kind === "lob") {
      if (p.trail > 0.02) {
        p.trail = 0;
        if (p.kind === "missile") this.particle(pos, { tile: "flame", color: 0xfff0c0, color2: 0xff5010, glow: 2.6, size: 0.35, life: 0.12, vel: dir.clone().multiplyScalar(-4), stretch: 0.05 });
        this.particle(pos, { color: 0x999999, color2: 0xbbbbbb, size: 0.4, life: 1.1, grow: 3.5, additive: false, opacity: 0.5, turb: 0.8 });
      }
    }
  }

  update(dt) {
    this.ps.update(dt, this.camera);
    this.debris.update(dt);
    this.decals.update(dt);
    for (const e of this.emitters) { e.t += dt; e.step(dt, e.t); }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt / p.dur;
      const t = Math.min(1, p.t);
      const pos = p.from.clone().lerp(p.to, t);
      if (p.kind === "lob" || p.kind === "flare") pos.y += Math.sin(t * Math.PI) * p.from.distanceTo(p.to) * (p.kind === "flare" ? 0.2 : 0.45);
      if (p.wobble) pos.addScaledVector(p.wobble, Math.sin(t * Math.PI) * 0.6);
      const prev = p.mesh.position.clone();
      p.mesh.position.copy(pos);
      const step = pos.clone().sub(prev);
      if (step.lengthSq() > 1e-6) { p.mesh.lookAt(pos.clone().add(step)); this.trail(p, pos, step.normalize(), dt); }
      if (t >= 1) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        p.onHit?.(p.to);
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]; b.life -= dt;
      if (b.life <= 0) { this.scene.remove(b.line); this.beams.splice(i, 1); continue; }
      b.line.material.opacity = b.life / b.max;
    }
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i]; l.life -= dt;
      if (l.life <= 0) { this.scene.remove(l.l); this.lights.splice(i, 1); continue; }
      l.l.intensity = l.intensity * (l.life / l.max);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.s); this.texts.splice(i, 1); continue; }
      if (t.still) t.s.position.y = t.base + Math.sin((t.max - t.life) * 6) * 0.08 + Math.min(0.3, (t.max - t.life) * 2);
      else t.s.position.y += dt * 1.2;
      t.s.material.opacity = t.still ? Math.min(1, t.life * 3) : Math.min(1, t.life / (t.max * 0.5));
    }
    for (let i = this.ephemerals.length - 1; i >= 0; i--) {
      const e = this.ephemerals[i]; e.t += dt;
      const k = Math.min(1, e.t / e.dur);
      e.step(k, e.obj);
      if (k >= 1) { this.scene.remove(e.obj); e.obj.geometry?.dispose(); e.obj.material?.map?.dispose(); e.obj.material?.dispose(); this.ephemerals.splice(i, 1); }
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}
