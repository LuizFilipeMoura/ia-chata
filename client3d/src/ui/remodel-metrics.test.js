import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { frameSummary, modelCost } from "./remodel-metrics.js";

test("frame summary measures real frame intervals without treating stalls as 50ms", () => {
  const summary = frameSummary([16, 16, 17, 18, 150]);
  assert.equal(summary.median, 17);
  assert.equal(summary.p95, 150);
  assert.equal(frameSummary([10, 20, 30, 100]).median, 25);
  assert.equal(frameSummary([]), null);
});

test("model cost counts instancing and ignores hidden branches", () => {
  const root = new THREE.Group();
  const geo = new THREE.BoxGeometry();
  root.add(new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial(), 4));
  const hidden = new THREE.Group();
  hidden.visible = false;
  hidden.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
  root.add(hidden);
  assert.deepEqual(modelCost(root), { draws: 1, triangles: 48 });
});
