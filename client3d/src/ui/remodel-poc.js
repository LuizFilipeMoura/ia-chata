// A compact art-review table. Uses the same builders as the game; only the
// explicit Before view selects the previous construction.
import * as THREE from "three";
import { el, fill, toast } from "./dom.js";
import { CHASSIS } from "/shared/game-state.js";
import { BASE_RADIUS } from "/shared/geometry.js";
import { SKINS, SKIN_IDS } from "../scene/rig/skins.js";
import { buildingVariant, smallVariant } from "../scene/props.js";
import { sceneryVariant } from "../scene/scenery.js";
import { refineryTower } from "../scene/objectives.js";
import { industrialGround } from "../scene/industrial-ground.js";
import { dressRandom, THEMES } from "../scene/themes.js";
import { frameSummary, modelCost } from "./remodel-metrics.js";
import "./remodel-poc.css";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DAMAGED_SP = { hull: [3, 10], arms: [5, 10], legs: [4, 10], engine: [3, 10] };

export function buildRemodelPoc(room) {
  const { world } = room;
  room.poc = { samples: [], lastFrame: null, nextReadout: 0, orbit: false, urls: [] };
  room.poc.autoReset = world.renderer.info.autoReset;
  world.renderer.info.autoReset = false;
  world.renderer.info.reset();
  // Clear review lighting without changing the player's weather preference.
  room.poc.weather = world.tableGroup.children.filter((o) => o.userData.weather);
  for (const weather of room.poc.weather) weather.visible = false;
  const ctx = {
    ...room.ctx, remodel: room.remodel, seed: 4242, rand: dressRandom(4242),
    anim: (fn) => room.loops.push(fn),
    chimney: (mouth) => room.loops.push((dt) => {
      if (Math.random() < dt * 0.7) world.fx.particle(mouth.getWorldPosition(V()), {
        color: 0x49443c, size: 0.4, life: 2.6, grow: 2.5, additive: false,
        opacity: 0.22, vel: V(0.2, 0.7, 0.06),
      });
    }),
  };
  // Diffuse fill only; unchanged sun, exposure, bloom and shader glare caps.
  room.group.add(new THREE.HemisphereLight(0xcbd3c7, 0x544a3d, 1.25));
  const floor = room.remodel ? industrialGround(36, 27) : new THREE.Group();
  floor.position.set(22, 0.025, 17);
  room.group.add(floor);
  const sceneAnchor = new THREE.Group();
  sceneAnchor.position.set(22, 0, 17);
  room.add({ id: "poc.scene", name: "Workshop yard", sub: "Black + Tyrian · five finishes", section: "poc", obj: sceneAnchor,
    source: "client3d/src/ui/remodel-poc.js", notes: "One working industrial yard. Select a rig to inspect motion, damage and finish.", viewDistance: 37 });
  const add = (id, name, obj, x, z, distance, source, notes = "", focusHeight = 0) => {
    obj.position.set(x, 0, z);
    return room.add({ id: `poc.${id}`, name, sub: "Industrial environment", section: "poc", obj, source, notes, viewDistance: distance, focusHeight });
  };
  add("pumphouse", "Beam-engine pumphouse", buildingVariant("pumphouse", { w: 6, h: 5, x: 12, y: 9 }, ctx), 12, 9, 17,
    "client3d/src/scene/dressing.js", "Connected drive mechanism; masonry, service access and roof construction.", 2.5);
  const ruin = { kind: "ruin", shape: "poly", x: 31, y: 13, points: [[-3,-2.4],[2.6,-2.1],[3,1.5],[1.2,2.3],[-2.5,2]] };
  add("ruins", "Broken workshop wall", sceneryVariant("ruin", "brickwalls", ruin, ctx), 31, 13, 14,
    "client3d/src/scene/scenery.js");
  add("drums", "Fuel drums", smallVariant("crate", "drums", { w: 2.2, h: 2.2, x: 18, y: 10 }, ctx), 18, 10, 9,
    "client3d/src/scene/dressing.js");
  add("sandbags", "Sandbag revetment", smallVariant("barricade", "sandbags", { w: 5, h: 0.9, x: 30, y: 18 }, ctx), 30, 18, 12,
    "client3d/src/scene/dressing.js");
  const rock = { kind: "rock", shape: "poly", x: 6, y: 16, points: [[-1.5,-1.2],[1.7,-1],[1.4,1.3],[-1.4,1.2]] };
  add("scrap", "Salvaged machinery", sceneryVariant("rock", "scrap", rock, ctx), 6, 16, 10,
    "client3d/src/scene/scenery.js");
  const objective = new THREE.Group();
  const refinery = refineryTower(objective, { vp: 2 }, world.fx, ctx);
  const marker = { state: "lit", mult: 1 };
  room.loops.push((dt, now) => refinery.anim?.(dt, now, marker));
  add("refinery", "Refinery objective", objective, 25, 7, 16,
    "client3d/src/scene/objectives.js", "Existing ownership lamp, pennant and radio signals remain visible.", 2);
  room.poc.refinery = { ...refinery, marker };

  for (const [row, name] of ["Black", "Tyrian"].entries()) {
    const chassis = CHASSIS.find((c) => c.name === name);
    SKIN_IDS.forEach((skin, col) => {
      const m = room.mech({ id: `poc-${chassis.id}-${skin}`, name, owner: row ? "b" : "a",
        chassis: chassis.id, weightClass: chassis.class, longRange: chassis.longRange, melee: chassis.melee,
        radius: BASE_RADIUS[chassis.class], skin, remodel: room.remodel }, 8.5 + col * 6.4, 22 + row * 5.2, 55);
      room.add({ id: `poc.${name}.${skin}`, name: `${name} · ${SKINS[skin].name}`,
        sub: `${chassis.class} · ${chassis.longRange} / ${chassis.melee}`, section: "poc", obj: m.root, mech: m,
        source: "client3d/src/scene/rig/tank-walker.js", notes: SKINS[skin].desc || "", viewDistance: 6.5 });
    });
  }
  room.poc.cost = modelCost(room.group);
  room.poc.warmupUntil = performance.now() + 2000;
}

export function pocOverview(room) {
  room.world.cam.goal = null;
  room.world.cam.target.set(21, 0, 17);
  room.world.cam.dist = 37;
  room.world.cam.yaw = -Math.PI / 2;
  room.world.cam.pitch = 0.73;
}

export function pocUI(room) {
  const choose = (id) => { const item = room.byId.get(id); if (item) room.select(item); };
  const mode = el("div", { class: "poc-segment", role: "group", "aria-label": "Model comparison" },
    [false, true].map((value) => el("button", { class: `btn ${room.remodel === value ? "primary" : "ghost"}`,
      "aria-pressed": room.remodel === value, onClick: () => room.onRemodel?.(value) }, value ? "Remodel" : "Before")));
  const theme = el("select", { "aria-label": "POC lighting", onChange: (e) => room.onTheme?.(e.target.value) },
    ["foundry", "railyard", "refinery"].map((id) => el("option", { value: id, selected: room.themeId === id }, THEMES[id].name)));
  room.index = el("div", { class: "dv-index" },
    el("div", { class: "poc-section" }, "FINISH STUDIES"),
    SKIN_IDS.map((skin) => el("div", { class: "poc-skin-row" },
      el("span", {}, SKINS[skin].name),
      ["Black", "Tyrian"].map((name) => el("button", { class: "dv-item", "data-id": `poc.${name}.${skin}`,
        onClick: () => choose(`poc.${name}.${skin}`), "aria-label": `${name} ${SKINS[skin].name}` }, name)))),
    el("div", { class: "poc-section" }, "WORKSHOP YARD"),
    room.items.filter((it) => !it.mech).map((it) => el("button", { class: "dv-item", "data-id": it.id, onClick: () => choose(it.id) }, it.name)));
  room.card = el("div", { class: "dv-card", style: { display: "none" } });
  room.labels = el("div", { class: "dv-labels" });
  room.labelEls = room.items.filter((it) => it.mech).map((it) => {
    const l = el("div", { class: "dv-label s-poc", onClick: () => room.select(it) }, it.name);
    room.labels.append(l); return { it, l, at: room.anchor(it) };
  });
  const orbit = el("button", { class: "btn ghost", "aria-pressed": false, onClick: () => {
    room.poc.orbit = !room.poc.orbit; orbit.setAttribute("aria-pressed", String(room.poc.orbit));
    orbit.textContent = room.poc.orbit ? "Stop orbit" : "Orbit";
  } }, "Orbit");
  room.poc.stats = el("output", { class: "poc-stats", "aria-label": "POC performance",
    title: "Frame intervals include browser throttling. Frame draws include shadows and post-processing." }, "Sampling frame time…");
  room.poc.recordButton = el("button", { class: "btn ghost", onClick: () => recordPoc(room) }, "Record 8s");
  room.poc.downloads = el("div", { class: "poc-downloads" });
  fill(room.root, el("div", { class: "devroom is-poc" }, room.labels,
    el("aside", { class: "dv-side" },
      el("div", { class: "poc-kicker" }, "OIL & IRON / MODEL STUDY 01"),
      el("div", { class: "dv-head" }, el("h2", {}, "Ironworks"), el("button", { class: "btn ghost", onClick: room.onBack }, "Back")),
      el("p", { class: "poc-intro" }, "Tank walkers. Working machinery. Five lives in the field."),
      mode, el("label", { class: "dv-theme" }, "Light", theme),
      el("div", { class: "dv-actions" },
        el("button", { class: "btn ghost", onClick: () => { pocOverview(room); room.poc.orbit = false; orbit.textContent = "Orbit"; orbit.setAttribute("aria-pressed", "false"); } }, "Whole yard"),
        orbit, room.poc.recordButton),
      room.poc.downloads, room.index,
      el("button", { class: "btn ghost", onClick: () => room.onHall?.("chassis") }, "All assets →")),
    room.card,
    el("div", { class: "poc-footer" },
      el("span", {}, room.remodel ? "REMODEL / MATTE INDUSTRIAL" : "BEFORE / ORIGINAL CONSTRUCTION"),
      el("span", {}, `${room.poc.cost.draws.toLocaleString()} asset draws · ${Math.round(room.poc.cost.triangles / 1000)}k model tris`),
      room.poc.stats)));
}

export function pocRigControls(room, m) {
  const apply = (label, fn) => el("button", { class: "btn ghost", disabled: m.destroyed && label !== "Reset",
    onClick: () => { fn(); if (label !== "Reset" && room.sel?.mech === m) room.select(room.sel, { fly: false }); } }, label);
  return el("div", { class: "poc-state-controls" },
    el("div", { class: "poc-section" }, "STATE CHECK"),
    el("div", { class: "dv-actions" },
      apply("Hot", () => { m.setHeat(1.2); m.devHot = true; }),
      apply("Shutdown", () => { m.setStatus({ shutdown: true }); m.devHot = false; m.devWalk = false; }),
      apply("Engine broken", () => { m.setParts({ engine: true }); m.devHot = false; m.devWalk = false; }),
      apply("Battle damage", () => m.setWear(DAMAGED_SP)),
      apply("Wreck", () => { m.destroy(); m.devHot = false; m.devWalk = false; }),
      apply("Reset", () => room.onRemodel?.(room.remodel))));
}

export function updatePoc(room, dt) {
  const p = room.poc, now = performance.now();
  if (p.lastFrame != null) {
    const interval = now - p.lastFrame;
    if (!document.hidden && now >= p.warmupUntil) p.samples.push(interval);
    if (p.samples.length > 180) p.samples.shift();
  }
  p.lastFrame = now;
  if (p.orbit) room.world.cam.yaw += dt * 0.35;
  if (now >= p.nextReadout) {
    const s = frameSummary(p.samples);
    const info = room.world.renderer.info.render;
    if (s && p.stats) p.stats.textContent = `${s.median.toFixed(1)} ms median · ${s.p95.toFixed(1)} ms p95 · ${info.calls.toLocaleString()} frame draws · ${Math.round(info.triangles / 1000)}k raster tris`;
    p.nextReadout = now + 1000;
  }
  room.world.renderer.info.reset();
  for (const fn of room.loops) fn(dt, room.t);
}

function recordPoc(room) {
  const canvas = room.world.renderer.domElement, p = room.poc;
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
    toast("Canvas recording is unavailable in this browser.", "info"); return;
  }
  if (p.recorder?.state === "recording") return;
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) { toast("WebM recording is unavailable in this browser.", "info"); return; }
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  p.recorder = recorder;
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    if (p.disposed) return;
    const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
    p.urls.push(url);
    const name = `ironworks-${room.sel?.id || "yard"}-${room.remodel ? "remodel" : "before"}-${room.themeId}.webm`;
    fill(p.downloads, el("a", { href: url, download: name }, "Save animation clip"));
    p.recordButton.disabled = false; p.recordButton.textContent = "Record 8s";
  };
  recorder.onerror = () => { stream.getTracks().forEach((track) => track.stop()); p.recordButton.disabled = false; p.recordButton.textContent = "Record 8s"; };
  recorder.start();
  p.recordButton.disabled = true; p.recordButton.textContent = "Recording…";
  p.recordTimer = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 8000);
}

export function disposePoc(room) {
  const p = room.poc;
  if (!p) return;
  p.disposed = true;
  clearTimeout(p.recordTimer);
  if (p.recorder?.state === "recording") p.recorder.stop();
  p.urls.forEach((url) => URL.revokeObjectURL(url));
  room.world.renderer.info.autoReset = p.autoReset;
  room.world.renderer.info.reset();
  room.loops.length = 0;
  // The whole table is replaced when leaving this hall. Dispose GPU resources;
  // Three can re-upload cached material/texture objects when another hall uses
  // them. Keep the JavaScript caches intact.
  const geometry = new Set(), materials = new Set(), textures = new Set();
  room.world.tableGroup.traverse((o) => {
    if (o.geometry) geometry.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const g of geometry) g.dispose();
  for (const m of materials) m.dispose();
  for (const t of textures) t.dispose();
}
