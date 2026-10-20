// Preview-only material treatment. It never changes the game's cached materials.
import * as THREE from "three";
import { MIN_ROUGHNESS } from "../matte.js";

export const MATERIAL_DEFAULTS = Object.freeze({ paintVariation: 0.55, grain: 0.35, edgeWear: 0.4, grime: 0.3 });
export function materialValues(input = {}) {
  return Object.fromEntries(Object.entries(MATERIAL_DEFAULTS).map(([key, fallback]) =>
    [key, Number.isFinite(input?.[key]) ? Math.max(0, Math.min(1, input[key])) : fallback]));
}

// Coplanar triangles share their complete panel boundary. The shader measures
// distance to these segments, so wear is continuous across triangulation.
export function surfaceGeometry(source, matrix) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const positions = geometry.getAttribute("position"), points = [];
  for (let i = 0; i < positions.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix));
  const edges = new Map(), faces = [], key = (p) => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
  const edgeKey = (a, b) => [key(a), key(b)].sort().join("|");
  const cross = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0; i < points.length; i += 3) {
    const [a, b, c] = points.slice(i, i + 3);
    cross.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const normal = cross.clone().normalize();
    const sides = [[b, c], [c, a], [a, b]];
    const keys = sides.map(([v, w]) => edgeKey(v, w));
    keys.forEach((k, side) => {
      if (!edges.has(k)) edges.set(k, { points: sides[side], faces: [] });
      edges.get(k).faces.push(faces.length);
    });
    faces.push({ keys, normal, neighbors: [] });
  }
  const ranges = new Float32Array(points.length * 2), coordinates = new Float32Array(points.length * 3);
  points.forEach((point, i) => point.toArray(coordinates, i * 3));
  const threshold = Math.cos(22 * Math.PI / 180);
  for (const edge of edges.values()) {
    edge.crease = edge.faces.length === 1 || edge.faces.some((f) => faces[f].normal.dot(faces[edge.faces[0]].normal) < threshold);
    for (const a of edge.faces) for (const b of edge.faces)
      if (a !== b && faces[a].normal.dot(faces[b].normal) > .99999) faces[a].neighbors.push(b);
  }
  const visited = new Set(), segments = [];
  faces.forEach((_, first) => {
    if (visited.has(first)) return;
    const pending = [first], region = [], boundary = new Set(); visited.add(first);
    while (pending.length) {
      const index = pending.pop(), face = faces[index]; region.push(index);
      face.keys.forEach((k) => { if (edges.get(k).crease) boundary.add(k); });
      face.neighbors.forEach((n) => { if (!visited.has(n)) { visited.add(n); pending.push(n); } });
    }
    const offset = segments.length / 6;
    for (const k of boundary) for (const point of edges.get(k).points) segments.push(...point.toArray());
    for (const face of region) for (let vertex = 0; vertex < 3; vertex++) ranges.set([offset, boundary.size], (face * 3 + vertex) * 2);
  });
  geometry.setAttribute("studyPosition", new THREE.BufferAttribute(coordinates, 3));
  geometry.setAttribute("studyEdges", new THREE.BufferAttribute(ranges, 2));
  geometry.userData = { ...source.userData, studySegments: segments };
  return geometry;
}

const COMMON = /* glsl */`
varying vec3 vStudyPosition;
varying vec2 vStudyEdges;
uniform sampler2D studyEdgeData;
uniform vec2 studyEdgeSize;
uniform float studyPaint;
uniform float studyGrain;
uniform float studyWear;
uniform float studyGrime;
vec3 studyEndpoint(float index) {
  return texelFetch(studyEdgeData, ivec2(int(index) % int(studyEdgeSize.x), int(index) / int(studyEdgeSize.x)), 0).xyz;
}
float studyEdgeDistance(vec3 p) {
  float distance = 1000.0;
  for (int i = 0; i < int(vStudyEdges.y + .5); i++) {
    float index = (floor(vStudyEdges.x + .5) + float(i)) * 2.0;
    vec3 a = studyEndpoint(index), b = studyEndpoint(index + 1.0), ab = b - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
    distance = min(distance, length(p - a - ab * t));
  }
  return distance;
}
float studyHash(vec3 p) {
  p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float studyNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(studyHash(i), studyHash(i+vec3(1,0,0)), f.x),
    mix(studyHash(i+vec3(0,1,0)), studyHash(i+vec3(1,1,0)), f.x), f.y),
    mix(mix(studyHash(i+vec3(0,0,1)), studyHash(i+vec3(1,0,1)), f.x),
    mix(studyHash(i+vec3(0,1,1)), studyHash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
`;
const COLOR = /* glsl */`
vec3 studyP = vStudyPosition;
float studyMacro = studyNoise(studyP * 4.2 + 8.3);
float studyFine = studyNoise(studyP * 260.0);
// Filter away fine grain when it becomes smaller than a pixel.
float studyDetail = 1.0 - smoothstep(.35, 1.3, length(fwidth(studyP)) * 260.0);
float studyDistance = studyEdgeDistance(studyP);
float studyWidth = .0007 + .007 * studyWear;
float studyJagged = smoothstep(.48 - studyWear * .12, .67, studyNoise(studyP * 180.0 + 19.0));
float studyChips = (1.0 - smoothstep(studyWidth * .25, studyWidth, studyDistance)) * studyJagged * smoothstep(0.0, .4, studyWear);
float studyPrimer = (1.0 - smoothstep(studyWidth * .65, studyWidth * 1.6, studyDistance)) * studyJagged * studyWear;
float studyLow = 1.0 - smoothstep(.18, 1.45, studyP.y);
float studyStreak = smoothstep(.38, .72, studyNoise(studyP * vec3(38.0, 2.2, 38.0) + 31.0));
float studySoot = exp(-pow((studyP.x + .32) * 4.0, 2.0)) * smoothstep(.6, 1.1, studyP.y);
float studyDirt = clamp(studyLow * (.3 + .55 * studyMacro + .3 * studyStreak) + .2 * studySoot, 0.0, 1.0) * studyGrime;
diffuseColor.rgb *= mix(1.0, .84 + studyMacro * .26, studyPaint);
float studyFade = smoothstep(.65, 1.4, studyP.y) * studyPaint * (.03 + .07 * studyMacro);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.34, .29, .24), studyFade);
diffuseColor.rgb *= 1.0 + (studyFine - .5) * .025 * studyGrain * studyDetail;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.055, .028, .018), studyPrimer * .78);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.32, .34, .35), studyChips);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.028, .023, .016), studyDirt * .78);
`;
const NORMAL = /* glsl */`
// Microscopic paint stipple; coarse relief looked like porous stone.
float studyHeight = (studyFine * .00016 + studyNoise(studyP * 95.0 + 7.0) * .00008) * studyGrain * studyDetail;
vec3 studyQ0 = dFdx(-vViewPosition), studyQ1 = dFdy(-vViewPosition);
vec3 studyR1 = cross(studyQ1, normal), studyR2 = cross(normal, studyQ0);
float studyDet = dot(studyQ0, studyR1);
vec3 studyGradient = sign(studyDet) * (dFdx(studyHeight) * studyR1 + dFdy(studyHeight) * studyR2);
normal = normalize(max(abs(studyDet), 1e-10) * normal - studyGradient);
`;

export function installMaterialStudy(mech, initial = MATERIAL_DEFAULTS) {
  const values = materialValues(initial);
  const uniforms = {
    studyPaint: { value: values.paintVariation }, studyGrain: { value: values.grain },
    studyWear: { value: values.edgeWear }, studyGrime: { value: values.grime },
    studyEdgeData: { value: null }, studyEdgeSize: { value: new THREE.Vector2() },
  };
  const replacements = new Map(), originals = [], segments = [];
  mech.root.updateWorldMatrix(true, true);
  const inverse = mech.root.matrixWorld.clone().invert();
  mech.built.pelvis.traverse((mesh) => {
    const ctx = mech.built.ctx;
    if (!mesh.isMesh || ![ctx.paint, ctx.trim, ctx.steel, ctx.brass, ctx.dark].includes(mesh.material)) return;
    const source = mesh.material, geometry = mesh.geometry;
    if (!replacements.has(source)) {
      const material = source.clone();
      const painted = source === ctx.paint, trim = source === ctx.trim;
      material.roughness = painted ? .75 : .70;
      material.metalness = painted ? 0 : .9;
      // The cream Ace trim reads as ivory when used as a metal albedo.
      // Keep the warm finish, but move its exposed alloy toward aged nickel.
      if (trim) material.color.lerp(new THREE.Color(.32, .33, .32), .65);
      if (source === ctx.dark) { material.color.setRGB(.075, .085, .095); material.metalness = .7; }
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 studyPosition;\nattribute vec2 studyEdges;\nvarying vec3 vStudyPosition;\nvarying vec2 vStudyEdges;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStudyPosition = studyPosition;\nvStudyEdges = studyEdges;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}`)
          .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR}`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(mix(roughnessFactor, .70, studyChips) + studyDirt * .18 + (studyMacro - .5) * studyPaint * .10 + (studyFine - .5) * studyGrain * .06, ${MIN_ROUGHNESS.toFixed(2)}, 1.0);`)
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, .92, studyChips) * (1.0 - studyDirt * .85);')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${NORMAL}`)
          // A bounded response below the game's 2.2 bloom threshold. Preserve
          // hue and gradients when the glare-test lamp overwhelms a surface.
          .replace('#include <opaque_fragment>', 'float studyPeak = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b));\nif (studyPeak > 1.6) outgoingLight *= 1.6 / studyPeak;\n#include <opaque_fragment>');
      };
      material.customProgramCacheKey = () => 'tyrian-material-study-v2';
      replacements.set(source, material);
    }
    mesh.geometry = surfaceGeometry(geometry, inverse.clone().multiply(mesh.matrixWorld));
    const range = mesh.geometry.getAttribute('studyEdges'), offset = segments.length / 6;
    for (let i = 0; i < range.count; i++) range.setX(i, range.getX(i) + offset);
    for (const value of mesh.geometry.userData.studySegments) segments.push(value);
    mesh.material = replacements.get(source);
    originals.push({ mesh, geometry, source, studyGeometry: mesh.geometry });
  });
  // One small float texture stores all boundary endpoints for this rig.
  const width = 256, height = Math.max(1, Math.ceil(segments.length / 3 / width));
  const data = new Float32Array(width * height * 4);
  for (let i = 0; i < segments.length / 3; i++) data.set(segments.slice(i * 3, i * 3 + 3), i * 4);
  const edgeData = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  edgeData.needsUpdate = true;
  uniforms.studyEdgeData.value = edgeData; uniforms.studyEdgeSize.value.set(width, height);
  return {
    meshCount: originals.length,
    set(input) {
      const next = materialValues(input);
      uniforms.studyPaint.value = next.paintVariation; uniforms.studyGrain.value = next.grain;
      uniforms.studyWear.value = next.edgeWear; uniforms.studyGrime.value = next.grime;
    },
    setEnabled(enabled) { for (const { mesh, source } of originals) mesh.material = enabled ? replacements.get(source) : source; },
    dispose() {
      for (const { mesh, geometry, source, studyGeometry } of originals) {
        mesh.geometry = geometry; mesh.material = source; studyGeometry.dispose();
      }
      for (const material of replacements.values()) material.dispose();
      edgeData.dispose();
    },
  };
}
