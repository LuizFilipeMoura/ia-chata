// Physical debris: painted plates and jagged chunks blown off by hits and
// wrecks, brass casings kicked out of guns. One instanced mesh per shape and a
// tiny tumble sim: gravity, spin, bounce on the table, slide to rest, lie there
// a while, then sink away. Hot pieces trail embers and smoke while they cool.
import * as THREE from "three";

const SHAPES = {
  chunk: { geo: () => new THREE.DodecahedronGeometry(0.5, 0), mat: () => new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.5 }), cap: 320, half: 0.4 },
  plate: { geo: () => new THREE.BoxGeometry(1, 0.1, 0.7), mat: () => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.45 }), cap: 240, half: 0.05 },
  casing: { geo: () => new THREE.CylinderGeometry(0.05, 0.05, 0.26, 7), mat: () => new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.95 }), cap: 240, half: 0.05 },
};
const GRAV = -22;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), col = new THREE.Color();
// Nearest resting angle: plates and casings settle flat on a face or a side.
const settle = (a, step) => Math.round(a / step) * step;

export class Debris {
  // emit(pos, hot01): called while a hot piece cools (the FX trails embers/smoke).
  constructor(scene, emit) {
    this.emit = emit;
    this.meshes = {}; this.items = {};
    for (const [k, def] of Object.entries(SHAPES)) {
      const m = new THREE.InstancedMesh(def.geo(), def.mat(), def.cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, col.set(0xffffff));
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
      scene.add(m);
      this.meshes[k] = m; this.items[k] = [];
    }
  }

  // kind: chunk | plate | casing. vel: Vector3. opts: color, scale, linger (s), hot (s).
  spawn(kind, pos, vel, { color = 0x3a3632, scale = 0.3, linger = 6, hot = 0 } = {}) {
    const list = this.items[kind];
    if (list.length >= SHAPES[kind].cap) list.shift();
    list.push({
      p: pos.clone(), v: vel.clone(), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
      color: new THREE.Color(color), scale, sx: 0.7 + Math.random() * 0.6, sz: 0.6 + Math.random() * 0.8,
      t: 0, linger, hot, hot0: hot, rest: false, puff: 0,
    });
  }

  // A spray of pieces flying out from `pos`: mixed plates (painted) and chunks.
  burst(pos, n, { color = 0x3a3632, speed = 5, up = 5, scale = 0.3, hot = 0, linger = 6, dir = null } = {}) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * speed * 2, up * (0.5 + Math.random()), (Math.random() - 0.5) * speed * 2);
      if (dir) v.addScaledVector(dir, speed * (0.4 + Math.random() * 0.6));
      const plate = Math.random() < 0.55;
      // Plates keep the paint (a little scorched), chunks are the dark innards.
      const c = plate ? new THREE.Color(color).lerp(col.set(0x1a1816), Math.random() * 0.45) : new THREE.Color(0x2e2c2a).lerp(col.set(0x6a625a), Math.random() * 0.5);
      this.spawn(plate ? "plate" : "chunk", pos, v, { color: c, scale: scale * (0.6 + Math.random() * 0.8), linger: linger * (0.7 + Math.random() * 0.6), hot: hot * (0.5 + Math.random() * 0.5) });
    }
  }

  clear() { for (const k of Object.keys(this.items)) { this.items[k] = []; this.meshes[k].count = 0; } }

  update(dt) {
    for (const [k, list] of Object.entries(this.items)) {
      const mesh = this.meshes[k], half = SHAPES[k].half;
      let n = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const d = list[i];
        d.t += dt;
        const floor = half * d.scale;
        if (!d.rest) {
          d.v.y += GRAV * dt;
          d.p.addScaledVector(d.v, dt);
          d.r.addScaledVector(d.w, dt);
          if (d.p.y <= floor) {
            d.p.y = floor;
            if (Math.abs(d.v.y) > 2) { d.v.y = -d.v.y * 0.32; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.55); }
            else {
              d.v.y = 0;
              const f = Math.max(0, 1 - dt * 7);
              d.v.x *= f; d.v.z *= f; d.w.multiplyScalar(f);
              // Topple onto a face / side.
              const step = k === "casing" ? Math.PI / 2 : Math.PI;
              d.r.x += (settle(d.r.x, step) - d.r.x) * Math.min(1, dt * 8);
              d.r.z += (settle(d.r.z, k === "casing" ? Math.PI / 2 : Math.PI) - d.r.z) * Math.min(1, dt * 8);
              if (d.v.lengthSq() < 0.01) d.rest = true;
            }
          }
        }
        if (d.hot > 0) {
          d.hot -= dt; d.puff += dt;
          if (d.puff > 0.06) { d.puff = 0; this.emit?.(d.p, d.hot / d.hot0); }
        }
        // Lie there, then sink into the table.
        const over = d.t - d.linger;
        if (over > 0.8) { list.splice(i, 1); continue; }
        const shrink = over > 0 ? 1 - over / 0.8 : 1;
        e.set(d.r.x, d.r.y, d.r.z); q.setFromEuler(e);
        if (k === "casing") s3.setScalar(d.scale * shrink);
        else s3.set(d.scale * d.sx, d.scale, d.scale * d.sz).multiplyScalar(shrink);
        m4.compose(d.p, q, s3);
        mesh.setMatrixAt(n, m4);
        // Hot pieces glow orange while they cool.
        const glow = d.hot > 0 ? d.hot / d.hot0 : 0;
        mesh.setColorAt(n, col.copy(d.color).lerp(col.clone().setRGB(2.4, 0.7, 0.15), glow * 0.8));
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
