import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Mech } from "../scene/mechs.js";
import { FX } from "../scene/fx.js";
import { CHASSIS } from "/shared/game-state.js";
import { BASE_RADIUS } from "/shared/geometry.js";
import "../scene/matte.js";

const $ = (id) => document.getElementById(id);
const storageKey = "oil-iron-shake-lab";
const tuning = { Black: { magnitude: 1, frequency: 1 }, Tyrian: { magnitude: 1, frequency: 1 } };
const limits = { magnitude: [0, 3], frequency: [0.1, 3] };
const clamp = (key, value) => Math.round(Math.max(limits[key][0], Math.min(limits[key][1], value)) * 100) / 100;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  for (const name of Object.keys(tuning)) for (const key of Object.keys(limits)) {
    if (Number.isFinite(saved?.[name]?.[key])) tuning[name][key] = clamp(key, saved[name][key]);
  }
} catch { /* A disabled store or invalid saved JSON should not block the bench. */ }

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 100);
camera.position.set(4.1, 2.7, 4.3);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('stage').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.7, 0);
controls.minDistance = 2.3; controls.maxDistance = 11;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.enablePan = false;
scene.add(new THREE.HemisphereLight(0xe4eadb, 0x42382b, 2.4));
const sun = new THREE.DirectionalLight(0xffe1ad, 3);
sun.position.set(3, 6, 4); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 20 });
sun.shadow.normalBias = 0.025;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.MeshStandardMaterial({ color: 0x343a32, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(24, 48, 0x5c6355, 0x42493e); grid.position.y = -0.012; scene.add(grid);
const fx = new FX(scene, camera);
let mech, compare = false, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cache = new Map();
function loadRig() {
  if (mech) mech.root.visible = false;
  const name = $('chassis').value, skin = $('skin').value, key = `${name}.${skin}`;
  if (!cache.has(key)) {
    const c = CHASSIS.find((rig) => rig.name === name);
    const model = new Mech({ id: `shake-lab-${name}`, name, chassis: c.id, owner: "a", weightClass: c.class,
      longRange: c.longRange, melee: c.melee, radius: BASE_RADIUS[c.class], skin });
    model.setPose({ x: 0, y: 0 }, 0); model.update(0);
    scene.add(model.root); cache.set(key, model);
  }
  mech = cache.get(key); mech.root.visible = true;
  // Remove the previous rig's lingering puffs when swapping the preview.
  fx.ps.n = 0; fx.update(0);
  $('rig-title').textContent = `${name} · ${$('skin').selectedOptions[0].textContent}`;
  sync();
}
function sync(editingKey = null) {
  const values = tuning[$('chassis').value];
  for (const key of Object.keys(limits)) {
    const value = values[key], dial = $(`${key}-dial`), [min, max] = limits[key];
    if (key !== editingKey) $(key).value = value.toFixed(2);
    dial.style.setProperty('--turn', `${-135 + (value - min) / (max - min) * 270}deg`);
    dial.setAttribute('aria-valuenow', String(value));
    dial.setAttribute('aria-valuetext', `${value.toFixed(2)} times`);
  }
  Object.assign(mech.built.shake, compare ? { magnitude: 1, frequency: 1 } : values);
  mech.built.updateMechanical(0);
  $('frequency-readout').textContent = `${(44 / (2 * Math.PI) * mech.built.shake.frequency).toFixed(2)} Hz`;
  $('settings').value = JSON.stringify({ chassis: $('chassis').value, shake: values }, null, 2);
  $('compare').setAttribute('aria-pressed', String(compare));
  $('compare').textContent = compare ? 'Return to tuned' : 'Compare 1×';
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('live-state').textContent = `${paused ? 'PAUSED' : 'LIVE'} / ${compare ? 'GAME DEFAULT 1×' : 'TUNED'}`;
}
function setValue(key, value, editing = false) {
  if (!Number.isFinite(value)) return;
  tuning[$('chassis').value][key] = clamp(key, value);
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
      setValue(key, tuning[$('chassis').value][key] + drag.remainder); drag.remainder = 0;
    }
  });
  const release = () => { drag = null; };
  dial.addEventListener('pointerup', release); dial.addEventListener('pointercancel', release); dial.addEventListener('lostpointercapture', release);
  dial.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 }[e.key];
    if (step != null || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setValue(key, e.key === 'Home' ? limits[key][0] : e.key === 'End' ? limits[key][1] : tuning[$('chassis').value][key] + step);
    }
  });
}
$('chassis').addEventListener('change', () => { compare = false; loadRig(); });
$('skin').addEventListener('change', loadRig);
$('pause').addEventListener('click', () => { paused = !paused; sync(); });
$('compare').addEventListener('click', () => { compare = !compare; sync(); });
$('reset').addEventListener('click', () => { setValue('magnitude', 1); setValue('frequency', 1); });
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('settings').value); $('message').textContent = 'Copied. Paste these values back into our chat.'; }
  catch { $('settings').focus(); $('settings').select(); $('message').textContent = 'Settings selected. Press Ctrl+C / ⌘C to copy.'; }
});
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([$('settings').value], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `${$('chassis').value.toLowerCase()}-shake.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('message').textContent = 'Settings exported as JSON.';
});
const resize = new ResizeObserver(() => {
  const { width, height } = $('stage').getBoundingClientRect();
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
});
resize.observe($('stage'));
loadRig(); controls.update();
let previous = null, nextReadout = 0;
renderer.setAnimationLoop((now) => {
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
  renderer.render(scene, camera);
});
