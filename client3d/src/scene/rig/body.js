// Assembles a rig body from its recipe. Returns the same handles the Mech's
// animation always used (pelvis, legs, torso, chest, arms, stacks...) plus the
// sockets skins bolt their add-ons to.
import { THREE, box, BRASS, STEEL, DARK, GUNMETAL, RUBBER } from "./kit.js";
import { TORSOS, HEADS, BACKPACKS, LEGS, FEET, SHOULDERS, SIGNATURES } from "./parts.js";

// Per-class frame. dims is the torso box (x depth, y height, z width).
export const CLASS_FRAME = {
  light: { dims: { d: 0.8, h: 0.85, w: 1.0 }, k: 1, shoulderZ: 0.68, armY: 0.15, torsoLift: 0.58, stance: 0.33, pelvis: [0.55, 0.28, 0.72], backY: 0.05 },
  medium: { dims: { d: 1.05, h: 1.05, w: 1.35 }, k: 1.3, shoulderZ: 0.92, armY: 0.18, torsoLift: 0.72, stance: 0.48, pelvis: [0.75, 0.3, 1.0], backY: 0.05 },
};
// Top of the base disc (root units): feet stand on it.
export const BASE_TOP = 0.14;
const TRIMS = { brass: BRASS, steel: STEEL, gunmetal: GUNMETAL };

// Rest-pose drop from the hip pivot to the lowest point of the leg.
function legDrop(leg) {
  const holder = new THREE.Group(); holder.add(leg.hip);
  holder.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(leg.hip);
  holder.remove(leg.hip);
  return -b.min.y;
}

// Tag every not-yet-tagged mesh under root with the part it belongs to (the
// Dev Room isolates parts by this; skins tag their add-ons "skin").
export function tagPart(root, part) {
  root.traverse((o) => { if (o.isMesh && !o.userData.part) o.userData.part = part; });
}

export function flattenFoot(leg) {
  if (!leg.ankle) return;
  leg.ankle.rotation.z = -(leg.hip.rotation.z + leg.knee.rotation.z);
  leg.ankle.rotation.x = -(leg.hip.rotation.x + leg.knee.rotation.x);
}

// mats: { paint, trim?, dark?, steel?, brass?, rubber? } (skins supply these).
export function buildRigBody({ cls = "light", recipe, mats, glass, vent, baseScale = 0.5 }) {
  const F = CLASS_FRAME[cls] ?? CLASS_FRAME.light;
  const P = recipe.proportions || {};
  const [sx, sy, sz] = P.torso || [1, 1, 1];
  const ctx = {
    cls, heavy: cls === "medium", k: F.k,
    paint: mats.paint, trim: mats.trim ?? (TRIMS[recipe.trim] || STEEL)(), dark: mats.dark ?? DARK(), steel: mats.steel ?? STEEL(),
    brass: mats.brass ?? BRASS(), rubber: mats.rubber ?? RUBBER(),
    glass, vent,
    dims: { d: F.dims.d * sx, h: F.dims.h * sy, w: F.dims.w * sz },
    stacks: [], spinners: [], flickers: [], glows: [], sockets: {},
    needsCockpit: recipe.head === "none",
  };

  // Legs first: their rest-pose drop sets the hip height so feet stand on the base.
  const pelvis = new THREE.Group(); ctx.pelvis = pelvis;
  const legs = [1, -1].map((side) => {
    const foot = FEET[recipe.feet](ctx);
    tagPart(foot.group, "feet");
    const leg = LEGS[recipe.legs](ctx, foot);
    tagPart(leg.hip, "legs");
    leg.side = side;
    leg.hip.rotation.z = leg.rest.hip; leg.knee.rotation.z = leg.rest.knee;
    if (leg.splay) { leg.hip.rotation.x = -side * leg.splay; leg.knee.rotation.x = side * leg.splay * 1.2; }
    leg.rest.x = leg.hip.rotation.x;
    flattenFoot(leg);
    return leg;
  });
  const drop = legDrop(legs[0]);
  const hipH = drop + BASE_TOP / baseScale;
  pelvis.position.y = hipH;
  legs.forEach((l) => { l.hip.position.z = l.side * F.stance; pelvis.add(l.hip); l.height = drop; });
  ctx.legs = legs;
  const [px, py, pz] = F.pelvis;
  pelvis.add(box(px, py, pz, ctx.dark));
  const belt = box(px * 0.7, py * 0.5, pz * 1.04, ctx.trim); belt.position.y = -py * 0.2; pelvis.add(belt);
  pelvis.children.forEach((c) => { if (c.isMesh) c.userData.part = "pelvis"; });

  // Torso: aim twists it (rotation.y), the hunch leans it (rotation.z).
  const torso = new THREE.Group();
  torso.position.y = F.torsoLift + (ctx.dims.h - F.dims.h) / 2;
  torso.rotation.z = P.hunch || 0;
  pelvis.add(torso); ctx.torso = torso;
  const frame = TORSOS[recipe.torso](ctx);
  tagPart(torso, "torso");

  const socket = (name, parent, x, y, z) => { const o = new THREE.Object3D(); o.name = `socket:${name}`; o.position.set(x, y, z); parent.add(o); ctx.sockets[name] = o; return o; };
  socket("chestFront", torso, frame.front, 0, 0);
  socket("back", torso, frame.back, F.backY, 0);
  socket("head", torso, 0, frame.top, 0);
  socket("hip", pelvis, 0, -0.05, -(pz / 2 + 0.08));
  socket("shin", legs[0].knee, 0.12 * F.k, -legs[0].shinLen * 0.5, 0);

  // Head.
  if (recipe.head && recipe.head !== "none") {
    const head = HEADS[recipe.head](ctx);
    head.scale.setScalar(F.k * (P.head || 1));
    head.position.set(P.headX ?? 0, frame.top, 0);
    torso.add(head);
    tagPart(head, "head");
    ctx.head = head;
  }

  // Backpack (overlaps the back face a touch so it reads bolted on).
  const pack = new THREE.Group();
  pack.position.set(frame.back + 0.06, F.backY, 0);
  pack.scale.setScalar(F.k);
  torso.add(pack);
  BACKPACKS[recipe.backpack](ctx, pack, { tall: !!recipe.tallStacks });
  tagPart(pack, "backpack");

  // Arms + shoulders. Right carries the gun, left the melee weapon.
  const armR = new THREE.Group(); armR.position.set(0, F.armY, -F.shoulderZ); torso.add(armR);
  const armL = new THREE.Group(); armL.position.set(0, F.armY, F.shoulderZ); torso.add(armL);
  for (const [arm, s] of [[armR, -1], [armL, 1]]) {
    const sh = new THREE.Group(); sh.scale.setScalar(F.k); arm.add(sh);
    SHOULDERS[recipe.shoulders](ctx, sh, s);
    tagPart(sh, "shoulders");
    socket(s > 0 ? "shoulderL" : "shoulderR", sh, 0, 0.22, 0);
  }

  if (recipe.signature) { SIGNATURES[recipe.signature](ctx, frame); tagPart(pelvis, "signature"); }

  return {
    pelvis, legs, torso, chest: frame.chest, armR, armL, hipH,
    stacks: ctx.stacks, spinners: ctx.spinners, flickers: ctx.flickers, glows: ctx.glows,
    whistle: ctx.whistle ?? null, bellows: ctx.bellows ?? null, sockets: ctx.sockets, frame, ctx,
  };
}
