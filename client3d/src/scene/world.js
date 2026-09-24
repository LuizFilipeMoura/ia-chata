// The table. Renderer + RTS camera (WASD/edge pan, Q/E or right-drag orbit,
// wheel zoom), lighting with shadows, the battlefield dressed from the room's
// field/terrain, objective pylons, deployment zones, picking, and overlay
// helpers (range rings, path previews, ghosts). Field inches map 1:1 to world
// units: field (x, y) → world (x, 0, y).
import * as THREE from "three";
import { FX } from "./fx.js";
import { settings } from "../settings.js";

const DEG = Math.PI / 180;

function groundTexture(w, h) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = Math.round(1024 * h / w);
  const g = c.getContext("2d");
  g.fillStyle = "#4a3c2b"; g.fillRect(0, 0, c.width, c.height);
  // Rust blooms and soot smears.
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * c.width, y = Math.random() * c.height, r = 20 + Math.random() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, Math.random() < 0.5 ? "rgba(120,60,25,0.22)" : "rgba(10,8,6,0.25)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // A disused rail spur across the table.
  g.strokeStyle = "rgba(60,50,40,.7)"; g.lineWidth = 5;
  const ry = c.height * 0.82;
  for (const off of [-9, 9]) { g.beginPath(); g.moveTo(0, ry + off); g.bezierCurveTo(c.width * 0.3, ry + off - 60, c.width * 0.6, ry + off + 40, c.width, ry + off - 30); g.stroke(); }
  for (let i = 0; i < 9000; i++) {
    const v = 70 + Math.random() * 40;
    g.fillStyle = `rgba(${v + 20},${v + 8},${v - 10},${Math.random() * 0.25})`;
    const r = Math.random() * 6;
    g.beginPath(); g.arc(Math.random() * c.width, Math.random() * c.height, r, 0, 7); g.fill();
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(40,32,24,${0.15 + Math.random() * 0.2})`; g.lineWidth = 1 + Math.random() * 3;
    g.beginPath(); let x = Math.random() * c.width, y = Math.random() * c.height; g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  // 6" grid, faint — it's a tabletop, after all.
  g.strokeStyle = "rgba(255,240,200,0.07)"; g.lineWidth = 1;
  const px = c.width / w;
  for (let x = 0; x <= w; x += 6) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, c.height); g.stroke(); }
  for (let y = 0; y <= h; y += 6) { g.beginPath(); g.moveTo(0, y * px); g.lineTo(c.width, y * px); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function windowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#6d6a63"; g.fillRect(0, 0, 128, 128);
  for (let y = 10; y < 128; y += 30) for (let x = 8; x < 128; x += 24) {
    g.fillStyle = Math.random() < 0.25 ? "#ffcf6b" : "#1d2026"; g.fillRect(x, y, 12, 16);
  }
  g.fillStyle = "rgba(0,0,0,0.25)"; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 20, 3);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A big inverted sphere painted with a smoggy dusk gradient.
function skyDome() {
  const c = document.createElement("canvas"); c.width = 16; c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#0c0a08"); grd.addColorStop(0.45, "#2b1c10"); grd.addColorStop(0.62, "#6e4220"); grd.addColorStop(0.7, "#a8662a"); grd.addColorStop(0.78, "#3a2614"); grd.addColorStop(1, "#140e09");
  g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
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
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Smog-choked dieselpunk dusk: an amber horizon fading to soot overhead,
    // and warm sepia fog that swallows the distance.
    this.scene.background = new THREE.Color(0x1a130c);
    this.scene.fog = new THREE.Fog(0x2a1d10, 70, 160);
    this.scene.add(skyDome());
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.fx = new FX(this.scene, this.camera);

    const hemi = new THREE.HemisphereLight(0xd8b88a, 0x2a1c10, 0.85); this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffc27a, 2.6);
    this.sun.position.set(-30, 60, -20); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.far = 200;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun); this.scene.add(this.sun.target);

    this.tableGroup = new THREE.Group(); this.scene.add(this.tableGroup);
    this.overlay = new THREE.Group(); this.scene.add(this.overlay);
    this.objectiveMeshes = [];

    // Camera rig state.
    this.cam = { target: new THREE.Vector3(27, 0, 18), yaw: -90 * DEG, pitch: 55 * DEG, dist: 55, goal: null };
    this.keys = new Set();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.pointerWorld = null;
    this.edgePan = true;
    this.listeners = { click: [], move: [], rclick: [] };
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
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, button: e.button, moved: 0 };
    });
    window.addEventListener("pointerup", (e) => {
      if (drag && drag.moved < 6 && e.target === el) {
        this.updateMouse(e);
        const hit = this.pick();
        (drag.button === 2 ? this.listeners.rclick : this.listeners.click).forEach((f) => f(hit, e));
      }
      drag = null;
    });
    el.addEventListener("pointermove", (e) => {
      this.updateMouse(e);
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX; drag.y = e.clientY;
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
  buildField(field, objectives = []) {
    this.tableGroup.clear();
    this.chimneys = [];
    this.field = field;
    const { width: w, height: h } = field;
    // Surrounding ground + table edge.
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(w / 2, -0.8, h / 2); outer.receiveShadow = true; this.tableGroup.add(outer);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 0.8, h + 2), new THREE.MeshStandardMaterial({ color: 0x2e2116, roughness: 0.7 }));
    rim.position.set(w / 2, -0.41, h / 2); rim.receiveShadow = true; this.tableGroup.add(rim);
    // Brass trim + rivets around the table edge — it's a war-room table.
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 });
    for (const [x, z, sx, sz] of [[w / 2, -1, w + 2.2, 0.25], [w / 2, h + 1, w + 2.2, 0.25], [-1, h / 2, 0.25, h + 2.2], [w + 1, h / 2, 0.25, h + 2.2]]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.18, sz), brass); trim.position.set(x, 0.02, z); this.tableGroup.add(trim);
    }
    for (let i = 0; i <= 12; i++) for (const z of [-1, h + 1]) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), brass); r.position.set(-1 + (i / 12) * (w + 2), 0.13, z); this.tableGroup.add(r);
    }
    // Oil slicks: glossy black stains that catch the searchlights.
    const oil = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.8 + ((i * 37) % 10) / 7, 20), oil);
      m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.6 + ((i * 13) % 5) / 10, 1);
      m.position.set(((i * 53) % 100) / 100 * w, 0.015, ((i * 71) % 100) / 100 * h); this.tableGroup.add(m);
    }
    this.buildSearchlights(w, h);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: groundTexture(w, h), roughness: 0.95 }));
    table.rotation.x = -Math.PI / 2; table.position.set(w / 2, 0, h / 2); table.receiveShadow = true; this.tableGroup.add(table);
    this.cam.target.set(w / 2, 0, h / 2);
    this.sun.target.position.set(w / 2, 0, h / 2);

    const win = windowTexture();
    for (const t of field.terrain || []) this.tableGroup.add(this.terrainMesh(t, win));

    // Deployment zones — tinted quarter-discs in each deployment corner.
    if (field.deployCorners) {
      field.deployCorners.forEach((c, i) => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(field.deployRadius || 8, 40), new THREE.MeshBasicMaterial({ color: i ? 0xe0533d : 0x5fd3c0, transparent: true, opacity: 0.07, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.02, c.y); this.tableGroup.add(m);
      });
    }
    this.buildObjectives(objectives);
  }

  terrainMesh(t, winTex) {
    const g = new THREE.Group();
    const rot = -(t.rot || 0) * DEG;
    const shadow = (m) => { m.castShadow = m.receiveShadow = true; return m; };
    if (t.shape === "rect") {
      if (t.kind === "building") {
        const hgt = 4 + ((t.w * 7 + t.h * 3) % 3);
        const walls = [];
        const tex = winTex.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, t.w / 3), Math.max(1, hgt / 3));
        const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
        const b = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w, hgt, t.h), m)); b.position.y = hgt / 2; g.add(b); walls.push(b);
        const roof = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.3, 0.3, t.h + 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3a3f })));
        roof.position.y = hgt + 0.15; g.add(roof);
        const tank = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, metalness: 0.5 })));
        tank.position.set(t.w * 0.25, hgt + 0.9, 0); g.add(tank);
        // A factory smokestack with a soot band — it belches smoke (see frame()).
        const stackH = 3 + (t.w % 2);
        const stack = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, stackH, 10), new THREE.MeshStandardMaterial({ color: 0x6b3a26, roughness: 0.9 })));
        stack.position.set(-t.w * 0.28, hgt + stackH / 2, -t.h * 0.2); g.add(stack);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x1a1512 }));
        band.position.set(stack.position.x, hgt + stackH - 0.2, stack.position.z); g.add(band);
        const mouth = new THREE.Object3D(); mouth.position.set(stack.position.x, hgt + stackH + 0.2, stack.position.z); g.add(mouth);
        (this.chimneys ||= []).push(mouth);
      } else if (t.kind === "barricade") {
        const wall = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w, 1.1, t.h), new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.9 })));
        wall.position.y = 0.55; g.add(wall);
        for (let x = -t.w / 2 + 0.5; x < t.w / 2; x += 1.2) {
          const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.15), new THREE.MeshStandardMaterial({ color: 0x4d3b28 })));
          post.position.set(x, 0.75, t.h / 2 + 0.1); g.add(post);
        }
      } else if (t.kind === "crate") {
        const c = shadow(new THREE.Mesh(new THREE.BoxGeometry(t.w, Math.min(t.w, t.h) * 0.8, t.h), new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.8 })));
        c.position.y = Math.min(t.w, t.h) * 0.4; g.add(c);
        const band = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.02, 0.12, t.h + 0.02), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.6 }));
        band.position.y = Math.min(t.w, t.h) * 0.4; g.add(band);
      } else {
        // rock (squared off in digital)
        const geo = new THREE.DodecahedronGeometry(1, 0); geo.scale(t.w / 2, Math.min(t.w, t.h) * 0.45, t.h / 2);
        const r = shadow(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 1, flatShading: true })));
        r.position.y = Math.min(t.w, t.h) * 0.3; g.add(r);
      }
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
      const pylonMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd35a, emissiveIntensity: 1.2, metalness: 0.6 });
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 1.6 + o.vp * 0.6, 6), pylonMat); pylon.position.y = (1.6 + o.vp * 0.6) / 2; pylon.castShadow = true; group.add(pylon);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), pylonMat); gem.position.y = 2.2 + o.vp * 0.6; group.add(gem);
      const light = new THREE.PointLight(0xffd35a, 6, 8); light.position.y = 2; group.add(light);
      this.tableGroup.add(group);
      this.objectiveMeshes.push({ group, ringMat, pylonMat, gem, light, o });
    });
  }

  // Two searchlights on gantries at the empty corners, sweeping the table.
  buildSearchlights(w, h) {
    for (const s of this.searchlights || []) { this.scene.remove(s); this.scene.remove(s.target); }
    this.searchlights = [];
    for (const [x, z] of [[-4, -4], [w + 4, h + 4]]) {
      const sl = new THREE.SpotLight(0xfff0c8, 60, 90, 0.16, 0.5, 1.2);
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
      const c = col[list[i]] ?? 0xffd35a;
      m.ringMat.color.setHex(c); m.pylonMat.emissive.setHex(c); m.light.color.setHex(c);
    });
  }

  // ---- Overlays ----
  clearOverlay() { this.overlay.clear(); }
  ring(x, y, r, color = 0x5fd3c0, opacity = 0.5) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.08, r + 0.08, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, y); this.overlay.add(m); return m;
  }
  disc(x, y, r, color, opacity = 0.12) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, y); this.overlay.add(m); return m;
  }
  // A wedge (front arc) — angles in engine degrees.
  wedge(x, y, r, fromDeg, toDeg, color, opacity = 0.12) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48, fromDeg * DEG, (toDeg - fromDeg) * DEG), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; m.position.set(x, 0.05, y); this.overlay.add(m); return m;
  }
  path(points, color = 0x33ff99) {
    const pts = points.map((p) => new THREE.Vector3(p.x, 0.15, p.y));
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
    this.objectiveMeshes.forEach((m, i) => { m.gem.rotation.y += dt; m.gem.position.y += Math.sin(this.clock.elapsedTime * 2 + i) * 0.004; });
    // Chimney smoke and sweeping searchlights.
    for (const c of this.chimneys || []) {
      if (Math.random() < dt * 5) {
        const p = c.getWorldPosition(new THREE.Vector3());
        this.fx.particle(p, { color: 0x3a3028, size: 1.2, life: 4, grow: 4, additive: false, opacity: 0.45, vel: new THREE.Vector3(0.6 + Math.random() * 0.4, 1.4 + Math.random(), 0.2) });
      }
    }
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
