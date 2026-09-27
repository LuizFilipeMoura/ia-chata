// Procedural mech models. Every chassis gets its own paint (the codenames ARE
// colours, Gold, Pumpkin, Zebra…) and its own dieselpunk body from the part
// library in scene/rig/ (walkers and drones too, one body per template), and
// each of the 28 weapons has its own model hung off the arms. Built from
// primitives at runtime: no asset pipeline, and every part is a named pivot
// we can animate.
import { THREE, DEG, mat, STEEL, DARK, BRASS, at, box, cyl, sph, cone, barrel, canvasTexture } from "./rig/kit.js";
import { buildRigBody, flattenFoot } from "./rig/body.js";
import { recipeFor } from "./rig/recipes.js";
import { supportRecipeFor } from "./rig/support.js";
import { SKINS, skinMaterials, applySkin } from "./rig/skins.js";

export const PAINT = {
  Gold: 0xd4a017, Blue: 0x2f6fd6, Purple: 0x7b3fb8, Pumpkin: 0xe8731c, Zebra: 0xe9e6dc,
  Turquoise: 0x1fb5a8, Green: 0x3f9a3a, Copper: 0xb8703a, Black: 0x2a2a30, Red: 0xc0282d, Silver: 0xb9c0c8,
  Brass: 0xa8822e, Ivory: 0xe6dcc0, Jade: 0x2f8f62,
};
export const TEAM = { a: 0x5fd3c0, b: 0xe0533d };

function stripeTexture(base, stripe) {
  return canvasTexture(64, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    g.fillStyle = stripe;
    for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 7, 0); g.lineTo(i + 7 - 40, 64); g.lineTo(i - 40, 64); g.fill(); }
  }, { repeat: true });
}

// ---- Long-range weapons: return { group, muzzle (Object3D at the muzzle), spin? }
const LR = {
  "Autocannon"(p) {
    const g = new THREE.Group(); g.add(box(0.9, 0.45, 0.5, p));
    for (const z of [-0.12, 0.12]) g.add(at(barrel(0.07, 1.1, STEEL()), 0.5, 0.05, z));
    g.children.slice(1).forEach((b) => { b.position.x = 0.95; });
    return { group: g, muzzleX: 1.55 };
  },
  "Missile Barrage"(p) {
    const g = new THREE.Group(); const pod = box(0.9, 0.7, 0.8, p); g.add(pod);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const t = cyl(0.09, 0.09, 0.2, DARK()); t.rotation.z = -Math.PI / 2; t.position.set(0.5, -0.22 + i * 0.22, -0.24 + j * 0.24); g.add(t);
    }
    return { group: g, muzzleX: 0.6, launcher: true };
  },
  "Mini Gun"(p) {
    const g = new THREE.Group(); g.add(box(0.6, 0.4, 0.45, p));
    const spin = new THREE.Group(); spin.position.x = 0.3;
    for (let i = 0; i < 6; i++) {
      const b = barrel(0.045, 1.1, STEEL()); const a = (i / 6) * Math.PI * 2;
      b.position.set(0.55, Math.cos(a) * 0.14, Math.sin(a) * 0.14); spin.add(b);
    }
    spin.add(at(cyl(0.2, 0.2, 0.08, BRASS()), 0.9, 0, 0, Math.PI / 2));
    g.add(spin);
    return { group: g, muzzleX: 1.45, spin };
  },
  "Double MG"(p) {
    const g = new THREE.Group(); g.add(box(0.7, 0.35, 0.6, p));
    for (const z of [-0.2, 0.2]) { const b = barrel(0.05, 0.9, DARK()); b.position.set(0.8, 0, z); g.add(b); }
    g.add(at(box(0.3, 0.3, 0.2, BRASS()), -0.1, -0.3, 0));
    return { group: g, muzzleX: 1.25 };
  },
  "Arc Gun"(p) {
    const g = new THREE.Group(); g.add(box(0.6, 0.4, 0.4, p));
    const core = barrel(0.08, 1.0, STEEL()); core.position.x = 0.8; g.add(core);
    const glow = mat(0x66ccff, { emissive: 0x3399ff, emissiveIntensity: 1.6 });
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 6, 16), glow); r.rotation.y = Math.PI / 2; r.position.x = 0.5 + i * 0.22; g.add(r); }
    return { group: g, muzzleX: 1.35, arc: true };
  },
  "Harpoon"(p) {
    const g = new THREE.Group(); g.add(box(0.7, 0.35, 0.35, p));
    const b = barrel(0.1, 1.2, STEEL()); b.position.x = 0.9; g.add(b);
    const tip = cone(0.16, 0.4, BRASS()); tip.rotation.z = -Math.PI / 2; tip.position.x = 1.7; g.add(tip);
    g.add(at(cyl(0.18, 0.18, 0.25, DARK()), -0.1, -0.3, 0));
    return { group: g, muzzleX: 1.8, harpoon: tip };
  },
  "Rivet Gun"(p) {
    const g = new THREE.Group();
    const drum = cyl(0.3, 0.3, 0.45, p, 16); drum.rotation.x = Math.PI / 2; g.add(drum);
    const b = barrel(0.09, 0.8, STEEL()); b.position.x = 0.55; g.add(b);
    return { group: g, muzzleX: 1.0 };
  },
  "Mortar"(p) {
    const g = new THREE.Group(); g.add(box(0.7, 0.4, 0.6, p));
    const tube = cyl(0.22, 0.26, 1.1, DARK(), 14); tube.rotation.z = -35 * DEG; tube.position.set(0.3, 0.5, 0); g.add(tube);
    return { group: g, muzzleX: 0.6, muzzleY: 0.95, lob: true };
  },
  "Siege Maul"(p) {
    const g = new THREE.Group(); g.add(box(1.0, 0.55, 0.6, p));
    const b = barrel(0.2, 1.2, DARK()); b.position.x = 1.0; g.add(b);
    g.add(at(cyl(0.27, 0.27, 0.25, STEEL()), 1.7, 0, 0, Math.PI / 2));
    return { group: g, muzzleX: 1.85, heavy: true };
  },
  "Sniper Cannon"(p) {
    const g = new THREE.Group(); g.add(box(0.8, 0.35, 0.35, p));
    const b = barrel(0.06, 2.0, STEEL()); b.position.x = 1.3; g.add(b);
    const scope = barrel(0.07, 0.5, DARK()); scope.position.set(0.3, 0.28, 0); g.add(scope);
    g.add(at(box(0.18, 0.12, 0.18, BRASS()), 2.3, 0, 0));
    return { group: g, muzzleX: 2.4, rail: true };
  },
  "Crossbow"(p) {
    const g = new THREE.Group(); g.add(box(1.2, 0.2, 0.2, p));
    for (const s of [-1, 1]) { const limb = box(0.12, 0.08, 0.9, STEEL()); limb.position.set(0.9, 0, s * 0.42); limb.rotation.y = s * -25 * DEG; g.add(limb); }
    const bolt = barrel(0.035, 1.0, BRASS()); bolt.position.set(0.3, 0.14, 0); g.add(bolt);
    return { group: g, muzzleX: 1.3, bolt: true };
  },
  "Steam Cannon"(p) {
    const g = new THREE.Group();
    const boiler = cyl(0.34, 0.34, 0.8, p, 16); boiler.rotation.z = Math.PI / 2; g.add(boiler);
    for (const x of [-0.25, 0.25]) g.add(at(cyl(0.36, 0.36, 0.06, BRASS(), 16), x, 0, 0, Math.PI / 2));
    const b = cyl(0.16, 0.28, 0.9, DARK(), 14); b.rotation.z = -Math.PI / 2; b.position.x = 0.85; g.add(b);
    g.add(at(cyl(0.05, 0.05, 0.4, BRASS()), -0.1, 0.45, 0));
    return { group: g, muzzleX: 1.3, heavy: true };
  },
  "Flare Launcher"(p) {
    const g = new THREE.Group(); g.add(box(0.6, 0.3, 0.4, p));
    for (const z of [-0.12, 0.12]) { const t = barrel(0.1, 0.9, DARK()); t.position.set(0.45, 0.12, z); t.rotation.z = -Math.PI / 2 + 0.3; g.add(t); }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: 0xff3a1a, emissiveIntensity: 1.5 }));
    tip.position.set(0.9, 0.3, 0); g.add(tip);
    return { group: g, muzzleX: 1.0, muzzleY: 0.3, glow: tip };
  },
  "Tesla Coil"(p) {
    const g = new THREE.Group(); g.add(box(0.6, 0.35, 0.35, p));
    const rod = barrel(0.06, 1.1, STEEL()); rod.position.x = 0.3; g.add(rod);
    for (let i = 0; i < 4; i++) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.02, 0.035, 6, 14), BRASS()), 0.45 + i * 0.22, 0, 0, 0).rotateY(Math.PI / 2));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x66ccff, emissiveIntensity: 1.5 }));
    orb.position.x = 1.45; g.add(orb);
    return { group: g, muzzleX: 1.5, glow: orb };
  },
};

// ---- Melee weapons: return { group, tip, spin? }
const MELEE = {
  "Claw"(p) {
    const g = new THREE.Group(); g.add(box(0.5, 0.4, 0.4, p));
    for (let i = 0; i < 3; i++) { const f = cone(0.07, 0.6, STEEL()); f.rotation.z = -Math.PI / 2 - 0.25; f.position.set(0.5, -0.1 + (i % 2) * 0.1, -0.15 + i * 0.15); g.add(f); }
    return { group: g, tip: 0.8 };
  },
  "Flamethrower"(p) {
    const g = new THREE.Group(); const tank = cyl(0.2, 0.2, 0.6, p); tank.rotation.x = Math.PI / 2; g.add(tank);
    const n = barrel(0.08, 0.8, STEEL()); n.position.x = 0.3; g.add(n);
    g.add(at(sph(0.05, mat(0xff8822, { emissive: 0xff5500, emissiveIntensity: 2 })), 1.12, 0, 0));
    return { group: g, tip: 1.1, flame: true };
  },
  "Circular Saw"(p) {
    const g = new THREE.Group(); g.add(box(0.5, 0.3, 0.3, p));
    const spin = new THREE.Group(); spin.position.x = 0.7;
    const disc = cyl(0.45, 0.45, 0.05, STEEL(), 20); disc.rotation.x = Math.PI / 2; spin.add(disc);
    for (let i = 0; i < 10; i++) { const t = cone(0.05, 0.12, STEEL(), 4); const a = i / 10 * Math.PI * 2; t.position.set(Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0); t.rotation.z = a - Math.PI / 2; spin.add(t); }
    g.add(spin);
    return { group: g, tip: 1.1, spin, spinAxis: "z" };
  },
  "Wrecking Ball"(p) {
    const g = new THREE.Group(); g.add(box(0.4, 0.4, 0.4, p));
    const chain = cyl(0.03, 0.03, 0.8, STEEL()); chain.position.set(0.25, -0.4, 0); g.add(chain);
    const ball = sph(0.38, DARK(), 14); ball.position.set(0.3, -0.95, 0); g.add(ball);
    return { group: g, tip: 0.6, swing: ball };
  },
  "Sword"(p) {
    const g = new THREE.Group(); g.add(box(0.35, 0.3, 0.3, p));
    g.add(at(box(0.08, 0.5, 0.12, BRASS()), 0.2, 0, 0));
    const blade = box(1.7, 0.1, 0.22, mat(0xdfe6ee, { metalness: 1, roughness: 0.15 })); blade.position.x = 1.05; g.add(blade);
    return { group: g, tip: 1.9 };
  },
  "Anchor"(p) {
    const g = new THREE.Group(); g.add(box(0.4, 0.4, 0.4, p));
    const shank = box(1.2, 0.14, 0.14, DARK()); shank.position.x = 0.8; g.add(shank);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 6, 12, Math.PI), DARK()); arm.rotation.z = Math.PI / 2; arm.position.x = 1.35; arm.castShadow = true; g.add(arm);
    return { group: g, tip: 1.6 };
  },
  "Pressure Claw"(p) {
    const g = new THREE.Group(); g.add(cyl(0.18, 0.18, 0.6, p).rotateZ(Math.PI / 2));
    const upper = box(0.7, 0.12, 0.2, STEEL()); upper.position.set(0.6, 0.15, 0); upper.rotation.z = -0.3; g.add(upper);
    const lower = box(0.7, 0.12, 0.2, STEEL()); lower.position.set(0.6, -0.15, 0); lower.rotation.z = 0.3; g.add(lower);
    return { group: g, tip: 0.9, jaws: [upper, lower] };
  },
  "Lance"(p) {
    const g = new THREE.Group(); g.add(cone(0.3, 0.3, p).rotateZ(Math.PI / 2));
    const l = cone(0.14, 2.4, BRASS(), 8); l.rotation.z = -Math.PI / 2; l.position.x = 1.3; g.add(l);
    return { group: g, tip: 2.5 };
  },
  "Bulwark Shield"(p) {
    const g = new THREE.Group();
    const s = box(0.15, 1.6, 1.1, p); s.position.x = 0.3; g.add(s);
    g.add(at(box(0.18, 1.3, 0.12, BRASS()), 0.32, 0, 0));
    return { group: g, tip: 0.5, shield: s };
  },
  "Chainsaw"(p) {
    const g = new THREE.Group(); g.add(box(0.5, 0.35, 0.3, p));
    const bar = box(1.4, 0.26, 0.06, STEEL()); bar.position.x = 0.95; g.add(bar);
    const teeth = box(1.45, 0.32, 0.03, DARK()); teeth.position.x = 0.95; g.add(teeth);
    return { group: g, tip: 1.6, buzz: teeth };
  },
  "Talon"(p) {
    const g = new THREE.Group(); g.add(box(0.4, 0.35, 0.35, p));
    for (const z of [-0.12, 0.12]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 5, 12, Math.PI * 0.6), STEEL()); t.castShadow = true;
      t.position.set(0.2, 0.6, z); t.rotation.z = -Math.PI * 0.55; g.add(t);
    }
    return { group: g, tip: 1.0 };
  },
  "Piston Hammer"(p) {
    const g = new THREE.Group();
    const housing = cyl(0.22, 0.22, 0.7, p, 14); housing.rotation.z = Math.PI / 2; housing.position.x = 0.2; g.add(housing);
    const ram = new THREE.Group(); ram.position.x = 0.55; g.add(ram);
    const rod = barrel(0.08, 0.5, STEEL()); ram.add(rod);
    ram.add(at(cyl(0.3, 0.3, 0.35, DARK(), 14), 0.6, 0, 0, Math.PI / 2));
    return { group: g, tip: 1.1, ram };
  },
  "Bayonet"(p) {
    const g = new THREE.Group(); g.add(box(0.5, 0.25, 0.25, p));
    const blade = cone(0.09, 1.3, mat(0xdfe6ee, { metalness: 1, roughness: 0.15 }), 4); blade.rotation.z = -Math.PI / 2; blade.position.x = 0.9; g.add(blade);
    g.add(at(box(0.08, 0.3, 0.3, BRASS()), 0.27, 0, 0));
    return { group: g, tip: 1.6 };
  },
  "Shock Glove"(p) {
    const g = new THREE.Group(); g.add(box(0.5, 0.45, 0.45, p));
    for (let i = 0; i < 4; i++) g.add(at(box(0.3, 0.1, 0.09, STEEL()), 0.4, 0.14 - (i % 2) * 0.1, -0.15 + i * 0.1));
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 6, 16), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x66ccff, emissiveIntensity: 1.2 }));
    coil.rotation.y = Math.PI / 2; coil.position.x = 0.05; g.add(coil);
    return { group: g, tip: 0.7, glow: coil };
  },
};

// ---- Support-unit kit (walkers + drones): the one flat-pick gun rides the
// right arm; the left arm carries the module tool (or nothing, on a drone).
const UNIT_GUNS = {
  "Coaxial MG": (p) => LR["Double MG"](p),
  "Autocannon Mount": (p) => LR["Autocannon"](p),
  "Rocket Pod": (p) => LR["Missile Barrage"](p),
  "Tank Cannon": (p) => LR["Siege Maul"](p),
  "Sidearm"(p) {
    const g = new THREE.Group(); g.add(box(0.35, 0.22, 0.2, p));
    const b = barrel(0.05, 0.45, STEEL()); b.position.x = 0.15; g.add(b);
    return { group: g, muzzleX: 0.65 };
  },
  "Drone Carbine"(p) {
    const g = new THREE.Group(); g.add(box(0.5, 0.2, 0.22, p));
    for (const z of [-0.06, 0.06]) { const b = barrel(0.04, 0.7, DARK()); b.position.set(0.2, 0, z); g.add(b); }
    return { group: g, muzzleX: 0.95 };
  },
  "Demo Charge"() {
    const g = new THREE.Group();
    const keg = cyl(0.32, 0.32, 0.6, mat(0x7a2a1a, { roughness: 0.8 }), 12); keg.rotation.z = Math.PI / 2; g.add(keg);
    for (const x of [-0.2, 0.2]) g.add(at(cyl(0.34, 0.34, 0.06, BRASS(), 12), x, 0, 0, Math.PI / 2));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2010, emissiveIntensity: 2 }));
    lamp.position.set(0, 0.36, 0); g.add(lamp);
    return { group: g, muzzleX: 0.3, glow: lamp, blink: true };
  },
};
const MODULE_TOOLS = {
  repair() {
    const g = new THREE.Group(); g.add(box(0.3, 0.2, 0.2, STEEL()));
    const arm = barrel(0.05, 0.7, BRASS()); arm.position.x = 0.1; g.add(arm);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x66ccff, emissiveIntensity: 1.5 }));
    tip.rotation.z = -Math.PI / 2; tip.position.x = 0.9; g.add(tip);
    return { group: g, tip: 1.0, glow: tip };
  },
  coolant() {
    const g = new THREE.Group();
    const tank = cyl(0.2, 0.2, 0.6, mat(0x4a8aa8, { metalness: 0.6 }), 12); tank.rotation.z = Math.PI / 2; g.add(tank);
    const hose = barrel(0.05, 0.5, DARK()); hose.position.x = 0.3; g.add(hose);
    return { group: g, tip: 0.8 };
  },
  recon() {
    const g = new THREE.Group();
    const mast = cyl(0.03, 0.03, 0.9, STEEL()); mast.position.y = 0.45; g.add(mast);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(0xd8d2c0, { side: THREE.DoubleSide }));
    dish.rotation.z = -Math.PI / 2 - 0.4; dish.position.set(0.1, 0.9, 0); g.add(dish);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: 0xff3a1a, emissiveIntensity: 1.5 }));
    lens.position.set(0.3, 0.95, 0); g.add(lens);
    return { group: g, tip: 0.5, glow: lens };
  },
  none() { return { group: new THREE.Group(), tip: 0.4 }; },
};
export const UNIT_PAINT = { walker: 0x7d875c, drone: 0x8a6448 };

// Loose weapon models (the dev room): slot = longRange | melee | unit | tool.
export const WEAPON_MODELS = { longRange: Object.keys(LR), melee: Object.keys(MELEE), unit: Object.keys(UNIT_GUNS), tool: Object.keys(MODULE_TOOLS) };
export function weaponModel(slot, name, color = 0x888888) {
  const table = { longRange: LR, melee: MELEE, unit: UNIT_GUNS, tool: MODULE_TOOLS }[slot];
  return table?.[name]?.(mat(color)) ?? null;
}

// A brass activation coin with a stamped check, shared texture.
let spentTex = null;
function makeSpentToken() {
  if (!spentTex) spentTex = canvasTexture(128, (x) => {
    const g = x.createRadialGradient(64, 56, 10, 64, 64, 64);
    g.addColorStop(0, "#f6d27a"); g.addColorStop(1, "#8a6424");
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#5a3e12"; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = "#3a2708"; x.lineWidth = 14; x.lineCap = "round"; x.lineJoin = "round";
    x.beginPath(); x.moveTo(38, 66); x.lineTo(56, 84); x.lineTo(92, 44); x.stroke();
  });
  const face = new THREE.MeshStandardMaterial({ map: spentTex, color: spentTex ? 0xffffff : 0xd8a84a, metalness: 0.6, roughness: 0.35 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x9a7228, metalness: 0.8, roughness: 0.3 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 32), [rim, face, face]);
  coin.castShadow = true;
  return coin;
}

export class Mech {
  constructor({ id, name, owner, chassis, weightClass, longRange, melee, radius, kind = "rig", unit = null, modules = [], drone = null, template = null, skin = "factory" }) {
    this.id = id; this.name = name; this.owner = owner; this.weightClass = weightClass || "light";
    this.longRange = longRange; this.melee = melee; this.radius = radius || 1.2;
    this.kind = kind; this.drone = drone;
    const support = kind === "walker" || kind === "drone";
    const color = support ? UNIT_PAINT[kind] : PAINT[name] ?? 0x888888;
    this.paintColor = color; // debris torn off this mech keeps its paint
    const zebra = name === "Zebra" ? stripeTexture("#ecebe4", "#18181a") : null;
    let paint = zebra ? new THREE.MeshStandardMaterial({ map: zebra, roughness: 0.6, metalness: 0.3 }) : mat(color);
    const heavy = this.weightClass === "medium";
    this.root = new THREE.Group();
    this.root.userData.mechId = id;

    // Base: the physical mini's base, with the team ring.
    const base = cyl(this.radius, this.radius * 1.04, 0.14, DARK(), 32); base.position.y = 0.07; base.receiveShadow = true;
    this.root.add(base);
    this.ringMat = new THREE.MeshBasicMaterial({ color: TEAM[owner] ?? 0xffffff, transparent: true, opacity: 0.9 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(this.radius, 0.06, 6, 40), this.ringMat);
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.16; this.root.add(this.ring);
    // Facing notch so the front arc reads at a glance.
    const notch = cone(0.18, 0.4, this.ringMat, 3); notch.rotation.z = -Math.PI / 2; notch.position.set(this.radius + 0.1, 0.18, 0); this.root.add(notch);

    this.body = new THREE.Group(); this.root.add(this.body);
    this.baseScale = support ? (kind === "drone" ? 0.5 : 0.6) : heavy ? 0.52 : 0.48;

    // The body: this chassis' (or support unit's) own recipe of dieselpunk
    // parts, see scene/rig/. Own materials (not the shared cache): the cockpit
    // dims when the rig has acted, the stacks glow with heat. A drone's "cockpit"
    // is its red sensor eye.
    this.cockpitMat = new THREE.MeshStandardMaterial(kind === "drone"
      ? { color: 0xff4a2a, emissive: 0xff2010, emissiveIntensity: 1.4 }
      : { color: 0xffcf7a, emissive: 0xc06a18, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.15 });
    this.ventMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff3300, emissiveIntensity: 0, metalness: 0.7, roughness: 0.4 });
    this.template = template;
    this.recipe = support ? supportRecipeFor(kind, kind === "drone" ? drone : template) : recipeFor(name, this.weightClass);
    this.skin = SKINS[skin] ? skin : "factory";
    const mats = skinMaterials(this.skin, { color: this.recipe.paint ?? color, trim: this.recipe.trim, stripe: zebra });
    if (!support) paint = mats.paint;
    const built = buildRigBody({ cls: support ? kind : this.weightClass, recipe: this.recipe, mats, glass: this.cockpitMat, vent: this.ventMat, baseScale: this.baseScale });
    applySkin(built, this.skin, id);
    this.built = built;
    Object.assign(this, { legs: built.legs, pelvis: built.pelvis, hipH: built.hipH, torso: built.torso, chest: built.chest, armR: built.armR, armL: built.armL, stacks: built.stacks, sockets: built.sockets, spinners: built.spinners, flickers: built.flickers, whistle: built.whistle, bellows: built.bellows });
    this.body.add(this.pelvis);

    if (support) {
      // One flat-pick gun on the right arm (a sapper's charge rides its back),
      // the module tool (or nothing) on the left.
      const gun = (UNIT_GUNS[unit] || UNIT_GUNS.Sidearm)(mats.paint);
      this.lr = gun; gun.group.position.set(0.05, -0.05, -0.05);
      if (unit === "Demo Charge") { gun.group.position.set(-0.1, built.frame.top + 0.2, 0); gun.group.scale.setScalar(0.8); this.torso.add(gun.group); } else this.armR.add(gun.group);
      const tool = modules.includes("repair") ? "repair" : modules.includes("coolant") ? "coolant" : modules.includes("recon") ? "recon" : "none";
      this.me = MODULE_TOOLS[tool](); this.me.group.position.set(0.05, -0.05, 0.05); this.armL.add(this.me.group);
    } else {
      const lr = (LR[longRange] || LR["Autocannon"])(paint);
      this.lr = lr; lr.group.position.set(0.1, -0.1, lr.launcher ? 0 : -0.05);
      if (lr.lob) { lr.group.position.set(-0.2, 0.3, 0); }
      this.armR.add(lr.group);
      const me = (MELEE[melee] || MELEE["Claw"])(paint);
      this.me = me; me.group.position.set(0.1, -0.15, 0.05); this.armL.add(me.group);
    }

    // Sized like a real mini on its base: the whole model, weapons included,
    // stays roughly inside the base ring so move/reach rings read at true scale
    // (scene/rig/envelope.js holds every body to the original size).
    this.body.scale.setScalar(this.baseScale);

    // Selection halo + status label anchor.
    this.halo = new THREE.Mesh(new THREE.RingGeometry(this.radius * 1.15, this.radius * 1.35, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2; this.halo.position.y = 0.05; this.root.add(this.halo);
    this.labelAnchor = new THREE.Object3D(); this.labelAnchor.position.y = this.hipH * this.baseScale + (support ? 1.2 : 1.5); this.root.add(this.labelAnchor);

    // "Activated" token, like the marker you drop beside a mini on the table:
    // a brass coin stamped with a check, lying on the back of the base.
    this.token = makeSpentToken();
    if (support) this.token.scale.setScalar(0.7);
    this.token.position.set(-this.radius * 0.95, 0.9, this.radius * 0.95);
    this.token.visible = false;
    this.root.add(this.token);
    this.spent = false; this.spentT = 0;

    this.t = Math.random() * 10; this.walkPhase = 0; this.walking = 0; this.heatFrac = 0;
    this.recoil = 0; this.strike = 0; this.spinSpeed = 0; this.destroyed = false; this.hurt = 0;
    this.facing = 0; this.targetFacing = 0; this.aimYaw = 0;
  }

  setPose(pos, facingDeg) {
    this.root.position.set(pos.x, 0, pos.y);
    this.facing = this.targetFacing = facingDeg;
    this.root.rotation.y = -facingDeg * DEG;
  }
  setSelected(on, color = 0xffffff) { this.halo.material.opacity = on ? 0.85 : 0; this.halo.material.color.setHex(color); }
  // Acted this round: drop the token (with a little spin and bounce), dim the
  // cockpit and let the rig settle. Cleared when the round turns over.
  setSpent(on) {
    on = !!on && !this.destroyed;
    if (on === this.spent) return;
    this.spent = on; this.spentT = 0;
    if (on) this.token.visible = true;
    // Own copies of the body's materials, so greying this rig out leaves the
    // shared ones (and every other rig) alone. Done once, on first use.
    if (!this.greyable) {
      this.greyable = [];
      this.body.traverse((o) => {
        if (!o.isMesh || !o.material || o.material === this.cockpitMat || o.material === this.ventMat) return;
        o.material = o.material.clone();
        if (o.material.color) this.greyable.push({ m: o.material, base: o.material.color.clone() });
      });
      this.greyMix = 0;
    }
  }
  setHeat(frac) { this.heatFrac = Math.max(0, Math.min(1.6, frac)); }
  setHurt(frac) { this.hurt = frac; }

  // Broken parts show on the model: a torn-off gun arm hangs dead, broken legs
  // limp, a dead engine's stacks go cold and sputter, a gutted hull is scorched.
  // Idempotent: called with the full { hull, arms, legs, engine } broken map.
  setParts(broken = {}) {
    this.broken = broken;
    const char = (root, on) => root.traverse((o) => {
      if (!o.isMesh || !o.material?.color) return;
      if (on && !o.userData.clean) { o.userData.clean = o.material; o.material = o.material.clone(); o.material.color.multiplyScalar(0.3); }
      else if (!on && o.userData.clean) { o.material = o.userData.clean; o.userData.clean = null; }
    });
    char(this.armR, !!broken.arms);
    char(this.chest, !!broken.hull);
  }

  // Aim the torso at a world point (twists up to ±60°, the rest is the feet).
  aimAt(world) {
    if (!world) { this.aimYaw = 0; return; }
    const local = this.root.worldToLocal(world.clone());
    this.aimYaw = Math.max(-1, Math.min(1, Math.atan2(-local.z, local.x)));
  }

  muzzleWorld(slot) {
    const arm = slot === "melee" ? this.armL : this.armR;
    const w = slot === "melee" ? this.me : this.lr;
    const v = new THREE.Vector3((w.muzzleX ?? w.tip ?? 1) + 0.1, (w.muzzleY ?? 0), 0);
    return (slot === "melee" ? w.group : w.group).localToWorld(v.clone()) || arm.getWorldPosition(new THREE.Vector3());
  }

  fire(slot) {
    if (slot === "melee") this.strike = 1; else this.recoil = 1;
    const w = slot === "melee" ? this.me : this.lr;
    if (w.spin) this.spinSpeed = 40;
  }

  // Campaign: a gold crown floating over the enemy Commander / Warlord.
  setCrown(on) {
    if (!on) { if (this.crown) this.crown.visible = false; return; }
    if (!this.crown) {
      const gold = new THREE.MeshStandardMaterial({ color: 0xf0c05a, emissive: 0xb07818, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide });
      const ruby = new THREE.MeshStandardMaterial({ color: 0xff3a2a, emissive: 0xff2010, emissiveIntensity: 1.4 });
      const c = new THREE.Group();
      c.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.24, 20, 1, true), gold));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 4), gold); spike.position.set(Math.cos(a) * 0.4, 0.29, Math.sin(a) * 0.4); c.add(spike);
        const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), gold); pearl.position.set(Math.cos(a) * 0.4, 0.5, Math.sin(a) * 0.4); c.add(pearl);
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), ruby); gem.position.set(Math.cos(a + 0.63) * 0.42, 0, Math.sin(a + 0.63) * 0.42); c.add(gem);
      }
      c.scale.setScalar(1.5);
      this.crownY = this.labelAnchor.position.y - 0.1;
      c.position.y = this.crownY;
      this.root.add(c);
      this.crown = c;
    }
    this.crown.visible = true;
  }

  // Fade the whole model (extraction lift-off). Materials are cloned once so
  // the shared chassis paints stay opaque on every other mech.
  setOpacity(f) {
    if (!this.faded) {
      this.faded = true;
      this.root.traverse((o) => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.transparent = true; o.userData.baseOpacity = o.material.opacity; } });
    }
    this.root.traverse((o) => { if (o.isMesh && o.material) o.material.opacity = (o.userData.baseOpacity ?? 1) * f; });
  }

  destroy() {
    this.destroyed = true;
    this.setCrown(false);
    this.ringMat.color.setHex(0x444444);
    this.body.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.25); if (o.material.emissive) o.material.emissiveIntensity = 0; } });
  }

  update(dt) {
    this.t += dt;
    // Activated token: falls onto the base, spins flat, bounces once. Off: lifts and fades.
    this.spentT = Math.min(1, this.spentT + dt * 2.2);
    const k = this.spentT;
    if (this.spent) {
      const drop = k < 0.6 ? 1 - (k / 0.6) ** 2 : Math.abs(Math.sin((k - 0.6) / 0.4 * Math.PI)) * 0.12 * (1 - k);
      this.token.position.y = 0.2 + drop * 1.6;
      this.token.rotation.y = (1 - k) * 6;
      this.token.scale.setScalar(1);
    } else if (this.token.visible) {
      this.token.position.y = 0.2 + k * 1.2;
      this.token.scale.setScalar(Math.max(0.01, 1 - k));
      if (k >= 1) this.token.visible = false;
    }
    // Spent rigs go grey (the "already acted" look), fresh ones get their paint back.
    if (this.greyable && !this.destroyed) {
      const goal = this.spent ? 0.6 : 0;
      if (Math.abs(goal - this.greyMix) > 0.002) {
        this.greyMix += (goal - this.greyMix) * Math.min(1, dt * 3);
        for (const { m, base } of this.greyable) {
          const l = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
          m.color.setRGB(base.r + (l * 0.7 - base.r) * this.greyMix, base.g + (l * 0.7 - base.g) * this.greyMix, base.b + (l * 0.7 - base.b) * this.greyMix);
        }
      }
    }
    const idleDim = this.spent ? 0.12 : 0.9;
    this.cockpitMat.emissiveIntensity += (idleDim - this.cockpitMat.emissiveIntensity) * Math.min(1, dt * 3);
    const heavy = this.weightClass === "medium";
    // Walk cycle while moving, idle sway otherwise.
    if (this.walking > 0) this.walkPhase += dt * (heavy ? 6 : this.kind === "drone" ? 14 : this.kind === "walker" ? 5 : 9);
    const w = this.walking;
    this.legs.forEach((l, i) => {
      const ph = this.walkPhase + i * Math.PI;
      l.hip.rotation.z = l.rest.hip + Math.sin(ph) * 0.55 * w;
      l.knee.rotation.z = l.rest.knee + (l.bend ?? (heavy ? 1 : -1)) * Math.max(0, Math.cos(ph)) * 0.6 * w;
      flattenFoot(l);
    });
    // Idle life: flywheels and fans turn (faster when hot), pilot lights
    // flicker, bellows breathe, the whistle cap jumps when the rig fires.
    if (this.spinners) for (const sp of this.spinners) sp.o.rotation[sp.axis] += dt * sp.speed * (this.destroyed || this.broken?.engine ? 0 : 1 + this.heatFrac);
    if (this.flickers) for (const f of this.flickers) f.scale.setScalar(this.destroyed ? 0.01 : 0.8 + Math.sin(this.t * 23) * 0.15 + Math.sin(this.t * 37) * 0.1);
    if (this.bellows) this.bellows.scale.y = this.destroyed ? 0.8 : 1 + Math.sin(this.t * 2.2) * 0.12;
    if (this.whistle) this.whistle.position.y = 0.33 + this.recoil * 0.08;
    this.pelvis.position.y = this.hipH + Math.abs(Math.sin(this.walkPhase)) * 0.12 * w + Math.sin(this.t * 1.7) * 0.03;
    this.pelvis.rotation.x = Math.sin(this.walkPhase) * 0.06 * w;
    // Torso twist toward the aim, recoil kick, melee lunge.
    this.torso.rotation.y += ((this.aimYaw) - this.torso.rotation.y) * Math.min(1, dt * 6);
    this.recoil = Math.max(0, this.recoil - dt * 3.5);
    this.strike = Math.max(0, this.strike - dt * 2.2);
    const b = this.broken || {};
    this.armR.position.x = -this.recoil * 0.35;
    this.armR.rotation.z = b.arms ? -1.25 + Math.sin(this.t * 3) * 0.05 : this.recoil * 0.25;
    const s = Math.sin((1 - this.strike) * Math.PI);
    this.armL.position.x = s * 0.9 * (this.strike > 0 ? 1 : 0);
    this.armL.rotation.y = -s * 0.5;
    if (this.me.swing) this.me.swing.position.x = 0.3 + s * 1.2;
    if (this.me.ram) this.me.ram.position.x = 0.55 + s * 0.7;
    for (const w of [this.lr, this.me]) if (w.glow) w.glow.material.emissiveIntensity = w.blink ? (Math.sin(this.t * 9) > 0 ? 2.5 : 0.2) : 1 + Math.sin(this.t * 7 + (w === this.me ? 1.3 : 0)) * 0.5 + Math.max(this.recoil, this.strike) * 3;
    if (this.me.jaws) { this.me.jaws[0].rotation.z = -0.3 + s * 0.3; this.me.jaws[1].rotation.z = 0.3 - s * 0.3; }
    this.spinSpeed = Math.max(this.me.spin && this.strike > 0 ? 30 : 0, this.spinSpeed - dt * 30);
    if (this.lr.spin) this.lr.spin.rotation.x += this.spinSpeed * dt * (this.recoil > 0 ? 1 : 0.1);
    if (this.me.spin) this.me.spin.rotation.z += (this.strike > 0 ? 30 : 2) * dt;
    // Heat glow on the stacks; over capacity it pulses.
    const over = this.heatFrac > 1;
    this.ventMat.emissiveIntensity = b.engine ? (Math.sin(this.t * 13) > 0.85 ? 0.6 : 0) : this.heatFrac * 1.8 + (over ? Math.sin(this.t * 10) * 0.8 + 0.8 : 0);
    // Damage lean.
    if (this.destroyed) {
      this.body.rotation.z += (-0.5 - this.body.rotation.z) * Math.min(1, dt * 2);
      this.body.position.y += (-0.6 - this.body.position.y) * Math.min(1, dt * 2);
    } else {
      this.body.position.y += ((this.spent ? -0.12 : 0) - this.body.position.y) * Math.min(1, dt * 3);
      this.body.rotation.x = Math.sin(this.t * 0.9) * 0.02 + (this.spent ? 0.1 : 0) + this.hurt * 0.08 + (b.legs ? 0.12 + Math.abs(Math.sin(this.walkPhase)) * 0.12 * this.walking : 0);
    }
    // Turn toward targetFacing smoothly.
    let d = ((this.targetFacing - this.facing + 540) % 360) - 180;
    this.facing += d * Math.min(1, dt * 8);
    this.root.rotation.y = -this.facing * DEG;
    this.halo.rotation.z += dt * 0.8;
    if (this.crown?.visible) { this.crown.rotation.y = this.t * 1.1; this.crown.position.y = this.crownY + Math.sin(this.t * 2) * 0.12; }
  }
}
