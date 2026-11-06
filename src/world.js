import * as THREE from 'three';

export const gateConfig = {
  z: -140,
  x: Math.sin(-14) * 2 + 4.75,
  rotY: Math.atan2(Math.cos(-14) * 0.2, -1),
};
export const worldRotation = gateConfig.rotY + Math.PI;
export const meadowMatrix = new THREE.Matrix4().makeRotationY(worldRotation);
meadowMatrix.setPosition(gateConfig.x, 0, gateConfig.z);
const inverseMeadow = meadowMatrix.clone().invert();
export const toWorld = (x, z, y = 1.6) => new THREE.Vector3(x, y, z).applyMatrix4(meadowMatrix);
export const toLocal = (position) => position.clone().applyMatrix4(inverseMeadow);
export const doors = [
  { id: 'meadow', x: 0, z: 0, scenes: ['corridor', 'meadow'], label: 'The Sky Garden' },
  { id: 'poolroom', x: -1.2, z: -12, scenes: ['meadow', 'poolroom'], label: 'The Stillwater Hall' },
];
const radius = 0.18;
const opening = 0.55 - radius;
const clamp = THREE.MathUtils.clamp;

// Collision and scene selection share the exact transforms used by the meshes.
// A small crossing margin prevents scene flicker while standing on a threshold.
export function constrainMovement(position, scene, open) {
  const p = toLocal(position);
  let nextScene = scene;
  if (scene === 'corridor') {
    position.z = Math.min(-0.5, position.z);
    const center = Math.sin(position.z * 0.1) * 2 + 4.75;
    position.x = clamp(position.x, center - 2.25 + radius, center + 2.25 - radius);
    p.copy(toLocal(position));
    if (!open.meadow || Math.abs(p.x) > opening) p.z = Math.max(radius, p.z);
    else if (p.z < -0.06) nextScene = 'meadow';
  } else if (scene === 'meadow') {
    p.x = clamp(p.x, -3.5 + radius, 3.5 - radius);
    if (!open.meadow || Math.abs(p.x) > opening) p.z = Math.min(-radius, p.z);
    else if (p.z > 0.06) nextScene = 'corridor';
    if (!open.poolroom || Math.abs(p.x + 1.2) > opening) p.z = Math.max(-12 + radius, p.z);
    else if (p.z < -12.06) nextScene = 'poolroom';
  } else {
    p.x = clamp(p.x, -8.2 + radius, 5.8 - radius);
    p.z = Math.max(-42 + radius, p.z);
    if (!open.poolroom || Math.abs(p.x + 1.2) > opening) p.z = Math.min(-12 - radius, p.z);
    else if (p.z > -11.94) nextScene = 'meadow';
  }
  position.copy(p.applyMatrix4(meadowMatrix));
  return nextScene;
}
