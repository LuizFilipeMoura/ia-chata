import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Mech } from "../mechs.js";
import { CHASSIS } from "../../../../shared/game-state.js";
import { BASE_RADIUS } from "../../../../shared/geometry.js";
import { fits, measureBody } from "./envelope.js";
import { SKIN_IDS } from "./skins.js";
import { CLUTTER_PIECES } from "./wear.js";

function rig(name, extra = {}) {
  const c = CHASSIS.find((c) => c.name === name);
  const m = new Mech({ id: `poc-${name}`, name, chassis: c.id, owner: "a", weightClass: c.class,
    longRange: c.longRange, melee: c.melee, radius: BASE_RADIUS[c.class], ...extra });
  m.t = 0;
  return m;
}
const point = (o, y) => o.localToWorld(new THREE.Vector3(0, y, 0));
test("approved Tyrian idle tuning applies to every skin and remains per-instance", () => {
  for (const skin of SKIN_IDS) {
    assert.deepEqual(rig("Tyrian", { skin }).built.shake, { magnitude: 0.11, frequency: 0.82 });
    assert.deepEqual(rig("Black", { skin }).built.shake, { magnitude: 1, frequency: 1 });
  }
  const tuned = rig("Tyrian");
  tuned.built.shake.magnitude = 2;
  assert.deepEqual(rig("Tyrian").built.shake, { magnitude: 0.11, frequency: 0.82 });
});

test("shake tuning scales displacement without moving feet or speeding machinery", () => {
  for (const name of ["Black", "Tyrian"]) {
    const a = rig(name), b = rig(name);
    Object.assign(a.built.shake, { magnitude: 1, frequency: 1 });
    b.built.shake.magnitude = 2;
    b.built.shake.frequency = 0.5;
    a.update(0.1); b.update(0.1);
    assert.equal(a.built.mechanics.phase, b.built.mechanics.phase, "engine keeps its own cadence");
    assert.ok(a.legs[0].ankle.getWorldPosition(new THREE.Vector3()).distanceTo(b.legs[0].ankle.getWorldPosition(new THREE.Vector3())) < 1e-9);
    b.built.mechanics.shakePhase = a.built.mechanics.shakePhase;
    b.built.updateMechanical(0);
    assert.ok(Math.abs((b.torso.position.y - b.built.torsoRestY) - 2 * (a.torso.position.y - a.built.torsoRestY)) < 1e-9);
    b.built.shake.magnitude = 0;
    b.built.updateMechanical(0);
    assert.equal(b.torso.position.y, b.built.torsoRestY);
    assert.equal(Math.abs(b.torso.rotation.x), 0);
    assert.equal(Math.abs(b.torso.rotation.z), 0);
  }
});

test("shake frequency changes continuously and shutdown freezes its phase", () => {
  const m = rig("Tyrian"), built = m.built;
  built.updateMechanical(0.02);
  const phase = built.mechanics.shakePhase, y = built.torso.position.y;
  built.shake.frequency = 2;
  built.updateMechanical(0);
  assert.equal(built.torso.position.y, y, "turning the frequency knob does not jump phase");
  built.updateMechanical(0.02);
  assert.ok(Math.abs(built.mechanics.shakePhase - phase - 0.16) < 1e-9);
  const stopped = built.mechanics.shakePhase;
  for (const state of [{ shutdown: true }, { broken: { engine: true } }, { destroyed: true }]) {
    built.updateMechanical(0.1, state);
    assert.equal(built.mechanics.shakePhase, stopped);
  }
});

function attached(link) {
  const a = link.a.getWorldPosition(new THREE.Vector3());
  const b = link.b.getWorldPosition(new THREE.Vector3());
  assert.ok(point(link.sleeve, -0.5).distanceTo(a) < 1e-6, "actuator base remains attached");
  assert.ok(point(link.rod, 0.5).distanceTo(b) < 1e-6, "rod end remains attached");
  const sleeveEnd = point(link.sleeve, 0.5), rodStart = point(link.rod, -0.5);
  const sleeveAxis = sleeveEnd.clone().sub(a).normalize();
  const insertion = sleeveEnd.clone().sub(rodStart);
  assert.ok(insertion.dot(sleeveAxis) > 0.001, "rod remains inserted into its fixed barrel");
  assert.ok(insertion.clone().cross(sleeveAxis).length() < 1e-6, "rod slides along the barrel axis");
}

test("POC defaults replace only Black and Tyrian, with explicit legacy comparison", () => {
  for (const name of ["Black", "Tyrian"]) {
    const m = rig(name), legacy = rig(name, { remodel: false });
    assert.equal(m.built.remodel, true);
    assert.ok(!legacy.built.remodel);
    assert.equal(m.radius, legacy.radius, "gameplay base radius is unchanged");
    assert.ok(measureBody(m).height < measureBody(legacy).height, "tank walker sits lower");
    assert.ok(measureBody(m).radius > measureBody(legacy).radius, "tank walker has a broader load-bearing body");
  }
  assert.ok(!rig("Gold").built.remodel);
});

test("hydraulics stay joined at walking, recoil, aim and melee extremes", () => {
  for (const name of ["Black", "Tyrian"]) {
    const m = rig(name);
    assert.ok(m.built.mechanics?.links.length >= 6);
    const barrelLengths = m.built.mechanics.links.map((l) => l.sleeve.scale.y);
    m.walking = 1;
    m.aimYaw = 1;
    for (let i = 0; i < 80; i++) {
      if (i % 20 === 0) { m.fire("melee"); m.fire("longRange"); }
      m.update(1 / 30);
      m.root.updateMatrixWorld(true);
      for (const [j, link] of m.built.mechanics.links.entries()) {
        attached(link);
        assert.equal(link.sleeve.scale.y, barrelLengths[j], "hydraulic barrel cannot stretch during articulation");
      }
      const { crank, piston } = m.built.mechanics;
      const crankPosition = crank.getWorldPosition(new THREE.Vector3());
      const pistonPosition = piston.getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(crankPosition.distanceTo(pistonPosition) - 0.30 * m.baseScale) < 1e-6, "crank rod never stretches");
    }
  }
});

test("engine freezes on shutdown, broken engine and destruction; restart resumes phase", () => {
  for (const name of ["Black", "Tyrian"]) for (const stop of ["shutdown", "broken", "destroyed"]) {
    const m = rig(name), reference = rig(name);
    assert.ok(m.built.mechanics, "remodeled engine exposes its linkage");
    m.update(0.16); reference.update(0.16);
    const engine = m.built.mechanics;
    assert.ok(engine.exhaustCap, "engine carries a hinged exhaust cap");
    const phase = engine.phase, crank = engine.crank.position.clone(), piston = engine.piston.position.clone();
    const flap = engine.exhaustCap.rotation.z;
    if (stop === "shutdown") m.setStatus({ shutdown: true });
    if (stop === "broken") m.setParts({ engine: true });
    if (stop === "destroyed") m.destroy();
    for (let i = 0; i < 10; i++) m.update(0.1);
    assert.equal(engine.phase, phase);
    assert.ok(engine.crank.position.equals(crank));
    assert.ok(engine.piston.position.equals(piston));
    assert.equal(engine.exhaustCap.rotation.z, flap, "exhaust flap stops with engine");
    if (stop === "destroyed") continue;
    m.setStatus({}); m.setParts({});
    m.update(0.016); reference.update(0.016);
    assert.ok(Math.abs(engine.phase - reference.built.mechanics.phase) < 1e-12, "wall time cannot jump resumed engine");
    assert.ok(engine.piston.position.distanceTo(reference.built.mechanics.piston.position) < 1e-10);
  }
});

test("diesel chug moves the cab perceptibly while feet stay planted, then freezes on shutdown", () => {
  for (const name of ["Black", "Tyrian"]) {
    const m = rig(name);
    const yValues = [];
    for (let i = 0; i < 180; i++) {
      m.update(1 / 60);
      assert.equal(m.pelvis.position.y, m.hipH, "chug cannot bounce the legs or feet");
      assert.equal(m.body.rotation.x, 0, "chug cannot rock the whole miniature");
      yValues.push(m.torso.position.y);
      assert.ok(fits(m).ok, "opened exhaust flap stays inside the art envelope");
    }
    const travel = Math.max(...yValues) - Math.min(...yValues);
    const magnitude = m.built.shake.magnitude;
    assert.ok(travel > 0.025 * magnitude && travel < 0.12 * magnitude, "cab movement respects the approved chassis magnitude");
    m.setStatus({ shutdown: true });
    m.update(1 / 60);
    const y = m.torso.position.y, sway = m.torso.rotation.z;
    for (let i = 0; i < 60; i++) m.update(1 / 60);
    assert.equal(m.torso.position.y, y);
    assert.equal(m.torso.rotation.z, sway);
    m.setHurt(1); m.update(1 / 60);
    assert.ok(m.body.rotation.x > 0.05, "damage pose remains active while engine is stopped");
  }
});

function boundsIn(object, frame) {
  frame.updateWorldMatrix(true, true);
  const inverse = frame.matrixWorld.clone().invert(), b = new THREE.Box3(), v = new THREE.Vector3();
  object.traverse((o) => {
    if (!o.isMesh) return;
    const positions = o.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) b.expandByPoint(v.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld).applyMatrix4(inverse));
  });
  return b;
}

test('rear pennant and antenna bases touch supporting metal through cab shake', () => {
  const closest = new THREE.Vector3();
  for (const name of ['Tyrian', 'Black']) for (const skin of SKIN_IDS) {
    const m = rig(name, { skin, clutter: ['antenna'] }), masts = [];
    m.torso.traverse((group) => {
      if (!group.isGroup) return;
      if (group.children.some((child) => {
        const p = child.geometry?.parameters;
        return p && ((p.height === .26 && p.radiusTop === .012) || (p.height === .05 && p.radiusTop === .02));
      })) masts.push(group);
    });
    assert.equal(masts.length, skin === 'ace' ? 2 : 1, 'exercise the actual antenna and pennant geometry');
    m.built.shake.magnitude = 2; m.walking = 1; m.aimYaw = .8;
    for (const dt of [0, .05, .1, .2]) {
      m.update(dt); m.root.updateMatrixWorld(true);
      const support = [], armor = [], hullMeshes = new Set();
      for (const part of [m.chest, m.torso.getObjectByName('diesel-engine')])
        part.traverse((mesh) => { if (mesh.isMesh) hullMeshes.add(mesh); });
      m.torso.traverse((mesh) => {
        if (!mesh.isMesh) return;
        for (let parent = mesh.parent; parent; parent = parent.parent) if (masts.includes(parent)) return;
        const p = mesh.geometry.attributes.position, index = mesh.geometry.index;
        for (let i = 0; i < (index?.count ?? p.count); i += 3) {
          const triangle = new THREE.Triangle(...[0, 1, 2].map((j) =>
            new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld)));
          support.push(triangle);
          if (hullMeshes.has(mesh)) armor.push(triangle);
        }
      });
      for (const mast of masts) {
        const foot = mast.getWorldPosition(new THREE.Vector3());
        const gap = Math.min(...support.map((triangle) => foot.distanceTo(triangle.closestPointToPoint(foot, closest))));
        assert.ok(gap < 1e-5, `${name}/${skin}: mast base floats ${gap} from its support`);
        const armorGap = Math.min(...armor.map((triangle) => foot.distanceTo(triangle.closestPointToPoint(foot, closest))));
        assert.ok(armorGap < .075 * m.baseScale * m.built.ctx.k, 'mount must reach real armor, not float with the mast');
      }
    }
  }
});

test("Black shield clears its hull and legs through idle, walking and full melee stroke", () => {
  const m = rig("Black");
  m.walking = 1; m.aimYaw = 1;
  for (let i = 0; i < 120; i++) {
    if (i % 35 === 0) m.fire("melee");
    m.update(1 / 60);
    const shield = boundsIn(m.me.shield, m.torso), hull = boundsIn(m.chest, m.torso);
    assert.ok(shield.min.z > hull.max.z + 0.04, "shield must stand clear of the casemate, including its inward edge");
    for (const leg of m.legs) leg.hip.traverse((o) => {
      if (o.isMesh) assert.ok(!shield.intersectsBox(boundsIn(o, m.torso)), "shield cannot cut through a walking leg part");
    });
  }
});

test("Tyrian saw stroke remains inside its unchanged physical base footprint", () => {
  const m = rig("Tyrian"), v = new THREE.Vector3();
  m.walking = 1; m.aimYaw = 1; m.fire("melee");
  for (let i = 0; i < 50; i++) {
    m.update(1 / 60); m.root.updateMatrixWorld(true);
    m.body.traverse((o) => {
      if (!o.isMesh) return;
      const positions = o.geometry.attributes.position;
      for (let j = 0; j < positions.count; j++) {
        v.fromBufferAttribute(positions, j).applyMatrix4(o.matrixWorld);
        assert.ok(Math.hypot(v.x, v.z) <= m.radius + 0.001, "animated weapon cannot enlarge the miniature footprint");
      }
    });
  }
});

test("running diesel emits normal idle smoke at real stack mouths and stops on shutdown", () => {
  for (const name of ["Black", "Tyrian"]) {
    const m = rig(name), emitted = [];
    const fx = { exhaust(position, params) { emitted.push({ position: position.clone(), ...params }); } };
    for (let i = 0; i < 120; i++) { m.update(1 / 60); m.emitAmbient(fx, 1 / 60); }
    assert.ok(emitted.length >= 12 && emitted.length <= 40, "cold diesel should give controlled regular puffs");
    assert.ok(emitted.every((e) => e.dark >= 0.8 && e.opacity >= 0.35), "idle smoke should read as soot");
    assert.ok(emitted.every((e) => e.position.y > 1), "smoke originates at upper exhaust mouths");
    m.setStatus({ shutdown: true });
    const count = emitted.length;
    for (let i = 0; i < 120; i++) { m.update(1 / 60); m.emitAmbient(fx, 1 / 60); }
    assert.equal(emitted.length, count);
  }
});

test("worn bent exhaust remains seated on its manifold", () => {
  for (const name of ["Black", "Tyrian"]) {
    const worn = rig(name, { skin: "worn" }), factory = rig(name);
    worn.root.updateMatrixWorld(true); factory.root.updateMatrixWorld(true);
    for (let i = 0; i < worn.stacks.length; i++) {
      const stack = worn.stacks[i], reference = factory.stacks[i];
      const base = stack.localToWorld(new THREE.Vector3(0, -stack.geometry.parameters.height / 2, 0));
      const mount = reference.localToWorld(new THREE.Vector3(0, -reference.geometry.parameters.height / 2, 0));
      assert.ok(base.distanceTo(mount) < 1e-6, "bending rotates around the mounting point");
    }
  }
});

test("every POC skin and full wear stay inside dedicated art envelope and base", () => {
  for (const name of ["Black", "Tyrian"]) for (const skin of SKIN_IDS) {
    const m = rig(name, { skin, clutter: CLUTTER_PIECES });
    assert.equal(m.built.remodel, true);
    m.setWear({ hull: [0, 10], arms: [0, 10], legs: [0, 10], engine: [0, 10] });
    const result = fits(m);
    assert.ok(result.ok, `${name}/${skin}: ${JSON.stringify(result)}`);
    assert.ok(result.radius < m.radius, `${name}/${skin} overhangs gameplay base`);
    assert.ok(result.bottom >= 0.13, `${name}/${skin} sinks below base`);
    m.body.traverse((o) => {
      if (o.isMesh && o.material?.isMeshStandardMaterial) assert.ok(o.material.roughness >= 0.7, `${name}/${skin}/${o.name} needs reflection to read`);
    });
  }
});

test("paint stripes, corrosion and repair patches remain on the shaped chassis surfaces", () => {
  const point = new THREE.Vector3(), closest = new THREE.Vector3();
  for (const name of ["Black", "Tyrian"]) for (const skin of ["ace", "worn", "rust", "refit"]) {
    const m = rig(name, { skin }), marks = [];
    m.root.updateMatrixWorld(true);
    const triangles = [];
    m.chest.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position, index = o.geometry.index;
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const vertices = [0, 1, 2].map((j) => new THREE.Vector3()
          .fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(o.matrixWorld));
        triangles.push(new THREE.Triangle(...vertices));
      }
    });
    m.torso.traverse((o) => { if (o.isMesh && o.userData.surfaceMark) marks.push(o); });
    assert.ok(marks.length, "paint must have a real supporting surface");
    for (const mark of marks) {
      const positions = mark.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += Math.max(1, Math.floor(positions.count / 40))) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mark.matrixWorld);
        let gap = Infinity;
        for (const triangle of triangles) gap = Math.min(gap, point.distanceTo(triangle.closestPointToPoint(point, closest)));
        assert.ok(gap < 0.025, `${name}/${skin} surface mark floats ${gap} world units from armor`);
      }
    }
  }
});
