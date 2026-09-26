// Post-processing: an HDR render target (MSAA kept) through a bloom pass, so
// anything brighter than the threshold (muzzle flashes, embers, fire, glowing
// pylons, tracer rounds) bleeds light. OutputPass does the tone mapping and
// sRGB that the renderer does itself when bloom is off.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(size.clone(), 0.7, 0.5, 2.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  // A hidden / collapsed window reports 0 × 0; a zero-size target is an
  // incomplete framebuffer (the bloom halves it five times), so keep a floor.
  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(Math.max(64, w), Math.max(64, h));
  }

  render(dt) { this.composer.render(dt); }
}
