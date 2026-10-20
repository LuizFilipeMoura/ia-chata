import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Mech } from "../scene/mechs.js";
import { FX } from "../scene/fx.js";
import { MATERIAL_DEFAULTS, materialValues, installMaterialStudy } from "../scene/rig/material-study.js";
import { MATERIAL_ASSET, MATERIAL_MAP_URLS, loadMaterialTextures } from './material-textures.js';
import { SKIN_IDS } from "../scene/rig/skins.js";
import { Post } from "../scene/post.js";
import { CHASSIS } from "/shared/game-state.js";
import { BASE_RADIUS } from "/shared/geometry.js";
import "../scene/matte.js";

const $ = (id) => document.getElementById(id);
const storageKey = "oil-iron-material-lab-pbr-v1";
const tuning = Object.fromEntries(SKIN_IDS.map((skin) => [skin, materialValues()]));
const definitions = {
  paintVariation: ['Paint variation', 'Texture color & fading'], grain: ['Grain', 'Normal-map strength'],
  edgeWear: ['Edge wear', 'Scratches & exposed steel'], grime: ['Grime', 'Stains & cavity dirt'],
};
for (const [key, url] of Object.entries(MATERIAL_MAP_URLS)) $(`map-${key}`).src = url;
const limits = Object.fromEntries(Object.keys(definitions).map((key) => [key, [0, 1]]));
for (const [key, [label, hint]] of Object.entries(definitions)) {
  const control = document.createElement('div'); control.className = 'control';
  control.innerHTML = `<h2>${label}</h2><div class="dial" id="${key}-dial" role="slider" tabindex="0" aria-label="${label}" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0" aria-describedby="knob-help"><span class="pointer"></span></div><input id="${key}" aria-label="${label} value" type="number" min="0" max="1" step="0.01"><p class="range">${hint}</p>`;
  $('knobs').append(control);
}
const clamp = (key, value) => Math.round(Math.max(limits[key][0], Math.min(limits[key][1], value)) * 100) / 100;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  for (const name of Object.keys(tuning)) for (const key of Object.keys(limits)) {
    if (Number.isFinite(saved?.[name]?.[key])) tuning[name][key] = clamp(key, saved[name][key]);
  }
} catch { /* A disabled store or invalid saved JSON should not block the bench. */ }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202725);
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);
camera.position.set(2.3, 1.75, 2.6);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('stage').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0);
controls.minDistance = 2.3; controls.maxDistance = 11;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.enablePan = false;
// Broad, low-luminance workshop reflections give metal something to reflect.
// Broad sources only. Treated armor also caps output below the bloom threshold.
const reflectionRoom = new THREE.Scene(); reflectionRoom.background = new THREE.Color(.045, .055, .065);
for (const [position, size, color] of [
  [[-4, 3, 2], [3, 5], [1.55, 1.75, 2.0]],
  [[3, 4, -2], [5, 3], [3.0, 2.8, 2.5]],
  [[0, 6, 0], [5, 5], [1.2, 1.3, 1.4]],
]) {
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(...size), new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.DoubleSide }));
  panel.position.set(...position); panel.lookAt(0, 0, 0); reflectionRoom.add(panel);
}
const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromScene(reflectionRoom, .08);
scene.environment = environment.texture; scene.environmentIntensity = 1;
reflectionRoom.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xc8d4df, 0x37302a, .65));
const sun = new THREE.DirectionalLight(0xfff0db, 2.2);
sun.position.set(3, 6, 4); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 20 });
sun.shadow.normalBias = 0.025;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.MeshStandardMaterial({ color: 0x252a2c, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(24, 48, 0x5c6355, 0x42493e); grid.position.y = -0.012; scene.add(grid);
const fx = new FX(scene, camera);
const post = new Post(renderer, scene, camera); post.setGrade(null);
const workLamp = new THREE.PointLight(0xffe6c2, 0, 6, 2); workLamp.position.set(1.2, 1.4, 1.1); scene.add(workLamp);
let mech, study, materialMaps, compare = false, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cache = new Map();
function loadRig() {
  if (!materialMaps) return;
  if (mech) mech.root.visible = false;
  const name = 'Tyrian', skin = $('skin').value, key = skin;
  if (!cache.has(key)) {
    const c = CHASSIS.find((rig) => rig.name === name);
    const model = new Mech({ id: `material-lab-${name}`, name, chassis: c.id, owner: "a", weightClass: c.class,
      longRange: c.longRange, melee: c.melee, radius: BASE_RADIUS[c.class], skin });
    model.setPose({ x: 0, y: 0 }, 0); model.update(0);
    scene.add(model.root); cache.set(key, { model, study: installMaterialStudy(model, tuning[skin], materialMaps) });
  }
  ({ model: mech, study } = cache.get(key)); mech.root.visible = true;
  // Remove the previous rig's lingering puffs when swapping the preview.
  fx.ps.n = 0; fx.update(0);
  $('rig-title').textContent = `${name} · ${$('skin').selectedOptions[0].textContent}`;
  sync();
}
function sync(editingKey = null) {
  const values = tuning[$('skin').value];
  for (const key of Object.keys(limits)) {
    const value = values[key], dial = $(`${key}-dial`), [min, max] = limits[key];
    if (key !== editingKey) $(key).value = value.toFixed(2);
    dial.style.setProperty('--turn', `${-135 + (value - min) / (max - min) * 270}deg`);
    dial.setAttribute('aria-valuenow', String(value));
    dial.setAttribute('aria-valuetext', `${Math.round(value * 100)} percent`);
  }
  study?.set(values); study?.setEnabled(!compare);
  $('settings').value = JSON.stringify({ chassis: 'Tyrian', skin: $('skin').value, texture: MATERIAL_ASSET, material: values }, null, 2);
  $('compare').setAttribute('aria-pressed', String(compare));
  $('compare').textContent = compare ? 'Return to tuned' : 'Compare original';
  $('pause').textContent = paused ? 'Resume idle' : 'Pause idle';
  $('live-state').textContent = `${compare ? 'ORIGINAL MATERIALS' : 'TEXTURED STEEL / 2K PBR'} / MATTE PROTECTION ON`;
}
function setValue(key, value, editing = false) {
  if (!Number.isFinite(value)) return;
  tuning[$('skin').value][key] = clamp(key, value);
  compare = false;
  try { localStorage.setItem(storageKey, JSON.stringify(tuning)); }
  catch { $('message').textContent = 'Browser storage unavailable. Copy settings before closing.'; }
  sync(editing ? key : null);
}
for (const key of Object.keys(limits)) {
  const dial = $(`${key}-dial`), input = $(key);
  input.addEventListener('input', () => { if (input.value !== '') setValue(key, input.valueAsNumber, true); });
  input.addEventListener('change', sync);
  input.addEventListener('blur', sync);
  let drag = null;
  dial.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { y: e.clientY }; dial.setPointerCapture(e.pointerId); dial.focus();
  });
  dial.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const delta = (drag.y - e.clientY) * (e.shiftKey ? 0.001 : 0.01);
    drag.y = e.clientY;
    // Accumulate sub-step travel while Shift is held.
    drag.remainder = (drag.remainder || 0) + delta;
    if (Math.abs(drag.remainder) >= 0.01) {
      setValue(key, tuning[$('skin').value][key] + drag.remainder); drag.remainder = 0;
    }
  });
  const release = () => { drag = null; };
  dial.addEventListener('pointerup', release); dial.addEventListener('pointercancel', release); dial.addEventListener('lostpointercapture', release);
  dial.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 }[e.key];
    if (step != null || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setValue(key, e.key === 'Home' ? limits[key][0] : e.key === 'End' ? limits[key][1] : tuning[$('skin').value][key] + step);
    }
  });
}
$('skin').addEventListener('change', loadRig);
$('light').addEventListener('change', () => {
  const mode = $('light').value;
  sun.color.setHex(mode === 'foundry' ? 0xffb765 : 0xfff0db);
  scene.background.setHex(mode === 'foundry' ? 0x28231e : 0x202725);
  workLamp.intensity = mode === 'stress' ? 120 : 0;
});
$('pause').addEventListener('click', () => { paused = !paused; sync(); });
$('compare').addEventListener('click', () => { compare = !compare; sync(); });
$('reset').addEventListener('click', () => {
  for (const [key, value] of Object.entries(MATERIAL_DEFAULTS)) setValue(key, value);
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('settings').value); $('message').textContent = 'Copied. Paste these values back into our chat.'; }
  catch { $('settings').focus(); $('settings').select(); $('message').textContent = 'Settings selected. Press Ctrl+C / ⌘C to copy.'; }
});
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([$('settings').value], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `tyrian-${$('skin').value}-material.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('message').textContent = 'Settings exported as JSON.';
});
const resize = new ResizeObserver(() => {
  const { width, height } = $('stage').getBoundingClientRect();
  renderer.setSize(width, height, false); post.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
});
resize.observe($('stage'));
controls.update();
loadMaterialTextures(renderer).then((maps) => {
  materialMaps = maps; loadRig();
}).catch((error) => {
  $('live-state').textContent = 'TEXTURE LOAD FAILED';
  $('message').textContent = `Could not load the material images: ${error.message || 'reload the page to retry'}.`;
});
let previous = null, nextReadout = 0;
renderer.setAnimationLoop((now) => {
  if (!mech) return;
  const elapsed = previous == null ? 0 : Math.max(0, (now - previous) / 1000);
  const dt = Math.min(0.05, elapsed); previous = now;
  if (!paused && !document.hidden) {
    // Substeps preserve the rig's existing pose integration on slower frames.
    const steps = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < steps; i++) mech.update(dt / steps);
    if ($('smoke').checked) mech.emitAmbient(fx, dt);
    fx.update(dt);
  }
  if (now >= nextReadout) {
    $('cadence').textContent = paused ? 'Preview paused' : elapsed > 0.08 ? 'Preview throttled — focus this tab' : 'Live engine · Feet planted';
    nextReadout = now + 750;
  }
  post.render(dt, { bloom: true, grade: false });
});
