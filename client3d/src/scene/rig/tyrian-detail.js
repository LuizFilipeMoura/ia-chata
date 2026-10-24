// Tyrian inspection-only truck machinery and weapon details.
import { THREE, box, cyl, at, rot, drumZ } from './kit.js';
import { refineHeroPart, batch, ring, rounded, hose, rod, boltCircle, detailExhaustStacks } from './detail-kit.js';
const TAU = Math.PI * 2;

export function addTyrianMachinery(built, mats) {
  const { chest, legs, torso, mechanics } = built;
  const cab = batch(chest, 'torso');
  // Split windscreen wipers lie on the raked glazing, with pivots at its foot.
  for (const side of [-1, 1]) {
    const z = side * .19;
    cab.add(rod([.415, .48, z], [.335, .605, z + .07], .009, mats.steel));
    cab.add(rod([.35, .59, z + .005], [.325, .63, z + .13], .011, mats.rubber));
    // Hinged service door, sill, grab handle and corner fasteners.
    cab.add(at(rounded(.42, .25, .025, mats.paint), -.22, -.035, side * .445));
    for (const y of [-.10, .04]) cab.add(at(cyl(.018, .018, .065, mats.steel, 12), -.43, y, side * .461));
    cab.add(hose([[-.35, .045, side * .455], [-.35, .08, side * .50], [-.22, .08, side * .50], [-.22, .045, side * .455]], .012, mats.steel, 12));
    // Tow eyes have real shanks through the bumper.
    cab.add(at(rod([0, 0, 0], [.09, 0, 0], .028, mats.steel), 1.025, -.34, side * .39));
    cab.add(at(rot(ring(.054, .016, mats.steel), 0, Math.PI / 2, 0), 1.10, -.34, side * .39));
    // Paired hood latches close onto the bonnet's lower side lip.
    for (const x of [.25, .69]) {
      cab.add(at(rounded(.055, .09, .025, mats.dark), x, -.15, side * (.43 - (x - .05) * .108)));
      cab.add(at(cyl(.012, .012, .065, mats.brass, 12), x, -.15, side * (.45 - (x - .05) * .108)));
    }
  }
  cab.flush();

  const engine = torso.getObjectByName('diesel-engine'), b = batch(engine, 'backpack');
  // Three exposed finned cylinder barrels and curved injector pipes.
  for (const z of [-.34, 0, .34]) {
    for (let i = 0; i < 7; i++) b.add(at(cyl(.142, .142, .014, mats.dark, 24), -.11, -.08 + i * .042, z));
    b.add(hose([[.035, -.05, z], [.10, .05, z], [.09, .31, z], [-.11, .31, z]], .012, mats.brass));
    b.add(at(rounded(.12, .045, .15, mats.paint), -.11, .315, z));
    for (const x of [-.15, -.07]) b.add(at(cyl(.013, .013, .02, mats.steel, 6), x, .348, z));
  }
  // Oil filter, drain union, pressure line and a manifold-mounted valve wheel.
  b.add(at(cyl(.074, .063, .23, mats.paint, 32), .08, -.13, -.53));
  b.add(at(cyl(.082, .082, .035, mats.steel, 32), .08, -.015, -.53));
  b.add(at(drumZ(.035, .045, mats.brass, 6), .08, -.24, -.59));
  b.add(hose([[.08, -.015, -.53], [.14, .02, -.53], [.14, .15, -.40], [.02, .18, -.40]], .024, mats.rubber));
  b.add(hose([[-.09, .44, -.37], [-.22, .44, -.45], [-.23, .10, -.42], [-.11, -.06, -.34]], .018, mats.rubber));
  b.add(rod([-.23, .2, -.42], [-.23, .2, -.52], .023, mats.brass));
  b.add(at(ring(.065, .012, mats.brass), -.23, .20, -.53));
  for (let i = 0; i < 3; i++) b.add(at(rot(box(.12, .012, .012, mats.brass), 0, 0, i * TAU / 3), -.23, .2, -.53));
  detailExhaustStacks(built.stacks, mats);
  // Negative-side cooling fan: shaft, mounting bars and protective wire cage.
  const fan = new THREE.Group(); fan.name = 'diesel-cooling-fan'; fan.position.set(-.15, -.02, -.64); engine.add(fan);
  const blades = batch(fan, 'backpack');
  blades.add(drumZ(.052, .075, mats.steel, 24));
  for (let i = 0; i < 6; i++) blades.add(at(rot(rounded(.16, .055, .018, mats.steel), .25, 0, i * TAU / 6), Math.cos(i * TAU / 6) * .10, Math.sin(i * TAU / 6) * .10, 0));
  blades.flush(); mechanics.fan = fan;
  b.add(at(drumZ(.08, .14, mats.dark, 32), -.15, -.02, -.55));
  for (const radius of [.11, .20]) b.add(at(ring(radius, .008, mats.steel), -.15, -.02, -.68));
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    b.add(rod([-.15, -.02, -.69], [-.15 + Math.cos(a) * .20, -.02 + Math.sin(a) * .20, -.69], .006, mats.dark));
  }
  for (const y of [-.18, .14]) b.add(at(rounded(.26, .035, .10, mats.dark), -.15, y, -.56));
  // Rear radiator frame carries its slats and the existing pennant mounts.
  for (const z of [-.52, .52]) b.add(at(rounded(.075, .47, .045, mats.dark), -.43, -.03, z));
  for (const y of [-.25, .20]) b.add(at(rounded(.075, .035, 1.08, mats.dark), -.43, y, 0));
  b.flush();

  // Greaseable bearing covers and leaf-spring packs belong to each leg pivot.
  for (const leg of legs) {
    for (const [parent, radius, outerZ] of [[leg.hip, .15, .225], [leg.knee, .125, .255]]) {
      const p = batch(parent, 'legs'), z = leg.side * outerZ;
      p.add(at(drumZ(radius, .055, mats.paint, 32), 0, 0, z));
      p.add(at(drumZ(.055, .075, mats.dark, 24), 0, 0, z));
      boltCircle(p, [0, 0, z + leg.side * .032], radius * .77, 6, mats.steel);
      p.add(at(drumZ(.018, .025, mats.brass, 6), 0, 0, z + leg.side * .05));
      p.flush();
    }
    const feet = batch(leg.ankle, 'feet');
    for (const side of [-1, 1]) for (let layer = 0; layer < 3; layer++) {
      const spring = new THREE.Shape(), left = -.12 + layer * .04, right = .39 - layer * .04, arch = .12 + layer * .015;
      spring.moveTo(left, .045); spring.quadraticCurveTo(.12, arch, right, .045);
      spring.lineTo(right, .035); spring.quadraticCurveTo(.12, arch - .01, left, .035); spring.closePath();
      const geo = new THREE.ExtrudeGeometry(spring, { depth: .035, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geo.translate(0, 0, side * .18 - .0175); feet.add(new THREE.Mesh(geo, mats.dark));
    }
    feet.flush();
  }
}

export function detailTyrianWeapons(lr, me, mats) {
  // Retain the original spinning groups and muzzle positions.
  for (const root of [lr.group, me.group]) root.traverse(o => { if (o.isMesh) refineHeroPart(o); });
  const rotor = batch(lr.spin, 'weapons');
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6, y = Math.cos(a) * .14, z = Math.sin(a) * .14;
    rotor.add(at(rot(ring(.045, .007, mats.steel), 0, Math.PI / 2), 1.102, y, z));
    rotor.add(at(rot(cyl(.033, .033, .006, mats.dark, 24), 0, 0, Math.PI / 2), 1.104, y, z));
  }
  rotor.flush();
  const gun = batch(lr.group, 'weapons');
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    gun.add(at(rot(box(.018, .018, .23, mats.steel), 0, 0, a), -.14 + Math.cos(a) * .243, -.20 + Math.sin(a) * .243, -.30));
  }
  gun.add(hose([[-.29, -.12, -.15], [-.39, -.30, -.18], [-.10, -.39, -.18], [.15, -.22, -.15]], .025, mats.rubber));
  gun.flush();
  const saw = batch(me.spin, 'weapons');
  for (const z of [-.032, .032]) {
    saw.add(at(ring(.32, .009, mats.dark), 0, 0, z));
    boltCircle(saw, [0, 0, z], .19, 8, mats.steel);
  }
  saw.flush();
}
