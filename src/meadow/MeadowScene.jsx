import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { SunFixture } from './SunFixture';
import { Doors } from './Doors';
import { Grass } from './Grass';

useTexture.preload('/sky-garden-clouds.png');

// Crop UVs against the original wall so the mural continues around real openings.
function MuralPanel({ position, size, map }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(...size);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (position[0] + (uv.getX(i) - 0.5) * size[0] + 3.5) / 7,
        (position[1] + (uv.getY(i) - 0.5) * size[1]) / 3.2);
    }
    return g;
  }, [position[0], position[1], size[0], size[1]]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={position} geometry={geometry} receiveShadow><meshStandardMaterial map={map} roughness={0.85} emissive="#a5cbdf" emissiveMap={map} emissiveIntensity={0.16} /></mesh>;
}

export const MeadowScene = () => {
  const cloudMap = useTexture('/sky-garden-clouds.png');
  cloudMap.colorSpace = THREE.SRGBColorSpace;
  cloudMap.anisotropy = 16;
  const texLeft = cloudMap, texRight = cloudMap, texFront = cloudMap, texBack = cloudMap, texCeil = cloudMap;

  const pathTex = useMemo(() => {
     const canvas = document.createElement('canvas');
     canvas.width = 512; canvas.height = 1024;
     const ctx = canvas.getContext('2d');
     
     // Transparent base for feathered edge
     ctx.clearRect(0, 0, 512, 1024);
     
     ctx.beginPath();
     for(let y=0; y<=1024; y+=5) {
        const z = (y / 1024) * 12 - 6;
        const pathX = Math.sin(z * 0.5) * 1.2;
        const px = ((pathX + 3.5) / 7.0) * 512;
        if (y === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
     }
     
     // Wide dark edge
     ctx.lineWidth = (1.4 / 7.0) * 512;
     ctx.lineCap = 'round'; ctx.lineJoin = 'round';
     ctx.strokeStyle = '#c97f8a';
     ctx.shadowColor = '#c97f8a'; ctx.shadowBlur = 15;
     ctx.stroke(); ctx.stroke();
     
     // Inner core
     ctx.beginPath();
     for(let y=0; y<=1024; y+=5) {
        const z = (y / 1024) * 12 - 6;
        const pathX = Math.sin(z * 0.5) * 1.2;
        const px = ((pathX + 3.5) / 7.0) * 512;
        if (y === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
     }
     ctx.lineWidth = (1.1 / 7.0) * 512;
     ctx.strokeStyle = '#d98f98';
     ctx.shadowBlur = 5;
     ctx.stroke();
     
     // Lit center
     ctx.beginPath();
     for(let y=0; y<=1024; y+=5) {
        const z = (y / 1024) * 12 - 6;
        const pathX = Math.sin(z * 0.5) * 1.2;
        const px = ((pathX + 3.5) / 7.0) * 512;
        if (y === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
     }
     ctx.lineWidth = (0.6 / 7.0) * 512;
     ctx.strokeStyle = '#e39aa2';
     ctx.shadowBlur = 0;
     ctx.stroke();
     
     // subtle fiber noise
     const img = ctx.getImageData(0,0,512,1024);
     for(let i=0; i<img.data.length; i+=4) {
        if (img.data[i+3] > 10) {
           const noise = (Math.random()-0.5)*10;
           img.data[i] += noise; img.data[i+1] += noise; img.data[i+2] += noise;
        }
     }
     ctx.putImageData(img,0,0);
     
     const tex = new THREE.CanvasTexture(canvas);
     tex.colorSpace = THREE.SRGBColorSpace;
     return tex;
  }, []);

  useEffect(() => {
    return () => { pathTex.dispose(); };
  }, [pathTex]);

  // Use MeshStandardMaterial with baked fake GI (vertex colors or simple lightmap logic)
  // For simplicity, we just use the texture on Standard material and let lights do the work.

  return (
    <group>
       {/* Lighting */}
       <hemisphereLight color="#b9e7ff" groundColor="#f2a7ba" intensity={1.0} />
       <ambientLight intensity={0.45} color="#ffe4e1" />
       
       {/* Walls (Standard Material for lighting response) */}
       <mesh position={[-3.5, 1.6, -6]} rotation={[0, Math.PI/2, 0]} receiveShadow><planeGeometry args={[12, 3.2]} /><meshStandardMaterial map={texLeft} roughness={0.85} emissive="#a5cbdf" emissiveMap={texLeft} emissiveIntensity={0.16} /></mesh>
       <mesh position={[3.5, 1.6, -6]} rotation={[0, -Math.PI/2, 0]} receiveShadow><planeGeometry args={[12, 3.2]} /><meshStandardMaterial map={texRight} roughness={0.85} emissive="#a5cbdf" emissiveMap={texRight} emissiveIntensity={0.16} /></mesh>
       <group position={[0, 0, -12]}>
         <MuralPanel position={[-2.625, 1.6, 0]} size={[1.75, 3.2]} map={texFront} />
         <MuralPanel position={[1.425, 1.6, 0]} size={[4.15, 3.2]} map={texFront} />
         <MuralPanel position={[-1.2, 2.65, 0]} size={[1.1, 1.1]} map={texFront} />
       </group>
       <group rotation={[0, Math.PI, 0]}>
         {[-1, 1].map(side => <MuralPanel key={side} position={[side * 2.025, 1.6, 0]} size={[2.95, 3.2]} map={texBack} />)}
         <MuralPanel position={[0, 2.65, 0]} size={[1.1, 1.1]} map={texBack} />
       </group>

       {/* Ceiling */}
       <mesh position={[0, 3.2, -6]} rotation={[Math.PI/2, 0, 0]} receiveShadow><planeGeometry args={[7, 12]} /><meshStandardMaterial map={texCeil} roughness={1.0} /></mesh>
       
       {/* Narrow trim bars leave the lawn and both thresholds unobstructed. */}
       {[-3.48, 3.48].map(x => <group key={x}>
         <mesh position={[x, 0.06, -6]}><boxGeometry args={[0.04, 0.12, 12]} /><meshStandardMaterial color="#dfa3b1" roughness={0.45} /></mesh>
         <mesh position={[x, 3.14, -6]}><boxGeometry args={[0.04, 0.08, 12]} /><meshStandardMaterial color="#dfa3b1" roughness={0.45} /></mesh>
       </group>)}
       {[0, -12].map(z => <mesh key={z} position={[0, 3.14, z]}><boxGeometry args={[7, 0.08, 0.04]} /><meshStandardMaterial color="#dfa3b1" roughness={0.45} /></mesh>)}

       {/* Path (raised 1cm above floor) */}
       <mesh position={[0, 0.01, -6]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
         <planeGeometry args={[7, 12]} />
         <meshStandardMaterial map={pathTex} transparent alphaTest={0.05} roughness={0.95} />
       </mesh>
       
       <Grass position={[0, 0, -6]} />
       
       <SunFixture position={[0, 3.19, -6]} />
       <Doors position={[0, 0, -6]} />
    </group>
  );
};
