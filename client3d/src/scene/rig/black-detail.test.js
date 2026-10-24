import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Mech } from '../mechs.js';
import { CHASSIS } from '../../../../shared/game-state.js';
import { BASE_RADIUS } from '../../../../shared/geometry.js';
import { SKIN_IDS } from './skins.js';
import { fits } from './envelope.js';

const rig = (skin = 'ace', detail = 'hero') => {
  const c = CHASSIS.find(c => c.name === 'Black');
  return new Mech({ id: 'material-lab-Black', name: c.name, chassis: c.id, owner: 'a',
    weightClass: c.class, radius: BASE_RADIUS[c.class], longRange: c.longRange, melee: c.melee, skin, detail });
};
const count = m => {
  let triangles = 0, meshes = 0;
  m.root.traverseVisible(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
  return { triangles, meshes };
};
const boundsIn = (object, frame) => {
  frame.updateWorldMatrix(true, true);
  const inv = frame.matrixWorld.clone().invert(), bounds = new THREE.Box3(), p = new THREE.Vector3();
  object.traverse(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) bounds.expandByPoint(p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv));
  });
  return bounds;
};

test('Black hero meets inspection budget across skins without changing gameplay contracts', () => {
  for (const skin of SKIN_IDS) {
    const m = rig(skin), standard = rig(skin, 'standard'), stats = count(m);
    assert.equal(m.built.detail, 'hero');
    assert.ok(stats.triangles >= 35000 && stats.triangles <= 45000, `${skin}: ${JSON.stringify(stats)}`);
    assert.ok(stats.meshes <= 160, `${skin}: ${stats.meshes} meshes`);
    assert.ok(count(standard).triangles < 12000);
    assert.equal(m.chest.name, 'sloped-tank-casemate');
    assert.equal(m.radius, standard.radius);
    assert.ok(m.muzzleWorld('longRange').distanceTo(standard.muzzleWorld('longRange')) < 1e-9);
    assert.ok(fits(m).ok, `${skin}: ${JSON.stringify(fits(m))}`);
    m.body.traverse(o => {
      if (!o.isMesh) return;
      assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));
      for (const mat of [o.material].flat()) if (mat.isMeshStandardMaterial) assert.ok(mat.roughness >= .7);
    });
  }
});

test('Black detailed shield assembly clears body and legs throughout bash and walk', () => {
  const m = rig();
  assert.equal(m.built.detail, 'hero');
  m.walking = 1; m.aimYaw = 1;
  for (let i = 0; i < 120; i++) {
    if (i % 35 === 0) m.fire('melee');
    m.update(1 / 60);
    const shield = boundsIn(m.me.group, m.torso), hull = boundsIn(m.chest, m.torso);
    assert.ok(shield.min.z > hull.max.z + .04, `shield gap ${shield.min.z - hull.max.z}`);
    for (const leg of m.legs) leg.hip.traverse(o => {
      if (o.isMesh) assert.ok(!shield.intersectsBox(boundsIn(o, m.torso)), 'shield hardware intersects leg');
    });
    for (const link of m.built.mechanics.links) {
      const a = link.sleeve.localToWorld(new THREE.Vector3(0, -.5, 0));
      const b = link.rod.localToWorld(new THREE.Vector3(0, .5, 0));
      assert.ok(a.distanceTo(link.a.getWorldPosition(new THREE.Vector3())) < 1e-6);
      assert.ok(b.distanceTo(link.b.getWorldPosition(new THREE.Vector3())) < 1e-6);
    }
  }
});

test('Black detailed cooling fan runs, stops and resumes while preserving its idle tuning', () => {
  for (const stop of ['shutdown', 'engine', 'destroyed']) {
    const m = rig(), fan = m.built.mechanics.fan;
    assert.ok(fan, 'Black has driven cooling machinery');
    assert.deepEqual(m.built.shake, { magnitude: 1, frequency: 1 });
    const first = fan.rotation.z; m.update(.1); assert.notEqual(fan.rotation.z, first);
    if (stop === 'shutdown') m.setStatus({ shutdown: true });
    if (stop === 'engine') m.setParts({ engine: true });
    if (stop === 'destroyed') m.destroy();
    const stopped = fan.rotation.z;
    m.update(.1); m.update(.1); assert.equal(fan.rotation.z, stopped);
    if (stop !== 'destroyed') {
      m.setStatus({}); m.setParts({}); m.update(.1); assert.notEqual(fan.rotation.z, stopped);
    }
  }
});
