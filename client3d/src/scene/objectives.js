// Objective models. A 1 VP objective is a fuel depot, the 2 VP centre is a
// refinery cracking tower. Who holds it reads off a pennant and a lamp that
// take `pylonMat`'s emissive colour (world.setObjectiveControl paints it:
// gold when unclaimed, the holder's colour when held). Each builder returns
// { pylonMat, gem, light, anim, noBob } for World: `gem` is the lamp glass
// (it swells on the round-end payout pulse), `anim(dt, now)` runs per frame.
import * as THREE from "three";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.4, ...o });

function kit() {
  return {
    concrete: std(0x5a564e, { roughness: 1, metalness: 0 }),
    iron: std(0x2a2622, { metalness: 0.75, roughness: 0.45 }),
    steel: std(0x6a6660, { metalness: 0.65, roughness: 0.45 }),
    brass: std(0xc9a14a, { metalness: 0.9, roughness: 0.3 }),
    oxide: std(0x7a3424, { roughness: 0.75, metalness: 0.35 }),
    pylonMat: new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffd35a, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.1 }),
  };
}

function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}

// Iron hoops round a cylinder standing along y (or lying along x).
function bands(parent, mat, r, ys, { alongX = false, at = V() } = {}) {
  for (const y of ys) {
    const b = mesh(new THREE.TorusGeometry(r + 0.015, 0.025, 5, 24), mat, parent);
    if (alongX) { b.rotation.y = Math.PI / 2; b.position.set(at.x + y, at.y, at.z); } else { b.rotation.x = Math.PI / 2; b.position.set(at.x, at.y + y, at.z); }
  }
}

// Army-stencil VP number on a scuffed olive plate.
function stencil(n) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#4a4a30"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "20,18,12" : "120,110,80"},${0.1 + Math.random() * 0.15})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 10, 1 + Math.random() * 3); }
  g.strokeStyle = "#2a2a1c"; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  g.fillStyle = "#e8dcb0"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "900 104px 'Big Shoulders Stencil Display', Impact, sans-serif"; g.fillText(String(n), 64, 70);
  for (const [x, y] of [[12, 12], [116, 12], [12, 116], [116, 116]]) { g.fillStyle = "#8a7a50"; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0.2 });
}

// A pole with a flag that waves and takes the holder's colour.
function pennant(parent, m, x, y, z, height, pylonMat) {
  mesh(new THREE.CylinderGeometry(0.03, 0.035, height, 6), m.iron, parent, x, y + height / 2, z);
  mesh(new THREE.SphereGeometry(0.05, 8, 6), m.brass, parent, x, y + height + 0.03, z);
  const geo = new THREE.PlaneGeometry(0.7, 0.4, 8, 2); geo.translate(0.35, 0, 0);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd35a, roughness: 0.9, side: THREE.DoubleSide });
  const flag = mesh(geo, flagMat, parent, x, y + height - 0.22, z);
  flag.onBeforeRender = () => flagMat.color.copy(pylonMat.emissive);
  const base = geo.attributes.position.array.slice(), ph = Math.random() * 6;
  return (dt, now) => {
    flag.rotation.y = Math.sin(now * 0.7 + ph) * 0.5;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const fx = base[i * 3]; p.array[i * 3 + 2] = Math.sin(now * 5 + fx * 5 + ph) * 0.09 * fx; }
    p.needsUpdate = true;
  };
}

// 1 VP: a roadside fuel depot. A riveted red-oxide tank on cradles, oil drums,
// and an old petrol pump whose glass globe is the lamp.
export function fuelDepot(group, o, fx) {
  const m = kit(), { pylonMat } = m;
  mesh(new THREE.BoxGeometry(2.4, 0.14, 1.9), m.concrete, group, 0, 0.07, 0);
  // Storage tank lying on two cradles.
  const tankAt = V(-0.2, 0.86, -0.3);
  const tank = mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.7, 22), m.oxide, group, tankAt.x, tankAt.y, tankAt.z); tank.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) { const cap = mesh(new THREE.SphereGeometry(0.46, 18, 10), m.oxide, group, tankAt.x + s * 0.85, tankAt.y, tankAt.z); cap.scale.set(0.3, 1, 1); }
  bands(group, m.iron, 0.46, [-0.6, 0, 0.6], { alongX: true, at: tankAt });
  for (const x of [-0.55, 0.55]) mesh(new THREE.BoxGeometry(0.2, 0.36, 0.8), m.iron, group, tankAt.x + x, 0.32, tankAt.z);
  mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12), m.iron, group, tankAt.x - 0.3, tankAt.y + 0.47, tankAt.z);
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), m.iron, group, tankAt.x + 0.35, tankAt.y + 0.68, tankAt.z);
  mesh(new THREE.ConeGeometry(0.09, 0.1, 8), m.iron, group, tankAt.x + 0.35, tankAt.y + 0.96, tankAt.z);
  const plate = mesh(new THREE.PlaneGeometry(0.44, 0.44), stencil(1), group, tankAt.x - 0.05, tankAt.y, tankAt.z + 0.47);
  plate.castShadow = false;
  // Drums: three standing, one on its side.
  const drumCols = [0x4d5230, 0x222222, 0x6a3a22, 0x4d5230];
  [[0.75, 0.45], [0.98, 0.05], [0.55, 0.78]].forEach(([x, z], i) => {
    const d = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.44, 14), std(drumCols[i]), group, x, 0.14 + 0.22, z);
    bands(group, m.iron, 0.17, [0.12, 0.32], { at: V(x, 0.14, z) });
    d.rotation.y = i;
  });
  const lying = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.44, 14), std(drumCols[3]), group, 0.95, 0.31, 0.75); lying.rotation.set(0, 0.6, Math.PI / 2);
  // The pump: a red cabinet, a dial face, a hose, and the glass globe on top.
  const pump = new THREE.Group(); pump.position.set(-0.85, 0.14, 0.55); pump.rotation.y = 0.35; group.add(pump);
  mesh(new THREE.BoxGeometry(0.32, 0.78, 0.26), std(0x8a2a1e, { roughness: 0.6 }), pump, 0, 0.39, 0);
  mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16), std(0xe8dcb0, { metalness: 0 }), pump, 0, 0.55, 0.14).rotation.x = Math.PI / 2;
  const hose = mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16, Math.PI * 1.2), m.iron, pump, 0.18, 0.35, 0); hose.rotation.y = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.05, 12), m.brass, pump, 0, 0.8, 0);
  const gem = mesh(new THREE.SphereGeometry(0.13, 16, 12), pylonMat, pump, 0, 0.95, 0);
  mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.04, 12), m.brass, pump, 0, 1.08, 0);
  const light = new THREE.PointLight(0xffd35a, 5, 7); light.position.set(-0.85, 1.4, 0.55); group.add(light);
  const wave = pennant(group, m, 0.95, 0.14, -0.75, 2.2, pylonMat);
  return { pylonMat, gem, light, noBob: true, anim: wave };
}

// 2 VP centre: a refinery cracking tower. A tall banded column with two
// catwalks and a ladder, a side column tied in by a pipe bridge, a pipe rack
// with valve wheels, a gas flare burning on top and steam venting now and then.
export function refineryTower(group, o, fx) {
  const m = kit(), { pylonMat } = m;
  mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.16, 8), m.concrete, group, 0, 0.08, 0);
  const col = V(-0.2, 0.16, -0.15), H = 4.6, R = 0.44;
  mesh(new THREE.CylinderGeometry(R, R + 0.04, H, 20), m.steel, group, col.x, col.y + H / 2, col.z);
  bands(group, m.iron, R + 0.02, [0.4, 1.1, 1.8, 2.5, 3.2, 3.9], { at: col });
  const dome = mesh(new THREE.SphereGeometry(R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.steel, group, col.x, col.y + H, col.z);
  dome.scale.y = 0.5;
  const plate = mesh(new THREE.PlaneGeometry(0.5, 0.5), stencil(2), group, col.x, col.y + 0.75, col.z + R + 0.05); plate.castShadow = false;
  // Catwalks with rails and posts.
  for (const y of [1.9, 3.5]) {
    mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 20), m.iron, group, col.x, col.y + y, col.z);
    const rail = mesh(new THREE.TorusGeometry(0.83, 0.02, 4, 28), m.iron, group, col.x, col.y + y + 0.35, col.z); rail.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 4), m.iron, group, col.x + Math.cos(a) * 0.83, col.y + y + 0.18, col.z + Math.sin(a) * 0.83); }
  }
  // Ladder up the front.
  for (const dz of [-0.12, 0.12]) mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.6, 4), m.iron, group, col.x + R + 0.12, col.y + 1.8, col.z + dz);
  for (let y = 0.2; y < 3.6; y += 0.22) mesh(new THREE.BoxGeometry(0.02, 0.02, 0.24), m.iron, group, col.x + R + 0.12, col.y + y, col.z);
  // Side column and the pipe bridge into the main one.
  const side = V(0.8, 0.16, 0.45), SH = 3;
  mesh(new THREE.CylinderGeometry(0.22, 0.25, SH, 14), m.oxide, group, side.x, side.y + SH / 2, side.z);
  bands(group, m.iron, 0.23, [0.5, 1.4, 2.3], { at: side });
  const bridge = mesh(new THREE.CylinderGeometry(0.07, 0.07, side.clone().setY(0).distanceTo(col.clone().setY(0)), 8), m.iron, group, (side.x + col.x) / 2, side.y + SH - 0.3, (side.z + col.z) / 2);
  bridge.rotation.z = Math.PI / 2; bridge.rotation.y = -Math.atan2(side.z - col.z, side.x - col.x);
  // Pipe rack along the pad with a U-loop and red valve wheels.
  for (const [y, c] of [[0.34, m.iron], [0.5, m.brass]]) {
    const p = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), c, group, 0, y, 0.95); p.rotation.z = Math.PI / 2;
  }
  const loop = mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 16, Math.PI), m.iron, group, 0.5, 0.34, 0.95);
  loop.rotation.set(0, 0, 0);
  const valve = std(0xa02a1e, { roughness: 0.5 });
  for (const x of [-0.7, 0.9]) { const w = mesh(new THREE.TorusGeometry(0.1, 0.02, 5, 12), valve, group, x, 0.62, 0.95); w.rotation.x = Math.PI / 2; }
  // Caged warning lamp on the top catwalk (the gem) and the pennant on the dome.
  const lampAt = V(col.x + 0.6, col.y + 3.5 + 0.18, col.z + 0.55);
  const gem = mesh(new THREE.SphereGeometry(0.11, 14, 10), pylonMat, group, lampAt.x, lampAt.y, lampAt.z);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 4), m.brass, group, lampAt.x + Math.cos(a) * 0.14, lampAt.y, lampAt.z + Math.sin(a) * 0.14); }
  mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12), m.brass, group, lampAt.x, lampAt.y + 0.15, lampAt.z);
  const light = new THREE.PointLight(0xffd35a, 6, 9); light.position.copy(lampAt).add(V(0, 0.3, 0)); group.add(light);
  const wave = pennant(group, m, col.x, col.y + H + 0.2, col.z, 1.1, pylonMat);
  // Flare stack off the dome, burning; the side column vents steam.
  const flareAt = V(col.x + 0.25, col.y + H + 1.1, col.z - 0.1);
  mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 8), m.iron, group, flareAt.x, flareAt.y - 0.55, flareAt.z);
  const tip = new THREE.Object3D(); tip.position.copy(flareAt); group.add(tip);
  const vent = new THREE.Object3D(); vent.position.set(side.x, side.y + SH + 0.1, side.z); group.add(vent);
  let flameAcc = 0, steamT = 2 + Math.random() * 3;
  const w = V();
  const anim = (dt, now) => {
    wave(dt, now);
    if (!fx) return;
    flameAcc += dt * 14;
    for (; flameAcc >= 1; flameAcc--) fx.particle(tip.getWorldPosition(w), { tile: "flame", color: Math.random() < 0.4 ? 0xffd070 : 0xff8a28, color2: 0xa01800, glow: 1.8, size: 0.28, grow: 0.5, life: 0.5, vel: V(0.3, 1.6, 0), stretch: 0.2, turb: 2 });
    if ((steamT -= dt) <= 0) { steamT = 3 + Math.random() * 4; for (let i = 0; i < 8; i++) fx.steam(vent.getWorldPosition(w).clone()); }
  };
  return { pylonMat, gem, light, noBob: true, anim };
}
