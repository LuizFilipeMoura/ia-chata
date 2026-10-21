import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Mech } from '../mechs.js';
import { CHASSIS } from '../../../../shared/game-state.js';
import { BASE_RADIUS } from '../../../../shared/geometry.js';
import { SKIN_IDS } from './skins.js';
import { fits } from './envelope.js';

function rig(skin = 'ace', detail = 'hero') {
  const c = CHASSIS.find(c => c.name === 'Tyrian');
  return new Mech({ id: 'material-lab-Tyrian', name: c.name, chassis: c.id,
    owner: 'a', weightClass: c.class, radius: BASE_RADIUS[c.class],
    longRange: c.longRange, melee: c.melee, skin, detail });
}
function count(model) {
  let triangles = 0, meshes = 0;
  model.root.traverseVisible(o => {
    if (!o.isMesh) return;
    meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  return { triangles, meshes };
}

test('Tyrian inspection geometry uses its detail budget without multiplying draw submissions', () => {
  for (const skin of SKIN_IDS) {
    const m = rig(skin), stats = count(m), original = rig(skin, 'standard');
    assert.ok(stats.triangles >= 35000 && stats.triangles <= 45000, `${skin}: ${JSON.stringify(stats)}`);
    assert.ok(stats.meshes <= 140, `${skin}: ${stats.meshes} meshes`);
    assert.ok(count(original).triangles < 14000, 'battlefield version keeps its existing budget');
    assert.ok(fits(m).ok, `${skin}: ${JSON.stringify(fits(m))}`);
    assert.equal(m.radius, original.radius);
    assert.ok(m.muzzleWorld('longRange').distanceTo(original.muzzleWorld('longRange')) < 1e-9);
    m.body.traverse(o => {
      if (!o.isMesh) return;
      assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite), 'valid positions');
      if (o.material.isMeshStandardMaterial) assert.ok(o.material.roughness >= .7, 'matte guard');
    });
  }
});

test('Tyrian detailed machinery stays attached through animation and stops with the engine', () => {
  const m = rig();
  assert.ok(m.built.mechanics.fan, 'visible driven cooling fan');
  m.walking = 1; m.aimYaw = .8;
  for (let i = 0; i < 30; i++) {
    m.update(1 / 30);
    for (const link of m.built.mechanics.links) {
      const start = link.sleeve.localToWorld(new THREE.Vector3(0, -.5, 0));
      assert.ok(start.distanceTo(link.a.getWorldPosition(new THREE.Vector3())) < 1e-6);
    }
  }
  const fan = m.built.mechanics.fan;
  const before = fan.rotation.z;
  m.update(.1); assert.notEqual(fan.rotation.z, before);
  m.setStatus({ shutdown: true });
  m.update(.1); const stopped = fan.rotation.z;
  m.update(.1); assert.equal(fan.rotation.z, stopped);
  assert.deepEqual(m.built.shake, { magnitude: .11, frequency: .82 });
});
