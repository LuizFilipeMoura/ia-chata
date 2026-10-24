import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MIN_ROUGHNESS, LOCAL_LIGHT_CAP } from "./matte.js";

// If a three.js upgrade rewords a chunk, the replace silently no-ops and the
// glare comes back. Catch that here.
test("every physical material shades with the matte roughness floor", () => {
  const chunk = THREE.ShaderChunk.lights_physical_fragment;
  assert.ok(chunk.includes(`max( roughnessFactor, ${MIN_ROUGHNESS.toFixed(2)} )`));
  assert.ok(!chunk.includes("max( roughnessFactor, 0.0525 )"));
});

test("point and spot lights are both capped", () => {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  const cap = `directLight.color *= ${LOCAL_LIGHT_CAP.toFixed(2)} / pk`;
  assert.equal(chunk.split(cap).length - 1, 2);
});
