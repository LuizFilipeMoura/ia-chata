import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Mech } from "../mechs.js";
import { CHASSIS } from "../../../../shared/game-state.js";
import { BASE_RADIUS } from "../../../../shared/geometry.js";
import { surfaceGeometry, materialValues, installMaterialStudy } from "./material-study.js";
import { MIN_ROUGHNESS, LOCAL_LIGHT_CAP } from "../matte.js";

const rig = (skin = "ace") => {
  const c = CHASSIS.find((c) => c.name === "Tyrian");
  return new Mech({ id: "material-study", name: "Tyrian", chassis: c.id, owner: "a", weightClass: c.class,
    longRange: c.longRange, melee: c.melee, radius: BASE_RADIUS[c.class], skin });
};
const maps = Object.fromEntries(['armor', 'gunmetal', 'brass', 'rubber', 'glass', 'fabric'].map((family) =>
  [family, { color: new THREE.Texture(), normal: new THREE.Texture(), roughness: new THREE.Texture(), metalness: new THREE.Texture() }]));

test("armor, gunmetal, brass, rubber and glass use independent image sets, including cloned skin materials", () => {
  const families = Object.fromEntries(['armor', 'gunmetal', 'brass', 'rubber', 'glass', 'fabric'].map((family) =>
    [family, { color: new THREE.Texture(), normal: new THREE.Texture(), roughness: new THREE.Texture(), metalness: new THREE.Texture() }]));
  for (const skin of ['factory', 'refit', 'ace', 'worn', 'rust']) {
    const m = rig(skin), ctx = m.built.ctx;
    const samples = new Map([[ctx.paint, 'armor'], [ctx.steel, 'gunmetal'], [ctx.brass, 'brass'], [ctx.rubber, 'rubber'], [m.cockpitMat, 'glass']]);
    const copies = [];
    for (const [source, family] of samples) {
      // The skin pipeline clones and changes numeric properties before study.
      if (family === 'glass') continue;
      const copy = source.clone(); copy.metalness = .1; copy.roughness = .95;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), copy);
      m.root.add(mesh); copies.push([mesh, family]);
    }
    const expected = [];
    m.root.traverse((mesh) => { if (samples.has(mesh.material)) expected.push([mesh, samples.get(mesh.material)]); });
    const barrels = m.lr.spin.children.filter((mesh) => mesh.geometry?.parameters?.height > 1);
    expected.push(...copies, ...barrels.map((mesh) => [mesh, 'gunmetal']));
    const study = installMaterialStudy(m, undefined, families);
    for (const [mesh, family] of expected) {
      assert.equal(mesh.material.map, families[family].color, `${skin}: ${family} color`);
      assert.equal(mesh.material.normalMap, families[family].normal, `${skin}: ${family} relief`);
      assert.equal(mesh.material.roughnessMap, families[family].roughness, `${skin}: ${family} roughness`);
      assert.equal(mesh.material.userData.materialFamily, family);
    }
    assert.equal(new Set(expected.map(([mesh]) => mesh.material.map)).size, 5, 'five independently loaded albedos');
    study.dispose();
  }
});

test("material controls clamp invalid imported values without changing input", () => {
  const input = { paintVariation: 9, grain: -2, edgeWear: NaN, grime: 0 };
  const result = materialValues(input);
  assert.equal(result.paintVariation, 1); assert.equal(result.grain, 0); assert.equal(result.grime, 0);
  assert.ok(Number.isFinite(result.edgeWear)); assert.equal(input.paintVariation, 9);
});

test('Refit sandbags use cloth images instead of armor paint', () => {
  const m = rig('refit'), bags = [];
  m.root.traverse((mesh) => {
    if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.color?.getHex() === 0x9a8660) bags.push(mesh);
  });
  assert.ok(bags.length >= 2, 'exercise the real Refit sandbag accessory');
  const study = installMaterialStudy(m, undefined, maps);
  for (const bag of bags) {
    assert.equal(bag.material.map, maps.fabric.color);
    assert.equal(bag.material.normalMap, maps.fabric.normal);
    assert.equal(bag.material.metalness, 0);
    assert.ok(bag.material.roughness >= .95);
  }
  study.dispose();
});

test("surface masks share real boundary segments across a rectangular panel", () => {
  const source = new THREE.PlaneGeometry(2, 1);
  const geo = surfaceGeometry(source, new THREE.Matrix4());
  const ranges = geo.getAttribute("studyEdges"), segments = geo.userData.studySegments;
  assert.ok(ranges, "every triangle references its whole coplanar panel boundary");
  const point = new THREE.Vector3(-.98, -.49, 0), closest = new THREE.Vector3();
  for (let i = 0; i < ranges.count; i++) {
    const offset = ranges.getX(i), count = ranges.getY(i);
    assert.equal(count, 4, "four boundaries, no diagonal");
    let distance = Infinity;
    for (let edge = offset; edge < offset + count; edge++) {
      const segment = new THREE.Line3(new THREE.Vector3().fromArray(segments, edge * 6), new THREE.Vector3().fromArray(segments, edge * 6 + 3));
      distance = Math.min(distance, segment.closestPointToPoint(point, true, closest).distanceTo(point));
    }
    assert.ok(Math.abs(distance - .01) < 1e-6, "both triangles give identical corner wear");
  }
  source.computeBoundingBox(); geo.computeBoundingBox(); assert.ok(source.boundingBox.equals(geo.boundingBox));
  assert.ok(!source.hasAttribute("studyEdges"));
  for (const attribute of ["studyEdges", "studyPosition"]) assert.ok([...geo.getAttribute(attribute).array].every(Number.isFinite));
});

test("nonindexed geometry retains its original metadata after treatment", () => {
  const source = new THREE.PlaneGeometry(2, 1).toNonIndexed();
  source.userData = { part: "panel" };
  const geo = surfaceGeometry(source, new THREE.Matrix4());
  assert.deepEqual(source.userData, { part: "panel" });
  assert.notEqual(geo.userData, source.userData);
  assert.equal(geo.userData.part, "panel");
  geo.dispose();
  assert.deepEqual(source.userData, { part: "panel" });
});

test("texture coordinates follow physical panel size, including geometry with missing UVs", () => {
  const source = new THREE.BoxGeometry(2, 1, .5); source.deleteAttribute('uv');
  const geo = surfaceGeometry(source, new THREE.Matrix4().makeScale(.5, .5, .5));
  const uv = geo.getAttribute('uv'), position = geo.getAttribute('position');
  assert.ok(uv, "procedural hulls receive texture coordinates");
  for (let i = 0; i < position.count; i += 3) {
    const [a, b, c] = [0,1,2].map((v) => new THREE.Vector3().fromBufferAttribute(position, i + v));
    const area = b.sub(a).cross(c.sub(a)).length() / 2 * .25;
    const [u, v, w] = [0,1,2].map((offset) => new THREE.Vector2().fromBufferAttribute(uv, i + offset));
    const uvArea = Math.abs(v.sub(u).cross(w.sub(u))) / 2;
    assert.ok(Math.abs(uvArea - area * 4) < 1e-6, "two texture tiles per root unit, without stretching");
  }
  assert.ok(!source.hasAttribute('uv'), "original mesh untouched");
});

test("separate panels in a merged mesh get stable, distinct texture layouts without triangle seams", () => {
  const panel = new THREE.PlaneGeometry(.25, .25).toNonIndexed();
  const second = panel.clone().translate(0, 0, .5);
  const merged = mergeGeometries([panel, second]);
  const first = surfaceGeometry(merged, new THREE.Matrix4(), 2, false, 19);
  const repeat = surfaceGeometry(merged, new THREE.Matrix4(), 2, false, 19);
  const otherPart = surfaceGeometry(merged, new THREE.Matrix4(), 2, false, 20);
  const uv = first.getAttribute('studyUv');
  assert.notDeepEqual([...uv.array.slice(0, 12)], [...uv.array.slice(12)], 'parallel panels must not stamp the same image');
  assert.deepEqual([...uv.array], [...repeat.getAttribute('studyUv').array], 'refreshes keep the same layout');
  assert.notDeepEqual([...uv.array], [...otherPart.getAttribute('studyUv').array], 'identical neighboring parts get different placement');
  const positions = first.getAttribute('position'), seen = new Map();
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)].join(',');
    const coordinate = [uv.getX(i), uv.getY(i)];
    if (seen.has(key)) assert.deepEqual(coordinate, seen.get(key), 'triangles share continuous coordinates');
    seen.set(key, coordinate);
  }
  assert.ok(!merged.hasAttribute('studyUv'), 'source geometry remains untouched');
  for (const geo of [panel, second, merged, first, repeat, otherPart]) geo.dispose();
});

test("material lab isolates every skin, supports exact original comparison and disposal", () => {
  for (const skin of ["factory", "refit", "ace", "worn", "rust"]) {
    const m = rig(skin), other = rig(skin), originals = [];
    m.root.traverse((o) => { if (o.isMesh) originals.push([o, o.geometry, o.material]); });
    const originalPaint = other.built.ctx.paint;
    const study = installMaterialStudy(m, undefined, maps);
    assert.ok(study.meshCount > 0);
    study.set({ paintVariation: 1, grain: 1, edgeWear: 1, grime: 1 });
    for (const [mesh, geometry, material] of originals) {
      if (mesh.material !== material) {
        assert.notEqual(mesh.geometry, geometry);
        const before = Array.isArray(material) ? material : [material];
        const after = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        after.forEach((surface, i) => {
          assert.ok(surface.roughness >= MIN_ROUGHNESS);
          if (before[i] !== m.cockpitMat) assert.equal(surface.emissiveIntensity, before[i].emissiveIntensity);
          const textures = maps[surface.userData.materialFamily];
          assert.equal(surface.map, before[i].map || textures.color);
          assert.equal(surface.normalMap, textures.normal);
          assert.equal(surface.roughnessMap, textures.roughness);
          assert.equal(surface.metalnessMap, ['armor', 'gunmetal', 'brass'].includes(surface.userData.materialFamily) ? textures.metalness : null);
        });
        if (material === m.built.ctx.paint) assert.equal(mesh.material.metalness, 0, "paint is a dielectric coating");
        if (material === m.built.ctx.trim || material === m.built.ctx.steel) assert.ok(mesh.material.metalness >= .85, "exposed alloys have a metallic response");
      }
    }
    assert.equal(other.built.ctx.paint, originalPaint);
    assert.equal(originalPaint.onBeforeCompile.toString(), THREE.Material.prototype.onBeforeCompile.toString());
    study.setEnabled(false);
    for (const [mesh, geometry, material] of originals) {
      assert.equal(mesh.material, material, "Before restores actual source material");
      assert.equal(mesh.geometry, geometry, "Before restores original texture coordinates too");
    }
    study.setEnabled(true); study.dispose();
    for (const [mesh, geometry, material] of originals) { assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material); }
  }
  assert.equal(MIN_ROUGHNESS, 0.7); assert.equal(LOCAL_LIGHT_CAP, 4);
});

test("every physical Tyrian mesh receives textures across all skins, including weapons and skin copies", () => {
  for (const skin of ["factory", "refit", "ace", "worn", "rust"]) {
    const m = rig(skin), surfaces = [], markers = [];
    m.root.traverse((mesh) => {
      if (!mesh.isMesh) return;
      if ([mesh.material].flat().some((material) => material.isMeshStandardMaterial)) surfaces.push(mesh);
      else markers.push([mesh, mesh.material]);
    });
    const study = installMaterialStudy(m, undefined, maps);
    assert.equal(study.meshCount, surfaces.length, `${skin}: no physical part skipped`);
    for (const mesh of surfaces) {
      for (const material of [mesh.material].flat()) {
        assert.ok(material.map, `${skin}: ${mesh.userData.part || mesh.geometry.type} missing color texture`);
        assert.equal(material.normalMap, maps[material.userData.materialFamily].normal);
        assert.equal(material.roughnessMap, maps[material.userData.materialFamily].roughness);
      }
      assert.ok(mesh.geometry.hasAttribute('studyUv'));
    }
    for (const [mesh, material] of markers) assert.equal(mesh.material, material, 'team and selection markers retain their explicit UI materials');
    study.dispose();
  }
});

test("full coverage preserves authored decal UVs, nonmetal surfaces and animated lamps", () => {
  const m = rig(), ctx = m.built.ctx;
  const art = new THREE.Texture();
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(.2, .2).toNonIndexed(), new THREE.MeshStandardMaterial({ map: art, transparent: true, metalness: 0 }));
  m.built.pelvis.add(decal);
  const uv = [...decal.geometry.getAttribute('uv').array];
  const rubber = [], lamps = [];
  m.root.traverse((mesh) => {
    if (mesh.material === ctx.rubber) rubber.push(mesh);
    if (mesh.material === m.lampMat) lamps.push(mesh);
  });
  const study = installMaterialStudy(m, undefined, maps);
  assert.equal(decal.material.map, art, 'existing markings must not become steel images');
  assert.deepEqual([...decal.geometry.getAttribute('uv').array], uv, 'authored decal layout preserved');
  for (const mesh of rubber) {
    assert.equal(mesh.material.metalness, 0, 'rubber remains nonmetallic');
    assert.ok(mesh.material.roughness >= .9);
    assert.equal(mesh.material.normalMap, maps.rubber.normal, 'rubber receives its own relief map');
  }
  m.lampMat.emissiveIntensity = .3;
  m.lampMat.emissive.setHex(0xc8260e);
  for (const mesh of lamps) {
    mesh.material.onBeforeRender();
    assert.equal(mesh.material.emissiveIntensity, .3);
    assert.ok(mesh.material.emissive.equals(m.lampMat.emissive), 'lamp state still reaches rendered material');
  }
  study.dispose();
});

test("minigun barrels get exposed metal response and cab glass stays dark through idle updates", () => {
  const m = rig(), windows = [];
  const barrels = m.lr.spin.children.filter((mesh) => mesh.geometry?.parameters?.height > 1);
  m.root.traverse((mesh) => { if (mesh.material === m.cockpitMat) windows.push(mesh); });
  assert.equal(barrels.length, 6);
  assert.ok(windows.length > 0);
  const originalGlass = m.cockpitMat.color.clone();
  const study = installMaterialStudy(m, undefined, maps);
  for (const barrel of barrels) {
    assert.ok(barrel.material.metalness > .8, 'barrels must reflect as exposed metal, not half-painted plastic');
    assert.ok(barrel.material.roughness >= MIN_ROUGHNESS);
    assert.ok(barrel.material.normalScale.x > .2, 'scanned wear must survive on small weapon parts');
  }
  for (const intensity of [.2, .9]) {
    m.cockpitMat.emissiveIntensity = intensity;
    for (const window of windows) {
      window.material.onBeforeRender();
      assert.equal(window.material.metalness, 0, 'glass is a dielectric');
      assert.ok(Math.max(...window.material.color.toArray()) < .15, 'cab windows should be smoked, not pale yellow');
      assert.ok(window.material.emissiveIntensity > 0 && window.material.emissiveIntensity < intensity * .15, 'interior glow follows idle state without washing out the texture');
    }
  }
  assert.ok(m.cockpitMat.color.equals(originalGlass), 'original game window color untouched');
  study.dispose();
});
