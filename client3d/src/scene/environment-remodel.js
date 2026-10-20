// Workshop-scale architecture and cover. Static detail is baked per material;
// the pump alone keeps articulated meshes with physically connected pins.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { blinker, steamValve, V } from "./dress-kit.js";

let grain;
export function industrialMaterial(color, { roughness = 0.92, metalness = 0.12, ...options } = {}) {
  if (!grain) {
    const data = new Uint8Array(64 * 64 * 4);
    let seed = 317;
    for (let i = 0; i < 64 * 64; i++) {
      seed = (seed * 16807) % 2147483647;
      const v = 188 + Math.floor((seed / 2147483647) * 66);
      data.set([v, v, v, 255], i * 4);
    }
    grain = new THREE.DataTexture(data, 64, 64);
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
    grain.magFilter = THREE.LinearFilter;
    grain.minFilter = THREE.LinearMipmapLinearFilter;
    grain.generateMipmaps = true;
    grain.colorSpace = THREE.SRGBColorSpace;
    grain.needsUpdate = true;
  }
  return new THREE.MeshStandardMaterial({
    color, roughness: Math.max(0.7, roughness), metalness: Math.min(0.3, metalness),
    map: grain, ...options,
  });
}

// Use only on static construction groups. This retains groups used by animation.
export function mergeDetails(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), buckets = new Map();
  group.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone();
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld));
    const list = buckets.get(node.material) ?? [];
    list.push(geometry); buckets.set(node.material, list);
  });
  const geometries = new Set();
  group.traverse((node) => { if (node.geometry) geometries.add(node.geometry); });
  group.clear();
  for (const [material, geometries] of buckets) {
    const joined = mergeGeometries(geometries, false);
    const mesh = new THREE.Mesh(joined, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach((geometry) => geometry.dispose());
  }
  geometries.forEach((geometry) => geometry.dispose());
  return group;
}

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const cylinder = (r, h, mat, segments = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), mat);
function put(group, object, x = 0, y = 0, z = 0) {
  object.position.set(x, y, z); object.castShadow = object.receiveShadow = true; group.add(object); return object;
}
function link(group, a, b, r, material) {
  const mesh = cylinder(r, 1, material, 8); group.add(mesh); setLink(mesh, a, b); return mesh;
}
function setLink(mesh, a, b) {
  const direction = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(direction, 0.5);
  mesh.scale.y = direction.length();
  if (Math.abs(direction.z) < 1e-12) mesh.rotation.set(0, 0, Math.atan2(-direction.x, direction.y));
  else mesh.quaternion.setFromUnitVectors(V(0, 1, 0), direction.normalize());
}
function flange(group, x, y, z, radius, material, axis = "y") {
  const plate = put(group, cylinder(radius, 0.07, material), x, y, z);
  if (axis === "x") plate.rotation.z = Math.PI / 2;
  if (axis === "z") plate.rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, u = Math.cos(a) * radius * 0.72, v = Math.sin(a) * radius * 0.72;
    const bolt = cylinder(radius * 0.11, 0.09, material, 6);
    if (axis === "z") { bolt.rotation.x = Math.PI / 2; put(group, bolt, x + u, y + v, z); }
    else if (axis === "x") { bolt.rotation.z = Math.PI / 2; put(group, bolt, x, y + u, z + v); }
    else put(group, bolt, x + u, y, z + v);
  }
}

// Circle intersection gives the beam's driven pin. The opposite end drives a
// slider through another fixed-length rod, so neither connecting rod stretches.
export function pumpPose(phase) {
  const pivot = V(0, 1.7, 0), crankCenter = V(-0.95, 0.55, 0);
  const crankPin = crankCenter.clone().add(V(Math.cos(phase) * 0.28, Math.sin(phase) * 0.28, 0));
  const delta = crankPin.clone().sub(pivot), distance = delta.length();
  const along = (1.05 ** 2 - 1.3 ** 2 + distance ** 2) / (2 * distance);
  const across = Math.sqrt(Math.max(0, 1.05 ** 2 - along ** 2));
  const direction = delta.multiplyScalar(1 / distance);
  const beamEnd = pivot.clone().addScaledVector(direction, along).add(V(direction.y * across, -direction.x * across, 0));
  const pumpEnd = pivot.clone().sub(beamEnd.clone().sub(pivot));
  const piston = V(1.05, pumpEnd.y - Math.sqrt(0.5 ** 2 - (pumpEnd.x - 1.05) ** 2), 0);
  return { pivot, crankCenter, crankPin, beamEnd, pumpEnd, piston };
}

export function pumphouseRemodel(t, ctx) {
  const root = new THREE.Group(); root.name = "remodel-pumphouse";
  const walls = new THREE.Group(); root.add(walls);
  const W = t.w * 0.82, D = t.h * 0.82, H = Math.min(3.25, 1.35 + Math.min(t.w, t.h) * 0.44);
  const brick = [0x77503d, 0x855842, 0x634435, 0x91654d].map((c) => industrialMaterial(c, { metalness: 0 }));
  const mortar = industrialMaterial(0x4b4841, { metalness: 0 });
  const stone = industrialMaterial(0x8a8070, { metalness: 0 });
  const iron = industrialMaterial(0x343a38), slate = industrialMaterial(0x414b49);
  const rust = industrialMaterial(0x72503b), dark = industrialMaterial(0x242727, { metalness: 0 });
  const paint = industrialMaterial(0x596258);
  put(walls, box(W + 0.22, 0.25, D + 0.22, stone), 0, 0.125);
  put(walls, box(W, H - 0.25, D, mortar), 0, (H + 0.25) / 2);
  // Staggered brick faces and recessed window bays; joints stay dark.
  const courses = Math.ceil((H - 0.3) / 0.22), courseH = (H - 0.3) / courses;
  for (const axis of ["x", "z"]) for (const side of [-1, 1]) {
    const width = axis === "x" ? W : D, depth = axis === "x" ? D : W;
    const count = Math.max(3, Math.ceil(width / 0.43)), brickW = width / count;
    for (let row = 0; row < courses; row++) for (let i = 0; i < count + (row % 2); i++) {
      const left = Math.max(-width / 2, -width / 2 + (i - (row % 2) * 0.5) * brickW);
      const right = Math.min(width / 2, -width / 2 + (i + 1 - (row % 2) * 0.5) * brickW);
      if (right - left < 0.04) continue;
      const x = (left + right) / 2, y = 0.3 + (row + 0.5) * courseH;
      const bay = axis === "x" && Math.abs(Math.abs(x) - W * 0.28) < W * 0.12;
      if (bay && y > H * 0.36 && y < H * 0.76) continue;
      const b = box(right - left - 0.018, courseH - 0.018, 0.045, brick[(i * 3 + row * 5 + (side > 0 ? 1 : 0)) % 4]);
      if (axis === "x") put(walls, b, x, y, side * (depth / 2 + 0.012));
      else { b.rotation.y = Math.PI / 2; put(walls, b, side * (depth / 2 + 0.012), y, x); }
    }
  }
  const glass = industrialMaterial(0x4d5247, { emissive: new THREE.Color(ctx.theme.lamp), emissiveIntensity: 0.2 });
  for (const side of [-1, 1]) for (const x of [-W * 0.28, W * 0.28]) {
    const ww = W * 0.24, wh = H * 0.4, y = H * 0.56, z = side * (D / 2 + 0.044);
    put(walls, box(ww, wh, 0.025, dark), x, y, z);
    put(walls, box(ww * 0.84, wh * 0.84, 0.03, glass), x, y, z + side * 0.01);
    for (const dx of [-ww / 2, 0, ww / 2]) put(walls, box(0.045, wh + 0.12, 0.065, iron), x + dx, y, z);
    for (const dy of [-wh / 2, 0, wh / 2]) put(walls, box(ww + 0.1, 0.045, 0.065, iron), x, y + dy, z);
    put(walls, box(ww + 0.18, 0.12, 0.16, stone), x, y - wh / 2 - 0.04, z);
    put(walls, box(ww + 0.14, 0.13, 0.08, stone), x, y + wh / 2 + 0.08, z);
    // Soot and mineral streaks sit below the sill, never over the entire facade.
    for (let i = 0; i < 3; i++) put(walls, box(0.035 + i * 0.013, H * 0.13, 0.012, dark), x + (i - 1) * ww * 0.25, y - wh / 2 - H * 0.12, z - side * 0.012);
  }
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) {
    put(walls, box(0.12, H, 0.12, stone), x, H / 2, z);
  }
  // Service door and offset canopy on the end wall.
  const doorH = Math.min(1.4, H * 0.67), doorD = Math.min(1.05, D * 0.44);
  put(walls, box(0.06, doorH, doorD, dark), W / 2 + 0.04, doorH / 2 + 0.25, 0);
  for (const s of [-1, 1]) put(walls, box(0.065, doorH - 0.08, doorD * 0.46, paint), W / 2 + 0.075, doorH / 2 + 0.25, s * doorD * 0.24);
  put(walls, box(0.1, 0.04, doorD * 0.8, rust), W / 2 + 0.1, doorH * 0.54, 0);
  const awning = put(walls, box(Math.min(0.32, t.w * 0.1), 0.08, doorD * 1.2, slate), W / 2 + 0.1, doorH + 0.38);
  awning.rotation.z = -0.1;
  put(walls, box(W + 0.16, 0.13, D + 0.16, stone), 0, H + 0.03);
  // Flat maintenance deck and two sloped, ribbed roof shoulders. Engine feet
  // land on the deck beams, not a floating decorative roof.
  put(walls, box(W + 0.16, 0.16, D * 0.48, iron), 0, H + 0.15);
  for (const s of [-1, 1]) {
    const roof = put(walls, box(W + 0.2, 0.09, D * 0.29, slate), 0, H + 0.11, s * D * 0.36);
    roof.rotation.x = s * 0.15;
    for (let i = 0; i <= 12; i++) {
      const seam = put(walls, box(0.025, 0.035, D * 0.29, iron), -W / 2 + W * i / 12, H + 0.175, s * D * 0.36);
      seam.rotation.x = s * 0.15;
    }
    put(walls, box(W + 0.19, 0.09, 0.08, rust), 0, H + 0.08, s * (D / 2 + 0.015));
  }
  // Side pipe on brackets; bolts and flanges make its service joints legible.
  const px = -W / 2 - 0.16, pz = -D * 0.25;
  put(walls, cylinder(0.09, H, rust), px, H / 2 + 0.16, pz);
  for (const y of [0.4, H * 0.54, H - 0.1]) {
    flange(walls, px, y, pz, 0.15, iron);
    put(walls, box(0.22, 0.05, 0.07, iron), px + 0.07, y + 0.12, pz);
  }
  const outlet = put(walls, cylinder(0.09, Math.min(0.4, D * 0.3), rust), px, 0.32, pz + 0.12);
  outlet.rotation.x = Math.PI / 2;
  // Wall vents with individual louvres.
  put(walls, box(0.05, 0.5, D * 0.24, dark), -W / 2 - 0.04, H * 0.55, D * 0.19);
  for (let i = 0; i < 6; i++) put(walls, box(0.075, 0.035, D * 0.25, iron), -W / 2 - 0.065, H * 0.55 - 0.21 + i * 0.08, D * 0.19);
  mergeDetails(walls);

  const engine = new THREE.Group(); engine.name = "beam-engine";
  const scale = Math.min(1.25, W / 3.15, D / 1.8);
  engine.scale.setScalar(scale); engine.position.set(0, H + 0.28, 0); root.add(engine);
  const frame = new THREE.Group(); engine.add(frame);
  put(frame, box(2.9, 0.12, 1.2, iron), 0, 0.06);
  for (const z of [-0.36, 0.36]) {
    for (const x of [-0.58, 0.58]) {
      link(frame, V(x, 0.12, z), V(0, 1.7, z), 0.065, iron);
      put(frame, box(0.3, 0.09, 0.26, rust), x, 0.15, z);
      for (const dx of [-0.09, 0.09]) put(frame, cylinder(0.027, 0.12, iron, 6), x + dx, 0.2, z);
    }
    put(frame, box(0.27, 0.22, 0.18, iron), 0, 1.7, z);
    const bearing = put(frame, cylinder(0.115, 0.2, rust), 0, 1.7, z); bearing.rotation.x = Math.PI / 2;
  }
  const shaft = put(frame, cylinder(0.065, 0.98, iron), -0.95, 0.55); shaft.rotation.x = Math.PI / 2;
  const beamShaft = put(frame, cylinder(0.07, 0.92, iron), 0, 1.7); beamShaft.rotation.x = Math.PI / 2;
  for (const z of [-0.36, 0.36]) {
    put(frame, box(0.32, 0.4, 0.22, iron), -0.95, 0.29, z);
    flange(frame, -0.95, 0.55, z, 0.15, rust, "z");
  }
  put(frame, cylinder(0.18, 0.5, paint), 1.05, 0.39);
  flange(frame, 1.05, 0.15, 0, 0.23, iron);
  flange(frame, 1.05, 0.65, 0, 0.23, iron);
  put(frame, box(0.5, 0.13, 0.48, iron), 1.05, 0.1);
  for (const z of [-0.23, 0.23]) put(frame, cylinder(0.032, 1.3, iron), 1.05, 0.78, z);
  put(frame, box(0.18, 0.05, 0.55, iron), 1.05, 1.44, 0);
  // Discharge pipe leaves the pump body and drops to the building's wall line.
  link(frame, V(1.05, 0.25, 0.17), V(1.05, 0.25, 0.52), 0.065, rust);
  link(frame, V(1.05, 0.25, 0.52), V(0.45, 0.25, 0.52), 0.065, rust);
  flange(frame, 0.72, 0.25, 0.52, 0.11, iron, "x");
  mergeDetails(frame);

  const fly = new THREE.Group(); fly.name = "flywheel"; put(engine, fly, -0.95, 0.55, -0.28);
  fly.add(new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.055, 6, 32), iron));
  fly.add(new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.022, 5, 32), rust));
  for (let i = 0; i < 6; i++) {
    const spoke = box(0.045, 0.9, 0.035, paint); spoke.rotation.z = i * Math.PI / 6; fly.add(spoke);
  }
  const hub = put(fly, cylinder(0.12, 0.18, iron)); hub.rotation.x = Math.PI / 2;
  mergeDetails(fly);
  const crank = new THREE.Group(); put(engine, crank, -0.95, 0.55, 0);
  put(crank, box(0.34, 0.085, 0.09, paint), 0.12, 0, -0.025);
  put(crank, box(0.12, 0.21, 0.1, iron), -0.1, 0, -0.025);
  mergeDetails(crank);
  const beam = new THREE.Group(); beam.name = "walking-beam"; engine.add(beam);
  for (const y of [-0.08, 0.08]) put(beam, box(2.26, 0.045, 0.16, rust), 0, y);
  put(beam, box(2.18, 0.15, 0.05, paint));
  mergeDetails(beam);
  const drive = link(engine, V(), V(0, 1, 0), 0.04, iron); drive.name = "drive-rod";
  const pump = link(engine, V(), V(0, 1, 0), 0.035, iron); pump.name = "pump-rod";
  const ram = put(engine, cylinder(0.06, 1, iron));
  const pins = {};
  for (const name of ["crank-pin", "beam-drive-pin", "beam-pump-pin", "piston-pin"]) {
    const pin = cylinder(0.08, 0.17, rust, 12); pin.rotation.x = Math.PI / 2; pin.name = name; engine.add(pin); pins[name] = pin;
  }
  const phase = ctx.rand() * Math.PI * 2;
  function animate(dt, now) {
    const p = pumpPose(now * 1.2 + phase);
    fly.rotation.z = now * 1.2 + phase;
    crank.rotation.z = fly.rotation.z;
    beam.position.copy(p.pivot);
    beam.rotation.z = Math.atan2(p.pumpEnd.y - p.pivot.y, p.pumpEnd.x - p.pivot.x);
    setLink(drive, p.crankPin, p.beamEnd); setLink(pump, p.pumpEnd, p.piston);
    setLink(ram, V(1.05, 0.3, 0), p.piston);
    pins["crank-pin"].position.copy(p.crankPin);
    pins["beam-drive-pin"].position.copy(p.beamEnd);
    pins["beam-pump-pin"].position.copy(p.pumpEnd);
    pins["piston-pin"].position.copy(p.piston);
  }
  animate(0, 0); ctx.anim(animate);
  const vent = new THREE.Object3D(); vent.position.set(px, 0.32, pz + 0.25); root.add(vent);
  steamValve(ctx, vent, { every: 5, size: 0.35, dir: V(0, 0.8, 0.5) });
  return root;
}

export function sandbagsRemodel(t, ctx) {
  const root = new THREE.Group(); root.name = "remodel-sandbags";
  const bags = [0xa18e69, 0x827657, 0x95866a].map((c) => industrialMaterial(c, { metalness: 0 }));
  const seam = industrialMaterial(0x655c47, { metalness: 0 }), iron = industrialMaterial(0x47433a);
  const width = Math.min(0.69, t.w * 0.9), depth = Math.min(0.34, t.h * 0.8);
  const bagGeo = new THREE.SphereGeometry(0.5, 12, 7);
  // Pinched ends and sagging, uneven shoulders look filled, not inflated.
  const positions = bagGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const pinch = 1 - 0.25 * (Math.abs(x) * 2) ** 4;
    positions.setXYZ(i, x, y * pinch + 0.025 * Math.cos(x * 13) * (0.5 - Math.abs(y)), z * pinch);
  }
  bagGeo.computeVertexNormals();
  const courses = 3, rows = t.h > 0.7 ? [-t.h * 0.2, t.h * 0.2] : [0];
  for (let row = 0; row < courses; row++) {
    const count = Math.max(1, Math.floor(t.w / width) - row % 2);
    for (let i = 0; i < count; i++) for (const z of rows) {
      const x = (i - (count - 1) / 2) * width, y = 0.13 + row * 0.21;
      const bag = put(root, new THREE.Mesh(bagGeo, bags[(i + row) % 3]), x, y, z);
      bag.scale.set(width * 0.97, 0.29, depth); bag.rotation.set(0, ((i % 3) - 1) * 0.04, ((i + row) % 2 ? 1 : -1) * 0.025);
      // The tied seam lies along the exposed shoulder, with tiny stitch marks.
      put(root, box(width * 0.7, 0.012, 0.018, seam), x, y + 0.08, z + depth * 0.38);
      for (let k = 0; k < 4; k++) put(root, box(0.016, 0.023, 0.023, bags[0]), x + (k - 1.5) * width * 0.16, y + 0.08, z + depth * 0.4);
    }
  }
  // Tensioned wire stays attached to two short pickets, deliberately sparse.
  const wireSpan = Math.max(0.2, t.w - 0.25), wireY = 0.83;
  for (const x of [-wireSpan / 2, wireSpan / 2]) put(root, box(0.035, 0.84, 0.035, iron), x, 0.43);
  for (const y of [wireY - 0.1, wireY]) {
    link(root, V(-wireSpan / 2, y, 0), V(wireSpan / 2, y, 0), 0.009, iron);
    for (let x = -wireSpan / 2 + 0.1; x < wireSpan / 2; x += 0.35) {
      link(root, V(x - 0.035, y - 0.04, 0), V(x + 0.035, y + 0.04, 0), 0.006, iron);
    }
  }
  const signalX = t.w * 0.35;
  put(root, box(0.025, 0.95, 0.025, iron), signalX, 0.475, 0);
  mergeDetails(root);
  blinker(ctx, root, V(signalX, 0.98, 0), ctx.theme.lamp, { period: 2.4, duty: 0.5, size: 0.045 });
  return root;
}

export function drumsRemodel(t, ctx) {
  const root = new THREE.Group(); root.name = "remodel-drums";
  const paint = [0x754c37, 0x66705a, 0x4c6061].map((c) => industrialMaterial(c));
  const iron = industrialMaterial(0x373d39), rust = industrialMaterial(0x835738), stencil = industrialMaterial(0xb3ab87, { metalness: 0 });
  const r = Math.min(0.27, Math.min(t.w, t.h) / 3.5), height = r * 3.1;
  const cols = Math.max(1, Math.floor(t.w / (r * 2.35))), rows = Math.max(1, Math.floor(t.h / (r * 2.35)));
  const drum = (x, y, z, index, tipped = false) => {
    const d = new THREE.Group(); put(root, d, x, y, z);
    if (tipped) { d.rotation.z = Math.PI / 2; d.rotation.y = 0.25; }
    else d.rotation.y = index * 0.9;
    const profile = [
      [r * 0.92, -height / 2], [r, -height * 0.47], [r * 0.97, -height * 0.29],
      [r * 1.035, -height * 0.26], [r * 0.97, -height * 0.22], [r * 0.99, 0],
      [r * 0.97, height * 0.22], [r * 1.035, height * 0.26], [r * 0.97, height * 0.29],
      [r, height * 0.47], [r * 0.92, height / 2],
    ];
    d.add(new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 20), paint[index % 3]));
    for (const side of [-1, 1]) {
      put(d, cylinder(r * 0.93, 0.018, paint[index % 3], 20), 0, side * height / 2);
      const rim = put(d, new THREE.Mesh(new THREE.TorusGeometry(r * 0.97, r * 0.032, 5, 20), iron), 0, side * height * 0.49);
      rim.rotation.x = Math.PI / 2;
    }
    put(d, cylinder(r * 0.12, 0.035, iron, 8), r * 0.46, height / 2 + 0.015, 0);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + index, y = height * (0.17 - (i % 3) * 0.18);
      const scar = put(d, box(r * 0.18, height * (0.13 + i * 0.02), 0.008, rust), Math.sin(a) * r, y, Math.cos(a) * r);
      scar.rotation.y = a;
    }
    // Pale warehouse paint dashes, wrapped close to the drum's front.
    for (let i = 0; i < 3; i++) put(d, box(r * 0.36, height * 0.027, 0.008, stencil), 0, height * (0.08 - i * 0.07), r * 0.994);
  };
  let index = 0;
  for (let x = 0; x < cols; x++) for (let z = 0; z < rows; z++) {
    if (cols * rows > 4 && (x + z * 3) % 5 === 4) continue;
    drum((x - (cols - 1) / 2) * r * 2.35, height / 2 + 0.04, (z - (rows - 1) / 2) * r * 2.35, index++);
  }
  if (Math.min(t.w, t.h) >= 1.9) drum(0, height + r * 1.08 + 0.04, 0, index, true);
  const stain = put(root, new THREE.Mesh(new THREE.CircleGeometry(Math.min(t.w, t.h) * 0.28, 24), industrialMaterial(0x292b25, { metalness: 0 })), 0, 0.012, 0);
  stain.rotation.x = -Math.PI / 2; stain.scale.y = 0.65;
  mergeDetails(root);
  blinker(ctx, root, V(-(cols - 1) * r * 1.175, height + 0.09, -(rows - 1) * r * 1.175), 0xffa020, { period: 1.3, duty: 0.4, size: r * 0.16 });
  return root;
}
