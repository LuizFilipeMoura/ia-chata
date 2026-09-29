// Post-processing: an HDR render target (MSAA kept) through a bloom pass, so
// anything brighter than the threshold (muzzle flashes, embers, fire, glowing
// pylons, tracer rounds) bleeds light. OutputPass does the tone mapping and
// sRGB that the renderer does itself when bloom is off. Last, a per-theme
// colour grade (themes.js `grade`): a split tone in display space, whale-grey
// and ochre for the grimy locales, gilded warm for the deco ones. The grade
// never raises a highlight (soft light toward mid tints, contrast pivots at
// mid grey and clamps), so it can't make a new bloom blob. Grain and the
// vignette live in the #grain overlay (styles.css), not here.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uShadows: { value: new THREE.Color(0x808080) },
    uHighlights: { value: new THREE.Color(0x808080) },
    uSat: { value: 1 }, uContrast: { value: 1 }, uLift: { value: 0 }, uAmount: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3 uShadows, uHighlights;
    uniform float uSat, uContrast, uLift, uAmount;
    varying vec2 vUv;
    vec3 softLight(vec3 b, vec3 s) {
      return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (sqrt(b) - b), step(0.5, s));
    }
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = clamp(src.rgb, 0.0, 1.0);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 g = mix(vec3(l), c, uSat);
      g = clamp((g - 0.5) * uContrast + 0.5, 0.0, 1.0);
      g = softLight(g, mix(uShadows, uHighlights, smoothstep(0.05, 0.85, l)));
      g = mix(g, uShadows, uLift * (1.0 - l));
      // Above mid grey a channel may only fall, never climb past where it was.
      gl_FragColor = vec4(mix(c, min(g, max(max(c, vec3(l)), vec3(0.55))), uAmount), src.a);
    }`,
};

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
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.setSize(size.x, size.y);
  }

  // A theme's grade (themes.js); null or missing leaves the image untouched.
  setGrade(g) {
    // Display-space values: read the hex as-is, no sRGB to linear conversion.
    const u = this.grade.uniforms, raw = THREE.LinearSRGBColorSpace;
    u.uShadows.value.setHex(g?.shadows ?? 0x808080, raw); u.uHighlights.value.setHex(g?.highlights ?? 0x808080, raw);
    u.uSat.value = g?.sat ?? 1; u.uContrast.value = g?.contrast ?? 1; u.uLift.value = g?.lift ?? 0; u.uAmount.value = g?.amount ?? 0;
  }

  // A hidden / collapsed window reports 0 × 0; a zero-size target is an
  // incomplete framebuffer (the bloom halves it five times), so keep a floor.
  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(Math.max(64, w), Math.max(64, h));
  }

  // Either pass can be switched off in settings; with both off the world
  // renders straight to the screen instead of coming here.
  render(dt, { bloom = true, grade = true } = {}) {
    this.bloom.enabled = bloom;
    this.grade.enabled = grade;
    this.composer.render(dt);
  }
}
