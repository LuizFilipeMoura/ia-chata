// No glare anywhere on the table. Two shader-level floors, so no single
// material or lamp can bring the white blobs back:
//
// 1. Roughness floor. Every MeshStandard/Physical surface shades with at least
//    MIN_ROUGHNESS, whatever its own material says: a glossy surface (oil,
//    brass, polished armour) caught the sun straight into the camera and bloom
//    blew it up. Fixing materials one by one kept missing the next one.
// 2. Local light cap. A point or spot light (objective lamps, flashes, wreck
//    fires, flare stacks) sits a metre or two off the table, so the inverse
//    square law made the surface right under it blow out to white, and bloom
//    spread that into a halo. Each one's per-pixel strength is scaled down to
//    at most LOCAL_LIGHT_CAP, keeping its hue, so it still tints a pool.
//
// Measured over a close-up sweep of a seeded battle (near-white pixels):
// 16917 stock, 702 with both floors; the rest is emissive bulbs meant to glow.
import * as THREE from "three";

export const MIN_ROUGHNESS = 0.7;
export const LOCAL_LIGHT_CAP = 4;

const f = (v) => v.toFixed(2);
const CAP = ` { float pk = max( max( directLight.color.r, directLight.color.g ), directLight.color.b ); if ( pk > ${f(LOCAL_LIGHT_CAP)} ) directLight.color *= ${f(LOCAL_LIGHT_CAP)} / pk; }`;
const POINT = "getPointLightInfo( pointLight, geometryPosition, directLight );";
const SPOT = "getSpotLightInfo( spotLight, geometryPosition, directLight );";

THREE.ShaderChunk.lights_physical_fragment = THREE.ShaderChunk.lights_physical_fragment
  .replace("material.roughness = max( roughnessFactor, 0.0525 );", `material.roughness = max( roughnessFactor, ${f(MIN_ROUGHNESS)} );`);
THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin
  .replace(POINT, POINT + CAP).replace(SPOT, SPOT + CAP);
