// Inspection-only Tyrian geometry. Added metal belongs to its actual moving
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

function batch(parent, part) {
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
const ring = (radius, tube, material, arc = TAU) => new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, radius > .1 ? 32 : 20, arc), material);
const rounded = (w, h, d, material) => refineHeroPart(box(w, h, d, material));
function hose(points, radius, material, segments = 12) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 6, false), material);
}
function rod(a, b, radius, material, segments = 12) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const mesh = cyl(radius, radius, delta.length(), material, segments);
  mesh.position.copy(start.add(end).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}
function boltCircle(b, center, radius, count, material) {
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count;
    b.add(at(drumZ(.022, .025, material, 6), center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius, center[2]));
  }
}

export function addTyrianMachinery(built, mats) {
  const { chest, legs, torso, mechanics } = built;
  const cab = batch(chest, 'torso');
  // Split windscreen wipers lie on the raked glazing, with pivots at its foot.
  for (const side of [-1, 1]) {
    const z = side * .19;
    cab.add(rod([.415, .48, z], [.335, .605, z + .07], .009, mats.steel));
    cab.add(rod([.35, .59, z + .005], [.325, .63, z + .13], .011, mats.rubber));
    // Hinged service door, sill, grab handle and corner fasteners.
    cab.add(at(rounded(.42, .25, .025, mats.paint), -.22, -.035, side * .445));
    for (const y of [-.10, .04]) cab.add(at(cyl(.018, .018, .065, mats.steel, 12), -.43, y, side * .461));
    cab.add(hose([[-.35, .045, side * .455], [-.35, .08, side * .50], [-.22, .08, side * .50], [-.22, .045, side * .455]], .012, mats.steel, 12));
    // Tow eyes have real shanks through the bumper.
    cab.add(at(rod([0, 0, 0], [.09, 0, 0], .028, mats.steel), 1.025, -.34, side * .39));
    cab.add(at(rot(ring(.054, .016, mats.steel), 0, Math.PI / 2, 0), 1.10, -.34, side * .39));
    // Paired hood latches close onto the bonnet's lower side lip.
    for (const x of [.25, .69]) {
      cab.add(at(rounded(.055, .09, .025, mats.dark), x, -.15, side * (.43 - (x - .05) * .108)));
      cab.add(at(cyl(.012, .012, .065, mats.brass, 12), x, -.15, side * (.45 - (x - .05) * .108)));
    }
  }
  cab.flush();

  const engine = torso.getObjectByName('diesel-engine'), b = batch(engine, 'backpack');
  // Three exposed finned cylinder barrels and curved injector pipes.
  for (const z of [-.34, 0, .34]) {
    for (let i = 0; i < 7; i++) b.add(at(cyl(.142, .142, .014, mats.dark, 24), -.11, -.08 + i * .042, z));
    b.add(hose([[.035, -.05, z], [.10, .05, z], [.09, .31, z], [-.11, .31, z]], .012, mats.brass));
    b.add(at(rounded(.12, .045, .15, mats.paint), -.11, .315, z));
    for (const x of [-.15, -.07]) b.add(at(cyl(.013, .013, .02, mats.steel, 6), x, .348, z));
  }
  // Oil filter, drain union, pressure line and a manifold-mounted valve wheel.
  b.add(at(cyl(.074, .063, .23, mats.paint, 32), .08, -.13, -.53));
  b.add(at(cyl(.082, .082, .035, mats.steel, 32), .08, -.015, -.53));
  b.add(at(drumZ(.035, .045, mats.brass, 6), .08, -.24, -.59));
  b.add(hose([[.08, -.015, -.53], [.14, .02, -.53], [.14, .15, -.40], [.02, .18, -.40]], .024, mats.rubber));
  b.add(hose([[-.09, .44, -.37], [-.22, .44, -.45], [-.23, .10, -.42], [-.11, -.06, -.34]], .018, mats.rubber));
  b.add(rod([-.23, .2, -.42], [-.23, .2, -.52], .023, mats.brass));
  b.add(at(ring(.065, .012, mats.brass), -.23, .20, -.53));
  for (let i = 0; i < 3; i++) b.add(at(rot(box(.12, .012, .012, mats.brass), 0, 0, i * TAU / 3), -.23, .2, -.53));
  // Exhaust heat shields, clamp bands and genuinely hollow stack rims.
  for (const stack of built.stacks) {
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
  // Negative-side cooling fan: shaft, mounting bars and protective wire cage.
  const fan = new THREE.Group(); fan.name = 'diesel-cooling-fan'; fan.position.set(-.15, -.02, -.64); engine.add(fan);
  const blades = batch(fan, 'backpack');
  blades.add(drumZ(.052, .075, mats.steel, 24));
  for (let i = 0; i < 6; i++) blades.add(at(rot(rounded(.16, .055, .018, mats.steel), .25, 0, i * TAU / 6), Math.cos(i * TAU / 6) * .10, Math.sin(i * TAU / 6) * .10, 0));
  blades.flush(); mechanics.fan = fan;
  b.add(at(drumZ(.08, .14, mats.dark, 32), -.15, -.02, -.55));
  for (const radius of [.11, .20]) b.add(at(ring(radius, .008, mats.steel), -.15, -.02, -.68));
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    b.add(rod([-.15, -.02, -.69], [-.15 + Math.cos(a) * .20, -.02 + Math.sin(a) * .20, -.69], .006, mats.dark));
  }
  for (const y of [-.18, .14]) b.add(at(rounded(.26, .035, .10, mats.dark), -.15, y, -.56));
  // Rear radiator frame carries its slats and the existing pennant mounts.
  for (const z of [-.52, .52]) b.add(at(rounded(.075, .47, .045, mats.dark), -.43, -.03, z));
  for (const y of [-.25, .20]) b.add(at(rounded(.075, .035, 1.08, mats.dark), -.43, y, 0));
  b.flush();

  // Greaseable bearing covers and leaf-spring packs belong to each leg pivot.
  for (const leg of legs) {
    for (const [parent, radius, outerZ] of [[leg.hip, .15, .225], [leg.knee, .125, .255]]) {
      const p = batch(parent, 'legs'), z = leg.side * outerZ;
      p.add(at(drumZ(radius, .055, mats.paint, 32), 0, 0, z));
      p.add(at(drumZ(.055, .075, mats.dark, 24), 0, 0, z));
      boltCircle(p, [0, 0, z + leg.side * .032], radius * .77, 6, mats.steel);
      p.add(at(drumZ(.018, .025, mats.brass, 6), 0, 0, z + leg.side * .05));
      p.flush();
    }
    const feet = batch(leg.ankle, 'feet');
    for (const side of [-1, 1]) for (let layer = 0; layer < 3; layer++) {
      const spring = new THREE.Shape(), left = -.12 + layer * .04, right = .39 - layer * .04, arch = .12 + layer * .015;
      spring.moveTo(left, .045); spring.quadraticCurveTo(.12, arch, right, .045);
      spring.lineTo(right, .035); spring.quadraticCurveTo(.12, arch - .01, left, .035); spring.closePath();
      const geo = new THREE.ExtrudeGeometry(spring, { depth: .035, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geo.translate(0, 0, side * .18 - .0175); feet.add(new THREE.Mesh(geo, mats.dark));
    }
    feet.flush();
  }
}

export function detailTyrianWeapons(lr, me, mats) {
  // Retain the original spinning groups and muzzle positions.
  for (const root of [lr.group, me.group]) root.traverse(o => { if (o.isMesh) refineHeroPart(o); });
  const rotor = batch(lr.spin, 'weapons');
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6, y = Math.cos(a) * .14, z = Math.sin(a) * .14;
    rotor.add(at(rot(ring(.045, .007, mats.steel), 0, Math.PI / 2), 1.102, y, z));
    rotor.add(at(rot(cyl(.033, .033, .006, mats.dark, 24), 0, 0, Math.PI / 2), 1.104, y, z));
  }
  rotor.flush();
  const gun = batch(lr.group, 'weapons');
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    gun.add(at(rot(box(.018, .018, .23, mats.steel), 0, 0, a), -.14 + Math.cos(a) * .243, -.20 + Math.sin(a) * .243, -.30));
  }
  gun.add(hose([[-.29, -.12, -.15], [-.39, -.30, -.18], [-.10, -.39, -.18], [.15, -.22, -.15]], .025, mats.rubber));
  gun.flush();
  const saw = batch(me.spin, 'weapons');
  for (const z of [-.032, .032]) {
    saw.add(at(ring(.32, .009, mats.dark), 0, 0, z));
    boltCircle(saw, [0, 0, z], .19, 8, mats.steel);
  }
  saw.flush();
}

// Merge only fixed leaf meshes. Objects referenced by animation, wear or
// attachment code stay intact; moving parents never get combined together.
export function compactTyrianDetails(built, lr, me) {
  // Ace's painted tip and Rust's repair collars must not seal the new bores.
  for (const stack of built.stacks) for (const mesh of stack.children) {
    const p = mesh.geometry?.parameters;
    if (mesh.geometry?.type !== 'CylinderGeometry' || p.openEnded) continue;
    const old = mesh.geometry;
    mesh.geometry = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 24, p.heightSegments, true);
    old.dispose();
  }
  const protectedMeshes = new Set([...built.stacks, ...built.mechanics.links.flatMap(l => [l.sleeve, l.rod])]);
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
