// Battle scars: scorch marks and shot pocks that stay on the table for the
// whole battle (capped, oldest go first). A fresh blast's scorch glows hot
// orange at the core and cools over a few seconds.
import * as THREE from "three";

const CAP = 90;

function canvasTex(size, draw) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function blot(g, x, y, r, a) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `rgba(12,9,7,${a})`); grd.addColorStop(1, "rgba(12,9,7,0)");
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

// A blast scorch: dark ragged core, soot streaks radiating out, a few flecks.
const scorchTex = () => canvasTex(256, (g, S) => {
  const c = S / 2;
  for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, d = Math.random() * 40; blot(g, c + Math.cos(a) * d, c + Math.sin(a) * d, 30 + Math.random() * 40, 0.35); }
  g.lineCap = "round";
  for (let i = 0; i < 38; i++) {
    const a = Math.random() * Math.PI * 2, r0 = 30 + Math.random() * 20, r1 = 70 + Math.random() * 55;
    const grd = g.createLinearGradient(c + Math.cos(a) * r0, c + Math.sin(a) * r0, c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    grd.addColorStop(0, "rgba(14,10,8,0.5)"); grd.addColorStop(1, "rgba(14,10,8,0)");
    g.strokeStyle = grd; g.lineWidth = 3 + Math.random() * 7;
    g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.stroke();
  }
  for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 70; blot(g, c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + Math.random() * 4, 0.6); }
  // Fade the square's edge out completely.
  g.globalCompositeOperation = "destination-in";
  const m = g.createRadialGradient(c, c, 0, c, c, c);
  m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.7, "rgba(0,0,0,0.85)"); m.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = m; g.fillRect(0, 0, S, S);
});

// A shot pock: small dark crater with a scuffed lighter rim.
const pockTex = () => canvasTex(64, (g, S) => {
  const c = S / 2;
  const rim = g.createRadialGradient(c, c, 8, c, c, 28);
  rim.addColorStop(0, "rgba(150,130,100,0.35)"); rim.addColorStop(1, "rgba(150,130,100,0)");
  g.fillStyle = rim; g.fillRect(0, 0, S, S);
  blot(g, c, c, 14, 0.9); blot(g, c + 3, c - 2, 9, 0.7);
});

const glowTex = () => canvasTex(128, (g, S) => {
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(255,190,90,1)"); grd.addColorStop(0.3, "rgba(255,90,20,0.7)"); grd.addColorStop(1, "rgba(255,40,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
});

export class Decals {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra });
    this.mats = { scorch: mat(scorchTex()), pock: mat(pockTex(), { opacity: 0.85 }) };
    this.glowMap = glowTex();
    this.list = []; this.glows = []; this.seq = 0;
  }

  // pos: world point (dropped to the table). kind: scorch | pock.
  add(pos, radius, kind = "scorch", { hot = false } = {}) {
    const m = new THREE.Mesh(this.geo, this.mats[kind]);
    m.position.set(pos.x, 0.03 + (this.seq++ % 20) * 0.001, pos.z);
    m.rotation.y = Math.random() * Math.PI * 2;
    m.scale.set(radius * 2, 1, radius * 2 * (0.85 + Math.random() * 0.3));
    m.renderOrder = 1;
    this.scene.add(m); this.list.push(m);
    if (this.list.length > CAP) this.scene.remove(this.list.shift());
    if (hot) {
      const g = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ map: this.glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.5, 2.5, 2.5) }));
      g.position.set(pos.x, m.position.y + 0.004, pos.z);
      g.scale.setScalar(radius * 1.3);
      g.renderOrder = 2;
      this.scene.add(g); this.glows.push({ g, t: 0, dur: 3 + radius });
    }
  }

  update(dt) {
    for (let i = this.glows.length - 1; i >= 0; i--) {
      const h = this.glows[i]; h.t += dt;
      const k = h.t / h.dur;
      if (k >= 1) { this.scene.remove(h.g); h.g.material.dispose(); this.glows.splice(i, 1); continue; }
      // Cools: flickers, fades, shrinks toward the core.
      h.g.material.opacity = (1 - k) * (1 - k) * (0.85 + Math.random() * 0.15);
      h.g.scale.setScalar(h.g.scale.x * (1 - dt * 0.15));
    }
  }

  clear() {
    for (const m of this.list) this.scene.remove(m);
    for (const h of this.glows) { this.scene.remove(h.g); h.g.material.dispose(); }
    this.list = []; this.glows = [];
  }
}
