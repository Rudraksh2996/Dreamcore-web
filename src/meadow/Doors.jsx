import React, { useMemo } from 'react';
import * as THREE from 'three';

const DoorCasing = ({ pinkMat }) => {
  return (
    <group>
      {/* Left jamb */}
      <mesh position={[-0.485, 1.025, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[0.07, 2.05, 0.08]} />
        <meshStandardMaterial {...pinkMat} />
      </mesh>
      {/* Right jamb */}
      <mesh position={[0.485, 1.025, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[0.07, 2.05, 0.08]} />
        <meshStandardMaterial {...pinkMat} />
      </mesh>
      {/* Head casing */}
      <mesh position={[0, 2.085, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[1.04, 0.07, 0.08]} />
        <meshStandardMaterial {...pinkMat} />
      </mesh>
    </group>
  );
};

const SixPanelDoorMesh = ({ pinkMat }) => {
  return (
    <group>
      {/* Main Slab */}
      <mesh position={[0, 1.025, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 2.05, 0.04]} />
        <meshStandardMaterial {...pinkMat} />
      </mesh>

      {/* Panels (fake with small bevel boxes) */}
      {[ 
        [0.2, 1.75, 0.3, 0.3], [-0.2, 1.75, 0.3, 0.3], // Top short pair
        [0.2, 1.05, 0.3, 0.9], [-0.2, 1.05, 0.3, 0.9], // Middle tall pair
        [0.2, 0.35, 0.3, 0.3], [-0.2, 0.35, 0.3, 0.3]  // Bottom short pair
      ].map((p, i) => (
        <group key={i}>
          {/* Front Panel */}
          <mesh position={[p[0], p[1], 0.025]}>
            <boxGeometry args={[p[2], p[3], 0.01]} />
            <meshStandardMaterial {...pinkMat} />
          </mesh>
          {/* Back Panel */}
          <mesh position={[p[0], p[1], -0.025]}>
            <boxGeometry args={[p[2], p[3], 0.01]} />
            <meshStandardMaterial {...pinkMat} />
          </mesh>
        </group>
      ))}

      {/* Silver Knob */}
      <group position={[0.35, 1.05, 0]}>
        <mesh position={[0, 0, 0.03]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 0.01]}/><meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} /></mesh>
        <mesh position={[0, 0, 0.05]}><sphereGeometry args={[0.025, 16, 16]}/><meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} /></mesh>
        
        {/* Back knob */}
        <mesh position={[0, 0, -0.03]} rotation={[Math.PI/2, 0, 0]}><cylinderGeometry args={[0.03, 0.03, 0.01]}/><meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} /></mesh>
        <mesh position={[0, 0, -0.05]}><sphereGeometry args={[0.025, 16, 16]}/><meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} /></mesh>
      </group>

      {/* Hinges (Black) */}
      {[0.2, 1.025, 1.85].map((y, i) => (
        <mesh key={i} position={[-0.45, y, 0.025]}>
          <boxGeometry args={[0.01, 0.08, 0.01]} />
          <meshStandardMaterial color="#111" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
};

export const Doors = () => {
  const pinkMatProps = {
    color: '#f2a7ba', // base salmon-pink
    roughness: 0.45,
    metalness: 0.0,
    clearcoat: 0.1, // slight semigloss
  };

  return (
    <group position={[0, 0, -5.99]}>
      {/* Left Door (Closed) */}
      <group position={[-1.2, 0, 0]}>
        <DoorCasing pinkMat={pinkMatProps} />
        <SixPanelDoorMesh pinkMat={pinkMatProps} />
      </group>

      {/* Right Door (Open to void) */}
      <group position={[1.2, 0, 0]}>
        <DoorCasing pinkMat={pinkMatProps} />
        
        {/* Pitch Black Void */}
        <mesh position={[0, 1.025, -0.02]}>
          <boxGeometry args={[0.9, 2.05, 0.01]} />
          <meshBasicMaterial color="#020504" />
        </mesh>
        {/* Deep void volume for trigger */}
        <mesh position={[0, 1.025, -1.0]}>
          <boxGeometry args={[0.9, 2.05, 2.0]} />
          <meshBasicMaterial color="#020504" side={THREE.BackSide} />
        </mesh>

        {/* Swung Door */}
        <group position={[-0.45, 0, 0]} rotation={[0, -Math.PI / 1.7, 0]}>
           <group position={[0.45, 0, 0]}>
             <SixPanelDoorMesh pinkMat={pinkMatProps} />
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
