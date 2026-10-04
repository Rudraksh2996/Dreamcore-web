import React from 'react';
import * as THREE from 'three';
import { DoorCasing, SixPanelDoorMesh } from './SharedDoors';

export const Doors = (props) => {

  return (
    <group {...props}>
      <group position={[0, 0, -5.99]}>
      {/* Left Door (Closed) */}
      <group position={[-1.2, 0, 0]}>
        <DoorCasing />
        <SixPanelDoorMesh />
      </group>

      {/* Right Door (Open to void) */}
      <group position={[1.2, 0, 0]}>
        <DoorCasing />
        
        {/* Pitch Black Void */}
        <mesh position={[0, 1.05, -0.02]}>
          <boxGeometry args={[0.95, 2.1, 0.01]} />
          <meshBasicMaterial color="#020504" />
        </mesh>
        {/* Deep void volume for trigger */}
        <mesh position={[0, 1.05, -1.0]}>
          <boxGeometry args={[0.95, 2.1, 2.0]} />
          <meshBasicMaterial color="#020504" side={THREE.BackSide} />
        </mesh>

        {/* Swung Door */}
        <group position={[-0.475, 0, 0]} rotation={[0, -Math.PI / 1.7, 0]}>
           <group position={[0.475, 0, 0]}>
             <SixPanelDoorMesh />
           </group>
        </group>
      </group>

      {/* Lamp Table (between doors, closer to left) */}
      <group position={[-0.4, 0, 0.3]}>
        <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.02, 32]} /><meshStandardMaterial color="#fff0f5" roughness={0.3} /></mesh>
        <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.02, 0.04, 0.5]} /><meshStandardMaterial color="#fff0f5" roughness={0.3} /></mesh>
        <mesh position={[0, 0.02, 0]} castShadow><cylinderGeometry args={[0.15, 0.15, 0.04, 32]} /><meshStandardMaterial color="#fff0f5" roughness={0.3} /></mesh>
        
        {/* Lamp */}
        <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.01, 0.01, 0.1]} /><meshStandardMaterial color="#ccc" metalness={0.8} /></mesh>
        <mesh position={[0, 0.65, 0]}>
          <cylinderGeometry args={[0.05, 0.12, 0.15, 32]} />
          <meshStandardMaterial color="#fff0d8" emissive="#fff0d8" emissiveIntensity={0.5} side={THREE.DoubleSide} />
        </mesh>
        
        <pointLight position={[0, 0.65, 0]} intensity={1.5} distance={4} decay={2} color="#ffd9a8" castShadow />
        
        {/* Soft glow halo on wall */}
        <mesh position={[0, 0.65, -0.28]} rotation={[0, 0, 0]}>
           <planeGeometry args={[0.8, 0.8]} />
           <meshBasicMaterial color="#ffd9a8" transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
           {/* Needs a radial alpha map but opacity works as a wash */}
        </mesh>
      </group>
    </group>
  );
};
