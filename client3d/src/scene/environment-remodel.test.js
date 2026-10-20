import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { pumpPose, pumphouseRemodel, drumsRemodel, sandbagsRemodel } from "./environment-remodel.js";
import { industrialGround } from "./industrial-ground.js";
import { propFits } from "./rig/envelope.js";
import { refineryTower } from "./objectives.js";

function context() {
  const callbacks = [];
  return {
    callbacks, theme: { lamp: 0xffba6a }, rand: () => 0.35,
    fx: { particle() {}, steam() {} },
    anim: (fn) => callbacks.push(fn),
  };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("pump drive keeps its rigid rods attached through an entire crank revolution", () => {
  for (let step = 0; step <= 240; step++) {
    const p = pumpPose(step * Math.PI / 120);
    close(p.crankPin.distanceTo(p.crankCenter), 0.28);
    close(p.beamEnd.distanceTo(p.pivot), 1.05);
    close(p.beamEnd.distanceTo(p.crankPin), 1.3);
    close(p.pumpEnd.distanceTo(p.piston), 0.5);
    close(p.piston.x, 1.05);
    assert.ok(p.piston.y >= 0.77, "crosshead must stay above the cylinder cap");
    for (const value of Object.values(p)) {
      if (value?.isVector3) assert.ok(value.toArray().every(Number.isFinite));
    }
  }
});

test("pump rod mesh endpoints follow the actual pin positions without stretching", () => {
  const ctx = context(), root = pumphouseRemodel({ w: 6, h: 5 }, ctx);
  for (let step = 0; step < 60; step++) {
    ctx.callbacks.forEach((fn) => fn(1 / 60, step / 9));
    root.updateMatrixWorld(true);
    for (const [link, a, b] of [
      ["drive-rod", "crank-pin", "beam-drive-pin"],
      ["pump-rod", "beam-pump-pin", "piston-pin"],
    ]) {
      const rod = root.getObjectByName(link);
      const from = root.getObjectByName(a).getWorldPosition(new THREE.Vector3());
      const to = root.getObjectByName(b).getWorldPosition(new THREE.Vector3());
      close(rod.localToWorld(new THREE.Vector3(0, -0.5, 0)).distanceTo(from), 0);
      close(rod.localToWorld(new THREE.Vector3(0, 0.5, 0)).distanceTo(to), 0);
    }
  }
});

test("remodeled environment stays inside narrow footprints at every pump pose", () => {
  for (const [slot, build, rects] of [
    ["building", pumphouseRemodel, [[6, 5], [4, 4], [9, 4], [2, 1.2]]],
    ["crate", drumsRemodel, [[2.2, 2.2], [1.5, 1.2], [0.7, 0.5]]],
    ["barricade", sandbagsRemodel, [[7, 0.9], [3, 0.6], [0.7, 0.35]]],
  ]) for (const [w, h] of rects) {
    const ctx = context(), root = build({ w, h, x: 0, y: 0 }, ctx);
    for (let step = 0; step < 24; step++) {
      ctx.callbacks.forEach((fn) => fn(1 / 60, step / 3));
      const fit = propFits(root, slot, w, h);
      assert.ok(fit.ok, `${slot} ${w}x${h}, top ${fit.height}, bounds ${JSON.stringify(fit.box)}`);
      root.traverse((node) => assert.ok(node.matrixWorld.elements.every(Number.isFinite)));
    }
  }
});

test("workshop ground stays localized and all remodeled finishes remain matte", () => {
  const ctx = context();
  const roots = [
    pumphouseRemodel({ w: 6, h: 5 }, ctx),
    drumsRemodel({ w: 2, h: 2 }, ctx),
    sandbagsRemodel({ w: 5, h: 0.8 }, ctx),
  ];
  for (const [w, d] of [[28, 20], [5, 3]]) {
    const ground = industrialGround(w, d);
    const bounds = new THREE.Box3().setFromObject(ground);
    assert.ok(bounds.min.x >= -w / 2 - 1e-5 && bounds.max.x <= w / 2 + 1e-5);
    assert.ok(bounds.min.z >= -d / 2 - 1e-5 && bounds.max.z <= d / 2 + 1e-5);
    assert.ok(bounds.max.y <= 0.15);
    roots.push(ground);
  }
  for (const root of roots) root.traverse((node) => {
    if (node.isMesh && node.material.isMeshStandardMaterial) {
      assert.ok(node.material.roughness >= 0.7, `${root.name}/${node.name} roughness`);
      assert.ok(node.material.metalness <= 0.3, `${root.name}/${node.name} metalness`);
    }
  });
});

test("refinery retains ownership material and state-driven broadcast without a DOM", () => {
  const group = new THREE.Group(), ctx = context();
  const marker = refineryTower(group, { vp: 2 }, ctx.fx);
  assert.equal(marker.noBob, true);
  assert.equal(marker.gem.material, marker.pylonMat);
  assert.ok(marker.light.isPointLight);
  marker.pylonMat.emissive.setHex(0x0088ff);
  marker.anim(0.1, 0.5, { state: "lit" });
  const rings = [];
  group.traverse((node) => {
    if (node.isMesh && node.material.transparent) rings.push(node);
  });
  assert.ok(rings.some((node) => node.visible && node.material.color.getHex() === 0x0088ff));
  marker.anim(0.1, 1, { state: "dark" });
  assert.ok(rings.every((node) => !node.visible));
});
