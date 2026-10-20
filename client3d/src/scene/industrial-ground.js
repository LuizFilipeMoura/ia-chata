import * as THREE from "three";
import { industrialMaterial, mergeDetails } from "./environment-remodel.js";

let oilMask;
function oilAlpha() {
  if (oilMask) return oilMask;
  const size = 96, data = new Uint8Array(size * size * 4);
  let seed = 537;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, angle = Math.atan2(v, u);
    const edge = 0.7 + Math.sin(angle * 3 + 0.8) * 0.07 + Math.sin(angle * 5) * 0.05 + Math.cos(angle * 9) * 0.025;
    const fade = Math.max(0, Math.min(1, (edge - Math.hypot(u, v)) / 0.3));
    seed = seed * 16807 % 2147483647;
    const alpha = Math.round(255 * fade * fade * (3 - 2 * fade) * (0.55 + seed / 2147483647 * 0.4));
    data.set([alpha, alpha, alpha, 255], (y * size + x) * 4);
  }
  oilMask = new THREE.DataTexture(data, size, size);
  oilMask.magFilter = THREE.LinearFilter; oilMask.minFilter = THREE.LinearMipmapLinearFilter;
  oilMask.generateMipmaps = true; oilMask.needsUpdate = true;
  return oilMask;
}

// Local workshop apron. Everything lies inside the requested rectangle and
// below 15 cm; floor marks communicate use without competing with game rings.
export function industrialGround(w, d) {
  const root = new THREE.Group(); root.name = "industrial-ground";
  const concrete = [0x77776a, 0x686b61, 0x818074].map((c) => industrialMaterial(c, { metalness: 0 }));
  const dirt = industrialMaterial(0x444a3e, { metalness: 0 });
  const oil = industrialMaterial(0x30362f, { metalness: 0, roughness: 0.94 });
  const oilStain = industrialMaterial(0x30362f, {
    metalness: 0, roughness: 0.96, alphaMap: oilAlpha(),
    transparent: true, opacity: 0.66, depthWrite: false,
  });
  const iron = industrialMaterial(0x454b43), gravel = industrialMaterial(0x77786c, { metalness: 0 });
  const ochre = industrialMaterial(0x9e9261, { metalness: 0 });
  function slab(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z); root.add(mesh); return mesh;
  }
  slab(w, 0.02, d, 0, 0.001, 0, dirt);
  const padW = w * 0.78, padD = d * 0.72;
  const nx = Math.max(2, Math.floor(padW / 2.8)), nz = Math.max(2, Math.floor(padD / 2.8));
  const tileW = padW / nx, tileD = padD / nz;
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
    slab(tileW - 0.035, 0.045, tileD - 0.035, (x - (nx - 1) / 2) * tileW, 0.027, (z - (nz - 1) / 2) * tileD, concrete[(x + z * 2) % 3]);
  }
  // Long service path and drain, with grounded crossbars instead of a black decal.
  const drainZ = d * 0.29, drainW = Math.min(0.3, d * 0.06);
  slab(w * 0.86, 0.055, drainW, 0, 0.03, drainZ, oil);
  for (const z of [drainZ - drainW / 2, drainZ + drainW / 2]) slab(w * 0.86, 0.045, 0.035, 0, 0.055, z, iron);
  const bars = Math.floor(w * 0.86 / 0.17);
  for (let i = 0; i < bars; i++) slab(0.035, 0.035, drainW, (i - (bars - 1) / 2) * 0.17, 0.063, drainZ, iron);
  // Worn road paint breaks at slab joints. Keeps a broad open route through rigs.
  for (let x = -w * 0.36; x < w * 0.36; x += 1.2) {
    slab(Math.min(0.55, w * 0.1), 0.004, 0.055, x, 0.054, -d * 0.2, ochre);
  }
  let state = 79;
  const rand = () => ((state = state * 16807 % 2147483647) / 2147483647);
  const stone = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < Math.min(240, Math.round(w * d * 0.45)); i++) {
    const x = (rand() - 0.5) * w * 0.96, z = (rand() - 0.5) * d * 0.96;
    if (Math.abs(x) < padW * 0.47 && Math.abs(z) < padD * 0.47) continue;
    const mesh = new THREE.Mesh(stone, gravel), r = Math.min(0.07, w * 0.015, d * 0.015) * (0.4 + rand() * 0.6);
    mesh.scale.set(r, r * 0.5, r * 0.8); mesh.position.set(x, r * 0.5 + 0.02, z);
    mesh.rotation.y = rand() * 6; root.add(mesh);
  }
  // Localized porous oil patches and wheel rub, matte even in direct light.
  for (const [x, z, size] of [[-0.24, -0.08, 0.06], [0.26, -0.16, 0.045], [0.05, 0.21, 0.035]]) {
    const radius = Math.min(w, d) * size;
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), oilStain);
    patch.rotation.x = -Math.PI / 2; patch.scale.y = 0.55; patch.position.set(x * w, 0.057, z * d); root.add(patch);
  }
  for (const z of [-d * 0.11, -d * 0.07]) slab(w * 0.45, 0.003, Math.min(0.13, d * 0.02), 0, 0.054, z, dirt);
  mergeDetails(root);
  root.traverse((node) => { node.castShadow = false; });
  return root;
}
