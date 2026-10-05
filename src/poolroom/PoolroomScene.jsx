import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { POOLROOM_WIDTH, POOLROOM_LENGTH, WATER_LEVEL, CHAIR_COUNT, getShorelineZ, isWaterGLSL, POOLROOM_FOG } from './Constants';

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

const createSandNormalMap = () => {
   const canvas = document.createElement('canvas');
   canvas.width = 512; canvas.height = 512;
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = '#8080ff'; // flat normal
   ctx.fillRect(0,0,512,512);
   
   const imgData = ctx.getImageData(0,0,512,512);
   for (let i = 0; i < imgData.data.length; i+=4) {
      let noise = (Math.random() - 0.5) * 60;
      imgData.data[i] = Math.min(255, Math.max(0, 128 + noise));
      imgData.data[i+1] = Math.min(255, Math.max(0, 128 + noise));
   }
   ctx.putImageData(imgData, 0, 0);
   const t = new THREE.CanvasTexture(canvas);
   t.wrapS = t.wrapT = THREE.RepeatWrapping;
   t.repeat.set(POOLROOM_WIDTH, POOLROOM_LENGTH); 
   return t;
};

// Procedural PMREM envMap generator for the poolroom
const ProceduralEnvMap = () => {
    const [envMap, setEnvMap] = useState(null);
    useEffect(() => {
        const pmremGenerator = new THREE.PMREMGenerator(window.renderer || new THREE.WebGLRenderer());
        pmremGenerator.compileEquirectangularShader();
        
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color('#9ccbc5'); // Mint walls
        const light = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 10),
            new THREE.MeshBasicMaterial({ color: '#ffffff' })
        );
        light.position.set(0, 10, 0);
        light.rotation.x = Math.PI / 2;
        envScene.add(light);
        
        const rt = pmremGenerator.fromScene(envScene);
        setEnvMap(rt.texture);
        
        return () => {
            rt.dispose();
            pmremGenerator.dispose();
        };
    }, []);
    return envMap;
};

const FluorescentFixture = ({ position }) => {
   const matRef = useRef();
   useFrame((state) => {
      // Subtle flicker on one of them based on position
      if (position[2] === -18 && position[0] === 3) {
         if (matRef.current) {
            matRef.current.emissiveIntensity = 0.8 + Math.random() * 0.4;
         }
      }
   });
   return (
      <group position={position}>
         <mesh position={[0, 0, 0]}>
            <boxGeometry args={[1.2, 0.05, 0.3]} />
            <meshStandardMaterial color="#ddd" roughness={0.5} />
         </mesh>
         <mesh position={[0, -0.05, 0.08]}>
            <cylinderGeometry args={[0.02, 0.02, 1.1]} />
            <meshStandardMaterial ref={matRef} color="#fff" emissive="#fff" emissiveIntensity={1.0} toneMapped={false} />
         </mesh>
         <mesh position={[0, -0.05, -0.08]}>
            <cylinderGeometry args={[0.02, 0.02, 1.1]} />
            <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1.0} toneMapped={false} />
         </mesh>
         <pointLight color="#fff0f5" intensity={8.0} distance={12} decay={2} position={[0, -0.1, 0]} />
      </group>
   );
};

export const PoolroomScene = (props) => {
   const envMap = ProceduralEnvMap();
   const texUpper = useMemo(() => createWallTexture('#9ccbc5', false), []); // Seafoam teal
   const texLower = useMemo(() => createWallTexture('#e8a598', false), []); // Salmon-peach
   const texCeiling = useMemo(() => createCeilingTexture(), []);
   const normalSand = useMemo(() => createSandNormalMap(), []);

   // Geometry with baked translations
   const waterGeo = useMemo(() => {
      const geo = new THREE.PlaneGeometry(POOLROOM_WIDTH, POOLROOM_LENGTH, 64, 128);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, WATER_LEVEL, -POOLROOM_LENGTH / 2);
      return geo;
   }, []);
   
   const floorGeo = useMemo(() => {
      const geo = new THREE.PlaneGeometry(POOLROOM_WIDTH, POOLROOM_LENGTH, 64, 128);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, -POOLROOM_LENGTH / 2);
      return geo;
   }, []);

   const waterMatRef = useRef();
   const sandUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

   // Custom Sand Material (extends MeshStandardMaterial)
   const sandMat = useMemo(() => {
      const mat = new THREE.MeshStandardMaterial({ 
         color: '#f5e8e8', // Pale pink/white sand
         roughness: 0.9,
         normalMap: normalSand,
      });
      
      mat.onBeforeCompile = (shader) => {
         shader.uniforms.uTime = sandUniforms.uTime;
         shader.vertexShader = `
            varying vec3 vLocalPos;
         ` + shader.vertexShader;
         shader.vertexShader = shader.vertexShader.replace(
            `#include <begin_vertex>`,
            `
            #include <begin_vertex>
            vLocalPos = position;
            // Slight dunes
            float d = sin(position.x * 2.0) * cos(position.z * 1.5) * 0.02;
            transformed.y += d;
            `
         );
         
         shader.fragmentShader = `
            uniform float uTime;
            varying vec3 vLocalPos;
            ${isWaterGLSL}
         ` + shader.fragmentShader;
         
         shader.fragmentShader = shader.fragmentShader.replace(
            `#include <color_fragment>`,
            `
            #include <color_fragment>
            float shoreZ = getShorelineZ(vLocalPos.x);
            float distToShore = shoreZ - vLocalPos.z;
            
            // Wet band
            if (distToShore > 0.0 && distToShore < 0.6) {
               diffuseColor.rgb *= 0.8; // Darker wet sand
            } else if (distToShore > 0.6) {
               diffuseColor.rgb *= 0.75; // Even darker underwater
               
               // Caustics
               float c1 = sin(vLocalPos.x * 3.0 + uTime * 1.0);
               float c2 = cos(vLocalPos.z * 3.0 - uTime * 0.8);
               float caustics = pow(max(0.0, c1 * c2), 2.0) * 1.5;
               diffuseColor.rgb += vec3(0.5, 0.8, 1.0) * caustics * 0.5;
            }
            
            // Pink light patches
            float patch1 = clamp(sin(vLocalPos.x * 0.8 + 2.0) * cos(vLocalPos.z * 0.4) - 0.7, 0.0, 1.0) * 3.0;
            diffuseColor.rgb += vec3(1.0, 0.6, 0.8) * patch1;
            `
         );
      };
      return mat;
   }, [normalSand, sandUniforms]);

   // Custom Water Material
   const waterMat = useMemo(() => {
      return new THREE.ShaderMaterial({
         transparent: true,
         depthWrite: false, // Render after sand/chairs, don't occlude
         uniforms: {
            uTime: { value: 0 },
            uColor: { value: new THREE.Color('#3ca6a6') },
            fogColor: { value: new THREE.Color(POOLROOM_FOG.color) },
            fogNear: { value: POOLROOM_FOG.near },
            fogFar: { value: POOLROOM_FOG.far }
         },
         vertexShader: `
            uniform float uTime;
            varying vec2 vUv;
            varying vec3 vLocalPos;
            varying float vFogDepth;
            
            ${isWaterGLSL}
            
            void main() {
               vUv = uv;
               vLocalPos = position;
               vec3 pos = position;
               
               float wave = sin(pos.x * 3.0 + uTime) * 0.015 + cos(pos.z * 2.0 + uTime * 0.8) * 0.015;
               float shoreZ = getShorelineZ(pos.x);
               float depth = clamp((shoreZ - pos.z) * 2.0, 0.0, 1.0);
               pos.y += wave * depth;
               
               vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
               vFogDepth = -mvPosition.z;
               gl_Position = projectionMatrix * mvPosition;
            }
         `,
         fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor;
            uniform vec3 fogColor;
            uniform float fogNear;
            uniform float fogFar;
            
            varying vec2 vUv;
            varying vec3 vLocalPos;
            varying float vFogDepth;
            
            ${isWaterGLSL}
            
            void main() {
               float shoreZ = getShorelineZ(vLocalPos.x);
               float distToShore = shoreZ - vLocalPos.z;
               
               if (distToShore < 0.0) discard;
               
               float alpha = clamp(distToShore * 1.5, 0.0, 0.85); // Transparent at edge
               
               // Absorption (Beer-Lambert approx)
               vec3 waterColor = mix(vec3(0.6, 0.9, 0.8), uColor, clamp(distToShore * 0.2, 0.0, 1.0));
               
               // Specular glints
               float glint = pow(max(0.0, sin(vLocalPos.x * 10.0 - uTime) * cos(vLocalPos.z * 10.0 + uTime)), 20.0);
               waterColor += vec3(1.0) * glint * 0.5;
               
               // Foam
               if (distToShore < 0.15) {
                  float foam = max(0.0, sin(vLocalPos.x * 20.0 + uTime * 2.0));
                  waterColor += vec3(0.8) * foam * (1.0 - distToShore / 0.15);
                  alpha = max(alpha, foam * (1.0 - distToShore / 0.15) * 0.5);
               }
               
               gl_FragColor = vec4(waterColor, alpha);
               
               // Fog
               float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
               gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
            }
         `
      });
   }, []);

   useFrame((state) => {
      const t = state.clock.elapsedTime;
      waterMat.uniforms.uTime.value = t;
      sandUniforms.uTime.value = t;
   });

   // Chairs Instancing (Separate Cushions and Frame)
   const { cushionsGeo, frameGeo } = useMemo(() => {
      const cGeo = new THREE.BufferGeometry();
      const seat = new THREE.BoxGeometry(0.6, 0.15, 0.6);
      seat.translate(0, 0.3, 0);
      const back = new THREE.BoxGeometry(0.6, 0.5, 0.15);
      back.translate(0, 0.65, -0.25);
      
      const pos = [...seat.attributes.position.array, ...back.attributes.position.array];
      const norm = [...seat.attributes.normal.array, ...back.attributes.normal.array];
      const indices = [];
      const seatIndices = seat.index.array || [...Array(seat.attributes.position.count).keys()];
      for (let i=0; i<seatIndices.length; i++) indices.push(seatIndices[i]);
      const backIndices = back.index.array || [...Array(back.attributes.position.count).keys()];
      const offset = seat.attributes.position.count;
      for (let i=0; i<backIndices.length; i++) indices.push(backIndices[i] + offset);
      
      cGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      cGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(norm), 3));
      cGeo.setIndex(indices);
      
      const fGeo = new THREE.BufferGeometry();
      const leg1 = new THREE.CylinderGeometry(0.02, 0.02, 0.3); leg1.translate(0.25, 0.15, 0.25);
      const leg2 = new THREE.CylinderGeometry(0.02, 0.02, 0.3); leg2.translate(-0.25, 0.15, 0.25);
      const leg3 = new THREE.CylinderGeometry(0.02, 0.02, 0.3); leg3.translate(0.25, 0.15, -0.25);
      const leg4 = new THREE.CylinderGeometry(0.02, 0.02, 0.3); leg4.translate(-0.25, 0.15, -0.25);
      const arm1 = new THREE.CylinderGeometry(0.02, 0.02, 0.6); arm1.rotateX(Math.PI/2); arm1.translate(0.3, 0.5, 0);
      const arm2 = new THREE.CylinderGeometry(0.02, 0.02, 0.6); arm2.rotateX(Math.PI/2); arm2.translate(-0.3, 0.5, 0);
      
      const parts = [leg1, leg2, leg3, leg4, arm1, arm2];
      let fPos = [], fNorm = [], fInd = [], currOffset = 0;
      parts.forEach(p => {
         fPos.push(...p.attributes.position.array);
         fNorm.push(...p.attributes.normal.array);
         const pIndices = p.index.array || [...Array(p.attributes.position.count).keys()];
         for(let i=0; i<pIndices.length; i++) fInd.push(pIndices[i] + currOffset);
         currOffset += p.attributes.position.count;
      });
      fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fPos), 3));
      fGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(fNorm), 3));
      fGeo.setIndex(fInd);
      
      return { cushionsGeo: cGeo, frameGeo: fGeo };
   }, []);
   
   const cushionMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.6 }), []);
   const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff', metalness: 1.0, roughness: 0.2 }), []);
   
   const cushionInstRef = useRef();
   const frameInstRef = useRef();

   useEffect(() => {
      if (!cushionInstRef.current || !frameInstRef.current) return;
      const dummy = new THREE.Object3D();
      const colors = [new THREE.Color('#e0b846'), new THREE.Color('#e88a80')]; // Mustard & Salmon
      
      let i = 0;
      // 3 rows per side, ~8 per row = 48 chairs
      for (let side = -1; side <= 1; side += 2) {
         for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 8; col++) {
               const x = side * (2.0 + row * 1.5) + (Math.random()-0.5)*0.1;
               const z = -4 - col * 1.8 + (Math.random()-0.5)*0.1;
               dummy.position.set(x, 0, z);
               dummy.rotation.set(0, side * Math.PI/2 + (Math.random()-0.5)*0.1, 0);
               dummy.updateMatrix();
               
               cushionInstRef.current.setMatrixAt(i, dummy.matrix);
               cushionInstRef.current.setColorAt(i, colors[i%2]);
               frameInstRef.current.setMatrixAt(i, dummy.matrix);
               i++;
               if (i >= CHAIR_COUNT) break;
            }
         }
      }
      cushionInstRef.current.instanceMatrix.needsUpdate = true;
      if (cushionInstRef.current.instanceColor) cushionInstRef.current.instanceColor.needsUpdate = true;
      frameInstRef.current.instanceMatrix.needsUpdate = true;
   }, []);

   return (
      <group {...props}>
         {/* Atmosphere applied if native render (Portal applies its own) */}
         <hemisphereLight skyColor="#dff3ef" groundColor="#e6c7d6" intensity={1.1} />
         <ambientLight intensity={0.2} />

         {/* Floor & Water (RenderOrder ensures water draws over sand/chairs) */}
         <mesh geometry={floorGeo} material={sandMat} renderOrder={1} />
         <mesh geometry={waterGeo} material={waterMat} renderOrder={3} />

         {/* Ceiling */}
         <mesh position={[0, 2.8, -POOLROOM_LENGTH/2]} rotation={[Math.PI/2, 0, 0]} receiveShadow>
            <planeGeometry args={[POOLROOM_WIDTH, POOLROOM_LENGTH]} />
            <meshStandardMaterial map={texCeiling} roughness={1.0} />
         </mesh>

         {/* Left Wall (Mint/Peach) */}
         <group position={[-POOLROOM_WIDTH/2, 0, -POOLROOM_LENGTH/2]} rotation={[0, Math.PI/2, 0]}>
            <mesh position={[0, 1.85, 0]}><planeGeometry args={[POOLROOM_LENGTH, 1.9]} /><meshStandardMaterial map={texUpper} roughness={0.8} /></mesh>
            <mesh position={[0, 0.45, 0]}><planeGeometry args={[POOLROOM_LENGTH, 0.9]} /><meshStandardMaterial map={texLower} roughness={0.8} /></mesh>
            <mesh position={[0, 0.9, 0]}><planeGeometry args={[POOLROOM_LENGTH, 0.05]} /><meshStandardMaterial color="#fff" roughness={0.9} /></mesh>
         </group>

         {/* Right Wall */}
         <group position={[POOLROOM_WIDTH/2, 0, -POOLROOM_LENGTH/2]} rotation={[0, -Math.PI/2, 0]}>
            <mesh position={[0, 1.85, 0]}><planeGeometry args={[POOLROOM_LENGTH, 1.9]} /><meshStandardMaterial map={texUpper} roughness={0.8} /></mesh>
            <mesh position={[0, 0.45, 0]}><planeGeometry args={[POOLROOM_LENGTH, 0.9]} /><meshStandardMaterial map={texLower} roughness={0.8} /></mesh>
            <mesh position={[0, 0.9, 0]}><planeGeometry args={[POOLROOM_LENGTH, 0.05]} /><meshStandardMaterial color="#fff" roughness={0.9} /></mesh>
            {/* Blue trim at bottom */}
            <mesh position={[0, 0.05, 0.01]}><planeGeometry args={[POOLROOM_LENGTH, 0.1]} /><meshStandardMaterial color="#3a8bd4" roughness={0.7} /></mesh>
         </group>

         {/* Back Wall */}
         <group position={[0, 0, -POOLROOM_LENGTH]} rotation={[0, 0, 0]}>
            <mesh position={[0, 1.85, 0]}><planeGeometry args={[POOLROOM_WIDTH, 1.9]} /><meshStandardMaterial map={texUpper} roughness={0.8} /></mesh>
            <mesh position={[0, 0.45, 0]}><planeGeometry args={[POOLROOM_WIDTH, 0.9]} /><meshStandardMaterial map={texLower} roughness={0.8} /></mesh>
            <mesh position={[0, 0.9, 0]}><planeGeometry args={[POOLROOM_WIDTH, 0.05]} /><meshStandardMaterial color="#fff" roughness={0.9} /></mesh>
            <mesh position={[0, 1.05, 0.01]}><planeGeometry args={[1.2, 2.1]} /><meshStandardMaterial color="#555" /></mesh>
         </group>
         
         {/* Front Wall */}
         <group position={[0, 0, 0]} rotation={[0, Math.PI, 0]}>
            <mesh position={[0, 1.85, 0]}><planeGeometry args={[POOLROOM_WIDTH, 1.9]} /><meshStandardMaterial map={texUpper} roughness={0.8} /></mesh>
            <mesh position={[0, 0.45, 0]}><planeGeometry args={[POOLROOM_WIDTH, 0.9]} /><meshStandardMaterial map={texLower} roughness={0.8} /></mesh>
            <mesh position={[0, 0.9, 0]}><planeGeometry args={[POOLROOM_WIDTH, 0.05]} /><meshStandardMaterial color="#fff" roughness={0.9} /></mesh>
         </group>

         {/* Details */}
         {/* Speaker Grilles */}
         <mesh position={[-POOLROOM_WIDTH/2 + 0.01, 2.2, -5]} rotation={[0, Math.PI/2, 0]}><planeGeometry args={[0.4, 0.4]} /><meshStandardMaterial color="#a09080" roughness={0.9} /></mesh>
         <mesh position={[-POOLROOM_WIDTH/2 + 0.01, 2.2, -20]} rotation={[0, Math.PI/2, 0]}><planeGeometry args={[0.4, 0.4]} /><meshStandardMaterial color="#a09080" roughness={0.9} /></mesh>
         <mesh position={[POOLROOM_WIDTH/2 - 0.01, 2.2, -10]} rotation={[0, -Math.PI/2, 0]}><planeGeometry args={[0.4, 0.4]} /><meshStandardMaterial color="#a09080" roughness={0.9} /></mesh>
         
         {/* Exit sign */}
         <mesh position={[POOLROOM_WIDTH/2 - 0.02, 2.5, -25]} rotation={[0, -Math.PI/2, 0]}><planeGeometry args={[0.5, 0.25]} /><meshStandardMaterial color="#cc2222" emissive="#cc2222" emissiveIntensity={0.5} toneMapped={false} /></mesh>

         {/* Fluorescent Lights (every 5 meters) */}
         {[ -3, -8, -13, -18, -23, -28 ].map((z, i) => (
            <group key={i}>
               <FluorescentFixture position={[-3, 2.7, z]} />
               <FluorescentFixture position={[3, 2.7, z]} />
            </group>
         ))}

         {/* Chairs Render */}
         <instancedMesh ref={cushionInstRef} args={[null, null, CHAIR_COUNT]} renderOrder={2}>
            <primitive object={cushionsGeo} attach="geometry" />
            <primitive object={cushionMat} attach="material" />
         </instancedMesh>
         <instancedMesh ref={frameInstRef} args={[null, null, CHAIR_COUNT]} renderOrder={2}>
            <primitive object={frameGeo} attach="geometry" />
            <primitive object={frameMat} attach="material" />
         </instancedMesh>
         
         {/* Apply envMap to materials that need it (frameMat) */}
         {envMap && (
            <primitive object={frameMat} envMap={envMap} envMapIntensity={1.0} />
         )}
      </group>
   );
};
