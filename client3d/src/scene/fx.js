// Battle effects: pooled additive particles (muzzle flash, sparks, smoke, fire,
// steam), flying projectiles with per-weapon flavour, beams, floating damage
// numbers and camera shake. Everything is fire-and-forget; update(dt) ticks it.
import * as THREE from "three";

function softSprite() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.35, "rgba(255,255,255,0.6)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.tex = softSprite();
    this.particles = [];
    this.projectiles = [];
    this.beams = [];
    this.texts = [];
    this.shake = 0;
    this.lights = [];
  }

  particle(pos, { color = 0xffaa33, size = 0.6, life = 0.6, vel = new THREE.Vector3(), grav = 0, grow = 1, additive = true, opacity = 1 } = {}) {
    const m = new THREE.SpriteMaterial({ map: this.tex, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(m); s.position.copy(pos); s.scale.setScalar(size);
    this.scene.add(s);
    this.particles.push({ s, vel: vel.clone(), life, max: life, grav, size, grow, opacity });
  }

  burst(pos, n, opts = {}) {
    const spread = opts.spread ?? 3;
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * (opts.up ?? 0.8), (Math.random() - 0.5) * spread);
      this.particle(pos, { ...opts, vel: v, size: (opts.size ?? 0.4) * (0.6 + Math.random() * 0.8), life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8) });
    }
  }

  flash(pos, color = 0xffcc66, intensity = 30, dist = 10) {
    const l = new THREE.PointLight(color, intensity, dist);
    l.position.copy(pos); this.scene.add(l);
    this.lights.push({ l, life: 0.15, max: 0.15, intensity });
  }

  muzzle(pos, color = 0xffcc55) {
    this.burst(pos, 6, { color, size: 0.7, life: 0.12, spread: 1.5 });
    this.flash(pos, color, 25, 8);
  }

  smoke(pos, n = 4, dark = false) {
    for (let i = 0; i < n; i++) {
      this.particle(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5)), {
        color: dark ? 0x222222 : 0x888888, size: 0.8, life: 1.6 + Math.random(), vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4),
        grow: 2.5, additive: false, opacity: 0.5,
      });
    }
  }

  steam(pos) {
    this.particle(pos, { color: 0xdddddd, size: 0.4, life: 1.0, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 2, (Math.random() - 0.5) * 0.3), grow: 3, additive: false, opacity: 0.35 });
  }

  explosion(pos, big = false) {
    const k = big ? 2 : 1;
    this.burst(pos, 30 * k, { color: 0xff8822, size: 1.1 * k, life: 0.7, spread: 5 * k });
    this.burst(pos, 20 * k, { color: 0xffee88, size: 0.3, life: 0.9, spread: 9 * k, grav: -12 });
    this.smoke(pos, 10 * k, true);
    this.flash(pos, 0xff7722, 120 * k, 25);
    this.shake = Math.max(this.shake, big ? 1.2 : 0.5);
  }

  sparks(pos, n = 12) { this.burst(pos, n, { color: 0xffdd88, size: 0.25, life: 0.4, spread: 6, grav: -14 }); }

  // A projectile flying from → to. `kind` shapes its path and trail.
  shoot(from, to, kind, onHit) {
    const dist = from.distanceTo(to);
    const k = kind || "bullet";
    const speed = { bullet: 70, cannon: 45, missile: 24, lob: 20, bolt: 55, harpoon: 40, rail: 160, rivet: 50 }[k] ?? 60;
    const geo = k === "missile" || k === "harpoon" || k === "bolt"
      ? new THREE.CylinderGeometry(0.06, 0.1, 0.6, 6).rotateZ(Math.PI / 2)
      : new THREE.SphereGeometry(k === "cannon" || k === "lob" ? 0.18 : 0.09, 8, 8);
    const color = { missile: 0xdddddd, harpoon: 0xb08d3c, bolt: 0xb08d3c, rail: 0x99ddff }[k] ?? 0xffdd66;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(from); this.scene.add(mesh);
    const wobble = k === "missile" ? new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6) : null;
    this.projectiles.push({ mesh, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.12, dist / speed), kind: k, wobble, onHit, trail: 0 });
    if (k === "rail") this.beam(from, to, 0x99ddff, 0.25);
  }

  beam(from, to, color = 0x66ccff, life = 0.35, jagged = false) {
    const pts = [];
    const n = jagged ? 10 : 2;
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (jagged && i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
      pts.push(p);
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
    this.scene.add(line);
    this.beams.push({ line, life, max: life });
  }

  flame(from, to) {
    const dir = to.clone().sub(from);
    for (let i = 0; i < 40; i++) {
      const v = dir.clone().multiplyScalar(1.2 + Math.random() * 0.6).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2));
      setTimeout(() => this.particle(from, { color: Math.random() < 0.5 ? 0xff6611 : 0xffcc33, size: 0.5, life: 0.7, vel: v, grow: 3 }), i * 12);
    }
  }

  // Floating "-3 ARMS" style text that rises and fades.
  text(pos, str, color = "#ffdd55") {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.font = "bold 40px Rajdhani, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(str, 128, 32);
    g.fillStyle = color; g.fillText(str, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(4, 1, 1); s.position.copy(pos); s.renderOrder = 10;
    this.scene.add(s);
    this.texts.push({ s, life: 1.8, max: 1.8 });
  }

  clear() {
    for (const p of this.particles) this.scene.remove(p.s);
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const b of this.beams) this.scene.remove(b.line);
    for (const t of this.texts) this.scene.remove(t.s);
    for (const l of this.lights) this.scene.remove(l.l);
    this.particles = []; this.projectiles = []; this.beams = []; this.texts = []; this.lights = [];
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.s); p.s.material.dispose(); this.particles.splice(i, 1); continue; }
      p.vel.y += p.grav * dt;
      p.s.position.addScaledVector(p.vel, dt);
      const f = p.life / p.max;
      p.s.material.opacity = f * p.opacity;
      p.s.scale.setScalar(p.size * (1 + (1 - f) * (p.grow - 1)));
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt / p.dur;
      const t = Math.min(1, p.t);
      const pos = p.from.clone().lerp(p.to, t);
      if (p.kind === "lob") pos.y += Math.sin(t * Math.PI) * p.from.distanceTo(p.to) * 0.45;
      if (p.wobble) pos.addScaledVector(p.wobble, Math.sin(t * Math.PI) * 0.6);
      const prev = p.mesh.position.clone();
      p.mesh.position.copy(pos);
      if (pos.distanceToSquared(prev) > 1e-6) p.mesh.lookAt(pos.clone().add(pos.clone().sub(prev)));
      if (p.kind === "missile" || p.kind === "lob") { p.trail += dt; if (p.trail > 0.02) { p.trail = 0; this.particle(pos, { color: 0x999999, size: 0.4, life: 0.8, grow: 3, additive: false, opacity: 0.5 }); } }
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
      t.s.position.y += dt * 1.2;
      t.s.material.opacity = Math.min(1, t.life / (t.max * 0.5));
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}
