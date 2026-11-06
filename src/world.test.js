import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constrainMovement, toLocal, toWorld } from './world.js';

const allOpen = { meadow: true, poolroom: true };
const closed = { meadow: false, poolroom: false };
test('world transforms round trip without losing position or height', () => {
  const local = toLocal(toWorld(-1.2, -12, 1.6));
  assert.ok(Math.abs(local.x + 1.2) < 1e-10);
  assert.ok(Math.abs(local.z + 12) < 1e-10);
  assert.equal(local.y, 1.6);
});
test('both doors support repeated round trips through their original opening', () => {
  let scene = 'corridor';
  for (let trip = 0; trip < 10; trip++) {
    for (const [x, z, expected] of [[0, -0.1, 'meadow'], [-1.2, -12.1, 'poolroom'], [-1.2, -11.9, 'meadow'], [0, 0.1, 'corridor']]) {
      const position = toWorld(x, z);
      scene = constrainMovement(position, scene, allOpen);
      assert.equal(scene, expected);
      assert.ok(position.distanceTo(toWorld(x, z)) < 1e-9, 'crossing must preserve world position');
    }
  }
});
test('closed doors block travel from either side', () => {
  for (const [scene, x, z, limit, sign] of [['corridor', 0, -0.1, 0.18, 1], ['meadow', 0, 0.1, -0.18, -1], ['meadow', -1.2, -12.1, -11.82, 1], ['poolroom', -1.2, -11.9, -12.18, -1]]) {
    const position = toWorld(x, z);
    assert.equal(constrainMovement(position, scene, closed), scene);
    assert.ok(sign * (toLocal(position).z - limit) > -1e-9);
  }
});
test('open doors do not allow walking through the wall beside them', () => {
  for (const [scene, x, z] of [['corridor', 0.7, -0.1], ['meadow', 0.7, 0.1], ['meadow', 1.2, -12.1], ['poolroom', 0, -11.9]]) {
    const p = toWorld(x, z);
    assert.equal(constrainMovement(p, scene, allOpen), scene);
  }
});
test('room boundaries remain solid when doors are open', () => {
  for (const [scene, x, z, expectedX, expectedZ] of [['meadow', -10, -6, -3.32, -6], ['poolroom', 10, -50, 5.62, -41.82]]) {
    const p = toWorld(x, z);
    constrainMovement(p, scene, allOpen);
    const local = toLocal(p);
    assert.ok(Math.abs(local.x - expectedX) < 1e-9);
    assert.ok(Math.abs(local.z - expectedZ) < 1e-9);
  }
});
test('threshold hysteresis avoids toggling scenes at the door plane', () => {
  for (const scene of ['corridor', 'meadow']) {
    assert.equal(constrainMovement(toWorld(0, 0), scene, allOpen), scene);
  }
});

test('a continuous walk completes the entire world and returns along the same route', () => {
  let scene = 'corridor';
  let position = toWorld(0, 2);
  const changes = [];
  const walkTo = destination => {
    const steps = Math.ceil(position.distanceTo(destination) / 0.04);
    const step = destination.clone().sub(position).divideScalar(steps);
    for (let i = 0; i < steps; i++) {
      const next = position.clone().add(step);
      const room = constrainMovement(next, scene, allOpen);
      if (room !== scene) { changes.push(room); scene = room; }
      position = next;
    }
    assert.ok(position.distanceTo(destination) < 1e-6, 'the walk must not hit an invisible wall');
  };
  walkTo(toWorld(0, -1));
  walkTo(toWorld(-1.2, -6));
  walkTo(toWorld(-1.2, -13));
  walkTo(toWorld(-1.2, -30));
  walkTo(toWorld(-1.2, -11));
  walkTo(toWorld(0, -6));
  walkTo(toWorld(0, 2));
  assert.deepEqual(changes, ['meadow', 'poolroom', 'meadow', 'corridor']);
});
