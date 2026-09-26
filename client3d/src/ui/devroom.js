// Dev Room: every 3D asset laid out on one big floor, labelled, so a design
// request can point at an exact thing. Rows: chassis, rig states, support
// units, loose weapons, unit guns + tools, buildings, small terrain and
// objectives, an FX strip (click a pedestal to play it) and the backdrop set
// pieces (scaled down). Click anything (or pick it in the index) to fly to it
// and get a card with its id, source and a "Copy ref" line for the request.
import * as THREE from "three";
import { el, fill, toast } from "./dom.js";
import { Mech, PAINT, WEAPON_MODELS, weaponModel } from "../scene/mechs.js";
import { buildingVariant, BUILDING_KINDS, BACKDROP_KINDS, backdrop } from "../scene/props.js";
import { THEMES } from "../scene/themes.js";
import { CHASSIS, SUPPORT_TEMPLATES, DRONE_TYPES } from "/shared/game-state.js";
import { BASE_RADIUS } from "/shared/geometry.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const W = 112, H = 114;
const MECHS = "client3d/src/scene/mechs.js", PROPS = "client3d/src/scene/props.js", WORLD = "client3d/src/scene/world.js", FXF = "client3d/src/scene/fx.js";

// Row layout (z) and where items start (x). The camera looks toward -z, so
// tall things sit far back (small z) and small things up front.
const ROW = { backdrop: 10, buildings: 27, terrain: 38, chassis: 48, states: 57, units: 66, longRange: 74, melee: 82, kit: 90, fx1: 99, fx2: 106 };
const X0 = 12;
const SECTIONS = [
  ["chassis", "Chassis"], ["states", "Rig states"], ["units", "Support units"], ["longRange", "Long-range weapons"], ["melee", "Melee weapons"],
  ["kit", "Unit guns + module tools"], ["fx", "FX"], ["terrain", "Terrain + objectives"], ["buildings", "Buildings"], ["backdrop", "Set pieces (scaled)"],
];

// Painted floor lettering for a row's title.
function floorText(str, x, z) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 128;
  const g = c.getContext("2d");
  g.font = "700 72px Oswald, Arial, sans-serif"; g.textBaseline = "middle";
  g.fillStyle = "rgba(240,207,122,0.85)"; g.fillText(str.toUpperCase(), 8, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x + 8, 0.03, z + 2.2);
  return m;
}

function pedestal(r = 0.9, h = 0.5) {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 24), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.8, metalness: 0.3 }));
  stone.position.y = h / 2; stone.castShadow = stone.receiveShadow = true; g.add(stone);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.04, 6, 32), new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.9, roughness: 0.3 }));
  trim.rotation.x = Math.PI / 2; trim.position.y = h; g.add(trim);
  return g;
}

export class DevRoom {
  // root: the screen element (sidebar + card + labels live in it).
  constructor(world, root, { onBack, theme = null, focus = null } = {}) {
    this.world = world; this.root = root; this.onBack = onBack;
    this.items = []; this.byId = new Map(); this.mechs = []; this.loops = [];
    this.themeId = theme || Object.keys(THEMES)[0];
    world.buildField({ width: W, height: H, terrain: [], theme: this.themeId }, []);
    this.group = new THREE.Group(); world.tableGroup.add(this.group);
    this.ctx = world.dressCtx;
    this.build();
    this.ui();
    world.cam.target.set(W / 2, 0, 70); world.cam.dist = 60; world.cam.pitch = 0.75; world.cam.yaw = -Math.PI / 2;
    this.tick = (dt) => this.update(dt);
    world.tickers.add(this.tick);
    this.offClick = world.on("click", (_hit, e) => this.click(e));
    if (focus && this.byId.has(focus)) this.select(this.byId.get(focus));
  }

  // ---- Items ----
  add(item) {
    item.obj.traverse((o) => { o.userData.devId = item.id; });
    if (!item.obj.parent) this.group.add(item.obj);
    this.items.push(item); this.byId.set(item.id, item);
    return item;
  }

  // The label/camera anchor: top of the object's box.
  anchor(item) {
    const box = new THREE.Box3().setFromObject(item.obj);
    if (box.isEmpty()) return item.obj.getWorldPosition(V()).add(V(0, 2, 0));
    return V((box.min.x + box.max.x) / 2, box.max.y + 0.5, (box.min.z + box.max.z) / 2);
  }

  mech(opts, x, z, facing = 60) {
    const m = new Mech(opts);
    m.setPose({ x, y: z }, facing);
    this.group.add(m.root); this.mechs.push(m);
    return m;
  }

  build() {
    const g = this.group;
    for (const [key, title] of SECTIONS) g.add(floorText(title, 0.5, key === "fx" ? ROW.fx1 : ROW[key]));
    const usedBy = (slot, w) => CHASSIS.filter((c) => c[slot] === w).map((c) => `${c.name} (${c.id})`).join(", ");

    // Chassis, as they deploy.
    CHASSIS.forEach((c, i) => {
      const m = this.mech({ id: `dev-${c.id}`, name: c.name, owner: i % 2 ? "b" : "a", chassis: c.id, weightClass: c.class, longRange: c.longRange, melee: c.melee, radius: BASE_RADIUS[c.class] }, X0 + i * 6.5, ROW.chassis);
      this.add({ id: `chassis.${c.id}`, name: `${c.name}`, sub: `${c.label} · ${c.class}`, section: "chassis", obj: m.root, mech: m,
        source: `${MECHS} · class Mech (paint PAINT["${c.name}"], weapons LR["${c.longRange}"] + MELEE["${c.melee}"])`,
        notes: `Chassis ${c.id}, ${c.class}. Long-range ${c.longRange}, melee ${c.melee}.` });
    });

    // One chassis in each visual state the game can put a rig in.
    const base = CHASSIS.find((c) => c.class === "medium") || CHASSIS[0];
    const STATES = [
      ["idle", "Idle", () => {}],
      ["walking", "Walking", (m) => { m.devWalk = true; }],
      ["firing", "Firing (loop)", (m) => { m.devFire = true; }],
      ["selected", "Selected halo", (m) => m.setSelected(true, 0x5fd3c0)],
      ["spent", "Activated (token)", (m) => m.setSpent(true)],
      ["commander", "Commander crown", (m) => m.setCrown(true)],
      ["hot", "Overheating", (m) => { m.setHeat(1.3); m.devHot = true; }],
      ["broken-arms", "Broken arm", (m) => m.setParts({ arms: true })],
      ["broken-legs", "Broken legs (limp)", (m) => { m.setParts({ legs: true }); m.devWalk = true; }],
      ["broken-hull", "Gutted hull", (m) => m.setParts({ hull: true })],
      ["broken-engine", "Dead engine", (m) => m.setParts({ engine: true })],
      ["wreck", "Wreck (burning)", (m) => { m.destroy(); m.wreckFire = this.world.fx.wreckFire(() => m.root.position, 1.2); }],
    ];
    STATES.forEach(([key, label, apply], i) => {
      const m = this.mech({ id: `dev-state-${key}`, name: base.name, owner: "a", chassis: base.id, weightClass: base.class, longRange: base.longRange, melee: base.melee, radius: BASE_RADIUS[base.class] }, X0 + i * 7.5, ROW.states);
      apply(m);
      this.add({ id: `state.${key}`, name: label, sub: `${base.name} · rig state`, section: "states", obj: m.root, mech: m,
        source: `${MECHS} · Mech.${{ selected: "setSelected", spent: "setSpent", commander: "setCrown", hot: "setHeat", wreck: "destroy" }[key] || (key.startsWith("broken") ? "setParts" : "update")}()`,
        notes: `How a rig reads when ${label.toLowerCase()}.` });
    });

    // Support units: walker templates (the 3D game fields walkers, never tanks) and drones.
    const walkers = SUPPORT_TEMPLATES.filter((t) => t.kind === "walker");
    walkers.forEach((t, i) => {
      const m = this.mech({ id: `dev-${t.id}`, name: t.name, owner: "a", kind: "walker", weightClass: "walker", unit: t.unit, modules: t.modules, radius: BASE_RADIUS.walker }, X0 + i * 6, ROW.units);
      this.add({ id: `unit.${t.id}`, name: t.name, sub: `walker · ${t.unit || "Sidearm"} · ${t.modules.join(" + ")}`, section: "units", obj: m.root, mech: m,
        source: `${MECHS} · Mech.buildSupport("walker") (UNIT_GUNS["${t.unit || "Sidearm"}"], MODULE_TOOLS)`, notes: `Support template ${t.id}.` });
    });
    Object.values(DRONE_TYPES).forEach((d, i) => {
      const m = this.mech({ id: `dev-drone-${d.id}`, name: d.label, owner: "b", kind: "drone", weightClass: "drone", unit: d.unit, modules: d.modules, drone: d.id, radius: BASE_RADIUS.drone }, X0 + (walkers.length + i) * 6, ROW.units);
      this.add({ id: `unit.drone.${d.id}`, name: `${d.label} drone`, sub: `drone · ${d.unit}`, section: "units", obj: m.root, mech: m,
        source: `${MECHS} · Mech.buildSupport("drone") (UNIT_GUNS["${d.unit}"])`, notes: `Drone type ${d.id}.` });
    });

    // Loose weapons on pedestals, in the paint of the rig that carries them.
    const weaponRow = (slot, row, names, section, spacing, srcTable) => names.forEach((w, i) => {
      const owner = CHASSIS.find((c) => c[slot] === w);
      const color = owner ? PAINT[owner.name] ?? 0x888888 : 0x7a7468;
      const built = weaponModel(slot, w, color);
      if (!built) return;
      const p = pedestal(); p.position.set(X0 + i * spacing, 0, row);
      built.group.scale.setScalar(1.3); built.group.position.set(-0.3, 1.3, 0); built.group.rotation.y = -0.7;
      p.add(built.group);
      this.add({ id: `weapon.${slot}.${w}`, name: w, sub: slot === "longRange" ? "long-range weapon" : slot === "melee" ? "melee weapon" : slot === "unit" ? "support-unit gun" : "module tool",
        section, obj: p, source: `${MECHS} · ${srcTable}["${w}"]`,
        notes: owner || slot === "longRange" || slot === "melee" ? `Used by: ${usedBy(slot, w) || "no chassis"}.` : "" });
    });
    weaponRow("longRange", ROW.longRange, WEAPON_MODELS.longRange, "longRange", 6.5, "LR");
    weaponRow("melee", ROW.melee, WEAPON_MODELS.melee, "melee", 6.5, "MELEE");
    weaponRow("unit", ROW.kit, WEAPON_MODELS.unit, "kit", 6.5, "UNIT_GUNS");
    const kitN = WEAPON_MODELS.unit.length;
    WEAPON_MODELS.tool.filter((t) => t !== "none").forEach((t, i) => {
      const built = weaponModel("tool", t);
      const p = pedestal(); p.position.set(X0 + (kitN + i) * 6.5, 0, ROW.kit);
      built.group.scale.setScalar(1.3); built.group.position.set(-0.3, 1.2, 0); built.group.rotation.y = -0.7; p.add(built.group);
      this.add({ id: `tool.${t}`, name: `${t} tool`, sub: "support module tool (left arm)", section: "kit", obj: p, source: `${MECHS} · MODULE_TOOLS.${t}()`, notes: `Carried by walkers with the ${t} module.` });
    });

    // Buildings, each variant on its own footprint.
    BUILDING_KINDS.forEach((kind, i) => {
      const t = { kind: "building", shape: "rect", x: 0, y: 0, w: 6, h: 5, rot: 0 };
      const b = new THREE.Group(); b.add(buildingVariant(kind, t, this.ctx)); b.position.set(X0 + 3 + i * 14, 0, ROW.buildings);
      this.add({ id: `building.${kind}`, name: kind, sub: "building (fills its terrain rect)", section: "buildings", obj: b, source: `${PROPS} · ${kind}(t, ctx) via buildingVariant()`,
        notes: `Which themes use it: ${Object.values(THEMES).filter((th) => th.buildings.includes(kind)).map((th) => th.name).join(", ") || "none"}.` });
    });

    // Small terrain (through the same path the battle uses) and objectives.
    const TERRAIN = [
      ["barricade", "Barricade", { kind: "barricade", shape: "rect", w: 7, h: 0.9 }, "barricadeProp"],
      ["crate", "Crate stack", { kind: "crate", shape: "rect", w: 2.2, h: 2.2 }, "crateProp"],
      ["rubble", "Rubble / rock", { kind: "rock", shape: "rect", w: 2.5, h: 2 }, "rubbleProp"],
      ["area", "Area terrain (ellipse)", { kind: "area", shape: "ellipse", rx: 2.5, ry: 1.6 }, "terrainMesh ellipse"],
      ["rock-poly", "Rock outcrop (poly)", { kind: "rock", shape: "poly", points: [[-1.5, -1], [1.2, -1.4], [1.8, 0.6], [-0.2, 1.6], [-1.8, 0.4]] }, "terrainMesh poly"],
      ["woods", "Woods (poly)", { kind: "wood", shape: "poly", points: [[-2, -1.2], [1.8, -1.5], [2.2, 1], [-1.5, 1.6]] }, "terrainMesh poly"],
    ];
    let tx = X0;
    TERRAIN.forEach(([key, name, t, fn]) => {
      const w = t.w || (t.rx ? t.rx * 2 : 4);
      tx += w / 2;
      const obj = this.world.terrainMesh({ ...t, x: tx, y: ROW.terrain }, this.ctx);
      this.add({ id: `terrain.${key}`, name, sub: `terrain · ${t.kind}/${t.shape}`, section: "terrain", obj, source: `${fn.startsWith("terrainMesh") ? WORLD : PROPS} · ${fn}`, notes: "" });
      tx += w / 2 + 3;
    });
    const OBJ = [["beacon-1", "Beacon (1 VP)", { vp: 1 }, "beaconPylon"], ["beacon-2", "Beacon (2 VP, centre)", { vp: 2 }, "beaconPylon"], ["relay", "Relay mast (Last Stand)", { relay: true, vp: 0 }, "relayMast"], ["crate-obj", "Salvage crate", { crate: true, vp: 0 }, "crateProp"]];
    const objs = OBJ.map(([, , o], i) => ({ ...o, x: tx + 2 + i * 6, y: ROW.terrain }));
    this.world.buildObjectives(objs);
    this.world.objectiveMeshes.forEach((om, i) => {
      const [key, name, , fn] = OBJ[i];
      this.add({ id: `objective.${key}`, name, sub: "objective", section: "terrain", obj: om.group, source: `${WORLD} · World.${fn}()`, notes: "Holding ring, gem and light are part of the objective." });
    });

    this.buildFx();

    // Backdrop set pieces, shrunk to fit a slot (in game they ring the table far out).
    BACKDROP_KINDS.forEach((kind, i) => {
      const raw = backdrop(kind, i, V(0, 0, 0), 20, this.ctx);
      const box = new THREE.Box3().setFromObject(raw);
      const size = box.getSize(V()), slot = 18;
      const k = Math.min(1, slot / Math.max(size.x, size.z, 1), 14 / Math.max(size.y, 1));
      const holder = new THREE.Group(); holder.add(raw);
      raw.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      holder.scale.setScalar(k); holder.position.set(X0 + 6 + i * 21, 0, ROW.backdrop);
      this.add({ id: `backdrop.${kind}`, name: kind, sub: `set piece · shown at ${Math.round(k * 100)}% scale`, section: "backdrop", obj: holder, source: `${PROPS} · backdrop("${kind}")`,
        notes: `In battle it stands ~125" out from the table centre. Themes: ${Object.values(THEMES).filter((th) => th.backdrop.includes(kind)).map((th) => th.name).join(", ")}.` });
    });
  }

  // FX pedestals: click to play. Each spec plays at (and around) its pedestal.
  buildFx() {
    const fx = this.world.fx;
    const shot = (kind) => (p) => { const from = p.clone().add(V(0, 1.4, 0)); fx.muzzle(from, 0xffcc55, V(0, 0, -1)); fx.shoot(from, p.clone().add(V(0, 1.2, -9)), kind, (q) => fx.sparks(q, 8)); };
    const FX = [
      ["explosion", "Explosion", (p) => fx.explosion(p.clone().add(V(0, 1.5, 0)), false, true)],
      ["explosion-big", "Explosion (big)", (p) => fx.explosion(p.clone().add(V(0, 1.5, 0)), true)],
      ["death", "Death blast", (p) => fx.deathBlast(p.clone().add(V(0, 1.5, 0)), 0xd4a017)],
      ["wreck-fire", "Wreck fire (8 s)", (p) => { const f = fx.wreckFire(() => p); setTimeout(() => f.stop(), 8000); }],
      ["impact", "Wounding hit (3 SP)", (p) => fx.impact(p.clone().add(V(0, 1.8, 0)), 3, { from: p.clone().add(V(0, 1.8, 8)), color: 0x2f6fd6 })],
      ["impact-big", "Wounding hit (7 SP)", (p) => fx.impact(p.clone().add(V(0, 1.8, 0)), 7, { from: p.clone().add(V(0, 1.8, 8)), color: 0xc0282d })],
      ["ricochet", "Ricochet (deflected)", (p) => fx.ricochet(p.clone().add(V(0, 1.8, 0)), p.clone().add(V(0, 1.8, 8)))],
      ["sparks", "Sparks", (p) => fx.sparks(p.clone().add(V(0, 1.5, 0)), 24)],
      ["muzzle", "Muzzle flash", (p) => fx.muzzle(p.clone().add(V(0, 1.6, 0)), 0xffcc55, V(0, 0, -1))],
      ["flame", "Flamethrower", (p) => fx.flame(p.clone().add(V(0, 1.4, 1.5)), p.clone().add(V(0, 1, -5)))],
      ["fireball", "Fireball", (p) => fx.fireball(p.clone().add(V(0, 1.5, 0)), 1, 10)],
      ["embers", "Embers", (p) => fx.embers(p.clone().add(V(0, 1, 0)), 20)],
      ["shockwave", "Shockwave ring", (p) => fx.shockwave(p.clone().setY(0.1), 4)],
      ["frost", "Cryo frost", (p) => fx.frost(p.clone().add(V(0, 1.2, 0)))],
      ["glitter", "Chaff", (p) => fx.glitter(p.clone().add(V(0, 1.5, 0)))],
      ["weld", "Weld sparks", (p) => fx.weld(p.clone().add(V(0, 1.4, 0)))],
      ["smoke", "Smoke (dark)", (p) => fx.smoke(p.clone().add(V(0, 1, 0)), 10, true)],
      ["steam", "Steam", (p) => { for (let i = 0; i < 14; i++) fx.steam(p.clone().add(V(0, 1.2, 0))); }],
      ["jet", "Thruster jet", (p) => { let n = 0; const t = setInterval(() => { fx.jet(p.clone().add(V(0, 3, 0)), 1.3); if (++n > 40) clearInterval(t); }, 25); }],
      ["footfall", "Footfall dust", (p) => fx.footfall(p.clone().setY(0.05), true)],
      ["heat", "Heat haze", (p) => { let n = 0; const t = setInterval(() => { fx.heatHaze(p.clone().add(V(0, 1.4, 0)), 1.2); if (++n > 30) clearInterval(t); }, 60); }],
      ["scorch", "Scorch decal", (p) => fx.decals.add(p.clone().add(V(0, 0, -2)), 1.5, "scorch", { hot: true })],
      ["shot-bullet", "Shot: bullet", shot("bullet")],
      ["shot-cannon", "Shot: cannon", shot("cannon")],
      ["shot-missile", "Shot: missile", shot("missile")],
      ["shot-lob", "Shot: mortar lob", shot("lob")],
      ["shot-rail", "Shot: rail", shot("rail")],
      ["shot-bolt", "Shot: bolt", shot("bolt")],
      ["shot-harpoon", "Shot: harpoon", shot("harpoon")],
      ["shot-rivet", "Shot: rivet", shot("rivet")],
      ["shot-steam", "Shot: steam", shot("steam")],
      ["shot-flare", "Shot: flare", shot("flare")],
      ["arc", "Arc beam", (p) => { const a = p.clone().add(V(0, 1.4, 0)), b = p.clone().add(V(0, 1.4, -9)); fx.beam(a, b, 0x88ddff, 0.35, true); fx.beam(a, b, 0xffffff, 0.2, true); fx.sparks(b, 10, 0x9fe8ff); }],
    ];
    const perRow = Math.ceil(FX.length / 2);
    FX.forEach(([key, name, play], i) => {
      const p = pedestal(0.6, 0.35);
      const row = i < perRow ? ROW.fx1 : ROW.fx2;
      p.position.set(X0 + (i % perRow) * 5.4, 0, row);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff7a2a, emissiveIntensity: 1.6 }));
      gem.position.y = 0.75; p.add(gem); p.userData.gem = gem;
      const at = () => p.getWorldPosition(V());
      this.add({ id: `fx.${key}`, name, sub: "effect (click to play)", section: "fx", obj: p, play: () => play(at()),
        source: `${FXF} · FX.${{ "explosion-big": "explosion", death: "deathBlast", "wreck-fire": "wreckFire", "impact-big": "impact", smoke: "smoke", heat: "heatHaze", scorch: "decals.add", arc: "beam", "flame": "flame" }[key] || (key.startsWith("shot-") ? `shoot(…, "${key.slice(5)}")` : key)}()`,
        notes: "" });
    });
  }

  // ---- Interaction ----
  click(e) {
    if (!e) return;
    const r = this.world.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.world.raycaster.setFromCamera(ndc, this.world.camera);
    const hits = this.world.raycaster.intersectObjects(this.items.map((i) => i.obj), true);
    const hit = hits.find((h) => h.object.userData.devId);
    if (!hit) return;
    const item = this.byId.get(hit.object.userData.devId);
    if (item) this.select(item, { fly: false });
  }

  refText(it) {
    return `[3D asset] ${it.name} (${it.sub}) · id ${it.id} · ${it.source}${it.notes ? ` · ${it.notes}` : ""}`;
  }

  select(it, { fly = true } = {}) {
    this.sel = it;
    if (fly) this.world.cam.goal = { target: this.anchor(it).setY(0), dist: it.section === "backdrop" || it.section === "buildings" ? 26 : 14 };
    // Play effects once the camera has arrived, not mid-flight.
    if (it.play) { clearTimeout(this.playT); this.playT = setTimeout(it.play, fly ? 900 : 0); }
    try { history.replaceState(null, "", `#dev=${encodeURIComponent(it.id)}`); } catch {}
    const m = it.mech;
    fill(this.card,
      el("div", { class: "dv-kicker" }, SECTIONS.find(([k]) => k === it.section)?.[1] || it.section),
      el("h3", {}, it.name),
      el("div", { class: "muted" }, it.sub),
      el("div", { class: "dv-row" }, el("b", {}, "id "), el("code", {}, it.id)),
      el("div", { class: "dv-row" }, el("b", {}, "source "), el("code", {}, it.source)),
      it.notes ? el("p", { class: "dv-notes" }, it.notes) : null,
      el("div", { class: "dv-actions" },
        el("button", { class: "btn primary", onClick: () => { navigator.clipboard?.writeText(this.refText(it)).then(() => toast("Reference copied. Paste it into your request.", "good"), () => toast(this.refText(it), "info", 8000)); } }, "Copy ref"),
        it.play ? el("button", { class: "btn", onClick: it.play }, "▶ Play") : null,
        m && !m.destroyed ? el("button", { class: "btn", onClick: () => { m.devWalk = !m.devWalk; } }, "Walk") : null,
        m && !m.destroyed ? el("button", { class: "btn", onClick: () => this.fireMech(m, "longRange") }, "Fire gun") : null,
        m && !m.destroyed ? el("button", { class: "btn", onClick: () => this.fireMech(m, "melee") }, "Swing") : null,
        m ? el("button", { class: "btn", onClick: () => { m.targetFacing += 45; } }, "Turn") : null,
        el("button", { class: "btn ghost", onClick: () => this.select(it) }, "Focus")));
    this.card.style.display = "";
    for (const b of this.index.querySelectorAll(".dv-item")) b.classList.toggle("on", b.dataset.id === it.id);
  }

  fireMech(m, slot) {
    m.fire(slot);
    const from = m.muzzleWorld(slot);
    const r = m.root.rotation.y, fwd = V(Math.cos(r), 0, -Math.sin(r)); // the model faces local +x
    if (slot === "longRange") { this.world.fx.muzzle(from, 0xffcc55, fwd); this.world.fx.shoot(from, from.clone().addScaledVector(fwd, 10).setY(0.5), "bullet", (q) => this.world.fx.sparks(q, 6)); }
    else this.world.fx.sparks(from, 10);
  }

  ui() {
    const search = el("input", { class: "dv-search", placeholder: "Search assets…", onInput: () => this.filter(search.value) });
    this.index = el("div", { class: "dv-index" }, SECTIONS.map(([key, title]) => el("div", { class: "dv-sec", "data-sec": key },
      el("div", { class: "dv-sec-h", onClick: () => { this.world.cam.goal = { target: V(W / 2, 0, key === "fx" ? ROW.fx1 + 3 : ROW[key]), dist: 55 }; } }, title),
      this.items.filter((i) => i.section === key).map((i) => el("button", { class: "dv-item", "data-id": i.id, title: i.id, onClick: () => this.select(i) }, i.name)))));
    const theme = el("select", { onChange: (e) => this.onTheme?.(e.target.value) }, Object.values(THEMES).map((t) => el("option", { value: t.id, selected: t.id === this.themeId }, t.name)));
    this.card = el("div", { class: "dv-card", style: { display: "none" } });
    this.labels = el("div", { class: "dv-labels" });
    this.labelEls = this.items.map((it) => {
      const l = el("div", { class: `dv-label s-${it.section}`, onClick: () => this.select(it) }, it.name);
      this.labels.append(l);
      return { it, l, at: this.anchor(it) };
    });
    fill(this.root, el("div", { class: "devroom" },
      this.labels,
      el("div", { class: "dv-side" },
        el("div", { class: "dv-head" }, el("h2", {}, "🛠 Dev Room"), el("button", { class: "btn ghost", onClick: this.onBack }, "‹ Back")),
        el("p", { class: "muted small" }, `${this.items.length} assets. Click one on the floor or in the list, then "Copy ref" and paste it into a design request.`),
        el("label", { class: "dv-theme" }, "Theme ", theme),
        search, this.index),
      this.card));
  }

  filter(q) {
    q = q.trim().toLowerCase();
    for (const b of this.index.querySelectorAll(".dv-item")) {
      const it = this.byId.get(b.dataset.id);
      b.style.display = !q || `${it.name} ${it.id} ${it.sub}`.toLowerCase().includes(q) ? "" : "none";
    }
    for (const sec of this.index.querySelectorAll(".dv-sec")) sec.style.display = [...sec.querySelectorAll(".dv-item")].some((b) => b.style.display !== "none") ? "" : "none";
  }

  update(dt) {
    this.t = (this.t || 0) + dt;
    for (const m of this.mechs) {
      m.walking = m.devWalk ? 1 : Math.max(0, m.walking - dt * 3);
      m.update(dt);
      if (m.devFire) { m.devFireT = (m.devFireT || 0) - dt; if (m.devFireT <= 0) { m.devFireT = 1.4; this.fireMech(m, Math.random() < 0.7 ? "longRange" : "melee"); } }
      if (m.devHot && Math.random() < dt * 8) this.world.fx.heatHaze(m.stacks[Math.floor(Math.random() * m.stacks.length)].getWorldPosition(V()).add(V(0, 0.3, 0)), 1.3);
      if (m.devHot && Math.random() < dt * 5) this.world.fx.steam(m.stacks[0].getWorldPosition(V()));
      if (m.broken?.engine && Math.random() < dt * 3) this.world.fx.smoke(m.stacks[0].getWorldPosition(V()), 1, true);
    }
    for (const it of this.items) if (it.obj.userData.gem) it.obj.userData.gem.rotation.y += dt * 1.5;
    // Labels: project each anchor; fade with distance, hide behind the camera.
    const cam = this.world.camera, w = window.innerWidth, h = window.innerHeight;
    const v = new THREE.Vector3();
    for (const L of this.labelEls) {
      const d = cam.position.distanceTo(L.at);
      v.copy(L.at).project(cam);
      const show = v.z < 1 && d < 75 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      L.l.style.display = show ? "" : "none";
      if (!show) continue;
      L.l.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      L.l.style.opacity = String(Math.max(0.25, Math.min(1, (75 - d) / 30)));
      L.l.classList.toggle("on", this.sel === L.it);
    }
  }

  destroy() {
    this.world.tickers.delete(this.tick);
    clearTimeout(this.playT);
    this.offClick?.();
    for (const m of this.mechs) m.wreckFire?.stop();
    this.world.tableGroup.remove(this.group);
    this.world.buildObjectives([]);
    try { if (location.hash.startsWith("#dev")) history.replaceState(null, "", location.pathname + location.search); } catch {}
  }
}
