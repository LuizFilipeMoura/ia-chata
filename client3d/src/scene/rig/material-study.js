// Preview-only material treatment. It never changes the game's cached materials.
import * as THREE from "three";
import { MIN_ROUGHNESS } from "../matte.js";

export const MATERIAL_DEFAULTS = Object.freeze({ paintVariation: 0.85, grain: 0.55, edgeWear: 0.35, grime: 0.3 });
export function materialValues(input = {}) {
  return Object.fromEntries(Object.entries(MATERIAL_DEFAULTS).map(([key, fallback]) =>
    [key, Number.isFinite(input?.[key]) ? Math.max(0, Math.min(1, input[key])) : fallback]));
}

// Coplanar triangles share their complete panel boundary. The shader measures
// distance to these segments, so wear is continuous across triangulation.
export function surfaceGeometry(source, matrix, tilesPerUnit = 2, preserveUV = false) {
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
  const ranges = new Float32Array(points.length * 2), coordinates = new Float32Array(points.length * 3), uv = new Float32Array(points.length * 2);
  points.forEach((point, i) => point.toArray(coordinates, i * 3));
  // Box-project in the rig's rest space, including ConvexGeometry's UV-less
  // armor. All parts share a physical texel density; UVs move with each part.
  faces.forEach(({ normal }, face) => {
    const n = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
    const axis = n.indexOf(Math.max(...n));
    for (let vertex = 0; vertex < 3; vertex++) {
      const index = face * 3 + vertex, p = points[index];
      const pair = axis === 0 ? [-p.z * Math.sign(normal.x), p.y]
        : axis === 1 ? [p.x, -p.z * Math.sign(normal.y)] : [p.x * Math.sign(normal.z), p.y];
      uv.set(pair.map((v) => v * tilesPerUnit), index * 2);
    }
  });
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
  const projectedUV = new THREE.BufferAttribute(uv, 2);
  geometry.setAttribute("studyUv", projectedUV);
  if (!preserveUV || !geometry.hasAttribute('uv')) geometry.setAttribute("uv", projectedUV);
  geometry.setAttribute("studyEdges", new THREE.BufferAttribute(ranges, 2));
  geometry.userData = { ...source.userData, studySegments: segments };
  return geometry;
}

const COMMON = /* glsl */`
varying vec3 vStudyPosition;
varying vec2 vStudyEdges;
varying vec2 vStudyUv;
uniform sampler2D studyColor;
uniform sampler2D studyEdgeData;
uniform vec2 studyEdgeSize;
uniform float studyPaint;
uniform float studyPainted;
uniform float studyBareMetal;
uniform float studyGlass;
uniform float studyWear;
uniform float studyGrime;
uniform float studyWearable;
uniform float studyRoughness;
uniform float studyWeathering;
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
`;
const COLOR = /* glsl */`
vec3 studyP = vStudyPosition;
// Actual image maps: sRGB albedo is decoded by the texture sampler; ARM is
// linear data (R=occlusion, G=roughness, B=metal). Recolor the blue paint only.
vec3 studyTexel = texture2D(studyColor, vStudyUv).rgb;
vec3 studyPacked = texture2D(roughnessMap, vRoughnessMapUv).rgb;
float studyLuma = dot(studyTexel, vec3(.2126, .7152, .0722));
float studyVariation = clamp(studyLuma / .045, .22, 1.75);
float studyScratch = 1.0 - smoothstep(.12, .42, (studyTexel.b - studyTexel.r) / max(studyTexel.b, .005));
float studyDistance = studyEdgeDistance(studyP);
float studyWidth = .0005 + .006 * studyWear;
float studyEdge = (1.0 - smoothstep(studyWidth * .2, studyWidth, studyDistance)) * smoothstep(.25, .65, studyPacked.g);
float studyChips = clamp(max(studyScratch * 1.4, studyEdge) * studyWear, 0.0, 1.0) * mix(mix(.2, .75, studyBareMetal), 1.0, studyPainted) * studyWearable;
float studyPrimer = (1.0 - smoothstep(studyWidth * .6, studyWidth * 1.6, studyDistance)) * studyWear * studyPainted;
float studyLow = 1.0 - smoothstep(.18, 1.45, studyP.y);
// Reuse the photographed staining and cavity map for dirt placement.
float studyStain = 1.0 - smoothstep(.018, .065, studyLuma);
float studyDirt = clamp((1.0 - studyPacked.r) * 2.5 + studyStain * (.2 + .8 * studyLow), 0.0, 1.0) * studyGrime * studyWeathering;
diffuseColor.rgb *= mix(1.0, studyVariation, studyPaint * mix(mix(.18, .8, max(studyBareMetal, studyGlass)), 1.0, studyPainted) * studyWeathering);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.045, .027, .018), studyPrimer * .45);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.28, .30, .31) * (.55 + studyPacked.r * .45), studyChips);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.020, .017, .013), studyDirt * .8);
// Smoked cab glazing: dusty perimeter and fine scuffs, without steel chips.
float studyGlassDust = (1.0 - smoothstep(.002, .024, studyDistance)) * studyGrime * studyGlass;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.14, .12, .085), studyGlassDust * .65);
diffuseColor.rgb += vec3(.06, .075, .075) * studyScratch * studyWear * studyGlass;
`;

export function installMaterialStudy(mech, initial = MATERIAL_DEFAULTS, maps) {
  if (!maps?.color || !maps?.normal || !maps?.arm) throw new Error('Material study needs color, normal and ARM textures.');
  const values = materialValues(initial);
  const uniforms = {
    studyPaint: { value: values.paintVariation },
    studyWear: { value: values.edgeWear }, studyGrime: { value: values.grime },
    studyEdgeData: { value: null }, studyEdgeSize: { value: new THREE.Vector2() },
    studyColor: { value: maps.color },
  };
  const replacements = new Map(), relief = new Map(), originals = [], segments = [];
  mech.root.updateWorldMatrix(true, true);
  const inverse = mech.root.matrixWorld.clone().invert();
  const ctx = mech.built.ctx;
  // Legacy weapon metals were flattened by the POC's matte conversion. Identify
  // them by their actual weapon use, while keeping painted housings and trim.
  const weaponMetals = new Set();
  for (const weapon of [mech.lr, mech.me]) weapon?.group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const material of [mesh.material].flat()) {
      if (material.isMeshStandardMaterial && ![ctx.paint, ctx.trim, ctx.rubber].includes(material)
        && material.metalness > .1 && !material.map && !material.transparent && material.emissive.getHex() === 0) weaponMetals.add(material);
    }
  });
  const replaceMaterial = (source) => {
    if (!source.isMeshStandardMaterial) return source;
    if (!replacements.has(source)) {
      const material = source.clone();
      const painted = source === ctx.paint, trim = source === ctx.trim;
      const glass = source === mech.cockpitMat, bareMetal = weaponMetals.has(source);
      const luminous = source.emissive.getHex() !== 0;
      const wearable = !luminous && !source.transparent && !source.map && (painted || source.metalness > .1);
      // Rubber, canvas, mud, glass and existing markings keep their own finish.
      // Texture detail is shared; exposed steel chips only belong on metal parts.
      const strength = glass ? .14 : luminous ? .035 : painted ? 1.4 : bareMetal ? .65 : source.metalness <= .1 ? .18 : .25;
      material.map = source.map || maps.color; material.normalMap = maps.normal;
      material.roughnessMap = maps.arm; material.metalnessMap = maps.arm;
      material.normalScale.setScalar(values.grain * strength);
      material.roughness = painted ? .75 : [ctx.trim, ctx.steel, ctx.brass, ctx.dark].includes(source) ? .70 : Math.max(MIN_ROUGHNESS, source.roughness);
      material.metalness = painted ? 0 : [ctx.trim, ctx.steel, ctx.brass].includes(source) ? .9 : source.metalness;
      if (painted) material.color.multiplyScalar(.62);
      // The cream Ace trim reads as ivory when used as a metal albedo.
      // Keep the warm finish, but move its exposed alloy toward aged nickel.
      if (trim) material.color.lerp(new THREE.Color(.32, .33, .32), .65);
      if (source === ctx.dark) { material.color.setRGB(.075, .085, .095); material.metalness = .7; }
      if (bareMetal) {
        material.metalness = .9; material.roughness = MIN_ROUGHNESS;
        // Lift blue-black steel enough for scanned scuffs and broad reflections
        // to read; retain the warm albedo of brass collars and ammunition.
        const hsl = source.color.getHSL({});
        if (hsl.s < .3) material.color.lerp(new THREE.Color(.22, .24, .26), .6);
      }
      if (glass) {
        material.color.setRGB(.045, .075, .08);
        material.emissiveIntensity = source.emissiveIntensity * .08;
      }
      if ([mech.cockpitMat, mech.ventMat, mech.lampMat].includes(source)) {
        material.onBeforeRender = () => {
          if (!glass) material.color.copy(source.color);
          material.emissive.copy(source.emissive);
          material.emissiveIntensity = source.emissiveIntensity * (glass ? .08 : 1);
        };
      }
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.uniforms.studyPainted = { value: painted ? 1 : 0 };
        shader.uniforms.studyBareMetal = { value: bareMetal ? 1 : 0 };
        shader.uniforms.studyGlass = { value: glass ? 1 : 0 };
        shader.uniforms.studyWearable = { value: wearable ? 1 : 0 };
        shader.uniforms.studyRoughness = { value: material.roughness };
        shader.uniforms.studyWeathering = { value: glass ? 1 : luminous ? .12 : source.map ? .25 : 1 };
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 studyPosition;\nattribute vec2 studyEdges;\nattribute vec2 studyUv;\nvarying vec3 vStudyPosition;\nvarying vec2 vStudyEdges;\nvarying vec2 vStudyUv;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\nvStudyUv = studyUv;\nvNormalMapUv = studyUv;\nvRoughnessMapUv = studyUv;\nvMetalnessMapUv = studyUv;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStudyPosition = studyPosition;\nvStudyEdges = studyEdges;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${COMMON}`)
          .replace('#include <map_fragment>', source.map ? '#include <map_fragment>' : '')
          .replace('#include <color_fragment>', `#include <color_fragment>\n${COLOR}`)
          .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(mix(studyRoughness, 1.0, studyPacked.g * .7) + studyDirt * .12 - studyChips * .05, ${MIN_ROUGHNESS.toFixed(2)}, 1.0);`)
          .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix(max(metalness, studyPacked.b * studyWearable), .92, studyChips) * (1.0 - studyDirt * .85);')
          // Keep reflected light below the game's 2.2 bloom threshold without
          // dimming the authored glow of lamps, hot vents and sparking cables.
          .replace('#include <opaque_fragment>', 'vec3 studyReflected = max(outgoingLight - totalEmissiveRadiance, vec3(0.0));\nfloat studyPeak = max(studyReflected.r, max(studyReflected.g, studyReflected.b));\nif (studyPeak > 1.6) studyReflected *= 1.6 / studyPeak;\noutgoingLight = studyReflected + totalEmissiveRadiance;\n#include <opaque_fragment>');
      };
      material.customProgramCacheKey = () => `tyrian-material-study-textures-v3-${!!source.map}`;
      replacements.set(source, material);
      relief.set(material, strength);
    }
    return replacements.get(source);
  };
  // Walk the complete rig, not a material-identity allowlist. Skin copies,
  // legacy weapons and multi-material meshes must receive the same coverage.
  mech.root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const source = mesh.material, geometry = mesh.geometry;
    const sources = Array.isArray(source) ? source : [source];
    if (!sources.some((material) => material.isMeshStandardMaterial)) return;
    const density = sources.includes(ctx.paint) ? 2 : sources.includes(mech.cockpitMat) ? 3 : sources.some((material) => weaponMetals.has(material)) ? 3.5 : 7;
    mesh.geometry = surfaceGeometry(geometry, inverse.clone().multiply(mesh.matrixWorld), density, sources.some((material) => material.map));
    const range = mesh.geometry.getAttribute('studyEdges'), offset = segments.length / 6;
    for (let i = 0; i < range.count; i++) range.setX(i, range.getX(i) + offset);
    for (const value of mesh.geometry.userData.studySegments) segments.push(value);
    mesh.material = Array.isArray(source) ? source.map(replaceMaterial) : replaceMaterial(source);
    originals.push({ mesh, geometry, source, studyGeometry: mesh.geometry, studyMaterial: mesh.material });
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
      uniforms.studyPaint.value = next.paintVariation;
      uniforms.studyWear.value = next.edgeWear; uniforms.studyGrime.value = next.grime;
      for (const [material, strength] of relief) material.normalScale.setScalar(next.grain * strength);
    },
    setEnabled(enabled) {
      for (const { mesh, source, geometry, studyGeometry, studyMaterial } of originals) {
        mesh.material = enabled ? studyMaterial : source;
        mesh.geometry = enabled ? studyGeometry : geometry;
      }
    },
    dispose() {
      for (const { mesh, geometry, source, studyGeometry } of originals) {
        mesh.geometry = geometry; mesh.material = source; studyGeometry.dispose();
      }
      for (const material of replacements.values()) material.dispose();
      edgeData.dispose();
    },
  };
}
