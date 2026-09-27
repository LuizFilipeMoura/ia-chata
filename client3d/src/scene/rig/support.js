// Support units: one body per walker template and per drone type, built by
// the same body builder as the rigs (same contract, same skins). Walkers are
// crewed pods on long stilts; drones are small scuttling machines.
import { THREE, at, rot, box, cyl, sph, cone, torus, drumX, drumZ, rivetRing, GLOW, mat } from "./kit.js";

function stack(ctx, parent, x, y, z, r, h) {
  const s = cyl(r, r * 1.15, h, ctx.vent, 10); at(s, x, y + h / 2, z);
  parent.add(s); ctx.stacks.push(s);
  parent.add(at(cyl(r * 1.35, r * 1.2, h * 0.12, ctx.trim, 10), x, y + h, z));
  return s;
}
// The crew porthole / sensor eye, facing +x.
function eye(ctx, parent, x, y, z, r) {
  const e = sph(r, ctx.glass, 12); e.position.set(x, y, z); parent.add(e);
  parent.add(at(rot(torus(r * 1.05, r * 0.2, ctx.trim, Math.PI * 2, 14), 0, Math.PI / 2, 0), x - r * 0.3, y, z));
}
function prism(profile, depth, m) {
  const s = new THREE.Shape();
  profile.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2);
  const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o;
}

// ---- Pods (torsos): build into ctx.torso, return { chest, top, front, back, halfW } ----
export const SUPPORT_TORSOS = {
  // Radiator Walker: a finned heat-sink barrel.
  radiatorPod(ctx) {
    const chest = new THREE.Group();
    chest.add(drumX(0.5, 1.0, ctx.paint, 16));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const f = box(0.7, 0.14, 0.03, ctx.steel); f.position.set(-0.05, Math.cos(a) * 0.55, Math.sin(a) * 0.55); f.rotation.x = -a; chest.add(f); }
    for (const x of [-0.45, 0.4]) chest.add(at(drumX(0.53, 0.06, ctx.trim, 16), x, 0, 0));
    eye(ctx, chest, 0.5, 0.05, 0, 0.18);
    stack(ctx, chest, -0.3, 0.45, -0.18, 0.07, 0.45); stack(ctx, chest, -0.3, 0.45, 0.18, 0.07, 0.45);
    ctx.torso.add(chest);
    return { chest, top: 0.62, front: 0.52, back: -0.5, halfW: 0.58 };
  },
  // Field Welder: a cart pod with gas bottles strapped behind and an arc hood.
  welderPod(ctx) {
    const chest = new THREE.Group();
    chest.add(box(0.8, 0.7, 0.8, ctx.paint));
    chest.add(at(box(0.82, 0.08, 0.82, ctx.trim), 0, 0.35, 0));
    const hood = box(0.1, 0.34, 0.6, ctx.dark); hood.position.set(0.42, 0.08, 0); hood.rotation.z = 0.15; chest.add(hood);
    chest.add(at(box(0.04, 0.08, 0.44, GLOW(0x9fe8ff, 0x66ccff, 1.4)), 0.48, 0.12, 0));
    eye(ctx, chest, 0.42, -0.18, 0.24, 0.1);
    const ox = mat(0x2f6a3a, { roughness: 0.5, metalness: 0.5 }), ac = mat(0x6a2a2a, { roughness: 0.5, metalness: 0.5 });
    for (const [z, m] of [[-0.2, ox], [0.2, ac]]) {
      chest.add(at(cyl(0.13, 0.13, 0.8, m, 12), -0.52, 0.05, z));
      chest.add(at(sph(0.13, m, 10), -0.52, 0.45, z));
      chest.add(at(cyl(0.04, 0.04, 0.1, ctx.trim, 8), -0.52, 0.6, z));
    }
    chest.add(at(box(0.04, 0.05, 0.62, ctx.dark), -0.52, 0.2, 0));
    stack(ctx, chest, -0.15, 0.39, 0.3, 0.06, 0.35);
    ctx.torso.add(chest);
    return { chest, top: 0.4, front: 0.47, back: -0.66, halfW: 0.41 };
  },
  // Medic Walker: an ambulance cab with a red cross, stretcher rack and beacon.
  medicPod(ctx) {
    const chest = new THREE.Group();
    chest.add(box(0.95, 0.72, 0.8, ctx.paint));
    chest.add(at(box(0.9, 0.1, 0.76, ctx.paint), 0, 0.4, 0));
    const red = mat(0xc0282d, { roughness: 0.5, metalness: 0.2 }), white = mat(0xf0ece0, { roughness: 0.5 });
    for (const s of [-1, 1]) {
      chest.add(at(box(0.36, 0.36, 0.01, white), -0.05, 0.02, s * 0.405));
      chest.add(at(box(0.26, 0.08, 0.02, red), -0.05, 0.02, s * 0.41));
      chest.add(at(box(0.08, 0.26, 0.02, red), -0.05, 0.02, s * 0.41));
    }
    chest.add(at(box(0.04, 0.2, 0.6, ctx.glass), 0.48, 0.12, 0));
    // Stretcher rack along the left flank.
    const rack = new THREE.Group(); rack.position.set(-0.05, -0.3, 0.46);
    rack.add(at(box(0.9, 0.03, 0.03, ctx.trim), 0, 0, 0)); rack.add(at(box(0.9, 0.03, 0.03, ctx.trim), 0, 0.12, 0.06));
    rack.add(at(box(0.8, 0.02, 0.1, mat(0x8a8060, { roughness: 1 })), 0, 0.06, 0.03));
    chest.add(rack);
    // Rotating beacon.
    chest.add(at(cyl(0.08, 0.1, 0.06, ctx.trim, 10), 0.1, 0.48, 0));
    const beacon = sph(0.07, GLOW(0xff4a3a, 0xff2010, 1.6), 10); beacon.position.set(0.1, 0.55, 0); chest.add(beacon); ctx.flickers.push(beacon);
    stack(ctx, chest, -0.38, 0.45, -0.25, 0.05, 0.3);
    ctx.torso.add(chest);
    return { chest, top: 0.45, front: 0.49, back: -0.48, halfW: 0.41 };
  },
  // Rocket Walker: a boxy pod carrying a reload rack of rockets on rails.
  rocketPod(ctx) {
    const chest = new THREE.Group();
    chest.add(box(0.85, 0.6, 0.8, ctx.paint));
    chest.add(at(box(0.08, 0.2, 0.5, ctx.glass), 0.43, 0.05, 0));
    const rack = new THREE.Group(); rack.position.set(-0.1, 0.36, 0); rack.rotation.z = 0.28;
    for (const z of [-0.24, -0.08, 0.08, 0.24]) {
      rack.add(at(box(0.8, 0.03, 0.05, ctx.steel), 0, 0, z));
      rack.add(at(rot(cyl(0.05, 0.05, 0.5, ctx.trim, 8), 0, 0, Math.PI / 2), 0.05, 0.07, z));
      rack.add(at(rot(cone(0.05, 0.12, mat(0xc0282d, { roughness: 0.5 }), 8), 0, 0, -Math.PI / 2), 0.36, 0.07, z));
    }
    chest.add(rack);
    stack(ctx, chest, -0.35, 0.3, 0.3, 0.06, 0.35);
    ctx.torso.add(chest);
    return { chest, top: 0.62, front: 0.47, back: -0.43, halfW: 0.4 };
  },
  // Gun Walker: an armoured ball turret with a riveted collar.
  ballTurret(ctx) {
    const chest = new THREE.Group();
    chest.add(sph(0.52, ctx.paint, 18));
    chest.add(at(cyl(0.55, 0.55, 0.1, ctx.trim, 18), 0, -0.12, 0));
    rivetRing(chest, 0.54, 14, "y", ctx.dark, 0.03, -0.06);
    chest.add(at(box(0.08, 0.06, 0.4, ctx.glass), 0.49, 0.14, 0));
    for (const s of [-1, 1]) chest.add(at(rot(box(0.5, 0.5, 0.05, ctx.paint), 0, s * 0.3, 0), 0, 0.05, s * 0.5));
    stack(ctx, chest, -0.35, 0.3, 0, 0.07, 0.4);
    ctx.torso.add(chest);
    return { chest, top: 0.55, front: 0.53, back: -0.52, halfW: 0.52 };
  },
  // Hunter drone: a low armoured wedge with a red eye slit.
  hunterBody(ctx) {
    const chest = new THREE.Group();
    chest.add(prism([[-0.5, -0.22], [0.55, -0.22], [0.55, -0.05], [-0.1, 0.26], [-0.5, 0.2]], 0.7, ctx.paint));
    chest.add(at(box(0.04, 0.05, 0.4, ctx.glass), 0.45, 0.0, 0));
    chest.add(at(cyl(0.012, 0.012, 0.4, ctx.steel, 6), -0.35, 0.4, 0.2));
    chest.add(at(sph(0.03, GLOW(0xff4a2a, 0xff2010, 1.5), 6), -0.35, 0.6, 0.2));
    stack(ctx, chest, -0.4, 0.15, -0.18, 0.05, 0.22);
    ctx.torso.add(chest);
    return { chest, top: 0.26, front: 0.55, back: -0.5, halfW: 0.35 };
  },
  // Sapper drone: a squat hazard-striped charge barrel.
  sapperBody(ctx) {
    const chest = new THREE.Group();
    chest.add(drumX(0.34, 0.8, ctx.paint, 14));
    const yel = mat(0xe0b020, { roughness: 0.6 }), blk = mat(0x141414, { roughness: 0.6 });
    for (let i = 0; i < 5; i++) chest.add(at(drumX(0.35, 0.08, i % 2 ? blk : yel, 14), -0.3 + i * 0.15, 0, 0));
    eye(ctx, chest, 0.42, 0.08, 0, 0.1);
    stack(ctx, chest, -0.2, 0.3, 0.12, 0.05, 0.2);
    ctx.torso.add(chest);
    return { chest, top: 0.34, front: 0.42, back: -0.4, halfW: 0.35 };
  },
  // Spotter drone: a small body under a mast carrying a big sensor eye.
  spotterBody(ctx) {
    const chest = new THREE.Group();
    const b = sph(0.36, ctx.paint, 14); b.scale.set(1.2, 0.6, 0.9); chest.add(b);
    chest.add(at(cyl(0.035, 0.04, 0.34, ctx.steel, 8), -0.05, 0.3, 0));
    const head = new THREE.Group(); head.position.set(-0.05, 0.5, 0);
    head.add(drumX(0.14, 0.24, ctx.dark, 12));
    head.add(at(rot(cyl(0.12, 0.12, 0.02, ctx.glass, 12), 0, 0, Math.PI / 2), 0.13, 0, 0));
    head.add(at(rot(torus(0.13, 0.02, ctx.trim, Math.PI * 2, 12), 0, Math.PI / 2, 0), 0.13, 0, 0));
    chest.add(head);
    stack(ctx, chest, -0.35, 0.1, 0, 0.04, 0.2);
    ctx.torso.add(chest);
    return { chest, top: 0.25, front: 0.43, back: -0.43, halfW: 0.33 };
  },
};

// ---- Legs: same shape as the rig legs ((ctx, foot) => leg) ----
function legFrame(thighLen, shinLen, thighMesh, shinMesh, foot) {
  const hip = new THREE.Group();
  thighMesh.position.y = -thighLen / 2; hip.add(thighMesh);
  const knee = new THREE.Group(); knee.position.y = -thighLen; hip.add(knee);
  shinMesh.position.y = -shinLen / 2; knee.add(shinMesh);
  const ankle = new THREE.Group(); ankle.position.y = -shinLen; knee.add(ankle);
  foot.group.position.y = -foot.lift; ankle.add(foot.group);
  return { hip, knee, ankle, thighLen, shinLen };
}
export const SUPPORT_LEGS = {
  // Long spindly reverse-jointed stilts (the classic walker).
  stilt(ctx, foot) {
    const T = 1.3, S = 1.4;
    const L = legFrame(T, S, box(0.16, T, 0.18, ctx.paint), box(0.12, S, 0.14, ctx.dark), foot);
    L.knee.add(sph(0.14, ctx.steel, 10));
    L.hip.add(at(cyl(0.03, 0.03, T * 0.8, ctx.trim, 6), 0.12, -T * 0.45, 0));
    return { ...L, rest: { hip: 0.35, knee: -0.7 }, bend: -1 };
  },
  // Straight telescoping stilts with visible sleeves.
  telescope(ctx, foot) {
    const T = 1.25, S = 1.45;
    const thigh = new THREE.Group(); thigh.add(cyl(0.1, 0.1, T, ctx.paint, 10)); thigh.add(at(cyl(0.12, 0.12, 0.12, ctx.trim, 10), 0, -T * 0.4, 0));
    const shin = new THREE.Group(); shin.add(cyl(0.07, 0.07, S, ctx.steel, 10)); shin.add(at(cyl(0.09, 0.09, 0.3, ctx.dark, 10), 0, S * 0.35, 0));
    const L = legFrame(T, S, thigh, shin, foot);
    L.knee.add(sph(0.12, ctx.dark, 10));
    return { ...L, rest: { hip: 0.12, knee: -0.25 }, bend: -1 };
  },
  // Ostrich legs: knee well back, long shin.
  ostrich(ctx, foot) {
    const T = 1.15, S = 1.6;
    const L = legFrame(T, S, box(0.2, T, 0.2, ctx.paint), box(0.1, S, 0.12, ctx.dark), foot);
    L.knee.add(sph(0.15, ctx.steel, 10));
    L.knee.add(at(cyl(0.025, 0.025, S * 0.7, ctx.trim, 6), -0.1, -S * 0.4, 0));
    return { ...L, rest: { hip: -0.45, knee: 0.9 }, bend: 1 };
  },
  // Drones: short beetle legs.
  beetle(ctx, foot) {
    const T = 0.6, S = 0.7;
    const L = legFrame(T, S, box(0.14, T, 0.14, ctx.paint), box(0.1, S, 0.1, ctx.dark), foot);
    L.knee.add(sph(0.1, ctx.steel, 8));
    return { ...L, rest: { hip: 0.5, knee: -1.0 }, bend: -1, splay: 0.35 };
  },
  crab(ctx, foot) {
    const T = 0.55, S = 0.6;
    const L = legFrame(T, S, box(0.18, T, 0.16, ctx.paint), box(0.14, S, 0.14, ctx.dark), foot);
    L.knee.add(sph(0.11, ctx.steel, 8));
    return { ...L, rest: { hip: -0.3, knee: 0.6 }, bend: 1, splay: 0.45 };
  },
  spider(ctx, foot) {
    const T = 0.62, S = 0.72;
    const L = legFrame(T, S, cyl(0.04, 0.05, T, ctx.paint, 8), cyl(0.03, 0.035, S, ctx.dark, 8), foot);
    L.knee.add(sph(0.07, ctx.steel, 8));
    return { ...L, rest: { hip: 0.6, knee: -1.3 }, bend: -1, splay: 0.25 };
  },
};

export const SUPPORT_FEET = {
  pad(ctx) {
    const g = new THREE.Group();
    g.add(at(cyl(0.18, 0.2, 0.08, ctx.steel, 12), 0.03, 0.04, 0));
    g.add(at(sph(0.07, ctx.dark, 8), 0, 0.1, 0));
    return { group: g, lift: 0.1 };
  },
  hook(ctx) {
    const g = new THREE.Group();
    const c = cone(0.06, 0.2, ctx.steel, 6); c.rotation.z = -Math.PI / 2 - 0.6; c.position.set(0.08, 0.05, 0); g.add(c);
    g.add(at(sph(0.05, ctx.dark, 8), 0, 0.08, 0));
    return { group: g, lift: 0.08 };
  },
};

export const SUPPORT_SHOULDERS = {
  ball(ctx, arm) { arm.add(sph(0.16, ctx.steel, 10)); },
  mount(ctx, arm, s) { arm.add(sph(0.14, ctx.dark, 10)); arm.add(at(drumZ(0.16, 0.05, ctx.trim, 12), 0, 0, s * 0.06)); },
};

// Support recipes: walkers by template id, drones by drone type.
export const SUPPORT_RECIPES = {
  walker: {
    "radiator-walker": { torso: "radiatorPod", legs: "stilt", feet: "pad", shoulders: "mount", trim: "brass" },
    "field-welder": { torso: "welderPod", legs: "telescope", feet: "pad", shoulders: "ball", trim: "steel" },
    "medic-walker": { torso: "medicPod", legs: "telescope", feet: "hook", shoulders: "ball", trim: "steel", paint: 0xd8d0b8 },
    "rocket-walker": { torso: "rocketPod", legs: "ostrich", feet: "pad", shoulders: "mount", trim: "gunmetal" },
    "gun-walker": { torso: "ballTurret", legs: "stilt", feet: "hook", shoulders: "mount", trim: "gunmetal" },
  },
  drone: {
    hunter: { torso: "hunterBody", legs: "beetle", feet: "hook", shoulders: "ball", trim: "gunmetal" },
    sapper: { torso: "sapperBody", legs: "crab", feet: "pad", shoulders: "ball", trim: "steel" },
    spotter: { torso: "spotterBody", legs: "spider", feet: "hook", shoulders: "mount", trim: "brass" },
  },
};
const SUPPORT_FALLBACK = { walker: SUPPORT_RECIPES.walker["gun-walker"], drone: SUPPORT_RECIPES.drone.hunter };
export function supportRecipeFor(kind, id) {
  const r = SUPPORT_RECIPES[kind]?.[id] ?? SUPPORT_FALLBACK[kind];
  return { head: "none", backpack: null, signature: null, proportions: {}, ...r };
}
