import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DoorCasing, SixPanelDoorMesh } from './meadow/SharedDoors';
import { doors, toLocal } from './world';

export function WorldDoors({ scene, open, setOpen, setPrompt, enabled }) {
  const { camera } = useThree();
  const leaves = useRef({});
  const candidate = useRef(null);
  const lastPrompt = useRef('');
  useFrame((_, delta) => {
    const local = toLocal(camera.position);
    const look = camera.getWorldDirection(new THREE.Vector3());
    let nearest = null;
    let nearestDistance = 2.7;
    for (const door of doors) {
      const leaf = leaves.current[door.id];
      if (leaf) leaf.rotation.y = THREE.MathUtils.damp(leaf.rotation.y, open[door.id] ? -Math.PI * 0.56 : 0, 7, delta);
      if (!enabled || !door.scenes.includes(scene)) continue;
      const target = leaf?.parent;
      if (!target) continue;
      const point = target.localToWorld(new THREE.Vector3(0, 1.05, 0));
      const distance = camera.position.distanceTo(point);
      const looking = look.dot(point.sub(camera.position).normalize()) > 0.65;
      // Never let a closing door trap the player in its threshold.
      const inThreshold = Math.abs(local.z - door.z) < 0.8 && Math.abs(local.x - door.x) < 0.8;
      if (looking && distance < nearestDistance && !(open[door.id] && inThreshold)) {
        nearest = door;
        nearestDistance = distance;
      }
    }
    candidate.current = nearest;
    const text = nearest ? `${open[nearest.id] ? 'Close' : 'Open'} · ${nearest.label}` : '';
    if (text !== lastPrompt.current) { lastPrompt.current = text; setPrompt(text); }
  });
  useEffect(() => {
    const action = (event) => {
      if (!enabled || (event.type === 'keydown' && (event.code !== 'KeyE' || event.repeat))) return;
      const door = candidate.current;
      if (door) setOpen(current => ({ ...current, [door.id]: !current[door.id] }));
    };
    document.addEventListener('keydown', action);
    document.addEventListener('dream-interact', action);
    return () => { document.removeEventListener('keydown', action); document.removeEventListener('dream-interact', action); };
  }, [enabled, setOpen]);
  return doors.map(door => (
    <group key={door.id} position={[door.x, 0, door.z]}>
      <DoorCasing />
      <group ref={element => { leaves.current[door.id] = element; }} position={[-0.55, 0, 0]}>
        <group position={[0.55, 0, 0]}><SixPanelDoorMesh /></group>
      </group>
    </group>
  ));
}
