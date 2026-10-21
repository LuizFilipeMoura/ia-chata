// Black inspection model: cast tank fittings and enclosed heavy diesel plant.
// Every detail is owned by its actual chassis, joint or weapon assembly.
import { THREE, box, cyl, at, rot, drumX, drumZ } from './kit.js';
import { refineHeroPart, batch, ring, rounded, hose, rod, boltCircle, detailExhaustStacks } from './detail-kit.js';

const TAU = Math.PI * 2;
const ringX = (r, tube, mat) => rot(ring(r, tube, mat), 0, Math.PI / 2, 0);
const ringY = (r, tube, mat) => rot(ring(r, tube, mat), Math.PI / 2, 0, 0);

export function addBlackMachinery(built, mats) {
  const { chest, torso, legs, mechanics } = built;
  const armor = batch(chest, 'torso');
  // Weld seams follow the actual upper glacis edge; no decoration in mid-air.
  armor.add(rod([.505, .368, -.53], [.505, .368, .53], .012, mats.steel, 12));
  for (const side of [-1, 1]) {
    // Stand-off applique has four spacers connecting to the sloped hull.
    for (const x of [-.43, .20]) for (const y of [-.13, .08]) {
      armor.add(at(drumZ(.044, .18, mats.dark, 16), x, y, side * .88));
      armor.add(at(drumZ(.028, .035, mats.steel, 6), x, y, side * .978));
    }
    // Shoulder-level service handles seat through the armored deck.
    armor.add(hose([[-.52, .425, side * .59], [-.52, .51, side * .59], [-.25, .51, side * .59], [-.25, .425, side * .59]], .018, mats.steel));
    for (const x of [-.52, -.25]) armor.add(at(cyl(.035, .035, .025, mats.dark, 12), x, .435, side * .59));
    // Front recovery eyes: horizontal pins into the thick lower glacis.
    armor.add(rod([.96, -.29, side * .57], [1.10, -.29, side * .57], .045, mats.dark, 16));
    armor.add(at(ringX(.068, .022, mats.steel), 1.105, -.29, side * .57));
    // Small bolted inspection ports on the rear half of the deck.
    armor.add(at(cyl(.11, .12, .045, mats.paint, 32), -.55, .443, side * .33));
    armor.add(at(rounded(.11, .025, .026, mats.trim), -.55, .475, side * .33));
    // Replace tiny plain skirt fasteners with captive hinge barrels.
    for (const x of [-.39, .02, .43]) {
      armor.add(at(rot(cyl(.032, .032, .26, mats.steel, 16), 0, 0, Math.PI / 2), x, -.405, side * .73));
      for (const dx of [-.105, .105]) armor.add(at(rounded(.045, .07, .05, mats.dark), x + dx, -.40, side * .73));
    }
  }
  armor.flush();

  const cupola = torso.getObjectByName('recessed-command-cupola'), head = batch(cupola, 'head');
  // Circular hatch with gasket, rear hinges and a grab bar, distinct from cab glass.
  head.add(at(cyl(.285, .29, .035, mats.rubber, 40), -.24, .655, 0));
  head.add(at(cyl(.275, .285, .035, mats.paint, 40), -.24, .684, 0));
  head.add(at(ringY(.26, .008, mats.steel), -.24, .705, 0));
  for (const z of [-.16, .16]) head.add(at(drumZ(.035, .12, mats.steel, 16), -.50, .69, z));
  head.add(hose([[-.21, .70, -.11], [-.21, .77, -.11], [-.21, .77, .11], [-.21, .70, .11]], .016, mats.steel));
  for (const side of [-1, 1]) {
    head.add(at(rounded(.14, .07, .11, mats.dark), -.24, .65, side * .30));
    head.add(at(box(.10, .028, .014, built.ctx.glass), -.24, .663, side * .36));
  }
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    head.add(at(cyl(.017, .017, .022, mats.steel, 6), -.24 + Math.cos(a) * .315, .658, Math.sin(a) * .315));
  }
  head.flush();

  const engine = torso.getObjectByName('diesel-engine'), block = batch(engine, 'backpack');
  // Heavy enclosed engine: four service heads along its rear deck, injector rail.
  for (const z of [-.39, -.13, .13, .39]) {
    block.add(at(cyl(.10, .12, .09, mats.paint, 24), -.12, .31, z));
    for (const x of [-.19, -.05]) block.add(at(cyl(.016, .016, .025, mats.steel, 6), x, .368, z));
    block.add(hose([[.08, .06, z], [.15, .13, z], [.14, .36, z], [-.02, .36, z]], .014, mats.brass));
  }
  block.add(rod([.10, .10, -.44], [.10, .10, .44], .025, mats.brass));
  // External filter pair, manifolds and bolted service cover on the left side.
  for (const x of [-.04, -.26]) {
    block.add(at(cyl(.074, .065, .23, mats.paint, 32), x, -.08, -.63));
    block.add(at(cyl(.082, .082, .035, mats.steel, 32), x, .052, -.63));
    block.add(at(cyl(.025, .025, .035, mats.brass, 6), x, -.21, -.63));
  }
  block.add(hose([[-.26, .07, -.63], [-.26, .16, -.64], [-.04, .16, -.64], [-.04, .07, -.63]], .022, mats.rubber));
  block.add(hose([[-.04, .16, -.64], [.04, .17, -.61], [.05, .08, -.54]], .022, mats.rubber));
  block.add(at(rounded(.29, .32, .025, mats.paint), -.12, -.04, -.574));
  for (const x of [-.235, -.005]) for (const y of [-.16, .08]) block.add(at(drumZ(.022, .025, mats.steel, 6), x, y, -.60));
  block.add(rod([-.29, .12, -.56], [-.29, .12, -.70], .025, mats.brass));
  block.add(at(ring(.062, .012, mats.brass), -.29, .12, -.71));
  for (let i = 0; i < 3; i++) block.add(at(rot(box(.12, .012, .012, mats.brass), 0, 0, i * TAU / 3), -.29, .12, -.71));
  // Radiator perimeter bolts and substantial frames, ahead of the cooling fan.
  for (const z of [-.53, .53]) block.add(at(rounded(.10, .60, .045, mats.dark), -.44, .01, z));
  for (const y of [-.29, .30]) block.add(at(rounded(.10, .045, 1.10, mats.dark), -.44, y, 0));
  for (const z of [-.50, .50]) for (const y of [-.24, 0, .24]) block.add(at(drumX(.022, .025, mats.steel, 6), -.50, y, z));
  block.flush();
  detailExhaustStacks(built.stacks, mats);

  // Rear-facing fan uses a local Z axis, so the existing engine drive applies.
  const fanFrame = new THREE.Group(); fanFrame.position.set(-.55, -.015, 0); fanFrame.rotation.y = -Math.PI / 2; engine.add(fanFrame);
  fanFrame.name = 'black-cooling-housing';
  const fan = new THREE.Group(); fan.name = 'diesel-cooling-fan'; fanFrame.add(fan); mechanics.fan = fan;
  const rotor = batch(fan, 'backpack');
  rotor.add(drumZ(.065, .065, mats.steel, 32));
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    rotor.add(at(rot(rounded(.17, .06, .018, mats.steel), .30, 0, a), Math.cos(a) * .145, Math.sin(a) * .145, 0));
  }
  rotor.flush();
  const guard = batch(fanFrame, 'backpack');
  // Rotor swept depth is behind z=.075 cage and ahead of z=-.075 supports.
  guard.add(at(drumZ(.09, .11, mats.dark, 32), 0, 0, -.075));
  for (const r of [.12, .20, .26]) guard.add(at(ring(r, .009, mats.steel), 0, 0, .075));
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12, x = Math.cos(a) * .26, y = Math.sin(a) * .26;
    guard.add(rod([0, 0, .085], [x, y, .085], .006, mats.dark));
    if (i % 3 === 0) guard.add(rod([x, y, .075], [x, y, -.075], .016, mats.dark));
  }
  for (const y of [-.20, .20]) guard.add(at(rounded(.40, .035, .04, mats.dark), 0, y, -.075));
  guard.flush();

  for (const leg of legs) {
    for (const [parent, radius, outer] of [[leg.hip, .17, .24], [leg.knee, .15, .27]]) {
      const bearing = batch(parent, 'legs'), z = leg.side * outer;
      bearing.add(at(drumZ(radius, .065, mats.paint, 32), 0, 0, z));
      bearing.add(at(ring(radius * .75, .012, mats.dark), 0, 0, z + leg.side * .035));
      bearing.add(at(drumZ(.065, .08, mats.dark, 24), 0, 0, z));
      boltCircle(bearing, [0, 0, z + leg.side * .044], radius * .77, 8, mats.steel);
      bearing.add(at(drumZ(.022, .03, mats.brass, 6), 0, 0, z + leg.side * .06));
      bearing.flush();
    }
    // Armored toe has replaceable traction cleats and side-mounted spring packs.
    const foot = batch(leg.ankle, 'feet');
    for (const side of [-1, 1]) {
      for (let layer = 0; layer < 4; layer++) {
        const spring = new THREE.Shape(), left = -.17 + layer * .035, right = .43 - layer * .035;
        const arch = .14 + layer * .016;
        spring.moveTo(left, .035); spring.quadraticCurveTo(.13, arch, right, .035);
        spring.lineTo(right, .023); spring.quadraticCurveTo(.13, arch - .012, left, .023); spring.closePath();
        const g = new THREE.ExtrudeGeometry(spring, { depth: .04, bevelEnabled: false, curveSegments: 10, steps: 1 });
        g.translate(0, 0, side * .225 - .02); foot.add(new THREE.Mesh(g, mats.dark));
      }
      for (const x of [-.10, .36]) foot.add(at(box(.055, .09, .065, mats.steel), x, .075, side * .225));
    }
    foot.flush();
  }
}

export function detailBlackWeapons(lr, me, mats) {
  for (const root of [lr.group, me.group]) root.traverse(o => { if (o.isMesh) refineHeroPart(o); });
  const gun = batch(lr.group, 'weapons');
  // Siege breech has bolted service plates, cooling rings and hydraulic hoses.
  for (const side of [-1, 1]) {
    gun.add(at(rounded(.55, .32, .035, mats.dark), -.12, 0, side * .317));
    for (const x of [-.34, .10]) for (const y of [-.11, .11]) gun.add(at(drumZ(.025, .025, mats.steel, 6), x, y, side * .35));
    gun.add(hose([[-.50, -.11, side * .28], [-.62, -.24, side * .33], [.14, -.31, side * .33], [.26, -.03, side * .27]], .028, mats.rubber, 16));
    for (const x of [.12, .61]) gun.add(at(drumX(.082, .04, mats.steel, 24), x, -.03, side * .27));
  }
  for (let i = 0; i < 7; i++) gun.add(at(rot(new THREE.Mesh(new THREE.TorusGeometry(.205, .012, 5, 24), mats.dark), 0, Math.PI / 2, 0), .70 + i * .09, 0, 0));
  gun.add(at(ringX(.24, .022, mats.steel), 1.83, 0, 0));
  gun.add(at(drumX(.195, .012, mats.dark, 40), 1.832, 0, 0));
  gun.add(at(drumX(.10, .035, mats.brass, 32), -.69, 0, 0));
  gun.add(hose([[-.71, -.13, 0], [-.76, -.13, 0], [-.76, .13, 0], [-.71, .13, 0]], .018, mats.steel));
  gun.flush();

  const shield = batch(me.group, 'weapons');
  // Rear cross braces and carrier sockets keep the broad shield mechanically legible.
  for (const z of [-.32, .32]) {
    shield.add(at(rounded(.08, 1.36, .075, mats.dark), .19, 0, z));
    shield.add(rod([.18, -.58, z], [.10, 0, 0], .035, mats.steel));
    shield.add(rod([.10, 0, 0], [.18, .58, z], .035, mats.steel));
    for (const y of [-.61, .61]) shield.add(at(drumX(.045, .06, mats.steel, 16), .16, y, z));
  }
  shield.add(at(drumX(.14, .17, mats.dark, 32), .14, 0, 0));
  shield.add(at(ringX(.15, .018, mats.brass), .51, -.05, 0));
  // Fixed guard lips around the vision slit, top lifting eyes and replaceable lower teeth.
  for (const y of [.36, .50]) shield.add(at(rounded(.08, .035, .50, mats.steel), .46, y, 0));
  for (const z of [-.33, .33]) {
    shield.add(at(ringX(.06, .017, mats.steel), .31, .80, z));
    shield.add(at(rounded(.09, .055, .12, mats.dark), .30, .775, z));
  }
  for (const z of [-.40, -.20, 0, .20, .40]) {
    shield.add(at(rounded(.12, .12, .13, mats.dark), .39, -.74, z));
    shield.add(at(drumX(.023, .025, mats.steel, 6), .46, -.73, z));
  }
  shield.flush();
}
