import React, { useMemo } from 'react';
import * as THREE from 'three';

export const SunFixture = ({ position }) => {
  const starShape = useMemo(() => {
    const shape = new THREE.Shape();
    const numRays = 16;
    const discRadius = 0.28;
    const rayLength = 0.18;
    const outerRadius = discRadius + rayLength;
    
    for (let i = 0; i < numRays * 2; i++) {
      const angle = (i / (numRays * 2)) * Math.PI * 2;
      const radius = i % 2 === 0 ? outerRadius : discRadius;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }, []);

  const haloTex = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(214, 242, 106, 0.8)'); // #d6f26a
    grad.addColorStop(0.3, 'rgba(214, 242, 106, 0.4)');
    grad.addColorStop(1, 'rgba(214, 242, 106, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  return (
    <group position={position}>
      {/* Halo Wash on Ceiling */}
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.8, 1.8]} />
        <meshBasicMaterial map={haloTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      
      {/* Core Star */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[starShape]} />
        <meshStandardMaterial color="#ffe45c" emissive="#ffe45c" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      
      {/* Warm Point Light */}
      <pointLight distance={10} decay={2} intensity={1.2} color="#d6f26a" position={[0, -0.2, 0]} />
    </group>
  );
};
