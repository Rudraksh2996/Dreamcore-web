import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { generateSkyMural } from './SkyMural';
import { SunFixture } from './SunFixture';
import { Doors } from './Doors';
import { Grass } from './Grass';

export const MeadowScene = () => {
  const texLeft = useMemo(() => generateSkyMural(1, false, 12, 3.2), []);
  const texRight = useMemo(() => generateSkyMural(2, false, 12, 3.2), []);
  const texFront = useMemo(() => generateSkyMural(3, false, 7, 3.2), []);
  const texBack = useMemo(() => generateSkyMural(4, false, 7, 3.2), []);
  const texCeil = useMemo(() => generateSkyMural(5, true, 7, 12), []);

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
    return () => { [texLeft, texRight, texFront, texBack, texCeil, pathTex].forEach(t => t.dispose()); };
  }, [texLeft, texRight, texFront, texBack, texCeil, pathTex]);

  // Use MeshStandardMaterial with baked fake GI (vertex colors or simple lightmap logic)
  // For simplicity, we just use the texture on Standard material and let lights do the work.

  return (
    <group>
       {/* Lighting */}
       <hemisphereLight skyColor="#2b87b5" groundColor="#f2a7ba" intensity={0.4} />
       <ambientLight intensity={0.3} color="#ffe4e1" />
       
       {/* Walls (Standard Material for lighting response) */}
       <mesh position={[-3.5, 1.6, -6]} rotation={[0, Math.PI/2, 0]} receiveShadow><planeGeometry args={[12, 3.2]} /><meshStandardMaterial map={texLeft} roughness={0.9} /></mesh>
       <mesh position={[3.5, 1.6, -6]} rotation={[0, -Math.PI/2, 0]} receiveShadow><planeGeometry args={[12, 3.2]} /><meshStandardMaterial map={texRight} roughness={0.9} /></mesh>
       <mesh position={[0, 1.6, -12]} receiveShadow><planeGeometry args={[7, 3.2]} /><meshStandardMaterial map={texFront} roughness={0.9} /></mesh>
       <mesh position={[0, 1.6, 0]} rotation={[0, Math.PI, 0]} receiveShadow><planeGeometry args={[7, 3.2]} /><meshStandardMaterial map={texBack} roughness={0.9} /></mesh>
       
       {/* Ceiling */}
       <mesh position={[0, 3.2, -6]} rotation={[Math.PI/2, 0, 0]} receiveShadow><planeGeometry args={[7, 12]} /><meshStandardMaterial map={texCeil} roughness={1.0} /></mesh>
       
       {/* Trim (offset by 5mm to avoid z-fighting with walls/ceiling/floor) */}
       {/* Baseboard */}
       <mesh position={[0, 0.05, -6]} receiveShadow>
         <boxGeometry args={[6.99, 0.1, 11.99]} />
         <meshStandardMaterial color="#f2a7ba" roughness={0.45} side={THREE.BackSide} />
       </mesh>
       {/* Crown molding (Cove + Bead profile via simple box for now, offset down from ceiling) */}
       <mesh position={[0, 3.14, -6]} receiveShadow>
         <boxGeometry args={[6.99, 0.12, 11.99]} />
         <meshStandardMaterial color="#f2a7ba" roughness={0.45} side={THREE.BackSide} />
       </mesh>

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
