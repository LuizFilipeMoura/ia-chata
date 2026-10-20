import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
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

test("material controls clamp invalid imported values without changing input", () => {
  const input = { paintVariation: 9, grain: -2, edgeWear: NaN, grime: 0 };
  const result = materialValues(input);
  assert.equal(result.paintVariation, 1); assert.equal(result.grain, 0); assert.equal(result.grime, 0);
  assert.ok(Number.isFinite(result.edgeWear)); assert.equal(input.paintVariation, 9);
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

test("material lab isolates every skin, supports exact original comparison and disposal", () => {
  for (const skin of ["factory", "refit", "ace", "worn", "rust"]) {
    const m = rig(skin), other = rig(skin), originals = [];
    m.root.traverse((o) => { if (o.isMesh) originals.push([o, o.geometry, o.material]); });
    const originalPaint = other.built.ctx.paint;
    const study = installMaterialStudy(m);
    assert.ok(study.meshCount > 0);
    study.set({ paintVariation: 1, grain: 1, edgeWear: 1, grime: 1 });
    for (const [mesh, geometry, material] of originals) {
      if (mesh.material !== material) {
        assert.notEqual(mesh.geometry, geometry);
        assert.ok(mesh.material.roughness >= MIN_ROUGHNESS);
        assert.equal(mesh.material.emissiveIntensity, material.emissiveIntensity);
        if (material === m.built.ctx.paint) assert.equal(mesh.material.metalness, 0, "paint is a dielectric coating");
        if (material === m.built.ctx.trim || material === m.built.ctx.steel) assert.ok(mesh.material.metalness >= .85, "exposed alloys have a metallic response");
      }
    }
    assert.equal(other.built.ctx.paint, originalPaint);
    assert.equal(originalPaint.onBeforeCompile.toString(), THREE.Material.prototype.onBeforeCompile.toString());
    study.setEnabled(false);
    for (const [mesh, , material] of originals) assert.equal(mesh.material, material, "Before restores actual source material");
    study.setEnabled(true); study.dispose();
    for (const [mesh, geometry, material] of originals) { assert.equal(mesh.geometry, geometry); assert.equal(mesh.material, material); }
  }
  assert.equal(MIN_ROUGHNESS, 0.7); assert.equal(LOCAL_LIGHT_CAP, 4);
});
