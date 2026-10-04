import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PositionalAudio } from '@react-three/drei';

// ==========================================
// SHARED CONSTANTS (Water Zone, Colors, etc)
// ==========================================
export const POOLROOM_WIDTH = 14.0;
export const POOLROOM_LENGTH = 30.0;
export const WATER_LEVEL = 0.15; // 15cm deep
export const CHAIR_COUNT = 40;
export const LIGHT_COLOR = "#fff0f5"; // fluorescent with pink tint
export const WATER_TINT = "#40c0c0";

// Water zone: from z = -5 to z = -30
// Shoreline curves: a gentle sine wave
export const isWater = (x, z) => {
   const shorelineZ = -6.0 + Math.sin(x * 0.8) * 1.5 + Math.cos(x * 0.3) * 0.5;
   return z < shorelineZ;
};

// GLSL version for shaders
export const isWaterGLSL = `
   float getShorelineZ(float x) {
      return -6.0 + sin(x * 0.8) * 1.5 + cos(x * 0.3) * 0.5;
   }
`;

// Helper to generate textures
const createWallTexture = (color, bump) => {
   const canvas = document.createElement('canvas');
   canvas.width = 256; canvas.height = 256;
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = color;
   ctx.fillRect(0,0,256,256);
   if (bump) {
      for(let i=0; i<5000; i++) {
         ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
         ctx.fillRect(Math.random()*256, Math.random()*256, 2, 2);
      }
   }
   const t = new THREE.CanvasTexture(canvas);
   t.wrapS = t.wrapT = THREE.RepeatWrapping;
   return t;
};

const createCeilingTexture = () => {
   const canvas = document.createElement('canvas');
   canvas.width = 512; canvas.height = 512;
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = '#e8e6df';
   ctx.fillRect(0,0,512,512);
   
   // Grid lines
   ctx.strokeStyle = '#c0bdae';
   ctx.lineWidth = 4;
   for(let i=0; i<=512; i+=128) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
   }
   
   // Acoustic pores
   for(let i=0; i<20000; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(Math.random()*512, Math.random()*512, 1, 1);
   }
   const t = new THREE.CanvasTexture(canvas);
   t.wrapS = t.wrapT = THREE.RepeatWrapping;
   t.repeat.set(POOLROOM_WIDTH / 1.2, POOLROOM_LENGTH / 1.2);
   return t;
};

export const PoolroomScene = (props) => {
   const texUpper = useMemo(() => createWallTexture('#9ccbc5', false), []); // Seafoam teal
   const texLower = useMemo(() => createWallTexture('#e8a598', false), []); // Salmon-peach
   const texFloor = useMemo(() => createWallTexture('#f5e8e8', true), []);  // Pale white-pink, sandy
   const texCeiling = useMemo(() => createCeilingTexture(), []);

   // Water Shader
   const waterMatRef = useRef();
   const waterGeo = useMemo(() => new THREE.PlaneGeometry(POOLROOM_WIDTH, POOLROOM_LENGTH, 64, 128), []);
   const waterMat = useMemo(() => {
      const mat = new THREE.ShaderMaterial({
         transparent: true,
         uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color(WATER_TINT) }
         },
         vertexShader: `
            uniform float uTime;
            varying vec2 vUv;
            varying vec3 vWorldPos;
            
            ${isWaterGLSL}
            
            void main() {
               vUv = uv;
               vec4 worldPos = modelMatrix * vec4(position, 1.0);
               
               // Ripples
               float wave = sin(worldPos.x * 3.0 + uTime) * 0.015 + cos(worldPos.z * 2.0 + uTime * 0.8) * 0.015;
               
               // Flat on shore
               float shoreZ = getShorelineZ(worldPos.x);
               float depth = clamp((shoreZ - worldPos.z) * 2.0, 0.0, 1.0);
               
               worldPos.y += wave * depth;
               vWorldPos = worldPos.xyz;
               
               gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
         `,
         fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor;
            varying vec2 vUv;
            varying vec3 vWorldPos;
            
            ${isWaterGLSL}
            
            // Simplex-ish noise for caustics
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
            float snoise(vec2 v) {
              const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
              vec2 i  = floor(v + dot(v, C.yy) );
              vec2 x0 = v -   i + dot(i, C.xx);
              vec2 i1; i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
              vec4 x12 = x0.xyxy + C.xxzz;
              x12.xy -= i1;
              i = mod289(i);
              vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
              vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
              m = m*m ; m = m*m ;
              vec3 x = 2.0 * fract(p * C.www) - 1.0;
              vec3 h = abs(x) - 0.5;
              vec3 ox = floor(x + 0.5);
              vec3 a0 = x - ox;
              m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
              vec3 g;
              g.x  = a0.x  * x0.x  + h.x  * x0.y;
              g.yz = a0.yz * x12.xz + h.yz * x12.yw;
              return 130.0 * dot(m, g);
            }

            void main() {
               float shoreZ = getShorelineZ(vWorldPos.x);
               float distToShore = shoreZ - vWorldPos.z;
               
               if (distToShore < 0.0) discard; // Not water
               
               float alpha = clamp(distToShore * 2.0, 0.0, 0.8); // Blend edge
               
               // Caustics
               float n1 = snoise(vWorldPos.xz * 2.0 + uTime * 0.5);
               float n2 = snoise(vWorldPos.xz * 4.0 - uTime * 0.3);
               float caustics = pow(max(0.0, sin(n1 * 3.14) * cos(n2 * 3.14)), 2.0) * 1.5;
               
               // Soft pink/peach reflections (fake environment reflection)
               float pinkRefl = max(0.0, sin(vWorldPos.x * 0.5 + uTime * 0.2) * cos(vWorldPos.z * 0.3));
               vec3 pinkColor = vec3(1.0, 0.7, 0.75); // Peach/pink
               
               vec3 finalColor = uColor + caustics * vec3(0.8, 1.0, 1.0) * 0.5 + pinkRefl * pinkColor * 0.4;
               
               // Foam at shore
               if (distToShore < 0.2) {
                  finalColor += vec3(0.5) * (1.0 - distToShore * 5.0) * snoise(vWorldPos.xz * 10.0 + uTime);
               }
               
               gl_FragColor = vec4(finalColor, alpha);
            }
         `
      });
      return mat;
   }, []);

   useFrame((state) => {
      waterMat.uniforms.uTime.value = state.clock.elapsedTime;
   });

   // Chairs Instancing
   const chairGeo = useMemo(() => {
      // simple chair shape - back and seat
      const g = new THREE.BufferGeometry();
      const seat = new THREE.BoxGeometry(0.6, 0.1, 0.6);
      seat.translate(0, 0.3, 0);
      const back = new THREE.BoxGeometry(0.6, 0.6, 0.1);
      back.translate(0, 0.6, -0.25);
      
      const merged = new THREE.Object3D();
      const sMesh = new THREE.Mesh(seat);
      const bMesh = new THREE.Mesh(back);
      sMesh.updateMatrix(); bMesh.updateMatrix();
      
      // Simple merge arrays
      const pos = [...seat.attributes.position.array, ...back.attributes.position.array];
      const norm = [...seat.attributes.normal.array, ...back.attributes.normal.array];
      
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(norm), 3));
      return g;
   }, []);
   const chairMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8 }), []);
   const chairInstRef = useRef();

   useEffect(() => {
      if (!chairInstRef.current) return;
      const dummy = new THREE.Object3D();
      const colors = [new THREE.Color('#e0b846'), new THREE.Color('#e88a80')]; // Mustard & Salmon
      
      let i = 0;
      // Place rows along the walls
      for (let z = -4; z > -28; z -= 1.8) {
         // Left row
         dummy.position.set(-POOLROOM_WIDTH/2 + 1.5 + Math.random()*0.2, 0, z + Math.random()*0.2);
         dummy.rotation.set(0, Math.PI/2 + (Math.random()-0.5)*0.2, 0);
         dummy.updateMatrix();
         chairInstRef.current.setMatrixAt(i, dummy.matrix);
         chairInstRef.current.setColorAt(i, colors[i%2]);
         i++;
         
         // Right row
         dummy.position.set(POOLROOM_WIDTH/2 - 1.5 + Math.random()*0.2, 0, z + Math.random()*0.2);
         dummy.rotation.set(0, -Math.PI/2 + (Math.random()-0.5)*0.2, 0);
         dummy.updateMatrix();
         chairInstRef.current.setMatrixAt(i, dummy.matrix);
         chairInstRef.current.setColorAt(i, colors[i%2]);
         i++;
         if (i >= CHAIR_COUNT) break;
      }
      chairInstRef.current.instanceMatrix.needsUpdate = true;
      if (chairInstRef.current.instanceColor) chairInstRef.current.instanceColor.needsUpdate = true;
   }, []);

   return (
      <group {...props}>
         {/* Dry Floor */}
         <mesh position={[0, 0, -POOLROOM_LENGTH/2]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
            <planeGeometry args={[POOLROOM_WIDTH, POOLROOM_LENGTH]} />
            <meshStandardMaterial map={texFloor} roughness={0.9} />
         </mesh>

         {/* Water Surface */}
         <mesh position={[0, WATER_LEVEL, -POOLROOM_LENGTH/2]} rotation={[-Math.PI/2, 0, 0]} geometry={waterGeo} material={waterMat} />

         {/* Ceiling */}
         <mesh position={[0, 2.8, -POOLROOM_LENGTH/2]} rotation={[Math.PI/2, 0, 0]} receiveShadow>
            <planeGeometry args={[POOLROOM_WIDTH, POOLROOM_LENGTH]} />
            <meshStandardMaterial map={texCeiling} roughness={1.0} />
         </mesh>

         {/* Walls */}
         {/* Left */}
         <group position={[-POOLROOM_WIDTH/2, 0, -POOLROOM_LENGTH/2]} rotation={[0, Math.PI/2, 0]}>
            <mesh position={[0, 1.85, 0]}><planeGeometry args={[POOLROOM_LENGTH, 1.9]} /><meshStandardMaterial map={texUpper} roughness={0.8} /></mesh>
            <mesh position={[0, 0.45, 0]}><planeGeometry args={[POOLROOM_LENGTH, 0.9]} /><meshStandardMaterial map={texLower} roughness={0.8} /></mesh>
            <mesh position={[0, 0.9, 0]}><planeGeometry args={[POOLROOM_LENGTH, 0.05]} /><meshStandardMaterial color="#fff" roughness={0.9} /></mesh>
         </group>
         {/* Right */}
         <group position={[POOLROOM_WIDTH/2, 0, -POOLROOM_LENGTH/2]} rotation={[0, -Math.PI/2, 0]}>
            <mesh position={[0, 1.85, 0]}><planeGeometry args={[POOLROOM_LENGTH, 1.9]} /><meshStandardMaterial map={texUpper} roughness={0.8} /></mesh>
            <mesh position={[0, 0.45, 0]}><planeGeometry args={[POOLROOM_LENGTH, 0.9]} /><meshStandardMaterial map={texLower} roughness={0.8} /></mesh>
            <mesh position={[0, 0.9, 0]}><planeGeometry args={[POOLROOM_LENGTH, 0.05]} /><meshStandardMaterial color="#fff" roughness={0.9} /></mesh>
         </group>
         {/* Front (Spawn end) */}
         <group position={[0, 0, 0]} rotation={[0, Math.PI, 0]}>
            <mesh position={[0, 1.85, 0]}><planeGeometry args={[POOLROOM_WIDTH, 1.9]} /><meshStandardMaterial map={texUpper} roughness={0.8} /></mesh>
            <mesh position={[0, 0.45, 0]}><planeGeometry args={[POOLROOM_WIDTH, 0.9]} /><meshStandardMaterial map={texLower} roughness={0.8} /></mesh>
            <mesh position={[0, 0.9, 0]}><planeGeometry args={[POOLROOM_WIDTH, 0.05]} /><meshStandardMaterial color="#fff" roughness={0.9} /></mesh>
         </group>
         {/* Back (Exit end) */}
         <group position={[0, 0, -POOLROOM_LENGTH]}>
            <mesh position={[0, 1.85, 0]}><planeGeometry args={[POOLROOM_WIDTH, 1.9]} /><meshStandardMaterial map={texUpper} roughness={0.8} /></mesh>
            <mesh position={[0, 0.45, 0]}><planeGeometry args={[POOLROOM_WIDTH, 0.9]} /><meshStandardMaterial map={texLower} roughness={0.8} /></mesh>
            <mesh position={[0, 0.9, 0]}><planeGeometry args={[POOLROOM_WIDTH, 0.05]} /><meshStandardMaterial color="#fff" roughness={0.9} /></mesh>
            {/* Dummy Door for Scene 4 */}
            <mesh position={[0, 1.05, 0.01]}><boxGeometry args={[1.1, 2.1, 0.05]} /><meshStandardMaterial color="#ccc" /></mesh>
            <mesh position={[0, 2.15, 0.01]}><boxGeometry args={[1.24, 0.1, 0.1]} /><meshStandardMaterial color="#ccc" /></mesh>
         </group>

         {/* Fluorescent Lights (every 5 meters) */}
         {[ -3, -8, -13, -18, -23, -28 ].map((z, i) => {
            const flickerRef = useRef();
            useFrame(({ clock }) => {
               if (i === 1 && flickerRef.current) { // Make the second light flicker
                  flickerRef.current.intensity = 1.2 * (0.8 + 0.2 * Math.sin(clock.elapsedTime * 20.0) * Math.random());
               }
            });
            return (
               <group key={i} position={[0, 2.79, z]}>
                  <mesh position={[0, 0, 0]} rotation={[Math.PI/2, 0, 0]}>
                     <planeGeometry args={[0.6, 1.2]} />
                     <meshBasicMaterial color="#ffffff" />
                  </mesh>
                  <pointLight ref={flickerRef} position={[0, -0.2, 0]} distance={15} decay={2} intensity={1.2} color={LIGHT_COLOR} />
               </group>
            );
         })}

         {/* Chairs Instanced */}
         <instancedMesh ref={chairInstRef} args={[chairGeo, chairMat, CHAIR_COUNT]} castShadow receiveShadow />

      </group>
   );
};
