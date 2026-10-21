// Black and Tyrian's tank-walker bodies. The body remains a miniature: broad
// armor sits on short articulated load-bearing legs, with real anchor points
// for every moving actuator. +x is forward; z is the width of the machine.
import { mergeGeometries, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import { THREE, mat, surfaceMat, box, cyl, torus, drumX, drumZ, at, rot, rngFrom } from "./kit.js";
import { BASE_TOP, flattenFoot } from "./body.js";
import { refineHeroPart, addTyrianMachinery, detailTyrianWeapons, compactTyrianDetails } from './tyrian-detail.js';

const TAU = Math.PI * 2;
const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3();

export function defaultTankWalkerShake(name) {
  return name === "Tyrian" ? { magnitude: 0.11, frequency: 0.82 } : { magnitude: 1, frequency: 1 };
}

export function tankWalkerName(name, chassis) {
  if (name === "Black" || chassis === "medium-shield-siege") return "Black";
  if (name === "Tyrian" || chassis === "light-saw-minigun") return "Tyrian";
  return null;
}

// Small shapes are merged by material within their actual moving parent.
// This keeps rivets, cooling fins and tread lugs from becoming draw calls.
function batch(parent, part, surfaceMark = false, hero = false) {
  const bins = new Map();
  return {
    add(mesh) {
      if (hero) refineHeroPart(mesh);
      mesh.updateMatrix();
      let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      mesh.geometry.dispose();
      if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
      if (!geometry.attributes.uv) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
      if (!bins.has(mesh.material)) bins.set(mesh.material, []);
      bins.get(mesh.material).push(geometry);
    },
    flush() {
      for (const [material, geometries] of bins) {
        const geometry = mergeGeometries(geometries, false);
        geometries.forEach((g) => g.dispose());
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.part = part;
        if (surfaceMark) mesh.userData.surfaceMark = true;
        mesh.name = `${part}:detail-batch`;
        parent.add(mesh);
      }
      bins.clear();
    },
  };
}
function anchor(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z); parent.add(o);
  return o;
}
function socket(sockets, key, parent, x, y, z) {
  const o = anchor(parent, x, y, z); o.name = `socket:${key}`; sockets[key] = o;
  return o;
}
function bolts(b, x, y, z, count, span, material, axis = "z") {
  for (let i = 0; i < count; i++) {
    const offset = span * (i / Math.max(1, count - 1) - 0.5);
    b.add(at(rot(cyl(0.026, 0.026, 0.025, material, 6), 0, 0, Math.PI / 2),
      x, y + (axis === "y" ? offset : 0), z + (axis === "z" ? offset : 0)));
  }
}

// Actual armor volume with clipped plan corners and differently sized upper /
// lower outlines. The facets are load-bearing slopes, not boxes rotated on top.
function casemate(lower, upper, y0, y1, bevel, material) {
  const ring = ([rear, front, halfWidth], y) => [
    [rear + bevel, y, -halfWidth], [front - bevel, y, -halfWidth],
    [front, y, -halfWidth + bevel], [front, y, halfWidth - bevel],
    [front - bevel, y, halfWidth], [rear + bevel, y, halfWidth],
    [rear, y, halfWidth - bevel], [rear, y, -halfWidth + bevel],
  ];
  return new THREE.Mesh(new ConvexGeometry([...ring(lower, y0), ...ring(upper, y1)].map((p) => new THREE.Vector3(...p))), material);
}
function profile(points, width, material, bevel = 0.035) {
  bevel = Math.min(bevel, width * 0.45);
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 10,
  });
  geo.translate(0, 0, -width / 2 + bevel);
  return new THREE.Mesh(geo, material);
}
function bonnet(material, hero = false) {
  const points = [];
  // Hand-formed truck bonnet: broad round rear shoulder tapering toward radiator.
  const sections = hero ? [[.05, .43, .34], [.27, .417, .337], [.60, .38, .30], [.88, .34, .25]] : [[.05, .43, .34], [.88, .34, .25]];
  const segments = hero ? 32 : 12;
  for (const [x, radius, rise] of sections) {
    points.push(new THREE.Vector3(x, -0.25, -radius), new THREE.Vector3(x, -0.25, radius));
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI;
      points.push(new THREE.Vector3(x, -0.05 + Math.sin(angle) * rise, Math.cos(angle) * radius));
    }
  }
  const geometry = new ConvexGeometry(points);
  if (!hero) return new THREE.Mesh(geometry, material);
  const smooth = toCreasedNormals(geometry, Math.PI / 4); geometry.dispose();
  return new THREE.Mesh(smooth, material);
}
function fender(material, radius = 0.53, width = 0.22) {
  const shape = new THREE.Shape(), inner = radius - 0.065;
  shape.moveTo(-radius, 0); shape.absarc(0, 0, radius, Math.PI, 0, true);
  shape.lineTo(inner, 0); shape.absarc(0, 0, inner, 0, Math.PI, false); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true,
    bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, steps: 1, curveSegments: 16 });
  geo.translate(0, 0, -width / 2);
  return new THREE.Mesh(geo, material);
}

function buildBlackHull(torso, mats, glass) {
  const chest = new THREE.Group(); chest.name = "sloped-tank-casemate"; torso.add(chest);
  const b = batch(chest, "torso");
  b.add(casemate([-0.88, 1.00, 1.00], [-0.75, 0.48, 0.70], -0.30, 0.38, 0.19, mats.paint));
  b.add(casemate([-0.93, 1.01, 1.04], [-0.88, 1.00, 1.00], -0.42, -0.30, 0.20, mats.dark));
  b.add(casemate([-0.76, 0.49, 0.72], [-0.73, 0.46, 0.69], 0.38, 0.43, 0.14, mats.trim));
  // Thick lower glacis and recessed central driver's hatch sit on the slopes.
  b.add(at(profile([[0.82, -0.28], [1.045, -0.25], [0.70, 0.15], [0.64, 0.12]], 1.42, mats.dark, 0.025), 0, 0, 0));
  b.add(at(profile([[0.84, -0.20], [1.005, -0.20], [0.68, 0.13], [0.61, 0.13]], 1.31, mats.paint, 0.018), 0, 0, 0));
  for (const z of [-0.42, 0.42]) b.add(at(box(0.10, 0.055, 0.15, mats.steel), 0.70, 0.12, z, 0.65));
  for (const side of [-1, 1]) {
    // Side applique follows the side slope, retaining visible steel seams.
    b.add(at(profile([[-0.58, -0.22], [0.47, -0.22], [0.32, 0.18], [-0.55, 0.18]], 0.065, mats.dark, 0.022), -0.02, 0, side * 0.89));
    b.add(at(profile([[-0.52, -0.18], [0.40, -0.18], [0.27, 0.13], [-0.50, 0.13]], 0.07, mats.paint, 0.018), -0.02, 0, side * 0.93));
    for (const x of [-0.57, 0.24]) b.add(at(rot(torus(0.07, 0.024, mats.steel, Math.PI, 10), 0, Math.PI / 2, 0), x, 0.43, side * 0.52));
    for (let i = 0; i < 5; i++) b.add(at(box(0.045, 0.012, 0.29, mats.dark), -0.57 + i * 0.105, 0.447, side * 0.40));
  }
  bolts(b, 1.035, -0.26, 0, 7, 1.32, mats.steel);
  b.flush();
  const head = new THREE.Group(); head.name = "recessed-command-cupola"; torso.add(head);
  const h = batch(head, "head");
  h.add(at(cyl(0.36, 0.42, 0.15, mats.dark, 8), -0.24, 0.50, 0));
  h.add(at(cyl(0.37, 0.39, 0.075, mats.paint, 8), -0.24, 0.61, 0));
  h.add(at(box(0.03, 0.065, 0.43, glass), 0.165, 0.50, 0));
  h.add(at(box(0.065, 0.035, 0.49, mats.trim), 0.16, 0.56, 0));
  h.add(at(box(0.15, 0.04, 0.055, mats.steel), -0.25, 0.67, 0));
  h.flush();
  return { chest, front: 1.04, frontY: -0.22, back: -1.17, top: 0.69, halfW: 0.98 };
}

function buildTyrianHull(torso, mats, glass, hero) {
  const chest = new THREE.Group(); chest.name = "truck-cab-and-bonnet"; torso.add(chest);
  const b = batch(chest, "torso", false, hero);
  // Open truck ladder frame. There is deliberately no full-width torso box.
  for (const side of [-1, 1]) {
    b.add(at(box(1.70, 0.13, 0.095, mats.dark), -0.15, -0.30, side * 0.36));
    b.add(at(box(1.66, 0.025, 0.14, mats.steel), -0.15, -0.23, side * 0.36));
    b.add(at(fender(mats.paint), 0.17, -0.18, side * 0.67));
    b.add(at(fender(mats.trim, 0.55, 0.025), 0.17, -0.18, side * 0.785));
    b.add(at(box(0.18, 0.26, 0.20, mats.rubber), -0.33, -0.31, side * 0.67));
    b.add(at(box(0.30, 0.045, 0.24, mats.steel), -0.48, -0.28, side * 0.55));
  }
  b.add(bonnet(mats.paint, hero));
  // Rounded radiator face with a real recessed grille, visible vertical bars.
  b.add(profile([[0.89, -0.25], [0.94, -0.18], [0.94, 0.13], [0.88, 0.20], [0.85, 0.17], [0.85, -0.23]], 0.66, mats.trim, 0.025));
  b.add(at(box(0.025, 0.32, 0.54, mats.dark), 0.975, -0.02, 0));
  for (let i = 0; i < 9; i++) b.add(at(box(0.025, 0.29, 0.018, mats.steel), 0.996, -0.02, -0.24 + i * 0.06));
  b.add(at(profile([[-0.1, -0.04], [0.1, -0.04], [0.13, 0.04], [-0.13, 0.04]], 1.24, mats.dark, 0.025), 0.94, -0.34, 0));
  // Bonnet center seam, release handles and a small radiator filler cap.
  b.add(at(box(0.77, 0.018, 0.027, mats.trim), 0.44, 0.265, 0, -0.11));
  b.add(at(cyl(0.052, 0.052, 0.035, mats.brass, 10), 0.77, 0.24, 0));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) b.add(at(box(0.032, 0.14, 0.018, mats.dark), 0.18 + i * 0.10, -0.02, side * 0.414, -0.12));
    b.add(at(box(0.11, 0.025, 0.035, mats.steel), 0.25, -0.19, side * 0.425));
  }
  // Pre-war truck cab with chamfered roof and sloping split windscreen.
  b.add(profile([[-0.58, -0.24], [0.26, -0.24], [0.35, 0.40], [0.16, 0.69], [-0.43, 0.69], [-0.59, 0.53]], 0.87, mats.paint, 0.045));
  b.add(at(profile([[-0.59, 0.65], [0.22, 0.65], [0.19, 0.73], [-0.48, 0.75]], 0.98, mats.dark, 0.035), 0, 0, 0));
  for (const side of [-1, 1]) {
    b.add(at(box(0.035, 0.245, 0.335, mats.dark), 0.337, 0.553, side * 0.19, 0.58));
    b.add(at(box(0.040, 0.193, 0.275, glass), 0.359, 0.557, side * 0.19, 0.58));
    b.add(at(profile([[-0.45, 0.12], [0.11, 0.12], [0.10, 0.53], [-0.39, 0.53]], 0.018, mats.dark, 0.02), 0, 0, side * 0.478));
    b.add(at(profile([[-0.40, 0.18], [0.055, 0.18], [0.05, 0.47], [-0.36, 0.47]], 0.018, glass, 0.008), 0, 0, side * 0.493));
    b.add(at(box(0.10, 0.025, 0.025, mats.trim), -0.36, 0.04, side * 0.497));
    b.add(at(box(0.025, 0.13, 0.025, mats.dark), 0.13, 0.55, side * 0.65, -0.35));
    b.add(at(box(0.025, 0.12, 0.10, mats.steel), 0.10, 0.64, side * 0.67));
  }
  b.add(at(box(0.06, 0.26, 0.035, mats.trim), 0.36, 0.548, 0, 0.58));
  b.flush();
  return { chest, front: 1.015, frontY: -0.025, back: -1.25, top: 0.80, halfW: 0.51 };
}

// Unit cylinders join the two real pivots after the animation has posed them.
// The rod remains inserted into its fixed barrel; cylinder axes use local y.
function actuator(parent, a, b, materials, part = "legs", radius = 0.045) {
  const sleeve = cyl(radius, radius, 1, materials.dark, 10);
  const rod = cyl(radius * 0.58, radius * 0.58, 1, materials.steel, 10);
  sleeve.name = `${part}:hydraulic-sleeve`; rod.name = `${part}:hydraulic-rod`;
  sleeve.userData.part = rod.userData.part = part;
  sleeve.userData.loc = rod.userData.loc = part === "backpack" ? "engine" : part;
  parent.add(sleeve, rod);
  return { parent, a, b, sleeve, rod, sleeveLength: null, inverse: new THREE.Matrix4() };
}
function updateActuator(link) {
  _a.setFromMatrixPosition(link.a.matrixWorld); _b.setFromMatrixPosition(link.b.matrixWorld);
  link.inverse.copy(link.parent.matrixWorld).invert();
  _a.applyMatrix4(link.inverse); _b.applyMatrix4(link.inverse);
  _dir.subVectors(_b, _a);
  const length = _dir.length();
  if (length < 1e-8) { link.sleeve.scale.y = link.rod.scale.y = 0; return; }
  _dir.divideScalar(length);
  // Size the barrel once in the assembled rest pose. Only exposed rod length
  // changes thereafter; its hidden tail overlaps the barrel behind the seal.
  const sleeveLength = link.sleeveLength ??= length * 0.5;
  const rodLength = length - sleeveLength + sleeveLength * 0.18;
  link.sleeve.position.copy(_a).addScaledVector(_dir, sleeveLength / 2);
  link.rod.position.copy(_b).addScaledVector(_dir, -rodLength / 2);
  link.sleeve.quaternion.setFromUnitVectors(Y, _dir);
  link.rod.quaternion.copy(link.sleeve.quaternion);
  link.sleeve.scale.y = sleeveLength; link.rod.scale.y = rodLength;
}

export function tankWalkerMaterials(skin, color) {
  const base = new THREE.Color(color);
  if (skin === "refit") base.lerp(new THREE.Color(0x9b9275), 0.22);
  if (skin === "worn") base.lerp(new THREE.Color(0x3d3933), 0.3);
  if (skin === "rust") base.lerp(new THREE.Color(0x827664), 0.2);
  // Matte Ace uses cream lining and saturated paint, not chrome reflections.
  return {
    paint: surfaceMat('armor', base.getHex(), { roughness: 0.88, metalness: 0.15 }),
    trim: surfaceMat(skin === 'ace' ? 'brass' : 'gunmetal', skin === "ace" ? 0xe0cfa2 : 0x8a8778, { roughness: 0.82, metalness: 0.25 }),
    dark: surfaceMat('gunmetal', 0x292c2d, { roughness: 0.94, metalness: 0.2 }),
    steel: surfaceMat('gunmetal', 0x777c77, { roughness: 0.78, metalness: 0.3 }),
    brass: surfaceMat('brass', 0xa4874d, { roughness: 0.82, metalness: 0.25 }),
    rubber: surfaceMat('rubber', 0x171b1a, { roughness: 0.98, metalness: 0 }),
  };
}

function buildLeg(pelvis, side, heavy, mats, links, hero) {
  const hip = new THREE.Group(), knee = new THREE.Group(), ankle = new THREE.Group();
  const upper = heavy ? 0.54 : 0.48, shinLen = heavy ? 0.57 : 0.52;
  hip.position.z = side * (heavy ? 0.64 : 0.55); pelvis.add(hip);
  knee.position.y = -upper; hip.add(knee);
  ankle.position.set(0.08, -shinLen, 0); knee.add(ankle);
  const rest = { hip: -0.12, knee: 0.19, x: 0 };
  hip.rotation.z = rest.hip; knee.rotation.z = rest.knee;
  const leg = { hip, knee, ankle, side, shinLen, rest, bend: 1 };
  flattenFoot(leg);
  const thigh = batch(hip, "legs", false, hero), shin = batch(knee, "legs", false, hero), feet = batch(ankle, "feet", false, hero);
  thigh.add(at(drumZ(0.20, 0.39, mats.dark), 0, 0, 0));
  thigh.add(at(drumZ(0.14, 0.43, mats.steel), 0, 0, 0));
  thigh.add(at(box(0.28, upper, 0.28, mats.dark), 0, -upper / 2, 0));
  thigh.add(at(box(0.13, upper * 0.78, 0.37, mats.paint), 0.17, -upper / 2, 0, -0.08));
  thigh.add(at(box(0.055, upper * 0.75, 0.31, mats.trim), 0.24, -upper / 2, 0));
  shin.add(at(drumZ(0.18, 0.46, mats.dark), 0, 0, 0));
  shin.add(at(drumZ(0.115, 0.49, mats.trim), 0, 0, 0));
  shin.add(at(box(0.28, shinLen * 0.82, 0.30, mats.dark), 0.04, -shinLen * 0.48, 0));
  shin.add(at(box(0.14, shinLen * 0.7, 0.40, mats.paint), 0.23, -shinLen * 0.47, 0, 0.10));
  shin.add(at(box(0.05, 0.08, 0.42, mats.trim), 0.30, -shinLen * 0.2, 0));
  const depth = heavy ? 0.83 : 0.76, width = heavy ? 0.56 : 0.49;
  feet.add(at(box(depth, 0.14, width, mats.rubber), 0.13, -0.16, 0));
  feet.add(at(box(depth * 0.94, 0.09, width * 1.04, mats.dark), 0.13, -0.07, 0));
  feet.add(at(box(depth * 0.68, 0.12, width * 0.91, mats.paint), 0.17, 0.025, 0, -0.06));
  feet.add(at(drumZ(0.13, width * 0.92, mats.steel), 0.02, 0.04, 0));
  for (let i = 0; i < 6; i++) {
    const x = 0.13 - depth * 0.42 + i * depth * 0.168;
    feet.add(at(box(0.045, 0.20, width * 1.07, mats.trim), x, -0.11, 0));
  }
  for (const s of [-1, 1]) {
    const z = s * width * 0.4;
    feet.add(at(box(depth * 0.85, 0.04, 0.025, mats.steel), 0.13, 0.095, z));
  }
  thigh.flush(); shin.flush(); feet.flush();
  // Two visible load paths, one across the knee and one across the ankle.
  links.push(actuator(pelvis, anchor(hip, -0.12, -0.11, side * 0.25),
    anchor(knee, 0.11, -0.35, side * 0.25), mats));
  links.push(actuator(pelvis, anchor(knee, -0.11, -0.12, -side * 0.22),
    anchor(ankle, 0.30, 0.08, -side * 0.22), mats, "legs", 0.035));
  return leg;
}

function buildEngine(torso, heavy, mats, vent, links, stacks, hero) {
  const g = new THREE.Group(); g.name = "diesel-engine"; g.position.set(heavy ? -0.77 : -0.65, 0.03, 0); torso.add(g);
  const b = batch(g, "backpack", false, hero);
  if (heavy) b.add(at(box(0.42, 0.60, 1.12, mats.dark), -0.12, -0.04, 0));
  else {
    b.add(casemate([-0.33, 0.10, 0.50], [-0.28, 0.05, 0.43], -0.28, -0.15, 0.065, mats.dark));
    for (const z of [-0.34, 0, 0.34]) {
      b.add(at(cyl(0.12, 0.13, 0.38, mats.steel, 10), -0.11, 0.06, z));
      b.add(at(cyl(0.135, 0.135, 0.06, mats.dark, 10), -0.11, 0.27, z));
      b.add(at(cyl(0.022, 0.022, 0.32, mats.brass, 8), 0.035, 0.08, z));
    }
  }
  b.add(at(box(0.12, 0.65, 1.19, mats.paint), -0.36, 0.015, 0));
  for (const z of [-0.39, 0.39]) {
    b.add(at(box(0.44, 0.12, 0.10, mats.steel), -0.1, -0.32, z));
    b.add(at(box(0.42, 0.08, 0.12, mats.trim), -0.1, 0.30, z));
  }
  // Radiator fins sit inside a recessed surround; fuel tank has retaining straps.
  for (let i = 0; i < 9; i++) b.add(at(box(0.05, 0.39, 0.065, mats.steel), -0.435, -0.03, -0.38 + i * 0.095));
  b.add(at(drumZ(0.14, 0.73, mats.paint), -0.09, 0.44, 0));
  for (const z of [-0.24, 0.24]) b.add(at(drumZ(0.15, 0.04, mats.trim), -0.09, 0.44, z));
  b.add(at(cyl(0.055, 0.055, 0.045, mats.dark), -0.09, 0.60, 0.12));
  // Fuel line reaches down to the block, exhaust manifold feeds both stacks.
  b.add(at(cyl(0.024, 0.024, 0.40, mats.brass, 8), -0.1, 0.19, -0.35));
  b.add(at(drumZ(0.055, 0.98, mats.dark), 0.02, 0.18, 0));
  let exhaustCap;
  for (const z of [-0.48, 0.48]) {
    b.add(at(drumX(0.08, 0.22, mats.dark), -0.04, 0.18, z));
    const stack = at(cyl(0.065, 0.08, heavy ? 0.68 : 0.57, vent, 10), -0.15, heavy ? 0.52 : 0.47, z);
    stack.userData.part = "backpack"; g.add(stack); stacks.push(stack);
    if (z > 0) {
      // Exhaust rain flap has a real edge hinge, and follows the mounted pipe.
      exhaustCap = anchor(stack, -0.07, stack.geometry.parameters.height / 2 + 0.008, 0);
      const hinge = drumZ(0.022, 0.16, mats.steel, 8);
      hinge.userData.part = "backpack"; exhaustCap.add(hinge);
      const lid = at(cyl(0.09, 0.09, 0.025, mats.dark, 12), 0.07, 0.01, 0);
      lid.userData.part = "backpack"; exhaustCap.add(lid);
    }
    b.add(at(cyl(0.095, 0.095, 0.20, mats.dark, 10), -0.15, 0.32, z));
    b.add(at(cyl(0.093, 0.093, 0.045, mats.trim, 10), -0.15, 0.23, z));
  }
  // Exposed crank and slider at the near side, with a fixed-length connecting rod.
  const crankCenter = new THREE.Group(); crankCenter.position.set(-0.14, -0.05, 0.64); g.add(crankCenter);
  b.add(at(drumZ(0.18, 0.11, mats.dark), -0.14, -0.05, 0.58));
  const flywheel = new THREE.Group(); crankCenter.add(flywheel);
  const wheel = batch(flywheel, "backpack", false, hero);
  wheel.add(torus(0.17, 0.038, mats.steel, TAU, 16));
  wheel.add(drumZ(0.065, 0.075, mats.trim, 10));
  for (let i = 0; i < 5; i++) wheel.add(rot(box(0.29, 0.035, 0.035, mats.paint), 0, 0, i * TAU / 5));
  wheel.flush();
  const crank = anchor(crankCenter, 0.095, 0, 0.06);
  const pin = drumZ(0.035, 0.055, mats.brass, 8); pin.userData.part = "backpack";
  crank.add(pin);
  const piston = anchor(crankCenter, 0, 0.35, 0.06);
  const slider = box(0.11, 0.11, 0.09, mats.steel); slider.userData.part = "backpack";
  piston.add(slider);
  b.add(at(box(0.20, 0.10, 0.12, mats.paint), -0.14, 0.31, 0.70));
  for (const x of [-0.225, -0.055]) b.add(at(cyl(0.018, 0.018, 0.34, mats.dark, 8), x, 0.18, 0.70));
  b.flush();
  links.push(actuator(crankCenter, crank, piston, mats, "backpack", 0.027));
  return { phase: 0, crank, piston, flywheel, exhaustCap, crankRadius: 0.095, rodLength: 0.30 };
}

export function buildTankWalker({ id = "", name, cls, mats, glass, vent, baseScale, detail = 'standard' }) {
  const heavy = name === "Black", k = heavy ? 1.1 : 1;
  const hero = !heavy && detail === 'hero';
  const pelvis = new THREE.Group(), torso = new THREE.Group(), links = [], stacks = [], sockets = {};
  const legs = [1, -1].map((s) => buildLeg(pelvis, s, heavy, mats, links, hero));
  pelvis.updateMatrixWorld(true);
  const drop = -new THREE.Box3().setFromObject(legs[0].hip).min.y;
  const hipH = drop + BASE_TOP / baseScale;
  pelvis.position.y = hipH;
  for (const l of legs) l.height = drop;
  const belt = batch(pelvis, "pelvis", false, hero);
  belt.add(box(heavy ? 1.03 : 0.88, 0.27, heavy ? 1.35 : 1.12, mats.dark));
  belt.add(at(cyl(heavy ? 0.54 : 0.46, heavy ? 0.54 : 0.46, 0.14, mats.steel, 20), 0, 0.19, 0));
  belt.add(at(cyl(heavy ? 0.57 : 0.49, heavy ? 0.57 : 0.49, 0.075, mats.dark, 20), 0, 0.27, 0));
  belt.flush();
  const torsoRestY = heavy ? 0.58 : 0.61;
  torso.position.y = torsoRestY; pelvis.add(torso);
  const d = heavy ? 1.94 : 1.60, w = heavy ? 2.08 : 1.30, h = heavy ? 0.80 : 0.73;
  const frame = heavy ? buildBlackHull(torso, mats, glass) : buildTyrianHull(torso, mats, glass, hero);
  const chest = frame.chest;
  const armR = new THREE.Group(), armL = new THREE.Group();
  for (const [arm, s] of [[armR, -1], [armL, 1]]) {
    const armZ = heavy ? (s > 0 ? 1.68 : 1.16) : 1.03;
    arm.position.set(0, -0.04, s * armZ); torso.add(arm);
    const shoulder = new THREE.Group(); arm.add(shoulder);
    const b = batch(shoulder, "shoulders", false, hero);
    b.add(drumZ(0.22, 0.39, mats.dark));
    b.add(at(drumZ(0.14, 0.44, mats.trim), 0, 0, 0));
    b.add(at(box(0.56, 0.10, 0.51, mats.paint), -0.05, 0.24, 0));
    b.add(at(box(0.08, 0.22, 0.50, mats.paint), -0.31, 0.14, 0));
    b.add(at(box(0.48, 0.045, 0.05, mats.trim), -0.05, 0.30, s * 0.20));
    bolts(b, 0.24, 0.23, 0, 3, 0.31, mats.steel);
    b.flush();
    socket(sockets, s > 0 ? "shoulderL" : "shoulderR", shoulder, 0.12, 0.25, 0);
    links.push(actuator(torso, anchor(torso, -0.40, -0.25, s * (w / 2 - 0.08)),
      anchor(arm, 0.32, -0.16, -s * 0.12), mats, "arms", 0.055));
  }
  const mechanics = { ...buildEngine(torso, heavy, mats, vent, links, stacks, hero), links };
  mechanics.phase = rngFrom(`${id}|diesel-phase`)() * TAU;
  mechanics.shakePhase = mechanics.phase;
  // Per-instance art controls shared with the tuning bench's reset/comparison.
  const shake = defaultTankWalkerShake(name);
  if (heavy) {
    // The shield hangs from a real outboard carrier. Its inner edge clears the
    // casemate, and the telescoping yoke follows the full forward bash stroke.
    const mount = batch(torso, "shoulders");
    mount.add(at(box(0.33, 0.23, 0.42, mats.dark), -0.16, -0.04, 1.03));
    mount.add(at(drumZ(0.16, 0.15, mats.steel), -0.16, -0.04, 1.24));
    mount.add(at(box(0.37, 0.065, 0.48, mats.paint), -0.16, 0.11, 1.04));
    mount.flush();
    links.push(actuator(torso, anchor(torso, -0.16, -0.04, 1.25),
      anchor(armL, 0, 0, -0.11), mats, "arms", 0.085));
  }
  // Black's armored thigh skirts; Tyrian's lighter open frame exposes its drive.
  const skirt = batch(torso, "signature", false, hero);
  for (const s of [-1, 1]) {
    if (heavy) for (const x of [-0.39, 0.02, 0.43]) {
      skirt.add(at(box(0.37, 0.30, 0.105, mats.paint), x, -0.54, s * 0.73, x * 0.05));
      skirt.add(at(box(0.29, 0.035, 0.12, mats.trim), x, -0.68, s * 0.73));
    }
    else skirt.add(at(box(0.66, 0.07, 0.09, mats.steel), -0.06, -0.45, s * 0.62));
  }
  skirt.flush();
  socket(sockets, "chestFront", torso, frame.front, frame.frontY, 0);
  socket(sockets, "back", torso, frame.back, 0.06, 0);
  socket(sockets, "head", torso, 0, frame.top, 0);
  socket(sockets, "hip", pelvis, 0, -0.03, -(heavy ? 0.64 : 0.55));
  socket(sockets, "shin", legs[0].knee, 0.32, -legs[0].shinLen * 0.49, 0);
  const built = {
    remodel: true, remodelName: name, detail: hero ? 'hero' : 'standard', pelvis, legs, torso, chest, armR, armL, hipH, frame, torsoRestY,
    stacks, sockets, mechanics, shake, spinners: [], flickers: [], glows: [],
    whistle: null, bellows: null, windKey: null,
    ctx: { cls, k, ...mats, dims: { d, h, w }, glass, vent, torso, pelvis, legs, stacks, sockets },
    updateMechanical(dt, state = {}) {
      const stopped = state.destroyed || state.shutdown || state.broken?.engine;
      if (!stopped) {
        const step = Math.max(0, dt) * (state.spent ? 2 : 4) * (1 + (state.heatFrac || 0) * 0.4);
        mechanics.phase = (mechanics.phase + step) % TAU;
        mechanics.shakePhase = (mechanics.shakePhase + step * shake.frequency) % TAU;
      }
      const angle = mechanics.phase, r = mechanics.crankRadius, length = mechanics.rodLength;
      // Slider-crank closure: the connecting rod's length stays fixed.
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      mechanics.crank.position.set(x, y, 0.06);
      mechanics.piston.position.set(0, y + Math.sqrt(length * length - x * x), 0.06);
      mechanics.flywheel.rotation.z = angle;
      if (mechanics.fan) mechanics.fan.rotation.z = -angle * 3;
      mechanics.exhaustCap.rotation.z = 0.06 + Math.max(0, Math.sin(angle * 2)) * 0.65;
      // Combustion impulses: uneven 7–11 Hz shudder on the engine mounts.
      // Only the upper chassis shakes; neither feet nor the miniature base rock.
      const vibration = mechanics.shakePhase;
      const chug = (Math.sin(vibration * 11) + 0.45 * Math.sin(vibration * 17 + 0.6)
        + 0.30 * Math.sin(vibration * 5 + 1.7)) / 1.75 * shake.magnitude;
      torso.position.y = torsoRestY + chug * (heavy ? 0.038 : 0.046);
      torso.rotation.z = chug * (heavy ? 0.018 : 0.023);
      torso.rotation.x = Math.sin(vibration * 13 + 0.7) * 0.009 * shake.magnitude;
      pelvis.updateWorldMatrix(true, true);
      for (const link of links) updateActuator(link);
    },
  };
  if (hero) addTyrianMachinery(built, mats);
  built.updateMechanical(0);
  return built;
}

// Dress existing weapon identities, preserving their animated barrels/blades
// and muzzle contract. The receiver, feed and mounting hardware now have mass.
export function dressTankWalkerWeapons(built, lr, me, mats) {
  const black = built.remodelName === "Black";
  const gun = batch(lr.group, "weapons"), melee = batch(me.group, "weapons");
  gun.add(at(box(0.55, 0.13, black ? 0.59 : 0.48, mats.dark), 0, -0.27, 0));
  gun.add(at(box(0.19, 0.32, black ? 0.59 : 0.48, mats.paint), black ? -0.53 : -0.31, -0.02, 0));
  gun.add(at(box(0.49, 0.07, black ? 0.52 : 0.43, mats.trim), -0.03, black ? 0.32 : 0.24, 0));
  if (black) {
    // Siege Maul: recoil cylinders run alongside the cannon, breech latch behind.
    for (const z of [-0.27, 0.27]) {
      gun.add(at(drumX(0.07, 0.56, mats.dark), 0.38, -0.03, z));
      gun.add(at(drumX(0.037, 0.45, mats.steel), 0.84, -0.03, z));
    }
    for (const x of [0.61, 1.05, 1.43]) gun.add(at(drumX(0.22, 0.055, mats.trim), x, 0, 0));
    gun.add(at(box(0.06, 0.27, 0.24, mats.steel), -0.65, 0, 0));
    // Shield's layered face, perimeter rails, vision slit and reinforced boss.
    for (const z of [-0.49, 0.49]) melee.add(at(box(0.075, 1.54, 0.08, mats.trim), 0.40, 0, z));
    for (const y of [-0.74, 0.74]) melee.add(at(box(0.08, 0.08, 0.98, mats.dark), 0.40, y, 0));
    for (const s of [-1, 1]) melee.add(at(box(0.07, 0.55, 0.43, mats.paint), 0.42, -0.27, s * 0.27));
    melee.add(at(box(0.08, 0.095, 0.46, mats.dark), 0.43, 0.43, 0));
    melee.add(at(drumX(0.16, 0.14, mats.steel, 6), 0.49, -0.05, 0));
    bolts(melee, 0.47, 0.65, 0, 5, 0.8, mats.steel);
    bolts(melee, 0.47, -0.66, 0, 5, 0.8, mats.steel);
  } else {
    // Mini Gun: ammunition drum, linked feed and barrel cage.
    gun.add(at(drumZ(0.24, 0.23, mats.paint, 16), -0.14, -0.20, -0.30));
    gun.add(at(drumZ(0.17, 0.25, mats.trim, 16), -0.14, -0.20, -0.30));
    for (let i = 0; i < 7; i++) gun.add(at(box(0.06, 0.11, 0.16, mats.brass), -0.06 + i * 0.055, -0.24 - Math.sin(i / 6 * Math.PI) * 0.08, -0.20));
    for (const x of [0.44, 1.08]) gun.add(at(rot(torus(0.20, 0.03, mats.dark, TAU, 16), 0, Math.PI / 2, 0), x, 0, 0));
    // Saw: oil-fed gearbox and partial blade guard leave the cutting teeth visible.
    melee.add(at(drumZ(0.18, 0.30, mats.paint), 0.12, 0, 0));
    melee.add(at(drumZ(0.12, 0.33, mats.trim), 0.12, 0, 0));
    melee.add(at(box(0.54, 0.10, 0.12, mats.dark), 0.40, 0.12, -0.10, -0.10));
    melee.add(at(rot(torus(0.53, 0.065, mats.paint, Math.PI * 0.85, 16), 0, 0, 0.22), 0.7, 0, 0));
    melee.add(at(drumZ(0.13, 0.13, mats.brass), 0.7, 0, 0.07));
  }
  gun.flush(); melee.flush();
  if (built.detail === 'hero') detailTyrianWeapons(lr, me, mats);
}

// Project cosmetic geometry against the real shaped hull. Old planar sockets
// still carry rigid kit, but paint and repair patches must follow armor facets.
function projectSurfaceMark(built, mesh, axis) {
  mesh.updateMatrix();
  const inverse = built.torso.matrixWorld.clone().invert();
  const transform = mesh.parent ? inverse.clone().multiply(mesh.matrixWorld) : mesh.matrix;
  let geo = mesh.geometry.clone().applyMatrix4(transform);
  if (geo.index) { const indexed = geo; geo = indexed.toNonIndexed(); indexed.dispose(); }
  geo.computeBoundingBox();
  const center = geo.boundingBox.getCenter(new THREE.Vector3());
  const positions = geo.attributes.position, valid = [], kept = [];
  const ray = new THREE.Raycaster(), p = new THREE.Vector3(), normal = new THREE.Vector3();
  const direction = axis.clone().transformDirection(built.torso.matrixWorld);
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const relief = THREE.MathUtils.clamp(p.clone().sub(center).dot(axis), -0.006, 0.006);
    const origin = p.clone().addScaledVector(axis, 3).applyMatrix4(built.torso.matrixWorld);
    ray.set(origin, direction.clone().negate());
    const hit = ray.intersectObject(built.chest, true)[0];
    valid.push(!!hit);
    if (!hit) continue;
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).transformDirection(inverse);
    p.copy(hit.point).applyMatrix4(inverse).addScaledVector(normal, 0.007 + relief);
    positions.setXYZ(i, p.x, p.y, p.z);
  }
  // Clip marks at hull edges; no unused vertices may remain outside the body.
  for (let i = 0; i < positions.count; i += 3) if (valid[i] && valid[i + 1] && valid[i + 2]) kept.push(i, i + 1, i + 2);
  if (!kept.length) { geo.dispose(); mesh.parent?.remove(mesh); mesh.geometry.dispose(); return null; }
  geo.setIndex(kept);
  const projected = geo.toNonIndexed(); geo.dispose();
  projected.computeVertexNormals();
  mesh.geometry.dispose(); mesh.geometry = projected;
  mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.setScalar(1);
  mesh.userData.surfaceMark = true;
  if (mesh.parent) built.torso.add(mesh);
  return mesh;
}
function paintPatch(built, material, [x, y, z], [width, height], axis) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height, width > 0.2 ? 8 : 1, height > 0.2 ? 8 : 2), material);
  if (axis.x) mesh.rotation.y = Math.PI / 2;
  if (axis.y) mesh.rotation.x = -Math.PI / 2;
  if (axis.z < 0) mesh.rotation.y = Math.PI;
  mesh.position.set(x, y, z);
  return projectSurfaceMark(built, mesh, axis);
}

// Skin weathering is cosmetic history, independent of combat damage overlays.
// Rust collects at seams/drains; rubbed edges stay local.
export function refineTankWalkerSkin(built, skin, seed) {
  const { frame: f, ctx, sockets } = built;
  built.torso.updateWorldMatrix(true, true);
  const front = new THREE.Vector3(1, 0, 0), top = new THREE.Vector3(0, 1, 0);
  const r = rngFrom(`${seed}|tank-skin`), b = batch(built.torso, "skin", true);
  // Existing nose art/scorch decals and direct flank patches predate the shaped
  // bodies. Conform only those surface marks; mounted stowage/lamps stay rigid.
  for (const mesh of [...sockets.chestFront.children]) if (mesh.isMesh && mesh.userData.part === "skin")
    projectSurfaceMark(built, mesh, front);
  for (const mesh of [...built.torso.children]) if (mesh.isMesh && mesh.userData.part === "skin" && !mesh.userData.surfaceMark)
    projectSurfaceMark(built, mesh, new THREE.Vector3(0, 0, Math.sign(mesh.position.z) || 1));
  const add = (material, center, size, axis) => {
    const patch = paintPatch(built, material, center, size, axis);
    if (patch) b.add(patch);
  };
  const paintLine = mat(skin === "ace" ? 0xe4d4ac : 0x84867c, { roughness: 0.9, metalness: 0.1 });
  if (skin === "ace") {
    // Black follows its glacis/roof; Tyrian wears two lines on the curved bonnet.
    for (const side of [-1, 1]) {
      if (built.remodelName === "Black") {
        add(paintLine, [f.front, 0.025, side * 0.36], [0.055, 0.43], front);
        add(paintLine, [-0.10, 0.5, side * 0.36], [0.80, 0.055], top);
      } else add(paintLine, [0.61, 0.5, side * 0.17], [0.43, 0.055], top);
    }
  }
  if (skin === "rust" || skin === "worn" || skin === "refit") {
    const oxide = mat(skin === "rust" ? 0x96502b : 0x5b4735, { roughness: 1, metalness: 0 });
    const fresh = mat(0xb77b46, { roughness: 1, metalness: 0 });
    const count = skin === "rust" ? 18 : 9;
    for (let i = 0; i < count; i++) {
      const z = (r() - 0.5) * (built.remodelName === "Black" ? 1.25 : 0.48);
      add(oxide, [f.front, -0.22 + r() * 0.035, z], [0.025 + r() * 0.085, 0.015 + r() * 0.045], front);
      if (skin === "rust" && i % 3 === 0) add(fresh, [f.front, -0.20, z], [0.038, 0.016], front);
      const side = i % 2 ? 1 : -1, x = built.remodelName === "Black" ? (r() - 0.5) * 1.15 : -0.45 + r() * 0.52;
      add(oxide, [x, -0.08, side * f.halfW], [0.015 + r() * 0.025, 0.06 + r() * 0.13], new THREE.Vector3(0, 0, side));
    }
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++)
      add(paintLine, [-ctx.dims.d * 0.30 + i * 0.19, -0.22, side * f.halfW],
        [0.045 + r() * 0.06, 0.012], new THREE.Vector3(0, 0, side));
  }
  b.flush();
  if (skin === "refit" || skin === "rust") {
    // Visible steel shelf under the stowage.
    const rack = batch(sockets.back, "skin");
    rack.add(at(box(0.23, 0.035, 0.71, ctx.dark), -0.06, -0.25, 0));
    for (const z of [-0.29, 0.29]) rack.add(at(box(0.035, 0.32, 0.035, ctx.steel), 0.025, -0.10, z));
    rack.flush();
  }
}

// Older shared skin pieces and weapon parts use polished library materials.
// Give this POC local matte copies, leaving every legacy reference unchanged.
export function finishTankWalkerMaterials(built, lr, me) {
  if (built.detail === 'hero') compactTyrianDetails(built, lr, me);
  const clones = new Map();
  built.pelvis.traverse((o) => {
    if (!o.isMesh || !o.material?.isMeshStandardMaterial || o.material.roughness >= 0.7) return;
    const source = o.material;
    if (!clones.has(source)) {
      const copy = source.clone(); copy.roughness = 0.82; copy.metalness = Math.min(0.4, copy.metalness);
      clones.set(source, copy);
    }
    o.material = clones.get(source);
  });
}
