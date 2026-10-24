// Shared inspection geometry. Added metal belongs to its actual moving
// assembly; small fixed pieces are merged by material before rendering.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { THREE, box, cyl, at, rot, drumZ } from './kit.js';

const TAU = Math.PI * 2;
export function refineHeroPart(mesh) {
  const old = mesh.geometry, p = old.parameters;
  let geometry;
  if (old.type === 'BoxGeometry' && Math.max(p.width, p.height, p.depth) > .12 && Math.min(p.width, p.height, p.depth) >= .035) {
    geometry = new RoundedBoxGeometry(p.width, p.height, p.depth, 1, Math.min(.035, p.width * .2, p.height * .2, p.depth * .2));
  } else if (old.type === 'CylinderGeometry' && p.radialSegments >= 8) {
    geometry = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, Math.max(p.radiusTop, p.radiusBottom) > .1 ? 32 : 24, p.heightSegments, p.openEnded, p.thetaStart, p.thetaLength);
  } else if (old.type === 'TorusGeometry') {
    geometry = new THREE.TorusGeometry(p.radius, p.tube, 10, Math.max(32, p.tubularSegments * 2), p.arc);
  } else if (old.type === 'ExtrudeGeometry') {
    const extruded = new THREE.ExtrudeGeometry(p.shapes, { ...p.options, bevelSegments: 3, curveSegments: 24 });
    // Preserve translations baked into the existing extrusion.
    old.computeBoundingBox(); extruded.computeBoundingBox();
    const offset = old.boundingBox.getCenter(new THREE.Vector3()).sub(extruded.boundingBox.getCenter(new THREE.Vector3()));
    extruded.translate(...offset.toArray());
    geometry = toCreasedNormals(extruded, Math.PI / 3); extruded.dispose();
  }
  if (geometry) { mesh.geometry = geometry; old.dispose(); }
  return mesh;
}

export function batch(parent, part) {
  const bins = new Map();
  return {
    add(mesh) {
      mesh.updateMatrix();
      let g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      if (g.index) { const indexed = g; g = g.toNonIndexed(); indexed.dispose(); }
      mesh.geometry.dispose();
      if (!bins.has(mesh.material)) bins.set(mesh.material, []);
      bins.get(mesh.material).push(g);
    },
    flush() {
      for (const [material, geometries] of bins) {
        const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material);
        geometries.forEach(g => g.dispose());
        mesh.name = `${part}:detail-batch`; mesh.userData.part = part;
        mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
      }
    },
  };
}
export const ring = (radius, tube, material, arc = TAU) => new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, radius > .1 ? 32 : 20, arc), material);
export const rounded = (w, h, d, material) => refineHeroPart(box(w, h, d, material));
export function hose(points, radius, material, segments = 12) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 6, false), material);
}
export function rod(a, b, radius, material, segments = 12) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const mesh = cyl(radius, radius, delta.length(), material, segments);
  mesh.position.copy(start.add(end).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}
export function boltCircle(b, center, radius, count, material) {
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count;
    b.add(at(drumZ(.022, .025, material, 6), center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius, center[2]));
  }
}

export function detailExhaustStacks(stacks, mats) {
  // Exhaust heat shields, clamp bands and genuinely hollow stack rims.
  for (const stack of stacks) {
    refineHeroPart(stack);
    const p = stack.geometry.parameters, top = p.height / 2;
    stack.geometry.dispose();
    stack.geometry = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 24, 1, true);
    const stackBatch = batch(stack, 'backpack');
    stackBatch.add(at(rot(ring(.067, .009, mats.steel), Math.PI / 2), 0, top, 0));
    const lining = new THREE.CylinderGeometry(.055, .055, .10, 24, 1, true);
    // Inside faces point toward the bore. Keep a dark floor below the mouth.
    for (let i = 0; i < lining.index.count; i += 3) {
      const a = lining.index.getX(i); lining.index.setX(i, lining.index.getX(i + 2)); lining.index.setX(i + 2, a);
    }
    for (let i = 0; i < lining.attributes.normal.array.length; i++) lining.attributes.normal.array[i] *= -1;
    stackBatch.add(at(new THREE.Mesh(lining, mats.dark), 0, top - .05, 0));
    stackBatch.add(at(cyl(.055, .055, .004, mats.dark, 24), 0, top - .10, 0));
    // Separate strips leave vertical slots; no opaque cylinder over the pipe.
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      stackBatch.add(at(rot(box(.028, .19, .009, mats.steel), 0, a, 0), Math.sin(a) * .092, -.02, Math.cos(a) * .092));
    }
    for (const y of [-.12, .08]) stackBatch.add(at(rot(ring(.092, .010, mats.dark), Math.PI / 2), 0, y, 0));
    stackBatch.flush();
  }
}

// Merge only fixed leaf meshes. Objects referenced by animation, wear or
// attachment code stay intact; moving parents never get combined together.
export function compactWalkerDetails(built, lr, me) {
  // Ace's painted tip and Rust's repair collars must not seal the new bores.
  for (const stack of built.stacks) for (const mesh of stack.children) {
    const p = mesh.geometry?.parameters;
    if (mesh.geometry?.type !== 'CylinderGeometry' || p.openEnded) continue;
    const old = mesh.geometry;
    mesh.geometry = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 24, p.heightSegments, true);
    old.dispose();
  }
  const protectedMeshes = new Set([me.shield, ...built.stacks, ...built.mechanics.links.flatMap(l => [l.sleeve, l.rod])]);
  const parents = [];
  built.pelvis.traverse(o => { if (o.children.length) parents.push(o); });
  for (const parent of parents) {
    const bins = new Map();
    for (const mesh of parent.children) {
      if (!mesh.isMesh || mesh.children.length || protectedMeshes.has(mesh) || mesh.userData.surfaceMark ||
          mesh.userData.clean || !mesh.material?.isMeshStandardMaterial || mesh.material.map) continue;
      // Accessory groups keep their attachment pivots; combine only structural
      // batches and the fixed meshes directly under the two weapon assemblies.
      if (!mesh.name.endsWith(':detail-batch') && !parent.name.endsWith(':armor-mount') && ![lr.group, lr.spin, me.group, me.spin].includes(parent)) continue;
      const key = `${mesh.material.uuid}:${mesh.userData.part || 'weapons'}`;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(mesh);
    }
    for (const meshes of bins.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(mesh => {
        mesh.updateMatrix(); let g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
        if (g.index) { const indexed = g; g = g.toNonIndexed(); indexed.dispose(); }
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        return g;
      });
      const merged = new THREE.Mesh(mergeGeometries(geometries, false), meshes[0].material);
      merged.name = meshes[0].name || 'weapons:detail-batch'; merged.userData = { ...meshes[0].userData };
      merged.castShadow = merged.receiveShadow = true; parent.add(merged);
      for (const mesh of meshes) { parent.remove(mesh); mesh.geometry.dispose(); }
      geometries.forEach(g => g.dispose());
    }
  }
}
