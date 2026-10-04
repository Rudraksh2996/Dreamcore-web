import React from 'react';
import * as THREE from 'three';

export const pinkDoorMatProps = {
  color: '#f2a7ba',
  roughness: 0.45,
  metalness: 0.0,
  clearcoat: 0.1,
};

export const DoorCasing = () => (
  <group>
    {/* Left jamb */}
    <mesh position={[-0.585, 1.05, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.07, 2.1, 0.1]} />
      <meshStandardMaterial {...pinkDoorMatProps} />
    </mesh>
    {/* Right jamb */}
    <mesh position={[0.585, 1.05, 0]} castShadow receiveShadow>
      <boxGeometry args={[0.07, 2.1, 0.1]} />
      <meshStandardMaterial {...pinkDoorMatProps} />
    </mesh>
    {/* Head casing */}
    <mesh position={[0, 2.135, 0]} castShadow receiveShadow>
      <boxGeometry args={[1.24, 0.07, 0.1]} />
      <meshStandardMaterial {...pinkDoorMatProps} />
    </mesh>
  </group>
);

export const SixPanelDoorMesh = () => (
  <group>
    <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
      <boxGeometry args={[1.1, 2.1, 0.04]} />
      <meshStandardMaterial {...pinkDoorMatProps} />
    </mesh>
    {/* Panels */}
    {[
      [0.26, 1.8, 0.4, 0.35], [-0.26, 1.8, 0.4, 0.35], // Top
      [0.26, 1.05, 0.4, 1.0], [-0.26, 1.05, 0.4, 1.0], // Mid
      [0.26, 0.35, 0.4, 0.35], [-0.26, 0.35, 0.4, 0.35] // Bot
    ].map((p, i) => (
      <group key={i}>
        <mesh position={[p[0], p[1], 0.025]}><boxGeometry args={[p[2], p[3], 0.01]}/><meshStandardMaterial {...pinkDoorMatProps}/></mesh>
        <mesh position={[p[0], p[1], -0.025]}><boxGeometry args={[p[2], p[3], 0.01]}/><meshStandardMaterial {...pinkDoorMatProps}/></mesh>
      </group>
    ))}
    {/* Silver Knob */}
    <group position={[0.45, 1.05, 0]}>
      <mesh position={[0, 0, 0.03]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 0.01]}/><meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 0, 0.05]}><sphereGeometry args={[0.025, 16, 16]}/><meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 0, -0.03]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 0.01]}/><meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} /></mesh>
      <mesh position={[0, 0, -0.05]}><sphereGeometry args={[0.025, 16, 16]}/><meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} /></mesh>
    </group>
    {/* Hinges */}
    {[0.2, 1.05, 1.9].map((y, i) => (
      <mesh key={i} position={[-0.54, y, 0.025]}><boxGeometry args={[0.01, 0.08, 0.01]} /><meshStandardMaterial color="#111" roughness={0.7} /></mesh>
    ))}
  </group>
);
