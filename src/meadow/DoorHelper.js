import * as THREE from 'three';

// Single source of truth for the Door Frame math
export const getDoorFrame = (gateConfig) => {
  // Gate world position
  const doorPos = new THREE.Vector3(gateConfig.x, 0, gateConfig.z);
  
  // The corridor goes from z=0 to z=-140. 
  // At z=-140, tangent in x-z plane is (dx/dz, 1).
  // x(z) = sin(-z * 0.1) * 2.0 + 4.75; dx/dz = cos(-z * 0.1) * -0.1 * 2.0 = -0.2 * cos(-z * 0.1).
  // Actually x(z) in wavy corridor is Math.sin(z * 0.1) * 2.0 + 4.75.
  // dx/dz = 0.2 * Math.cos(z * 0.1).
  // At z = -140, dx/dz = 0.2 * Math.cos(-14) = 0.2 * 0.1367 = 0.0273.
  // The corridor tangent vector pointing towards the door (along -Z):
  const tangent = new THREE.Vector3(0.0273, 0, -1).normalize();
  
  // 'forward' points FROM the corridor INTO the meadow
  const forward = tangent.clone();
  
  // 'right' axis (lateral)
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  
  // signedDistance(point) = dot(point - doorPos, forward).
  // Negative = corridor side, Positive = meadow side.
  const signedDistance = (point) => {
     const p = new THREE.Vector3(point.x, 0, point.z); // ignore Y for distance
     const d = p.sub(doorPos);
     return d.dot(forward);
  };
  
  const signedLateral = (point) => {
     const p = new THREE.Vector3(point.x, 0, point.z);
     const d = p.sub(doorPos);
     return d.dot(right);
  };

  return { doorPos, forward, right, signedDistance, signedLateral };
};
