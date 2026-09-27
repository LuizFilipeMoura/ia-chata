// The dieselpunk part library. A rig body is a recipe of one torso, head,
// backpack, pair of legs + feet, pair of shoulders and a signature piece.
// Coordinates: +x is the rig's front, +y up, +z its left (armL side).
//
// Every builder takes the shared build context `ctx`:
//   paint / trim / dark / steel / brass / rubber: materials (skinned)
//   glass: the cockpit material (dims when the rig has acted)
//   vent: the heat-stack material (glows with heat)
//   torso / pelvis: groups to build into
//   dims: { w (z), h (y), d (x) } of the torso box, already class-sized
//   k: detail scale (1 light, ~1.25 medium)
//   stacks / spinners / sockets: filled in by the parts
import { THREE, at, rot, box, cyl, sph, cone, torus, dome, drumX, drumZ, rivetRing, rivetRow, GLOW, mat } from "./kit.js";

// ---- Shape helpers ----
// A prism: a side profile in the x/y plane extruded along z, centred.
function prism(profile, depth, m) {
  const s = new THREE.Shape();
  profile.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true;
  return o;
}
// A lathe around y from [radius, y] points.
function lathe(points, m, seg = 18) {
  const o = new THREE.Mesh(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
  o.castShadow = o.receiveShadow = true;
  return o;
}
// A truncated four-sided pyramid (sloped armour): base w x d, top shrunk by `taper`.
function slope(w, h, d, taper, m) {
  const g = new THREE.CylinderGeometry(Math.SQRT1_2 * taper, Math.SQRT1_2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(d, 1, w);
  const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true;
  return o;
}
// A porthole: brass frame + glass disc facing +x (rotate the group to aim it).
function porthole(r, ctx) {
  const g = new THREE.Group();
  g.add(rot(torus(r, r * 0.22, ctx.trim, Math.PI * 2, 14), 0, Math.PI / 2, 0));
  g.add(rot(cyl(r * 0.9, r * 0.9, 0.03, ctx.glass, 14), 0, 0, Math.PI / 2));
  return g;
}
// A heat stack: vent-material pipe with a trim cap. Registered in ctx.stacks.
function stack(ctx, parent, x, y, z, r, h, { cap = true, lean = 0 } = {}) {
  const s = cyl(r, r * 1.15, h, ctx.vent, 10);
  at(s, x, y + h / 2, z); s.rotation.z = lean;
  parent.add(s); ctx.stacks.push(s);
  if (cap) parent.add(at(cyl(r * 1.35, r * 1.2, h * 0.12, ctx.trim, 10), x - Math.sin(lean) * h / 2, y + h, z));
  return s;
}
function socket(ctx, name, parent, x, y, z) {
  const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = `socket:${name}`;
  parent.add(o); ctx.sockets[name] = o;
  return o;
}
function cockpitSlot(ctx, g, x, y, w, h) {
  g.add(at(box(0.08, h, w, ctx.glass), x, y, 0));
  g.add(at(box(0.1, 0.05, w + 0.08, ctx.dark), x, y + h / 2 + 0.02, 0));
}

// ---- Torsos: build into ctx.torso, return { chest, top, front, back, halfW } ----
export const TORSOS = {
  // Horizontal locomotive boiler: smokebox door on the nose, brass bands.
  boilerDrum(ctx) {
    const { w, h, d } = ctx.dims, r = Math.min(w, h * 1.15) / 2;
    const chest = new THREE.Group();
    chest.add(drumX(r, d, ctx.paint, 18));
    for (const x of [-d * 0.3, d * 0.1]) chest.add(at(drumX(r * 1.04, 0.07, ctx.trim, 18), x, 0, 0));
    const door = drumX(r * 0.86, 0.08, ctx.dark, 18); door.position.x = d / 2 + 0.02; chest.add(door);
    rivetRing(chest, r * 0.72, 10, "x", ctx.trim, 0.03, d / 2 + 0.07);
    chest.add(at(sph(0.07, ctx.trim, 8), d / 2 + 0.1, 0, 0));
    // Saddle underneath so it sits on the pelvis.
    chest.add(at(box(d * 0.7, h * 0.25, w * 0.6, ctx.dark), 0, -r * 0.85, 0));
    if (ctx.needsCockpit) cockpitSlot(ctx, chest, d / 2 - 0.05, r * 0.45, w * 0.35, 0.14);
    ctx.torso.add(chest);
    return { chest, top: r, front: d / 2 + 0.06, back: -d / 2, halfW: r };
  },
  // Riveted armoured prow: a steep glacis sloping to a low nose.
  rivetWedge(ctx) {
    const { w, h, d } = ctx.dims;
    const chest = new THREE.Group();
    const prof = [[-d / 2, -h / 2], [d / 2, -h / 2], [d / 2, -h * 0.15], [0, h / 2], [-d / 2, h / 2]];
    chest.add(prism(prof, w, ctx.paint));
    // Glacis plate + rivet rows along the slope.
    const glacis = prism([[d / 2 + 0.03, -h * 0.12], [d / 2 + 0.03, -h * 0.2], [0.02, h / 2 - 0.02], [0, h / 2 + 0.04]], w * 0.9, ctx.trim);
    chest.add(glacis);
    for (const z of [-w * 0.36, 0, w * 0.36]) rivetRow(chest, [d / 2 + 0.03, -h * 0.12, z], [0.05, h / 2, z], 5, ctx.dark);
    chest.add(at(box(d * 0.9, 0.06, w + 0.04, ctx.dark), 0, -h / 2 + 0.03, 0));
    if (ctx.needsCockpit) cockpitSlot(ctx, chest, d * 0.26, h * 0.12, w * 0.4, 0.09);
    ctx.torso.add(chest);
    return { chest, top: h / 2, front: d / 2, back: -d / 2, halfW: w / 2 };
  },
  // Bomber nose: a boxy fuselage with a glazed greenhouse dome in front.
  bomberNose(ctx) {
    const { w, h, d } = ctx.dims;
    const chest = new THREE.Group();
    const body = box(d * 0.62, h, w, ctx.paint); body.position.x = -d * 0.19; chest.add(body);
    const r = Math.min(w, h) / 2 * 0.95;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12, 0, Math.PI), ctx.glass);
    nose.rotation.y = Math.PI / 2; nose.scale.set(1, 1, (d * 0.42) / r); nose.position.x = d * 0.12; nose.castShadow = true;
    chest.add(nose);
    // Frame ribs over the glazing: half hoops running over the nose.
    for (const a of [-0.9, 0, 0.9]) {
      const g = new THREE.Group(); g.position.x = d * 0.12; g.scale.set((d * 0.42) / r, 1, 1);
      const rib = torus(r * 1.01, 0.025, ctx.dark, Math.PI, 16); rib.rotation.set(a, 0, -Math.PI / 2);
      g.add(rib); chest.add(g);
    }
    chest.add(at(drumX(r * 1.02, 0.06, ctx.trim, 16), d * 0.12, 0, 0));
    rivetRow(chest, [-d * 0.45, h / 2 + 0.01, -w * 0.4], [-d * 0.45, h / 2 + 0.01, w * 0.4], 5, ctx.dark);
    ctx.torso.add(chest);
    return { chest, top: h / 2, front: d * 0.12 + d * 0.42, back: -d / 2, halfW: w / 2 };
  },
  // Tractor engine block: radiator grille front, louvred flanks, fuel cap.
  tractorBlock(ctx) {
    const { w, h, d } = ctx.dims;
    const chest = new THREE.Group();
    chest.add(box(d, h, w * 0.92, ctx.paint));
    // Radiator grille in a trim frame.
    const gw = w * 0.7, gh = h * 0.75;
    chest.add(at(box(0.06, gh, gw, ctx.trim), d / 2 + 0.02, -h * 0.05, 0));
    for (let i = 0; i < 7; i++) chest.add(at(box(0.06, gh * 0.9, 0.03, ctx.dark), d / 2 + 0.05, -h * 0.05, -gw / 2 + 0.06 + i * (gw - 0.12) / 6));
    // Louvres on each flank.
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) chest.add(at(rot(box(d * 0.5, 0.04, 0.04, ctx.dark), 0.25, 0, 0), -d * 0.05, h * 0.3 - i * 0.14, s * (w * 0.46 + 0.01)));
    chest.add(at(cyl(0.07, 0.07, 0.08, ctx.trim, 10), -d * 0.25, h / 2 + 0.04, w * 0.25));
    chest.add(at(box(d * 1.02, 0.05, w * 0.95, ctx.dark), 0, h / 2, 0));
    if (ctx.needsCockpit) cockpitSlot(ctx, chest, d / 2 - 0.02, h * 0.38, w * 0.4, 0.08);
    ctx.torso.add(chest);
    return { chest, top: h / 2 + 0.03, front: d / 2 + 0.05, back: -d / 2, halfW: w * 0.46 };
  },
  // Diving bell: flared riveted skirt, domed top, portholes all round.
  divingBell(ctx) {
    const { w, h } = ctx.dims, R = w / 2;
    const chest = new THREE.Group();
    const bell = lathe([[0, h * 0.55], [R * 0.5, h * 0.52], [R * 0.82, h * 0.35], [R * 0.9, 0], [R * 0.95, -h * 0.35], [R, -h * 0.5], [0, -h * 0.5]], ctx.paint);
    chest.add(bell);
    chest.add(at(cyl(R * 1.02, R * 1.02, 0.07, ctx.trim, 18), 0, -h * 0.46, 0));
    rivetRing(chest, R * 0.97, 14, "y", ctx.dark, 0.03, -h * 0.4);
    rivetRing(chest, R * 0.86, 12, "y", ctx.dark, 0.03, h * 0.2);
    for (const a of [0, 1.3, -1.3]) {
      const p = porthole(0.13 * ctx.k, ctx);
      const g = new THREE.Group(); g.add(p); p.position.x = R * 0.9 + 0.01; g.rotation.y = a; g.position.y = 0; chest.add(g);
    }
    ctx.torso.add(chest);
    return { chest, top: h * 0.55, front: R * 0.92, back: -R * 0.9, halfW: R };
  },
  // Armoured cab: sloped slab sides, vision slits, tool boxes.
  armoredCab(ctx) {
    const { w, h, d } = ctx.dims;
    const chest = new THREE.Group();
    const lower = box(d * 0.95, h * 0.45, w * 0.95, ctx.paint); lower.position.y = -h * 0.27; chest.add(lower);
    const upper = slope(w * 0.95, h * 0.55, d * 0.95, 0.72, ctx.paint); upper.position.y = h * 0.225; chest.add(upper);
    chest.add(at(box(d * 0.97, 0.05, w * 0.97, ctx.trim), 0, -h * 0.05, 0));
    for (const s of [-1, 1]) chest.add(at(box(d * 0.4, h * 0.22, 0.12, ctx.dark), -d * 0.15, -h * 0.28, s * w * 0.5));
    if (ctx.needsCockpit) cockpitSlot(ctx, chest, d * 0.38, h * 0.25, w * 0.4, 0.07);
    else chest.add(at(box(0.05, 0.05, w * 0.4, ctx.dark), d * 0.4, h * 0.2, 0));
    ctx.torso.add(chest);
    return { chest, top: h / 2, front: d * 0.48, back: -d * 0.48, halfW: w * 0.5 + 0.06 };
  },
  // Zeppelin gondola: a stretched teardrop with a window band and tail fins.
  gondola(ctx) {
    const { w, h, d } = ctx.dims;
    const chest = new THREE.Group();
    const hull = sph(0.5, ctx.paint, 18); hull.scale.set(d * 1.02, h * 1.02, w * 0.92); chest.add(hull);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 20, 1, true, -Math.PI / 2.5, Math.PI / 1.25), ctx.glass);
    band.scale.set(d * 1.03, 1, w * 0.93); band.position.y = h * 0.1; chest.add(band);
    const rim = rot(torus(0.5, 0.02, ctx.trim, Math.PI * 2, 24), Math.PI / 2, 0, 0); rim.position.y = h * 0.1 + 0.07; rim.scale.set(d * 1.03, w * 0.93, 1); chest.add(rim);
    for (const s of [-1, 1]) chest.add(at(rot(box(0.28, 0.04, 0.2, ctx.trim), 0, 0, 0), -d * 0.46, -h * 0.05, s * w * 0.3));
    chest.add(at(box(0.28, 0.24, 0.04, ctx.trim), -d * 0.46, h * 0.2, 0));
    ctx.torso.add(chest);
    return { chest, top: h * 0.5, front: d * 0.5, back: -d * 0.46, halfW: w * 0.46 };
  },
  // Vertical boiler: tall riveted drum with a brass dome cap and gauges.
  verticalBoiler(ctx) {
    const { w, h } = ctx.dims, r = w * 0.4;
    const chest = new THREE.Group();
    chest.add(cyl(r, r * 1.05, h * 1.1, ctx.paint, 18));
    for (const y of [-h * 0.4, 0, h * 0.4]) chest.add(at(cyl(r * 1.06, r * 1.06, 0.06, ctx.trim, 18), 0, y, 0));
    const cap = dome(r * 0.95, ctx.trim, 0.8, 16); cap.position.y = h * 0.55; chest.add(cap);
    // Gauge faces: pale dials with a dark needle, the "face" of a headless rig.
    const dialMat = mat(0xe8e0c8, { roughness: 0.4, metalness: 0.1 });
    for (const [z, y] of [[-0.17, 0.12], [0.17, 0.12], [0, -0.14]]) {
      const g = new THREE.Group(); g.position.set(r * 0.98, y * ctx.k, z * ctx.k);
      g.add(rot(cyl(0.11 * ctx.k, 0.11 * ctx.k, 0.04, dialMat, 14), 0, 0, Math.PI / 2));
      g.add(rot(torus(0.11 * ctx.k, 0.02, ctx.trim, Math.PI * 2, 14), 0, Math.PI / 2, 0));
      g.add(at(box(0.02, 0.09 * ctx.k, 0.015, ctx.dark), 0.03, 0.02, 0, 0.6));
      chest.add(g);
    }
    if (ctx.needsCockpit) cockpitSlot(ctx, chest, r * 0.95, h * 0.38, r * 0.7, 0.07);
    ctx.torso.add(chest);
    return { chest, top: h * 0.55 + r * 0.6, front: r * 1.02, back: -r * 1.02, halfW: r * 1.05 };
  },
};

// ---- Heads: built at light scale, origin on the torso top; ctx.k scales them.
// Return the group. `cockpit: true` heads carry the crew glass.
export const HEADS = {
  none() { return new THREE.Group(); },
  gasMask(ctx) {
    const g = new THREE.Group();
    const face = sph(0.26, ctx.paint, 14); face.scale.set(1, 0.9, 1); face.position.y = 0.2; g.add(face);
    for (const s of [-1, 1]) {
      g.add(at(porthole(0.07, ctx), 0.23, 0.28, s * 0.1));
      const can = cyl(0.07, 0.07, 0.2, ctx.dark, 10); can.position.set(0.3, 0.06, s * 0.1); can.rotation.z = 1.1; g.add(can);
      g.add(at(cyl(0.075, 0.075, 0.03, ctx.trim, 10), 0.39, 0.02, s * 0.1).rotateZ(1.1));
    }
    g.add(at(cyl(0.2, 0.22, 0.06, ctx.dark, 12), 0, 0.03, 0));
    return g;
  },
  visorBucket(ctx) {
    const g = new THREE.Group();
    g.add(at(cyl(0.22, 0.26, 0.4, ctx.paint, 14), 0, 0.2, 0));
    g.add(at(cyl(0.24, 0.24, 0.05, ctx.trim, 14), 0, 0.41, 0));
    g.add(at(box(0.1, 0.05, 0.3, ctx.glass), 0.2, 0.24, 0));
    g.add(at(box(0.08, 0.1, 0.36, ctx.dark), 0.22, 0.17, 0));
    return g;
  },
  locoCab(ctx) {
    const g = new THREE.Group();
    g.add(at(box(0.42, 0.34, 0.5, ctx.paint), -0.04, 0.17, 0));
    const roof = cyl(0.3, 0.3, 0.58, ctx.dark, 14); roof.rotation.x = Math.PI / 2; roof.scale.set(0.8, 1, 0.35); roof.position.set(-0.04, 0.34, 0); g.add(roof);
    g.add(at(box(0.04, 0.12, 0.36, ctx.glass), 0.18, 0.22, 0));
    for (const s of [-1, 1]) g.add(at(box(0.18, 0.1, 0.03, ctx.glass), -0.04, 0.22, s * 0.25));
    g.add(at(box(0.05, 0.03, 0.44, ctx.trim), 0.19, 0.3, 0));
    return g;
  },
  knightHelm(ctx) {
    const g = new THREE.Group();
    g.add(at(cyl(0.2, 0.24, 0.36, ctx.paint, 14), 0, 0.18, 0));
    g.add(at(cone(0.2, 0.1, ctx.paint, 14), 0, 0.41, 0));
    g.add(at(box(0.06, 0.05, 0.32, ctx.glass), 0.21, 0.26, 0));
    g.add(at(box(0.06, 0.22, 0.05, ctx.glass), 0.22, 0.18, 0));
    // Crest fin, front to back.
    g.add(at(prism([[-0.28, 0], [0.16, 0], [0.05, 0.09], [-0.3, 0.07]], 0.04, ctx.trim), 0, 0.4, 0));
    return g;
  },
  divingHelm(ctx) {
    const g = new THREE.Group();
    g.add(at(cyl(0.2, 0.26, 0.08, ctx.trim, 14), 0, 0.04, 0));
    g.add(at(sph(0.27, ctx.trim, 16), 0, 0.3, 0));
    const front = porthole(0.12, ctx); front.position.set(0.26, 0.3, 0); g.add(front);
    for (const s of [-1, 1]) { const p = porthole(0.08, ctx); p.rotation.y = -s * Math.PI / 2; p.position.set(0, 0.3, s * 0.26); g.add(p); }
    rivetRing(g, 0.23, 10, "y", ctx.dark, 0.022, 0.1);
    return g;
  },
  weldMask(ctx) {
    const g = new THREE.Group();
    g.add(at(box(0.36, 0.34, 0.4, ctx.paint), 0, 0.17, 0));
    g.add(at(box(0.04, 0.06, 0.28, ctx.glass), 0.19, 0.16, 0));
    // Flip-up face plate, hinged on the brow.
    const plate = box(0.04, 0.24, 0.36, ctx.dark); plate.position.set(0.16, 0.44, 0); plate.rotation.z = 1.05; g.add(plate);
    for (const s of [-1, 1]) g.add(at(cyl(0.04, 0.04, 0.04, ctx.trim, 8).rotateX(Math.PI / 2), 0.14, 0.32, s * 0.2));
    return g;
  },
  periscope(ctx) {
    const g = new THREE.Group();
    g.add(at(dome(0.28, ctx.paint, 1, 14), 0, 0, 0));
    g.add(at(cyl(0.06, 0.06, 0.3, ctx.dark, 10), -0.04, 0.3, 0.08));
    g.add(at(box(0.16, 0.1, 0.1, ctx.dark), 0.0, 0.46, 0.08));
    g.add(at(box(0.02, 0.07, 0.08, ctx.glass), 0.08, 0.46, 0.08));
    g.add(at(box(0.04, 0.06, 0.18, ctx.glass), 0.26, 0.1, -0.05));
    return g;
  },
  pillbox(ctx) {
    const g = new THREE.Group();
    g.add(at(cyl(0.32, 0.34, 0.24, ctx.paint, 16), 0, 0.12, 0));
    g.add(at(cyl(0.33, 0.33, 0.04, ctx.dark, 16), 0, 0.25, 0));
    for (const a of [0, 0.9, -0.9]) { const s = new THREE.Group(); s.add(at(box(0.04, 0.04, 0.16, ctx.glass), 0.32, 0.13, 0)); s.rotation.y = a; g.add(s); }
    g.add(at(cyl(0.12, 0.12, 0.05, ctx.trim, 12), -0.08, 0.28, 0));
    return g;
  },
  stereoRange(ctx) {
    const g = new THREE.Group();
    g.add(at(box(0.3, 0.22, 0.28, ctx.paint), 0, 0.11, 0));
    g.add(at(drumZ(0.06, 0.8, ctx.dark, 10), 0.02, 0.28, 0));
    for (const s of [-1, 1]) {
      g.add(at(drumZ(0.08, 0.06, ctx.trim, 10), 0.02, 0.28, s * 0.4));
      g.add(at(rot(cyl(0.05, 0.05, 0.02, ctx.glass, 10), 0, 0, Math.PI / 2), 0.09, 0.28, s * 0.38));
    }
    g.add(at(box(0.03, 0.05, 0.18, ctx.glass), 0.16, 0.12, 0));
    return g;
  },
  searchlight(ctx) {
    const g = new THREE.Group();
    // Yoke.
    for (const s of [-1, 1]) g.add(at(box(0.06, 0.26, 0.04, ctx.dark), 0, 0.13, s * 0.22));
    const lamp = drumX(0.2, 0.34, ctx.paint, 16); lamp.position.set(0, 0.26, 0); g.add(lamp);
    g.add(at(drumX(0.21, 0.04, ctx.trim, 16), 0.17, 0.26, 0));
    g.add(at(rot(cyl(0.18, 0.18, 0.02, GLOW(0xfff0c0, 0xffd27a, 1.6), 16), 0, 0, Math.PI / 2), 0.19, 0.26, 0));
    g.add(at(box(0.04, 0.05, 0.14, ctx.glass), 0.14, 0.05, 0));
    return g;
  },
  bubble(ctx) {
    const g = new THREE.Group();
    g.add(at(cyl(0.3, 0.3, 0.06, ctx.trim, 16), 0, 0.03, 0));
    const glass = dome(0.28, ctx.glass, 1, 16); glass.position.y = 0.06; g.add(glass);
    for (const a of [0, Math.PI / 2]) { const rib = torus(0.285, 0.018, ctx.dark, Math.PI, 16); rib.rotation.y = a; rib.position.y = 0.06; g.add(rib); }
    g.add(at(sph(0.04, ctx.trim, 8), 0, 0.35, 0));
    return g;
  },
  coilCrown(ctx) {
    const g = new THREE.Group();
    g.add(at(dome(0.26, ctx.paint, 1, 14), 0, 0, 0));
    g.add(at(box(0.04, 0.05, 0.2, ctx.glass), 0.24, 0.1, 0));
    g.add(at(cyl(0.03, 0.03, 0.3, ctx.steel, 8), 0, 0.36, 0));
    for (let i = 0; i < 4; i++) g.add(at(rot(torus(0.14 - i * 0.025, 0.022, ctx.trim, Math.PI * 2, 14), Math.PI / 2, 0, 0), 0, 0.26 + i * 0.055, 0));
    const orb = sph(0.065, GLOW(0x9fe8ff, 0x66ccff, 1.6), 12); orb.position.y = 0.47; g.add(orb);
    ctx.glows.push(orb);
    return g;
  },
};

// ---- Backpacks: built at light scale, origin on the torso's back face,
// extending toward -x. Each carries at least one heat stack.
export const BACKPACKS = {
  ammoDrum(ctx, g) {
    g.add(at(drumZ(0.28, 0.4, ctx.dark, 16), -0.24, 0, 0));
    g.add(at(drumZ(0.29, 0.05, ctx.trim, 16), -0.24, 0, 0.17));
    g.add(at(drumZ(0.29, 0.05, ctx.trim, 16), -0.24, 0, -0.17));
    rivetRing(g, 0.2, 8, "z", ctx.trim, 0.025, 0.2);
    stack(ctx, g, -0.12, 0.26, 0.28, 0.06, 0.5);
  },
  gasTanks(ctx, g) {
    for (const z of [-0.18, 0.18]) {
      g.add(at(cyl(0.15, 0.15, 0.62, ctx.paint, 14), -0.2, 0.05, z));
      g.add(at(sph(0.15, ctx.paint, 12), -0.2, 0.36, z));
      g.add(at(sph(0.15, ctx.paint, 12), -0.2, -0.26, z));
      g.add(at(cyl(0.16, 0.16, 0.04, ctx.trim, 14), -0.2, 0.15, z));
      g.add(at(cyl(0.03, 0.03, 0.1, ctx.trim, 8), -0.2, 0.55, z));
    }
    g.add(at(box(0.05, 0.06, 0.4, ctx.dark), -0.2, 0.58, 0));
    stack(ctx, g, -0.06, 0.25, 0, 0.05, 0.45);
  },
  dynamo(ctx, g) {
    g.add(at(box(0.3, 0.46, 0.46, ctx.dark), -0.16, 0, 0));
    g.add(at(drumZ(0.2, 0.52, ctx.paint, 16), -0.2, 0.05, 0));
    const fan = new THREE.Group(); fan.position.set(-0.36, 0.05, 0);
    for (let i = 0; i < 4; i++) fan.add(rot(box(0.02, 0.32, 0.07, ctx.trim), i * Math.PI / 4, 0, 0));
    fan.add(rot(cyl(0.05, 0.05, 0.04, ctx.trim, 10), 0, 0, Math.PI / 2));
    g.add(fan); ctx.spinners.push({ o: fan, axis: "x", speed: 9 });
    g.add(at(rot(torus(0.17, 0.015, ctx.dark, Math.PI * 2, 16), 0, Math.PI / 2, 0), -0.38, 0.05, 0));
    stack(ctx, g, -0.1, 0.23, -0.16, 0.05, 0.45);
  },
  twinStacks(ctx, g, { tall = false } = {}) {
    g.add(at(box(0.3, 0.4, 0.5, ctx.dark), -0.15, -0.05, 0));
    for (const z of [-0.14, 0.14]) {
      stack(ctx, g, -0.16, 0.12, z, tall ? 0.06 : 0.08, tall ? 0.66 : 0.62);
      g.add(at(cyl(0.1, 0.1, 0.04, ctx.trim, 10), -0.16, 0.35, z));
    }
  },
  radiatorFins(ctx, g) {
    g.add(at(box(0.08, 0.6, 0.56, ctx.dark), -0.05, 0, 0));
    for (let i = 0; i < 7; i++) g.add(at(box(0.22, 0.56, 0.025, ctx.steel), -0.18, 0, -0.24 + i * 0.08));
    g.add(at(box(0.24, 0.04, 0.58, ctx.trim), -0.18, 0.3, 0));
    stack(ctx, g, -0.12, 0.3, 0.2, 0.05, 0.4);
  },
  bellows(ctx, g) {
    const b = new THREE.Group(); b.position.set(-0.24, -0.1, 0);
    for (let i = 0; i < 6; i++) b.add(at(cyl(i % 2 ? 0.16 : 0.2, i % 2 ? 0.2 : 0.16, 0.08, i % 2 ? ctx.dark : ctx.rubber, 12), 0, i * 0.08, 0));
    b.add(at(cyl(0.21, 0.21, 0.04, ctx.trim, 12), 0, 0.5, 0));
    g.add(b);
    ctx.bellows = b;
    const hose = torus(0.2, 0.03, ctx.rubber, Math.PI, 12); hose.position.set(-0.05, 0.3, 0.16); hose.rotation.y = Math.PI / 2; g.add(hose);
    stack(ctx, g, -0.08, 0.1, -0.22, 0.05, 0.5);
  },
  compressor(ctx, g) {
    const tank = drumZ(0.17, 0.56, ctx.paint, 14); tank.position.set(-0.22, 0.24, 0); g.add(tank);
    for (const z of [-0.28, 0.28]) { const end = at(sph(0.17, ctx.paint, 12), -0.22, 0.24, z); end.scale.set(1, 1, 0.5); g.add(end); }
    g.add(at(box(0.26, 0.24, 0.3, ctx.dark), -0.16, -0.12, 0));
    const wheel = new THREE.Group(); wheel.position.set(-0.16, -0.12, 0.18);
    wheel.add(rot(torus(0.14, 0.03, ctx.trim, Math.PI * 2, 16), 0, 0, 0));
    for (let i = 0; i < 3; i++) wheel.add(rot(box(0.02, 0.26, 0.02, ctx.trim), 0, 0, i * Math.PI / 3));
    g.add(wheel); ctx.spinners.push({ o: wheel, axis: "z", speed: 5 });
    g.add(at(cyl(0.05, 0.05, 0.06, ctx.trim, 10), -0.22, 0.43, 0));
    stack(ctx, g, -0.08, 0.1, -0.2, 0.045, 0.45);
  },
  shellRack(ctx, g) {
    g.add(at(box(0.08, 0.6, 0.62, ctx.dark), -0.04, 0, 0));
    g.add(at(box(0.3, 0.05, 0.62, ctx.dark), -0.16, -0.28, 0));
    for (let i = 0; i < 6; i++) {
      const z = -0.25 + (i % 3) * 0.25, x = -0.13 - Math.floor(i / 3) * 0.14;
      g.add(at(cyl(0.06, 0.06, 0.34, ctx.trim, 10), x, -0.08, z));
      g.add(at(cone(0.06, 0.14, ctx.steel, 10), x, 0.16, z));
    }
    g.add(at(box(0.32, 0.03, 0.64, ctx.dark), -0.16, 0.04, 0));
    stack(ctx, g, -0.05, 0.3, 0, 0.055, 0.35);
  },
  sparkChimney(ctx, g) {
    g.add(at(box(0.3, 0.44, 0.4, ctx.dark), -0.15, -0.06, 0));
    stack(ctx, g, -0.18, 0.12, 0, 0.1, 0.38, { cap: false });
    // The arrestor: a swollen mesh cage on top.
    const cage = cone(0.2, 0.3, ctx.dark, 12); cage.rotation.x = Math.PI; cage.position.set(-0.18, 0.64, 0); g.add(cage);
    g.add(at(cyl(0.21, 0.21, 0.04, ctx.trim, 12), -0.18, 0.79, 0));
    for (let i = 0; i < 3; i++) g.add(at(rot(torus(0.1 + i * 0.03, 0.012, ctx.steel, Math.PI * 2, 12), Math.PI / 2, 0, 0), -0.18, 0.54 + i * 0.09, 0));
  },
  boltQuiver(ctx, g) {
    const q = new THREE.Group(); q.position.set(-0.2, 0, 0.05); q.rotation.x = -0.35;
    q.add(box(0.26, 0.62, 0.26, ctx.paint));
    q.add(at(box(0.28, 0.06, 0.28, ctx.trim), 0, 0.3, 0));
    for (let i = 0; i < 5; i++) {
      const x = -0.07 + (i % 3) * 0.07, z = -0.06 + Math.floor(i / 3) * 0.1;
      q.add(at(cyl(0.015, 0.015, 0.34, ctx.steel, 6), x, 0.45, z));
      q.add(at(cone(0.035, 0.08, ctx.brass, 6), x, 0.64, z));
    }
    g.add(q);
    stack(ctx, g, -0.1, 0.16, -0.22, 0.05, 0.4);
  },
  flareRack(ctx, g) {
    g.add(at(box(0.24, 0.3, 0.56, ctx.dark), -0.12, -0.12, 0));
    const tubes = new THREE.Group(); tubes.position.set(-0.14, 0.05, 0); tubes.rotation.z = 0.35;
    for (let i = 0; i < 4; i++) {
      const z = -0.2 + i * 0.13;
      tubes.add(at(cyl(0.05, 0.05, 0.4, ctx.steel, 10), 0, 0.2, z));
      tubes.add(at(sph(0.045, GLOW(0xff5a3a, 0xff3a1a, 1.2), 8), 0, 0.42, z));
    }
    g.add(tubes);
    stack(ctx, g, -0.24, 0.02, 0.22, 0.045, 0.35);
  },
};

// ---- Feet: built at light scale on the ankle, sole at y = 0 (the ankle is
// at +y above it). Return { group, lift } where lift = ankle height.
export const FEET = {
  plate(ctx) {
    const g = new THREE.Group();
    g.add(at(box(0.62, 0.12, 0.36, ctx.steel), 0.08, 0.06, 0));
    g.add(at(prism([[0.39, 0], [0.5, 0], [0.39, 0.12]], 0.36, ctx.steel), 0, 0, 0));
    g.add(at(sph(0.1, ctx.dark, 10), 0, 0.14, 0));
    return { group: g, lift: 0.14 };
  },
  claw(ctx) {
    const g = new THREE.Group();
    g.add(at(sph(0.1, ctx.dark, 10), 0, 0.12, 0));
    for (const a of [-0.45, 0, 0.45]) {
      const t = new THREE.Group(); t.rotation.y = a;
      t.add(at(box(0.3, 0.07, 0.07, ctx.steel), 0.16, 0.04, 0));
      const c = cone(0.04, 0.12, ctx.dark, 6); c.rotation.z = -Math.PI / 2 - 0.4; c.position.set(0.34, 0.03, 0); t.add(c);
      g.add(t);
    }
    const heel = cone(0.04, 0.16, ctx.steel, 6); heel.rotation.z = Math.PI / 2 + 0.3; heel.position.set(-0.14, 0.04, 0); g.add(heel);
    return { group: g, lift: 0.12 };
  },
  tracked(ctx) {
    const g = new THREE.Group();
    g.add(at(box(0.62, 0.14, 0.32, ctx.rubber), 0.06, 0.07, 0));
    for (const x of [-0.16, 0.06, 0.28]) g.add(at(drumZ(0.06, 0.34, ctx.steel, 10), x, 0.08, 0));
    g.add(at(box(0.5, 0.05, 0.36, ctx.dark), 0.06, 0.17, 0));
    g.add(at(sph(0.09, ctx.dark, 10), 0, 0.2, 0));
    return { group: g, lift: 0.2 };
  },
  drumPad(ctx) {
    const g = new THREE.Group();
    g.add(at(cyl(0.26, 0.28, 0.14, ctx.steel, 16), 0.04, 0.07, 0));
    rivetRing(g, 0.24, 10, "y", ctx.trim, 0.025, 0.14);
    g.add(at(cyl(0.12, 0.16, 0.08, ctx.dark, 12), 0.02, 0.18, 0));
    return { group: g, lift: 0.2 };
  },
  spur(ctx) {
    const g = new THREE.Group();
    g.add(at(prism([[-0.16, 0], [0.42, 0], [0.18, 0.12], [-0.16, 0.12]], 0.26, ctx.steel), 0, 0, 0));
    const sp = cone(0.035, 0.22, ctx.trim, 6); sp.rotation.z = Math.PI / 2; sp.position.set(-0.25, 0.08, 0); g.add(sp);
    g.add(at(sph(0.09, ctx.dark, 10), 0, 0.14, 0));
    return { group: g, lift: 0.14 };
  },
};

// ---- Legs: (ctx, foot) => { hip, knee, foot, rest, bend }. The rest pose is
// applied by the body builder, which then measures the drop to the sole.
function legFrame(thighLen, shinLen, thighMesh, shinMesh, ctx, foot) {
  const hip = new THREE.Group();
  thighMesh.position.y = -thighLen / 2; hip.add(thighMesh);
  const knee = new THREE.Group(); knee.position.y = -thighLen; hip.add(knee);
  shinMesh.position.y = -shinLen / 2; knee.add(shinMesh);
  const ankle = new THREE.Group(); ankle.position.y = -shinLen; knee.add(ankle);
  const f = foot.group; f.position.y = -foot.lift; ankle.add(f);
  return { hip, knee, ankle, thighLen, shinLen };
}
export const LEGS = {
  // Lights: reverse-jointed stalker with a hydraulic ram on the thigh.
  digitigrade(ctx, foot) {
    const T = 1.0, S = 1.1;
    const L = legFrame(T, S, box(0.28, T, 0.3, ctx.paint), box(0.2, S, 0.22, ctx.dark), ctx, foot);
    L.knee.add(sph(0.17, ctx.steel, 10));
    L.hip.add(at(cyl(0.035, 0.035, T * 0.8, ctx.trim, 8), 0.17, -T * 0.45, 0));
    L.knee.add(at(box(0.08, 0.3, 0.24, ctx.trim), 0.12, -0.18, 0));
    return { ...L, rest: { hip: 0.35, knee: -0.75 }, bend: -1 };
  },
  // Lights: long straight stilts, exposed pistons and coil springs.
  pistonStilt(ctx, foot) {
    const T = 1.05, S = 1.15;
    const thigh = new THREE.Group(); thigh.add(box(0.18, T, 0.2, ctx.paint)); thigh.add(at(cyl(0.05, 0.05, T * 0.9, ctx.steel, 8), 0.14, 0, 0));
    const shin = new THREE.Group(); shin.add(cyl(0.07, 0.09, S, ctx.dark, 10)); shin.add(at(cyl(0.035, 0.035, S * 0.7, ctx.trim, 8), -0.1, 0.1, 0));
    for (let i = 0; i < 4; i++) shin.add(at(rot(torus(0.1, 0.02, ctx.trim, Math.PI * 2, 10), Math.PI / 2, 0, 0), 0, S * 0.3 - i * 0.07, 0));
    const L = legFrame(T, S, thigh, shin, ctx, foot);
    L.knee.add(sph(0.13, ctx.steel, 10));
    return { ...L, rest: { hip: 0.12, knee: -0.28 }, bend: -1 };
  },
  // Lights: bird-kneed chicken walker, knee pointing back.
  chickenWalker(ctx, foot) {
    const T = 0.95, S = 1.2;
    const thigh = new THREE.Group(); thigh.add(box(0.3, T, 0.28, ctx.paint)); thigh.add(at(box(0.32, 0.12, 0.3, ctx.trim), 0, T * 0.3, 0));
    const shin = new THREE.Group(); shin.add(box(0.16, S, 0.18, ctx.dark)); shin.add(at(cyl(0.03, 0.03, S * 0.8, ctx.steel, 8), 0.1, 0, 0));
    const L = legFrame(T, S, thigh, shin, ctx, foot);
    L.knee.add(sph(0.16, ctx.steel, 10));
    return { ...L, rest: { hip: -0.5, knee: 0.95 }, bend: 1 };
  },
  // Mediums: stocky armoured pillars with a knee plate.
  pillar(ctx, foot) {
    const T = 0.95, S = 0.95;
    const L = legFrame(T, S, box(0.42, T, 0.46, ctx.paint), box(0.38, S, 0.42, ctx.dark), ctx, foot);
    L.knee.add(sph(0.25, ctx.steel, 12));
    L.knee.add(at(box(0.12, 0.34, 0.4, ctx.paint), 0.22, 0.02, 0));
    rivetRow(L.knee, [0.29, 0.14, -0.14], [0.29, 0.14, 0.14], 3, ctx.trim, 0.025);
    return { ...L, rest: { hip: 0, knee: 0 }, bend: 1 };
  },
  // Mediums: fat banded drums, elephantine.
  elephantDrum(ctx, foot) {
    const T = 0.9, S = 0.95;
    const thigh = new THREE.Group(); thigh.add(cyl(0.26, 0.24, T, ctx.paint, 14)); thigh.add(at(cyl(0.27, 0.27, 0.06, ctx.trim, 14), 0, T * 0.2, 0));
    const shin = new THREE.Group(); shin.add(cyl(0.24, 0.3, S, ctx.dark, 14));
    for (const y of [-S * 0.3, S * 0.1]) shin.add(at(cyl(0.29, 0.29, 0.05, ctx.trim, 14), 0, y, 0));
    const L = legFrame(T, S, thigh, shin, ctx, foot);
    L.knee.add(sph(0.26, ctx.steel, 12));
    return { ...L, rest: { hip: 0.05, knee: -0.05 }, bend: 1 };
  },
  // Mediums: splayed crab knees, wide and low.
  crabKnee(ctx, foot) {
    const T = 0.9, S = 1.0;
    const thigh = new THREE.Group(); thigh.add(box(0.36, T, 0.34, ctx.paint)); thigh.add(at(cyl(0.05, 0.05, T * 0.8, ctx.steel, 8), -0.2, 0, 0));
    const shin = new THREE.Group(); shin.add(box(0.3, S, 0.3, ctx.dark)); shin.add(at(box(0.34, 0.3, 0.34, ctx.trim), 0, S * 0.3, 0));
    const L = legFrame(T, S, thigh, shin, ctx, foot);
    L.knee.add(sph(0.22, ctx.steel, 12));
    L.knee.add(at(cone(0.12, 0.3, ctx.trim, 8), 0, 0.22, 0));
    return { ...L, rest: { hip: -0.25, knee: 0.5 }, bend: 1, splay: 0.22 };
  },
};

// ---- Shoulders: dressing on each arm pivot (s = +1 left, -1 right).
// Built at light scale; must stay tight to the pivot (the envelope is snug).
export const SHOULDERS = {
  slab(ctx, arm, s) {
    arm.add(sph(0.2, ctx.steel, 10));
    const p = box(0.44, 0.08, 0.16, ctx.paint); p.position.set(0, 0.2, s * 0.02); p.rotation.x = s * 0.35; arm.add(p);
    arm.add(at(box(0.46, 0.03, 0.03, ctx.trim), 0, 0.25, s * 0.08));
  },
  rivetCap(ctx, arm, s) {
    arm.add(sph(0.22, ctx.paint, 12));
    rivetRing(arm, 0.16, 8, "z", ctx.trim, 0.025, s * 0.15);
    arm.add(at(drumZ(0.2, 0.04, ctx.trim, 14), 0, 0, s * 0.05));
  },
  exhaust(ctx, arm, s) {
    arm.add(sph(0.2, ctx.steel, 10));
    arm.add(at(dome(0.21, ctx.paint, 1, 12), 0, 0.02, 0));
    stack(ctx, arm, -0.14, 0.12, 0, 0.04, 0.28, { lean: 0.3 });
  },
  hoseFed(ctx, arm, s) {
    arm.add(sph(0.21, ctx.dark, 12));
    const hose = torus(0.18, 0.035, ctx.rubber, Math.PI * 1.2, 12); hose.rotation.set(0, Math.PI / 2, 0.6); hose.position.set(-0.08, 0.06, -s * 0.02); arm.add(hose);
    arm.add(at(drumZ(0.12, 0.08, ctx.trim, 12), 0, 0, s * 0.08));
  },
};

// ---- Signatures: one per chassis. (ctx, frame) where frame has the torso
// measures { top, front, back, halfW } and the sockets are already placed.
export const SIGNATURES = {
  // Gold: belt-feed chute from the ammo drum over to the gun shoulder.
  beltFeed(ctx, f) {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const t = i / 6, x = f.back - 0.1 + t * 0.35, z = -t * 0.55, y = f.top * 0.4 + Math.sin(t * Math.PI) * 0.18;
      g.add(at(box(0.08, 0.05, 0.1, ctx.trim), x, y, z));
    }
    ctx.torso.add(g);
  },
  // Blue: a flickering pilot light under the chin.
  pilotLight(ctx, f) {
    ctx.torso.add(at(rot(cyl(0.04, 0.05, 0.16, ctx.steel, 8), 0, 0, -Math.PI / 2), f.front + 0.02, -ctx.dims.h * 0.35, 0));
    const flame = sph(0.05, GLOW(0x66aaff, 0x3a7aff, 2), 8); flame.position.set(f.front + 0.12, -ctx.dims.h * 0.35, 0);
    ctx.torso.add(flame); ctx.flickers.push(flame);
  },
  // Purple: a big open spoked flywheel on the left flank.
  flywheel(ctx, f) {
    const w = new THREE.Group(); w.position.set(-0.05, 0, f.halfW + 0.04);
    w.add(torus(0.3, 0.04, ctx.trim, Math.PI * 2, 20));
    for (let i = 0; i < 4; i++) w.add(rot(box(0.03, 0.58, 0.03, ctx.steel), 0, 0, i * Math.PI / 4));
    w.add(drumZ(0.06, 0.08, ctx.dark, 10));
    ctx.torso.add(w); ctx.spinners.push({ o: w, axis: "z", speed: 4 });
  },
  // Pumpkin: cowcatcher on the pelvis and a big headlamp on the smokebox.
  cowcatcher(ctx, f) {
    const cc = new THREE.Group(); cc.position.set(0.3 * ctx.k, -0.12, 0);
    for (let i = -3; i <= 3; i++) { const b = box(0.04, 0.34, 0.04, ctx.trim); b.position.set(0.1 - Math.abs(i) * 0.03, -0.1, i * 0.07); b.rotation.z = 0.5; b.rotation.x = i * 0.12; cc.add(b); }
    cc.add(at(box(0.05, 0.05, 0.5, ctx.dark), 0.02, 0.05, 0));
    ctx.pelvis.add(cc);
    ctx.torso.add(at(rot(cyl(0.1, 0.12, 0.1, ctx.dark, 12), 0, 0, Math.PI / 2), f.front + 0.04, f.top * 0.72, 0));
    const lens = rot(cyl(0.085, 0.085, 0.02, GLOW(0xfff2c0, 0xffd27a, 1.8), 12), 0, 0, Math.PI / 2); lens.position.set(f.front + 0.1, f.top * 0.72, 0);
    ctx.torso.add(lens);
  },
  // Zebra: sword scabbard across the back and a crest pennant.
  scabbard(ctx, f) {
    const s = box(0.05, 0.85, 0.1, ctx.dark); s.position.set(f.back - 0.08, 0.05, 0.12); s.rotation.x = 0.7; ctx.torso.add(s);
    ctx.torso.add(at(box(0.07, 0.12, 0.14, ctx.trim), f.back - 0.08, 0.36, -0.08).rotateX(0.7));
    const pole = cyl(0.015, 0.015, 0.4, ctx.steel, 6); pole.position.set(f.back - 0.02, f.top + 0.1, 0.24); ctx.torso.add(pole);
    const flag = prism([[0, 0], [0.24, -0.06], [0, -0.14]], 0.01, mat(0xc0282d, { roughness: 0.9, metalness: 0, side: THREE.DoubleSide })); flag.position.set(f.back - 0.02, f.top + 0.29, 0.24); flag.rotation.y = Math.PI; ctx.torso.add(flag);
  },
  // Turquoise: a chain winch on the hip with a slack loop of links.
  chainWinch(ctx) {
    const w = new THREE.Group(); ctx.sockets.hip.add(w);
    w.add(drumZ(0.14, 0.18, ctx.trim, 14));
    w.add(at(drumZ(0.17, 0.03, ctx.dark, 14), 0, 0, 0.09));
    for (let i = 0; i < 6; i++) { const l = torus(0.045, 0.014, ctx.steel, Math.PI * 2, 8); l.position.set(0.05, -0.12 - i * 0.07, 0.04); l.rotation.y = i % 2 ? Math.PI / 2 : 0; w.add(l); }
  },
  // Green: rivet hoppers (funnels) on both shoulders of the cab.
  rivetHoppers(ctx, f) {
    for (const s of [-1, 1]) {
      const h = cone(0.12, 0.2, ctx.trim, 10); h.rotation.x = Math.PI; h.position.set(-0.12, f.top + 0.12, s * f.halfW * 0.6); ctx.torso.add(h);
      ctx.torso.add(at(cyl(0.03, 0.03, 0.1, ctx.dark, 6), -0.12, f.top + 0.0, s * f.halfW * 0.6));
    }
  },
  // Copper: brass aiming quadrant with a scale on the right flank.
  aimingQuadrant(ctx, f) {
    const q = new THREE.Group(); q.position.set(0, 0.05, -f.halfW - 0.03);
    q.add(new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 12, 1, 0, Math.PI / 2), mat(0xc8a048, { metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide })));
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; q.add(at(box(0.012, 0.05, 0.012, ctx.dark), Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.005, a - Math.PI / 2)); }
    q.add(at(box(0.3, 0.02, 0.02, ctx.dark), 0.12, 0.08, 0.01, 0.6));
    ctx.torso.add(q);
  },
  // Black: armour skirts hanging off the pelvis.
  armorSkirts(ctx) {
    for (const s of [-1, 1]) {
      const p = box(0.5, 0.42, 0.06, ctx.paint); p.position.set(0.02, -0.25, s * 0.66); p.rotation.x = s * 0.12; ctx.pelvis.add(p);
      rivetRow(ctx.pelvis, [-0.18, -0.1, s * 0.7], [0.22, -0.1, s * 0.7], 4, ctx.trim, 0.025);
    }
    ctx.pelvis.add(at(box(0.08, 0.36, 0.7, ctx.paint), 0.44, -0.22, 0, -0.15));
  },
  // Red: jerry can for the chainsaw on the hip, hose to the arm.
  fuelCan(ctx) {
    const c = new THREE.Group(); ctx.sockets.hip.add(c); c.position.x += 0.04;
    c.add(box(0.26, 0.34, 0.12, mat(0x5a6a3a, { roughness: 0.7 })));
    c.add(at(box(0.18, 0.02, 0.13, ctx.dark), 0, 0.1, 0));
    c.add(at(cyl(0.03, 0.03, 0.06, ctx.dark, 8), 0.08, 0.2, 0));
    c.add(at(box(0.1, 0.03, 0.03, ctx.dark), -0.05, 0.19, 0));
  },
  // Silver: raptor spurs on the backs of both shins.
  talonSpurs(ctx) {
    for (const leg of ctx.legs) {
      const sp = cone(0.06, 0.34, ctx.trim, 6); sp.rotation.z = Math.PI / 2 + 0.5; sp.position.set(-0.22, -leg.shinLen * 0.25, 0); leg.knee.add(sp);
    }
  },
  // Brass: a safety-valve whistle on the dome; its cap jumps when it fires.
  whistle(ctx, f) {
    const w = new THREE.Group(); w.position.set(-0.08, f.top - 0.06, 0.12);
    w.add(at(cyl(0.03, 0.03, 0.18, ctx.brass, 8), 0, 0.09, 0));
    w.add(at(cyl(0.05, 0.05, 0.14, ctx.brass, 10), 0, 0.24, 0));
    const cap = cyl(0.06, 0.04, 0.04, ctx.brass, 10); cap.position.y = 0.33; w.add(cap);
    ctx.torso.add(w); ctx.whistle = cap;
  },
  // Ivory: a signal mast with a yard and two pennants.
  signalMast(ctx, f) {
    const m = new THREE.Group(); m.position.set(f.back + 0.05, f.top, -0.12);
    m.add(at(cyl(0.02, 0.025, 0.62, ctx.steel, 6), 0, 0.31, 0));
    m.add(at(box(0.02, 0.02, 0.3, ctx.steel), 0, 0.48, 0));
    const red = mat(0xc0282d, { roughness: 0.9, metalness: 0, side: THREE.DoubleSide }), yel = mat(0xe0b020, { roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    for (const [z, mm] of [[-0.14, red], [0.14, yel]]) { const p = prism([[0, 0], [-0.2, -0.05], [0, -0.1]], 0.01, mm); p.position.set(0, 0.47, z); m.add(p); }
    m.add(at(sph(0.035, GLOW(0xffe0a0, 0xffc060, 1.4), 8), 0, 0.64, 0));
    ctx.torso.add(m);
  },
  // Jade: stacked ceramic insulators on the shoulders.
  insulators(ctx, f) {
    const white = mat(0xf0ece0, { roughness: 0.25, metalness: 0.05 });
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(-0.1, f.top - 0.04, s * f.halfW * 0.65);
      for (let i = 0; i < 3; i++) g.add(at(cyl(0.08 - i * 0.012, 0.09 - i * 0.012, 0.05, white, 10), 0, 0.03 + i * 0.07, 0));
      g.add(at(cyl(0.015, 0.015, 0.24, ctx.brass, 6), 0, 0.12, 0));
      ctx.torso.add(g);
    }
  },
};
