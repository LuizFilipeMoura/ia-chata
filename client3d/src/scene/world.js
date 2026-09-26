// The table. Renderer + RTS camera (WASD/edge pan, Q/E or right-drag orbit,
// wheel zoom), lighting with shadows, the battlefield dressed from the room's
// field/terrain, objective pylons, deployment zones, picking, and overlay
// helpers (range rings, path previews, ghosts). Field inches map 1:1 to world
// units: field (x, y) → world (x, 0, y).
import * as THREE from "three";
import { FX } from "./fx.js";
import { settings } from "../settings.js";
import { themeFor, dressRandom, layoutHash } from "./themes.js";
import { buildingProp, barricadeProp, crateProp, rubbleProp, backdrop } from "./props.js";

const DEG = Math.PI / 180;

// The table's paint job, per theme (`gd` = theme.ground): base colour, blooms,
// specks, rail spurs, riveted deck plates, hazard stripes, glowing cracks.
function groundTexture(w, h, gd) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = Math.round(1024 * h / w);
  const g = c.getContext("2d");
  g.fillStyle = gd.base; g.fillRect(0, 0, c.width, c.height);
  if (gd.plates) {
    // Riveted deck plates.
    const px = c.width / w * 6;
    for (let x = 0; x < c.width; x += px) for (let y = 0; y < c.height; y += px) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,230,190" : "0,0,0"},${0.03 + Math.random() * 0.05})`; g.fillRect(x + 2, y + 2, px - 4, px - 4);
      g.fillStyle = "rgba(20,14,8,0.5)"; for (const [dx, dy] of [[6, 6], [px - 6, 6], [6, px - 6], [px - 6, px - 6]]) { g.beginPath(); g.arc(x + dx, y + dy, 2.2, 0, 7); g.fill(); }
    }
  }
  // Blooms and smears.
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height, r = 20 + Math.random() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, Math.random() < 0.5 ? gd.blooms[0] : gd.blooms[1]); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Rail spurs across the table (a whole yard of them in the Rail Yard).
  for (let k = 0; k < gd.rails; k++) {
    const ry = c.height * (gd.rails === 1 ? 0.82 : 0.18 + (k / Math.max(1, gd.rails - 1)) * 0.64);
    const bend = (k % 2 ? 1 : -1) * 40;
    g.strokeStyle = "rgba(40,32,26,.55)"; g.lineWidth = 3;
    for (let x = 0; x < c.width; x += 14) { g.beginPath(); g.moveTo(x, ry - 16 + bend * Math.sin(x / c.width * 3)); g.lineTo(x, ry + 16 + bend * Math.sin(x / c.width * 3)); g.stroke(); }
    g.strokeStyle = "rgba(150,140,125,.6)"; g.lineWidth = 3;
    for (const off of [-9, 9]) { g.beginPath(); for (let x = 0; x <= c.width; x += 16) { const y = ry + off + bend * Math.sin(x / c.width * 3); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  }
  if (gd.stripes) {
    // Hazard-striped service lanes.
    for (const yy of [0.33, 0.67]) {
      const y0 = c.height * yy;
      for (let x = 0; x < c.width; x += 28) { g.fillStyle = (x / 28) % 2 ? "rgba(216,162,28,0.35)" : "rgba(10,10,10,0.35)"; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + 28, y0); g.lineTo(x + 14, y0 + 12); g.lineTo(x - 14, y0 + 12); g.fill(); }
    }
  }
  for (let i = 0; i < 9000; i++) {
    const v = Math.random() * 40;
    const [sr, sg, sb] = gd.speck;
    g.fillStyle = `rgba(${sr + v},${sg + v},${sb + v},${Math.random() * 0.25})`;
    const r = Math.random() * 6;
    g.beginPath(); g.arc(Math.random() * c.width, Math.random() * c.height, r, 0, 7); g.fill();
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(40,32,24,${0.15 + Math.random() * 0.2})`; g.lineWidth = 1 + Math.random() * 3;
    g.beginPath(); let x = Math.random() * c.width, y = Math.random() * c.height; g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  if (gd.cracks) {
    // Glowing seams in the ash: the ground is still hot underneath.
    g.strokeStyle = gd.cracks; g.shadowColor = gd.cracks; g.shadowBlur = 8;
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath(); let x = Math.random() * c.width, y = Math.random() * c.height; g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; g.lineTo(x, y); }
      g.stroke();
    }
    g.shadowBlur = 0;
  }
  // 6" grid, faint, it's a tabletop, after all.
  g.strokeStyle = "rgba(255,240,200,0.07)"; g.lineWidth = 1;
  const px = c.width / w;
  for (let x = 0; x <= w; x += 6) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, c.height); g.stroke(); }
  for (let y = 0; y <= h; y += 6) { g.beginPath(); g.moveTo(0, y * px); g.lineTo(c.width, y * px); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Facade texture plus a matching glow mask: only the lit panes glow, the wall
// and dark panes never do. `.glow` rides on the facade texture.
function windowTexture(lit = "#ffcf6b") {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const e = document.createElement("canvas"); e.width = e.height = 128;
  const g = c.getContext("2d"), ge = e.getContext("2d");
  g.fillStyle = "#6d6a63"; g.fillRect(0, 0, 128, 128);
  ge.fillStyle = "#000"; ge.fillRect(0, 0, 128, 128);
  for (let y = 10; y < 128; y += 30) for (let x = 8; x < 128; x += 24) {
    const on = Math.random() < 0.25;
    g.fillStyle = on ? lit : "#1d2026"; g.fillRect(x, y, 12, 16);
    if (on) { ge.fillStyle = "#fff"; ge.fillRect(x, y, 12, 16); }
  }
  g.fillStyle = "rgba(0,0,0,0.25)"; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 20, 3);
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; };
  const t = mk(c);
  t.glow = mk(e);
  return t;
}

// A blotchy oil stain: dark core, soft ragged edge, thin rainbow sheen.
function oilTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  for (let i = 0; i < 9; i++) {
    const x = 40 + Math.random() * 48, y = 40 + Math.random() * 48, r = 18 + Math.random() * 22;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(12,9,6,0.55)"); grd.addColorStop(0.7, "rgba(12,9,6,0.35)"); grd.addColorStop(1, "rgba(12,9,6,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const sheen = g.createLinearGradient(20, 20, 108, 108);
  ["rgba(120,60,160,0.18)", "rgba(40,140,150,0.18)", "rgba(180,150,40,0.18)", "rgba(160,60,60,0.15)"].forEach((col, i) => sheen.addColorStop(i / 3, col));
  g.globalCompositeOperation = "source-atop"; g.fillStyle = sheen; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The sky's gradient texture: zenith, upper, glow, horizon, haze, ground.
function skyTexture(stops) {
  const c = document.createElement("canvas"); c.width = 16; c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  [0, 0.45, 0.62, 0.7, 0.78, 1].forEach((at, i) => grd.addColorStop(at, stops[i]));
  g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A big inverted sphere painted with a smoggy dusk gradient.
function skyDome() {
  const tex = skyTexture(["#0c0a08", "#2b1c10", "#6e4220", "#a8662a", "#3a2614", "#140e09"]);
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.position.set(27, -40, 18);
  return m;
}

export class World {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Smog-choked dieselpunk dusk: an amber horizon fading to soot overhead,
    // and warm sepia fog that swallows the distance.
    this.scene.background = new THREE.Color(0x1a130c);
    this.scene.fog = new THREE.Fog(0x2a1d10, 70, 160);
    this.sky = skyDome(); this.scene.add(this.sky);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.fx = new FX(this.scene, this.camera);

    // High contrast: a weak fill keeps the shade dark, a hard bright key makes
    // the lit faces pop. Raise the fill and the whole table goes muddy again.
    const hemi = new THREE.HemisphereLight(0xd8b88a, 0x140d06, 0.5); this.scene.add(hemi); this.hemi = hemi;
    this.sun = new THREE.DirectionalLight(0xffe0b0, 8);
    this.sun.position.set(-30, 60, -20); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.far = 200;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun); this.scene.add(this.sun.target);

    this.tableGroup = new THREE.Group(); this.scene.add(this.tableGroup);
    this.overlay = new THREE.Group(); this.scene.add(this.overlay);
    // Its own layer so the threat map survives clearOverlay() between modes.
    this.threat = new THREE.Group(); this.scene.add(this.threat);
    this.objectiveMeshes = [];

    // Camera rig state.
    this.cam = { target: new THREE.Vector3(27, 0, 18), yaw: -90 * DEG, pitch: 55 * DEG, dist: 55, goal: null };
    this.keys = new Set();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.pointerWorld = null;
    this.edgePan = true;
    this.listeners = { click: [], move: [], rclick: [], longpress: [] };
    this.bindInput();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.clock = new THREE.Clock();
    this.tickers = new Set();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  on(ev, fn) { this.listeners[ev].push(fn); return () => { this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn); }; }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  bindInput() {
    const el = this.renderer.domElement;
    let drag = null;
    // Touch: every active pointer, so two fingers pinch-zoom / twist / pan.
    const touches = new Map();
    let pinch = null, longPress = null;
    const cancelLong = () => { clearTimeout(longPress); longPress = null; };
    el.style.touchAction = "none";
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          // Second finger: a camera gesture, not a click or a placement drag.
          cancelLong();
          if (drag?.captured) this.onDragCancel?.();
          drag = null;
          const [a, b] = [...touches.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
          return;
        }
      }
      if (touches.size > 1) return;
      this.updateMouse(e);
      drag = { x: e.clientX, y: e.clientY, button: e.button, moved: 0, touch: e.pointerType === "touch" };
      const hit = this.pick();
      // A screen (live battle) can claim a left-press as a drag of its own:
      // press on the spot, drag to set facing, release to confirm.
      if (e.button === 0 && this.onDragStart?.(hit, e)) drag.captured = true;
      // Long-press (touch or mouse, held still) inspects what's under it. Not
      // while the press is placing a move: holding still there is just aiming.
      cancelLong();
      if (e.button === 0 && !drag.captured) longPress = setTimeout(() => {
        longPress = null;
        if (!drag || drag.moved > 8 || touches.size > 1) return;
        drag.long = true;
        this.listeners.longpress.forEach((f) => f(hit, e));
      }, 550);
    });
    const release = (e) => {
      if (e.pointerType === "touch") {
        touches.delete(e.pointerId);
        if (touches.size < 2) pinch = null;
        if (touches.size) return;
      }
      cancelLong();
      if (drag?.captured) {
        this.updateMouse(e);
        this.onDragEnd?.(this.pick(), drag.moved, e);
      } else if (drag && !drag.long && drag.moved < (drag.touch ? 12 : 6) && e.target === el) {
        this.updateMouse(e);
        const hit = this.pick();
        this.pointerWorld = hit.point;
        (drag.button === 2 ? this.listeners.rclick : this.listeners.click).forEach((f) => f(hit, e));
      }
      drag = null;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" && touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.cam.dist = Math.max(12, Math.min(110, this.cam.dist * (pinch.d / Math.max(1, d))));
        this.cam.yaw += ang - pinch.ang;
        this.panBy(-(mid.x - pinch.mid.x) * this.cam.dist * 0.0018, -(mid.y - pinch.mid.y) * this.cam.dist * 0.0018);
        pinch = { d, ang, mid };
        return;
      }
      this.updateMouse(e);
      this.lastPointer = e.pointerType === "touch" ? null : { x: e.clientX, y: e.clientY };
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.moved > 8) cancelLong();
        if (drag.captured) {
          const hit = this.pick();
          this.pointerWorld = hit.point;
          this.onDrag?.(hit, drag.moved, e);
          return;
        }
        if (drag.button === 2 || (drag.button === 0 && e.altKey)) {
          this.cam.yaw += dx * 0.006; this.cam.pitch = Math.max(20 * DEG, Math.min(85 * DEG, this.cam.pitch + dy * 0.004));
        } else if (drag.button === 1 || (drag.button === 0 && drag.moved > 6)) {
          this.panBy(-dx * this.cam.dist * 0.0018, -dy * this.cam.dist * 0.0018);
        }
      }
      const hit = this.pick();
      this.pointerWorld = hit.point;
      this.listeners.move.forEach((f) => f(hit, e));
    });
    el.addEventListener("pointerleave", () => { this.lastPointer = null; });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.shiftKey && this.onShiftWheel?.(e.deltaY || e.deltaX)) return;
      this.cam.dist = Math.max(12, Math.min(110, this.cam.dist * (1 + Math.sign(e.deltaY) * 0.1)));
    }, { passive: false });
    window.addEventListener("keydown", (e) => { if (!e.target.closest?.("input,textarea,select")) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  panBy(right, fwd) {
    const f = new THREE.Vector3(Math.cos(this.cam.yaw), 0, Math.sin(this.cam.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    this.cam.target.addScaledVector(r, right).addScaledVector(f, -fwd);
    if (this.field) {
      this.cam.target.x = Math.max(-10, Math.min(this.field.width + 10, this.cam.target.x));
      this.cam.target.z = Math.max(-10, Math.min(this.field.height + 10, this.cam.target.z));
    }
    this.cam.goal = null;
    this.moved = true;
  }

  focus(x, y, dist) { this.cam.goal = { target: new THREE.Vector3(x, 0, y), dist: dist ?? this.cam.dist }; }

  updateMouse(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  // → { mechId?, point (on the table plane, world), field {x,y} }
  pick() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    let mechId = null;
    if (this.mechRoots?.length) {
      const hits = this.raycaster.intersectObjects(this.mechRoots, true);
      for (const h of hits) {
        let o = h.object; while (o && o.userData.mechId == null) o = o.parent;
        if (o) { mechId = o.userData.mechId; break; }
      }
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(plane, point);
    return { mechId, point: ok ? point : null, field: ok ? { x: point.x, y: point.z } : null };
  }

  // ---- Battlefield ----
  // Sky, fog, light colours and searchlights for a theme (themes.js).
  applyTheme(theme, w, h) {
    this.theme = theme;
    this.scene.background = new THREE.Color(theme.bg);
    this.scene.fog.color.setHex(theme.fog.color); this.scene.fog.near = theme.fog.near; this.scene.fog.far = theme.fog.far;
    this.hemi.color.setHex(theme.hemi.sky); this.hemi.groundColor.setHex(theme.hemi.ground); this.hemi.intensity = theme.hemi.i;
    this.sun.color.setHex(theme.sun.color); this.sun.intensity = theme.sun.i;
    this.sky.material.map?.dispose(); this.sky.material.map = skyTexture(theme.sky); this.sky.material.needsUpdate = true;
    this.sky.position.set(w / 2, -40, h / 2);
  }

  buildField(field, objectives = []) {
    this.tableGroup.clear();
    this.missionGroup = null; this.missionAnim = null; this.pickups = []; this.lastMult = 1;
    this.chimneys = [];
    this.animators = [];
    this.field = field;
    const { width: w, height: h } = field;
    const theme = themeFor(field, settings.get("theme"));
    this.applyTheme(theme, w, h);
    // Dressing context: props register idle animators through it.
    const rand = dressRandom(layoutHash(field));
    const ctx = {
      theme, fx: this.fx, rand,
      win: windowTexture(`#${new THREE.Color(theme.lamp).getHexString()}`),
      anim: (fn) => this.animators.push(fn),
      chimney: (obj, opts = {}) => this.chimneys.push(Object.assign(obj, { big: !!opts.big })),
    };
    // Surrounding ground + table edge.
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: theme.outer, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(w / 2, -0.8, h / 2); outer.receiveShadow = true; this.tableGroup.add(outer);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 0.8, h + 2), new THREE.MeshStandardMaterial({ color: 0x2e2116, roughness: 0.7 }));
    rim.position.set(w / 2, -0.41, h / 2); rim.receiveShadow = true; this.tableGroup.add(rim);
    // Brass trim + rivets around the table edge, it's a war-room table.
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 });
    for (const [x, z, sx, sz] of [[w / 2, -1, w + 2.2, 0.25], [w / 2, h + 1, w + 2.2, 0.25], [-1, h / 2, 0.25, h + 2.2], [w + 1, h / 2, 0.25, h + 2.2]]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), brass); trim.position.set(x, 0.02, z); this.tableGroup.add(trim);
    }
    for (let i = 0; i <= 12; i++) for (const z of [-1, h + 1]) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), brass); r.position.set(-1 + (i / 12) * (w + 2), 0.13, z); this.tableGroup.add(r);
    }
    // Oil slicks: irregular, semi-transparent stains with a rainbow sheen, so
    // they read as spilled oil, not as holes or mini bases.
    const oilTex = oilTexture();
    const oil = new THREE.MeshStandardMaterial({ map: oilTex, transparent: true, roughness: 0.08, metalness: 0.3, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3 + (i % 3), 2 + (i % 2)), oil);
      m.rotation.x = -Math.PI / 2; m.rotation.z = i * 1.3;
      m.position.set(((i * 53) % 100) / 100 * w, 0.015, ((i * 71) % 100) / 100 * h); this.tableGroup.add(m);
    }
    this.buildSearchlights(w, h);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: groundTexture(w, h, theme.ground), roughness: 0.95 }));
    table.rotation.x = -Math.PI / 2; table.position.set(w / 2, 0, h / 2); table.receiveShadow = true; this.tableGroup.add(table);
    this.cam.target.set(w / 2, 0, h / 2);
    this.sun.target.position.set(w / 2, 0, h / 2);

    for (const t of field.terrain || []) this.tableGroup.add(this.terrainMesh(t, ctx));
    // Set-pieces beyond the table edge.
    // Beyond the camera's reach (it zooms out to 110"), so nothing ever blocks the table.
    const centre = new THREE.Vector3(w / 2, 0, h / 2), R = Math.max(125, Math.hypot(w, h) / 2 + 90);
    theme.backdrop.forEach((kind, i) => this.tableGroup.add(backdrop(kind, i, centre, R, ctx)));

    // Deployment zones, tinted quarter-discs in each deployment corner.
    if (field.deployCorners) {
      field.deployCorners.forEach((c, i) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(field.deployRadius || 8, 40), new THREE.MeshBasicMaterial({ color: i ? 0xe0533d : 0x5fd3c0, transparent: true, opacity: 0.07, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.02, c.y); this.tableGroup.add(m);
      });
    }
    this.buildObjectives(objectives);
  }

  terrainMesh(t, ctx) {
    const g = new THREE.Group();
    const rot = -(t.rot || 0) * DEG;
    const shadow = (m) => { m.castShadow = m.receiveShadow = true; return m; };
    if (t.shape === "rect") {
      const prop = t.kind === "building" ? buildingProp(t, ctx) : t.kind === "barricade" ? barricadeProp(t, ctx) : t.kind === "crate" ? crateProp(t, ctx) : rubbleProp(t, ctx);
      g.add(prop);
      g.position.set(t.x, 0, t.y); g.rotation.y = rot;
    } else if (t.shape === "ellipse") {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 1 }));
      m.scale.set(t.rx, t.ry, 1); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; g.add(m);
      g.position.set(t.x, 0, t.y); g.rotation.y = rot;
    } else if (t.shape === "poly") {
      const s = new THREE.Shape(t.points.map(([x, y]) => new THREE.Vector2(x, -y)));
      const geo = new THREE.ExtrudeGeometry(s, { depth: t.kind === "wood" ? 0.3 : 1.5, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const m = shadow(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: t.kind === "wood" ? 0x2f4a24 : 0x6f6a62, roughness: 1, flatShading: true })));
      g.add(m); g.position.set(t.x, 0, t.y);
    }
    return g;
  }

  buildObjectives(objectives) {
    for (const o of this.objectiveMeshes) this.tableGroup.remove(o.group);
    this.objectiveMeshes = [];
    objectives.forEach((o) => {
      const group = new THREE.Group(); group.position.set(o.x, 0, o.y);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd35a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.0, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; group.add(ring);
      const kind = o.crate ? "crate" : o.relay ? "relay" : "beacon";
      const built = kind === "crate" ? this.crateProp(group) : kind === "relay" ? this.relayMast(group) : this.beaconPylon(group, o);
      this.tableGroup.add(group);
      this.objectiveMeshes.push({ group, ringMat, kind, o, ...built });
    });
  }

  beaconPylon(group, o) {
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd35a, emissiveIntensity: 1.2, metalness: 0.6 });
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 1.6 + o.vp * 0.6, 6), pylonMat); pylon.position.y = (1.6 + o.vp * 0.6) / 2; pylon.castShadow = true; group.add(pylon);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), pylonMat); gem.position.y = 2.2 + o.vp * 0.6; group.add(gem);
    const light = new THREE.PointLight(0xffd35a, 6, 8); light.position.y = 2; group.add(light);
    return { pylonMat, gem, light };
  }

  // Salvage crate: a banded cargo crate with a glowing brass lamp strap and a
  // small pickup marker bobbing over it (not a beacon pylon: it can't be held).
  crateProp(group) {
    const body = new THREE.Group(); group.add(body);
    const wood = new THREE.MeshStandardMaterial({ color: 0xb07a40, roughness: 0.8 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.7, roughness: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.95), wood); box.position.y = 0.45; box.castShadow = box.receiveShadow = true; body.add(box);
    for (const x of [-0.5, 0.5]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.94, 0.99), iron); b.position.set(x, 0.45, 0); body.add(b); }
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.1, 1.01), iron); lid.position.y = 0.92; body.add(lid);
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x2a2010, emissive: 0xffd35a, emissiveIntensity: 1.4, metalness: 0.5 });
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.12, 0.2), pylonMat); strap.position.y = 0.62; body.add(strap);
    body.rotation.y = Math.random() * Math.PI;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), pylonMat); gem.position.y = 1.9; gem.scale.set(1, 1.4, 1); group.add(gem);
    const light = new THREE.PointLight(0xffd35a, 4, 6); light.position.y = 1.6; group.add(light);
    return { pylonMat, gem, light, body };
  }

  // Last Stand relay: a lattice radio mast with a turning dish and a blinking
  // cyan lamp, the thing the attackers come for.
  relayMast(group) {
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4640, metalness: 0.8, roughness: 0.35 });
    const H = 4.6;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, H, 5), steel);
      leg.position.set(Math.cos(a) * 0.35, H / 2, Math.sin(a) * 0.35); leg.rotation.z = Math.cos(a) * 0.07; leg.rotation.x = -Math.sin(a) * 0.07; leg.castShadow = true; group.add(leg);
    }
    for (let y = 0.6; y < H; y += 0.8) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.4 - y * 0.03, 0.035, 4, 12), steel); r.rotation.x = Math.PI / 2; r.position.y = y; group.add(r); }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x2a2622, metalness: 0.6 })); base.position.y = 0.15; base.receiveShadow = base.castShadow = true; group.add(base);
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x103030, emissive: 0x5fd3c0, emissiveIntensity: 1.6, metalness: 0.4 });
    const dish = new THREE.Group(); dish.position.y = H * 0.72; group.add(dish);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }));
    bowl.rotation.z = Math.PI / 2; bowl.position.x = 0.35; dish.add(bowl);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), steel); horn.rotation.z = Math.PI / 2; horn.position.x = 0.1; dish.add(horn);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), pylonMat); gem.position.y = H + 0.2; group.add(gem);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24), pylonMat); halo.rotation.x = Math.PI / 2; halo.position.y = H + 0.2; group.add(halo);
    const light = new THREE.PointLight(0x5fd3c0, 7, 10); light.position.y = H; group.add(light);
    return { pylonMat, gem, light, dish, halo };
  }

  // Objectives changed under us (a crate claimed off-screen, a skip): rebuild
  // when the set differs from what's on the table.
  syncObjectives(objectives = []) {
    const sig = (list) => list.map((o) => `${o.x},${o.y},${o.crate ? "c" : o.relay ? "r" : "b"}`).join("|");
    if (sig(this.objectiveMeshes.map((m) => m.o)) === sig(objectives)) return false;
    this.buildObjectives(objectives);
    if (this.lastMult) this.setBeaconMultiplier(this.lastMult);
    return true;
  }

  // Salvage: the crate at (x, y) is hauled away: it hops, spins and shrinks
  // out; the table forgets it (the caller adds the burst + "+2 VP").
  claimCrate(x, y) {
    const i = this.objectiveMeshes.findIndex((m) => m.kind === "crate" && Math.hypot(m.o.x - x, m.o.y - y) < 0.05);
    if (i < 0) return false;
    const [m] = this.objectiveMeshes.splice(i, 1);
    (this.pickups ||= []).push({ m, t: 0 });
    return true;
  }

  // Campaign table dressing: the Breakthrough exit zone (a glowing quarter-disc
  // around the enemy corner, chevrons flowing into it, a flare at the corner).
  // `mission` = publicState's state.campaign, or null to clear.
  setMission(mission) {
    if (this.missionGroup) { this.tableGroup.remove(this.missionGroup); this.missionGroup = null; this.missionAnim = null; }
    const ex = mission?.exit;
    if (!ex || !this.field) return;
    const { width: w, height: h } = this.field;
    const g = new THREE.Group(); g.position.set(ex.x, 0, ex.y);
    const COL = 0x4fffc8;
    // Into the table: the corner's own quadrant (engine angles, world XZ).
    const mid = Math.atan2(ex.y < h / 2 ? 1 : -1, ex.x < w / 2 ? 1 : -1);
    const from = mid - Math.PI / 4;
    const flat = (m, y) => { m.rotation.x = Math.PI / 2; m.position.y = y; return m; };
    const tex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const x = c.getContext("2d"), grd = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, "rgba(79,255,200,.55)"); grd.addColorStop(0.7, "rgba(79,255,200,.16)"); grd.addColorStop(0.97, "rgba(79,255,200,.34)"); grd.addColorStop(1, "rgba(79,255,200,0)");
      x.fillStyle = grd; x.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const fillMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    g.add(flat(new THREE.Mesh(new THREE.CircleGeometry(ex.r, 48, from, Math.PI / 2), fillMat), 0.03));
    const edgeMat = new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    g.add(flat(new THREE.Mesh(new THREE.RingGeometry(ex.r - 0.18, ex.r + 0.06, 64, 1, from, Math.PI / 2), edgeMat), 0.05));
    // A sweeping wave: a ring that shrinks from the rim into the corner.
    const waveMat = new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const wave = flat(new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48, 1, from, Math.PI / 2), waveMat), 0.045); g.add(wave);
    // Chevrons flowing toward the corner along three lanes.
    const chev = new THREE.Shape([[-0.5, -0.55], [0.1, 0], [-0.5, 0.55], [-0.25, 0.55], [0.35, 0], [-0.25, -0.55]].map(([a, b]) => new THREE.Vector2(a, b)));
    const chevGeo = new THREE.ShapeGeometry(chev);
    const chevrons = [];
    for (const lane of [-0.42, 0, 0.42]) {
      const a = mid + lane;
      for (let k = 0; k < 3; k++) {
        const d = ex.r * (0.35 + k * 0.22);
        const mat = new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        const m = new THREE.Mesh(chevGeo, mat);
        m.rotation.x = Math.PI / 2; m.rotation.z = a + Math.PI; // point back at the corner
        m.position.set(Math.cos(a) * d, 0.06, Math.sin(a) * d); m.scale.setScalar(0.9);
        g.add(m); chevrons.push({ m, k });
      }
    }
    // Evac flare: a beacon pole in the corner with a light column.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3, 6), new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.7 }));
    const inset = 0.9;
    pole.position.set(Math.cos(mid) * inset, 1.5, Math.sin(mid) * inset); g.add(pole);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x103028, emissive: COL, emissiveIntensity: 2 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), lampMat); lamp.position.set(pole.position.x, 3.1, pole.position.z); g.add(lamp);
    const beamMat = new THREE.MeshBasicMaterial({ color: COL, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 14, 16, 1, true), beamMat); beam.position.set(pole.position.x, 7, pole.position.z); g.add(beam);
    const light = new THREE.PointLight(COL, 10, ex.r * 1.4); light.position.set(Math.cos(mid) * ex.r * 0.35, 2.5, Math.sin(mid) * ex.r * 0.35); g.add(light);
    this.tableGroup.add(g);
    this.missionGroup = g;
    this.missionAnim = (dt, t) => {
      const k = (t * 0.45) % 1;
      wave.scale.setScalar(Math.max(0.02, (1 - k) * ex.r)); waveMat.opacity = 0.55 * Math.sin(Math.PI * k);
      edgeMat.opacity = 0.65 + 0.3 * Math.sin(t * 3);
      for (const c of chevrons) c.m.material.opacity = 0.18 + 0.7 * Math.max(0, Math.sin(t * 4 + c.k * 1.4));
      lampMat.emissiveIntensity = 1.2 + 1.4 * Math.max(0, Math.sin(t * 5));
      beamMat.opacity = 0.08 + 0.06 * Math.sin(t * 2);
      light.intensity = 8 + 4 * Math.sin(t * 3);
    };
  }

  // Two searchlights on gantries at the empty corners, sweeping the table.
  buildSearchlights(w, h) {
    for (const s of this.searchlights || []) { this.scene.remove(s); this.scene.remove(s.target); }
    this.searchlights = [];
    for (const [x, z] of [[-4, -4], [w + 4, h + 4]]) {
      const sl = new THREE.SpotLight(this.theme?.search ?? 0xfff0c8, 60, 90, 0.16, 0.5, 1.2);
      sl.position.set(x, 26, z);
      this.scene.add(sl); this.scene.add(sl.target);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 26, 8), new THREE.MeshStandardMaterial({ color: 0x2a241c, metalness: 0.7 }));
      pole.position.set(x, 13, z); this.tableGroup.add(pole);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0xc9a14a, emissive: 0xfff0c8, emissiveIntensity: 0.6, metalness: 0.8 }));
      lamp.position.set(x, 26, z); this.tableGroup.add(lamp);
      this.searchlights.push(sl);
    }
  }

  // Tint each objective by who controls it: "a" | "b" | "contested" | null.
  setObjectiveControl(list) {
    const col = { a: 0x5fd3c0, b: 0xe0533d, contested: 0xffffff };
    this.objectiveMeshes.forEach((m, i) => {
      const c = col[list[i]] ?? (m.kind === "relay" ? 0x5fd3c0 : 0xffd35a);
      m.ringMat.color.setHex(c); m.pylonMat.emissive.setHex(c); m.light.color.setHex(c);
    });
  }

  // Escalation: beacons grow and burn brighter as they pay more (×1/×2/×3).
  setBeaconMultiplier(mult = 1) {
    this.lastMult = mult;
    for (const m of this.objectiveMeshes) { if (m.kind !== "beacon") continue; m.mult = mult; m.gem.scale.setScalar(1 + (mult - 1) * 0.35); m.light.intensity = 6 + (mult - 1) * 5; }
  }

  // Round-end payout: the beacon flares in the scorer's colour.
  pulseObjective(i, color = 0xffd35a) {
    const m = this.objectiveMeshes[i];
    if (m) m.pulse = { t: 0, color };
  }

  // Enemy fire coverage painted on the table: each enemy's front arc out to its
  // gun's range, plus its melee reach. `zones`: [{ x, y, facing, range, reach }].
  setThreat(zones) {
    this.threat.clear();
    for (const z of zones || []) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(z.range, 48, (z.facing - 45) * DEG, 90 * DEG), new THREE.MeshBasicMaterial({ color: 0xe0533d, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
      w.rotation.x = Math.PI / 2; w.position.set(z.x, 0.035, z.y); this.threat.add(w);
      const r = new THREE.Mesh(new THREE.CircleGeometry(z.reach, 40), new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.12, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.position.set(z.x, 0.036, z.y); this.threat.add(r);
    }
  }

  // ---- Overlays ----
  // The air itself: soot flakes, rising embers, low steam or drifting dust over
  // the table, per theme.
  ambient(dt) {
    const f = this.field, kind = this.theme?.ambient;
    if (!f || !kind || Math.random() > dt * 7) return;
    const V3 = THREE.Vector3;
    const x = Math.random() * f.width, z = Math.random() * f.height;
    if (kind === "soot") this.fx.particle(new V3(x, 9 + Math.random() * 4, z), { color: 0x2a2420, size: 0.18, life: 6, additive: false, opacity: 0.8, vel: new V3(0.6, -1.4, 0.2) });
    else if (kind === "embers") this.fx.particle(new V3(x, 0.3, z), { color: Math.random() < 0.5 ? 0xff7a2a : 0xffb050, size: 0.16, life: 3.5, vel: new V3((Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6) });
    else if (kind === "steam") this.fx.particle(new V3(x, 0.4, z), { color: 0xdedad2, size: 1.6, life: 4, grow: 2.5, additive: false, opacity: 0.12, vel: new V3(0.5, 0.25, 0.1) });
    else if (kind === "dust") this.fx.particle(new V3(x, 1 + Math.random() * 5, z), { color: 0xd8c29a, size: 0.14, life: 5, opacity: 0.7, vel: new V3(1.6, 0.1, 0.4) });
  }

  clearOverlay() { this.overlay.clear(); }
  ring(x, y, r, color = 0x5fd3c0, opacity = 0.5) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.08, r + 0.08, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, y); this.overlay.add(m); return m;
  }
  disc(x, y, r, color, opacity = 0.12) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, y); this.overlay.add(m); return m;
  }
  // A wedge (front arc), angles in engine degrees.
  wedge(x, y, r, fromDeg, toDeg, color, opacity = 0.12) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48, fromDeg * DEG, (toDeg - fromDeg) * DEG), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; m.position.set(x, 0.05, y); this.overlay.add(m); return m;
  }
  path(points, color = 0x33ff99) {
    const pts = points.map((p) => new THREE.Vector3(p.x, 0.15, p.y));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.3 }));
    line.computeLineDistances(); this.overlay.add(line); return line;
  }
  // A dashed ballistic arc from a to b (table points {x,y}) peaking at `height`:
  // the flight line of a jump-jet hop.
  arcPath(a, b, height = 3, color = 0xffd27a) {
    const pts = Array.from({ length: 25 }, (_, i) => { const t = i / 24; return new THREE.Vector3(a.x + (b.x - a.x) * t, 0.15 + Math.sin(Math.PI * t) * height, a.y + (b.y - a.y) * t); });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.3 }));
    line.computeLineDistances(); this.overlay.add(line); return line;
  }
  line(a, b, color = 0xff5544) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
    this.overlay.add(l); return l;
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    // Camera: keys + edge pan.
    const sp = this.cam.dist * 0.9 * dt;
    const k = this.keys;
    if (k.has("w") || k.has("arrowup")) this.panBy(0, -sp);
    if (k.has("s") || k.has("arrowdown")) this.panBy(0, sp);
    if (k.has("a") || k.has("arrowleft")) this.panBy(-sp, 0);
    if (k.has("d") || k.has("arrowright")) this.panBy(sp, 0);
    if (k.has("q")) this.cam.yaw -= dt * 1.5;
    if (k.has("e")) this.cam.yaw += dt * 1.5;
    if (this.edgePan && settings.get("edgePan") && this.lastPointer) {
      const m = 14, W = window.innerWidth, H = window.innerHeight, p = this.lastPointer;
      if (p.x < m) this.panBy(-sp, 0); else if (p.x > W - m) this.panBy(sp, 0);
      if (p.y < m) this.panBy(0, -sp); else if (p.y > H - m) this.panBy(0, sp);
    }
    if (this.cam.goal) {
      this.cam.target.lerp(this.cam.goal.target, Math.min(1, dt * 3));
      this.cam.dist += (this.cam.goal.dist - this.cam.dist) * Math.min(1, dt * 3);
      if (this.cam.target.distanceTo(this.cam.goal.target) < 0.05) this.cam.goal = null;
    }
    const c = this.cam;
    const off = new THREE.Vector3(-Math.cos(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.sin(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist);
    this.camera.position.copy(c.target).add(off);
    if (this.fx.shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.fx.shake * 0.6));
    this.camera.lookAt(c.target);
    const now = this.clock.elapsedTime;
    this.objectiveMeshes.forEach((m, i) => {
      m.gem.rotation.y += dt; m.gem.position.y += Math.sin(now * 2 + i) * 0.004;
      if (m.dish) { m.dish.rotation.y += dt * 0.8; m.halo.scale.setScalar(1 + 0.25 * Math.sin(now * 4)); m.pylonMat.emissiveIntensity = 1.1 + 0.9 * Math.max(0, Math.sin(now * 5)); }
      if (m.body) m.pylonMat.emissiveIntensity = 1.1 + 0.6 * Math.sin(now * 3 + i);
      if (m.pulse) {
        const p = m.pulse; p.t += dt;
        const k = Math.max(0, 1 - p.t / 1.6);
        m.gem.scale.setScalar(1 + ((m.mult || 1) - 1) * 0.35 + k * 1.6);
        m.light.intensity = 6 + k * 60;
        if (p.t < 0.05) { m.light.color.setHex(p.color); m.pylonMat.emissive.setHex(p.color); }
        if (p.t < 1 && Math.random() < dt * 30) this.fx.particle(m.gem.getWorldPosition(new THREE.Vector3()), { color: p.color, size: 0.7, life: 0.9, grow: 2, vel: new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4) });
        if (k <= 0) { m.pulse = null; m.gem.scale.setScalar(1 + ((m.mult || 1) - 1) * 0.35); m.light.intensity = 6 + ((m.mult || 1) - 1) * 5; }
      }
    });
    this.missionAnim?.(dt, now);
    // Claimed crates: a hop, a spin, gone.
    this.pickups = (this.pickups || []).filter((p) => {
      p.t += dt;
      const k = Math.min(1, p.t / 0.7);
      p.m.group.position.y = Math.sin(Math.PI * Math.min(1, k * 1.2)) * 1.6 + k * 1.2;
      p.m.group.rotation.y += dt * 12;
      p.m.group.scale.setScalar(Math.max(0.01, 1 - k * k));
      p.m.light.intensity = 4 + (1 - k) * 30;
      if (k >= 1) { this.tableGroup.remove(p.m.group); return false; }
      return true;
    });
    // Chimney smoke and sweeping searchlights.
    for (const c of this.chimneys || []) {
      if (Math.random() < dt * (c.big ? 3 : 5)) {
        const p = c.getWorldPosition(new THREE.Vector3());
        const k = c.big ? 3 : 1;
        this.fx.particle(p, { color: 0x3a3028, size: 1.2 * k, life: 4 * (c.big ? 1.6 : 1), grow: 4, additive: false, opacity: 0.45, vel: new THREE.Vector3((0.6 + Math.random() * 0.4) * k, (1.4 + Math.random()) * k * 0.8, 0.2) });
      }
    }
    for (const a of this.animators || []) a(dt, now);
    this.ambient(dt);
    const t = this.clock.elapsedTime;
    (this.searchlights || []).forEach((sl, i) => {
      const a = t * 0.25 + i * 2.3;
      sl.target.position.set(this.field.width / 2 + Math.cos(a) * this.field.width * 0.4, 0, this.field.height / 2 + Math.sin(a * 1.3) * this.field.height * 0.4);
    });
    this.fx.update(dt);
    for (const t of this.tickers) t(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
