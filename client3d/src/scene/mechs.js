// Procedural mech models. Every chassis gets its own paint (the codenames ARE
// colours, Gold, Pumpkin, Zebra…), its weight class sets the frame (lights
// stalk on reverse-jointed legs, mediums plant on stocky pillars), and each of
// the 22 weapons has its own model hung off the arms. Built from primitives at
// runtime: no asset pipeline, and every part is a named pivot we can animate.
import * as THREE from "three";

const DEG = Math.PI / 180;

export const PAINT = {
  Gold: 0xd4a017, Blue: 0x2f6fd6, Purple: 0x7b3fb8, Pumpkin: 0xe8731c, Zebra: 0xe9e6dc,
  Turquoise: 0x1fb5a8, Green: 0x3f9a3a, Copper: 0xb8703a, Black: 0x2a2a30, Red: 0xc0282d, Silver: 0xb9c0c8,
};
export const TEAM = { a: 0x5fd3c0, b: 0xe0533d };

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45, ...opts }));
  return matCache.get(key);
}
const STEEL = () => mat(0x4a4d55, { metalness: 0.8, roughness: 0.35 });
const DARK = () => mat(0x1b1c20, { metalness: 0.6, roughness: 0.6 });
const BRASS = () => mat(0xb08d3c, { metalness: 0.9, roughness: 0.3 });

function stripeTexture(base, stripe) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  g.fillStyle = stripe;
  for (let i = -64; i < 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 7, 0); g.lineTo(i + 7 - 40, 64); g.lineTo(i - 40, 64); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Place a mesh (three's position/rotation are read-only props, copy into them).
function at(o, x, y, z, rz = 0) { o.position.set(x, y, z); if (rz) o.rotation.z = rz; return o; }
function box(w, h, d, m) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = o.receiveShadow = true; return o; }
function cyl(rt, rb, h, m, seg = 12) { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.castShadow = true; return o; }
function sph(r, m, seg = 12) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m); o.castShadow = true; return o; }
function cone(r, h, m, seg = 10) { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); o.castShadow = true; return o; }
// A barrel pointing along +x.
function barrel(r, len, m) { const o = cyl(r, r, len, m); o.rotation.z = -Math.PI / 2; o.position.x = len / 2; return o; }

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
};

// A leg: hip pivot → thigh → knee pivot → shin → foot. Lights are digitigrade
// (knee bends backwards), mediums are stocky pillars with wide feet.
function makeLeg(cls, paint) {
  const hip = new THREE.Group();
  const heavy = cls === "medium";
  const thighLen = heavy ? 1.0 : 1.1;
  const shinLen = heavy ? 1.0 : 1.2;
  const thigh = box(heavy ? 0.42 : 0.28, thighLen, heavy ? 0.46 : 0.3, paint);
  thigh.position.y = -thighLen / 2; hip.add(thigh);
  const knee = new THREE.Group(); knee.position.y = -thighLen; hip.add(knee);
  knee.add(sph(heavy ? 0.26 : 0.18, STEEL()));
  const shin = box(heavy ? 0.36 : 0.22, shinLen, heavy ? 0.4 : 0.24, DARK());
  shin.position.y = -shinLen / 2; knee.add(shin);
  const foot = box(heavy ? 0.9 : 0.75, 0.18, heavy ? 0.7 : 0.35, STEEL());
  foot.position.set(0.12, -shinLen, 0); knee.add(foot);
  // Rest pose: lights bend the knee back.
  if (!heavy) { hip.rotation.z = 0.35; knee.rotation.z = -0.7; }
  return { hip, knee, foot, rest: { hip: hip.rotation.z, knee: knee.rotation.z }, height: thighLen + shinLen };
}

export class Mech {
  constructor({ id, name, owner, chassis, weightClass, longRange, melee, radius }) {
    this.id = id; this.name = name; this.owner = owner; this.weightClass = weightClass || "light";
    this.longRange = longRange; this.melee = melee; this.radius = radius || 1.2;
    const color = PAINT[name] ?? 0x888888;
    const paint = name === "Zebra"
      ? new THREE.MeshStandardMaterial({ map: stripeTexture("#ecebe4", "#18181a"), roughness: 0.6, metalness: 0.3 })
      : mat(color);
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
    this.legs = [makeLeg(this.weightClass, paint), makeLeg(this.weightClass, paint)];
    const hipH = this.legs[0].height * (heavy ? 1 : 0.85) + 0.3;
    this.hipH = hipH;
    this.pelvis = new THREE.Group(); this.pelvis.position.y = hipH; this.body.add(this.pelvis);
    this.legs.forEach((l, i) => { l.hip.position.z = (i ? -1 : 1) * (heavy ? 0.5 : 0.35); this.pelvis.add(l.hip); });
    this.pelvis.add(box(heavy ? 0.8 : 0.6, 0.3, heavy ? 1.1 : 0.8, DARK()));

    this.torso = new THREE.Group(); this.torso.position.y = heavy ? 0.75 : 0.6; this.pelvis.add(this.torso);
    const chest = box(heavy ? 1.5 : 1.1, heavy ? 1.1 : 0.85, heavy ? 1.5 : 1.1, paint); this.torso.add(chest);
    const cockpit = box(0.5, 0.35, heavy ? 0.8 : 0.6, mat(0xffcf7a, { emissive: 0xc06a18, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.15 }));
    cockpit.position.set(heavy ? 0.6 : 0.45, 0.15, 0); this.torso.add(cockpit);
    if (heavy) this.torso.add(at(box(1.2, 0.2, 1.7, STEEL()), -0.1, 0.62, 0));
    // Exhaust stacks, they glow and smoke with heat.
    this.ventMat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff3300, emissiveIntensity: 0, metalness: 0.7, roughness: 0.4 });
    this.stacks = [];
    for (const z of [-0.3, 0.3]) {
      const s = cyl(0.11, 0.13, 0.9, this.ventMat); s.position.set(heavy ? -0.75 : -0.55, 0.7, z); this.torso.add(s); this.stacks.push(s);
    }

    // Arms: right = long-range, left = melee.
    const shoulderZ = heavy ? 0.95 : 0.72;
    this.armR = new THREE.Group(); this.armR.position.set(0, 0.15, -shoulderZ); this.torso.add(this.armR);
    this.armL = new THREE.Group(); this.armL.position.set(0, 0.15, shoulderZ); this.torso.add(this.armL);
    this.armR.add(sph(heavy ? 0.32 : 0.24, STEEL())); this.armL.add(sph(heavy ? 0.32 : 0.24, STEEL()));
    const lr = (LR[longRange] || LR["Autocannon"])(paint);
    this.lr = lr; lr.group.position.set(0.1, -0.1, lr.launcher ? 0 : -0.05);
    if (lr.lob) { lr.group.position.set(-0.2, 0.3, 0); }
    this.armR.add(lr.group);
    const me = (MELEE[melee] || MELEE["Claw"])(paint);
    this.me = me; me.group.position.set(0.1, -0.15, 0.05); this.armL.add(me.group);

    // Sized like a real mini on its base: the whole model, weapons included,
    // stays roughly inside the base ring so move/reach rings read at true scale.
    this.baseScale = heavy ? 0.52 : 0.48;
    this.body.scale.setScalar(this.baseScale);

    // Selection halo + status label anchor.
    this.halo = new THREE.Mesh(new THREE.RingGeometry(this.radius * 1.15, this.radius * 1.35, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2; this.halo.position.y = 0.05; this.root.add(this.halo);
    this.labelAnchor = new THREE.Object3D(); this.labelAnchor.position.y = hipH * this.baseScale + 1.5; this.root.add(this.labelAnchor);

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
  setHeat(frac) { this.heatFrac = Math.max(0, Math.min(1.6, frac)); }
  setHurt(frac) { this.hurt = frac; }

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

  destroy() {
    this.destroyed = true;
    this.ringMat.color.setHex(0x444444);
    this.body.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.multiplyScalar(0.25); if (o.material.emissive) o.material.emissiveIntensity = 0; } });
  }

  update(dt) {
    this.t += dt;
    const heavy = this.weightClass === "medium";
    // Walk cycle while moving, idle sway otherwise.
    if (this.walking > 0) this.walkPhase += dt * (heavy ? 6 : 9);
    const w = this.walking;
    this.legs.forEach((l, i) => {
      const ph = this.walkPhase + i * Math.PI;
      l.hip.rotation.z = l.rest.hip + Math.sin(ph) * 0.55 * w;
      l.knee.rotation.z = l.rest.knee + (heavy ? 1 : -1) * Math.max(0, Math.cos(ph)) * 0.6 * w;
    });
    this.pelvis.position.y = this.hipH + Math.abs(Math.sin(this.walkPhase)) * 0.12 * w + Math.sin(this.t * 1.7) * 0.03;
    this.pelvis.rotation.x = Math.sin(this.walkPhase) * 0.06 * w;
    // Torso twist toward the aim, recoil kick, melee lunge.
    this.torso.rotation.y += ((this.aimYaw) - this.torso.rotation.y) * Math.min(1, dt * 6);
    this.recoil = Math.max(0, this.recoil - dt * 3.5);
    this.strike = Math.max(0, this.strike - dt * 2.2);
    this.armR.position.x = -this.recoil * 0.35;
    this.armR.rotation.z = this.recoil * 0.25;
    const s = Math.sin((1 - this.strike) * Math.PI);
    this.armL.position.x = s * 0.9 * (this.strike > 0 ? 1 : 0);
    this.armL.rotation.y = -s * 0.5;
    if (this.me.swing) this.me.swing.position.x = 0.3 + s * 1.2;
    if (this.me.jaws) { this.me.jaws[0].rotation.z = -0.3 + s * 0.3; this.me.jaws[1].rotation.z = 0.3 - s * 0.3; }
    this.spinSpeed = Math.max(this.me.spin && this.strike > 0 ? 30 : 0, this.spinSpeed - dt * 30);
    if (this.lr.spin) this.lr.spin.rotation.x += this.spinSpeed * dt * (this.recoil > 0 ? 1 : 0.1);
    if (this.me.spin) this.me.spin.rotation.z += (this.strike > 0 ? 30 : 2) * dt;
    // Heat glow on the stacks; over capacity it pulses.
    const over = this.heatFrac > 1;
    this.ventMat.emissiveIntensity = this.heatFrac * 1.8 + (over ? Math.sin(this.t * 10) * 0.8 + 0.8 : 0);
    // Damage lean.
    if (this.destroyed) {
      this.body.rotation.z += (-0.5 - this.body.rotation.z) * Math.min(1, dt * 2);
      this.body.position.y += (-0.6 - this.body.position.y) * Math.min(1, dt * 2);
    } else {
      this.body.rotation.x = Math.sin(this.t * 0.9) * 0.02 + this.hurt * 0.08;
    }
    // Turn toward targetFacing smoothly.
    let d = ((this.targetFacing - this.facing + 540) % 360) - 180;
    this.facing += d * Math.min(1, dt * 8);
    this.root.rotation.y = -this.facing * DEG;
    this.halo.rotation.z += dt * 0.8;
  }
}
