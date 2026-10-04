import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const CHUNK_SIZE = 2; // 2x2 meter chunks
const GRASS_DENSITY = 10000; // 10,000 per sq meter
const MEADOW_WIDTH = 5.0; // width of playable path room
const MEADOW_LENGTH = 12.0;

// Convert sRGB hex to linear float array for shaders
const hexToLinear = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

const GrassChunk = ({ cx, cz, geom, mat }) => {
  const meshRef = useRef();

  useEffect(() => {
    if (!meshRef.current) return;
    
    const minX = Math.max(-MEADOW_WIDTH / 2, cx - CHUNK_SIZE / 2);
    const maxX = Math.min(MEADOW_WIDTH / 2, cx + CHUNK_SIZE / 2);
    const minZ = Math.max(-MEADOW_LENGTH / 2, cz - CHUNK_SIZE / 2);
    const maxZ = Math.min(MEADOW_LENGTH / 2, cz + CHUNK_SIZE / 2);
    
    const area = (maxX - minX) * (maxZ - minZ);
    if (area <= 0) return;

    const count = Math.floor(area * GRASS_DENSITY);
    const dummy = new THREE.Object3D();
    const phases = new Float32Array(count);
    const attributes = new Float32Array(count * 4); // [leanYaw, heightScale, strawJitter, isEdge]
    
    let added = 0;
    const maxAttempts = count * 3;
    
    for (let attempts = 0; attempts < maxAttempts && added < count; attempts++) {
      const x = minX + Math.random() * (maxX - minX);
      const z = minZ + Math.random() * (maxZ - minZ);
      
      const pathX = Math.sin((z) * 0.5) * 1.2;
      const distToPath = Math.abs(x - pathX);
      
      // SDF masking: path is ~1.4m wide (0.7m radius)
      if (distToPath < 0.7) continue; 
      
      // Clear 3cm from walls
      if (Math.abs(x) > (MEADOW_WIDTH / 2) - 0.03) continue;
      
      const isEdge = distToPath < 0.85;
      
      // Length 9 to 14cm (base geometry is 10cm, so scale 0.9 to 1.4)
      let heightScale = 0.9 + Math.random() * 0.5;
      if (Math.random() > 0.5) heightScale = 1.0 + Math.random() * 0.2; // bias towards 11cm
      
      if (isEdge) {
         heightScale *= 1.2; // Taller at edge, leans over path
      }
      
      dummy.position.set(x, 0, z);
      
      // Combing direction: bias towards -Z.
      const leanYaw = Math.PI + (Math.random() - 0.5) * (Math.PI / 4.5); // +/- 20 deg around -Z
      
      dummy.rotation.set(0, 0, 0); // Rotation handled in shader
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      
      meshRef.current.setMatrixAt(added, dummy.matrix);
      phases[added] = Math.random() * Math.PI * 2;
      
      attributes[added * 4 + 0] = leanYaw;
      attributes[added * 4 + 1] = heightScale;
      attributes[added * 4 + 2] = Math.random(); 
      attributes[added * 4 + 3] = isEdge ? 1.0 : 0.0;
      
      added++;
    }
    
    meshRef.current.count = added;
    if (!geom.boundingSphere) geom.computeBoundingSphere();
    
    geom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geom.setAttribute('aGrassAttr', new THREE.InstancedBufferAttribute(attributes, 4));
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [cx, cz, geom]);

  return <instancedMesh ref={meshRef} args={[geom, mat, Math.floor(CHUNK_SIZE * CHUNK_SIZE * GRASS_DENSITY)]} receiveShadow castShadow />;
};

export const Grass = (props) => {
  const [geom, mat] = useMemo(() => {
    // 4 segments, base height 10cm
    const baseHeight = 0.10; 
    const geometry = new THREE.PlaneGeometry(1.0, baseHeight, 1, 4);
    geometry.translate(0, baseHeight / 2, 0); 
    
    const pos = geometry.attributes.position;
    const norm = geometry.attributes.normal;
    for (let i = 0; i < norm.count; i++) {
       const heightPct = pos.getY(i) / baseHeight;
       norm.setXYZ(i, 0, 0.5 * heightPct + norm.getY(i) * (1 - heightPct), norm.getZ(i));
    }
    geometry.normalizeNormals();

    const material = new THREE.MeshStandardMaterial({ 
      roughness: 1.0, 
      metalness: 0.0,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      envMapIntensity: 0.1
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      
      shader.vertexShader = `
         uniform float uTime;
         attribute float aPhase;
         attribute vec4 aGrassAttr; // x: leanYaw, y: heightScale, z: strawJitter, w: isEdge
      ` + shader.vertexShader;
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
         vec3 transformed = vec3(position);
         float h = position.y / 0.10; 
         
         float leanYaw = aGrassAttr.x;
         float heightScale = aGrassAttr.y;
         float isEdge = aGrassAttr.w;
         
         // Base width 2.5 to 3.5 mm tapering to point
         float baseWidth = 0.0025 + aGrassAttr.z * 0.001;
         transformed.x *= baseWidth * (1.0 - h);
         
         transformed.y *= heightScale;
         
         // Droop: 10-30 deg
         float bendAngle = (10.0 + aGrassAttr.z * 20.0 + isEdge * 15.0) * (3.14159 / 180.0);
         float bendAmount = h * h * bendAngle;
         
         float currentY = transformed.y;
         float currentZ = transformed.z;
         transformed.y = currentY * cos(bendAmount) - currentZ * sin(bendAmount);
         transformed.z = currentY * sin(bendAmount) + currentZ * cos(bendAmount);
         
         // Rotate to leanYaw
         float cy = cos(leanYaw);
         float sy = sin(leanYaw);
         float nx = transformed.x * cy - transformed.z * sy;
         float nz = transformed.x * sy + transformed.z * cy;
         transformed.x = nx;
         transformed.z = nz;
         
         vec3 worldPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
         
         // Wind
         float t = uTime * 1.5;
         float wave = sin(worldPos.z * 1.5 - t * 1.2 + aPhase);
         float noise = sin(worldPos.x * 0.5 + t) * cos(worldPos.z * 0.5 + t);
         float windStrength = (wave * 0.6 + noise * 0.4);
         
         float windBend = h * h;
         // 3-4cm tip displacement in comb direction (-Z)
         transformed.z += windStrength * windBend * 0.035;
         transformed.x += windStrength * windBend * 0.01;
        `
      );
      
      const rootL = hexToLinear(0x2a3e22);
      const bodyL = hexToLinear(0x30472a);
      const tipL = hexToLinear(0x454f36);
      const strawL = hexToLinear(0x535842);
      
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying float vHeight;\nvarying vec3 vWorldPos;\nvarying float vWindPhase;\nvarying vec4 vGrassAttr;\n`)
                                               .replace('void main() {', `void main() {\nvHeight = position.y / 0.10;\nvWorldPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;\nvWindPhase = sin(vWorldPos.z * 1.5 - uTime * 1.5 * 1.2 + aPhase);\nvGrassAttr = aGrassAttr;\n`);
      
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vHeight;\nvarying vec3 vWorldPos;\nvarying float vWindPhase;\nvarying vec4 vGrassAttr;\n`)
                                                   .replace('#include <color_fragment>', `#include <color_fragment>
         vec3 rootColor = vec3(${rootL[0]}, ${rootL[1]}, ${rootL[2]});
         vec3 bodyColor = vec3(${bodyL[0]}, ${bodyL[1]}, ${bodyL[2]});
         vec3 tipColor = vec3(${tipL[0]}, ${tipL[1]}, ${tipL[2]});
         vec3 strawColor = vec3(${strawL[0]}, ${strawL[1]}, ${strawL[2]});
         
         vec3 gradColor = mix(rootColor, bodyColor, smoothstep(0.0, 0.3, vHeight));
         gradColor = mix(gradColor, tipColor, smoothstep(0.3, 1.0, vHeight));
         
         if (vGrassAttr.z > 0.95) {
            gradColor = mix(gradColor, strawColor, smoothstep(0.5, 1.0, vHeight));
         }
         
         float clump = sin(vWorldPos.x * 2.0) * cos(vWorldPos.z * 2.0);
         gradColor += clump * 0.015;
         
         // Edge contact shadow
         if (vGrassAttr.w > 0.5 && vHeight < 0.5) {
            gradColor *= 0.7; 
         }
         
         // Wind brightness sheen (softened)
         gradColor += vWindPhase * 0.02 * vHeight;
         
         diffuseColor.rgb = gradColor;
      `);
      material.userData.shader = shader;
    };
    
    return [geometry, material];
  }, []);

  useFrame((state) => {
    if(mat.userData.shader) mat.userData.shader.uniforms.uTime.value = state.clock.elapsedTime;
  });

  const underlayTex = useMemo(() => {
     const cvs = document.createElement('canvas');
     cvs.width = 512; cvs.height = 512;
     const ctx = cvs.getContext('2d');
     ctx.fillStyle = '#1f3a1f';
     ctx.fillRect(0,0,512,512);
     for(let i=0; i<8000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#1a301a' : '#244524';
        ctx.fillRect(Math.random()*512, Math.random()*512, 3, 3);
     }
     const t = new THREE.CanvasTexture(cvs);
     t.wrapS = t.wrapT = THREE.RepeatWrapping;
     t.repeat.set(4, 4);
     return t;
  }, []);

  const chunks = [];
  const cols = Math.ceil(MEADOW_WIDTH / CHUNK_SIZE);
  const rows = Math.ceil(MEADOW_LENGTH / CHUNK_SIZE);
  
  for(let c=0; c<cols; c++) {
    for(let r=0; r<rows; r++) {
       const cx = -MEADOW_WIDTH/2 + (c + 0.5) * CHUNK_SIZE;
       const cz = -MEADOW_LENGTH/2 + (r + 0.5) * CHUNK_SIZE;
       chunks.push(<GrassChunk key={`${c}-${r}`} cx={cx} cz={cz} geom={geom} mat={mat} />);
    }
  }

  return (
    <group {...props}>
      {chunks}
      <mesh position={[0, -0.005, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
        <planeGeometry args={[MEADOW_WIDTH, MEADOW_LENGTH]} />
        <meshStandardMaterial map={underlayTex} roughness={1.0} envMapIntensity={0.1} />
      </mesh>
    </group>
  );
};
