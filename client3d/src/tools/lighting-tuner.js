import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { World } from "../scene/world.js";
import { Mech } from "../scene/mechs.js";
import { THEMES } from "../scene/themes.js";
import { CHASSIS } from "/shared/game-state.js";
import { BASE_RADIUS } from "/shared/geometry.js";

const $ = (id) => document.getElementById(id);
const hex = (value) => `#${value.toString(16).padStart(6, "0")}`;
const storageKey = "oil-iron-lighting-bench-v1";
const groups = [
  ["Light balance", [
    ["sun", "Sun strength", 0, 12, 0.01], ["fill", "Sky fill", 0, 5, 0.01],
    ["exposure", "Exposure", 0.3, 2.5, 0.01],
  ], [["sunColor", "Sun color"], ["skyColor", "Sky color"], ["groundColor", "Ground bounce"]]],
  ["Shadows & direction", [
    ["shadow", "Shadow strength", 0, 1, 0.01], ["radius", "Edge softness", 1, 8, 0.1],
    ["azimuth", "Sun direction", -180, 180, 0.001], ["elevation", "Sun height", 10, 85, 0.001],
  ], []],
  ["Color & glow", [
    ["contrast", "Contrast", 0.8, 1.2, 0.01], ["lift", "Shadow lift", 0, 0.2, 0.005],
    ["sat", "Saturation", 0, 1.3, 0.01], ["amount", "Grade mix", 0, 1, 0.01],
    ["bloom", "Bloom strength", 0, 1.5, 0.05],
  ], []],
];
const limits = Object.fromEntries(groups.flatMap(([, sliders]) => sliders.map(([key, , min, max, step]) => [key, { min, max, step }])));
const colorKeys = groups.flatMap(([, , colors]) => colors.map(([key]) => key));
const clamp = (key, value) => Math.max(limits[key].min, Math.min(limits[key].max, value));
function original(theme) {
  const [x, y, z] = theme.sunAt;
  return { sun: theme.sun.i, fill: theme.hemi.i, exposure: 1.3,
    sunColor: hex(theme.sun.color), skyColor: hex(theme.hemi.sky), groundColor: hex(theme.hemi.ground),
    shadow: 1, radius: 3, azimuth: Math.atan2(x, z) * 180 / Math.PI,
    elevation: Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI,
    contrast: theme.grade.contrast, lift: theme.grade.lift, sat: theme.grade.sat, amount: theme.grade.amount,
    bloom: 0.7, gradeEnabled: true, bloomEnabled: true };
}
function soft(theme) {
  return { ...original(theme), sun: +(theme.sun.i * 0.65).toFixed(2), fill: 1.8,
    skyColor: "#bfcbd8", groundColor: "#706354", shadow: 0.9, radius: 4,
    exposure: 1.15, contrast: 1, lift: 0.055, amount: 0.4, bloom: 0.45 };
}
const recipes = Object.fromEntries(Object.entries(THEMES).map(([id, theme]) => [id, soft(theme)]));
let themeId = "foundry", comparing = false;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (THEMES[saved?.theme]) themeId = saved.theme;
  for (const id of Object.keys(recipes)) {
    const values = saved?.recipes?.[id];
    for (const key of Object.keys(limits)) if (Number.isFinite(values?.[key])) recipes[id][key] = clamp(key, values[key]);
    for (const key of colorKeys) if (/^#[0-9a-f]{6}$/i.test(values?.[key])) recipes[id][key] = values[key];
    for (const key of ["gradeEnabled", "bloomEnabled"]) if (typeof values?.[key] === "boolean") recipes[id][key] = values[key];
  }
} catch { /* The bench also works with browser storage disabled. */ }
for (const [id, theme] of Object.entries(THEMES)) $('theme').add(new Option(theme.name, id));
$('theme').value = themeId;
for (const [title, sliders, colors] of groups) {
  const section = document.createElement('fieldset');
  section.innerHTML = `<legend>${title}</legend>`;
  for (const [key, label, min, max, step] of sliders) {
    const row = document.createElement('div'); row.className = 'control';
    row.innerHTML = `<label for="${key}">${label}<input id="${key}-number" aria-label="${label} value" type="number" min="${min}" max="${max}" step="${step}"></label><input id="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}">`;
    section.append(row);
  }
  const swatches = document.createElement('div'); swatches.className = 'colors';
  for (const [key, label] of colors) swatches.innerHTML += `<label>${label}<input id="${key}" type="color" aria-label="${label}"></label>`;
  section.append(swatches); $('controls').append(section);
}

// Reuse the real battlefield builder without game input handlers or simulation.
class BenchWorld extends World {
  bindInput() {}
  // Tall perimeter poles obstruct the close-up inspection cameras.
  buildSearchlights() {}
}
const world = new BenchWorld($('stage'));
world.renderer.setAnimationLoop(null);
world.buildField({ width: 28, height: 22, lockTheme: true, theme: "foundry", dressSeed: "lighting-bench", terrain: [
  { kind: "building", shape: "rect", x: 7, y: 6, w: 6, h: 5 },
  { kind: "building", shape: "rect", x: 22, y: 5, w: 5, h: 4 },
  { kind: "barricade", shape: "rect", x: 19, y: 14, w: 5, h: 1 },
  { kind: "crate", shape: "rect", x: 5, y: 15, w: 3, h: 2 },
] }, [{ x: 24, y: 17, vp: 1 }]);
// Backdrop objects such as the airship establish their position on first tick.
for (const animate of world.animators) animate(0, 0);
for (const [i, name] of ["Tyrian", "Gold", "Cobalt"].entries()) {
  const c = CHASSIS.find((item) => item.name === name);
  const mech = new Mech({ id: `lighting-${name}`, name, chassis: c.id, owner: i === 2 ? 'b' : 'a',
    weightClass: c.class, longRange: c.longRange, melee: c.melee, radius: BASE_RADIUS[c.class], skin: 'factory' });
  mech.setPose({ x: 10 + i * 3, y: 13 + i % 2 * 2 }, 35 + i * 35); mech.update(0); world.scene.add(mech.root);
}
const orbit = new OrbitControls(world.camera, world.renderer.domElement);
orbit.minDistance = 3; orbit.maxDistance = 75; orbit.maxPolarAngle = Math.PI / 2 - 0.025;
const cameras = {
  yard: { position: [37, 28, 40], target: [14, 0, 10] },
  rigs: { position: [18, 6, 22], target: [13, 1, 14] },
  shadow: { position: [10, 5, 22], target: [10, 1, 13] },
};
let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const values = comparing ? original(THEMES[themeId]) : recipes[themeId];
    world.post.render(0, { bloom: values.bloomEnabled, grade: values.gradeEnabled });
  });
}
function view(name) {
  world.camera.position.fromArray(cameras[name].position); orbit.target.fromArray(cameras[name].target); orbit.update(); render();
}
orbit.addEventListener('change', render);
document.querySelectorAll('[data-camera]').forEach((button) => button.addEventListener('click', () => view(button.dataset.camera)));
view('yard');
function direction(v) {
  const az = THREE.MathUtils.degToRad(v.azimuth), el = THREE.MathUtils.degToRad(v.elevation);
  return [Math.sin(az) * Math.cos(el) * 75, Math.sin(el) * 75, Math.cos(az) * Math.cos(el) * 75];
}
function recipe(v) {
  return { theme: themeId, sun: { color: v.sunColor, i: v.sun }, hemi: { sky: v.skyColor, ground: v.groundColor, i: v.fill },
    sunAt: direction(v).map((n) => +n.toFixed(3)), shadow: { type: 'PCFShadowMap', radius: v.radius, intensity: v.shadow },
    toneMapping: 'ACESFilmicToneMapping', exposure: v.exposure,
    grade: { ...THEMES[themeId].grade, shadows: hex(THEMES[themeId].grade.shadows), highlights: hex(THEMES[themeId].grade.highlights),
      contrast: v.contrast, lift: v.lift, sat: v.sat, amount: v.amount },
    gradeEnabled: v.gradeEnabled, bloom: { enabled: v.bloomEnabled, strength: v.bloom, radius: 0.5, threshold: 2.2 } };
}
function apply() {
  const theme = THEMES[themeId], tuned = recipes[themeId], v = comparing ? original(theme) : tuned;
  world.sun.intensity = v.sun; world.sun.color.set(v.sunColor);
  world.hemi.intensity = v.fill; world.hemi.color.set(v.skyColor); world.hemi.groundColor.set(v.groundColor);
  world.renderer.toneMappingExposure = v.exposure;
  world.sun.shadow.radius = v.radius; world.sun.shadow.intensity = v.shadow;
  world.sun.position.fromArray(direction(v)).add(world.sun.target.position);
  world.post.setGrade({ ...theme.grade, contrast: v.contrast, lift: v.lift, sat: v.sat, amount: v.amount });
  world.post.bloom.strength = v.bloom;
  for (const key of Object.keys(limits)) {
    $(key).value = tuned[key]; $(`${key}-number`).value = +tuned[key].toFixed(3);
  }
  for (const key of colorKeys) $(key).value = tuned[key];
  $('grade-enabled').checked = tuned.gradeEnabled; $('bloom-enabled').checked = tuned.bloomEnabled;
  $('compare').setAttribute('aria-pressed', String(comparing));
  $('compare').textContent = comparing ? 'Return to tuned' : 'Show original';
  $('view-name').textContent = `${comparing ? 'Original' : 'Your lighting'} · ${theme.name}`;
  $('recipe').value = JSON.stringify(recipe(tuned), null, 2);
  render();
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({ theme: themeId, recipes })); }
  catch { $('message').textContent = 'Browser storage unavailable. Save JSON before closing.'; }
}
function edit(key, value) { recipes[themeId][key] = value; comparing = false; apply(); save(); }
for (const key of Object.keys(limits)) {
  $(key).addEventListener('input', (event) => edit(key, +event.target.value));
  $(`${key}-number`).addEventListener('change', (event) => {
    const value = event.target.valueAsNumber;
    if (Number.isFinite(value)) edit(key, clamp(key, value)); else apply();
  });
}
for (const key of colorKeys) $(key).addEventListener('input', (event) => edit(key, event.target.value));
for (const [id, key] of [['grade-enabled', 'gradeEnabled'], ['bloom-enabled', 'bloomEnabled']]) $(id).addEventListener('change', (e) => edit(key, e.target.checked));
$('compare').addEventListener('click', () => { comparing = !comparing; apply(); });
$('soft').addEventListener('click', () => { recipes[themeId] = soft(THEMES[themeId]); comparing = false; apply(); save(); });
$('stock').addEventListener('click', () => { recipes[themeId] = original(THEMES[themeId]); comparing = false; apply(); save(); });
$('theme').addEventListener('change', () => {
  themeId = $('theme').value; comparing = false; world.applyTheme(THEMES[themeId], 28, 22); apply(); save();
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('recipe').value); $('message').textContent = 'Copied. Paste your recipe into our chat.'; }
  catch { $('recipe').focus(); $('recipe').select(); $('message').textContent = 'Recipe selected. Press Ctrl+C / ⌘C to copy.'; }
});
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([$('recipe').value], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `lighting-${themeId}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('message').textContent = 'Recipe saved as JSON.';
});
new ResizeObserver(() => { world.resize(); render(); }).observe($('stage'));
world.applyTheme(THEMES[themeId], 28, 22); apply();
$('message').textContent = 'Ready. Edits stay in this browser; game defaults stay unchanged.';
